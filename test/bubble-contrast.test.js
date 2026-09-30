/**
 * test/bubble-contrast.test.js
 *
 * The user bubble has been re-skinned twice on the same two demands, so both are
 * now measured instead of argued:
 *
 *   1. 「和 hermes 的输出气泡颜色要做明显的区别」 — it must not sit in the assistant
 *      bubble's colour family.
 *   2. It has to stay readable. The bubble is now the icon's warm→cool spectrum at
 *      0.55 alpha over sapphire, which means the background under the text is not
 *      one colour any more, so the binding number is the WORST patch, not the mean.
 *
 * Two properties of the harness matter:
 *   - The fill is read from a glyph-free strip inside the left padding. A point
 *     probe is not enough: the user bubble is content-width and the assistant is
 *     full-width, so a fixed offset measures the layout, not the colour (that
 *     mistake reported the same stylesheet as Δ126 and Δ51 in two runs).
 *   - The contrast map is taken with the glyphs set to `color: transparent`, so it
 *     scores pure background. Scoring the painted text against a filter that drops
 *     "bright" pixels reported the sapphire fill as near-black and its own ink as
 *     21:1.
 *
 * Both guards carry a negative control, and the control asserts it moved the
 * pixels — an inert override once "passed" by measuring the same fill twice.
 *
 *   node test/bubble-contrast.test.js
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadSheets, launchChromium, pageHtml, pathToFileUrl } = require('../scripts/lib/sheets')

const sheets = loadSheets()
if (sheets.error) { console.log(`SKIPPED — ${sheets.error}`); process.exit(0) }

const MSG = '我的提问：这类气泡要跟助手回复一眼分开。'
const BODY = `<div id="shot" style="padding:28px;display:flex;flex-direction:column;gap:18px;width:840px">`
  + `<div data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content" class="min-w-0 max-w-full"><p>助手回复：这是白雾霜玻气泡。</p></div></div>`
  + `<div data-slot="aui_user-message-root" class="group/user-message"><div class="composer-human-message-container">`
  + `<div class="composer-human-message" id="user">${MSG}</div></div></div>`
  + `</div>`

// The fill this design replaced (graphite-navy, white ink), for the controls. No
// "!important" inside the value: CSSOM rejects that and setProperty silently does
// nothing, which is how a negative control once passed by measuring nothing.
const PRE_SPECTRUM_FILL = 'radial-gradient(240px 90px at 85% 0%, rgba(219, 234, 254, 0.08), transparent 70%),'
  + ' linear-gradient(180deg, rgba(191, 219, 254, 0.10), transparent 45%, rgba(3, 8, 20, 0.46)),'
  + ' rgba(29, 43, 64, 0.78)'

/** Mean fill per horizontal third, read from the padding strip (no glyphs). */
const BANDS = `(async (dataUrl) => {
  const img = new Image()
  await new Promise(r => { img.onload = r; img.src = dataUrl })
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0)
  const y0 = Math.round(img.height * 0.15), y1 = Math.round(img.height * 0.85), sw = 16
  const d = g.getImageData(6, y0, sw, y1 - y0).data
  const rows = []
  for (let y = 0; y < (y1 - y0); y += 2) {
    const acc = [0, 0, 0]
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4
      acc[0] += d[i]; acc[1] += d[i + 1]; acc[2] += d[i + 2]
    }
    rows.push(acc.map(v => v / sw))
  }
  const third = Math.max(1, Math.floor(rows.length / 3))
  const seg = a => { if (!a.length) return [0, 0, 0]
    const t = [0, 0, 0]; for (const p of a) { t[0] += p[0]; t[1] += p[1]; t[2] += p[2] }
    return t.map(v => Math.round(v / a.length)) }
  return { top: seg(rows.slice(0, third)), mid: seg(rows.slice(third, 2 * third)),
    bot: seg(rows.slice(2 * third)), all: seg(rows) }
})`

/** Worst / mean WCAG contrast of `ink` against every background pixel. */
const CONTRAST = `(async (dataUrl, ink) => {
  const img = new Image()
  await new Promise(r => { img.onload = r; img.src = dataUrl })
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0)
  const inset = 24, iw = img.width - 2 * inset
  const d = g.getImageData(inset, inset, iw, img.height - 2 * inset).data
  const lum = rgb => { const [r, gg, b] = rgb.map(v => { const s = v / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) })
    return 0.2126 * r + 0.7152 * gg + 0.0722 * b }
  const li = lum(ink)
  let min = 99, sum = 0, n = 0
  for (let i = 0; i < d.length; i += 4) {
    const l = lum([d[i], d[i + 1], d[i + 2]])
    const r = (Math.max(l, li) + 0.05) / (Math.min(l, li) + 0.05)
    if (r < min) min = r
    sum += r; n++
  }
  return { min: +(min).toFixed(2), avg: +(sum / n).toFixed(2), px: n }
})`

