/**
 * test/code-card-cascade.test.js
 *
 * Native CodeCard CASCADE verification (headless browser)
 *
 * Why this exists next to code-card-flatten.test.js: that suite proves the CSS
 * text is present, but the code-card bug class is specifically "the rule is in
 * the file and the pixels never change". Three separate cascade mechanisms were
 * involved, and none of them can be checked by reading the source:
 *
 *   1. CodeCardBody ships [&_pre]:bg-transparent!. Tailwind puts utilities in
 *      @layer utilities, and for !important declarations a layered rule beats an
 *      unlayered one regardless of specificity — so a background on a `pre`
 *      inside a card silently never paints. The frame has to live on the card.
 *   2. The ExpandableBlock overflow cue is a background-image gradient coloured
 *      by --expandable-fade-from. It reads as a drop shadow and box-shadow:none
 *      cannot touch it.
 *   3. [data-streaming='true'] glows through the code-card-stream-glow
 *      @keyframes. Animations outrank normal declarations but lose to
 *      !important.
 *
 * So this suite assembles the three sheets the live renderer actually stacks —
 * Hermes' built CSS, the active skin's customCSS, and this plugin's PLUGIN_CSS —
 * mirrors the real CodeCard DOM with its Tailwind classes intact, and asserts on
 * getComputedStyle.
 *
 * Skips (exit 0) when the Hermes checkout, a Chromium-family browser, or
 * playwright-core is unavailable; fails when they are present and the cascade
 * regressed. Run directly to get the fixture paths for DevTools:
 *   node test/code-card-cascade.test.js
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')

const HOME = os.homedir()
const HERMES_HOME = process.env.HERMES_HOME || path.join(HOME, '.hermes')
const DESKTOP = path.join(HERMES_HOME, 'hermes-agent', 'apps', 'desktop')
const REPO = path.join(__dirname, '..')

const skip = reason => {
  console.log(`\n=== CodeCard Cascade Suite: SKIPPED — ${reason} ===\n`)
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Resolve the three stylesheets
// ---------------------------------------------------------------------------

/** Newest built stylesheet: dist/ first, then the packaged app copy. */
/* Sheet resolution lives in scripts/lib/sheets.js — one copy of these paths, so a
   test cannot drift from what the renderer actually loads. */
const { builtCssPath: findBuiltCss, blockScalar, pluginCss: pluginCssFrom, launchChromium, skinYamlPath } = require('../scripts/lib/sheets')

const builtCssPath = findBuiltCss()
if (!builtCssPath) skip(`no built renderer CSS under ${DESKTOP}/dist or the packaged app`)

const pluginCss = pluginCssFrom(fs.readFileSync(path.join(REPO, 'src', 'plugin.js'), 'utf8'))
assert(pluginCss, 'PLUGIN_CSS could not be extracted from src/plugin.js')

// The live skin wins over the repo copy: that is the sheet the renderer loads.
// Resolved by sheets.js so the five copies this file used to duplicate cannot drift.
const skinSource = skinYamlPath()
const skinCss = blockScalar(fs.readFileSync(skinSource, 'utf8'), 'customCSS')
assert(skinCss && skinCss.includes('aui_assistant-message'), `no usable customCSS in ${skinSource}`)

// ---------------------------------------------------------------------------
// The real CodeCard DOM, classes and all (code-card.tsx / expandable-block.tsx
// / shiki-highlighter.tsx), plus a bare pre outside any card as a scope control
// ---------------------------------------------------------------------------

const CODE = 'function statusTone(status) {\n  return status === \'error\' &amp;&amp; \'text-destructive\'\n}'

const CARD_HTML = `
<div data-slot="aui_assistant-message-content" class="wrap-anywhere min-w-0 max-w-full overflow-hidden text-pretty text-[length:var(--conversation-text-font-size)] text-foreground">
  <div class="aui-md prose w-full max-w-none overflow-hidden">
    <div data-streamdown="code-block">
      <div data-slot="code-card" class="group/code relative min-w-0 max-w-full overflow-hidden rounded-[0.625rem] bg-(--ui-bg-editor) [--expandable-fade-from:var(--ui-bg-editor)] text-[length:var(--conversation-tool-font-size)] text-muted-foreground">
        <div data-slot="code-card-body" class="font-mono text-[0.7rem] leading-relaxed text-foreground/90 [&_pre]:m-0 [&_pre]:overflow-x-auto [&_pre]:bg-transparent! [&_pre]:px-3 [&_pre]:py-2.5 [&_pre]:font-mono [&_pre]:leading-relaxed">
          <div class="relative">
            <div class="scrollbar-overlay overflow-y-auto overflow-x-auto max-h-[7.5rem]">
              <pre class="aui-shiki m-0 overflow-hidden bg-transparent p-0"><pre class="shiki"><code>${CODE}</code></pre></pre>
            </div>
            <div class="pointer-events-none absolute inset-x-0 bottom-0 flex h-7 justify-end bg-linear-to-t from-[var(--expandable-fade-from,var(--ui-chat-surface-background))] to-transparent">
              <button type="button" aria-expanded="false" aria-label="Expand" class="pointer-events-auto flex h-7 w-9 cursor-pointer items-end justify-center pb-1 text-muted-foreground/70"><svg width="14" height="14"></svg></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`

