/**
 * test/task-progress-fields.test.js
 *
 * Phase C: the Tasks progress list gains three fields on top of what the data
 * already carries — an index column, a completion bar, and emphasis on the row
 * that is running now (plus scrolling that row into view once).
 *
 * Data reality this is built against (status-stack.css + status-row.tsx):
 *   native row grid = action(0.75rem) · icon(0.8rem) · content(1fr) · actions(auto)
 *   per row the model only has { content, id, status }; nesting is free via
 *   --status-row-depth. Duration / tokens / owner do not exist and are NOT faked.
 *
 * Standing constraint: the skin may not add or remove DOM content. So the index is
 * a CSS counter rendered by the row's own ::before (a pseudo-element never enters
 * the DOM), and the bar is a ::after on the section trigger whose only JS input is
 * the ratio updateTaskHeaderCounter already computes.
 *   node test/task-progress-fields.test.js
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')
const { skinSourcePath } = require('./skin-source')

const HOME = os.homedir()
const HERMES_HOME = process.env.HERMES_HOME || path.join(HOME, '.hermes')
const DESKTOP = path.join(HERMES_HOME, 'hermes-agent', 'apps', 'desktop')
const REPO = path.join(__dirname, '..')

const skip = reason => {
  console.log(`\n=== Task Progress Fields Suite: SKIPPED — ${reason} ===\n`)
  process.exit(0)
}

/* Sheet resolution lives in scripts/lib/sheets.js — one copy of these paths, so a
   test cannot drift from what the renderer actually loads. */
const { builtCssPath: findBuiltCss, blockScalar, pluginCss: pluginCssFrom, launchChromium } = require('../scripts/lib/sheets')

const builtCssPath = findBuiltCss()
if (!builtCssPath) skip(`no built renderer CSS under ${DESKTOP}/dist`)

const pluginSource = fs.readFileSync(path.join(REPO, 'src', 'plugin.js'), 'utf8')
const pluginCss = pluginCssFrom(pluginSource)
assert(pluginCss && pluginCss.includes('prefers-reduced-motion'), 'PLUGIN_CSS missing or truncated')
const skinCss = blockScalar(fs.readFileSync(skinSourcePath(), 'utf8'), 'customCSS')

const row = (n, state, label) => `
  <div class="status-row" data-slot="status-row" data-bubbles-task-row="true" data-task-state="${state}" data-probe="row${n}">
    <span class="status-row-dismiss" data-slot="status-row-dismiss">×</span>
    <span class="status-row-icon" data-probe="icon${n}">${state === 'completed' ? '✓' : state === 'running' ? '▶' : '○'}</span>
    <div class="status-row-content" data-probe="content${n}"><div><p>${label}</p></div></div>
    <div class="status-row-actions"><button type="button" aria-label="edit">✎</button></div>
  </div>`

const STACK = `
<div data-slot="composer-status-stack" style="width:320px">
  <div data-slot="status-section" data-bubbles-task-section="true" data-probe="section">
    <div class="status-section-header">
      <button type="button" class="status-section-trigger" data-probe="trigger"><span>Tasks</span></button>
    </div>
    <div class="status-section-body" data-probe="body">${row(1, 'completed', '读取项目结构')}${row(2, 'completed', '定位背景层')}${row(3, 'running', '重构 composer 玻璃')}${row(4, 'pending', '补回归测试')}
      ${Array.from({ length: 14 }, (_, i) => row(5 + i, 'pending', `占位任务 ${i + 1}`)).join('')}
    </div>
  </div>
</div>`

const pluginCssWithoutPhaseC = pluginCss.replace(
  /\/\* Phase C fields[\s\S]*?(?=\/\* Task Section Body)/, '')
assert(pluginCssWithoutPhaseC.length < pluginCss.length - 500,
  'could not cut the Phase C block back out — the height comparison would be meaningless')

const page = (withPlugin, css = pluginCss) => `<!doctype html><html data-bubbles-skin='true' data-hermes-mode='dark'><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileURL(builtCssPath).href}">
${withPlugin ? `<style id="hermes-desktop-custom-css">${skinCss}</style>
<style id="hermes-bubbles-skin-runtime-styles">${css}</style>` : ''}
</head><body style="background:#08192f;margin:0">${STACK}</body></html>`

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bubbles-tasks-'))
fs.writeFileSync(path.join(dir, 'native-only.html'), page(false))
fs.writeFileSync(path.join(dir, 'with-plugin.html'), page(true))
fs.writeFileSync(path.join(dir, 'plugin-no-phasec.html'), page(true, pluginCssWithoutPhaseC))

