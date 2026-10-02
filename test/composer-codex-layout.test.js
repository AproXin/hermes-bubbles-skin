/**
 * test/composer-codex-layout.test.js
 *
 * Phase B: make the composer read as two rows — input across the top, and a
 * control row with ＋ / model pill / reasoning pill on the LEFT and voice + send
 * pinned RIGHT.
 *
 * Hermes already ships that geometry (`index.tsx:1530`
 * [grid-template-areas:"input_input"_"menu_controls"]) but it only engages when
 * useComposerMetrics decides the dock is narrow, so at normal width the row is
 * "menu_input_controls" and every control is squeezed onto one line.
 *
 * Everything here is anchored to hooks that survive i18n:
 *   [class*='grid-area:menu'/'grid-area:input'/'grid-area:controls']  (Tailwind
 *       writes the utility INTO the class attribute, so it is matchable)
 *   [data-tour='model-pill']  [data-testid='reasoning-pill']  (renderer-owned)
 *   [data-slot='fan-menu-anchor']  (the first element of the right cluster)
 *   [data-slot='dropdown-menu-content'][data-state='open'][class~='w-64'/'w-52']
 *       (the two pill menus, while open — see test/composer-menu-align.test.js)
 * Deliberately NOT used: aria-label text — the reference skin selects on
 * 'Voice dictation'/'Send', which breaks the moment the UI is Chinese.
 *
 * DOM and class strings were captured from the live renderer (612x40 surface,
 * single row) rather than invented.
 *   node test/composer-codex-layout.test.js
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
  console.log(`\n=== Composer Codex Layout Suite: SKIPPED — ${reason} ===\n`)
  process.exit(0)
}

/* Sheet resolution lives in scripts/lib/sheets.js — one copy of these paths, so a
   test cannot drift from what the renderer actually loads. */
const { builtCssPath: findBuiltCss, blockScalar, pluginCss: pluginCssFrom, launchChromium } = require('../scripts/lib/sheets')

const builtCssPath = findBuiltCss()
if (!builtCssPath) skip(`no built renderer CSS under ${DESKTOP}/dist`)

const pluginSource = fs.readFileSync(path.join(REPO, 'src', 'plugin.js'), 'utf8')
const pluginCss = pluginCssFrom(pluginSource)
assert(pluginCss, 'PLUGIN_CSS could not be extracted from src/plugin.js')
const skinCss = blockScalar(fs.readFileSync(skinSourcePath(), 'utf8'), 'customCSS')

// ---------------------------------------------------------------------------
// Live capture, verbatim: the row grid is a single "menu input controls" line,
// controls holds one flex with [model pill, reasoning pill, fan anchor, send].
// ---------------------------------------------------------------------------
const COMPOSER = `
<div data-slot="composer-dock">
 <div class="group/composer relative" data-slot="composer-root">
  <div class="relative z-4 isolate grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr] overflow-hidden rounded-[inherit] border group/composer-surface" data-slot="composer-surface" data-probe="surface" style="width:612px">
   <div aria-hidden="true" class="pointer-events-none absolute inset-0" data-probe="backing"></div>
   <div class="relative z-1 flex min-w-0 w-full flex-col gap-(--composer-row-gap) overflow-hidden rounded-[inherit] px-(--composer-surface-pad-x) py-(--composer-surface-pad-y)">
    <div class="grid w-full grid-cols-[auto_1fr_auto] items-center gap-(--composer-control-gap) [grid-template-areas:&quot;menu_input_controls&quot;]" data-probe="row">
     <div class="flex translate-y-[3px] items-start gap-(--composer-control-gap) self-start [grid-area:menu]" data-probe="menu">
      <button data-slot="tooltip-trigger" data-size="icon" data-variant="ghost" aria-label="Add context" type="button"
              class="inline-flex cursor-pointer items-center justify-center gap-1.5 text-xs leading-4 font-medium whitespace-nowrap shadow-none size-6 min-w-0 shrink-0 p-0"><i class="codicon codicon-add"></i></button>
     </div>
     <div class="min-w-0 [grid-area:input]" data-probe="input-area">
      <div class="min-w-(--composer-input-inline-min-width) flex-1 relative" data-probe="input-wrap">
       <div contenteditable="true" data-probe="rich-input" class="min-h-6 w-full text-xs">写点什么…</div>
      </div>
     </div>
     <div class="flex min-w-0 items-center justify-end gap-(--composer-control-gap) [grid-area:controls]" data-probe="controls-area">
      <div class="flex min-w-0 shrink items-center gap-(--composer-control-gap)" data-probe="controls">
       <button data-tour="model-pill" data-slot="tooltip-trigger" data-variant="ghost" data-state="closed" aria-label="模型 · Qwen3.8-Flash" type="button"
               class="inline-flex h-6 cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-2 text-xs shadow-none" data-probe="model-pill">Qwen3.8 Flash</button>
       <button data-testid="reasoning-pill" data-slot="tooltip-trigger" data-variant="ghost" data-state="closed" aria-label="推理强度: Low" type="button"
               class="inline-flex h-6 cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-2 text-xs shadow-none" data-probe="reasoning-pill">Low</button>
       <span data-slot="fan-menu-anchor" class="relative inline-flex shrink-0 size-6" data-probe="voice"><button type="button" aria-label="语音听写" class="grid place-items-center size-6"><svg></svg></button></span>
       <span class="flex items-center" data-probe="send"><button type="button" aria-label="发送" class="inline-flex size-6 items-center justify-center rounded-full"><svg></svg></button></span>
      </div>
     </div>
    </div>
   </div>
  </div>
 </div>
</div>
<div data-radix-popper-content-wrapper style="position:fixed;left:300px;top:500px">
 <div data-slot="dropdown-menu-content" role="menu" data-state="open" class="w-64 p-0 rounded-lg border text-xs shadow-md" data-probe="model-menu">
  <div data-slot="dropdown-menu-item" role="menuitem" class="relative flex items-center gap-2 rounded-md px-2 py-1 text-xs">Qwen3.8-Flash</div>
  <div data-slot="dropdown-menu-item" role="menuitem" class="relative flex items-center gap-2 rounded-md px-2 py-1 text-xs">DeepSeek-V4</div>
 </div>
</div>`

