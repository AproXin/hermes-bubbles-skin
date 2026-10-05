#!/usr/bin/env node
/**
 * scripts/build-plugin.js — assemble `src/plugin.js` from the two files that are
 * actually hand-edited:
 *
 *   src/plugin.source.js   the plugin's JavaScript, with one marker line where the
 *                          stylesheet belongs
 *   src/plugin.css         the stylesheet (PLUGIN_CSS) — 1.9k lines of pure CSS, so
 *                          it can be read, grepped and diffed as CSS
 *
 * `src/plugin.js` is therefore a build output, but it stays the file everything else
 * consumes: `sync.js` deploys it, `scripts/lib/sheets.js` lifts PLUGIN_CSS out of it,
 * and the suites assert against its bytes. That is deliberate — moving the artifact
 * would mean rewriting every reader for no gain — and it is why the assembly must be
 * byte-for-byte: a hand-edit to `src/plugin.js` has to be caught, not silently
 * overwritten on the next build.
 *
 *   node scripts/build-plugin.js           # write it if stale
 *   node scripts/build-plugin.js --check   # exit 1 if stale, write nothing
 *
 * Two rules the CSS file must keep obeying, both inherited from the fact that its
 * text is pasted inside a JS template literal:
 *   - no backtick anywhere, including comments (it would end the literal early)
 *   - `${…}` is legal and live: `${CLAMP_LINE_THRESHOLD_PX}` is interpolated at
 *     runtime by the plugin itself
 *
 * One macro, expanded here rather than in the stylesheet: every rule is scoped to
 * `%SKIN%` (231 times), which stands for `html[data-bubbles-skin='true']`. The
 * alternative — a CSS nesting wrapper — would have moved 231 literal selectors
 * into a block whose cascade position decides who wins, and a single missing brace
 * in a 1,900-line sheet redefines the scope of everything after it without any
 * parse error. Expanding a token cannot do that: the bytes PLUGIN_CSS ships are
 * the same bytes as before, and `node scripts/build-plugin.js` refuses to emit a
 * sheet where the token survived. Renaming the scope attribute is now one edit
 * here plus one rebuild, instead of 231 edits that each silently un-scope a rule.
 */

const fs = require('fs')
const path = require('path')
const { REPO } = require('./lib/sheets')

const MARKER = '/* __PLUGIN_CSS_BODY__ */'
const TEMPLATE_FILE = path.join(REPO, 'src', 'plugin.source.js')
const CSS_FILE = path.join(REPO, 'src', 'plugin.css')
const OUT_FILE = path.join(REPO, 'src', 'plugin.js')
const PKG_FILE = path.join(REPO, 'package.json')
const YAML_FILE = path.join(REPO, 'plugin.yaml')

/* The one place the scope attribute is written down. */
const SCOPE_TOKEN = '%SKIN%'
const SCOPE_SELECTOR = "html[data-bubbles-skin='true']"

function expandScope(css, file) {
  const hits = css.split(SCOPE_TOKEN).length - 1
  if (hits === 0) {
    throw new Error(`${path.basename(file)} has no ${SCOPE_TOKEN} — every rule would ship unscoped`)
  }
  const out = css.split(SCOPE_TOKEN).join(SCOPE_SELECTOR)
  if (out.includes(SCOPE_TOKEN)) {
    throw new Error(`${path.basename(file)} still contains ${SCOPE_TOKEN} after expansion`)
  }
  return { css: out, hits }
}

function assemble() {
  versionGuard()
  const template = fs.readFileSync(TEMPLATE_FILE, 'utf8')
  const hits = template.split(MARKER).length - 1
  if (hits === 0) throw new Error(`${path.basename(TEMPLATE_FILE)} has no marker line — the stylesheet would be dropped silently`)
  if (hits > 1) throw new Error(`${path.basename(TEMPLATE_FILE)} has ${hits} marker lines — the stylesheet would be pasted ${hits} times`)

  const raw = fs.readFileSync(CSS_FILE, 'utf8').replace(/\n$/, '')
  if (raw.includes('`')) {
    const line = raw.slice(0, raw.indexOf('`')).split('\n').length
    throw new Error(`src/plugin.css line ${line} has a backtick — it would truncate PLUGIN_CSS in the assembled plugin`)
  }
  const { css, hits: scoped } = expandScope(raw, CSS_FILE)
  // The marker occupies its own line between the literal's opening and closing
  // backticks, so the body is substituted for the marker text alone.
  return { text: template.split(MARKER).join(css), scoped }
}

