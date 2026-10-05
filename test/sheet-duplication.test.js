/**
 * test/sheet-duplication.test.js
 *
 * The skin's customCSS is sliced at 32,768 characters by the gateway and the tail is
 * dropped silently at runtime, so every rule that also exists in PLUGIN_CSS is budget
 * spent twice for one visual result. D1 removed 16 such rules plus a 4.5 KB avatar;
 * this test keeps them from creeping back.
 *
 * A "duplicate" here is a top-level rule whose selector matches (after dropping the
 * html[data-bubbles-skin='true'] prefix, which PLUGIN_CSS carries and customCSS mostly
 * does not) AND whose declaration body matches, byte for byte after whitespace
 * normalisation. Same selector with a different body is NOT flagged: that is the
 * cascade working, and several rules deliberately differ between sheets.
 *   node test/sheet-duplication.test.js
 */

const fs = require('fs')
const path = require('path')
const assert = require('assert')
const { REPO, blockScalar, pluginCss } = require('../scripts/lib/sheets')

/** Split a stylesheet into top-level rules: depth, string and comment aware. */
function topLevelRules(css) {
  const rules = []
  let depth = 0
  let tokenStart = 0
  let quote = null
  let escaped = false
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i]
    if (escaped) { escaped = false; continue }
    if (quote) { if (ch === '\\') escaped = true; else if (ch === quote) quote = null; continue }
    /* Comments first: an apostrophe in English prose ("the skin's cap") would otherwise
       open a string that never closes and swallow the rest of the sheet. */
    if (ch === '/' && css[i + 1] === '*') { const close = css.indexOf('*/', i + 2); i = close === -1 ? css.length : close + 1; continue }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '{') { depth += 1; continue }
    if (ch !== '}') continue
    depth -= 1
    if (depth !== 0) continue
    let lineEnd = i
    while (lineEnd < css.length && css[lineEnd] !== '\n') lineEnd += 1
    const seg = css.slice(tokenStart, lineEnd)
    const withoutComments = seg.replace(/\/\*[\s\S]*?\*\//g, '')
    const open = withoutComments.indexOf('{')
    const close = withoutComments.lastIndexOf('}')
    if (open !== -1 && close > open) {
      rules.push({ sel: norm(withoutComments.slice(0, open)), body: norm(withoutComments.slice(open + 1, close)) })
    }
    tokenStart = lineEnd + 1
    i = lineEnd
  }
  return rules
}

const norm = s => s.replace(/\s+/g, ' ').trim()
const unscope = s => norm(s).replace(/(^|\s)html\[data-bubbles-skin='true'\]\s+/g, ' ').trim()
const keyOf = r => `${unscope(r.sel)}||${r.body}`

/* Cross-sheet duplication that is intentional. Currently empty — the one candidate,
   --ui-terminal-surface-background, is declared in both sheets but inside larger blocks
   with different bodies, so it is not a byte-identical duplicate and is not flagged.
   (The early declaration exists because xterm resolves that token once at terminal
   creation and bakes it into its WebGL clear color; see src/plugin.js:88-101 and
   test/terminal-surface.test.js, which pins both copies to the same hex.)
   An entry here must name the rule and say why it has to exist twice: an allowlist
   without a reason is how the next duplication gets waved through. */
const DELIBERATE = new Map([])

const skinCss = blockScalar(fs.readFileSync(path.join(REPO, 'bubbles.yaml'), 'utf8'), 'customCSS')
const plugin = pluginCss()
assert(skinCss, 'customCSS could not be read from bubbles.yaml')
assert(plugin, 'PLUGIN_CSS could not be extracted from src/plugin.js')

const pluginKeys = new Map()
for (const r of topLevelRules(plugin)) {
  const k = keyOf(r)
  if (!pluginKeys.has(k)) pluginKeys.set(k, r.sel)
}

const hits = []
const waived = []
for (const r of topLevelRules(skinCss)) {
  const k = keyOf(r)
  if (!pluginKeys.has(k)) continue
  const reason = [...DELIBERATE.keys()].find(needle => k.includes(needle))
  if (reason) waived.push(`${unscope(r.sel)} — ${DELIBERATE.get(reason)}`)
  else hits.push(unscope(r.sel))
}

console.log('\n=== Sheet Duplication Suite ===\n')
console.log(`customCSS rules: ${topLevelRules(skinCss).length}  PLUGIN_CSS rules: ${topLevelRules(plugin).length}`)
for (const w of waived) console.log(`  ~ waived: ${w.slice(0, 88)}`)
for (const h of hits) console.log(`  ✗ duplicate: ${h.slice(0, 88)}`)

assert(
  hits.length === 0,
  `${hits.length} rule(s) are byte-identical in both sheets — the customCSS copy costs `
  + `skin budget that the gateway caps at 32,768 chars. Delete the customCSS copy, or `
  + `add a documented exemption above with the reason it must exist twice.`,
)
console.log(`\nOK — 0 unexplained duplicates (${waived.length} documented exemption(s))\n`)