const page = `<!doctype html><html data-bubbles-skin='true' data-hermes-mode='dark'><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileURL(builtCssPath).href}">
<style id="hermes-desktop-custom-css">${skinCss}</style>
<style id="hermes-bubbles-skin-runtime-styles">${pluginCss}</style>
</head><body style="background:#08192f;margin:0">${COMPOSER}</body></html>`

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bubbles-composer-'))
fs.writeFileSync(path.join(dir, 'page.html'), page)

const MEASURE = () => {
  const el = p => document.querySelector(`[data-probe="${p}"]`)
  const r = p => { const b = el(p).getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } }
  const cs = p => getComputedStyle(el(p))
  const item = el('model-menu').querySelector('[data-slot="dropdown-menu-item"]')
  return {
    row: { areas: cs('row').gridTemplateAreas, cols: cs('row').gridTemplateColumns, rows: cs('row').gridTemplateRows, height: r('row').h },
    input: { area: r('input-area'), wrap: r('input-wrap'), surface: r('rich-input') },
    pills: { model: r('model-pill'), reasoning: r('reasoning-pill'), modelRadius: cs('model-pill').borderTopLeftRadius, modelH: r('model-pill').h },
    right: { voice: r('voice'), send: r('send'), controls: r('controls') },
    menu: { width: cs('model-menu').width, pad: cs('model-menu').padding, radius: cs('model-menu').borderTopLeftRadius, bg: cs('model-menu').backgroundColor, blur: cs('model-menu').backdropFilter,
      itemH: Math.round(item.getBoundingClientRect().height), itemRadius: getComputedStyle(item).borderTopLeftRadius },
    surface: (() => { const c = cs('surface'); return {
      bgImage: c.backgroundImage, fill: c.backgroundColor, attachment: c.backgroundAttachment,
      border: c.borderTopColor, blur: c.backdropFilter, shadow: c.boxShadow, radius: c.borderTopLeftRadius } })(),
    backing: (() => { const c = cs('backing'); return { bg: c.backgroundColor, bgImage: c.backgroundImage } })(),
  }
}


