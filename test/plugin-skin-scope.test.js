/**
 * test/plugin-skin-scope.test.js
 *
 * The plugin used to install itself into whatever window loaded it, so a user who
 * switched to another skin kept our runtime sheet, our `data-bubbles-skin` root stamp
 * and every `data-bubbles-*` attribute: a skin they never chose was repainted by ours.
 * Hermes names the live skin on `<html>` (apps/desktop/src/themes/context.tsx:239) and
 * re-themes the SAME document when it changes, without a reload — so the guard has to
 * both refuse at start and react while running.
 *
 * This drives the shipped entry point (`__bubblesPlugin.register`) in a real DOM with a
 * real MutationObserver, because the switch is the behaviour worth proving: a fake
 * observer never fires, and a source-text check would only prove the call is written.
 *   node test/plugin-skin-scope.test.js
 */

const { launchChromium, pathToFileUrl, pluginScriptForPage } = require('../scripts/lib/sheets')
const fs = require('fs')
const os = require('os')
const path = require('path')

const SHEET_ID = 'hermes-bubbles-skin-runtime-styles'

// One real user-message root, so a mounted pass has something to stamp and an
// unmounted or torn-down plugin has something to leave un-stamped.
const PAGE = `<!doctype html><html data-hermes-mode='dark'><head><meta charset="utf-8">
<style>body{margin:0;background:#08192f}</style></head><body>
<div data-slot="aui_user-message-root" class="group/user-message">
<div class="composer-human-message-container"><div class="composer-human-message">一条提问 ✦</div></div>
</div></body></html>`

const read = page => page.evaluate(([id]) => {
  const stats = globalThis.__hermesBubblesSkinStats || {}
  return {
    stamped: document.documentElement.hasAttribute('data-bubbles-skin'),
    buildStamped: document.documentElement.hasAttribute('data-bubbles-build'),
    sheet: !!document.getElementById(id),
    enhanced: typeof stats.enhancedMessages === 'number' ? stats.enhancedMessages : -1,
    leftBehind: document.querySelectorAll(
      '[data-bubbles-user-message], [data-bubbles-assistant-message], [data-bubbles-long-user]',
    ).length,
  }
}, [SHEET_ID])

async function openPage(browser, { theme = null, localSkin = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bubbles-scope-'))
  const file = path.join(dir, 's.html')
  fs.writeFileSync(file, PAGE)
  const page = await browser.newPage({ viewport: { width: 620, height: 260 }, colorScheme: 'dark' })
  const logs = []
  page.on('console', msg => logs.push(msg.text()))
  await page.goto(pathToFileUrl(file))
  // Both host signals are set before the plugin module runs, as they are in the app:
  // the attribute by ThemeProvider, `localSkin` by the preload.
  await page.evaluate(({ theme, localSkin }) => {
    if (theme) document.documentElement.setAttribute('data-hermes-theme', theme)
    if (localSkin) globalThis.hermesDesktop = { localSkin: { skin: { name: localSkin } } }
  }, { theme, localSkin })
  await page.addScriptTag({ content: pluginScriptForPage() })
  return { page, logs }
}

const register = page => page.evaluate(() => globalThis.__bubblesPlugin.register({}))

// A skin switch lands through the MutationObserver callback, which runs after the
// attribute write; two frames is enough for the callback and the pass it schedules.
const settled = page => page.evaluate(() => new Promise(resolve => {
  requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))
}))

;(async () => {
  const browser = await launchChromium()
  if (!browser) { console.log('SKIPPED — no Chromium available'); process.exit(0) }
  let failures = 0
  const check = (name, ok, detail) => {
    if (!ok) failures += 1
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  }

  try {
    console.log('\n=== Plugin Skin Scope Suite ===\n')

    // 1-3. Cold start on someone else's skin: nothing at all may land.
    const away = await openPage(browser, { theme: 'default' })
    await register(away.page)
    await settled(away.page)
    const awayState = await read(away.page)
    check('foreign skin: no runtime stylesheet injected', !awayState.sheet)
    check('foreign skin: no root stamp, no build stamp',
      !awayState.stamped && !awayState.buildStamped,
      `stamped=${awayState.stamped} build=${awayState.buildStamped}`)
    check('foreign skin: no pass ran, no attribute left on the transcript',
      awayState.enhanced === 0 && awayState.leftBehind === 0,
      `enhanced=${awayState.enhanced} stampedNodes=${awayState.leftBehind}`)
    check('foreign skin: the skip is said out loud, naming the skin',
      away.logs.some(l => l.includes('not activated') && l.includes("'default'")),
      away.logs.filter(l => l.includes('bubbles')).join(' | ').slice(0, 120))

    // 4-5. Switching INTO bubbles re-themes this same window, so the plugin has to
    // mount without a reload — and mount fully.
    await away.page.evaluate(() => document.documentElement.setAttribute('data-hermes-theme', 'bubbles'))
    await settled(away.page)
    const liveState = await read(away.page)
    check('switch to bubbles: mounts in the live window', liveState.sheet && liveState.stamped)
    check('switch to bubbles: the transcript really got processed',
      liveState.enhanced >= 1 && liveState.leftBehind >= 1,
      `enhanced=${liveState.enhanced} stampedNodes=${liveState.leftBehind}`)

    // 6-7. Switching back out must take everything with it, including the attributes
    // the passes stamped on host nodes.
    await away.page.evaluate(() => document.documentElement.setAttribute('data-hermes-theme', 'codex'))
    await settled(away.page)
    const goneState = await read(away.page)
    check('switch away again: sheet and root stamp removed',
      !goneState.sheet && !goneState.stamped && !goneState.buildStamped,
      `sheet=${goneState.sheet} stamped=${goneState.stamped}`)
    check('switch away again: no data-bubbles-* debris left on host nodes',
      goneState.leftBehind === 0, `${goneState.leftBehind} nodes still stamped`)
    check('switch away again: the teardown is logged',
      away.logs.some(l => l.includes('deactivated') && l.includes("'codex'")),
      away.logs.filter(l => l.includes('deactivated')).join(' | ').slice(0, 120))

    // 8. A host that names no skin must keep working — refusing there would take the
    // skin away from an older build instead of protecting another one.
    const unknown = await openPage(browser)
    await register(unknown.page)
    await settled(unknown.page)
    const unknownState = await read(unknown.page)
    check('a document with no skin name still installs (older host not broken)',
      unknownState.sheet && unknownState.stamped)

    // 9-10. The preload signal answers before the first theme write, and it is enough
    // on its own to decide.
    const preloaded = await openPage(browser, { localSkin: 'codex' })
    const decided = await preloaded.page.evaluate(() => ({
      name: activeSkinName(),
      accepts: skinAcceptsBubbles(),
    }))
    check('preload localSkin alone identifies the live skin',
      decided.name === 'codex' && decided.accepts === false,
      `name=${decided.name} accepts=${decided.accepts}`)
    await register(preloaded.page)
    await settled(preloaded.page)
    const preloadedState = await read(preloaded.page)
    check('preload localSkin alone is enough to stay out',
      !preloadedState.sheet && !preloadedState.stamped)
  } finally {
    await browser.close()
  }

  console.log(`\n${failures ? 'FAIL' : 'OK'} — ${12 - failures}/12 assertions`)
  process.exit(failures ? 1 : 0)
})().catch(err => { console.error(err); process.exit(1) })
