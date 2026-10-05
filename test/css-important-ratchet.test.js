/**
 * test/css-important-ratchet.test.js
 *
 * src/plugin.css carries 780 `!important` declarations across 206 rule blocks — about
 * four per rule. That is not laziness, it is the cascade this skin has to win: the
 * host ships blanket `:is(...)` transparency rules, and Tailwind puts its utilities in
 * `@layer utilities`, where an `!important` outranks an unlayered `!important` no
 * matter how specific ours is. But every flag we add is a loaded gun for the next one:
 * two `!important` rules at equal specificity are decided by file order alone, so a
 * fifth flag on a property nobody expected erases a later, better-targeted rule.
 *
 * The fix is not a bulk find-and-replace — that would repaint the skin. It is a
 * ceiling that may only go DOWN, so new rules win on specificity instead of stacking
 * another flag. Same trick as assertion-census, same failure mode it prevents:
 * quietly adding one more becomes a red suite.
 *   node test/css-important-ratchet.test.js
 */

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { REPO, blockScalar, skinYamlPath } = require('../scripts/lib/sheets')

/* Ceiling as of 2026-10-05: 780 declarations in src/plugin.css. Counted on the
   comment-stripped sheet — the raw text says 785 because five of those mentions are
   prose inside comments, and a ratchet must count declarations, not vocabulary.
   Reproduce with:
     node -e "const s=require('fs').readFileSync('src/plugin.css','utf8').replace(/\\/\\*[\\s\\S]*?\\*\\//g,' ');console.log((s.match(/!important/g)||[]).length)"
   Lower it in the same commit that removes a declaration — a ceiling nobody moves is
   just a comment. */
const BASELINE = 780

const CSS_FILE = path.join(REPO, 'src', 'plugin.css')

console.log('\n=== CSS !important Ratchet Suite ===\n')

const failures = []
const check = (name, ok, detail) => {
  if (!ok) failures.push(name)
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const sheet = fs.readFileSync(CSS_FILE, 'utf8')
const declarationsOnly = sheet.replace(/\/\*[\s\S]*?\*\//g, ' ')
const flags = (declarationsOnly.match(/!important/g) || []).length
const mentions = (sheet.match(/!important/g) || []).length
const blocks = (declarationsOnly.match(/\{/g) || []).length

// A ratchet that can silently count zero passes forever, so both the reader and the
// counter are pinned before the number itself means anything.
check('the sheet is read from the canonical source', declarationsOnly.includes('data-bubbles'),
  `${path.relative(REPO, CSS_FILE)}, ${declarationsOnly.split('\n').length} lines`)
const probe = ('a{color:red !important}b{color:blue !important}'.match(/!important/g) || []).length
check('the counter actually counts', probe === 2, `probe found ${probe}`)
check('stripping comments really removes prose', mentions > flags,
  `${mentions} mentions in text -> ${flags} declarations`)

console.log(`\n  src/plugin.css: ${flags} !important declarations across ${blocks} blocks (~${(flags / blocks).toFixed(1)} per block)\n`)

check(`declarations stay at or below the ceiling (${BASELINE})`, flags <= BASELINE,
  flags > BASELINE
    ? `${flags - BASELINE} too many — win with a more specific selector, or lower a sibling count in the same commit`
    : `headroom ${BASELINE - flags}`)
if (flags < BASELINE) {
  console.log(`\n  note: ${BASELINE - flags} fewer than the ceiling. Lower BASELINE to ${flags} so the`)
  console.log('        removal cannot quietly roll back.')
}

/* A flag written where a selector belongs is not a strong rule, it is a dropped rule:
   Chromium discards the whole declaration block it cannot parse. Checked on the
   comment-stripped sheet, because prose about !important is legitimate here — five of
   the 792 raw mentions are exactly that. */
const floaters = declarationsOnly.split('\n')
  .filter(l => /!important/.test(l) && !/[:;]/.test(l.replace(/!important/g, '')))
check('no flag floats outside a declaration', floaters.length === 0, floaters.slice(0, 2).join(' | '))

/* The skin's other sheet is reported, not pinned: bubbles.yaml is capped at 32 KiB by
   the gateway and its flags are the transparency neutralizer that PLUGIN_CSS rules
   depend on to lose predictably. test/skin-css-budget.test.js owns that file's size. */
const yaml = blockScalar(fs.readFileSync(skinYamlPath(), 'utf8'), 'customCSS') || ''
console.log(`  reported (not pinned): ${(yaml.match(/!important/g) || []).length} flags in the active skin's customCSS`)

assert(flags > 0, 'counting nothing would make this suite decorative')

const failed = failures.length
console.log(`\n${failed ? 'FAIL' : 'OK'} — ${6 - failed}/6 assertions`)
process.exit(failed ? 1 : 0)
