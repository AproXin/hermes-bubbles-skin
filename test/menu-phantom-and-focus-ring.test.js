/**
 * test/menu-phantom-and-focus-ring.test.js
 *
 * Two boxes that do not fit what they mark.
 *
 * 1. The dropdown rescue in the skin. It exists to keep an open menu above the
 *    composer, but it used to say `display:block; visibility:visible; opacity:1`
 *    for EVERY [data-slot='select-content']. `!important` author rules outrank a
 *    running CSS animation, so that could freeze a panel mid-fade instead of
 *    letting it close. Narrowed to stacking order on [data-state='open'] only.
 *
 * 2. The empty framed box that floated beside the section caret (˅). Live capture
 *    showed it was NOT a menu: plugin.js's row picker ended in `|| r`, so the
 *    91x20 caret hit-area button (and the 44x24 age column) got stamped
 *    data-bubbles-session-row="true" and inherited the row shell's border + navy
 *    fill. The picker now resolves to a .row-hover element or nothing, and the
 *    hover cue moved onto the 12x12 codicon marker as a box-shadow ring.
 *
 * 3. The sessions search field's focus ring. SearchField's `underline` variant is
 *    a borderless inline-flex wrapper whose <input> is `[field-sizing:content]`,
 *    i.e. only as wide as its placeholder (measured: 58px input in an 82px field).
 *    The plugin's blanket `:is(button, textarea, input, …):focus-visible` outline
 *    therefore hugged the text and floated off the field. Settings controls look
 *    correct because there the chrome sits on the control itself
 *    (.desktop-input-chrome, which owns its own :focus glow).
 *
 * Built CSS + live skin customCSS + PLUGIN_CSS, real markup, measured geometry.
 *   node test/menu-phantom-and-focus-ring.test.js
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')
const { skinSourcePath } = require('./skin-source')

const skip = reason => {
  console.log(`\n=== Menu Phantom & Focus Ring Suite: SKIPPED — ${reason} ===\n`)
  process.exit(0)
}

/* Sheet resolution lives in scripts/lib/sheets.js — one copy of these paths, so a
   test cannot drift from what the renderer actually loads. */
const { REPO, HOME, DESKTOP, builtCssPath: findBuiltCss, blockScalar, pluginCss: pluginCssFrom, launchChromium } = require('../scripts/lib/sheets')

const builtCssPath = findBuiltCss()
if (!builtCssPath) skip(`no built renderer CSS under ${DESKTOP}/dist`)

const pluginCss = pluginCssFrom(fs.readFileSync(path.join(REPO, 'src', 'plugin.js'), 'utf8'))
assert(pluginCss, 'PLUGIN_CSS could not be extracted from src/plugin.js')
// PLUGIN_CSS is one JS template literal: a backtick in a comment ends it early and
// everything after silently stops being CSS. Check the tail survived.
assert(pluginCss.includes('prefers-reduced-motion'),
  'PLUGIN_CSS is truncated — a backtick or ${ in the CSS text closed the template literal early')
const skinCss = blockScalar(fs.readFileSync(skinSourcePath(), 'utf8'), 'customCSS')
assert(skinCss, `no customCSS block scalar in ${skinSourcePath()}`)

// ---------------------------------------------------------------------------
// Markup, copied from the renderer:
//   select.tsx:62  SelectPrimitive.Portal > Content(menuSurfaceClass +
//                  menuMotionClass + 'relative z-(--z-modal-popover) min-w-36 …')
//   menu.ts:9,12   the surface + motion class literals
//   search-field.tsx:67  underline variant: inline-flex wrapper, border-b,
//                  opacity-30 focus-within:opacity-100, input h-7
//                  [field-sizing:content] focus:outline-none
// ---------------------------------------------------------------------------
const SURFACE = 'dt-portal-scrollbar rounded-lg border border-(--ui-stroke-secondary) '
  + 'bg-[color-mix(in_srgb,var(--ui-bg-elevated)_96%,transparent)] p-1 text-popover-foreground shadow-md backdrop-blur-md'
const MOTION = 'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 '
  + 'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95'
