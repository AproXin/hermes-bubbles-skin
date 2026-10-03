/**
 * test/observer-trigger-scope.test.js
 *
 * setupObserver() watches `document.body` for childList+subtree AND attributes, with
 * `class` in its attributeFilter. `class` is the attribute the app changes most —
 * hover, focus rings, every Tailwind state toggle — so each of those enqueues a
 * mutation record and runs the callback, which then does an isElement check plus two
 * `closest()` walks to conclude "not mine".
 *
 * Nothing measured that before this suite existed: the two audit suites that touch the
 * observer stub it out with a mock, so they cannot see which mutations cost a callback
 * or a re-pass. This one runs the shipped `setupObserver` in a real Chromium against a
 * mirrored DOM and counts:
 *
 *   - `stats.observerCallbacks`  — did the filter let the mutation through at all
 *   - `requestAnimationFrame` calls — did it buy a re-pass (a real DOM sweep)
 *
 * The re-pass assertions are equality checks against 1, not ">= 1": a pass that fires
 * twice per change is as wrong as one that never fires, and the plugin coalesces via
 * `isScheduled`, so 1 is the only correct answer.
 *   node test/observer-trigger-scope.test.js
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadSheets, launchChromium, pathToFileUrl, pluginScriptForPage } = require('../scripts/lib/sheets')

const skip = reason => {
  console.log(`\n=== Observer Trigger Scope Suite: SKIPPED — ${reason} ===\n`)
  process.exit(0)
}

const sheets = loadSheets()
if (sheets.error) skip(sheets.error)

/* Mirrored from the host's own slots (apps/desktop/src/components/chat + sidebar):
   a sidebar session row shell, an assistant message root, a task status row, the rich
   input the callback is told to ignore, and one ordinary container whose class churn
   is the noise being measured. */
const BODY = `<div data-slot="app-shell">
<aside data-slot="sidebar"><div class="flex flex-col gap-1">
<div id="row" class="row-hover group/row flex items-center gap-2 rounded-lg px-2" title="会话">
<span class="truncate">昨晚的重构分支</span><div data-row-actions class="hidden group-hover/row:flex"><button>⋯</button></div>
</div></div></aside>
<main id="transcript">
<div data-slot="aui_assistant-message-root" class="group/message">
<div data-slot="aui_assistant-message-content" class="wrap-anywhere min-w-0 max-w-full">正在整理答案</div>
</div>
<div id="noise" class="flex items-center gap-1 text-muted-foreground"><span>附件</span></div>
<div id="noisefarm"></div>
</main>
<div data-slot="composer-status-stack">
<div data-slot="status-section"><div data-slot="status-row" class="status-row flex items-center gap-2"><div class="status-row-icon">✓</div><span>已完成</span></div></div>
</div>
<div data-slot="composer-surface"><div data-slot="composer-rich-input" contenteditable="true" id="editor"><p>写到一半的问题</p></div></div>
</div>`