const BARE_PRE_HTML = CARD_HTML.replace('data-slot="aui_assistant-message-content"', 'data-slot="aui_assistant-message-content" data-probe="card"') + `
<div data-slot="aui_assistant-message-content" data-probe="bare">
  <div class="aui-md prose w-full max-w-none overflow-hidden"><pre>plain fence</pre></div>
</div>`

const page = withPlugin => `<!doctype html><html data-bubbles-skin='true'><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileURL(builtCssPath).href}">
<style id="skin">${skinCss}</style>
${withPlugin ? `<style id="plugin">${pluginCss}</style>` : ''}
</head><body style="background:#08192f">${BARE_PRE_HTML}</body></html>`

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bubbles-cascade-'))
fs.writeFileSync(path.join(dir, 'native-only.html'), page(false))
fs.writeFileSync(path.join(dir, 'with-plugin.html'), page(true))

// ---------------------------------------------------------------------------
// Scan computed styles
// ---------------------------------------------------------------------------

const SCAN = () => {
  const card = document.querySelector('[data-slot="code-card"]')
  const bare = document.querySelector('[data-probe="bare"] pre')
  const s = el => getComputedStyle(el)
  const frame = el => {
    const c = s(el)
    const opaque = c.backgroundColor !== 'rgba(0, 0, 0, 0)' && c.backgroundColor !== 'transparent'
    const bordered = parseFloat(c.borderTopWidth) > 0 && c.borderTopStyle !== 'none'
    const graded = c.backgroundImage !== 'none'
    const shadowed = c.boxShadow !== 'none'
    return opaque || bordered || graded || shadowed
  }
  const inside = [card, ...card.querySelectorAll('*')].filter(frame)
  return {
    card: { bg: s(card).backgroundColor, border: s(card).borderTopWidth, radius: s(card).borderTopLeftRadius, shadow: s(card).boxShadow, fadeFrom: s(card).getPropertyValue('--expandable-fade-from').trim() },
    outerPre: { bg: s(card.querySelector('.aui-shiki')).backgroundColor, border: s(card.querySelector('.aui-shiki')).borderTopWidth, padRight: s(card.querySelector('.aui-shiki')).paddingRight },
    innerPre: { bg: s(card.querySelector('pre.shiki')).backgroundColor, border: s(card.querySelector('pre.shiki')).borderTopWidth, padRight: s(card.querySelector('pre.shiki')).paddingRight },
    fade: { bgImage: s(card.querySelector('div[class*="bg-linear-to-t"]')).backgroundImage, bg: s(card.querySelector('div[class*="bg-linear-to-t"]')).backgroundColor, visible: s(card.querySelector('div[class*="bg-linear-to-t"]')).display },
    bubble: { bg: s(document.querySelector('[data-probe="card"]')).backgroundColor, bgImage: s(document.querySelector('[data-probe="card"]')).backgroundImage, shadow: s(document.querySelector('[data-probe="card"]')).boxShadow },
    barePre: { bg: s(bare).backgroundColor, border: s(bare).borderTopWidth },
    framesInsideCard: inside.map(el => el.getAttribute('data-slot') || el.tagName.toLowerCase()),
  }
}

async function launch() { return launchChromium() }