const MEASURE = () => {
  const el = p => document.querySelector(`[data-probe="${p}"]`)
  // grid-template-columns serializes as "12px 12.8px minmax(0px, 1fr) auto" — the
  // comma inside minmax carries a space, so blank out spaces inside parens first.
  const tracksOf = e => getComputedStyle(e).gridTemplateColumns
    .replace(/\([^)]*\)/g, m => m.replace(/\s+/g, '_')).split(' ').filter(Boolean)
  const rows = [1, 2, 3, 4].map(n => el(`row${n}`))
  const tracks = tracksOf(rows[0])
  // Chromium does not resolve counters in computed style (it echoes the specified
  // counter(bubbles-task, …) form), so the index is proven by "a ::before exists
  // and occupies a real column"; the 01/02 format is asserted on the CSS text.
  const idx = rows.map(r => {
    const c = getComputedStyle(r, '::before')
    return { content: c.content, w: Math.round(parseFloat(c.width) || 0) }
  })
  const heights = rows.map(r => Math.round(r.getBoundingClientRect().height))
  const contentKids = [1, 2, 3, 4].map(n => el(`content${n}`).childNodes.length)
  // The row itself can never carry the accent: bubbles.yaml line 70 flattens
  // .status-row with box-shadow / border: none !important. So it is painted on the
  // row's ::after, which that rule cannot reach.
  const accents = rows.map(r => {
    const c = getComputedStyle(r, '::after')
    return { w: Math.round(parseFloat(c.width) || 0), bg: c.backgroundColor, pos: c.position, anim: c.animationName }
  })
  const rowShadow = rows.map(r => getComputedStyle(r).boxShadow)
  const trigger = el('trigger')
  trigger.style.setProperty('--bubbles-task-progress', '0.500')
  const after = getComputedStyle(trigger, '::after')
  const m = new DOMMatrix(after.transform)
  const rowStyle0 = getComputedStyle(rows[0])
  return {
    idx, tracks: tracks.length, contentTrackPx: Math.round(parseFloat(tracks[3] || '0')),
    heights, contentKids, accents, rowShadow,
    rowStyle: {
      borderTopWidth: rowStyle0.borderTopWidth, marginBottom: rowStyle0.marginBottom,
      borderTopLeftRadius: rowStyle0.borderTopLeftRadius, paddingTop: rowStyle0.paddingTop,
    },
    scrollbarColorRest: getComputedStyle(el('body')).scrollbarColor,
    barScaleX: Math.round(m.a * 1000) / 1000,
    barHeight: parseFloat(after.height),
    bodyScrollable: el('body').scrollHeight > el('body').clientHeight + 4,
    runningVisible: (() => { const b = el('body').getBoundingClientRect(), r = el('row3').getBoundingClientRect()
      return r.top >= b.top - 1 && r.bottom <= b.bottom + 1 })(),
  }
}


const grab = re => { const x = pluginSource.match(re); assert(x, `could not extract ${re} from src/plugin.js`); return x[0] }

