#!/usr/bin/env node
/**
 * scripts/sync.js
 *
 * Compiles and synchronizes the canonical source `src/plugin.js`
 * into `plugin.js` and the local Hermes desktop plugins folder.
 *
 * Also deploys the skin's own stylesheet: this repo's `bubbles.yaml` is the
 * canonical copy of `~/.hermes/skins/bubbles.yaml`, the file Hermes injects as
 * customCSS. Before this step existed, editing that file meant hand-copying it and
 * hoping the two copies had not drifted.
 *
 *   node scripts/sync.js                # plugin + skin (when the live skin is ours)
 *   node scripts/sync.js --force-skin   # deploy over a live skin edited elsewhere
 *   node scripts/sync.js --no-skin      # plugin only
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const { blockScalar, customCssCap } = require('./lib/sheets')

const ROOT_DIR = path.resolve(__dirname, '..')
const SRC_FILE = path.join(ROOT_DIR, 'src', 'plugin.js')
const TARGET_ROOT_FILE = path.join(ROOT_DIR, 'plugin.js')

const SKIN_NAME = 'bubbles'
const SKIN_SOURCE_FILE = path.join(ROOT_DIR, `${SKIN_NAME}.yaml`)

const HOME_DIR = process.env.HOME || ''
const HERMES_DIR = process.env.HERMES_HOME || path.join(HOME_DIR, '.hermes')
const LOCAL_HERMES_PLUGIN_DIR = path.join(HERMES_DIR, 'desktop-plugins', 'hermes-bubbles-skin')
const SKIN_TARGET_FILE = path.join(HERMES_DIR, 'skins', `${SKIN_NAME}.yaml`)
// Records what we last deployed, so a live skin changed by `hermes skin ...` is
// detected rather than silently overwritten. It sits beside the file it describes
// (and deliberately not in the repo, so a test HOME isolates it).
const SKIN_STAMP_FILE = path.join(HERMES_DIR, 'skins', `.${SKIN_NAME}.deployed-sha`)

const sha256 = text => crypto.createHash('sha256').update(text).digest('hex')

/* Reject anything we do not recognise BEFORE doing work. sync.js used to test for
   its two flags with argv.includes(), so `--dry-run`, `--on-skin`, or a stray
   positional parsed as "plain deploy" — and the plain deploy overwrites the live
   skin the user is running. An unknown flag must be an error, never a guess. */
const KNOWN_FLAGS = ['--force-skin', '--no-skin']
const unknownArgs = process.argv.slice(2).filter(a => !KNOWN_FLAGS.includes(a))
if (unknownArgs.length) {
  console.error(`[sync] Unknown argument(s): ${unknownArgs.join(' ')}`)
  console.error(`[sync] Accepted: (none), ${KNOWN_FLAGS.join(', ')}`)
  console.error('[sync] Nothing was deployed.')
  process.exit(2)
}
const die = msg => {
  console.error(`\n[sync] REFUSING — ${msg}\n`)
  process.exit(1)
}

if (!fs.existsSync(SRC_FILE)) {
  console.error(`[sync] Error: Source file not found at ${SRC_FILE}`)
  process.exit(1)
}

const sourceContent = fs.readFileSync(SRC_FILE, 'utf8')

/* Refuse to deploy something that cannot even parse. PLUGIN_CSS is one big JS
   template literal, so a stray backtick inside a CSS comment ends the string
   early: the file still looks like CSS, Node refuses to load it, and the runtime
   reports nothing useful. This has happened three times; the check belongs in the
   deploy door, not only in the test suite. */
try {
  execFileSync(process.execPath, ['--check', SRC_FILE], { stdio: 'pipe' })
} catch (e) {
  die(`src/plugin.js does not parse:\n${(e.stderr || '').toString().trim().split('\n').slice(0, 6).join('\n')}`)
}

/* "I deployed it and the window didn't change" is the most common report, and it
   used to be unanswerable from the inside: both the plugin JS and the skin's
   customCSS are read once per renderer document. Stamp the deploy identity into the
   generated file so the running window can name the build it loaded (see the
   data-bubbles-build attribute in installStyles). */
const headSha = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: ROOT_DIR, stdio: 'pipe' }).toString().trim()
  } catch {
    return 'nogit'
  }
})()
const buildTag = `${headSha}+${sha256(sourceContent).slice(0, 8)}`

const generatedBanner = `/**\n * DO NOT EDIT DIRECTLY.\n * Generated from src/plugin.js via \`node scripts/sync.js\`.\n * Build ${buildTag}\n */\n\n`
const outputContent = `${generatedBanner}${sourceContent}\nglobalThis.__bubblesBuild = ${JSON.stringify(buildTag)}\n`

// 1. Write root plugin.js
fs.writeFileSync(TARGET_ROOT_FILE, outputContent, 'utf8')
console.log(`[sync] Wrote ${TARGET_ROOT_FILE}`)

