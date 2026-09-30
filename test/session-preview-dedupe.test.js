/**
 * test/session-preview-dedupe.test.js
 *
 * The sidebar hover preview is rebuilt on every `pointerover`, and that event
 * fires for each child element the pointer crosses — the label span, the badge,
 * the time cell. For the ACTIVE row, building the preview walks the whole
 * document for messages (plugin.js extractSessionRowPreviewData), so sweeping the
 * mouse down the sidebar re-ran a document-wide query per pixel crossed.
 *
 * `currentPreviewRow` already existed to stop that: it is assigned in showPreview,
 * hidePreview and cleanup, and read nowhere. This test asserts the two things the
 * guard owes: the card node is not rebuilt, and the counter does not move.
 *   node test/session-preview-dedupe.test.js
 */

const { launchChromium, pluginScriptForPage } = require('../scripts/lib/sheets')

const ROW = `<div data-slot="sidebar"><div class="row-hover" id="row">`
  + `<button class="row-button" type="button"><span class="hover-marquee-inner">重构数据管道</span></button>`
  + `<time aria-label="3 分钟前">3m</time></div></div>`

;(async () => {
  const browser = await launchChromium()
  if (!browser) { console.log('SKIPPED — no Chromium available'); process.exit(0) }
  let failures = 0
  try {
    const page = await browser.newPage()
    await page.setContent(`<!doctype html><html data-bubbles-skin='true'><body>${ROW}</body></html>`)
    await page.addScriptTag({ content: pluginScriptForPage() })

    const out = await page.evaluate(() => {
      const row = document.getElementById('row')
      showPreview(row)
      const container = document.getElementById('bubbles-session-preview')
      const firstCard = container?.firstElementChild || null
      const showsAfterFirst = stats.previewShows
      // The same pointer sweep, three more crossings of the same row.
      showPreview(row); showPreview(row); showPreview(row)
      return {
        hasContainer: !!container,
        rebuilt: container?.firstElementChild !== firstCard,
        showsAfterFirst,
        showsAfterFour: stats.previewShows,
        title: container?.querySelector('.bubbles-preview-title')?.textContent || '',
      }
    })

    console.log('\n=== Session Preview Dedupe Suite ===\n')
    const check = (name, ok, detail) => {
      if (!ok) failures += 1
      console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
    }

    check('preview renders the row title', out.title === '重构数据管道', JSON.stringify(out.title))
    check('a second hover inside the same row does not rebuild the card', !out.rebuilt)
    check('and it does not count as another show', out.showsAfterFour === out.showsAfterFirst,
      `${out.showsAfterFirst} → ${out.showsAfterFour}`)

    // The guard must not swallow a real row change.
    const moved = await page.evaluate(() => {
      const first = document.getElementById('bubbles-session-preview').firstElementChild
      const row2 = document.createElement('div')
      row2.className = 'row-hover'
      row2.innerHTML = '<button class="row-button" type="button"><span class="hover-marquee-inner">另一个会话</span></button>'
      document.querySelector('[data-slot="sidebar"]').appendChild(row2)
      showPreview(row2)
      const c = document.getElementById('bubbles-session-preview')
      return {
        rebuilt: c.firstElementChild !== first,
        title: c.querySelector('.bubbles-preview-title').textContent,
      }
    })
    check('hovering a different row does rebuild', moved.rebuilt)
    check('and shows the new row', moved.title === '另一个会话', JSON.stringify(moved.title))
  } finally {
    await browser.close()
  }
  console.log(`\n${failures ? 'FAIL' : 'OK'} — ${5 - failures}/5 assertions`)
  process.exit(failures ? 1 : 0)
})().catch(err => { console.error(err); process.exit(1) })
