/**
 * test/bubble-computed-style.test.js
 *
 * The measured twin of two claim groups that used to be checked by reading the
 * source text in final-ui-polish.test.js. Those checks were shaped like a
 * whole-file substring search for "align-items: flex-end !important" — which
 * proves the string is in the file, not that the declaration reaches the element
 * it is supposed to reach: the assertion never bound the value to its selector,
 * and it ran in 98ms without opening a browser.
 *
 * So this suite stacks the three sheets the live renderer actually loads —
 * Hermes' built CSS, the active skin's customCSS, and this plugin's PLUGIN_CSS
 * (same order as code-card-cascade.test.js) — mirrors the host DOM with the
 * host's own Tailwind classes copied out of the renderer, and reads
 * getComputedStyle. Every measured claim ships with a control page that has
 * the host sheet alone: a claim whose control reads the same as the shipped
 * page is measuring nothing, and the suite says so instead of passing quietly.
 *
 * Host sources for the fixture (classes copied, not invented):
 *   user-message.tsx:75        USER_BUBBLE_BASE_CLASS
 *   user-message.tsx:383-386   .sticky-human-clamp[data-clamped]
 *   user-edit-composer.tsx    [data-slot=aui_edit-composer-root] (class="contents"),
 *                             .composer-human-message-container, .ui-prompt-input__container
 *   app/context-menu          [data-context-menu-skip]
 *   styles.css:1830-1832       the mask this suite has to see cleared
 *
 * Two claims stay textual on purpose, and say so at their call site: the edit
 * root is `display: contents`, which generates no box, so "align-items:
 * flex-end" on it has nothing to align and no computed value to read. Those
 * assertions were narrowed to bind value to selector inside one block, which
 * is the most a text check can honestly do.
 *
 * Skips (exit 0) when the Hermes checkout, a Chromium-family browser, or
 * playwright-core is missing; fails when they are present and paint regressed.
 *   node test/bubble-computed-style.test.js
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')

const skip = reason => {
  console.log(`\n=== Bubble Computed Style Suite: SKIPPED — ${reason} ===\n`)
  process.exit(0)
}

const {
  REPO, DESKTOP, builtCssPath: findBuiltCss, blockScalar,
  pluginCss: pluginCssFrom, launchChromium, skinYamlPath,
} = require('../scripts/lib/sheets')

const builtCssPath = findBuiltCss()
if (!builtCssPath) skip(`no built renderer CSS under ${DESKTOP}/dist or the packaged app`)

const pluginCss = pluginCssFrom(fs.readFileSync(path.join(REPO, 'src', 'plugin.js'), 'utf8'))
assert(pluginCss, 'PLUGIN_CSS could not be extracted from src/plugin.js')

const skinSource = skinYamlPath()
const skinCss = blockScalar(fs.readFileSync(skinSource, 'utf8'), 'customCSS')
assert(skinCss && skinCss.includes('aui_user-message'), `no usable customCSS in ${skinSource}`)

// ---------------------------------------------------------------------------
// Fixtures — host classes verbatim
// ---------------------------------------------------------------------------

/* USER_BUBBLE_BASE_CLASS, user-message.tsx:75. The `--dt-user-bubble` fill is a
   host custom property; the fallback keeps the box filled without the host sheet. */
const BUBBLE_CLASS = 'composer-human-message standalone-glass relative flex w-full min-w-0 max-w-full flex-col gap-1.5 overflow-y-auto rounded-xl border bg-(--dt-user-bubble, #12365f) px-3 py-2 text-left [-webkit-app-region:no-drag]'

const bubble = (id, { expanded }) => `
<div data-slot="aui_user-message-root" data-role="user" id="${id}" class="${BUBBLE_CLASS}"
     ${expanded ? "data-bubbles-user-expanded='true'" : ''}>
  <div class="sticky-human-clamp" data-clamped="true" id="${id}-clamp">
    <div class="min-h-[1.25rem]">一条很长的用户消息，需要折叠显示才能看清末尾。</div>
  </div>
</div>`

