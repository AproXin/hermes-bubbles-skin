/**
 * test/skin-css-budget.test.js
 *
 * The active skin's customCSS has a hard byte budget enforced by the gateway,
 * and exceeding it fails SILENTLY: hermes_cli/skin_engine.py slices the string
 * before it ever reaches the renderer, so every rule past the cut — and the rule
 * the cut lands inside — simply does not exist in the app. The file looks right,
 * DevTools shows a shorter sheet, and the diff reads as "my CSS change had no
 * effect".
 *
 * This suite pins the cap to the engine's own source (it is not a constant we
 * own) and asserts the active customCSS fits. Run directly:
 *   node test/skin-css-budget.test.js
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const HOME = os.homedir()
const HERMES_HOME = process.env.HERMES_HOME || path.join(HOME, '.hermes')
const REPO = path.join(__dirname, '..')
const AGENT = path.join(HERMES_HOME, 'hermes-agent')

const skip = reason => {
  console.log(`\n=== Skin CSS Budget Suite: SKIPPED — ${reason} ===\n`)
  process.exit(0)
}

/** The cap and the YAML reader live in scripts/lib/sheets.js, so the deploy gate
 *  and this test cannot drift apart. */
const { customCssCap: readCap, blockScalar, skinYamlPath } = require('../scripts/lib/sheets')

const cap = readCap()
if (!cap) skip('no customCSS slice found in hermes_cli/skin_engine.py')

/* Which skin Hermes actually loads is resolved in one place now (sheets.js, which the
   browser suites use too). This file used to carry its own copy of that resolution, and
   reading the wrong file would make the budget check pass against a sheet that is not
   the one the engine slices. */
const REPO_SKIN = path.join(REPO, 'bubbles.yaml')
const skinSource = skinYamlPath()

const css = blockScalar(fs.readFileSync(skinSource, 'utf8'), 'customCSS')
assert(css, `no customCSS block scalar found in ${skinSource}`)

console.log(`=== Skin CSS Budget Suite (${skinSource === REPO_SKIN ? 'repo skin' : 'live skin'}) ===`)
console.log(`engine cap: ${cap} chars | customCSS: ${css.length} chars`)

/* Headroom, not just overflow. The engine truncates silently, so the file has to
   stay comfortably under the cap — but a hard floor assertion would fail on the
   day the skin is legitimately rich, so this warns and asserts only when the
   margin is small enough that the next colour iteration will hit the wall. */
const headroom = cap - css.length
console.log(`headroom: ${headroom} chars`)
if (headroom < 1500) {
  console.log(`  WARN  under 1500 chars of slack — new component CSS belongs in PLUGIN_CSS,`)
  console.log(`        which has no cap (installStyles writes textContent verbatim).`)
}
if (headroom < 400) {
  console.error(`\nFAIL — only ${headroom} chars of slack left in a ${cap}-char budget.`)
  console.error('Move a block to PLUGIN_CSS before adding anything to customCSS.')
  process.exit(1)
}

// A slice is only harmless when it is the identity. Report what dies.
if (css.length > cap) {
  const cut = css.slice(0, cap)
  const tailLines = css.slice(cap).split('\n').filter(l => l.trim()).length
  const unbalanced = (cut.match(/\{/g) || []).length - (cut.match(/\}/g) || []).length
  console.log(`\nDROPPED by the engine (${css.length - cap} chars, ~${tailLines} lines):`)
  console.log(`  cut lands inside: ${JSON.stringify(cut.split('\n').pop().slice(-60))}`)
  console.log(`  brace depth at cut: ${unbalanced}`)
  console.log(`  first lost rule   : ${JSON.stringify(css.slice(cap).trimStart().slice(0, 80))}`)
}

assert.strictEqual(
  css.length <= cap,
  true,
  `customCSS is ${css.length} chars and the engine slices at ${cap}: ${css.length - cap} chars `
  + `(~${css.slice(cap).split('\n').filter(l => l.trim()).length} lines) never reach the renderer. `
  + `Free budget by deleting selectors the build never emits, or move the rules into PLUGIN_CSS `
  + `(installed with textContent, uncapped). Skin: ${skinSource}`
)

// Dead-selector sweep: an attribute the shipped renderer never stamps can only
// ever match dynamically-added nodes, so a block of them is dead weight in a
// budgeted file. Report (not assert) so a legitimate runtime attribute does not
// break the build.
const assets = path.join(HERMES_HOME, 'hermes-agent', 'apps', 'desktop', 'dist', 'assets')
if (fs.existsSync(assets)) {
  const bundle = fs.readdirSync(assets)
    .filter(f => f.endsWith('.js'))
    .map(f => fs.readFileSync(path.join(assets, f), 'utf8'))
    .join('')
  const attrs = [...new Set((css.match(/\[data-[a-z0-9-]+/g) || []).map(a => a.slice(1)))]
  const orphans = attrs.filter(a => !bundle.includes(a))
  const cssOrphans = orphans.filter(a => !fs.existsSync(path.join(HERMES_HOME, 'desktop-plugins', 'hermes-bubbles-skin', 'plugin.js'))
    || !fs.readFileSync(path.join(HERMES_HOME, 'desktop-plugins', 'hermes-bubbles-skin', 'plugin.js'), 'utf8').includes(a))
  console.log(`\ndata-* attributes in customCSS: ${attrs.length}, absent from the build: ${orphans.length}, `
    + `absent from the plugin too: ${cssOrphans.length}`)
  if (cssOrphans.length) console.log('  candidates to delete: ' + cssOrphans.slice(0, 12).join(', '))
}

console.log('\n=== Skin CSS Budget Suite: PASS ===\n')
