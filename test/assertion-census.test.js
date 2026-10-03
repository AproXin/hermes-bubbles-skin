/**
 * test/assertion-census.test.js
 *
 * Half of this repo's assertions read the skin's source as a STRING
 * (`pluginSource.includes("border: none !important")`) instead of measuring what
 * the browser computes. Those pass when the CSS is wrong but well-formed, and fail
 * when someone reindents a file — so a green suite is not evidence about pixels.
 *
 * Converting them is real work, so this file does the cheap half first: it counts
 * them per suite and pins the total to a ceiling that may only go DOWN. Anything
 * new that asserts on source text pushes the total past the ceiling and fails,
 * which is what turns "we should fix the tests someday" into a ratchet.
 *
 * When you convert a suite, lower BASELINE in the same commit.
 *   node test/assertion-census.test.js
 */

const fs = require('fs')
const path = require('path')
const { REPO } = require('../scripts/lib/sheets')

const TEST_DIR = path.join(REPO, 'test')

/* Ceiling as of 2026-09-30, after two conversions:
   - overlay-stacking replaced phase3-1-audit's byte-pinned clarify block and its
     z-index/clamp text checks (15 → 8; total 206 → 200)
   - tool-flatten-layers replaced tool-flattening Tests 2-5, which asserted the
     flattening by matching "border: none !important" out of both sheets
     (69 → 27; total 200 → 159)
   2026-10-02, D1: not a conversion but a de-duplication. 16 customCSS rules were
   byte-identical copies of PLUGIN_CSS rules, and eight assertions pinned them to
   BOTH sheets ("bubbles.yaml must …" alongside "plugin.js must …"). The copies are
   gone, so the location pins went with them (final-ui-polish 78 → 66,
   tool-flattening 27 → 24; total 159 → 144). The guarantees did not move: each had
   a surviving plugin-side twin, and the 25 browser suites measure the merged sheet.
   final-ui-polish (66) is still nearly half of what remains, then tool-flattening (24)
   and phase5b-1-audit (13). Lower this number in the same commit that converts a
   suite — a ceiling nobody moves is just a comment.

   2026-10-02, batch 2: code-card-flatten was merged into code-card-cascade. Its six
   guarantees that no computed style can express (inner border-radius, rule order, the
   bubble rule still existing, the bubble's own shadow removal, the fade band's
   pointer-events, card-only scope) were carried over verbatim; the paint checks it also
   made are already measured there. 144 → 143 is the one `pluginSource.includes` that
   became a non-vacuous index check on the ordering assertion.

   2026-10-03, batch 3 (C): 143 → 137. Not a conversion — the phase audits each carried their own
   copy of `extractFn`, so six `srcCode.match` *definitions* were being counted as if they were six
   assertions. They now share test/lib/plugin-sandbox.js and count once. The source-text ASSERTIONS
   are untouched (per-file assert counts verified unchanged: 7/6/14/16/27/36/15/41/13/22), which is
   why the test/lib directory is scanned too — see above — so this cannot be repeated by parking
   matched text somewhere the census does not look. */
const BASELINE = 137

