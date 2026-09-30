/**
 * test/composer-menu-align.test.js
 *
 * Phase B moved the composer's model / reasoning pills left, but both Radix menus
 * are declared align="end", so their panels hung off the pill's left edge.
 * alignComposerPillMenu fixes that with one translateX on the popper wrapper.
 *
 * It found the panel with `document.querySelector("[data-slot='dropdown-menu-content'][class~='w-64']")`
 * — the FIRST panel of that width anywhere in the document. Radix keeps closed
 * content mounted while it animates out, and the host has other w-64 menus, so
 * "first w-64" is not "the one that just opened". Verified against the installed
 * @radix-ui/react-menu 2.1.24: MenuContent carries data-state (dist/index.mjs:300)
 * and data-radix-menu-content (:301). aria-labelledby is NOT available — it is only
 * set on SubContent (:737).
 *
 *   node test/composer-menu-align.test.js
 */

const { launchChromium, pluginScriptForPage } = require('../scripts/lib/sheets')

const panel = (state, label) =>
  `<div data-radix-popper-content-wrapper style="position:absolute;left:0;top:120px">`
  + `<div data-slot="dropdown-menu-content" data-state="${state}" class="w-64 rounded-md" id="${label}">${label}</div></div>`

const PAGE = `<!doctype html><html data-bubbles-skin='true'><body style="margin:0">
  <button data-tour="model-pill" id="trigger" style="position:absolute;left:600px;top:40px">模型</button>
  ${panel('closed', 'stale')}
  ${panel('open', 'fresh')}
</body></html>`

;(async () => {
  const browser = await launchChromium()
  if (!browser) { console.log('SKIPPED — no Chromium available'); process.exit(0) }
  let failures = 0
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 600 } })
    await page.setContent(PAGE)
    await page.addScriptTag({ content: pluginScriptForPage() })

    const out = await page.evaluate(() => {
      const moved = alignComposerPillMenu(document.getElementById('trigger'))
      const wrap = id => document.getElementById(id).closest('[data-radix-popper-content-wrapper]')
      return {
        moved,
        stale: wrap('stale').style.transform || '',
        fresh: wrap('fresh').style.transform || '',
      }
    })

    console.log('\n=== Composer Menu Align Suite ===\n')
    const check = (name, ok, detail) => {
      if (!ok) failures += 1
      console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
    }

    check('the call reports that it aligned something', out.moved === true)
    check('the panel that is open gets the shift', /translateX/.test(out.fresh), JSON.stringify(out.fresh))
    check('the closed panel of the same width is left alone', out.stale === '', JSON.stringify(out.stale))

    // Re-opening must not stack a second translate onto the first.
    const twice = await page.evaluate(() => {
      alignComposerPillMenu(document.getElementById('trigger'))
      alignComposerPillMenu(document.getElementById('trigger'))
      const w = document.getElementById('fresh').closest('[data-radix-popper-content-wrapper]')
      return { transform: w.style.transform, shifts: (w.style.transform.match(/translateX/g) || []).length }
    })
    check('a second open does not stack shifts', twice.shifts === 1, JSON.stringify(twice.transform))

    // A trigger with no open panel must be a no-op, not a grab for any panel.
    const none = await page.evaluate(() => {
      document.getElementById('fresh').setAttribute('data-state', 'closed')
      const before = document.getElementById('fresh').closest('[data-radix-popper-content-wrapper]').style.transform
      return { moved: alignComposerPillMenu(document.getElementById('trigger')), before }
    })
    check('no open panel means no move', none.moved === false)
  } finally {
    await browser.close()
  }
  console.log(`\n${failures ? 'FAIL' : 'OK'} — ${5 - failures}/5 assertions`)
  process.exit(failures ? 1 : 0)
})().catch(err => { console.error(err); process.exit(1) })
