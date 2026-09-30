/**
 * test/harness-integrity.test.js
 *
 * Nine suites pull a single function out of src/plugin.js with a regex and eval
 * it against a mock DOM. Every one of them uses some form of
 *   new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`)
 * which stops at the first `}` at column zero. That is safe only while the source
 * keeps nesting indented — a function containing a line-initial brace (a
 * reflowed object literal, a template literal, a switch case) would be truncated
 * silently, and the suite would then be exercising half a function and still
 * passing.
 *
 * An audit flagged this as a live bug. It is not one today: every extracted
 * function in this repo currently comes back brace-balanced. So instead of
 * rewriting nine harnesses for a latent risk, this test makes the risk loud the
 * moment it becomes real.
 *   node test/harness-integrity.test.js
 */

const fs = require('fs')
const path = require('path')
const { REPO } = require('../scripts/lib/sheets')

const TEST_DIR = path.join(REPO, 'test')
const SRC = fs.readFileSync(path.join(REPO, 'src', 'plugin.js'), 'utf8')

/** Strip strings, template literals and comments so braces inside them do not count. */
const stripLiterals = code => {
  let out = ''
  let i = 0
  const n = code.length
  while (i < n) {
    const c = code[i]
    if (c === '/' && code[i + 1] === '*') { const e = code.indexOf('*/', i + 2); i = e === -1 ? n : e + 2; continue }
    if (c === '/' && code[i + 1] === '/') { const e = code.indexOf('\n', i); i = e === -1 ? n : e; continue }
    if (c === '`') {
      i++
      while (i < n) { if (code[i] === '\\') { i += 2; continue } if (code[i] === '`') { i++; break } i++ }
      continue
    }
    if (c === '"' || c === "'") {
      i++
      while (i < n) { if (code[i] === '\\') { i += 2; continue } if (code[i] === c) { i++; break } i++ }
      continue
    }
    out += c
    i++
  }
  return out
}

const braceBalance = code => {
  const s = stripLiterals(code)
  return { opens: (s.match(/\{/g) || []).length, closes: (s.match(/\}/g) || []).length }
}

/** The naive extractor the suites use, verbatim. */
const naiveExtract = name => {
  const m = SRC.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`))
  return m ? m[1] : null
}

console.log('\n=== Harness Integrity Suite ===\n')
const failures = []
const check = (name, ok, detail) => {
  if (!ok) failures.push(name)
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// Which functions each suite extracts, read from the suites themselves.
const users = new Map()
for (const file of fs.readdirSync(TEST_DIR).sort()) {
  if (!file.endsWith('.test.js') || file === 'harness-integrity.test.js') continue
  const text = fs.readFileSync(path.join(TEST_DIR, file), 'utf8')
  for (const m of text.matchAll(/extract(?:Fn|Function)\(\s*['"]([A-Za-z0-9_]+)['"]/g)) {
    if (!users.has(m[1])) users.set(m[1], new Set())
    users.get(m[1]).add(file)
  }
}

check('every extracted function still exists in the source',
  [...users.keys()].every(n => new RegExp(`function ${n}\\(`).test(SRC)),
  [...users.keys()].filter(n => !new RegExp(`function ${n}\\(`).test(SRC)).join(' '))

for (const [name, set] of [...users.entries()].sort()) {
  const body = naiveExtract(name)
  if (body === null) { check(`${name} extracts`, false, `used by ${[...set].join(', ')}`); continue }
  const { opens, closes } = braceBalance(body)
  check(`${name.padEnd(26)} extracts whole (${String(body.length).padStart(5)} chars)`,
    opens === closes,
    opens === closes ? `braces ${opens}/${closes}`
      : `braces ${opens}/${closes} — truncated by a line-initial }; used by ${[...set].join(', ')}`)
}

console.log(`\n${failures.length ? 'FAIL' : 'OK'} — ${users.size - failures.length + 1}/${users.size + 1} extractions are whole`)
process.exit(failures.length ? 1 : 0)
