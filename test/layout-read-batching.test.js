/**
 * test/layout-read-batching.test.js
 *
 * processDOM's messages stage measures how tall each user bubble is. That read is only
 * free if nothing changed computed style since the previous read — and the stage's own
 * stamps (`data-bubbles-long-user`, the expand button it appends) do change it, because
 * the collapsed max-height is a CSS rule keyed on that attribute. Read-per-message then
 * meant one forced layout per message.
 *
 * Measured before the batch, in a real Chromium: 10 messages cost 9 read-after-write
 * alternations, 40 cost 39. After it, 0 — same number of reads, same number of writes,
 * same clamping outcome.
 *
 * The classification matters and cost a false "0 alternations" on the first run of this
 * suite: an `setAttribute('data-bubbles-…')` and an appended node are writes here, even
 * though neither touches `.style`. Counting only setProperty measured a clean pass
 * because the clamp simply never engaged.
 *   node test/layout-read-batching.test.js
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadSheets, launchChromium, pathToFileUrl, pluginScriptForPage } = require('../scripts/lib/sheets')

const skip = reason => {
  console.log(`\n=== Layout Read Batching Suite: SKIPPED — ${reason} ===\n`)
  process.exit(0)
}

const sheets = loadSheets()
if (sheets.error) skip(sheets.error)

const N = 24
const LONG = '这是一段足够长的提问，用来触发四行以上的折叠判定。'.repeat(24)

/* Mirrored from components/assistant-ui/thread/user-message.tsx:374-448:
   [data-context-menu-skip] > .composer-human-message > .sticky-human-clamp
   > .min-h-[1.25rem]. Without all four levels the plugin clears the decoration and
   returns before ever reading a height, and the suite would measure an inert fixture. */
let MSGS = ''
for (let i = 0; i < N; i += 1) {
  MSGS += `<div data-slot="aui_user-message-root" class="group/user-message" data-message-id="m${i}">`
    + '<div class="composer-human-message-container"><div class="relative w-full" data-context-menu-skip="">'
    + '<div class="composer-human-message wrap-anywhere">'
    + `<div class="sticky-human-clamp" data-clamped="true"><div class="min-h-[1.25rem]"><p class="wrap-anywhere">${LONG}${i}</p></div></div>`
    + '</div></div></div></div>'
}

const PAGE = `<!doctype html><html data-bubbles-skin='true' data-hermes-mode='dark'><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileUrl(sheets.built)}">
<style id="hermes-desktop-custom-css">${sheets.skinCss}</style>
<style id="hermes-bubbles-skin-runtime-styles">${sheets.pluginCss}</style>
<style>body{margin:0;background:#08192f;color:#dfe9f7}</style>
</head><body><div id="transcript" style="width:720px;display:flex;flex-direction:column;gap:14px">${MSGS}</div></body></html>`

