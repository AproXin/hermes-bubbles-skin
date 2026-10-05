#!/usr/bin/env node
/**
 * scripts/sync.js
 *
 * Compiles and synchronizes the plugin. The hand-edited sources are
 * `src/plugin.source.js` (the JavaScript) and `src/plugin.css` (its stylesheet);
 * `src/plugin.js` is what they assemble to, and it is the file this script deploys to
 * `plugin.js` and the local Hermes desktop plugins folder.
 *
 * Also deploys the skin's own stylesheet: this repo's `bubbles.yaml` is the
 * canonical copy of `~/.hermes/skins/bubbles.yaml`, the file Hermes injects as
 * customCSS. Before this step existed, editing that file meant hand-copying it and
 * hoping the two copies had not drifted.
 *
 *   node scripts/sync.js                # plugin + skin (when the live skin is ours)
 *   node scripts/sync.js --force-skin   # deploy over a live skin edited elsewhere
 *   node scripts/sync.js --no-skin      # plugin only
 *   node scripts/sync.js --rollback     # restore plugin + skin to latest backup
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const { blockScalar, customCssCap, activeSkinNameOrNull } = require('./lib/sheets')
const buildPlugin = require('./build-plugin')

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
const KNOWN_FLAGS = ['--force-skin', '--no-skin', '--rollback']
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

const MAX_BACKUPS = 5

function getBackupTimestamp(backupRoot) {
  const base = new Date().toISOString().replace(/[:.]/g, '-')
  let candidate = base
  let counter = 1
  while (fs.existsSync(path.join(backupRoot, candidate))) {
    candidate = `${base}_${counter++}`
  }
  return candidate
}

function pruneBackups(backupRoot, max = MAX_BACKUPS) {
  if (!fs.existsSync(backupRoot)) return
  const entries = fs.readdirSync(backupRoot)
    .filter(name => !name.startsWith('.'))
    .map(name => ({ name, fullPath: path.join(backupRoot, name) }))
    .filter(e => {
      try {
        return fs.statSync(e.fullPath).isDirectory()
      } catch {
        return false
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  if (entries.length > max) {
    const toRemove = entries.slice(0, entries.length - max)
    for (const e of toRemove) {
      try {
        fs.rmSync(e.fullPath, { recursive: true, force: true })
      } catch {}
    }
  }
}

function handleRollback() {
  const BACKUP_ROOT = path.join(LOCAL_HERMES_PLUGIN_DIR, '.backup')
  if (!fs.existsSync(BACKUP_ROOT)) {
    die(`no backup directory found at ${BACKUP_ROOT}`)
  }

  const entries = fs.readdirSync(BACKUP_ROOT)
    .filter(name => !name.startsWith('.'))
    .map(name => ({ name, fullPath: path.join(BACKUP_ROOT, name) }))
    .filter(e => {
      try {
        return fs.statSync(e.fullPath).isDirectory()
      } catch {
        return false
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  if (!entries.length) {
    die(`no backup snapshots found in ${BACKUP_ROOT}`)
  }

  const latest = entries[entries.length - 1]
  const backupDir = latest.fullPath

  // 1. Restore plugin
  const backupPluginJs = path.join(backupDir, 'plugin.js')
  if (!fs.existsSync(backupPluginJs)) {
    die(`backup snapshot ${latest.name} is missing plugin.js`)
  }
  if (!fs.existsSync(LOCAL_HERMES_PLUGIN_DIR)) {
    fs.mkdirSync(LOCAL_HERMES_PLUGIN_DIR, { recursive: true })
  }
  fs.copyFileSync(backupPluginJs, path.join(LOCAL_HERMES_PLUGIN_DIR, 'plugin.js'))
  console.log(`[sync] Rolled back plugin.js from ${backupPluginJs}`)

  const backupPluginYaml = path.join(backupDir, 'plugin.yaml')
  if (fs.existsSync(backupPluginYaml)) {
    fs.copyFileSync(backupPluginYaml, path.join(LOCAL_HERMES_PLUGIN_DIR, 'plugin.yaml'))
    console.log(`[sync] Rolled back plugin.yaml from ${backupPluginYaml}`)
  }

  // 2. Restore skin
  const backupSkin = path.join(backupDir, `${SKIN_NAME}.yaml`)
  const liveSkinBak = `${SKIN_TARGET_FILE}.bak`
  if (fs.existsSync(backupSkin)) {
    const skinContent = fs.readFileSync(backupSkin, 'utf8')
    if (!fs.existsSync(path.dirname(SKIN_TARGET_FILE))) {
      fs.mkdirSync(path.dirname(SKIN_TARGET_FILE), { recursive: true })
    }
    fs.writeFileSync(SKIN_TARGET_FILE, skinContent, 'utf8')
    fs.writeFileSync(SKIN_STAMP_FILE, sha256(skinContent))
    console.log(`[sync] Rolled back skin → ${SKIN_TARGET_FILE}`)
  } else if (fs.existsSync(liveSkinBak)) {
    const skinContent = fs.readFileSync(liveSkinBak, 'utf8')
    if (!fs.existsSync(path.dirname(SKIN_TARGET_FILE))) {
      fs.mkdirSync(path.dirname(SKIN_TARGET_FILE), { recursive: true })
    }
    fs.writeFileSync(SKIN_TARGET_FILE, skinContent, 'utf8')
    fs.writeFileSync(SKIN_STAMP_FILE, sha256(skinContent))
    console.log(`[sync] Rolled back skin from .bak → ${SKIN_TARGET_FILE}`)
  } else {
    console.log('[sync] No skin backup found — left live skin alone')
  }

  console.log('[sync] Rollback completed successfully.')
  console.log(`[sync] Restored from snapshot: ${latest.name}`)
  console.log('[sync] Restart Hermes with Cmd+Q (not just close the window) — the plugin\n'
    + '       JS and the skin customCSS are both loaded once per renderer document.')
}

if (process.argv.includes('--rollback')) {
  if (process.argv.length > 3) {
    console.error('[sync] --rollback cannot be combined with other arguments.')
    process.exit(2)
  }
  handleRollback()
  process.exit(0)
}

/* `src/plugin.js` is the build output of `src/plugin.source.js` + `src/plugin.css`
   (see scripts/build-plugin.js). Refresh it first so no deploy can carry a stylesheet
   that disagrees with the JS it ships beside. A drift here is almost always a
   hand-edit to the output, so the delta is announced instead of swallowed. */