const ITEM = 'relative flex items-center gap-2 rounded-md px-2 py-1 text-xs outline-hidden select-none '
  + 'focus:bg-(--ui-control-active-background) focus:text-foreground'

const menu = (state, extra = '') => `
  <div data-radix-popper-content-wrapper style="position:fixed;left:150px;top:120px;inset:auto;z-index:50">
    <div data-slot="select-content" data-state="${state}" ${extra} data-probe="${state}"
         class="${SURFACE} ${MOTION} relative z-(--z-modal-popover) max-h-72 min-w-36 overflow-hidden p-0">
      <div class="dt-portal-scrollbar p-1">
        <div role="option" class="${ITEM}">Segoe UI</div>
        <div role="option" class="${ITEM}">OpenDyslexic</div>
      </div>
    </div>
  </div>`

const SEARCH = `
  <div data-slot="sidebar" class="h-full w-[260px]">
    <div class="shrink-0 px-2 pb-1 pt-1">
      <div class="inline-flex min-w-0 max-w-full items-center gap-1.5 transition-[color,border-color,opacity] border-b border-transparent px-0.5 opacity-30 focus-within:opacity-100" data-probe="field">
        <svg class="pointer-events-none shrink-0 text-muted-foreground/70 size-3.5" viewBox="0 0 16 16"></svg>
        <input aria-label="搜索会话" placeholder="搜索会话…" type="text" value=""
               class="h-7 min-w-0 max-w-full bg-transparent text-xs text-foreground [field-sizing:content] placeholder:text-muted-foreground focus:outline-none" data-probe="search">
      </div>
    </div>
    <div class="flex items-center gap-1 px-2 py-1" data-probe="header-row">
      <button class="min-w-0 shrink bg-transparent p-0 text-left" type="button">主页</button>
      <button class="flex flex-1 items-center self-stretch bg-transparent p-0" type="button" data-probe="caret-btn">
        <i class="codicon codicon-chevron-right duration-150 rotate-90 shrink-0 text-(--ui-text-tertiary)" data-probe="caret"></i>
      </button>
      <div class="flex shrink-0 items-center self-stretch" data-row-actions data-probe="actions"><time class="text-[0.625rem]">2.2M</time></div>
    </div>
  </div>`

const page = `<!doctype html><html data-bubbles-skin='true'><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileURL(builtCssPath).href}">
<style id="hermes-desktop-custom-css">${skinCss}</style>
<style id="hermes-bubbles-skin-runtime-styles">${pluginCss}</style>
</head><body style="background:#08192f;margin:0">${menu('closed', 'hidden')}${menu('open')}${SEARCH}</body></html>`

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bubbles-phantom-'))
fs.writeFileSync(path.join(dir, 'page.html'), page)

const MEASURE = () => {
  const box = el => {
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  }
  const read = probe => {
    const el = document.querySelector(`[data-probe="${probe}"]`)
    const cs = getComputedStyle(el)
    return { box: box(el), opacity: cs.opacity, visibility: cs.visibility, display: cs.display, zIndex: cs.zIndex }
  }
  const input = document.querySelector('[data-probe="search"]')
  input.focus()
  const field = document.querySelector('[data-probe="field"]')
  const ics = getComputedStyle(input)
  const ring = ics.outlineStyle === 'none' ? null : `${ics.outlineWidth} ${ics.outlineStyle} ${ics.outlineColor} offset ${ics.outlineOffset}`

  // Which skin/plugin rules paint a box on the caret marker and on its hit-area
  // button. selectorText is split on commas so the report names the one selector
  // that actually matched.
  const paintRules = el => {
    const hits = []
    for (const s of document.styleSheets) {
      let list
      try { list = s.cssRules } catch { continue }
      const sheet = s.ownerElement ? s.ownerElement.id : (s.href || '').split('/').pop()
      const walk = l => {
        for (const r of l) {
          if (r.selectorText && /border|background|box-shadow/.test(r.style.cssText)) {
            for (const one of r.selectorText.split(',')) {
              try { if (el.matches(one.trim())) hits.push(`${sheet} :: ${one.trim()} { ${(r.style.cssText || '').slice(0, 130)} }`) } catch { /* unmatchable */ }
            }
          }
          if (r.cssRules && r.cssRules.length) walk(r.cssRules)
        }
      }
      walk(list)
    }
    return hits
  }
  const caret = document.querySelector('[data-probe="caret"]')
  const caretBtn = document.querySelector('[data-probe="caret-btn"]')
  const bcs = getComputedStyle(caretBtn)
  return {
    closed: read('closed'),
    open: read('open'),
    search: {
      focused: document.activeElement === input,
      ring,
      input: box(input),
      field: box(field),
      fieldOutline: getComputedStyle(field).outlineStyle,
    },
    caret: {
      box: box(caret), btnBox: box(caretBtn),
      btnBorder: `${bcs.borderTopWidth} ${bcs.borderTopStyle}`, btnBg: bcs.backgroundColor,
      shadow: getComputedStyle(caret).boxShadow, radius: getComputedStyle(caret).borderTopLeftRadius,
      btnRules: paintRules(caretBtn), caretRules: paintRules(caret),
    },
  }
}


