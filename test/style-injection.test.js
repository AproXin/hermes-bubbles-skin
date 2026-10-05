/**
 * test/style-injection.test.js
 *
 * Every pixel suite in this repo renders through sheets.pageHtml(), which writes
 * `data-bubbles-skin='true'` straight into the fixture's <html>. That is the stamp
 * the plugin is supposed to apply at runtime — so if installStyles() broke, or the
 * style element never got inserted, all 30+ suites would stay green while the real
 * window lost every bit of the skin.
 *
 * This suite is the one place that builds the document the way the app does: no
 * stamp in the markup, then the shipped installStyles() runs.
 *   node test/style-injection.test.js
 */

const { loadSheets, launchChromium, pageHtml, pathToFileUrl, pluginScriptForPage } = require('../scripts/lib/sheets')
const fs = require('fs')
const os = require('os')
const path = require('path')

const sheets = loadSheets()
if (sheets.error) { console.log(`SKIPPED — ${sheets.error}`); process.exit(0) }

// The un-stamped document: same three sheets in live order, but no
// data-bubbles-skin attribute and no runtime <style> — the plugin has to add both.
const UNSTAMPED = `<!doctype html><html data-hermes-mode='dark'><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileUrl(sheets.built)}">
<style id="hermes-desktop-custom-css">${sheets.skinCss}</style>
<style>body{margin:0;background:#08192f}</style>
</head><body><div data-slot="aui_user-message-root" class="group/user-message">
<div class="composer-human-message-container"><div class="composer-human-message" id="bubble">一条提问</div></div>
</div></body></html>`

;(async () => {
  const browser = await launchChromium()
  if (!browser) { console.log('SKIPPED — no Chromium available'); process.exit(0) }
  let failures = 0
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bubbles-inject-'))
    const file = path.join(dir, 'u.html')
    fs.writeFileSync(file, UNSTAMPED)
    const page = await browser.newPage({ viewport: { width: 700, height: 240 }, deviceScaleFactor: 1, colorScheme: 'dark' })
    await page.goto(pathToFileUrl(file))

    console.log('\n=== Style Injection Suite ===\n')
    const check = (name, ok, detail) => {
      if (!ok) failures += 1
      console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
    }

    const before = await page.evaluate(() => ({
      stamped: document.documentElement.hasAttribute('data-bubbles-skin'),
      styleEl: !!document.getElementById('hermes-bubbles-skin-runtime-styles'),
      // The bubble's fill only exists under the skin scope, so this measures
      // whether the plugin's stylesheet is actually in force.
      image: getComputedStyle(document.getElementById('bubble')).backgroundImage.slice(0, 24),
    }))
    check('the fixture really is un-stamped', !before.stamped && !before.styleEl)

    await page.addScriptTag({ content: pluginScriptForPage() })
    const after = await page.evaluate(() => {
      const uninstall = installStyles()
      const el = document.getElementById('bubble')
      return {
        stamped: document.documentElement.hasAttribute('data-bubbles-skin'),
        styleEl: !!document.getElementById('hermes-bubbles-skin-runtime-styles'),
        cssLength: document.getElementById('hermes-bubbles-skin-runtime-styles')?.textContent.length || 0,
        image: getComputedStyle(el).backgroundImage,
        uninstall,
      }
    })
    check('installStyles stamps the root', after.stamped)
    check('installStyles injects the runtime sheet', after.styleEl && after.cssLength > 1000,
      `${after.cssLength} chars`)
    check('the skin’s own rules now paint the bubble', /gradient/.test(after.image),
      after.image.slice(0, 46))

    /* installStyles returns its own teardown. Asserting the bubble stops painting
       would be wrong: the skin's customCSS is injected by Hermes only while the
       skin is active, and its selectors are not scoped under the stamp, so it keeps
       painting after the plugin steps out. What the plugin owes is that IT leaves. */
    const gone = await page.evaluate(() => {
      // Re-entering installStyles is idempotent — it finds the sheet by id and
      // returns a teardown for that node. (A closure cannot cross evaluate, so the
      // uninstaller has to be called in the same page context that made it.)
      installStyles()()
      return {
        stamped: document.documentElement.hasAttribute('data-bubbles-skin'),
        styleEl: !!document.getElementById('hermes-bubbles-skin-runtime-styles'),
      }
    })
    check('the returned teardown removes the sheet and the stamp',
      !gone.stamped && !gone.styleEl,
      `stamped=${gone.stamped} sheet=${gone.styleEl}`)
  } finally {
    await browser.close()
  }
  console.log(`\n${failures ? 'FAIL' : 'OK'} — ${5 - failures}/5 assertions`)
  process.exit(failures ? 1 : 0)
})().catch(err => { console.error(err); process.exit(1) })
