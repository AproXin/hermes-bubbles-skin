/**
 * test/sync-deploys-skin.test.js
 *
 * scripts/sync.js now also deploys ~/.hermes/skins/bubbles.yaml from the repo copy.
 * Two things had to be true before that was safe to automate, and each gets a case:
 *
 *   1. The gateway slices customCSS at a fixed length, dropping the tail and the
 *      rule the cut lands inside — silently, at runtime. sync must refuse to deploy
 *      an oversized file instead of shipping a skin that loses CSS.
 *   2. `hermes skin ...` writes the same file. A deploy that overwrites it without
 *      noticing would discard edits that never appear in any diff here.
 *
 * Runs the real script against a throwaway HOME, so the live skin is never touched.
 *   node test/sync-deploys-skin.test.js
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

const { REPO } = require('../scripts/lib/sheets')
const SYNC = path.join(REPO, 'scripts', 'sync.js')
const SKIN_SOURCE = path.join(REPO, 'bubbles.yaml')

const skip = reason => {
  console.log(`\n=== Sync Deploys Skin Suite: SKIPPED — ${reason} ===\n`)
  process.exit(0)
}
if (!fs.existsSync(SYNC) || !fs.existsSync(SKIN_SOURCE)) skip('no scripts/sync.js or bubbles.yaml')

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bubbles-sync-'))
const HERMES = path.join(HOME, '.hermes')
const SKINS = path.join(HERMES, 'skins')
const LIVE = path.join(SKINS, 'bubbles.yaml')
const STAMP = path.join(SKINS, '.bubbles.deployed-sha')
const sha = t => crypto.createHash('sha256').update(t).digest('hex')

fs.mkdirSync(path.join(SKINS), { recursive: true })
fs.mkdirSync(path.join(HERMES, 'desktop-plugins'), { recursive: true })
fs.writeFileSync(path.join(HERMES, 'config.yaml'), 'skin: bubbles\n')

/** The cap is read out of the engine, so the fixture states it the same way. */
function setCap(n) {
  const dir = path.join(HERMES, 'hermes-agent', 'hermes_cli')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'skin_engine.py'),
    'def build(data):\n'
    + `    return {"custom_css": str(data.get("customCSS", "")).strip()[:${n}]}\n`)
}

