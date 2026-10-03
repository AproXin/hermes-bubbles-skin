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
 * `%SKIN%` (233 times), which stands for `html[data-bubbles-skin='true']`. The
 * alternative — a CSS nesting wrapper — would have moved 233 literal selectors
 * into a block whose cascade position decides who wins, and a single missing brace
 * in a 1,900-line sheet redefines the scope of everything after it without any
 * parse error. Expanding a token cannot do that: the bytes PLUGIN_CSS ships are
 * the same bytes as before, and `node scripts/build-plugin.js` refuses to emit a
 * sheet where the token survived. Renaming the scope attribute is now one edit
 * here plus one rebuild, instead of 233 edits that each silently un-scope a rule.
 */

const fs = require('fs')
const path = require('path')
const { REPO } = require('./lib/sheets')

const MARKER = '/* __PLUGIN_CSS_BODY__ */'
const TEMPLATE_FILE = path.join(REPO, 'src', 'plugin.source.js')
const CSS_FILE = path.join(REPO, 'src', 'plugin.css')
const OUT_FILE = path.join(REPO, 'src', 'plugin.js')

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
