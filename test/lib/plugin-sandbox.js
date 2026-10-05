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

/**
 * Publish the helpers `processParentTools` is assembled from.
 *
 * A `new Function` body resolves free names on the global object, so a suite that runs
 * the shipped `processParentTools` has to supply every helper it calls — the same reason
 * these suites already do `global.isElement = isElement`.
 *
 * The header of this file keeps each suite's OWN argument list, because that list is the
 * contract under test. This is plumbing, not a contract: the helpers take every
 * dependency as an argument, so `processParentTools` passes them at the call and nothing
 * has to be restated here. What this DOES check is that each name still resolves to the
 * shipped function — a helper that goes missing in a split is an error here, never a
 * silent global, which is exactly how a dropped step would otherwise reach a user.
 *
 *   publishToolGroupHelpers()
 */
const TOOL_GROUP_HELPERS = ['removeOrphanGroupHeaders', 'stampToolGroupMembers', 'paintToolGroupHeader', 'markDuplicateNativeHeader', 'partitionCompletedRuns', 'createToolGroupHeader', 'attachToolGroupToggle']

function publishToolGroupHelpers(names = TOOL_GROUP_HELPERS) {
  for (const name of names) {
    /* `extractFunctionText` returns the whole declaration, so it has to be evaluated as
       an expression. Handing it to `new Function` instead builds a function whose BODY is
       `function name(…){…}` — which declares, runs nothing and returns undefined: the
       published helper silently stopped stamping while every suite stayed green. That is
       the failure this publisher exists to prevent, so it is checked here, once, for all
       of them. No text matching, which matters: test/lib is inside the assertion census,
       and plumbing here would otherwise spend ratchet ceiling that belongs to an
       assertion. */
    const helper = eval(`(${extractFunctionText(name)})`)
    if (typeof helper !== 'function' || helper.name !== name) {
      throw new Error(`publishToolGroupHelpers: ${name} did not evaluate to the shipped function`)
    }
    globalThis[name] = helper
  }
}

module.exports = {
  srcCode, extractFn, extractFunctionText, extractConst,
  isElement, store, safeGetStorage, safeSetStorage, safeRemoveStorage, resetStore,
  publishToolGroupHelpers,
}