/* The real chain around the edit composer, copied from user-message.tsx:422-436:
   user root → [data-slot=aui_user-bubble-actions] → .human-message-with-todos-wrapper
   → [data-context-menu-skip]. The right alignment of the action cluster is the
   skin's `align-self: flex-end` on the ACTION BAR (a real box inside the bubble's
   column flex) and the shrink-wrap is `width: fit-content` on the
   .composer-human-message INSIDE the skip element — not on the skip element, which
   is `relative w-full` in the host. Measuring the skip box itself would have
   "failed" a skin that is in fact correct. */
const FIXTURE = `
<div class="flex w-full min-w-0 flex-col items-stretch" id="turn-read">
  ${bubble('bubble-collapsed', { expanded: false })}
  ${bubble('bubble-expanded', { expanded: true })}
</div>

<div data-slot="aui_user-message-root" data-role="user" class="${BUBBLE_CLASS}" id="turn-bubble">
  <div class="sticky-human-clamp" data-clamped="true" id="turn-clamp">
    <div class="min-h-[1.25rem]">这条消息已经折叠。</div>
  </div>
  <div data-slot="aui_user-bubble-actions" class="relative w-full max-w-full" id="action-bar">
    <div class="human-message-with-todos-wrapper flex w-full flex-col gap-0">
      <div class="relative w-full" data-context-menu-skip id="skip">
        <div class="composer-human-message relative flex w-full min-w-0 flex-col rounded-xl border px-3 py-2" id="skip-composer">折叠时点一下展开全文</div>
        <button type="button" aria-label="More" id="skip-btn">⋯</button>
      </div>
    </div>
  </div>
</div>

<div data-slot="aui_user-message-root" data-role="user" class="${BUBBLE_CLASS}" id="turn-editing"
     data-bubbles-editing="true" data-bubbles-user-expanded="true">
  <div class="contents" data-slot="aui_edit-composer-root" id="edit-root">
    <div class="composer-human-message-container human-execution-message-top relative flex w-full items-start rounded-md bg-(--ui-chat-surface-background, #0e2b52)" data-glass-raised id="edit-box">
      <div class="ui-prompt-input__container relative border-(--ui-stroke-secondary)" data-expanded="true" id="prompt-box">
        <div data-slot="composer-rich-input" id="rich-input">改写这条消息……</div>
      </div>
    </div>
  </div>
</div>`

const page = (withSkin, withPlugin) => `<!doctype html><html data-bubbles-skin='true'><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileURL(builtCssPath).href}">
${withSkin ? `<style id="skin">${skinCss}</style>` : ''}
${withPlugin ? `<style id="plugin">${pluginCss}</style>` : ''}
</head><body style="background:#08192f;margin:0;padding:16px">${FIXTURE}</body></html>`

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

const SCAN = () => {
  const s = (el, pseudo) => getComputedStyle(el, pseudo || null)
  const mask = el => ({
    image: s(el).maskImage,
    webkit: s(el).webkitMaskImage,
  })
  const after = el => {
    const c = s(el, '::after')
    return { display: c.display, content: c.content, bg: c.backgroundColor, bgImage: c.backgroundImage, shadow: c.boxShadow }
  }
  const box = el => {
    const r = el.getBoundingClientRect()
    return { width: Math.round(r.width), right: Math.round(r.right), left: Math.round(r.left) }
  }
  const rich = document.getElementById('rich-input')
  const bubbleEl = document.getElementById('turn-bubble')
  const bs = s(bubbleEl)
  return {
    collapsed: { mask: mask(document.getElementById('bubble-collapsed-clamp')), after: after(document.getElementById('bubble-collapsed-clamp')) },
    expanded: { mask: mask(document.getElementById('bubble-expanded-clamp')), after: after(document.getElementById('bubble-expanded-clamp')) },
    rich: { textAlign: s(rich).textAlign, direction: s(rich).direction },
    bar: {
      ...box(document.getElementById('action-bar')),
      bubble: box(bubbleEl),
      /* The bubble is a padded, bordered box with overflow-y-auto, so "the right
         edge" is the content edge, not the border edge. Carry the inset out so the
         assertion can say how much slack the padding legitimately eats. */
      inset: parseFloat(bs.paddingRight) + parseFloat(bs.borderRightWidth),
    },
    inner: { ...box(document.getElementById('skip-composer')), bar: box(document.getElementById('action-bar')) },
    /* The edit composer: the skin turns the host's `display: contents` root into a
       real flex box, which is the only reason align-items / ::before are meaningful
       there at all — and it is invisible to a text assertion. */
    edit: {
      root: { ...box(document.getElementById('edit-root')), display: s(document.getElementById('edit-root')).display, alignItems: s(document.getElementById('edit-root')).alignItems },
      box: box(document.getElementById('edit-box')),
      prompt: { ...box(document.getElementById('prompt-box')), marginLeft: s(document.getElementById('prompt-box')).marginLeft },
      rootBefore: after(document.getElementById('edit-root')),
    },
  }
}