const PAGE = `<!doctype html><html data-bubbles-skin='true' data-hermes-mode='dark'><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileUrl(sheets.built)}">
<style id="hermes-desktop-custom-css">${sheets.skinCss}</style>
<style id="hermes-bubbles-skin-runtime-styles">${sheets.pluginCss}</style>
<style>body{margin:0;background:#08192f}</style>
</head><body>${BODY}</body></html>`

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

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bubbles-observer-'))
  const file = path.join(dir, 'o.html')
  fs.writeFileSync(file, PAGE)
  const page = await browser.newPage({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' })

  try {
    await page.goto(pathToFileUrl(file))
    await page.addScriptTag({ content: pluginScriptForPage() })

    console.log('\n=== Observer Trigger Scope Suite ===\n')

    // Arm the counters and start the observer exactly the way register() does.
    /* The farm is filled BEFORE the observer is armed: 200 distinct elements each
       changing class is 200 mutation records, while toggling ONE element 200 times
       coalesces into a single record (same target, same attribute, one checkpoint) —
       measured, and it is why this scenario does not use one element. */
    const armed = await page.evaluate(() => {
      const farm = document.getElementById('noisefarm')
      for (let i = 0; i < 200; i += 1) {
        const d = document.createElement('span')
        d.className = 'tile'
        farm.appendChild(d)
      }
      window.__rafCalls = 0
      window.__closest = 0
      window.__realRaf = window.requestAnimationFrame.bind(window)
      window.requestAnimationFrame = cb => { window.__rafCalls += 1; return window.__realRaf(cb) }
      /* Every record the callback admits costs two `closest()` walks (the rich-input
         ignore test and the own-widgets ignore test). Counting them measures the
         per-record price directly — and attribution is clean in the noise scenarios,
         where no re-pass runs and so no other code calls closest(). */
      const realClosest = Element.prototype.closest
      Element.prototype.closest = function patched(sel) {
        window.__closest += 1
        return realClosest.call(this, sel)
      }
      setupObserver({ storage: null })
      /* setupObserver() arms itself with an immediate pass, and that pass runs inside
         the very first animation frame. Count it, then wait it out so `isScheduled` is
         clear before the first scenario. */
      return { initialPass: window.__rafCalls, callbacks: stats.observerCallbacks }
    })
    check('setupObserver starts with its own immediate pass', armed.initialPass === 1,
      `raf calls at arm time: ${armed.initialPass}`)
    await page.evaluate(() => new Promise(res => window.__realRaf(() => window.__realRaf(res))))

    /* One scenario: mutate, let the microtask checkpoint run the observer callback,
       then read how much it cost before flushing the pass (if any) so the coalescing
       flag is clear again. */
    const scenario = (name, mutate) => page.evaluate(async ([_n, code]) => {
      const before = {
        body: stats.observerCallbacks,
        side: stats.sidebarClassCallbacks,
        r: window.__rafCalls,
        k: window.__closest,
      }
      // eslint-disable-next-line no-eval
      new Function(code)()
      await new Promise(res => window.__realRaf(() => window.__realRaf(res)))
      return {
        body: stats.observerCallbacks - before.body,
        side: stats.sidebarClassCallbacks - before.side,
        callbacks: (stats.observerCallbacks - before.body) + (stats.sidebarClassCallbacks - before.side),
        passes: window.__rafCalls - before.r,
        walks: window.__closest - before.k,
      }
    }, [name, mutate])

    console.log('[what must still buy a re-pass]')
    const rowClass = await scenario('row class', `
      const el = document.getElementById('row')
      el.classList.toggle('bg-(--ui-row-active-background)')`)
    check('a sidebar row class change → exactly one re-pass', rowClass.passes === 1,
      `body=${rowClass.body} sidebar=${rowClass.side} passes=${rowClass.passes}`)
    /* Which watcher answers it is the design: `class` is no longer in the body-wide
       attributeFilter, so a body callback here means someone put it back and the noise
       is being paid for again. */
    check('  and the sidebar watcher answers it, not the body-wide one',
      rowClass.side === 1 && rowClass.body === 0,
      `body=${rowClass.body} sidebar=${rowClass.side}`)

    const streaming = await scenario('streaming', `
      const el = document.querySelector('[data-slot="aui_assistant-message-root"]')
      el.setAttribute('data-streaming', 'true')`)
    check('data-streaming on a message root → one re-pass', streaming.passes === 1,
      `callbacks=${streaming.callbacks} passes=${streaming.passes}`)

    const appended = await scenario('tool block', `
      const b = document.createElement('div')
      b.setAttribute('data-slot', 'tool-block')
      b.className = 'mb-1'
      document.getElementById('transcript').appendChild(b)`)
    check('a new tool block in the transcript → one re-pass', appended.passes === 1,
      `callbacks=${appended.callbacks} passes=${appended.passes}`)

    const aria = await scenario('aria-selected', `
      const el = document.getElementById('row')
      el.setAttribute('aria-selected', 'true')`)
    check('aria-selected on the row → one re-pass, through the body watcher',
      aria.passes === 1 && aria.body === 1,
      `body=${aria.body} sidebar=${aria.side} passes=${aria.passes}`)

    console.log('\n[what the narrowed filter refuses to admit]')
    const noise = await scenario('noise class', `
      const el = document.getElementById('noise')
      el.classList.toggle('text-muted-foreground')`)
    check('a plain container class change costs no re-pass', noise.passes === 0,
      `callbacks=${noise.callbacks} passes=${noise.passes}`)
    check('  and no callback either — outside the sidebar, class is not watched at all',
      noise.callbacks === 0, `body=${noise.body} sidebar=${noise.side}`)

    const typing = await scenario('editor class', `
      const el = document.getElementById('editor')
      el.classList.toggle('ring-1')`)
    check('a change inside the rich input is ignored, no re-pass', typing.passes === 0,
      `callbacks=${typing.callbacks} passes=${typing.passes}`)

    /* Volume, not correctness: what a body-wide `class` watch used to cost. The honest
       unit is distinct elements — one element changed 200 times coalesces into ONE
       record (same target, same attribute, one checkpoint), which is what the first run
       of this suite measured and corrected. */
    const volume = await scenario('200 distinct elements change class', `
      const kids = document.querySelectorAll('#noisefarm .tile')
      for (const el of kids) el.classList.toggle('hover-state')`)
    check('200 unrelated class changes cost NO re-pass', volume.passes === 0,
      `callbacks=${volume.callbacks} passes=${volume.passes}`)
    check('  and no ancestor walk either (800 walks measured before the narrowing)',
      volume.walks === 0,
      `closest() walks spent on noise: ${volume.walks}`)

    console.log('\n[control: the observer still works after that storm]')
    const after = await scenario('row class again', `
      document.getElementById('row').classList.toggle('bg-(--ui-row-active-background)')`)
    check('one more row change still buys its re-pass', after.passes === 1,
      `body=${after.body} sidebar=${after.side} passes=${after.passes}`)

    /* The scoped watcher has to survive the sidebar going away and coming back, which is
       what actually happens: the app mounts the sidebar after the plugin registers, and
       React can replace the whole element. The re-attach lives in the sidebar stage of
       processDOM, so this exercises it rather than the setup-time call. */
    const remount = await scenario('sidebar replaced, then a row changes class', `
      const aside = document.querySelector('[data-slot="sidebar"]')
      const replacement = aside.cloneNode(true)
      aside.replaceWith(replacement)
      globalThis.__newRow = replacement.querySelector('#row')`)
    check('  the replacement mount itself costs one re-pass', remount.passes === 1,
      `body=${remount.body} sidebar=${remount.side} passes=${remount.passes}`)
    const afterRemount = await scenario('row class after remount', `
      globalThis.__newRow.classList.toggle('bg-(--ui-row-active-background)')`)
    check('and a row inside the NEW sidebar still reaches the re-attached watcher',
      afterRemount.passes === 1 && afterRemount.side === 1,
      `body=${afterRemount.body} sidebar=${afterRemount.side} passes=${afterRemount.passes}`)

    console.log(`\n${failures.length ? 'FAIL' : 'OK'} — ${total - failures.length}/${total} assertions`
      + ` (noise cost: ${volume.callbacks} callback(s), ${volume.walks} ancestor walk(s), ${volume.passes} re-pass)`)
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
