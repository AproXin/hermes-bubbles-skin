/**
 * test/skin-source.js
 *
 * The skin Hermes actually loads is ~/.hermes/skins/<skin>.yaml, chosen by the
 * `skin:` key in ~/.hermes/config.yaml — not the repo copy. The repo copy is a
 * fixture for offline runs and drifts silently, which makes source-text
 * assertions pass against a file that is not the one producing pixels.
 *
 * Resolution order: live skin (what the renderer sees) → repo fixture.
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

const HOME = os.homedir()
const HERMES_HOME = process.env.HERMES_HOME || path.join(HOME, '.hermes')
const REPO_SKIN = path.join(__dirname, '..', 'bubbles.yaml')

function activeSkinName() {
  const configFile = path.join(HERMES_HOME, 'config.yaml')
  if (!fs.existsSync(configFile)) return 'bubbles'
  const raw = fs.readFileSync(configFile, 'utf8')
  return (raw.match(/^\s*skin:\s*['"]?([\w-]+)/m) || [])[1] || 'bubbles'
}

/** Absolute path to the skin file a source assertion should read. */
function skinSourcePath() {
  const live = path.join(HERMES_HOME, 'skins', `${activeSkinName()}.yaml`)
  return fs.existsSync(live) ? live : REPO_SKIN
}

/** 'live' when the assertions describe real pixels, 'fixture' when they do not. */
function skinSourceLabel() {
  return skinSourcePath() === REPO_SKIN ? 'fixture' : 'live'
}

module.exports = { skinSourcePath, skinSourceLabel, activeSkinName, REPO_SKIN }
