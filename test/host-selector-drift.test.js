/**
 * test/host-selector-drift.test.js
 *
 * The skin is a parasite on Hermes' DOM: every `data-slot`, `data-*` and host
 * class it reads is a promise about somebody else's markup. Those promises rot
 * silently — a selector that matches nothing does not error, it just stops
 * styling or stops detecting, and the suite stays green because the fixture was
 * written from the same wrong belief.
 *
 * An audit found the scale of it: `[data-slot='tool-header']`, `tool-content`,
 * `tool-title`, `tool-name`, `tool-error`, `tool-fallback-content`,
 * `tool-fallback-title`, plus `data-tool-state`, `data-tool-pending`,
 * `data-tool-status`, `data-tool-error`, `data-exit-code`, `.exit-code-failed`,
 * `.diff-stat`, `[data-diff]` — none of which the renderer emits. detectToolState
 * had an entire exit-code branch reading a host attribute that does not exist.
 *
 * So this test enumerates what the skin references and checks each one against
 * the host source. It is the only test here that reads a different repository, and
 * it skips loudly when that repository is not on disk.
 *   node test/host-selector-drift.test.js
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { DESKTOP, REPO } = require('../scripts/lib/sheets')

const HOST_SRC = path.join(DESKTOP, 'src')
if (!fs.existsSync(HOST_SRC)) {
  console.log(`\n=== Host Selector Drift: SKIPPED — no host source at ${HOST_SRC.replace(os.homedir(), '~')} ===\n`)
  process.exit(0)
}

const SKIN_FILES = ['src/plugin.js', 'bubbles.yaml'].map(f =>
  [f, fs.readFileSync(path.join(REPO, f), 'utf8')])

/* Fixtures are included on purpose: every fictional selector in this repo has
   lived in a test's mock DOM, where it made an assertion pass against a host that
   does not exist. Comments are stripped first, or prose explaining why a token was
   deleted would read as a live reference to it. */
const stripComments = text => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')

for (const f of fs.readdirSync(path.join(REPO, 'test')).sort()) {
  if (!f.endsWith('.test.js')) continue
  SKIN_FILES.push([`test/${f}`, stripComments(fs.readFileSync(path.join(REPO, 'test', f), 'utf8'))])
}

/* Tokens that are not a promise about the renderer:
   - written by the skin itself (derived mechanically from its setAttribute calls,
     so the list cannot go stale the way a hand-written one does),
   - emitted by Radix from node_modules rather than by the host's source. */
const SKIN_WRITTEN = new Set()
for (const [, text] of SKIN_FILES) {
  for (const m of text.matchAll(/setAttribute\(\s*['"]([a-z0-9-]+)['"]/g)) SKIN_WRITTEN.add(m[1])
  for (const m of text.matchAll(/dataset\.([a-zA-Z0-9_]+)\s*=/g)) {
    SKIN_WRITTEN.add(m[1].replace(/[A-Z]/g, c => '-' + c.toLowerCase()))
  }
}
const isOwn = token => /^data-(bubbles|radix-|probe)/.test(token) || SKIN_WRITTEN.has(token)
// data-probe is a fixture handle: suites stamp it on mock DOM so a query has
// something to hit. It is never a claim about the renderer.

const hostHas = needle => {
  try {
    // Options before the pattern: BSD grep treats a post-path --include as a
    // file name, which made every lookup here "not found" and the whole suite
    // report 0/72. execFileSync also keeps the needle out of a shell.
    execFileSync('grep', ['-rls', '--include=*.tsx', '--include=*.ts', '--include=*.css', '-e', needle, '.'],
      { cwd: HOST_SRC, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// Collect candidates with the file:line of their first appearance, so a failure
// points at something to edit.
const seen = new Map()
for (const [file, text] of SKIN_FILES) {
  text.split('\n').forEach((line, i) => {
    const found = [
      // CSS / querySelector attribute selectors
      ...[...line.matchAll(/\[data-slot=["']([a-z0-9_-]+)["']/g)].map(m => ({ token: m[1], slot: true })),
      ...[...line.matchAll(/data-slot=["']([a-z0-9_-]+)["']/g)].map(m => ({ token: m[1], slot: true })),
      ...[...line.matchAll(/\[(data-(?!slot)[a-z0-9-]+)(?:=["'][^"']*["'])?\]/g)].map(m => ({ token: m[1], slot: false })),
      // JS reads. A getAttribute('data-tool-state') is just as much a host promise
      // as a CSS selector, and it is the one that rots quietly.
      ...[...line.matchAll(/(?:getAttribute|hasAttribute)\(\s*['"](data-[a-z0-9-]+)['"]/g)].map(m => ({ token: m[1], slot: false })),
    ]
    for (const { token, slot } of found) {
      const key = slot ? `data-slot="${token}"` : token
      if (isOwn(token)) continue
      if (!seen.has(key)) seen.set(key, { where: `${file}:${i + 1}`, probe: slot ? token : token })
    }
  })
}

console.log('\n=== Host Selector Drift Suite ===\n')
const missing = []
for (const [key, info] of [...seen.entries()].sort()) {
  if (!hostHas(info.probe)) missing.push(`${key}  (first used at ${info.where})`)
}

console.log(`checked ${seen.size} host-owned selectors against ${HOST_SRC.replace(os.homedir(), '~')}`)
if (missing.length) {
  console.log(`\n${missing.length} referenced by the skin but absent from the renderer:`)
  for (const m of missing) console.log(`  - ${m}`)
  console.log('\nEither the host renamed it (update the skin) or it never existed')
  console.log('(delete the branch — a selector that cannot match is not a fallback).')
}
console.log(`\n${missing.length ? 'FAIL' : 'OK'} — ${seen.size - missing.length}/${seen.size} resolve in the host`)
process.exit(missing.length ? 1 : 0)