/** Every row must paint an index cell that actually occupies width. */
const idxAllRendered = idx => Array.isArray(idx) && idx.length === 4
  && idx.every(p => p && p.content !== 'none' && /bubbles-task|^"\d/.test(p.content) && p.w >= 8)

;(async () => {
  const browser = await launchChromium()
  if (!browser) skip('playwright-core found but no Chromium/Edge/Chrome to launch')
  const read = async name => {
    const pg = await browser.newPage({ viewport: { width: 420, height: 520 }, colorScheme: 'dark' })
    await pg.goto(pathToFileURL(path.join(dir, `${name}.html`)).href)
    const out = await pg.evaluate(`(${MEASURE.toString()})()`)
    await pg.close()
    return out
  }
  const native = await read('native-only')
  const m = await read('with-plugin')
  const noC = await read('plugin-no-phasec')

  // scrollbar-color on :hover needs a real pointer, same reason as the caret ring.
  const hovPg = await browser.newPage({ viewport: { width: 420, height: 520 }, colorScheme: 'dark' })
  await hovPg.goto(pathToFileURL(path.join(dir, 'with-plugin.html')).href)
  await hovPg.hover('[data-probe="body"]')
  m.scrollbarColorHover = await hovPg.evaluate(
    () => getComputedStyle(document.querySelector('[data-probe="body"]')).scrollbarColor)
  await hovPg.close()

  // The two JS helpers, executed against the live fixture.
  const jsPg = await browser.newPage({ viewport: { width: 420, height: 520 }, colorScheme: 'dark' })
  await jsPg.goto(pathToFileURL(path.join(dir, 'with-plugin.html')).href)
  const js = await jsPg.evaluate(`(() => {
    ${grab(/function isElement\(node\) \{[\s\S]*?\n\}/)}
    ${grab(/let lastScrolledTaskRow = null/)}
    ${grab(/function updateTaskHeaderCounter\(taskSection, completedCount, totalCount\) \{[\s\S]*?\n\}/)}
    ${grab(/function scrollToActiveTaskRow\(sectionEl\) \{[\s\S]*?\n\}/)}
    const section = document.querySelector('[data-probe="section"]')
    const body = document.querySelector('[data-probe="body"]')
    const trigger = document.querySelector('[data-probe="trigger"]')
    updateTaskHeaderCounter(section, 2, 4)
    const out = {
      pill: trigger.querySelector('.bubbles-task-counter') ? 'present' : null,
      progressVar: trigger.style.getPropertyValue('--bubbles-task-progress').trim() || null,
    }
    // Collapsing the section removes the rows, so the caller reports 0 of 0. The
    // bar must keep its last ratio rather than animating back to zero.
    updateTaskHeaderCounter(section, 0, 0)
    out.varAfterEmptyUpdate = trigger.style.getPropertyValue('--bubbles-task-progress').trim() || null
    // Move the running row to the bottom so it starts below the fold. The body is
    // capped at clamp(90px, 28vh, 320px) and row 3 is already visible, which would
    // make "did not scroll" the correct answer rather than the thing under test.
    const allRows = [...body.querySelectorAll('.status-row')]
    const last = allRows[allRows.length - 1]
    document.querySelector('[data-probe="row3"]').setAttribute('data-task-state', 'pending')
    last.setAttribute('data-task-state', 'running')
    body.scrollTop = 0
    const beforeScroll = body.scrollTop
    const moved = scrollToActiveTaskRow(section)
    const inView = () => { const b = body.getBoundingClientRect(), r = last.getBoundingClientRect()
      return r.top >= b.top - 1 && r.bottom <= b.bottom + 1 }
    out.scrolledOnce = { beforeScroll, afterScroll: body.scrollTop, returned: moved }
    out.runningVisible = inView()
    body.scrollTop = 0
    out.secondCallSameRow = { afterReset: body.scrollTop, afterCall: (scrollToActiveTaskRow(section), body.scrollTop) }
    return out
  })()`)
  await browser.close()

  console.log('\n=== Task Progress Fields Suite ===')
  console.log(`sheets: built=${path.basename(builtCssPath)} plugin=${pluginCss.length}b`)
  console.log(`index    : ${JSON.stringify(m.idx)}   tracks=${m.tracks} contentTrack=${m.contentTrackPx}px`)
  console.log(`rowH     : plugin=${JSON.stringify(m.heights)} native=${JSON.stringify(native.heights)}`)
  console.log(`bar      : scaleX=${m.barScaleX} height=${m.barHeight}px`)
  console.log(`running  : accent=${JSON.stringify(m.accents[2])} rowShadow=${m.rowShadow[2]}`)
  console.log(`js       : ${JSON.stringify(js)}`)

  // 1. Index column, rendered without touching the DOM.
  assert(idxAllRendered(m.idx), `rows must render an index in their own ::before, got ${JSON.stringify(m.idx)}`)
  assert(/counter-increment: bubbles-task/.test(pluginCss) && /decimal-leading-zero/.test(pluginCss),
    'the index must come from a CSS counter with decimal-leading-zero (01, 02, …)')
  assert.deepStrictEqual(m.contentKids, native.contentKids,
    'the index must be a pseudo-element — no child nodes may appear inside status-row-content')
  assert.strictEqual(m.tracks, native.tracks + 1,
    `the row grid must gain exactly one column for the index: plugin=${m.tracks} native=${native.tracks}`)
  assert(m.contentTrackPx > 100,
    `the content column must stay the wide 1fr track, got ${m.contentTrackPx}px (4th of ${m.tracks})`)

  // 2b. Density contract (reference plugin.js:1951-1958): min-height 24px,
  //     padding 1px 8px, radius 8px, no per-row margin, no border. The old
  //     4px/8px padding + 1px transparent border made every row 30px, so a 10-step
  //     plan cost 60px of extra height for nothing.
  assert(m.heights.every(h => h <= 26),
    `rows should sit at the 24px density target, got ${JSON.stringify(m.heights)}`)
  assert(new Set(m.heights).size === 1, `rows must stay uniform, got ${JSON.stringify(m.heights)}`)
  const rowCs = m.rowStyle
  assert(rowCs.borderTopWidth === '0px', `the row border must go (it adds 2px and is invisible anyway): ${rowCs.borderTopWidth}`)
  assert(parseFloat(rowCs.marginBottom) === 0, `no per-row margin: ${rowCs.marginBottom}`)
  assert(parseFloat(rowCs.borderTopLeftRadius) >= 8, `rows should round at 8px like the reference, got ${rowCs.borderTopLeftRadius}`)

  // 2c. The scrollbar is invisible at rest and appears on hover
  //     (reference plugin.js:1911-1917) — a always-on blue rail fights the
  //     ambient light field for attention.
  // Chromium serializes `transparent` as rgba(0, 0, 0, 0), so "invisible at rest"
  // means no colour in the value carries a non-zero alpha.
  const visibleColor = s => /rgba\([^)]+,\s*(?:1(?:\.0+)?|0?\.\d*[1-9])\s*\)/.test(s)
  assert(!visibleColor(m.scrollbarColorRest),
    `the body scrollbar must be invisible at rest, got ${m.scrollbarColorRest}`)
  assert(visibleColor(m.scrollbarColorHover),
    `hovering the list must reveal the scrollbar, got ${m.scrollbarColorHover}`)

  // 2d. Fields must not change row height. Measured against PLUGIN_CSS with
  //     the Phase C block cut out — the skin's pre-existing 1px transparent row
  //     border already adds 2px over native, and that is not this change's business.
  assert.deepStrictEqual(m.heights, noC.heights,
    `Phase C changed row height: with=${JSON.stringify(m.heights)} without=${JSON.stringify(noC.heights)}`)
  assert.deepStrictEqual(m.tracks, noC.tracks + 1,
    `exactly one column should be added for the index: with=${m.tracks} without=${noC.tracks}`)

  // 3. Progress bar driven purely by the ratio variable.
  assert(pluginCss.includes('--bubbles-task-progress'), 'PLUGIN_CSS must read --bubbles-task-progress')
  assert(/scaleX\(var\(--bubbles-task-progress[,)]/.test(pluginCss),
    'the bar must fill with scaleX(var(--bubbles-task-progress, …)) — animating width would reflow every tick')
  assert(Math.abs(m.barScaleX - 0.5) < 0.01, `with the ratio set to 0.500 the bar should be half filled, got scaleX=${m.barScaleX}`)
  assert(m.barHeight > 0 && m.barHeight <= 4, `the bar should be a thin track, got ${m.barHeight}px`)

  // 4. Only the running row carries the accent bar, and it is a 3px pseudo-element
  //    (the row itself cannot hold one — the skin flattens .status-row).
  assert(m.accents[2].w === 3 && /96, 165, 250/.test(m.accents[2].bg),
    `running row needs a 3px #60a5fa bar on ::after, got ${JSON.stringify(m.accents[2])}`)
  assert(m.accents[2].pos === 'absolute', `the bar must be absolutely positioned so it eats no inner width: ${JSON.stringify(m.accents[2])}`)
  for (const i of [0, 1, 3]) {
    assert(m.accents[i].w === 0, `row ${i + 1} must not carry the running accent: ${JSON.stringify(m.accents[i])}`)
  }

  // 5. JS: the counter publishes the ratio, adds one node at most, and scrolling
  //    moves once per running row rather than fighting the user.
  assert.strictEqual(js.pill, null,
    'the plugin must not paint its own counter pill — Hermes already prints 任务 n/m and a second one lies when the section collapses')
  assert(js.progressVar === '0.500' || js.progressVar === '0.5',
    `updateTaskHeaderCounter must publish the ratio as --bubbles-task-progress, got ${JSON.stringify(js.progressVar)}`)
  assert(js.varAfterEmptyUpdate === js.progressVar,
    `a 0-of-0 update (collapsed section) must leave the last ratio alone, got ${js.varAfterEmptyUpdate}`)
  assert.strictEqual(js.scrolledOnce.returned, true,
    'an off-screen running row should report that it scrolled')
  assert(js.scrolledOnce.afterScroll > js.scrolledOnce.beforeScroll,
    `the running row should be scrolled into view, scrollTop stayed at ${js.scrolledOnce.afterScroll}`)
  assert.strictEqual(js.runningVisible, true, 'after scrolling, the running row should be inside the scroll viewport')
  assert.strictEqual(js.secondCallSameRow.afterCall, js.secondCallSameRow.afterReset,
    'a second call for the SAME running row must not re-scroll — it would fight the user scrolling by hand')

  console.log('\n=== Task Progress Fields Suite: PASS ===\n')
})().catch(err => {
  console.error('\n' + (err.message || err))
  process.exit(1)
})
