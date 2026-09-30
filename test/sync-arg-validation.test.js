/**
 * test/sync-arg-validation.test.js
 *
 * `node scripts/sync.js --dry-run` deployed the live skin. sync.js only ever
 * looked for the two flags it knows about with `argv.includes(...)`, so every
 * other token — a typo, a flag copied from another tool, `--dry-run` itself —
 * meant "plain deploy". The deploy step overwrites ~/.hermes/skins/bubbles.yaml,
 * so the failure mode is silently rewriting the user's running theme.
 *
 * Unknown arguments now have to fail before anything is written. The suites runs
 * against a throwaway HERMES_HOME so it cannot touch the real install either way.
 *   node test/sync-arg-validation.test.js
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const REPO = path.join(__dirname, '..')
const SYNC = path.join(REPO, 'scripts', 'sync.js')

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bubbles-sync-args-'))
const run = args => spawnSync(process.execPath, [SYNC, ...args], {
  cwd: REPO,
  encoding: 'utf8',
  env: { ...process.env, HERMES_HOME: home },
})

console.log('\n=== sync.js Argument Validation Suite ===\n')
let failures = 0
const check = (name, fn) => {
  try { fn(); console.log(`  ✓ ${name}`) } catch (err) {
    failures += 1
    console.log(`  ✗ ${name} — ${err.message}`)
  }
}

try {
  check('--dry-run is refused, not treated as a plain deploy', () => {
    const r = run(['--dry-run'])
    assert.notStrictEqual(r.status, 0, `exit was ${r.status}; stdout:\n${r.stdout}`)
    assert.match(`${r.stderr}${r.stdout}`, /--dry-run/, 'the message must name the rejected flag')
  })

  check('a typo is refused too', () => {
    const r = run(['--on-skin'])
    assert.notStrictEqual(r.status, 0, 'a mistyped flag must not silently deploy')
  })

  check('the rejection happens before any work, not after it', () => {
    // Asserting the throwaway HOME stayed empty would pass for the wrong reason:
    // with no prior skin, the foreign-edit guard skips that step anyway. The
    // success line is the honest signal that a deploy ran at all.
    const r = run(['--dry-run'])
    assert.doesNotMatch(r.stdout, /Synchronization completed/, 'it deployed and then complained')
    assert.doesNotMatch(r.stdout, /Deployed skin/, 'it wrote the live skin')
  })

  check('the known flags still parse', () => {
    const r = run(['--no-skin'])
    assert.strictEqual(r.status, 0, `--no-skin should still work; exit ${r.status}\n${r.stderr}`)
  })

  check('and the accepted flags are listed when a bad one is passed', () => {
    const r = run(['--nope'])
    const out = `${r.stderr}${r.stdout}`
    assert.match(out, /--no-skin/, 'the error should say what IS accepted')
    assert.match(out, /--force-skin/)
  })
} finally {
  fs.rmSync(home, { recursive: true, force: true })
}

console.log(`\n${failures ? 'FAIL' : 'OK'} — ${5 - failures}/5 assertions`)
process.exit(failures ? 1 : 0)
