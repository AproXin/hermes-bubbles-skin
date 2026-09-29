/**
 * test/plugin-source-parses.test.js
 *
 * PLUGIN_CSS is one JS template literal inside plugin.js, so a stray backtick (or
 * a ${) anywhere in the CSS text — including inside a comment — ends the string
 * early. Everything after it silently stops being CSS, and the plugin's own JS
 * becomes a syntax error that the runtime never reports loudly.
 *
 * This bit the project twice, and the existing "did the CSS get truncated" guard
 * missed it: that helper looks for the terminating newline + backtick, so a
 * mid-line backtick still yields a full-looking extract. A real parse is the only
 * check that cannot be fooled.
 *   node test/plugin-source-parses.test.js
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const HOME = os.homedir()
const HERMES_HOME = process.env.HERMES_HOME || path.join(HOME, '.hermes')
const REPO = path.join(__dirname, '..')

const targets = [
  path.join(REPO, 'src', 'plugin.js'),
  path.join(HERMES_HOME, 'desktop-plugins', 'hermes-bubbles-skin', 'plugin.js'),
]

for (const file of targets) {
  if (!fs.existsSync(file)) {
    console.log(`skip (not present): ${file}`)
    continue
  }
  const src = fs.readFileSync(file, 'utf8')
  // 1. No backtick or ${ inside the CSS text: the template literal is the bug.
  const at = src.indexOf('const PLUGIN_CSS = `')
  assert(at !== -1, `${path.basename(file)}: no PLUGIN_CSS template literal found`)
  const start = src.indexOf('`', at) + 1
  const end = src.indexOf('\n`', start)
  assert(end !== -1, `${path.basename(file)}: PLUGIN_CSS template literal never closes`)
  const css = src.slice(start, end)
  const firstTick = css.indexOf('`')
  assert(firstTick === -1,
    `${path.basename(file)}: a backtick sits inside PLUGIN_CSS at offset ${firstTick}, which ends the `
    + `template literal early — the whole sheet after it is never installed. Nearby: ${JSON.stringify(
      css.slice(Math.max(0, firstTick - 60), firstTick + 60))}`)
  // A ${ interpolation is legal and intentional (line 417 injects
  // CLAMP_LINE_THRESHOLD_PX, the same way the reference injects its font stack);
  // a backtick is not, because it ends the literal. Node's parser is the arbiter.

  // 2. Node itself must accept the file. This is the part the string-slicing
  //    guards could not see.
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  } catch (err) {
    assert.fail(`${path.basename(file)} does not parse:\n${err.stderr || err.message}`)
  }
  console.log(`ok  ${path.relative(HOME, file)}  (${css.length}b CSS, parses clean)`)
}

console.log('\n=== Plugin Source Parses: PASS ===\n')
