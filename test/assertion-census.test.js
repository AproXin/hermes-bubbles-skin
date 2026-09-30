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
   final-ui-polish (78) is now over half of what remains, then tool-flattening (27)
   and phase5b-1-audit (13). Lower this number in the same commit that converts a
   suite — a ceiling nobody moves is just a comment. */
const BASELINE = 159

const SOURCE_TEXT = /\b(?:pluginSource|srcCode|src|yamlSource|cssText|pluginCode|code|text)\s*\.includes\s*\(/g
const SOURCE_REGEX = /\b(?:pluginSource|srcCode|yamlSource|pluginCode|cssText)\s*\.match\s*\(|\/[^/]*\/[a-z]*\.test\s*\(\s*(?:pluginSource|srcCode|yamlSource|pluginCode)/g
const REAL_MEASUREMENT = /getComputedStyle|page\.evaluate|boundingBox|\.screenshot\(|getImageData|querySelector\(|vm\.runInContext|new Function/g

function classify(text) {
  const count = re => (text.match(re) || []).length
  return { strings: count(SOURCE_TEXT) + count(SOURCE_REGEX), measured: count(REAL_MEASUREMENT) }
}

const files = fs.readdirSync(TEST_DIR).filter(f => f.endsWith('.test.js') && f !== 'assertion-census.test.js').sort()
const rows = files.map(f => ({ file: f, ...classify(fs.readFileSync(path.join(TEST_DIR, f), 'utf8')) }))
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

const failed = failures.length
console.log(`\n${failed ? 'FAIL' : 'OK'} — ${2 - failed}/2 assertions`)
process.exit(failed ? 1 : 0)
