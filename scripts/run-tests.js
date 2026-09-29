#!/usr/bin/env node
/**
 * scripts/run-tests.js — run the skin's verification suites.
 *
 *   node scripts/run-tests.js                 # every test/*.test.js
 *   node scripts/run-tests.js sidebar task    # only files matching a substring
 *   node scripts/run-tests.js --verbose       # keep full output for passing runs
 *
 * Sequential on purpose: most suites launch a headless browser through
 * playwright-core, and several read the live skin file. Running them in parallel
 * makes a slow machine look like a broken skin.
 *
 * A suite reports SKIP (not pass) by exiting 0 after printing "SKIPPED" — that is
 * how they stand aside when there is no Hermes checkout or no browser installed.
 * Skips are counted separately so a green run cannot quietly become all skips.
 */

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const REPO = path.join(__dirname, '..')
const TEST_DIR = path.join(REPO, 'test')

const argv = process.argv.slice(2)
const verbose = argv.includes('--verbose')
const filters = argv.filter(a => !a.startsWith('--'))

if (!fs.existsSync(TEST_DIR)) {
  console.error(`no test directory at ${TEST_DIR}`)
  process.exit(1)
}

const all = fs.readdirSync(TEST_DIR).filter(f => f.endsWith('.test.js')).sort()
const files = filters.length ? all.filter(f => filters.some(s => f.includes(s))) : all

if (!files.length) {
  console.error(`no test matched ${JSON.stringify(filters)} — available:\n  ${all.join('\n  ')}`)
  process.exit(1)
}

const results = []
const started = Date.now()

for (const file of files) {
  const label = file.replace(/\.test\.js$/, '')
  process.stdout.write(`  ${label.padEnd(34)}`)
  const run = spawnSync(process.execPath, [path.join(TEST_DIR, file)], {
    cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  })
  const out = `${run.stdout || ''}${run.stderr || ''}`
  const skipped = run.status === 0 && /SKIPPED/.test(out)
  const state = run.status !== 0 ? 'FAIL' : skipped ? 'SKIP' : 'PASS'
  const ms = Date.now() - started
  console.log(`${state}${state === 'SKIP' ? ` ${(out.match(/SKIPPED — (.*)/) || [])[1] || ''}` : ''}`)
  if (state === 'FAIL') {
    const tail = out.trim().split('\n').slice(-12)
    console.log(tail.map(l => `        ${l}`).join('\n'))
  } else if (verbose) {
    console.log(out.trim().split('\n').map(l => `        │ ${l}`).join('\n'))
  }
  results.push({ label, state, out })
}

const count = s => results.filter(r => r.state === s).length
const summary = `${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped of ${results.length} in ${((Date.now() - started) / 1000).toFixed(1)}s`
console.log(`\n${count('FAIL') ? 'FAIL' : 'OK'} — ${summary}`)

// An all-skip run is not a verification: say so instead of reporting success.
if (!count('FAIL') && count('PASS') === 0 && count('SKIP') > 0) {
  console.log('note: nothing actually ran — every suite skipped itself.')
  process.exit(2)
}
process.exit(count('FAIL') ? 1 : 0)
