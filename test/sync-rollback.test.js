/**
 * test/sync-rollback.test.js
 *
 * Verifies that scripts/sync.js creates timestamped backups of the live plugin
 * (and skin) in ~/.hermes/desktop-plugins/hermes-bubbles-skin/.backup/<timestamp>/
 * before overwriting them, and that `node scripts/sync.js --rollback` restores
 * both the plugin and the skin to the most recent backup snapshot.
 *
 * Runs against a temporary HERMES_HOME so the real Hermes runtime is never touched.
 *   node test/sync-rollback.test.js
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')

const { REPO } = require('../scripts/lib/sheets')
const SYNC = path.join(REPO, 'scripts', 'sync.js')
const SKIN_SOURCE = path.join(REPO, 'bubbles.yaml')

const md5Of = buf => crypto.createHash('md5').update(buf).digest('hex')
const sha256Of = buf => crypto.createHash('sha256').update(buf).digest('hex')

const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bubbles-sync-rollback-'))
const hermesRoot = path.join(testHome, '.hermes')
const pluginDir = path.join(hermesRoot, 'desktop-plugins', 'hermes-bubbles-skin')
const backupRoot = path.join(pluginDir, '.backup')
const skinsDir = path.join(hermesRoot, 'skins')
const liveSkinFile = path.join(skinsDir, 'bubbles.yaml')
const liveSkinStamp = path.join(skinsDir, '.bubbles.deployed-sha')

fs.mkdirSync(path.join(hermesRoot, 'desktop-plugins'), { recursive: true })
fs.mkdirSync(skinsDir, { recursive: true })
fs.writeFileSync(path.join(hermesRoot, 'config.yaml'), 'skin: bubbles\n')

const runSync = args => spawnSync(process.execPath, [SYNC, ...args], {
  cwd: REPO,
  encoding: 'utf8',
  env: { ...process.env, HERMES_HOME: hermesRoot },
})

console.log('\n=== sync.js Backup and Rollback Suite ===\n')
let failures = 0
const check = (name, fn) => {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failures += 1
    console.log(`  ✗ ${name} — ${err.message}`)
  }
}

try {
  check('--rollback with unknown/extra flags is refused', () => {
    const res = runSync(['--rollback', '--force-skin'])
    assert.strictEqual(res.status, 2, `expected exit 2, got ${res.status}`)
    const combinedOutput = `${res.stdout}${res.stderr}`
    assert.match(combinedOutput, /--rollback cannot be combined/, 'must reject combining --rollback')
  })

  check('--rollback with no prior backups refuses gracefully', () => {
    const res = runSync(['--rollback'])
    assert.strictEqual(res.status, 1, `expected exit 1, got ${res.status}`)
    const combinedOutput = `${res.stdout}${res.stderr}`
    assert.match(combinedOutput, /REFUSING — no backup/, 'must refuse when no backup directory exists')
  })

  check('first deploy creates live files with no backup folder', () => {
    const res = runSync([])
    assert.strictEqual(res.status, 0, `deploy failed: ${res.stderr}`)
    const livePluginJs = path.join(pluginDir, 'plugin.js')
    assert.strictEqual(fs.existsSync(livePluginJs), true, 'live plugin.js must exist')
    assert.strictEqual(fs.existsSync(liveSkinFile), true, 'live skin must exist')
    assert.strictEqual(fs.existsSync(backupRoot), false, 'no backup directory on initial deploy')
    assert.match(res.stdout, /To roll back to the previous deployment: node scripts\/sync\.js --rollback/,
      'must print rollback instructions in stdout')
  })

  let originalPluginMd5
  let originalSkinContent
  check('second deploy backs up existing live plugin and skin before overwriting', () => {
    const livePluginJs = path.join(pluginDir, 'plugin.js')
    // Seed pre-deploy custom content to verify precise byte-for-byte rollback
    const customPreDeployPlugin = '/* pre-deploy plugin v1 */\nglobalThis.__customPreDeploy = 1\n'
    fs.writeFileSync(livePluginJs, customPreDeployPlugin, 'utf8')
    originalPluginMd5 = md5Of(fs.readFileSync(livePluginJs))

    const customPreDeploySkin = 'skin: bubbles\ncustomCSS: |\n  /* pre-deploy skin v1 */\n'
    fs.writeFileSync(liveSkinFile, customPreDeploySkin, 'utf8')
    fs.writeFileSync(liveSkinStamp, sha256Of(customPreDeploySkin), 'utf8')
    originalSkinContent = customPreDeploySkin

    const res = runSync(['--force-skin'])
    assert.strictEqual(res.status, 0, `second deploy failed: ${res.stderr}`)
    assert.strictEqual(fs.existsSync(backupRoot), true, '.backup directory must exist')

    const snapshots = fs.readdirSync(backupRoot).filter(s => !s.startsWith('.'))
    assert.strictEqual(snapshots.length, 1, `expected 1 snapshot, got ${snapshots.length}`)

    const snapshotDir = path.join(backupRoot, snapshots[0])
    const backedUpPluginJs = path.join(snapshotDir, 'plugin.js')
    const backedUpSkinYaml = path.join(snapshotDir, 'bubbles.yaml')

    assert.strictEqual(fs.existsSync(backedUpPluginJs), true, 'backup must contain plugin.js')
    assert.strictEqual(fs.existsSync(backedUpSkinYaml), true, 'backup must contain bubbles.yaml')

    const backedUpMd5 = md5Of(fs.readFileSync(backedUpPluginJs))
    assert.strictEqual(backedUpMd5, originalPluginMd5, 'backed up plugin MD5 must match pre-deploy MD5')
    assert.strictEqual(fs.readFileSync(backedUpSkinYaml, 'utf8'), originalSkinContent, 'backed up skin must match pre-deploy skin')

    // Verify live file was indeed overwritten
    const currentLiveMd5 = md5Of(fs.readFileSync(livePluginJs))
    assert.notStrictEqual(currentLiveMd5, originalPluginMd5, 'live plugin must have been overwritten by deploy')
  })

  check('--rollback restores live plugin and skin to pre-deploy fingerprint', () => {
    const livePluginJs = path.join(pluginDir, 'plugin.js')
    const res = runSync(['--rollback'])
    assert.strictEqual(res.status, 0, `rollback failed: ${res.stderr}`)

    const restoredPluginMd5 = md5Of(fs.readFileSync(livePluginJs))
    assert.strictEqual(restoredPluginMd5, originalPluginMd5,
      `restored plugin MD5 (${restoredPluginMd5}) must match pre-deploy MD5 (${originalPluginMd5})`)

    const restoredSkin = fs.readFileSync(liveSkinFile, 'utf8')
    assert.strictEqual(restoredSkin, originalSkinContent, 'restored skin must match pre-deploy skin content')

    const restoredStamp = fs.readFileSync(liveSkinStamp, 'utf8').trim()
    assert.strictEqual(restoredStamp, sha256Of(originalSkinContent), 'restored stamp must match sha256 of restored skin')

    assert.match(res.stdout, /Rolled back plugin\.js/, 'stdout must report rolling back plugin.js')
    assert.match(res.stdout, /Rolled back skin/, 'stdout must report rolling back skin')
    assert.match(res.stdout, /Rollback completed successfully/, 'stdout must report success')
  })

  check('retention policy enforces maximum of 5 backup snapshots', () => {
    // Populate backup directory with mock snapshots to exceed MAX_BACKUPS (5)
    for (let i = 1; i <= 8; i++) {
      const mockDir = path.join(backupRoot, `2026-01-0${i}T00-00-00-000Z`)
      fs.mkdirSync(mockDir, { recursive: true })
      fs.writeFileSync(path.join(mockDir, 'plugin.js'), `/* mock ${i} */`)
    }

    const beforeCount = fs.readdirSync(backupRoot).filter(s => !s.startsWith('.')).length
    assert.strictEqual(beforeCount >= 8, true, 'seeded mock snapshots')

    // Run deploy which should prune to MAX_BACKUPS (5)
    const res = runSync(['--force-skin'])
    assert.strictEqual(res.status, 0, `deploy failed: ${res.stderr}`)

    const afterSnapshots = fs.readdirSync(backupRoot).filter(s => !s.startsWith('.')).sort()
    assert.strictEqual(afterSnapshots.length, 5, `expected 5 retained snapshots, got ${afterSnapshots.length}`)
  })
} finally {
  fs.rmSync(testHome, { recursive: true, force: true })
}

console.log(`\n${failures ? 'FAIL' : 'OK'} — ${5 - failures}/5 assertions`)
process.exit(failures ? 1 : 0)
