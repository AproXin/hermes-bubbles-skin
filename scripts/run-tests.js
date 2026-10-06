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
 * Skips are counted separately so a green run cannot quietly become all skips:
 * every unlisted skip still fails the gate. The only skips that can ever be
 * acknowledged are the two host-dependent suites below, and only on a CI runner
 * that has no private checkout to read. Pre-push on a workstation keeps the
 * strict "0 failures, 0 skips" rule.
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

/* Two suites read the private Hermes host checkout, which an isolated CI runner
   does not have: test/host-selector-drift.test.js compares the skin's selectors
   against ~/.hermes/hermes-agent/apps/desktop/src, and test/skin-css-budget.test.js
   pins the byte budget to the customCSS slice in hermes_cli/skin_engine.py. Both
   stand aside there by design, which is what the "Declare host-dependent suites
   boundary" step in .github/workflows/verify.yml announces.
   A skip is still not a pass, so such a skip is acknowledged only when all three
   of these hold: CI is the runner, the label is one of the two below, and the
   reason it printed is the known "host source absent" one. Anything else stays
   unverified coverage and fails the gate, so the set of suites that can quietly
   stop running cannot grow. */
const CI = process.env.CI === 'true'
const HOST_DEPENDENT_SKIPS = new Map([
  ['host-selector-drift', /no host source at /],
  ['skin-css-budget', /no customCSS slice found in /],
])

const skipped = results.filter(r => r.state === 'SKIP')
const acknowledged = []
const unverified = []
for (const r of skipped) {
  const reason = ((r.out.match(/SKIPPED — (.*)/) || [])[1] || 'no reason given').replace(/ =+$/, '').trim()
  const expected = CI ? HOST_DEPENDENT_SKIPS.get(r.label) : undefined
  if (expected && expected.test(reason)) acknowledged.push({ r, reason })
  else unverified.push({ r, reason })
}

const hasFailure = count('FAIL') > 0
const summary = `${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped of `
  + `${results.length} in ${formatMs(Date.now() - started)}`
  + (acknowledged.length ? ` (${acknowledged.length} host-dependent, acknowledged)` : '')
const statusText = hasFailure ? 'FAIL' : unverified.length ? 'FAIL (UNVERIFIED SUITES)' : 'OK'
console.log(`\n${statusText} — ${summary}`)

if (acknowledged.length) {
  console.log(`\nhost-dependent skips acknowledged ${acknowledged.length} — the private checkout they read is not on this runner:`)
  for (const { r, reason } of acknowledged) console.log(`  - ${r.label.padEnd(32)} ${reason}`)
  console.log('  Declared in .github/workflows/verify.yml; pre-push still enforces both against a live checkout.')
}

if (unverified.length) {
  console.log(`\nskipped ${unverified.length} — these verified nothing (skips are strictly rejected as failures):`)
  for (const { r, reason } of unverified) console.log(`  - ${r.label.padEnd(32)} ${reason}`)
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
if (unverified.length) process.exit(2)
process.exit(0)