// 6. The row-shell picker, run against mocks. plugin.js used to end that
//    expression with `|| r`, so anything matching [data-row-actions] or
//    [data-slot="sidebar-row"] outside a .row-hover became a "session row" and
//    got row chrome — that is how the 91x20 caret button and the 44x24 age
//    column were stamped in the live app.
{
  const src = fs.readFileSync(path.join(REPO, 'src', 'plugin.js'), 'utf8')
  const defs = [
    src.match(/^const SIDEBAR_SELECTOR = .*$/m),
    src.match(/^const sessionRowShell = el => \{[\s\S]*?^\}/m),
  ]
  assert(defs.every(Boolean), 'the sidebar row gate is missing from src/plugin.js')
  const line = src.split('\n').find(l => l.includes('const rowShell ='))
  assert(line, 'no `const rowShell =` picker found in src/plugin.js')
  const expr = line.slice(line.indexOf('=') + 1).trim().replace(/;$/, '')
  const pick = new Function('r', `${defs.map(d => d[0]).join('\n')}
    return (${expr})`)
  const rail = { }
  const inRail = sel => (sel === '[data-slot="sidebar"]' ? rail : null)
  const shell = { classList: { contains: c => c === 'row-hover' }, closest: inRail }
  const actions = { classList: { contains: () => false },
    closest: sel => (sel === '.row-hover' ? shell : inRail(sel)) }
  const orphanButton = { classList: { contains: () => false }, closest: () => null }
  // A .row-hover that is NOT in the sidebar: the right-sidebar file tree, a cron
  // row, and the composer's own status row all look exactly like this.
  const outsideShell = { classList: { contains: c => c === 'row-hover' }, closest: () => null }
  assert.strictEqual(pick(shell), shell, 'a sidebar .row-hover element is its own shell')
  assert.strictEqual(pick(actions), shell, 'an element inside a sidebar .row-hover resolves to that shell')
  assert(!pick(orphanButton), 'a control with no .row-hover ancestor must not become a session row')
  assert(!pick(outsideShell), "a .row-hover outside [data-slot='sidebar'] must not become a session row")
}