;(async () => {
  const browser = await launchChromium()
  if (!browser) skip('playwright-core found but no Chromium/Edge/Chrome to launch')

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bubbles-computed-'))
  fs.writeFileSync(path.join(dir, 'host-only.html'), page(false, false))
  fs.writeFileSync(path.join(dir, 'shipped.html'), page(true, true))

  const results = {}
  const p = await browser.newPage({ colorScheme: 'dark', viewport: { width: 820, height: 900 } })
  for (const name of ['host-only', 'shipped']) {
    await p.goto(pathToFileURL(path.join(dir, `${name}.html`)).href)
    results[name] = await p.evaluate(`(${SCAN.toString()})()`)
  }
  await browser.close()

  const host = results['host-only']
  const ship = results['shipped']

  console.log('\n=== Bubble Computed Style Suite ===\n')
  console.log(`sheets: built=${path.basename(builtCssPath)} skin=${skinSource.replace(`${REPO}/`, '')} plugin=${pluginCss.length}b`)

  // The control has to be a control. If the host sheet alone already leaves the
  // mask at `none`, the fixture is not the shape the renderer builds and every
  // claim below would pass without the skin doing anything.
  const noMask = v => v === 'none' || v === 'none none' || v === ''
  if (noMask(host.collapsed.mask.image)) {
    console.log('  ! host-only control shows no mask on .sticky-human-clamp[data-clamped] —')
    console.log('    the host no longer paints one, so this fixture cannot judge the clearing.')
    skip('host no longer masks .sticky-human-clamp — nothing to clear, so nothing to measure')
  }

  // 1. The mask is gone in both states. The user-visible claim is "the fade-out
  //    never happens"; before this suite it rested on two `includes()` calls.
  assert(noMask(ship.collapsed.mask.image),
    `Collapsed clamp must not be masked, got ${ship.collapsed.mask.image.slice(0, 60)}`)
  assert(noMask(ship.collapsed.mask.webkit),
    `Collapsed clamp must clear -webkit-mask-image, got ${ship.collapsed.mask.webkit.slice(0, 60)}`)
  assert(noMask(ship.expanded.mask.image),
    `Expanded clamp must not be masked, got ${ship.expanded.mask.image.slice(0, 60)}`)
  assert(noMask(ship.expanded.mask.webkit),
    `Expanded clamp must clear -webkit-mask-image, got ${ship.expanded.mask.webkit.slice(0, 60)}`)

  // 2. The ::after fade band paints nothing, in both states. A band that is
  //    still mounted and transparent is fine; one that still paints is the bug.
  for (const [state, got] of [['collapsed', ship.collapsed.after], ['expanded', ship.expanded.after]]) {
    assert(got.display === 'none' || (got.bg === 'rgba(0, 0, 0, 0)' && noMask(got.bgImage)),
      `${state} ::after must paint nothing, got display=${got.display} bgImage=${got.bgImage.slice(0, 40)}`)
    assert(noMask(got.shadow) || got.shadow === 'none',
      `${state} ::after must carry no shadow, got ${got.shadow.slice(0, 40)}`)
  }

  // 3. The edit-mode editor keeps its own left alignment inside a right-aligned
  //    composer — the pairing is the whole point, and only measurement shows both.
  assert(ship.rich.textAlign === 'left',
    `Rich input must stay text-align: left, got ${ship.rich.textAlign}`)
  assert(ship.rich.direction === 'ltr',
    `Rich input must stay direction: ltr, got ${ship.rich.direction}`)

  // 4. Geometry, not declarations. The action cluster is snug to the bubble's
  //    right edge — that is `align-self: flex-end` on [data-slot=aui_user-bubble-actions]
  //    doing the work, and it is the only one of the three that can be seen at all.
  //    The right edge means the content edge: px-3 + border, plus whatever the
  //    overflow-y-auto scrollbar reserves, all of which the fixture must allow for
  //    or it fails a skin that is correct.
  assert(ship.bar.width < ship.bar.bubble.width,
    `[data-slot=aui_user-bubble-actions] must shrink to the cluster, got ${ship.bar.width}px inside a ${ship.bar.bubble.width}px bubble`)
  const gap = ship.bar.bubble.right - ship.bar.right
  assert(gap >= 0 && gap <= ship.bar.inset + 2,
    `Action cluster must hug the bubble's right content edge, gap ${gap}px against a ${ship.bar.inset}px padding+border inset`)

  // 5. …and the composer inside the skip element shrink-wraps, which is where
  //    `width: fit-content` actually lives.
  assert(ship.inner.width < ship.inner.bar.width,
    `.composer-human-message inside the skip element must shrink-wrap, got ${ship.inner.width}px inside ${ship.inner.bar.width}px`)

  // 6. The edit composer. `margin-left: auto; margin-right: 0` on
  //    .ui-prompt-input__container is a real, visible effect — the prompt box is
  //    pushed onto the right edge of the edit box — so it is measured as geometry
  //    rather than as the two strings the old text assertion searched for.
  assert(ship.edit.root.display !== 'contents',
    `[data-slot=aui_edit-composer-root] must be a real box, got display: ${ship.edit.root.display}`)
  assert(ship.edit.prompt.width < ship.edit.box.width,
    `.ui-prompt-input__container must shrink-wrap, got ${ship.edit.prompt.width}px inside ${ship.edit.box.width}px`)
  assert(Math.abs(ship.edit.prompt.right - ship.edit.box.right) <= 1,
    `.ui-prompt-input__container must sit on the edit box's right edge, got ${ship.edit.prompt.right} vs ${ship.edit.box.right}`)

  // 7. No duplicate avatar: the suppressed ::before is generated now that the root
  //    is a box, so "there is no second avatar" is a measurement, not a string.
  assert(ship.edit.rootBefore.display === 'none' || ship.edit.rootBefore.content === 'none',
    `Edit root ::before must stay suppressed, got display=${ship.edit.rootBefore.display} content=${ship.edit.rootBefore.content}`)

  console.log(`  control (host sheet only): mask=${host.collapsed.mask.image.slice(0, 42)}…`)
  console.log(`  shipped: collapsed mask=${ship.collapsed.mask.image} expanded mask=${ship.expanded.mask.image}`)
  console.log(`  shipped: rich input text-align=${ship.rich.textAlign} direction=${ship.rich.direction}`)
  console.log(`  shipped: action cluster ${ship.bar.width}px right=${ship.bar.right} (bubble ${ship.bar.bubble.width}px right=${ship.bar.bubble.right})`)
  console.log(`  shipped: composer inside skip ${ship.inner.width}px (cluster ${ship.inner.bar.width}px)`)
  console.log(`  shipped: edit root display=${ship.edit.root.display} align-items=${ship.edit.root.alignItems}`)
  console.log(`  shipped: prompt box ${ship.edit.prompt.width}px right=${ship.edit.prompt.right} (edit box ${ship.edit.box.width}px right=${ship.edit.box.right})`)
  console.log(`  shipped: edit root ::before display=${ship.edit.rootBefore.display} content=${ship.edit.rootBefore.content}`)
  console.log(`\n=== All Bubble Computed Style Assertions Passed Successfully ===\n`)
  console.log(`fixtures kept for DevTools: ${dir}`)
})().catch(err => {
  console.error('\nBUBBLE COMPUTED STYLE VERIFICATION FAILED\n', err.message)
  process.exit(1)
})