// 2. Sync to local runtime if ~/.hermes/desktop-plugins exists
if (fs.existsSync(path.dirname(LOCAL_HERMES_PLUGIN_DIR))) {
  if (!fs.existsSync(LOCAL_HERMES_PLUGIN_DIR)) {
    fs.mkdirSync(LOCAL_HERMES_PLUGIN_DIR, { recursive: true })
  }
  fs.writeFileSync(path.join(LOCAL_HERMES_PLUGIN_DIR, 'plugin.js'), outputContent, 'utf8')
  const yamlSrc = path.join(ROOT_DIR, 'plugin.yaml')
  if (fs.existsSync(yamlSrc)) {
    fs.copyFileSync(yamlSrc, path.join(LOCAL_HERMES_PLUGIN_DIR, 'plugin.yaml'))
  }
  console.log(`[sync] Deployed to local Hermes runtime: ${LOCAL_HERMES_PLUGIN_DIR}`)
}

// 3. Deploy the skin's customCSS.
//
// Two gates, each one standing in for a failure that used to be invisible:
//   - the gateway slices customCSS at a fixed length, so an oversized file
//     silently loses the tail AND the rule the cut lands inside. Refusing here is
//     the only place that can still say so before it reaches the renderer.
//   - `hermes skin ...` writes the same file. Overwriting it without proof the
//     last write was ours would throw away edits nobody can see in a diff.
function deploySkin() {
  if (process.argv.includes('--no-skin')) {
    console.log('[sync] --no-skin: left the live skin alone')
    return
  }
  if (!fs.existsSync(SKIN_SOURCE_FILE)) {
    console.log(`[sync] No ${path.basename(SKIN_SOURCE_FILE)} in the repo — skipped skin deploy`)
    return
  }

  const desired = fs.readFileSync(SKIN_SOURCE_FILE, 'utf8')
  const css = blockScalar(desired, 'customCSS')
  if (css === null) die(`${path.basename(SKIN_SOURCE_FILE)} has no 'customCSS: |' block`)

  const cap = customCssCap()
  if (cap && css.length > cap) {
    const dropped = css.slice(cap).split('\n').filter(l => l.trim()).length
    die(`customCSS is ${css.length} chars, over the ${cap} the gateway slices at — `
      + `the tail (${dropped} non-empty lines) would vanish at runtime. `
      + 'Move component CSS into PLUGIN_CSS in src/plugin.js, which has no cap.')
  }

  if (!fs.existsSync(path.dirname(SKIN_TARGET_FILE))) {
    console.log(`[sync] No skins directory at ${path.dirname(SKIN_TARGET_FILE)} — skipped skin deploy`)
    return
  }

  const activeFile = path.join(HERMES_DIR, 'config.yaml')
  const active = fs.existsSync(activeFile)
    ? ((fs.readFileSync(activeFile, 'utf8').match(/^\s*skin:\s*['"]?([\w-]+)/m) || [])[1] ?? null)
    : null
  if (active && active !== SKIN_NAME) {
    console.log(`[sync] note: config.yaml activates skin '${active}', not '${SKIN_NAME}' — `
      + `deploying to ${SKIN_TARGET_FILE} will not change what renders`)
  }

  const live = fs.existsSync(SKIN_TARGET_FILE) ? fs.readFileSync(SKIN_TARGET_FILE, 'utf8') : null
  const stamp = fs.existsSync(SKIN_STAMP_FILE) ? fs.readFileSync(SKIN_STAMP_FILE, 'utf8').trim() : ''
  const desiredSha = sha256(desired)

  if (live === desired) {
    if (stamp !== desiredSha) fs.writeFileSync(SKIN_STAMP_FILE, desiredSha)
    console.log(`[sync] Skin up to date: ${SKIN_TARGET_FILE} (${css.length}/${cap ?? '?'} chars)`)
    return
  }

  const force = process.argv.includes('--force-skin')
  if (live !== null && stamp && sha256(live) !== stamp && !force) {
    die(`${SKIN_TARGET_FILE} was changed outside this script. Compare with:\n`
      + `         diff ${path.relative(ROOT_DIR, SKIN_SOURCE_FILE)} ${SKIN_TARGET_FILE}\n`
      + '       then re-run with --force-skin to deploy over it, or copy it back into the repo.')
  }

  if (live !== null) {
    fs.writeFileSync(`${SKIN_TARGET_FILE}.bak`, live, 'utf8')
    console.log(`[sync] Backed up the previous live skin to ${SKIN_TARGET_FILE}.bak`)
  }
  fs.writeFileSync(SKIN_TARGET_FILE, desired, 'utf8')
  fs.writeFileSync(SKIN_STAMP_FILE, desiredSha)
  console.log(`[sync] Deployed skin → ${SKIN_TARGET_FILE} (customCSS ${css.length}/${cap ?? '?'} chars)`)
}

deploySkin()

console.log('[sync] Synchronization completed successfully.')
console.log(`[sync] Build ${buildTag}`)
console.log('[sync] Restart Hermes with Cmd+Q (not just close the window) — the plugin\n'
  + '       JS and the skin customCSS are both loaded once per renderer document.\n'
  + '       To confirm which build a window is painting, run in its DevTools console:\n'
  + `       console.log(document.documentElement.getAttribute('data-bubbles-build'))  # ${buildTag}`)
