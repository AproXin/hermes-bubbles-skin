/**
 * test/skin-source.js
 *
 * The skin Hermes actually loads is ~/.hermes/skins/<skin>.yaml, chosen by the
 * `skin:` key in ~/.hermes/config.yaml — not the repo copy. The repo copy is a
 * fixture for offline runs and drifts silently, which makes source-text
 * assertions pass against a file that is not the one producing pixels.
 *
 * Resolution order: live skin (what the renderer sees) → repo fixture.
 *
 * The resolution itself lives in scripts/lib/sheets.js, which the browser suites and
 * the preview renderer already share. This file is only the test-facing vocabulary
 * (path + a label saying whether what a suite asserts is real pixels or a fixture);
 * it used to carry a third copy of the resolver.
 */

const path = require('path')
const { REPO, skinYamlPath, activeSkinName } = require('../scripts/lib/sheets')

const REPO_SKIN = path.join(REPO, 'bubbles.yaml')

/** Absolute path to the skin file a source assertion should read. */
const skinSourcePath = () => skinYamlPath()

/** 'live' when the assertions describe real pixels, 'fixture' when they do not. */
const skinSourceLabel = () => (skinSourcePath() === REPO_SKIN ? 'fixture' : 'live')

module.exports = { skinSourcePath, skinSourceLabel, activeSkinName, REPO_SKIN }