;(async () => {
  const browser = await launchChromium()
  if (!browser) skip('playwright-core found but no Chromium/Edge/Chrome to launch')
  const failures = []
  let total = 0
  const check = (name, ok, detail) => {
    total += 1
    if (!ok) failures.push(name)
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bubbles-thrash-'))
  const file = path.join(dir, 't.html')
  fs.writeFileSync(file, PAGE)
  const page = await browser.newPage({ viewport: { width: 780, height: 1200 }, deviceScaleFactor: 1, colorScheme: 'dark' })

  try {
    await page.goto(pathToFileUrl(file))
    await page.addScriptTag({ content: pluginScriptForPage() })

    console.log('\n=== Layout Read Batching Suite ===\n')

    const out = await page.evaluate(() => {
      const log = []
      const push = kind => log.push(kind)

      const rd = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')
      Object.defineProperty(Element.prototype, 'scrollHeight', {
        configurable: true,
        get() { push('R'); return rd.get.call(this) },
      })
      const gbr = Element.prototype.getBoundingClientRect
      Element.prototype.getBoundingClientRect = function patched(...a) { push('R'); return gbr.apply(this, a) }

      for (const m of ['appendChild', 'insertBefore', 'append', 'prepend']) {
        const orig = Node.prototype[m]
        if (!orig) continue
        Node.prototype[m] = function patched(...a) { push('W'); return orig.apply(this, a) }
      }
      const sa = Element.prototype.setAttribute
      Element.prototype.setAttribute = function patched(name, value) {
        if (name === 'style' || name.startsWith('data-bubbles')) push('W')
        return sa.call(this, name, value)
      }
      const sp = CSSStyleDeclaration.prototype.setProperty
      CSSStyleDeclaration.prototype.setProperty = function patched(...a) { push('W'); return sp.apply(this, a) }
      const cn = Object.getOwnPropertyDescriptor(Element.prototype, 'className')
      Object.defineProperty(Element.prototype, 'className', {
        configurable: true,
        get() { return cn.get.call(this) },
        set(v) { push('W'); cn.set.call(this, v) },
      })

      const take = () => { const l = log.slice(); log.length = 0; return l }
      const count = (l, k) => l.filter(x => x === k).length
      /* A read that follows a write forces the engine to lay out again. Reads inside one
         batch (no write between) are one layout for the whole batch. */
      const alternations = l => {
        let n = 0
        let sawR = false
        let sawW = false
        for (const e of l) {
          if (e === 'R') { if (sawR && sawW) n += 1; sawR = true } else if (e === 'W' && sawR) sawW = true
        }
        return n
      }

      take()
      processDOM()
      const pass1 = take()
      processDOM()
      const pass2 = take()

      const roots = [...document.querySelectorAll('[data-slot="aui_user-message-root"]')]
      const clamped = roots.filter(r => r.getAttribute('data-bubbles-long-user') === 'true')
      const firstClamp = clamped[0]?.querySelector('.sticky-human-clamp')
      const box = firstClamp ? firstClamp.getBoundingClientRect() : null
      return {
        pass1: { reads: count(pass1, 'R'), writes: count(pass1, 'W'), alternations: alternations(pass1) },
        pass2: { reads: count(pass2, 'R'), writes: count(pass2, 'W'), alternations: alternations(pass2) },
        roots: roots.length,
        clamped: clamped.length,
        clampedHeight: box ? Math.round(box.height) : null,
      }
    })

    check(`the fixture engages the clamp path (${out.clamped}/${out.roots} bubbles stamped)`,
      out.clamped === out.roots && out.clamped > 0,
      `stamped ${out.clamped} of ${out.roots}`)
    check('  and the collapsed bubble really is height-limited', out.clampedHeight !== null && out.clampedHeight > 0,
      `first clamped clamp measures ${out.clampedHeight}px tall`)
    check('one height read per message in the first pass', out.pass1.reads === out.roots,
      `reads=${out.pass1.reads} for ${out.roots} messages`)
    check('  and the pass does write (stamps + the expand button)', out.pass1.writes > 0,
      `writes=${out.pass1.writes}`)
    check('NO read follows a write in the first pass', out.pass1.alternations === 0,
      `alternations=${out.pass1.alternations} (measured ${out.roots - 1} before the batch)`
    )
    check('the second pass writes nothing (idempotent, not looping)', out.pass2.writes === 0,
      `writes=${out.pass2.writes}`)
    check('  and still no forced layout from a stale read', out.pass2.alternations === 0,
      `alternations=${out.pass2.alternations}`)

    console.log(`\n${failures.length ? 'FAIL' : 'OK'} — ${total - failures.length}/${total} assertions`
      + ` (pass1: ${out.pass1.reads} reads / ${out.pass1.writes} writes / ${out.pass1.alternations} forced reflows)`)
    if (failures.length) console.log(`failed: ${failures.join('; ')}`)
  } finally {
    await browser.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
  process.exit(failures.length ? 1 : 0)
})().catch(err => {
  console.error(`FAIL — ${err.message}`)
  process.exit(1)
})