;(async () => {
  const browser = await launchChromium()
  if (!browser) skip('playwright-core found but no Chromium/Edge/Chrome to launch')
  const pg = await browser.newPage({ viewport: { width: 900, height: 520 }, colorScheme: 'dark' })
  await pg.goto(pathToFileURL(path.join(dir, 'page.html')).href)
  const m = await pg.evaluate(`(${MEASURE.toString()})()`)
  await browser.close()

  console.log('\n=== Composer Codex Layout Suite ===')
  console.log(`sheets: built=${path.basename(builtCssPath)} skin=${path.relative(HOME, skinSourcePath())} plugin=${pluginCss.length}b`)
  console.log(`row areas : ${m.row.areas}`)
  console.log(`row cols  : ${m.row.cols}   rows: ${m.row.rows}   rowH=${m.row.height}`)
  console.log(`input     : area=${JSON.stringify(m.input.area)} wrap=${JSON.stringify(m.input.wrap)}`)
  console.log(`pills     : model=${JSON.stringify(m.pills.model)} reasoning=${JSON.stringify(m.pills.reasoning)} radius=${m.pills.modelRadius}`)
  console.log(`right     : voice=${JSON.stringify(m.right.voice)} send=${JSON.stringify(m.right.send)}`)
  console.log(`menu      : ${JSON.stringify(m.menu)}`)

  // 1. Two rows: input spans the full first row, menu + controls share the second.
  assert(/"input input"/.test(m.row.areas) && /"menu controls"/.test(m.row.areas),
    `the composer row must be forced to two rows, got grid-template-areas: ${m.row.areas}`)
  assert(m.row.rows.split(' ').filter(v => parseFloat(v) > 0).length === 2,
    `expected exactly two non-zero grid rows, got: ${m.row.rows}`)

  // 2. The input keeps the whole width of the surface (controls must not steal it).
  assert(m.input.area.w > 560, `the input row should span the composer (${m.input.area.w}px of ~612)`),
  assert(m.input.wrap.w <= m.input.area.w + 1,
    `the input wrapper overflows its area: wrap=${m.input.wrap.w} area=${m.input.area.w} — clear the native flex-1/min-w hook`)

  // 3. Codex order on row 2: ＋ then model then reasoning on the left…
  assert(m.pills.model.x < m.right.voice.x && m.pills.reasoning.x < m.right.voice.x,
    `the model/reasoning pills must sit LEFT of voice: model.x=${m.pills.model.x} reasoning.x=${m.pills.reasoning.x} voice.x=${m.right.voice.x}`)
  // …and voice + send pinned to the right edge.
  const rightEdge = m.right.controls.x + m.right.controls.w
  assert(Math.abs(m.right.send.x + m.right.send.w - rightEdge) < 2,
    `send must be pinned to the right edge (${m.right.send.x}+${m.right.send.w} vs ${rightEdge})`)
  assert(m.right.voice.x - m.pills.reasoning.x - m.pills.reasoning.w > 40,
    'there must be a visible gap between the left pill group and the right cluster')

  // 4. Pill shape: 28px tall capsules, per the reference proportions.
  assert(m.pills.modelH >= 26 && m.pills.modelH <= 30, `model pill height should be ~28px, got ${m.pills.modelH}`)
  assert(/9999|9999px|\d{2,}px/.test(m.pills.modelRadius) && parseFloat(m.pills.modelRadius) >= 12,
    `pills should be capsules, got border-radius ${m.pills.modelRadius}`)

  // 5. Menu texture: fixed 240px panel, 4px padding, 12px radius, 28px/6px items —
  //    and it must stay frosted glass, not the reference's solid card.
  assert(m.menu.width === '240px', `composer pill menu should be 240px wide, got ${m.menu.width}`)
  assert(m.menu.pad === '4px', `menu padding should be 4px, got ${m.menu.pad}`)
  assert(parseFloat(m.menu.radius) === 12, `menu radius should be 12px, got ${m.menu.radius}`)
  assert(m.menu.itemH >= 26 && m.menu.itemH <= 30, `menu item height should be ~28px, got ${m.menu.itemH}`)
  assert(parseFloat(m.menu.itemRadius) === 6, `menu item radius should be 6px, got ${m.menu.itemRadius}`)
  assert(/blur/.test(m.menu.blur), `menus must keep the skin's frosted backdrop-filter, got ${m.menu.blur}`)
  // Translucent, in whichever serialization Chromium picks: rgba(… / …, a) or
  // color(srgb r g b / a) — the alpha just has to be less than 1.
  const alpha = /\/\s*([\d.]+)\)?$/.exec(m.menu.bg) || /,\s*([\d.]+)\)$/.exec(m.menu.bg)
  assert(alpha && parseFloat(alpha[1]) < 1, `menus must stay translucent, got ${m.menu.bg}`)

  // 6. Guard: the composer must not be keyed to UI copy. The reference skin
  //    selects on 'Voice dictation'/'Send', which dies on a Chinese interface.
  //    (The skin's seven pre-existing aria-label rules are exempt: they are
  //    deliberate bilingual fallbacks — '终端' OR 'Terminals' — for the terminal
  //    rail, which exposes no structural hook at all.)
  assert(!/aria-label\s*=/.test(pluginCss), 'PLUGIN_CSS must not select on aria-label text (i18n breaks it)')
  const composerRegion = pluginCss.slice(pluginCss.indexOf('9. Composer Two-Row Layout'))
  assert(composerRegion.length > 500, 'the Phase B composer block must exist in PLUGIN_CSS')
  // Strip comments first: the block's own prose explains why aria-label is banned.
  const composerRules = composerRegion.replace(/\/\*[\s\S]*?\*\//g, '')
  assert(!/aria-label/.test(composerRules), 'the Phase B composer block must not select on aria-label')

  // 7. Phase B v2: the pill menu must left-align to its trigger without fighting
  //    Radix's inline positioning, and re-aligning must not stack shifts.
  const grab = re => { const x = pluginSource.match(re); assert(x, `could not extract ${re}`); return x[0] }
  const driver = `(() => {
    ${grab(/function isElement\(node\) \{[\s\S]*?\n\}/)}
    ${grab(/const COMPOSER_PILL_MENUS = \[[\s\S]*?\n\]/)}
    ${grab(/function alignComposerPillMenu\(triggerEl\) \{[\s\S]*?\n\}/)}
    const panel = document.querySelector('[data-probe="model-menu"]')
    const trigger = document.querySelector('[data-probe="model-pill"]')
    const wrapper = document.querySelector('[data-radix-popper-content-wrapper]')
    const before = Math.round(panel.getBoundingClientRect().left)
    const ok = alignComposerPillMenu(trigger)
    const after = Math.round(panel.getBoundingClientRect().left)
    const again = alignComposerPillMenu(trigger)
    return {
      ok, again, before, after,
      triggerLeft: Math.round(trigger.getBoundingClientRect().left),
      transform: wrapper.style.transform,
      base: wrapper.dataset.bubblesMenuBaseTransform,
      notPill: alignComposerPillMenu(document.querySelector('[data-probe="voice"]')),
    }
  })()`
  const b2 = await launchChromium()
  const pg2 = await b2.newPage({ viewport: { width: 900, height: 520 }, colorScheme: 'dark' })
  await pg2.goto(pathToFileURL(path.join(dir, 'page.html')).href)
  const v = await pg2.evaluate(driver)
  await b2.close()

  console.log(`align     : ${JSON.stringify(v)}`)
  assert.strictEqual(v.ok, true, `aligning the model menu to its pill should do work (panel was at ${v.before})`)
  assert(Math.abs(v.after - v.triggerLeft) <= 1,
    `the menu should start at the pill's left edge: menu=${v.after} pill=${v.triggerLeft}`)
  assert.strictEqual(v.again, false, 'a second call must be a no-op — otherwise shifts stack on every open')
  assert((v.transform.match(/translateX/g) || []).length === 1, `transform should carry exactly one shift, got ${v.transform}`)
  assert.strictEqual(v.notPill, false, 'a non-pill trigger must not align anything')

  // 8. Blue 拟态 glass that continues the page's light field.
  const spots = (m.surface.bgImage.match(/radial-gradient/g) || []).length
  console.log(`surface   : spots=${spots} attachment=${m.surface.attachment} border=${m.surface.border} blur=${m.surface.blur}`)
  assert(spots >= 3,
    `the composer should carry its own highlight PLUS at least two of the global light spots so the field reads continuous, got ${spots}`)
  assert(/fixed/.test(m.surface.attachment),
    'the light spots must use background-attachment: fixed, otherwise they sit inside the box instead of continuing the page field')
  // The color layer is reported by background-color, not background-image.
  assert(/^rgba\(13, 42, 77, 0\.\d+\)$/.test(m.surface.fill),
    `the fill must be the translucent version of the global #0d2a4d, got ${m.surface.fill}`)
  assert(!/255,\s*255,\s*255,\s*0?\.05/.test(m.surface.fill + m.surface.bgImage),
    'the old white-5% fill is what made the composer read grey-black, not blue glass')
  assert(/147,\s*197,\s*253/.test(m.surface.border),
    `the composer stroke should be sapphire, got ${m.surface.border}`)
  assert(/blur/.test(m.surface.blur), `frosted blur must stay, got ${m.surface.blur}`)
  assert(m.backing.bg === 'rgba(0, 0, 0, 0)' && m.backing.bgImage === 'none',
    `the aria-hidden backing layer must not paint over the glass, got bg=${m.backing.bg} image=${m.backing.bgImage}`)

  // 9. Single ownership: the skin must no longer fight the plugin for the surface.
  assert(!/data-slot='composer-surface'/.test(skinCss),
    "bubbles.yaml still styles [data-slot='composer-surface'] — two !important owners means the winner is whichever <style> was inserted last")

  console.log('\n=== Composer Codex Layout Suite: PASS ===\n')
})().catch(err => {
  console.error('\n' + (err.message || err))
  process.exit(1)
})
