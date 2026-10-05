/**
 * test/task-panel-layers.test.js
 *
 * Phase C-2: the Tasks panel read as "too many nested boxes". A live capture
 * measured three cards stacked inside each other, all painting their own border,
 * radius, fill, shadow and blur:
 *
 *   composer-status-stack  1px rgba(147,197,253,.25)  r16  rgba(10,32,64,.85)  0 -8px 24px  blur16
 *   status-section         1px rgba(147,197,253,.28)  r12  rgba(10,32,64,.85)  0 4px 16px   blur14
 *   .status-section-header —                          —    rgba(14,46,84,.65)  —            —
 *
 * One card is the design, and it is the rounded one. Framing the dock card instead
 * is what produced the "outer square rectangle": its width does not come from
 * --composer-width (measured live: card ~738 vs composer surface 612), so a border
 * there always reads as a hard-edged box around everything. Frame, fill, frost and
 * shadow live on the status-section; the stack wrapper and the dock card are cleared
 * to transparent, frameless, shadowless layout. The section becomes the card, the
 * header stops painting its own slab, and the progress bar takes over the header's
 * separator line instead
 * of lying on top of it. The fill moves to the composer's blue so the two read as
 * one surface instead of a dark box sitting on a bright one.
 *   node test/task-panel-layers.test.js
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')
const { loadSheets, launchChromium } = require('../scripts/lib/sheets')

const skip = reason => {
  console.log(`\n=== Task Panel Layers Suite: SKIPPED — ${reason} ===\n`)
  process.exit(0)
}

const sheets = loadSheets()
if (sheets.error) skip(sheets.error)

const row = (state, label) => `
  <div class="status-row" data-slot="status-row" data-bubbles-task-row="true" data-task-state="${state}">
    <span class="status-row-dismiss">×</span>
    <span class="status-row-icon"><i class="codicon codicon-circle-large-outline"></i></span>
    <div class="status-row-content"><div><p>${label}</p></div></div>
    <div class="status-row-actions"><button type="button">✎</button></div>
  </div>`

// The real tree, per status-stack/index.tsx:321-357. The card is composerDockCard
// ('top') (composer-dock.ts:38) with the call site's extras — the full class list
// matters: an abbreviated fixture cleared a card that was never painting
// bg-(--composer-fill) in the first place, so its PASS meant nothing live. Each
// section is also wrapped in a bare [data-slot='status-stack-section'].
const BODY = `
<div style="width:520px" data-slot="composer-status-stack">
  <div class="shrink-0 border border-border/65 rounded-t-2xl border-b-0 bg-(--composer-fill) transition-[background-color] duration-150 ease-out backdrop-blur-[0.75rem] backdrop-saturate-[1.12] mx-2 flex min-h-0 max-h-[inherit] shrink flex-col overflow-hidden rounded-b-none border-b border-b-transparent">
    <div data-slot="status-stack-scroll" class="min-h-0 overflow-y-auto overscroll-y-contain">
      <div data-slot="status-stack-content" class="transition-opacity duration-200 ease-out opacity-100">
        <div data-slot="status-stack-section">
        <div data-slot="status-section" data-bubbles-task-section="true" id="shot">
          <div class="status-section-header">
            <button type="button" class="status-section-trigger"><span>任务</span></button>
          </div>
          <div class="status-section-body">
            ${row('completed', '已完成的一步')}${row('running', '正在做的这一步')}${row('pending', '还没开始的一步')}
          </div>
        </div>
        </div>
      </div>
    </div>
  </div>
</div>`

const pageHtmlFor = body =>
  `<!doctype html><html data-bubbles-skin='true' data-hermes-mode='dark'><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileURL(sheets.built).href}">
<style id="hermes-desktop-custom-css">${sheets.skinCss}</style>
<style id="hermes-bubbles-skin-runtime-styles">${sheets.pluginCss}</style>
</head><body style="background:#08192f;margin:0;padding:140px">${body}</body></html>`

const LAYERS_FILE = path.join(os.tmpdir(), 'bubbles-layers.html')
fs.writeFileSync(LAYERS_FILE, pageHtmlFor(BODY))

// The failure this file could not previously see: PLUGIN_CSS paints the card ONLY
// on the stamped section, so if enhanceTaskSection never lands the stamp, an
// unconditional dock-card reset leaves the panel as bare text on the chat
// background. The unstamped page is the regression guard for that.
const UNSTAMPED_FILE = path.join(os.tmpdir(), 'bubbles-layers-unstamped.html')
fs.writeFileSync(UNSTAMPED_FILE, pageHtmlFor(BODY.replace(` data-bubbles-task-section="true"`, '')))

const MEASURE = () => {
  const q = s => document.querySelector(s)
  const pick = e => { const c = getComputedStyle(e)
    return { borderW: c.borderTopWidth, borderStyle: c.borderTopStyle, borderColor: c.borderTopColor,
      radius: c.borderTopLeftRadius, bg: c.backgroundColor, bgImage: c.backgroundImage,
      attachment: c.backgroundAttachment, shadow: c.boxShadow, blur: c.backdropFilter,
      margin: c.margin, pad: c.padding } }
  const stack = q('[data-slot="composer-status-stack"]')
  const card = q('[data-slot="composer-status-stack"] > div[class*="rounded-t-2xl"]')
  const section = q('[data-slot="status-section"]')
  const header = q('.status-section-header')
  const trig = q('.status-section-trigger')
  const after = getComputedStyle(trig, '::after')
  return {
    cardFound: !!card,
    stack: pick(stack), card: pick(card), section: pick(section), header: pick(header),
    bar: { bottom: after.bottom, height: after.height, transform: after.transform, bgImage: after.backgroundImage },
    track: getComputedStyle(header).borderBottomWidth + ' ' + getComputedStyle(header).borderBottomColor,
    stackRect: (b => ({ w: Math.round(b.width), h: Math.round(b.height) }))(stack.getBoundingClientRect()),
    cardRect: (b => ({ w: Math.round(b.width), h: Math.round(b.height) }))(card.getBoundingClientRect()),
    sectionRect: (b => ({ w: Math.round(b.width), h: Math.round(b.height) }))(section.getBoundingClientRect()),
    sectionBox: (b => [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)])(section.getBoundingClientRect()),
  }
}

/* Paint, not declarations. The live probe showed the whole ancestor chain (dock
   card, scroll, content, drawer, composer-dock) painting nothing, so a visible
   band outside the frame can only be ink the card throws outward.
   Measured as an A/B on the SAME pixel — card present, then card hidden — because
   comparing beside-the-card against far-from-the-card just measures the page's own
   ambient gradient (that mistake read as a 39/255 "halo" with no halo at all). */
