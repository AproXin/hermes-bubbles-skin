/**
 * test/tool-flatten-layers.test.js
 *
 * Replaces tool-flattening's Tests 2–5, which asserted the flattening by matching
 * text out of both stylesheets ("pluginSource.includes('border: none !important')"
 * and friends — note that the same three words appear dozens of times, so those
 * assertions could not tell you WHICH rule they came from, and reformatting a rule
 * broke them).
 *
 * Here the claims are measured on a real DOM built from the renderer's markup:
 * a grouped row that is expanded, a failed row with red children, a running row,
 * and a single-tool group with its duplicate native header. The wildcard ban is
 * read out of the parsed CSSOM instead of out of the file text.
 *   node test/tool-flatten-layers.test.js
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadSheets, launchChromium, pageHtml, pathToFileUrl } = require('../scripts/lib/sheets')

const sheets = loadSheets()
if (sheets.error) { console.log(`SKIPPED — ${sheets.error}`); process.exit(0) }

const HEADER = '<div class="border-b border-(--ui-stroke-tertiary) px-2 py-1.5"><button type="button" aria-expanded="true" class="group/disclosure-row flex items-center gap-1.5"><span class="grid size-3.5 shrink-0 place-items-center self-center"><svg class="size-3.5"></svg></span><span>已读取 a.ts</span></button></div>'
const BLOCK = (attrs, inner = '') => `<div data-slot="tool-block" data-tool-row="" ${attrs} class="group/tool-block min-w-0 max-w-full overflow-hidden rounded-[0.3125rem] border border-(--ui-stroke-tertiary)">${HEADER}<div class="px-2 py-1.5">正文${inner}</div></div>`
// glyph-spinner.tsx:96-110 — every frame is in the DOM and a transform keyframe
// scrolls between them, so the app animates a running row without the skin adding
// any box or animation of its own. The two custom properties are set inline by the
// component (glyph-spinner.tsx:91-95) and the keyframes read them, so a fixture
// without them has no animation to observe.
const SPINNER = '<span role="status" aria-label="运行中" class="inline-flex items-center font-mono tabular-nums size-3.5"><span aria-hidden="true" class="glyph-spinner"><span class="glyph-spinner__strip" style="--glyph-spinner-duration:1200ms;--glyph-spinner-frames:2"><span class="glyph-spinner__frame">⠋</span><span class="glyph-spinner__frame">⠙</span></span></span></span>'

const BODY = `<div style="padding:24px;width:640px"><div data-slot="aui_assistant-message-content">`
  + `<div id="grouped">${BLOCK(`data-bubbles-in-group="true" data-bubbles-group-collapsed="false" data-bubbles-tool-state="completed"`)}</div>`
  + `<div id="failed">${BLOCK('data-bubbles-tool-state="failed"',
    '<div class="border-destructive border border-red-500">红框</div><div class="bg-destructive bg-red-100">红底</div>')}</div>`
  + `<div id="running">${BLOCK('data-bubbles-tool-state="running"')}</div>`
  + `<div id="spinner">${SPINNER}</div>`
  + `<div id="single"><div class="bubbles-tool-group" data-tool-count="1"><button type="button" class="bubbles-tool-group-toggle"><span class="bubbles-group-icon"></span><span>已读取 b.ts</span></button></div>`
  + `<div data-slot="tool-block" data-tool-row="" class="group/tool-block"><div data-bubbles-duplicate-header="true" class="group/disclosure-row">重复的原生标题</div><div class="px-2 py-1.5">正文</div></div></div>`
  + `</div></div>`

;(async () => {
  const browser = await launchChromium()
  if (!browser) { console.log('SKIPPED — no Chromium available'); process.exit(0) }
  let failures = 0
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flatten-layers-'))
    const file = path.join(dir, 'f.html')
    fs.writeFileSync(file, pageHtml(sheets, BODY))
    const page = await browser.newPage({ viewport: { width: 720, height: 620 }, deviceScaleFactor: 1, colorScheme: 'dark' })
    await page.goto(pathToFileUrl(file))

    const check = (name, ok, detail) => {
      if (!ok) failures += 1
      console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
    }
    // A row is "flat" when it draws neither a border nor a fill nor a shadow.
    const flat = o => !!o && (parseFloat(o.borderW) === 0 || o.borderStyle === 'none')
      && o.bg === 'rgba(0, 0, 0, 0)' && o.shadow === 'none'
    const m = await page.evaluate(() => {
      const cs = sel => {
        const el = document.querySelector(sel)
        if (!el) return null
        const s = getComputedStyle(el)
        return {
          borderW: s.borderTopWidth, borderStyle: s.borderTopStyle, borderColor: s.borderTopColor,
          bg: s.backgroundColor, bgImage: s.backgroundImage.slice(0, 12), shadow: s.boxShadow,
          blur: s.backdropFilter, anim: s.animationName, display: s.display,
          opacity: s.opacity, visibility: s.visibility, play: s.animationPlayState,
        }
      }
      const mark = getComputedStyle(
        document.querySelector('#failed [class*="size-3.5"]'), '::after')
      return {
        grouped: cs('#grouped [data-slot="tool-block"]'),
        groupedHeader: cs('#grouped .group\\/disclosure-row'),
        failedRoot: cs('#failed [data-slot="tool-block"]'),
        failedMark: { content: mark.content, color: mark.color },
        redBox: cs('#failed .border-destructive'),
        redFill: cs('#failed .bg-destructive'),
        runningRoot: cs('#running [data-slot="tool-block"]'),
        runningHeader: cs('#running .group\\/disclosure-row'),
        spinnerStrip: cs('#spinner .glyph-spinner__strip'),
        dupHeader: cs('#single [data-bubbles-duplicate-header]'),
        pill: cs('#single .bubbles-tool-group-toggle'),
        // The wildcard ban, read from the parsed object model rather than the text:
        // `.tool*{` and `.tool  >  * {` would have slipped past a string match.
        wildcards: [...document.styleSheets].flatMap(ss => {
          try { return [...ss.cssRules] } catch { return [] }
        }).filter(r => r.selectorText && /(^|[\s,])(\.tool|\.message)\s*[^,]*\*/.test(r.selectorText))
          .map(r => r.selectorText.slice(0, 70)),
      }
    })

    console.log('\n=== Tool Flatten Layers Suite ===\n')
    console.log('[grouped, expanded]')
    check('the grouped row paints no card of its own', flat(m.grouped), JSON.stringify(m.grouped))
    check('its child disclosure header is neutralized', flat(m.groupedHeader), JSON.stringify(m.groupedHeader))

    console.log('\n[failed]')
    check('a failure is not a red container', flat(m.failedRoot), JSON.stringify(m.failedRoot))
    check('the failure shows as a cross in the glyph slot',
      /✗/.test(m.failedMark.content || ''), JSON.stringify(m.failedMark))
    check('inner red border is stripped', m.redBox && (parseFloat(m.redBox.borderW) === 0 || m.redBox.borderStyle === 'none'),
      JSON.stringify(m.redBox && { w: m.redBox.borderW, s: m.redBox.borderStyle }))
    check('inner red background is stripped', m.redFill && m.redFill.bg === 'rgba(0, 0, 0, 0)',
      JSON.stringify(m.redFill && m.redFill.bg))

    console.log('\n[running]')
    check('a running row is not a box either', parseFloat(m.runningRoot.borderW) === 0 && m.runningRoot.bg === 'rgba(0, 0, 0, 0)',
      JSON.stringify(m.runningRoot))
    /* The old text assertion here matched `animation: bubblesPulseGlow … !important`
       anywhere in the file — which is the SESSION ROW rule at plugin.js:1536, not a
       tool rule. Tools lost their own pulse in the flattening pass (plugin.js ~790
       sets animation: none on purpose).
       What marks a running row instead is the app's braille spinner. Its keyframes
       ship in a separate chunk (dist/assets/glyph-spinner-*.css) that
       sheets.loadSheets does not stack, so "is it animating" cannot be measured
       here — that would be asserting on a stylesheet that is not loaded. What the
       skin DOES own is not hiding or freezing that element, which is checked below. */
    check('a running row carries no skin animation of its own', m.runningRoot.anim === 'none',
      m.runningRoot.anim)
    check('the skin leaves the app spinner visible and unfrozen',
      m.spinnerStrip && m.spinnerStrip.display !== 'none' && m.spinnerStrip.visibility === 'visible'
        && m.spinnerStrip.opacity !== '0' && m.spinnerStrip.play !== 'paused',
      JSON.stringify(m.spinnerStrip && { d: m.spinnerStrip.display, v: m.spinnerStrip.visibility, o: m.spinnerStrip.opacity, p: m.spinnerStrip.play }))
    check('its child header stays transparent', flat(m.runningHeader), JSON.stringify(m.runningHeader))

    console.log('\n[single-tool group]')
    check('the duplicate native header is hidden, not deleted',
      m.dupHeader && m.dupHeader.display === 'none', JSON.stringify(m.dupHeader && m.dupHeader.display))
    check('the group pill itself is still visible', m.pill && m.pill.display !== 'none')

    console.log('\n[scope]')
    check('no .tool/.message wildcard rule exists', m.wildcards.length === 0, m.wildcards.join(' | '))
  } finally {
    await browser.close()
  }
  console.log(`\n${failures ? 'FAIL' : 'OK'} — ${13 - failures}/13 assertions`)
  process.exit(failures ? 1 : 0)
})().catch(err => { console.error(err); process.exit(1) })
