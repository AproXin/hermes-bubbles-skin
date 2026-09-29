/**
 * test/sidebar-row-geometry.test.js
 *
 * Bug class: the sessions list highlight boxes do not line up, and the selected
 * row's title sits sideways of every other title.
 *
 * Both came from row chrome painted on only ONE state, and neither is visible by
 * reading CSS text:
 *
 *   1. `border-left: 3px` on the active row only. With border-box sizing a left
 *      border consumes inner width, so the selected title moves 3px right while
 *      its siblings stay — the ladder reads as misaligned boxes. An inset shadow
 *      paints the same 3px bar without reflowing anything.
 *   2. `padding: 0` on the row shell. row-geometry.ts puts the trailing inset
 *      (pr-2) on the SHELL on purpose — it is the only box containing both the
 *      actions column and the card's in-body cluster, and the comment warns that
 *      owning it anywhere else parks the age/kebab flush on the border box, right
 *      where a working row paints its arc.
 *
 * Assembles the three sheets the live renderer stacks (built CSS, active skin
 * customCSS, PLUGIN_CSS), mirrors the real SidebarRowShell DOM with its Tailwind
 * classes intact, and asserts on measured geometry.
 *
 * Skips (exit 0) without a Hermes checkout, a browser, or playwright-core.
 *   node test/sidebar-row-geometry.test.js
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')

const HOME = os.homedir()
const HERMES_HOME = process.env.HERMES_HOME || path.join(HOME, '.hermes')
const DESKTOP = path.join(HERMES_HOME, 'hermes-agent', 'apps', 'desktop')
const REPO = path.join(__dirname, '..')

const skip = reason => {
  console.log(`\n=== Sidebar Row Geometry Suite: SKIPPED — ${reason} ===\n`)
  process.exit(0)
}

/* Sheet resolution lives in scripts/lib/sheets.js — one copy of these paths, so a
   test cannot drift from what the renderer actually loads. */
const { builtCssPath: findBuiltCss, blockScalar, pluginCss: pluginCssFrom } =
  require('../scripts/lib/sheets')

const builtCssPath = findBuiltCss()
if (!builtCssPath) skip(`no built renderer CSS under ${DESKTOP}/dist or the packaged app`)

const pluginCss = pluginCssFrom(fs.readFileSync(path.join(REPO, 'src', 'plugin.js'), 'utf8'))
assert(pluginCss, 'PLUGIN_CSS could not be extracted from src/plugin.js')

