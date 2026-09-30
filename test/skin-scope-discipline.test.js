/**
 * test/skin-scope-discipline.test.js
 *
 * Two rules the skin has to keep, both about reach:
 *
 * 1. `.row-hover` is emitted at 13 sites in the renderer and only ONE of them is
 *    the chat sidebar (session-row.tsx:374; the others are changed-files-card,
 *    status-row, the review file tree, the capability catalog, the session
 *    switcher, cron, the remote picker, credential settings…). An unscoped
 *    `.row-hover` rule therefore repaints composer and chat rows. The JS side is
 *    gated by sessionRowShell; this guards the CSS side, which is a separate owner.
 *
 * 2. No aria-label literal. The renderer's accessible names come from i18n
 *    (zh.ts:4474, en.ts:4750, de.ts:5152), so a selector carrying one is dead in
 *    every other locale — and in two places the skin was matching a tag the label
 *    is not even on (`div[aria-label='终端']`, when rail.tsx:53 puts it on a <ul>).
 *
 *   node test/skin-scope-discipline.test.js
 */

const fs = require('fs')
const path = require('path')
const { REPO, pluginCss } = require('../scripts/lib/sheets')

/* Only the CSS is in scope. Scanning src/plugin.js as text would flag the JS that
   implements the very gate this rule protects (`sessionRowShell` mentions
   '.row-hover' while deciding whether an element is in the sidebar). */
const SHEETS = [
  ['PLUGIN_CSS', pluginCss()],
  ['bubbles.yaml customCSS', (() => {
    const { blockScalar } = require('../scripts/lib/sheets')
    return blockScalar(fs.readFileSync(path.join(REPO, 'bubbles.yaml'), 'utf8'), 'customCSS')
  })()],
]
const stripComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '')

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log('\n=== Skin Scope Discipline Suite ===\n')

const ANCHORS = [/\[data-slot=['"]?sidebar/, /\[data-slot=['"]?aui_changed-files/, /\[data-slot=['"]?aui_thread-viewport/, /\[data-slot=['"]?composer-status-stack/, /^aside\b/]

for (const [name, raw] of SHEETS) {
  const text = stripComments(raw)
  const lines = text.split('\n')

  // 1. every selector line that mentions .row-hover must carry a container anchor,
  //    looking back at the rule's own selector block, not just this one line.
  const unanchored = []
  lines.forEach((line, i) => {
    if (!line.includes('.row-hover')) return
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return
    // Collect the whole selector list: walk back to the previous `{` or `}`.
    let start = i
    while (start > 0 && !/[{}]/.test(lines[start - 1])) start -= 1
    let end = i
    while (end < lines.length - 1 && !/[{]/.test(lines[end])) end += 1
    const selector = lines.slice(start, end + 1).join(' ')
    if (!ANCHORS.some(a => a.test(selector))) unanchored.push(`line ${i + 1}: ${trimmed.slice(0, 60)}`)
  })
  check(`${name}: every .row-hover rule is anchored to a container`,
    unanchored.length === 0, unanchored.join(' | '))

  // 2. no i18n literal inside an attribute selector
  const labelled = [...text.matchAll(/\[aria-label[^\]]*\]/g)]
    .map(m => m[0])
    .filter(s => /[^\x00-\x7F]/.test(s))
  check(`${name}: no non-ASCII literal in an attribute selector`,
    labelled.length === 0, [...new Set(labelled)].join(' '))
}

// 3. the terminal rail must be reachable without a locale string: rail.tsx:47 puts
//    the structural marker on the container the rules style.
const yaml = fs.readFileSync(path.join(REPO, 'bubbles.yaml'), 'utf8')
check('the terminal rail keeps a structural anchor',
  yaml.includes("[class*='group/rail']"), 'rail.tsx:47 group/rail')

/* 4. Opaque surfaces. Everything in this skin is transparent or alpha so the
      ambient constellation shows through — except the terminal, which HAS to be a
      solid color because xterm resolves the variable to a concrete value for its
      WebGL renderer (terminal/selection.ts:77). That one exception is what made a
      dark rectangle in an otherwise frosted UI, so: no new opaque surface may
      appear, and the terminal's must not sit near black.
      Measured live: the old #0d2a4d painted #0d243d against its own tab strip at
      #133c6c. The replacement matches the strip. */
const customCss = stripComments(require('../scripts/lib/sheets')
  .blockScalar(yaml, 'customCSS'))
const surfaces = [...customCss.matchAll(/(--ui-[a-z-]*background)\s*:\s*([^;!]+)/g)]
  .map(m => ({ prop: m[1], value: m[2].trim() }))
  .filter(s => !/transparent/.test(s.value))
const opaque = surfaces.filter(s => !/\brgba?\([^,]+,[^,]+,[^,]+,/.test(s.value))
check('the terminal is the only opaque surface in the skin',
  opaque.length === 1 && opaque[0].prop === '--ui-terminal-surface-background',
  opaque.map(o => `${o.prop}=${o.value}`).join(' '))

const relLum = rgb => {
  const [r, g, b] = rgb.map(v => { const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const term = (opaque[0] || {}).value || ''
const rgb = (term.match(/^#([0-9a-f]{6})$/i) || []).slice(1).map(h => parseInt(h, 16))
  .flatMap(v => [v >> 16 & 255, v >> 8 & 255, v & 255])
const lum = rgb.length === 3 ? relLum(rgb) : 0
check('the terminal surface is not near-black', rgb.length === 3 && lum >= 0.04 && rgb[2] >= 90,
  `${term} → luminance ${lum.toFixed(3)} (floor 0.040), blue ${rgb[2]} (floor 90); the old #0d2a4d was 0.021`)

/* 5. The ambient backdrop must stop at the terminal. xterm hands the resolved
   --ui-terminal-surface-background to a WebGL canvas (terminal/selection.ts:82),
   which cannot composite a gradient, and an unlayered !important in this sheet
   outranks the app's own utility — so listing the terminal's layers in the backdrop
   rule froze the panel at a literal hex while the token said something else.
   Measured live: token rgb(17,60,106), painted rgb(13,42,77). */
const ambientPaintsTerminal = [...customCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([, sel, body]) => /\.xterm|bg-\(--ui-terminal-surface-background\)/.test(sel)
    && /background-attachment\s*:\s*fixed/.test(body))
  .map(([, sel]) => sel.trim().replace(/\s+/g, ' ').slice(-46))
check('no ambient (viewport-fixed) backdrop paints a terminal layer',
  ambientPaintsTerminal.length === 0, ambientPaintsTerminal.join(' | '))

const failed = results.filter(r => !r.ok)
console.log(`\n${failed.length ? 'FAIL' : 'OK'} — ${results.length - failed.length}/${results.length} assertions`)
process.exit(failed.length ? 1 : 0)