const run = (args = []) => {
  try {
    const out = execFileSync(process.execPath, [SYNC, ...args], {
      cwd: REPO, env: { ...process.env, HOME, HERMES_HOME: '' }, encoding: 'utf8',
    })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` }
  }
}

const repoSha = sha(fs.readFileSync(SKIN_SOURCE))
const lines = []
const step = (label, ok, detail = '') => {
  lines.push(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  assert(ok, `${label}${detail ? ` — ${detail}` : ''}`)
}

// 0. The distribution artifact must already be current, and this is the only place
//    that can say so: sync writes the REPO root plugin.js (TARGET_ROOT_FILE derives
//    from the script's own location, not from HOME), so every case below refreshes it
//    as a side effect. A staleness check after the first run() can never fail.
//    The README's install command curls exactly this file, so "edited src/plugin.js,
//    forgot node scripts/sync.js" ships a stale plugin with a green suite.
const SRC_FILE = path.join(REPO, 'src', 'plugin.js')
const DIST_FILE = path.join(REPO, 'plugin.js')
const srcText = fs.readFileSync(SRC_FILE, 'utf8')
const distTag = sha(srcText).slice(0, 10)
// A deliberate second copy of sync.js's formula rather than an import: requiring
// sync.js would execute it, and the contract being checked is "the shipped bytes are
// what sync is specified to produce". Change the banner there and this fails on
// purpose — update both, in the same commit.
const distExpected = `/**\n * DO NOT EDIT DIRECTLY.\n * Generated from src/plugin.js via \`node scripts/sync.js\`.\n * Build ${distTag}\n */\n\n${srcText}\nglobalThis.__bubblesBuild = ${JSON.stringify(distTag)}\n`
step('the committed plugin.js equals what sync would write',
  fs.existsSync(DIST_FILE) && fs.readFileSync(DIST_FILE, 'utf8') === distExpected,
  `build ${distTag}`)

setCap(32768)

// 1. First deploy: nothing live yet, so the repo copy lands in the skins dir.
let r = run()
step('first run deploys the skin',
  r.code === 0 && fs.existsSync(LIVE) && fs.readFileSync(LIVE, 'utf8') === fs.readFileSync(SKIN_SOURCE, 'utf8'),
  `exit=${r.code}`)
step('and records what it deployed', fs.existsSync(STAMP))
step('with no backup of a file that did not exist', !fs.existsSync(`${LIVE}.bak`))

// 2. Nothing changed: say so, and do not churn the file.
const mtime = fs.statSync(LIVE).mtimeMs
r = run()
step('second run reports the skin up to date', /up to date/.test(r.out),
  (r.out.split('\n').find(l => /up to date/.test(l)) || '').trim())
step('second run leaves the live file untouched', fs.statSync(LIVE).mtimeMs === mtime && !fs.existsSync(`${LIVE}.bak`))

// 3. Someone edited the live skin out from under us (hermes skin ...).
fs.writeFileSync(LIVE, 'skin: bubbles\ncustomCSS: |\n  /* edited outside the repo */\n')
fs.rmSync(STAMP)
fs.writeFileSync(STAMP, sha('a-stamp-from-a-previous-deploy'))
r = run()
step('a foreign edit blocks the deploy', r.code !== 0, `exit=${r.code}`)
step('and the refusal says how to proceed', /--force-skin/.test(r.out))
step('leaving the foreign content in place', /edited outside the repo/.test(fs.readFileSync(LIVE, 'utf8')))

// 4. --force-skin overrides, but keeps one step of undo.
r = run(['--force-skin'])
step('--force-skin deploys', r.code === 0 && fs.readFileSync(LIVE, 'utf8') === fs.readFileSync(SKIN_SOURCE, 'utf8'),
  `exit=${r.code}`)
step('--force-skin backs up what it replaced',
  /edited outside the repo/.test(fs.readFileSync(`${LIVE}.bak`, 'utf8')))

// 5. Over the engine's slice: refuse, because the truncation is invisible later.
setCap(1000)
const before = fs.readFileSync(LIVE, 'utf8')
r = run(['--force-skin'])
step('an oversized customCSS is refused', r.code !== 0 && /over the 1000/.test(r.out), r.out.trim().split('\n').slice(-2)[0])
step('and nothing is written', fs.readFileSync(LIVE, 'utf8') === before)
step('the refusal names the uncapped place to put CSS', /PLUGIN_CSS/.test(r.out))

// 6. --no-skin leaves the skin alone even when it differs.
setCap(32768)
fs.writeFileSync(LIVE, 'skin: bubbles\ncustomCSS: |\n  /* keep me */\n')
r = run(['--no-skin'])
step('--no-skin skips the deploy', r.code === 0 && /keep me/.test(fs.readFileSync(LIVE, 'utf8')))
step('--no-skin still syncs the plugin', /Deployed to local Hermes runtime/.test(r.out))

// 7. The generated plugin must be a pure function of src/plugin.js. An earlier
//    version embedded `git rev-parse HEAD` in the build tag, which made the generated
//    file stale the moment it was committed (committing moves HEAD) and left the tree
//    permanently dirty after every sync.
const PLUGIN_LIVE = path.join(HERMES, 'desktop-plugins', 'hermes-bubbles-skin', 'plugin.js')
const generated = fs.readFileSync(PLUGIN_LIVE)
// --force-skin, not a bare run(): case 6 left a foreign live skin behind, and a
// refused deploy would pass the byte comparison by writing nothing at all.
r = run(['--force-skin'])
step('a repeat sync rewrites the plugin byte for byte',
  r.code === 0 && fs.readFileSync(PLUGIN_LIVE).equals(generated), `exit=${r.code}`)
step('and the embedded build tag is the source hash, not the git head',
  generated.includes(`globalThis.__bubblesBuild = ${JSON.stringify(sha(fs.readFileSync(path.join(REPO, 'src', 'plugin.js'))).slice(0, 10))}`),
  (generated.toString().match(/__bubblesBuild = .*/) || [''])[0])

// The script must never edit its own source.
step('repo bubbles.yaml untouched throughout', sha(fs.readFileSync(SKIN_SOURCE)) === repoSha)

console.log('\n=== Sync Deploys Skin Suite ===')
console.log(lines.join('\n'))
console.log(`fixtures: ${HOME}`)
console.log('\n=== Sync Deploys Skin Suite: PASS ===\n')
