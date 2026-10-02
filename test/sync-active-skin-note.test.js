/**
 * test/sync-active-skin-note.test.js
 *
 * When config.yaml activates a different skin, `node scripts/sync.js` prints
 * "deploying to ~/.hermes/skins/bubbles.yaml will not change what renders" and
 * deploys anyway. That sentence is the only warning a user gets before they edit
 * one skin, run the deploy, restart the app, and see nothing move — the failure
 * reads as "my CSS change had no effect" and points at the CSS, not at config.yaml.
 *
 * Nothing asserted on it, so the note could be deleted, or turned into a hard
 * refusal, or start firing for every HOME, and the suites would stay green.
 *
 * The three states the message depends on are easy to collapse into each other, and
 * `activeSkinNameOrNull()` exists precisely to keep them apart:
 *   - a config that selects another skin  → warn
 *   - a config that selects OUR skin      → silent
 *   - no config, or a config with no `skin:` key → silent ("nothing is selected"
 *     is not the same statement as "something else is selected")
 *   node test/sync-active-skin-note.test.js
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const REPO = path.join(__dirname, '..')
const SYNC = path.join(REPO, 'scripts', 'sync.js')

/* A throwaway HERMES_HOME, because sync reads config.yaml and writes the live skin
   under it. The repo root's generated plugin.js is HOME-independent and gets
   rewritten by every run; sync-deploys-skin.test.js is what pins that output. */
function homeWith(configYaml) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bubbles-active-skin-'))
  fs.mkdirSync(path.join(home, 'skins'))
  if (configYaml !== null) fs.writeFileSync(path.join(home, 'config.yaml'), configYaml, 'utf8')
  return home
}

const run = home => spawnSync(process.execPath, [SYNC], {
  cwd: REPO,
  encoding: 'utf8',
  env: { ...process.env, HERMES_HOME: home },
})

/** The note is a `console.log`, so stdout is the only place it can appear. */
const isNote = line => line.includes('will not change what renders')

const homes = []
const syncRun = configYaml => {
  const home = homeWith(configYaml)
  homes.push(home)
  return run(home)
}

console.log('\n=== sync.js Active-Skin Note Suite ===\n')
let failures = 0
const check = (name, fn) => {
  try { fn(); console.log(`  ✓ ${name}`) } catch (err) {
    failures += 1
    console.log(`  ✗ ${name} — ${err.message}`)
  }
}

try {
  check('another skin in config.yaml produces the note', () => {
    const r = syncRun("skin: 'starlight'\n")
    assert.strictEqual(r.status, 0, `exit was ${r.status}\n${r.stderr}`)
    assert.ok(r.stdout.split('\n').some(isNote), `no note in stdout:\n${r.stdout}`)
  })

  check('the note names the skin that actually has the screen', () => {
    const r = syncRun("skin: 'starlight'\n")
    const line = r.stdout.split('\n').find(isNote) || ''
    assert.ok(line.includes('starlight'), `expected the active name, got: ${line}`)
    assert.ok(line.includes('bubbles'), `expected the deployed name, got: ${line}`)
  })

  check('and it stays a note: the deploy still runs', () => {
    const r = syncRun("skin: 'starlight'\n")
    assert.match(r.stdout, /Deployed skin/, 'refusing to deploy would be a different contract')
    assert.strictEqual(fs.existsSync(path.join(homes[homes.length - 1], 'skins', 'bubbles.yaml')), true,
      'the skin file was not written')
  })

  check('config.yaml selecting our own skin says nothing', () => {
    const r = syncRun('skin: bubbles\n')
    assert.strictEqual(r.status, 0, `exit was ${r.status}\n${r.stderr}`)
    assert.ok(!r.stdout.split('\n').some(isNote), 'a correct config must not be warned at')
  })

  check('no config.yaml at all is not "a different skin"', () => {
    const r = syncRun(null)
    assert.strictEqual(r.status, 0, `exit was ${r.status}\n${r.stderr}`)
    assert.ok(!r.stdout.split('\n').some(isNote),
      'nothing is selected here; warning would train the user to ignore it')
  })

  check('a config with no skin: key is silent too', () => {
    const r = syncRun('theme: dark\nmodels:\n  default: glm-4.6\n')
    assert.strictEqual(r.status, 0, `exit was ${r.status}\n${r.stderr}`)
    assert.ok(!r.stdout.split('\n').some(isNote), `parsed a skin out of unrelated keys:\n${r.stdout}`)
  })
} finally {
  for (const home of homes) fs.rmSync(home, { recursive: true, force: true })
}

console.log(`\n${failures ? 'FAIL' : 'OK'} — ${6 - failures}/6 assertions`)
process.exit(failures ? 1 : 0)