;(async () => {
  const browser = await launchChromium()
  if (!browser) skip('playwright-core found but no Chromium/Edge/Chrome to launch')
  const pg = await browser.newPage({ viewport: { width: 520, height: 400 }, colorScheme: 'dark' })
  await pg.goto(pathToFileURL(path.join(dir, 'page.html')).href)
  const m = await pg.evaluate(`(${MEASURE.toString()})()`)
  // A real hover: `el.matches('… :hover')` is always false, so the ring can only
  // be verified by actually putting the cursor on the caret button.
  await pg.hover('[data-probe="caret-btn"]')
  const h = await pg.evaluate(`(${MEASURE.toString()})()`)
  await browser.close()

  console.log('\n=== Menu Phantom & Focus Ring Suite ===')
  console.log(`sheets: built=${path.basename(builtCssPath)} skin=${path.relative(HOME, skinSourcePath())} plugin=${pluginCss.length}b`)
  console.log(`closed menu : opacity=${m.closed.opacity} visibility=${m.closed.visibility} display=${m.closed.display} box=${JSON.stringify(m.closed.box)}`)
  console.log(`open menu   : opacity=${m.open.opacity} z-index=${m.open.zIndex} box=${JSON.stringify(m.open.box)}`)
  console.log(`search field: focused=${m.search.focused} ring=${m.search.ring} input.w=${m.search.input.w} field.w=${m.search.field.w}`)

  // 1. The rescue must stay narrow. Two mechanisms I checked and ruled out for
  //    the live phantom box, both worth pinning anyway:
  //      - `[hidden]` is NOT beatable from here: Tailwind ships
  //        `[hidden]:where(:not([hidden='until-found'])) { display:none !important }`
  //        inside @layer base, and a layered !important outranks our unlayered one
  //        (verified: display stays `none` even with display:block !important).
  //      - fade-out is an animation and holds nothing after it ends, so a static
  //        closed panel computes opacity 1 with or without the rescue.
  //    What IS real: `opacity:1 !important` outranks a *running* animation, so the
  //    rescue could freeze a panel mid-fade. Keep it to stacking order only.
  const rescue = skinCss.match(/\[data-slot='select-content'\]([^{}]*)\{([^}]*)\}/)
  assert(rescue, 'no [data-slot=select-content] rescue rule found in the skin')
  assert(rescue[1].includes("[data-state='open']"),
    `the dropdown rescue must be scoped to [data-state="open"], got: ${rescue[1].trim()}`)
  assert(!/\b(display|visibility|opacity)\s*:/.test(rescue[2]),
    `the dropdown rescue must not touch display/visibility/opacity, got: ${rescue[2].trim()}`)

  // 2. The rescue must still do its actual job on the open panel.
  assert.strictEqual(m.open.zIndex, '99999',
    'the open dropdown must keep the stacking rescue, or it hides behind the composer')
  assert.strictEqual(m.open.opacity, '1', 'the open dropdown must be fully visible')

  // 3. The search field must not carry a ring that floats off the field.
  const inputNarrowerThanField = m.search.input.w < m.search.field.w - 2
  assert(!(m.search.ring && inputNarrowerThanField),
    `the focus ring is painted on a content-sized <input> (${m.search.input.w}px) inside a `
    + `${m.search.field.w}px field, so it hugs the text instead of the box: ${m.search.ring}. `
    + 'Native inputs already glow via .desktop-input-chrome; leave the underline SearchField alone.')

  // 4. While hovered, the caret's hit-area button must carry no row chrome. Live
  //    capture: the 91x20 button beside the ˅ had been stamped
  //    data-bubbles-session-row="true" by plugin.js's `|| r` fallback, so it drew
  //    a 1px border + navy fill — a large empty frame floating off the marker.
  assert.strictEqual(h.caret.btnBg, 'rgba(0, 0, 0, 0)',
    `hovering paints a background on the caret hit-area button: ${h.caret.btnRules.join('\n  ')}`)
  assert(/^0(\.\d+)?px\s|^0px\s|none$/.test(h.caret.btnBorder),
    `hovering gives the caret hit-area button a border (${h.caret.btnBorder}): ${h.caret.btnRules.join('\n  ')}`)

  // 5. The ring belongs on the 12x12 marker, and must not cost it layout.
  assert(h.caret.caretRules.length, 'no rule paints the caret marker on hover — the ˅ has no highlight at all')
  assert(h.caret.shadow !== 'none',
    `the caret must gain a ring on hover, got box-shadow=${h.caret.shadow}; rules=${h.caret.caretRules.join(' | ')}`)
  assert.deepStrictEqual(h.caret.box, m.caret.box,
    'the caret ring resized/moved the marker — use box-shadow, not border/padding')

  console.log('\n=== Menu Phantom & Focus Ring Suite: PASS ===\n')
})().catch(err => {
  console.error('\n' + (err.message || err))
  process.exit(1)
})
