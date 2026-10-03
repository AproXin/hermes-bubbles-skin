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
 */

const fs = require('fs')
const path = require('path')
const { REPO } = require('./lib/sheets')

const MARKER = '/* __PLUGIN_CSS_BODY__ */'
const TEMPLATE_FILE = path.join(REPO, 'src', 'plugin.source.js')
const CSS_FILE = path.join(REPO, 'src', 'plugin.css')
const OUT_FILE = path.join(REPO, 'src', 'plugin.js')

function assemble() {
  const template = fs.readFileSync(TEMPLATE_FILE, 'utf8')
  const hits = template.split(MARKER).length - 1
  if (hits === 0) throw new Error(`${path.basename(TEMPLATE_FILE)} has no marker line — the stylesheet would be dropped silently`)
  if (hits > 1) throw new Error(`${path.basename(TEMPLATE_FILE)} has ${hits} marker lines — the stylesheet would be pasted ${hits} times`)

  const css = fs.readFileSync(CSS_FILE, 'utf8').replace(/\n$/, '')
  if (css.includes('`')) {
    const line = css.slice(0, css.indexOf('`')).split('\n').length
    throw new Error(`src/plugin.css line ${line} has a backtick — it would truncate PLUGIN_CSS in the assembled plugin`)
  }
  // The marker occupies its own line between the literal's opening and closing
  // backticks, so the body is substituted for the marker text alone.
  return template.split(MARKER).join(css)
}

function main() {
  const check = process.argv.includes('--check')
  const built = assemble()
  const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : null

  if (current === built) {
    console.log(`[build] src/plugin.js is current (${built.length} chars)`)
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
module.exports = { assemble, MARKER }
