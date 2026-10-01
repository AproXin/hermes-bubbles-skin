/**
 * test/kanban-surface.test.js
 *
 * The kanban board looked like it carried its own hardcoded dark background while
 * every other page showed the ambient constellation. It does not: board.tsx:1327 uses
 * the theme token `--ui-surface-background`, which styles.css:365 defines as
 * `var(--ui-bg-editor)` — the editor's near-black. The skin's variable layer overrode
 * --sidebar, --ui-bg-chrome, --ui-sidebar-surface-background and friends, but not this
 * one, so the board kept the editor colour while its neighbours went transparent.
 *
 * The token has exactly three users in the whole renderer (styles.css, board.tsx,
 * find-bar.tsx), so pointing it at the same transparent value the other surfaces use is
 * the consistent fix rather than a kanban-specific override.
 *   node test/kanban-surface.test.js
 */

const { loadSheets, launchChromium, pageHtml, pathToFileUrl } = require('../scripts/lib/sheets')

const sheets = loadSheets()
if (sheets.error) { console.log(`SKIPPED — ${sheets.error}`); process.exit(0) }

/* Root classes copied from board.tsx:1327; the card from board.tsx:855 and the column
   header from board.tsx:1335 — the surfaces that must keep their own fill. */
const BODY = `<div id="root" class="h-full"><section data-contrib-shell class="flex h-full min-w-0 flex-col">`
  + `<div class="relative flex h-full flex-col overflow-hidden bg-(--ui-surface-background)" id="board">`
  + `<div class="mx-4 mb-2 flex flex-col items-start gap-1.5 rounded-lg bg-(--ui-bg-quinary) px-3 py-2.5" id="notice">卡片由代理运行</div>`
  + `<div id="col"><span class="rounded-full bg-(--ui-bg-quaternary) px-1.5 py-px text-[0.625rem] tabular-nums" id="count">35</span></div>`
  + `</div></section></div>`

;(async () => {
  const browser = await launchChromium()
  if (!browser) { console.log('SKIPPED — no Chromium available'); process.exit(0) }
  let failures = 0
  let total = 0
  const check = (name, ok, detail) => {
    total += 1
    if (!ok) failures += 1
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  }

  console.log('\n=== Kanban Surface Suite ===\n')
  const fs = require('fs')
  const os = require('os')
  const path = require('path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-surface-'))
  const file = path.join(dir, 'k.html')
  fs.writeFileSync(file, pageHtml(sheets, BODY))
  const page = await browser.newPage({ viewport: { width: 900, height: 520 }, deviceScaleFactor: 2, colorScheme: 'dark' })
  await page.goto(pathToFileUrl(file))

  const m = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.cssText = 'position:absolute;visibility:hidden;background-color:var(--ui-surface-background)'
    document.body.append(probe)
    const token = getComputedStyle(probe).backgroundColor
    probe.remove()
    const read = id => {
      const cs = getComputedStyle(document.getElementById(id))
      return { bg: cs.backgroundColor, image: cs.backgroundImage.slice(0, 30) }
    }
    return { token, board: read('board'), root: read('root'), notice: read('notice'), count: read('count') }
  })

  const transparent = v => /rgba\(0, 0, 0, 0\)|transparent/.test(v)
  check('the theme token resolves to transparent', transparent(m.token), m.token)
  check('the board root paints nothing of its own', transparent(m.board.bg), m.board.bg)
  check('the board root carries no gradient either', m.board.image === 'none', m.board.image)
  check('the ambient field still paints behind it',
    /radial-gradient/.test(m.root.image), m.root.image)

  console.log('\n[the cards keep their own fill — this is not a flatten-everything change]')
  check('the board notice keeps its surface fill', !transparent(m.notice.bg), m.notice.bg)
  check('a column count chip keeps its surface fill', !transparent(m.count.bg), m.count.bg)

  await browser.close()
  console.log(`\n${failures ? 'FAIL' : 'OK'} — ${total - failures}/${total} assertions`)
  process.exit(failures ? 1 : 0)
})().catch(err => { console.error(err); process.exit(1) })