const SOURCE_TEXT = /\b(?:pluginSource|srcCode|src|yamlSource|cssText|pluginCode|code|text)\s*\.includes\s*\(/g
const SOURCE_REGEX = /\b(?:pluginSource|srcCode|yamlSource|pluginCode|cssText)\s*\.match\s*\(|\/[^/]*\/[a-z]*\.test\s*\(\s*(?:pluginSource|srcCode|yamlSource|pluginCode)/g
const REAL_MEASUREMENT = /getComputedStyle|page\.evaluate|boundingBox|\.screenshot\(|getImageData|querySelector\(|vm\.runInContext|new Function/g

function classify(text) {
  const count = re => (text.match(re) || []).length
  return { strings: count(SOURCE_TEXT) + count(SOURCE_REGEX), measured: count(REAL_MEASUREMENT) }
}

/* `test/lib/*.js` counts too. Without it, moving a `srcCode.match` out of a suite and
   into a shared harness would read as a conversion and free up ceiling for the next
   text assertion — the ratchet would measure where the text sits, not how much exists. */
const LIB_DIR = path.join(TEST_DIR, 'lib')
const entries = [
  ...fs.readdirSync(TEST_DIR).filter(f => f.endsWith('.test.js') && f !== 'assertion-census.test.js').map(f => ({ display: f, rel: f })),
  ...(fs.existsSync(LIB_DIR)
    ? fs.readdirSync(LIB_DIR).filter(f => f.endsWith('.js')).map(f => ({ display: `lib/${f}`, rel: path.join('lib', f) }))
    : []),
].sort((a, b) => a.display.localeCompare(b.display))
const rows = entries.map(e => ({ file: e.display, ...classify(fs.readFileSync(path.join(TEST_DIR, e.rel), 'utf8')) }))
  .filter(r => r.strings > 0)
  .sort((a, b) => b.strings - a.strings)

const total = rows.reduce((s, r) => s + r.strings, 0)

console.log('\n=== Assertion Census Suite ===\n')
console.log('suite                              source-text  measured')
for (const r of rows) console.log(`  ${r.file.replace(/\.test\.js$/, '').padEnd(32)} ${String(r.strings).padStart(6)} ${String(r.measured).padStart(10)}`)
console.log(`\ntotal source-text assertions: ${total} (ceiling ${BASELINE})`)

const failures = []
const check = (name, ok, detail) => {
  if (!ok) failures.push(name)
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

check('source-text assertions stay at or below the ceiling', total <= BASELINE,
  total > BASELINE ? `${total - BASELINE} too many — convert a suite or measure instead of matching text` : `headroom ${BASELINE - total}`)
if (total < BASELINE) {
  console.log(`\n  note: ${BASELINE - total} fewer than the ceiling. Lower BASELINE to ${total} so the`)
  console.log('        conversion cannot quietly roll back.')
}

/* The census is worthless if it can silently count nothing (a renamed variable
   would make every suite look clean). Sanity-check the detector on a known case. */
const probe = classify('const x = pluginSource.includes("a") && srcCode.includes("b")')
check('the counter actually counts', probe.strings === 2, `probe found ${probe.strings}`)

/* The suite inventory is hand-copied into README.md and it has gone stale twice — 26
   against a directory of 25 before D5, 47 against 51 after it. Pin the documented
   total to the directory and require the three category numbers to add up to it.

   This deliberately does not check HOW each suite is categorised. "Does this file
   measure pixels" is a judgement about what it asserts, and a marker heuristic would
   have been wrong on the first suite that does both (menu-phantom-and-focus-ring
   launches a browser and evals a function out of the plugin). The cheap half is
   catching "I added a suite and told nobody"; that half used to be the whole incident. */
const readme = fs.readFileSync(path.join(REPO, 'README.md'), 'utf8')
const inventory = fs.readdirSync(TEST_DIR).filter(f => f.endsWith('.test.js')).length
const claimed = (readme.match(/\*\*(\d+) 个套件\*\*/) || [])[1]
const categories = [...readme.matchAll(/\*\*(\d+) 个\*\*/g)].map(m => Number(m[1]))
const categorySum = categories.reduce((s, n) => s + n, 0)

check('the README suite count matches the directory', claimed === String(inventory),
  `README says ${claimed ?? 'nothing'}, test/ holds ${inventory} suites`)
check('and its three category numbers add up to it',
  categories.length === 3 && categorySum === inventory,
  `${categories.join(' + ')} = ${categorySum}, directory holds ${inventory}`)

const failed = failures.length
console.log(`\n${failed ? 'FAIL' : 'OK'} — ${4 - failed}/4 assertions`)
process.exit(failed ? 1 : 0)