async function inkOutsideCard(pg, [x, y, w, h]) {
  const cx = x + Math.round(w / 2), cy = y + Math.round(h / 2)
  // The card sits 6px inside the stack's clip box, so a shadow that escapes the
  // card only ever shows in that 6px band before the clip cuts it — a hard outer
  // edge on a soft falloff, which is exactly what reads as "a frame outside the
  // frame". Samples have to land inside the band, not past it.
  const pts = { 'L-2': [x - 2, cy], 'L-4': [x - 4, cy], 'R+2': [x + w + 2, cy], 'R+4': [x + w + 4, cy],
    'B+2': [cx, y + h + 2], 'B+4': [cx, y + h + 4], 'inside(control)': [cx, cy] }
  const read = async () => {
    const shot = (await pg.screenshot()).toString('base64')
    return pg.evaluate(async ({ shot, pts }) => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + shot
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0)
      const out = {}
      for (const [k, [px, py]] of Object.entries(pts)) {
        const d = ctx.getImageData(px, py, 1, 1).data
        out[k] = [d[0], d[1], d[2]]
      }
      return out
    }, { shot, pts })
  }
  const withCard = await read()
  // setProperty with 'important': the skin paints this element with
  // `display: flex !important`, so a plain inline style.display loses and the
  // second screenshot comes back byte-identical (every delta reads 0).
  await pg.evaluate(show => {
    const el = document.querySelector('[data-bubbles-task-section]')
    if (el) show ? el.style.removeProperty('display') : el.style.setProperty('display', 'none', 'important')
  }, false)
  const without = await read()
  await pg.evaluate(show => {
    const el = document.querySelector('[data-bubbles-task-section]')
    if (el) show ? el.style.removeProperty('display') : el.style.setProperty('display', 'none', 'important')
  }, true)
  const delta = {}
  for (const k of Object.keys(pts)) {
    delta[k] = Math.max(...withCard[k].map((v, i) => Math.abs(v - without[k][i])))
  }
  return delta
}


