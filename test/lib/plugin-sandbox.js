/**
 * test/lib/plugin-sandbox.js
 *
 * Every behaviour suite needs the same four things before it can run a shipped
 * plugin helper under Node: the plugin source as text, one function lifted out of
 * that text, `isElement`, and a storage object it can inspect and empty.
 *
 * Those used to be re-typed per suite — six byte-identical copies of `extractFn`, four
 * of the storage shim, three of `extractFunction` — which is how they drifted apart.
 * Only the *scanning* lives here on purpose:
 *
 * - The argument list each `new Function(...)` is built with stays in the suite. That
 *   list is the contract the suite is testing; sharing it would let a suite keep
 *   passing after the shipped signature changed.
 * - `extractFunctionText` returns TEXT and the suite runs its own `eval`. Evaluating
 *   here would move the closure from the suite's module scope to this file's, and the
 *   shipped functions read names the suite declares locally (`stats`, `mockDocument`).
 * - `test/lib/*` is inside the assertion census scan, so lifting a `srcCode.match`
 *   here cannot be mistaken for having converted a source-text assertion.
 */

const fs = require('fs')
const path = require('path')
const { REPO } = require('../../scripts/lib/sheets')

/** The shipped plugin source, as text. Same bytes every suite reads. */
const srcCode = fs.readFileSync(path.join(REPO, 'src', 'plugin.js'), 'utf8')

/**
 * Body of a top-level `function name (…) { …}`, stopping at the first `}` in column 0.
 * Throws rather than returning undefined: a silently missing helper reads as a
 * behaviour change.
 */
function extractFn(name) {
  const match = srcCode.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`))
  if (!match) throw new Error(`Function ${name} could not be extracted`)
  return match[1]
}

/**
 * Whole function text (signature included), found by walking its own braces, so a
 * nested `}` cannot end it early. The caller evaluates it in its own module scope.
 */
function extractFunctionText(name) {
  const startIdx = srcCode.indexOf(`function ${name}(`)
  if (startIdx === -1) throw new Error(`Could not find function ${name}`)
  let braceCount = 0
  let inFunc = false
  let endIdx = startIdx
  for (let i = startIdx; i < srcCode.length; i += 1) {
    if (srcCode[i] === '{') {
      braceCount += 1
      inFunc = true
    } else if (srcCode[i] === '}') {
      braceCount -= 1
      if (inFunc && braceCount === 0) {
        endIdx = i + 1
        break
      }
    }
  }
  return srcCode.slice(startIdx, endIdx)
}

/**
 * Value of a top-level `const NAME = …`: a template literal is taken verbatim,
 * anything else is evaluated as the single-line expression it is (numbers, arrays).
 */
function extractConst(name) {
  const marker = `const ${name} = `
  const startIdx = srcCode.indexOf(marker)
  if (startIdx === -1) throw new Error(`Could not find const ${name}`)
  const afterMarker = startIdx + marker.length
  if (srcCode[afterMarker] === '`') {
    const endIdx = srcCode.indexOf('`', afterMarker + 1)
    if (endIdx === -1) throw new Error(`Could not find closing \` for ${name}`)
    return srcCode.slice(afterMarker + 1, endIdx)
  }
  const endIdx = srcCode.indexOf('\n', afterMarker)
  return eval(srcCode.slice(afterMarker, endIdx).trim().replace(/;$/, ''))
}

function isElement(node) { return Boolean(node && node.nodeType === 1) }

/**
 * The storage the shipped helpers reach for. One object that is only ever emptied,
 * never rebound, so a suite can both read `store[key]` and call `resetStore()`
 * between cases and keep seeing the same map the helpers wrote.
 */
const store = {}
function safeGetStorage(key, fallback) {
  return key in store ? store[key] : fallback
}
function safeSetStorage(key, val) {
  store[key] = val
}
function safeRemoveStorage(key) {
  delete store[key]
}
function resetStore() {
  for (const key of Object.keys(store)) delete store[key]
}

module.exports = {
  srcCode, extractFn, extractFunctionText, extractConst,
  isElement, store, safeGetStorage, safeSetStorage, safeRemoveStorage, resetStore,
}
