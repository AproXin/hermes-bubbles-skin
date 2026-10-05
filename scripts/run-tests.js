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

/* Per-suite wall clock, so a slow machine can be told apart from a broad
   regression. The total alone could not: `started` never moved, so the number
   it produced was cumulative-elapsed, and it was computed but never printed.
   Suites launch a headless browser each, so the spread is wide — the slowest
   ones are the ones worth a second look. */
const formatMs = ms => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`)

for (const file of files) {
  const label = file.replace(/\.test\.js$/, '')
  process.stdout.write(`  ${label.padEnd(34)}`)
  const t0 = Date.now()
  const run = spawnSync(process.execPath, [path.join(TEST_DIR, file)], {
    cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  })
  const ms = Date.now() - t0
  const out = `${run.stdout || ''}${run.stderr || ''}`
  const skipped = run.status === 0 && /SKIPPED/.test(out)
  const state = run.status !== 0 ? 'FAIL' : skipped ? 'SKIP' : 'PASS'
  const note = state === 'SKIP' ? ` ${(out.match(/SKIPPED — (.*)/) || [])[1] || ''}` : ` ${formatMs(ms)}`
  console.log(`${state}${note}`)
  if (state === 'FAIL') {
    const tail = out.trim().split('\n').slice(-12)
    console.log(tail.map(l => `        ${l}`).join('\n'))
  } else if (verbose) {
    console.log(out.trim().split('\n').map(l => `        │ ${l}`).join('\n'))
  }
  results.push({ label, state, out, ms })
}

const count = s => results.filter(r => r.state === s).length
const summary = `${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped of ${results.length} in ${formatMs(Date.now() - started)}`

/* A skip is not a pass. Any skipped suite is unverified coverage and treated as a
   gate failure. There is no bypass switch: green requires all suites to pass with 0 failures and 0 skips. */
const skipped = results.filter(r => r.state === 'SKIP')
const hasFailure = count('FAIL') > 0
const hasSkip = skipped.length > 0
const statusText = hasFailure ? 'FAIL' : hasSkip ? 'FAIL (UNVERIFIED SUITES)' : 'OK'
console.log(`\n${statusText} — ${summary}`)
if (skipped.length) {
  console.log(`\nskipped ${skipped.length} — these verified nothing (skips are strictly rejected as failures):`)
  for (const r of skipped) {
    const reason = ((r.out.match(/SKIPPED — (.*)/) || [])[1] || 'no reason given').replace(/ =+$/, '').trim()
    console.log(`  - ${r.label.padEnd(32)} ${reason}`)
  }
  console.log('\nGate Failure: Skipped suites are strictly prohibited. Green status requires 0 failures and 0 skips.')
}

/* The five slowest suites, so "the run took longer" can be attributed. Every
   suite here launches its own headless browser, so the spread is the interesting
   number — a suite that jumps from 0.1s to 3s is a real signal. */
const slowest = results.filter(r => r.state !== 'SKIP').sort((a, b) => b.ms - a.ms).slice(0, 5)
if (slowest.length === 5) {
  console.log('\nslowest suites:')
  for (const r of slowest) console.log(`  ${formatMs(r.ms).padStart(7)}  ${r.label}`)
}

if (count('FAIL')) process.exit(1)
if (skipped.length) process.exit(2)
process.exit(0)