const configFile = path.join(HERMES_HOME, 'config.yaml')
const skinName = fs.existsSync(configFile)
  ? ((fs.readFileSync(configFile, 'utf8').match(/^\s*skin:\s*['"]?([\w-]+)/m) || [])[1] ?? 'bubbles')
  : 'bubbles'
const liveSkin = path.join(HERMES_HOME, 'skins', `${skinName}.yaml`)
const skinSource = fs.existsSync(liveSkin) ? liveSkin : path.join(REPO, 'bubbles.yaml')
const skinCss = blockScalar(fs.readFileSync(skinSource, 'utf8'), 'customCSS')
assert(skinCss && skinCss.includes('--ui-row-hover-background'), `no usable customCSS in ${skinSource}`)

// ---------------------------------------------------------------------------
// The real row DOM: SidebarRowShell (chrome.tsx:177) inside SidebarRowStack
// (chrome.tsx:107), geometry literals from row-geometry.ts. Row 2 is selected
// the way session-row.tsx:380 does it — a bg class, plus the attributes the
// plugin stamps at runtime (enhanceSidebarSessionRow, plugin.js:2456).
// ---------------------------------------------------------------------------

const shell = (extra, inner, attrs = '') => `
  <div class="min-h-[1.625rem] pr-2 grid grid-cols-[minmax(0,1fr)_auto] items-stretch rounded-md group row-hover relative min-h-[2.75rem] ${extra}"
       data-bubbles-session-row="true" ${attrs}>
    <button class="pl-2 pr-2 gap-1.5 flex h-full min-w-0 items-center self-stretch py-0.5 bg-transparent text-left z-0" type="button">
      <span class="grid size-3.5 shrink-0 place-items-center overflow-hidden"><span class="size-2 rounded-full bg-emerald-400"></span></span>
      <span class="min-w-0 flex-1 self-center">
        <span class="min-w-0 truncate text-[0.8125rem] leading-[1.35] hover-marquee block text-(--ui-text-secondary)">${inner}</span>
      </span>
    </button>
    <div class="flex shrink-0 items-center self-stretch" data-row-actions><time class="text-[0.625rem]">12m</time></div>
  </div>`

// Group header rows are SidebarGroupRow: same shell, no .row-hover, and the
// project figures live in the actions column.
const ROWS = `
<div data-slot="sidebar" class="h-full w-[260px] overflow-hidden">
  <div class="grid grid-cols-[minmax(0,1fr)] gap-px">
    ${shell('group/workspace', 'markitdown', 'data-probe="header"')}
    ${shell('', '普通会话 Check Hermes download', 'data-probe="normal"')}
    ${shell('bg-(--ui-row-active-background)', '选中会话 项目结构解析', 'data-probe="active" data-bubbles-session-active="true" data-selected="true"')}
    ${shell('bg-(--ui-row-active-background)', '悬停会话', 'data-probe="hover" data-probe-hover="true"')}
  </div>
</div>`

const page = withSkin => `<!doctype html><html data-bubbles-skin='true'><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileURL(builtCssPath).href}">
${withSkin ? `<style id="skin">${skinCss}</style><style id="plugin">${pluginCss}</style>` : ''}
</head><body style="background:#08192f;margin:0">${ROWS}</body></html>`

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bubbles-sidebar-'))
fs.writeFileSync(path.join(dir, 'native-only.html'), page(false))
fs.writeFileSync(path.join(dir, 'skinned.html'), page(true))

const MEASURE = () => {
  const probe = name => document.querySelector(`[data-probe="${name}"]`)
  const title = name => probe(name).querySelector('.hover-marquee').getBoundingClientRect()
  const actions = name => probe(name).querySelector('[data-row-actions]').getBoundingClientRect()
  const row = name => {
    const el = probe(name)
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return {
      x: Math.round(r.x * 100) / 100,
      w: Math.round(r.width * 100) / 100,
      h: Math.round(r.height * 100) / 100,
      paddingRight: cs.paddingRight,
      paddingLeft: cs.paddingLeft,
      borderLeftWidth: cs.borderLeftWidth,
      marginLeft: cs.marginLeft,
      bg: cs.backgroundColor,
      shadow: cs.boxShadow,
    }
  }
  // Force the hover state on a detached clone-free element: :hover cannot be
  // scripted, so the hover row is measured through the same rules by matching
  // the plugin's hover selector against it.
  probe('hover').setAttribute('data-probe-hover-match', 'true')
  return {
    header: row('header'),
    normal: row('normal'),
    active: row('active'),
    titleLeft: { normal: Math.round(title('normal').left * 100) / 100, active: Math.round(title('active').left * 100) / 100 },
    actionsRight: {
      normal: Math.round(actions('normal').right * 100) / 100,
      active: Math.round(actions('active').right * 100) / 100,
    },
    rowW: { normal: row('normal').w, active: row('active').w },
  }
}

async function launch() {
  let chromium = null
  for (const id of ['playwright-core', path.join(HERMES_HOME, 'hermes-agent', 'node_modules', 'playwright-core')]) {
    try { chromium = require(id).chromium; break } catch { /* next */ }
  }
  if (!chromium) return null
  for (const opts of [{ channel: 'msedge' }, { channel: 'chrome' }, {}]) {
    try { return await chromium.launch({ headless: true, ...opts }) } catch { /* next */ }
  }
  return null
}

;(async () => {
  const browser = await launch()
  if (!browser) skip('playwright-core found but no Chromium/Edge/Chrome to launch')

  const ctx = await browser.newContext({ viewport: { width: 320, height: 400 }, colorScheme: 'dark' })
  const read = async name => {
    const pg = await ctx.newPage()
    await pg.goto(pathToFileURL(path.join(dir, `${name}.html`)).href)
    const out = await pg.evaluate(`(${MEASURE.toString()})()`)
    await pg.close()
    return out
  }
  const native = await read('native-only')
  const skin = await read('skinned')
  await browser.close()

  console.log('\n=== Sidebar Row Geometry Suite ===')
  console.log(`sheets: built=${path.basename(builtCssPath)} skin=${path.relative(HOME, skinSource)} plugin=${pluginCss.length}b\n`)
  for (const [k, v] of Object.entries(skin)) {
    if (k === 'titleLeft' || k === 'actionsRight' || k === 'rowW') continue
    console.log(`${k.padEnd(7)} x=${v.x} w=${v.w} h=${v.h} padR=${v.paddingRight} padL=${v.paddingLeft} borderL=${v.borderLeftWidth} marginL=${v.marginLeft}`)
  }
  console.log(`\ntitle left   normal=${skin.titleLeft.normal} active=${skin.titleLeft.active} (native: ${native.titleLeft.normal}/${native.titleLeft.active})`)
  console.log(`actions right normal=${skin.actionsRight.normal} active=${skin.actionsRight.active}`)

  // 1. The accent bar must not move the title. This is 「会话里各标题的框体定位不准确」.
  assert.strictEqual(
    skin.titleLeft.active,
    skin.titleLeft.normal,
    `the selected row's title sits ${skin.titleLeft.active - skin.titleLeft.normal}px sideways of a normal row — `
    + 'an active-only border-left reflows the row. Paint the accent with an inset box-shadow instead.'
  )

  // 2. The shell keeps its own trailing inset (row-geometry.ts SIDEBAR_ROW_PAD_TRAIL).
  assert.notStrictEqual(
    skin.normal.paddingRight,
    '0px',
    'the row shell lost pr-2: the actions column and a working row\'s arc now sit flush on the border box'
  )

  // 3. Fixing 1 must not delete the feature: the active row still carries the accent.
  // Chromium serialises a shadow as `rgb(…) 3px 0px 0px 0px inset`, so match the
  // parts rather than the source text.
  assert(
    /inset/.test(skin.active.shadow) && /3px 0px/.test(skin.active.shadow),
    `the active row lost its inset accent bar (shadow: ${skin.active.shadow})`
  )
  assert.strictEqual(skin.active.borderLeftWidth, skin.normal.borderLeftWidth,
    'active and normal rows carry different left borders — that is the reflow being fixed')

  // 4. Box widths agree, so the ladder of highlight rectangles lines up.
  assert.strictEqual(skin.active.w, skin.normal.w, 'selected and normal rows are different widths')
  assert.strictEqual(skin.header.w, skin.normal.w, 'the group header row is a different width than its sessions')

  console.log('\n=== Sidebar Row Geometry Suite: PASS ===\n')
})().catch(e => {
  console.log(`\nFAIL: ${e.message.split('\n').slice(0, 6).join('\n')}`)
  console.log(`fixtures kept at ${dir}`)
  process.exit(1)
})