;(async () => {
  const browser = await launch()
  if (!browser) skip('playwright-core found but no Chromium/Edge/Chrome to launch')

  const results = {}
  const page = await browser.newPage({ colorScheme: 'dark', viewport: { width: 820, height: 620 } })
  for (const name of ['native-only', 'with-plugin']) {
    await page.goto(pathToFileURL(path.join(dir, `${name}.html`)).href)
    results[name] = await page.evaluate(`(${SCAN.toString()})()`)
  }

  // Streaming glow: the @keyframes runs, so only !important can silence it.
  await page.goto(pathToFileURL(path.join(dir, 'with-plugin.html')).href)
  const glow = await page.evaluate(() => {
    const c = document.querySelector('[data-slot="code-card"]')
    c.setAttribute('data-streaming', 'true')
    const out = { shadow: getComputedStyle(c).boxShadow, animation: getComputedStyle(c).animationName }
    c.removeAttribute('data-streaming')
    return out
  })

  // The ∨ toggle must still be the thing under the cursor.
  const box = await page.locator('[data-slot="code-card"] div[class*="bg-linear-to-t"] button').boundingBox()
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label') ?? null,
    [box.x + box.width / 2, box.y + box.height / 2])
  await browser.close()

  const f = results['with-plugin']
  const n = results['native-only']

  console.log('\n=== CodeCard Cascade Suite ===\n')
  console.log(`sheets: built=${path.basename(builtCssPath)} skin=${path.relative(HOME, skinSource)} plugin=${pluginCss.length}b`)
  console.log(`before (native+skin, no plugin): frames inside card = ${JSON.stringify(n.framesInsideCard)}`)
  console.log(`after  (with plugin):            frames inside card = ${JSON.stringify(f.framesInsideCard)}`)

  // 1. Exactly one container paints inside the card, and it is the card.
  assert.deepStrictEqual(f.framesInsideCard, ['code-card'],
    `Exactly one element may paint inside a code card, got ${JSON.stringify(f.framesInsideCard)}`)
  assert(/rgba\(6, 20, 42/.test(f.card.bg), `The card must paint the single frame, got ${f.card.bg}`)
  assert(parseFloat(f.card.border) === 1, `The card must carry the single border, got ${f.card.border}`)
  assert(f.card.shadow === 'none', `The card must have no shadow, got ${f.card.shadow}`)
  assert(f.card.fadeFrom === 'transparent',
    `--expandable-fade-from must be neutralised at the card, got ${f.card.fadeFrom}`)

  // 2. The regression this whole bug turned on: painting a `pre` inside the card
  //    loses to CodeCardBody's layered !important, so the frame must not move.
  assert(f.card.bg !== 'rgba(0, 0, 0, 0)',
    'Frame must sit on the card; on a pre it loses to @layer utilities !important')

  // 3. Both nested pre levels are flat, and the corridor is counted once.
  for (const [label, pre] of [['outer .aui-shiki', f.outerPre], ['inner pre.shiki', f.innerPre]]) {
    assert(pre.bg === 'rgba(0, 0, 0, 0)', `${label} must stay transparent, got ${pre.bg}`)
    assert(parseFloat(pre.border) === 0, `${label} must draw no border, got ${pre.border}`)
  }
  assert(parseFloat(f.outerPre.padRight) === 52 && parseFloat(f.innerPre.padRight) === 0,
    `52px copy corridor must apply once, got outer=${f.outerPre.padRight} inner=${f.innerPre.padRight}`)

  // 4. The fade band stops painting but keeps its layout and its toggle.
  assert(f.fade.bgImage === 'none', `Fade band must paint no gradient, got ${f.fade.bgImage.slice(0, 60)}`)
  assert(f.fade.visible !== 'none', 'Fade band must stay mounted so the ∨ toggle survives')
  assert(hit === 'Expand', `∨ toggle must stay clickable, hit target was ${JSON.stringify(hit)}`)
  assert(n.fade.bgImage !== 'none', 'Fixture sanity: the fade must paint without the plugin')

  // 5. Streaming glow silenced while the keyframes still run.
  assert(glow.animation.includes('code-card-stream-glow'), `Expected the glow keyframes to run, got ${glow.animation}`)
  assert(glow.shadow === 'none', `!important must beat the animation, got ${glow.shadow}`)

  // 6. Hard constraint: the conversation bubble keeps its own glass.
  assert(n.bubble.bg === f.bubble.bg,
    `Bubble background must be untouched, ${n.bubble.bg} -> ${f.bubble.bg}`)
  assert(n.bubble.bgImage === f.bubble.bgImage,
    'Bubble gradient must be untouched')
  assert(f.bubble.bg !== 'rgba(0, 0, 0, 0)', 'Bubble must still be filled')

  // 7. Scope: a pre outside a code card keeps the blanket treatment.
  assert(/rgba\(6, 20, 42/.test(f.barePre.bg), `Bare pre must keep its own slab, got ${f.barePre.bg}`)
  assert(parseFloat(f.barePre.border) === 1, `Bare pre must keep its border, got ${f.barePre.border}`)

  console.log('\n=== All CodeCard Cascade Assertions Passed Successfully ===\n')
  console.log(`fixtures kept for DevTools: ${dir}`)
})().catch(err => {
  console.error('\nCASCADE VERIFICATION FAILED\n', err.message)
  console.error(`fixtures: ${dir}`)
  process.exit(1)
})