const hue = rgb => {
  const [r, g, b] = rgb.map(v => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (!d) return -1
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0))
    : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return h * 60
}
const hueSpread = (p, q) => {
  const a = hue(p), b = hue(q)
  if (a < 0 || b < 0) return 0
  const d = Math.abs(a - b) % 360
  return Math.round(d > 180 ? 360 - d : d)
}
const dist = (p, q) => Math.round(Math.hypot(...p.map((v, i) => v - q[i])))

;(async () => {
  const browser = await launchChromium()
  if (!browser) { console.log('SKIPPED — no Chromium available'); process.exit(0) }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bubble-contrast-'))
  const file = path.join(dir, 'b.html')
  fs.writeFileSync(file, pageHtml(sheets, BODY))
  const page = await browser.newPage({ viewport: { width: 900, height: 320 }, deviceScaleFactor: 2, colorScheme: 'dark' })
  await page.goto(pathToFileUrl(file))
  const sampler = await browser.newPage()
  await sampler.setContent('<body></body>')
  const shot = async sel => 'data:image/png;base64,' + (await page.locator(sel).screenshot()).toString('base64')
  const bandsOf = async sel => sampler.evaluate(`${BANDS}(${JSON.stringify(await shot(sel))})`)
  // Ink is read from the element's own computed colour, so the test follows the
  // skin instead of pinning a hex the skin is free to change.
  const inkOf = () => page.evaluate(() => {
    const [r, g, b] = getComputedStyle(document.querySelector('#user')).color.match(/[\d.]+/g).map(Number)
    return [r, g, b]
  })
  const contrastOf = async (sel, ink) => {
    await page.evaluate(s => document.querySelector(s).style.setProperty('color', 'transparent', 'important'), sel)
    const out = await sampler.evaluate(`${CONTRAST}(${JSON.stringify(await shot(sel))}, ${JSON.stringify(ink)})`)
    await page.evaluate(s => document.querySelector(s).style.removeProperty('color'), sel)
    return out
  }

  const results = []
  const check = (name, ok, detail) => {
    results.push({ name, ok })
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  }

  const a = await bandsOf('[data-slot="aui_assistant-message-content"]')
  const u = await bandsOf('#user')
  const ink = await inkOf()
  const delta = dist(a.all, u.all)
  const spread = hueSpread(u.top, u.bot)
  const score = await contrastOf('#user', ink)

  console.log(`\nassistant ${JSON.stringify(a.all)}   user ${JSON.stringify(u.all)}   ink ${JSON.stringify(ink)}`)
  console.log(`Δ=${delta}   色相跨度(顶→底)=${spread}°   对比 最差 ${score.min} / 均值 ${score.avg}\n`)

  check('separates from the assistant bubble', delta >= 80, `RGB distance ${delta}`)
  check('worn by a real spectrum, not one hue', spread >= 25,
    `top ${JSON.stringify(u.top)} → bottom ${JSON.stringify(u.bot)} is ${spread}° of hue`)
  check('body text passes WCAG AA everywhere', score.min >= 4.5,
    `worst patch ${score.min}:1 over ${score.px} px, mean ${score.avg}:1`)

  // Control 1 — the pre-spectrum fill must fail the hue-spread guard while still
  // being readable, which is what makes the spread guard mean "spectrum" and not
  // just "some gradient".
  await page.evaluate(f => {
    document.querySelector('#user').style.setProperty('background', f, 'important')
  }, PRE_SPECTRUM_FILL)
  const old = await bandsOf('#user')
  const oldSpread = hueSpread(old.top, old.bot)
  await page.evaluate(() => document.querySelector('#user').style.removeProperty('background'))
  const back = await bandsOf('#user')
  check('control 1 is live', dist(old.all, u.all) > 20 && dist(back.all, u.all) < 6,
    `override moved Δ${dist(old.all, u.all)}, revert Δ${dist(back.all, u.all)}`)
  check('control 1: a single-hue gradient fails the spread guard', oldSpread < 25,
    `previous graphite fill spans ${oldSpread}°`)

  // Control 2 — white ink on this pastel spectrum must fail the contrast guard.
  await page.evaluate(() => document.querySelector('#user').style.setProperty('color', '#ffffff', 'important'))
  const white = await contrastOf('#user', [255, 255, 255])
  check('control 2: white ink fails on the light fill', white.min < 4.5 && white.avg < 2.5,
    `white ink worst ${white.min}, mean ${white.avg} (dark ink: worst ${score.min})`)

  await browser.close()
  const failed = results.filter(r => !r.ok)
  console.log(`\n${failed.length ? 'FAIL' : 'OK'} — ${results.length - failed.length}/${results.length} assertions`)
  process.exit(failed.length ? 1 : 0)
})().catch(err => { console.error(err); process.exit(1) })
