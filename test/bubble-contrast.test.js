/**
 * test/bubble-contrast.test.js
 *
 * The user bubble had two standing complaints, and both are measurable:
 *
 *   1. 「我的对话气泡颜色过蓝」 — the fill was rgba(18,48,96,.66), which paints at
 *      a blue-to-red ratio of 4.0, i.e. more saturated than the theme's own
 *      backdrop.
 *   2. 「和 hermes 的输出气泡颜色要做明显的区别」 — deepening the SAME hue only
 *      moves lightness, so the two bubbles stayed in one colour family.
 *
 * The fix rotates the fill out of azure toward graphite-navy (base
 * rgba(29,43,64,.78)) and keeps the sapphire only where the theme already uses it
 * (the top light, the border, the tail). This test measures the PAINTED pixels of
 * both bubbles from the real three sheets, because that is the only claim that
 * matters, and it carries a negative control: re-injecting the old fill has to
 * break the ratio guard, so a PASS here means the guard guards something.
 *
 *   node test/bubble-contrast.test.js
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadSheets, launchChromium, pageHtml, pathToFileUrl } = require('../scripts/lib/sheets')

const sheets = loadSheets()
if (sheets.error) { console.log(`SKIPPED — ${sheets.error}`); process.exit(0) }

const BODY = `<div id="shot" style="padding:28px;display:flex;flex-direction:column;gap:18px;width:840px">`
  + `<div data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content" class="min-w-0 max-w-full"><p>助手回复：这是白雾霜玻气泡。</p></div></div>`
  + `<div data-slot="aui_user-message-root" class="group/user-message"><div class="composer-human-message-container">`
  + `<div class="composer-human-message" id="user">我的提问：这是用户气泡。</div></div></div>`
  + `</div>`

// The fill this test replaced, verbatim, for the negative control. No
// "!important" inside the value: CSSOM rejects that (the declaration parses as
// invalid and setProperty silently does nothing), which showed up as the control
// measuring the new fill byte for byte.
const OLD_FILL = 'radial-gradient(240px 90px at 85% 0%, rgba(191, 219, 254, 0.10), transparent 70%),'
  + ' linear-gradient(180deg, rgba(147, 197, 253, 0.07), transparent 45%, rgba(4, 18, 40, 0.30)),'
  + ' rgba(18, 48, 96, 0.66)'

/**
 * Average of every interior row, text pixels dropped. A point probe is not good
 * enough here: the user bubble is content-width and the assistant is full-width,
 * so a fixed offset lands on different parts of the ambient backdrop for each,
 * and the "distance" measured the layout rather than the colour.
 */
const FILL_PROBE = `(async (dataUrl) => {
  const img = new Image()
  await new Promise(r => { img.onload = r; img.src = dataUrl })
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0)
  const inset = 6, iw = img.width - 2 * inset
  const d = g.getImageData(inset, inset, iw, img.height - 2 * inset).data
  const stride = iw * 4, rows = []
  for (let off = 0; off + stride <= d.length; off += stride * 2) {
    const acc = [0, 0, 0]; let n = 0
    for (let i = off; i < off + stride; i += 4) {
      if (d[i] >= 200 || d[i + 1] >= 200 || d[i + 2] >= 200) continue   // glyph / border
      acc[0] += d[i]; acc[1] += d[i + 1]; acc[2] += d[i + 2]; n++
    }
    if (n > 10) rows.push(acc.map(v => v / n))
  }
  const third = Math.max(1, Math.floor(rows.length / 3))
  const seg = a => { if (!a.length) return [0, 0, 0]
    const t = [0, 0, 0]; for (const p of a) { t[0] += p[0]; t[1] += p[1]; t[2] += p[2] }
    return t.map(v => Math.round(v / a.length)) }
  return { top: seg(rows.slice(0, third)), bot: seg(rows.slice(2 * third)), all: seg(rows), lines: rows.length }
})`

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
  const fillOf = async sel => sampler.evaluate(
    `${FILL_PROBE}(${JSON.stringify('data:image/png;base64,' + (await page.locator(sel).screenshot()).toString('base64'))})`)

  const results = []
  const check = (name, ok, detail) => {
    results.push({ name, ok, detail })
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  }

  const a = await fillOf('[data-slot="aui_assistant-message-content"]')
  const u = await fillOf('#user')
  const delta = dist(a.all, u.all)
  const blueRatio = u.all[2] / Math.max(1, u.all[0])
  const rampG = u.top[1] - u.bot[1]

  console.log(`\nassistant fill ${JSON.stringify(a.all)}   user fill ${JSON.stringify(u.all)}`)
  console.log(`Δ=${delta}   B/R=${blueRatio.toFixed(2)}   ramp(G)=${rampG}\n`)

  check('user bubble is not azure-blue', blueRatio <= 2.8,
    `painted B/R ${blueRatio.toFixed(2)} (the old fill measures 4.0 under this probe)`)
  check('user bubble separates from the assistant', delta >= 80,
    `RGB distance ${delta} vs assistant ${JSON.stringify(a.all)}`)
  check('the vertical micro-gradient reads', rampG >= 14,
    `top-to-bottom green channel ${rampG}`)
  check('white text keeps its contrast', u.all[1] < 120 && u.all[0] < 90,
    `fill ${JSON.stringify(u.all)}`)

  // Negative control: the guard must go red on the fill it replaced.
  await page.evaluate(old => {
    document.querySelector('#user').style.setProperty('background', old, 'important')
  }, OLD_FILL)
  const o = await fillOf('#user')
  const oldRatio = o.all[2] / Math.max(1, o.all[0])
  await page.evaluate(() => document.querySelector('#user').style.removeProperty('background'))
  const after = await fillOf('#user')
  // A control that measured nothing is worse than no control: assert the override
  // moved the pixels and that removing them moved back.
  check('control is live', dist(o.all, u.all) > 20 && dist(after.all, u.all) < 4,
    `override moved Δ${dist(o.all, u.all)}, revert Δ${dist(after.all, u.all)}`)
  check('negative control: the old fill fails the blue guard', oldRatio > 2.8,
    `old fill B/R ${oldRatio.toFixed(2)}, new ${blueRatio.toFixed(2)}`)

  await browser.close()
  const failed = results.filter(r => !r.ok)
  console.log(`\n${failed.length ? 'FAIL' : 'OK'} — ${results.length - failed.length}/${results.length} assertions`)
  process.exit(failed.length ? 1 : 0)
})().catch(err => { console.error(err); process.exit(1) })