/* sync.js calls this to refresh src/plugin.js before deploying, and it compares the
   result against the file on disk with `!==` — so the assembled text has to stay a
   plain string. (An earlier version returned `{ text, scoped }` and sync wrote the
   object straight to disk: ERR_INVALID_ARG_TYPE, three suites red. Count the
   selectors separately instead of changing this contract.) */
function assembleText() {
  return assemble().text
}

function scopedSelectors() {
  const raw = fs.readFileSync(CSS_FILE, 'utf8')
  return raw.split(SCOPE_TOKEN).length - 1
}

/* The version is written down three times — `BUILD_ID` here, `package.json`, and
   `plugin.yaml` — and the three have drifted apart before (SEC-07). A plugin that
   reports one version while its manifest declares another is not trustable, so the
   build refuses rather than shipping the mismatch. Read all three and report every
   pair that disagrees; `undefined` means the field could not be located at all. */
function readVersions() {
  const pkg = JSON.parse(fs.readFileSync(PKG_FILE, 'utf8')).version
  const yaml = (fs.readFileSync(YAML_FILE, 'utf8').match(/^version:\s*['"]?([^'"\s]+)['"]?\s*$/m) || [])[1]
  const build = (fs.readFileSync(TEMPLATE_FILE, 'utf8').match(/const BUILD_ID = '([^']+)'/) || [])[1]
  return [
    ['package.json (version)', pkg],
    ['plugin.yaml (version)', yaml],
    ['src/plugin.source.js (BUILD_ID)', build],
  ]
}

function versionDrift() {
  const entries = readVersions()
  const drift = []
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (entries[i][1] !== entries[j][1]) {
        drift.push(`${entries[i][0]} says ${entries[i][1] ?? 'nothing'}, ${entries[j][0]} says ${entries[j][1] ?? 'nothing'}`)
      }
    }
  }
  return drift
}

/* Refuse before assembling anything when the three version sources disagree. Kept
   inside `assemble()` so every entry point — `main()`, `--check`, and `sync.js`
   (which calls assembleText) — passes through it: a drift must stop the build AND the
   deploy, not just a direct build. It exits instead of throwing so no caller can catch
   the failure and go on to write a half-versioned artifact. */
function versionGuard() {
  const drift = versionDrift()
  if (drift.length === 0) return
  console.error('[build] REFUSING: the version is not the same in all three places.')
  for (const line of drift) console.error(`        ${line}`)
  console.error('        Align the manifest and the shipped BUILD_ID before building or deploying.')
  process.exit(1)
}

function main() {
  const check = process.argv.includes('--check')
  const { text: built, scoped } = assemble()
  const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : null

  if (current === built) {
    console.log(`[build] src/plugin.js is current (${built.length} chars, ${scoped} scoped selectors)`)
    return 0
  }
  if (check) {
    console.error('[build] REFUSING: src/plugin.js is not what src/plugin.source.js + src/plugin.css assemble to.')
    console.error('        One of them was edited apart from the others. Run `node scripts/build-plugin.js`,')
    console.error('        or if src/plugin.js was hand-edited, move that edit into the source files.')
    return 1
  }
  fs.writeFileSync(OUT_FILE, built)
  const delta = artifactForDelta(built, current)
  console.log(`[build] assembled src/plugin.js — ${built.length} chars${delta}`)
  return 0
}

function artifactForDelta(built, current) {
  if (current === null) return ' (created)'
  const d = built.length - current.length
  return ` (was ${current.length}, ${d >= 0 ? '+' : ''}${d})`
}

if (require.main === module) process.exit(main())
module.exports = { assemble: assembleText, scopedSelectors, MARKER }
