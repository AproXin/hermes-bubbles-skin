/**
 * test/overlay-stacking.test.js
 *
 * Replaces the source-text assertions phase3-1-audit used to make about stacking
 * and responsive clamping. Those read `srcCode.includes("z-index: 50 !important")`
 * and, worse, pinned a 13-line clarify block byte for byte — so they failed on a
 * reindent and passed on any semantic change that kept the shape. One of them even
 * advertised a "Task Dock (z:30)" tier that exists nowhere in the CSS.
 *
 * Here the numbers come out of a browser: the stacking order is compared, and the
 * clamp()s are proven to be clamp()s by measuring them at two viewport heights
 * (a fixed max-height could never satisfy both halves).
 *   node test/overlay-stacking.test.js
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadSheets, launchChromium, pageHtml, pathToFileUrl } = require('../scripts/lib/sheets')

const sheets = loadSheets()
if (sheets.error) { console.log(`SKIPPED — ${sheets.error}`); process.exit(0) }

// Markup mirrors the renderer: approval card with a command pre, clarify inline
// card, and the composer task section whose body owns the scroll area.
const BODY = `<div style="padding:24px;width:640px">
 <div data-slot="tool-approval-stack" id="stack"><div data-slot="tool-approval-card" id="card"><div><span class="codicon codicon-terminal"></span>批准执行</div><pre>rm -rf node_modules && npm i</pre></div></div>
 <div data-slot="clarify-inline" id="clarify"><form data-clarify-choices=""><button type="button">选项一</button></form></div>
 <div data-slot="composer-status-stack"><div data-slot="status-section" data-bubbles-task-section="true">
   <div class="status-section-header"><button type="button" class="status-section-trigger"><span>任务</span></button></div>
   <div class="status-section-body" id="task-body">${'<div class="status-row" data-slot="status-row"><span class="status-row-content"><div><p>步骤</p></div></span></div>'.repeat(12)}</div>
 </div></div>
</div>`

;(async () => {
  const browser = await launchChromium()
  if (!browser) { console.log('SKIPPED — no Chromium available'); process.exit(0) }
  let failures = 0
  const check = (name, ok, detail) => {
    if (!ok) failures += 1
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  }
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-'))
    const file = path.join(dir, 'o.html')
    fs.writeFileSync(file, pageHtml(sheets, BODY))

    const open = async height => {
      const page = await browser.newPage({ viewport: { width: 720, height }, deviceScaleFactor: 1, colorScheme: 'dark' })
      await page.goto(pathToFileUrl(file))
      return page
    }
    const read = (page, sel, props) => page.evaluate(({ sel, props }) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const cs = getComputedStyle(el)
      const out = {}
      for (const p of props) out[p] = cs[p]
      return out
    }, { sel, props })

    console.log('\n=== Overlay Stacking & Clamp Suite ===\n')
    console.log('[stacking]')
    const page = await open(600)
    const stack = await read(page, '#stack', ['zIndex', 'overflow'])
    const clarify = await read(page, '#clarify', ['zIndex', 'display', 'visibility', 'opacity', 'borderTopLeftRadius', 'backgroundImage', 'borderTopWidth', 'backdropFilter'])
    const cardPre = await read(page, '#card pre', ['maxHeight', 'overflowWrap', 'wordBreak'])
    const body = await read(page, '#task-body', ['maxHeight', 'overflowY', 'overscrollBehaviorY'])

    check('approval stack sits at z 50', stack && stack.zIndex === '50', JSON.stringify(stack))
    check('clarify card sits at z 40', clarify && clarify.zIndex === '40', `z ${clarify && clarify.zIndex}`)
    check('approval outranks clarify', stack && clarify && +stack.zIndex > +clarify.zIndex,
      `${stack && stack.zIndex} > ${clarify && clarify.zIndex}`)
    check('clarify is actually painted, not merely present',
      clarify && clarify.display !== 'none' && clarify.visibility === 'visible' && clarify.opacity === '1'
        && /gradient/.test(clarify.backgroundImage) && clarify.borderTopWidth === '1px'
        && /blur/.test(clarify.backdropFilter),
      JSON.stringify(clarify && { d: clarify.display, v: clarify.visibility, o: clarify.opacity, r: clarify.borderTopLeftRadius, bf: clarify.backdropFilter }))
    await page.close()

    /* clamp() proven, not string-matched: the same property must follow the
       viewport at small heights and pin to its ceiling at large ones. A fixed
       max-height could satisfy one of the two, never both. */
    console.log('\n[responsive clamp]')
    const small = await open(400)
    const sBody = await read(small, '#task-body', ['maxHeight'])
    const sPre = await read(small, '#card pre', ['maxHeight'])
    await small.close()
    const large = await open(1400)
    const lBody = await read(large, '#task-body', ['maxHeight'])
    const lPre = await read(large, '#card pre', ['maxHeight'])
    await large.close()

    check('task body grows with the viewport (28vh)',
      parseFloat(sBody.maxHeight) === 112 && parseFloat(lBody.maxHeight) === 320,
      `400px→${sBody.maxHeight}, 1400px→${lBody.maxHeight}`)
    check('task body is capped at 320px, not unbounded',
      parseFloat(lBody.maxHeight) === 320, lBody.maxHeight)
    check('approval pre is floored then capped (100–200px)',
      parseFloat(sPre.maxHeight) === 100 && parseFloat(lPre.maxHeight) === 200,
      `400px→${sPre.maxHeight}, 1400px→${lPre.maxHeight}`)
    check('both scroll rather than clip', body.overflowY === 'auto' && cardPre.wordBreak !== 'normal',
      `body ${body.overflowY}/${body.overscrollBehaviorY}, pre ${cardPre.wordBreak}`)
  } finally {
    await browser.close()
  }
  console.log(`\n${failures ? 'FAIL' : 'OK'} — ${9 - failures}/9 assertions`)
  process.exit(failures ? 1 : 0)
})().catch(err => { console.error(err); process.exit(1) })