;(async () => {
  const browser = await launchChromium()
  if (!browser) skip('playwright-core found but no Chromium/Edge/Chrome to launch')
  const pg = await browser.newPage({ viewport: { width: 820, height: 460 }, colorScheme: 'dark' })
  await pg.goto(pathToFileURL(path.join(os.tmpdir(), 'bubbles-layers.html')).href)
  const m = await pg.evaluate(`(${MEASURE.toString()})()`)
  const ink = await inkOutsideCard(pg, m.sectionBox)

  // Same sheets, no stamp: the app's own dock card has to be visible again.
  const pg2 = await browser.newPage({ viewport: { width: 820, height: 460 }, colorScheme: 'dark' })
  await pg2.goto(pathToFileURL(UNSTAMPED_FILE).href)
  const fallback = await pg2.evaluate(() => {
    const card = document.querySelector('[data-slot="composer-status-stack"] > div[class*="rounded-t-2xl"]')
    const c = getComputedStyle(card)
    return { borderW: c.borderTopWidth, borderStyle: c.borderTopStyle, bg: c.backgroundColor,
      radius: c.borderTopLeftRadius, blur: c.backdropFilter }
  })
  await pg2.close()
  await browser.close()

  console.log('\n=== Task Panel Layers Suite ===')
  console.log(`stack   : ${JSON.stringify({ border: m.stack.borderW + ' ' + m.stack.borderStyle, bg: m.stack.bg, shadow: m.stack.shadow.slice(0, 24) })}`)
  console.log(`card    : ${JSON.stringify({ border: m.card.borderW + ' ' + m.card.borderColor, radius: m.card.radius, bg: m.card.bg, attach: m.card.attachment, blur: m.card.blur })}`)
  console.log(`section : ${JSON.stringify({ border: m.section.borderW + ' ' + m.section.borderStyle, radius: m.section.radius, bg: m.section.bg, shadow: m.section.shadow.slice(0, 30), blur: m.section.blur, margin: m.section.margin })}`)
  console.log(`header  : ${JSON.stringify({ bg: m.header.bg, track: m.track })}`)
  console.log(`bar     : ${JSON.stringify(m.bar)}`)
  console.log(`widths  : stack=${JSON.stringify(m.stackRect)} section=${JSON.stringify(m.sectionRect)}`)
  const control = ink['inside(control)']
  const outside = Object.entries(ink).filter(([k]) => !k.includes('control'))
  console.log(`ink Δ   : ${outside.map(([k, v]) => `${k}=${v}`).join('  ')}   control(inside)=${control}`)

  // 1. The header stops painting a third slab; its separator becomes the bar's track.
  assert(/0, 0, 0, 0/.test(m.header.bg) || /,\s*0?\.[0-3]\d*\)$/.test(m.header.bg),
    `the header fill must go or stay under 30% alpha, got ${m.header.bg}`)

  // 2. The bar replaces the separator line instead of lying on top of it.
  assert(parseFloat(m.bar.bottom) === 0,
    `the progress bar should sit ON the header edge (bottom: 0), got ${m.bar.bottom}`)
  assert(parseFloat(m.track) > 0, `the header needs a track line for the unfilled part, got ${m.track}`)

  // 3. Exactly ONE frame, and it is the rounded one. The dock card is wider than
  //    the composer by design (measured live: card ~738 vs surface 612) because its
  //    width does not come from --composer-width, so framing it draws a square
  //    rectangle around everything. The section is the box the user reads as
  //    "the Tasks panel", so the frame lives there and nowhere else.
  assert(m.cardFound, 'the fixture lost the composerDockCard element it is supposed to clear')
  for (const [name, layer] of [['stack wrapper', m.stack], ['dock card', m.card]]) {
    assert(parseFloat(layer.borderW) === 0 || layer.borderStyle === 'none',
      `the ${name} must not draw a frame: ${layer.borderW} ${layer.borderStyle} ${layer.borderColor}`)
    assert(/0, 0, 0, 0/.test(layer.bg), `the ${name} must stay transparent, got ${layer.bg}`)
    assert(layer.shadow === 'none', `the ${name} must not cast a shadow: ${layer.shadow}`)
  }

  // 3b. The section owns one fully rounded, sapphire, frosted card.
  assert(parseFloat(m.section.borderW) > 0 && m.section.borderStyle === 'solid',
    `the section must carry the single frame, got ${m.section.borderW} ${m.section.borderStyle}`)
  assert(/147, 197, 253/.test(m.section.borderColor),
    `the section stroke should be sapphire, got ${m.section.borderColor}`)
  assert(parseFloat(m.section.radius) >= 12,
    `the section must be rounded on every corner, got radius ${m.section.radius}`)
  assert(/rgba\(13, 42, 77/.test(m.section.bg),
    `the section fill should be the composer's translucent #0d2a4d, got ${m.section.bg}`)
  assert(/fixed/.test(m.section.attachment),
    'the section must share the page light field (background-attachment: fixed) so it fuses with the backdrop')
  assert(/blur/.test(m.section.blur), `the section keeps the frost, got ${m.section.blur}`)
  const outerLayers = m.section.shadow.split(/,(?![^(]*\))/).filter(s => s.trim() && !/inset/.test(s))
  assert(outerLayers.length === 0,
    `every shadow layer must be inset — an outer one throws ink onto the chat beside the card: ${m.section.shadow}`)

  // 4. Ownership: the frame is declared once. Two !important owners make the
  //    winner depend on <style> insertion order — the trap this project keeps hitting.
  const frostsStackArea = src => /data-bubbles-task-section='true'\][^{]*\{[^}]*backdrop-filter/.test(src)
    || /composer-status-stack[^{]*\{[^}]*backdrop-filter/.test(src)
  assert(frostsStackArea(sheets.pluginCss), 'PLUGIN_CSS should own the Tasks card frost')
  assert(!/composer-status-stack[^{]*\{[^}]*backdrop-filter/.test(sheets.skinCss)
    && !/status-section[^{]*\{[^}]*backdrop-filter/.test(sheets.skinCss),
    'customCSS must not also frost the Tasks area — one owner')

  // 5. Nothing may land on the chat background beside the card. 3/255 is about the
  //    faintest step a gradient-over-blue surface still resolves as an edge.
  const worst = Math.max(...outside.map(([, v]) => v))
  assert(control > 3,
    `the control pixel inside the card must change when the card goes, else this harness measures nothing: ${control}`)
  assert(worst <= 3,
    `the chat background within 22px of the card must be untouched by it (band outside the frame): ${outside.map(([k, v]) => `${k}=${v}`).join('  ')}`)

  // 6. And the fallback: with no stamp, the dock card must paint its own frame
  //    again, so a detection miss degrades to "the app's card", never to "nothing".
  console.log(`fallback: ${JSON.stringify(fallback)}`)
  assert(parseFloat(fallback.borderW) > 0 && fallback.borderStyle === 'solid',
    `unstamped stack lost the app's own frame: ${fallback.borderW} ${fallback.borderStyle}`)
  assert(!/0, 0, 0, 0/.test(fallback.bg),
    `unstamped stack has no fill, so the rows would sit bare on the chat background: ${fallback.bg}`)

  console.log('\n=== Task Panel Layers Suite: PASS ===\n')
})().catch(err => {
  console.error('\n' + (err.message || err))
  process.exit(1)
})