let assembled
try {
  assembled = buildPlugin.assemble()
} catch (e) {
  die(`cannot assemble the plugin from src/plugin.source.js + src/plugin.css — ${e.message}`)
}
const artifactBefore = fs.existsSync(SRC_FILE) ? fs.readFileSync(SRC_FILE, 'utf8') : null
if (assembled !== artifactBefore) {
  fs.writeFileSync(SRC_FILE, assembled)
  console.log(`[sync] Rebuilt src/plugin.js from its two source files (${assembled.length} chars`
    + (artifactBefore === null ? ', was missing' : `, was ${artifactBefore.length}`) + ')')
  console.log('[sync] If that was a hand-edit to src/plugin.js, it is now in src/plugin.source.js'
    + ' / src/plugin.css only if you move it there — commit the sources, not just the rebuild.')
}

const sourceContent = assembled

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

/* The deploy identity. Deliberately derived from the source alone: an earlier version
   embedded `git rev-parse HEAD`, which made the generated plugin.js impossible to
   commit without immediately going stale (committing it moves HEAD). A content hash
   answers the same question — "which deploy is this window painting" — and keeps sync
   idempotent, which test/sync-deploys-skin.test.js now asserts. The git sha is still
   printed, just not baked into the file. */
const buildTag = sha256(sourceContent).slice(0, 10)
const headSha = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: ROOT_DIR, stdio: 'pipe' }).toString().trim()
  } catch {
    return 'nogit'
  }
})()

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

  const livePluginJs = path.join(LOCAL_HERMES_PLUGIN_DIR, 'plugin.js')
  const livePluginYaml = path.join(LOCAL_HERMES_PLUGIN_DIR, 'plugin.yaml')

  if (fs.existsSync(livePluginJs)) {
    const BACKUP_ROOT = path.join(LOCAL_HERMES_PLUGIN_DIR, '.backup')
    fs.mkdirSync(BACKUP_ROOT, { recursive: true })
    const stamp = getBackupTimestamp(BACKUP_ROOT)
    const backupDir = path.join(BACKUP_ROOT, stamp)
    fs.mkdirSync(backupDir, { recursive: true })

    fs.copyFileSync(livePluginJs, path.join(backupDir, 'plugin.js'))
    if (fs.existsSync(livePluginYaml)) {
      fs.copyFileSync(livePluginYaml, path.join(backupDir, 'plugin.yaml'))
    }
    if (fs.existsSync(SKIN_TARGET_FILE)) {
      fs.copyFileSync(SKIN_TARGET_FILE, path.join(backupDir, `${SKIN_NAME}.yaml`))
    }
    pruneBackups(BACKUP_ROOT)
    console.log(`[sync] Backed up previous plugin to ${backupDir}`)
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

  /* "Which skin is active" is answered once, in sheets.js — this was its sixth copy. The
     null case is what this call site needs: no config.yaml is not the same statement as a
     config that happens to select bubbles. */
  const active = activeSkinNameOrNull()
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
console.log(`[sync] Build ${buildTag} (source hash; HEAD ${headSha})`)
console.log('[sync] To roll back to the previous deployment: node scripts/sync.js --rollback')
console.log('[sync] Restart Hermes with Cmd+Q (not just close the window) — the plugin\n'
  + '       JS and the skin customCSS are both loaded once per renderer document.\n'
  + '       To confirm which build a window is painting, run in its DevTools console:\n'
  + `       console.log(document.documentElement.getAttribute('data-bubbles-build'))  # ${buildTag}`)
