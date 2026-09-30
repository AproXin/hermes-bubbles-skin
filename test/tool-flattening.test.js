/**
 * test/tool-flattening.test.js
 *
 * Tool UI Flattening Verification Suite
 *
 * Verifies:
 * 1. Single Visual Container Architecture:
 *    - Each tool semantic layer permits only ONE visual container
 *    - Completed tools inside groups do not draw duplicate glass cards
 *    - Child headers inside grouped tools are transparent with zero borders/shadows
 * 2. Strict Elimination of "Double Red Border" (禁止双层红框):
 *    - Failed tools have exactly ONE red card container
 *    - Inner native error wrappers (border-destructive, bg-destructive, border-red, bg-red) are stripped
 * 3. Running Tool Unified Glow Card:
 *    - Running tools have a single pulsing blue glass card
 *    - Inner child containers are transparent with no duplicate borders
 * 4. Safe Non-Invasive Scope (Zero Contamination):
 *    - User & Assistant bubbles are completely unaffected
 *    - Thinking disclosure, Clarify, Approval, and Task stack are untouched
 *    - Tool code blocks (<pre>, <code>), tables, and terminal outputs maintain full formatting
 * 5. Flat Mode Stamp (data-bubbles-tool-flat):
 *    - enhanceToolBlock and processParentTools stamp data-bubbles-tool-flat="true"
 */

const assert = require('assert')
const fs = require('fs')
const path = require('path')

class MockClassList {
  constructor(el) {
    this.el = el
  }
  contains(cls) {
    return this.el.className.split(/\s+/).includes(cls)
  }
  add(cls) {
    const classes = new Set(this.el.className.split(/\s+/).filter(Boolean))
    classes.add(cls)
    this.el.className = [...classes].join(' ')
  }
  remove(cls) {
    const classes = this.el.className.split(/\s+/).filter(c => c && c !== cls)
    this.el.className = classes.join(' ')
  }
}

class MockElement {
  constructor(tagName = 'div', className = '', attributes = {}) {
    this.tagName = tagName.toUpperCase()
    this.nodeType = 1
    this.className = className
    this.classList = new MockClassList(this)
    this.attributes = { ...attributes }
    this.children = []
    this.parentElement = null
    this.textContent = ''
    this.style = {}
  }

  getAttribute(key) {
    return this.attributes[key] ?? null
  }

  setAttribute(key, value) {
    this.attributes[key] = String(value)
  }

  hasAttribute(key) {
    return key in this.attributes
  }

  removeAttribute(key) {
    delete this.attributes[key]
  }

  appendChild(child) {
    if (child.parentElement) {
      const idx = child.parentElement.children.indexOf(child)
      if (idx !== -1) child.parentElement.children.splice(idx, 1)
    }
    child.parentElement = this
    this.children.push(child)
    return child
  }

  get previousElementSibling() {
    if (!this.parentElement) return null
    const idx = this.parentElement.children.indexOf(this)
    return idx > 0 ? this.parentElement.children[idx - 1] : null
  }

  get nextElementSibling() {
    if (!this.parentElement) return null
    const idx = this.parentElement.children.indexOf(this)
    return (idx !== -1 && idx < this.parentElement.children.length - 1) ? this.parentElement.children[idx + 1] : null
  }

  insertBefore(newNode, refNode) {
    if (newNode.parentElement) {
      const idx = newNode.parentElement.children.indexOf(newNode)
      if (idx !== -1) newNode.parentElement.children.splice(idx, 1)
    }
    newNode.parentElement = this
    const refIdx = this.children.indexOf(refNode)
    if (refIdx === -1) {
      this.children.push(newNode)
    } else {
      this.children.splice(refIdx, 0, newNode)
    }
    return newNode
  }

  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this)
      if (idx !== -1) this.parentElement.children.splice(idx, 1)
      this.parentElement = null
    }
  }

  closest(selector) {
    if (this.matches(selector)) return this
    return this.parentElement ? this.parentElement.closest(selector) : null
  }

  matches(selector) {
    if (!selector) return false
    const selList = selector.split(',').map(s => s.trim())
    return selList.some(sel => {
      if (sel.startsWith('.')) return this.classList.contains(sel.slice(1))
      if (sel.startsWith('#')) return this.id === sel.slice(1)
      const attrMatch = sel.match(/^\[([a-zA-Z0-9_-]+)(?:=(['"]?)(.*?)\2)?\]$/)
      if (attrMatch) {
        const [, key, , val] = attrMatch
        if (val === undefined) return this.hasAttribute(key)
        return this.getAttribute(key) === val
      }
      return this.tagName.toLowerCase() === sel.toLowerCase()
    })
  }

  querySelector(selector) {
    const results = this.querySelectorAll(selector)
    return results[0] || null
  }

  querySelectorAll(selector) {
    const matched = []
    const traverse = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) matched.push(child)
        traverse(child)
      }
    }
    traverse(this)
    return matched
  }
}

const pluginSource = fs.readFileSync(path.join(__dirname, '../src/plugin.js'), 'utf8')
const { skinSourcePath } = require('./skin-source')
const yamlSource = fs.readFileSync(skinSourcePath(), 'utf8')

function extractFn(name) {
  const match = pluginSource.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`))
  if (!match) throw new Error(`Function ${name} could not be extracted: ${name}`)
  return match[1]
}

const isElement = (node) => Boolean(node && node.nodeType === 1)
const stats = { toolRefreshes: 0, toolGroupRefreshes: 0 }
/* This used to be a stub — `(el) => el.getAttribute('data-tool-status') || 'completed'`
   — an attribute the renderer does not emit, so every tool in this suite was
   permanently 'completed' and the state assertions proved nothing about the real
   detector. Run the shipped function instead. */
const detectToolState = el => new Function('toolBlock', 'isElement', extractFn('detectToolState'))(el, isElement)

const enhanceToolBlock = new Function(
  'toolBlock',
  'isElement', 'detectToolState', 'stats',
  extractFn('enhanceToolBlock')
).bind(null)

console.log('\n=== Tool UI Flattening Audit Suite ===\n')

// ============================================================================
// Test 1: data-bubbles-tool-flat Attribute Stamping
// ============================================================================
console.log('[Test 1] data-bubbles-tool-flat Attribute Stamping')

const testTool = new MockElement('div', 'tool-block', { 'data-slot': 'tool-block' })
enhanceToolBlock(testTool, isElement, detectToolState, stats)

assert.strictEqual(testTool.getAttribute('data-bubbles-tool'), 'true', 'Tool must have data-bubbles-tool="true"')
assert.strictEqual(testTool.getAttribute('data-bubbles-tool-flat'), 'true', 'Tool must have data-bubbles-tool-flat="true"')

assert(
  pluginSource.includes("header.setAttribute('data-bubbles-tool-flat', 'true')"),
  'Group header must stamp data-bubbles-tool-flat="true"'
)
assert(
  pluginSource.includes("tool.setAttribute('data-bubbles-tool-flat', 'true')"),
  'Grouped tools in processParentTools must stamp data-bubbles-tool-flat="true"'
)

console.log('  ✓ Passed: Tool flat attribute stamped on tool blocks and group headers')

// ============================================================================
// Tests 2-5 asserted the flattening by matching stylesheet text — pluginSource
// contains "border: none !important" and friends. Those words appear in dozens of
// rules, so a match proved nothing about WHICH rule, and reformatting broke them.
// They are replaced by test/tool-flatten-layers.test.js, which measures the
// computed result on a real DOM (grouped/expanded rows, failed rows with red
// children, running rows, the single-tool duplicate header) and reads the wildcard
// ban out of the CSSOM.
// ============================================================================


// ============================================================================
// Test 6: Nested Tool Blocks Elimination (No Nested .bubbles-tool-group)
// ============================================================================
console.log('[Test 6] Nested Tool Blocks Elimination: Zero Nested .bubbles-tool-group')

assert(
  pluginSource.includes("tool.parentElement?.closest?.('[data-slot=\"tool-block\"]')"),
  'pluginSource must filter out tool-blocks nested inside other tool-blocks'
)

assert(
  pluginSource.includes("for (const h of document.querySelectorAll('[data-slot=\"tool-block\"] .bubbles-tool-group'))"),
  'pluginSource must clean up any group headers mistakenly placed inside a tool block'
)

console.log('  ✓ Passed: Nested tool-blocks excluded from group processing and cleaned up')

// ============================================================================
// Test 7: Single Tool Duplicate Header Suppression
// ============================================================================
console.log('[Test 7] Single Tool Duplicate Header Suppression')

// Verify CSS rule in plugin.js and bubbles.yaml
assert(
  pluginSource.includes(".bubbles-tool-group[data-tool-count='1'] + [data-slot='tool-block'] > :is(") &&
  pluginSource.includes("[data-bubbles-duplicate-header='true']"),
  'plugin.js must hide duplicate native header on single-tool groups'
)

assert(
  yamlSource.includes(".bubbles-tool-group[data-tool-count='1'] + [data-slot='tool-block'] > :is(") &&
  yamlSource.includes("[data-bubbles-duplicate-header='true']"),
  'bubbles.yaml must hide duplicate native header on single-tool groups'
)

// Verify JS marks data-bubbles-duplicate-header on run.length === 1
assert(
  pluginSource.includes("if (run.length === 1) {") &&
  pluginSource.includes("nativeHeader.setAttribute('data-bubbles-duplicate-header', 'true')"),
  'processParentTools must stamp data-bubbles-duplicate-header="true" on single-tool native header'
)

console.log('  ✓ Passed: Single tool group hides duplicate native header, leaving only one clean title')

// ============================================================================
// Test 8: Multi-Tool Group Child Header Preservation
// ============================================================================
console.log('[Test 8] Multi-Tool Group Child Header Preservation')

assert(
  pluginSource.includes("nativeHeader.removeAttribute('data-bubbles-duplicate-header')"),
  'processParentTools must unmark data-bubbles-duplicate-header when run has multiple tools'
)

console.log('  ✓ Passed: Multi-tool groups retain child headers as flat clean rows')

// ============================================================================
// Test 9: Inner ToolEntry (data-tool-row) Shell Stripping
// ============================================================================
console.log('[Test 9] Inner ToolEntry Shell Stripping (single visual container)')

const innerFlattenSelector = "[data-slot='tool-block'][data-tool-group] [data-slot='tool-block'][data-tool-row]"
assert(
  pluginSource.includes(innerFlattenSelector) &&
  pluginSource.includes("background: transparent !important") &&
  pluginSource.includes("border: none !important") &&
  pluginSource.includes("box-shadow: none !important"),
  'plugin.js must strip the inner ToolEntry duplicate card shell inside a ToolRun'
)
assert(
  yamlSource.includes(innerFlattenSelector),
  'bubbles.yaml must strip the inner ToolEntry duplicate card shell inside a ToolRun'
)

console.log('  ✓ Passed: Inner ToolEntry renders no card shell; outer ToolRun is the single container')

// ============================================================================
// Test 10: Native ToolEntry Disclosure Sync (details render when expanded)
// ============================================================================
console.log('[Test 10] Native ToolEntry Disclosure Sync (details reveal on expand)')

assert(
  pluginSource.includes('Sync the native ToolEntry disclosure'),
  'toggle handler must drive the native ToolEntry disclosure when the skin pill is toggled'
)
assert(
  pluginSource.includes('Reconcile the native ToolEntry disclosure'),
  'initial group setup must reconcile the native ToolEntry disclosure with persisted state'
)
assert(
  pluginSource.includes('nativeOpen !== nextExpanded'),
  'toggle sync must only click the native toggle when its state differs (idempotent)'
)

console.log('  ✓ Passed: Expanded skin pill drives native open so command details mount')

// ============================================================================
// Test 11: Native ToolRun is never re-wrapped (failed box opens but won't close)
// ============================================================================
console.log('[Test 11] Native ToolRun keeps its own header; collapsed run stays failed')

// Root cause: a native ToolRun folds in one click via
//   expanded = count < 2 || (persistedOpen ?? rowOpen)   (nullish coalescing:
//   persistedOpen=false wins over rowOpen), and React unmounts its children.
// The skin must not treat the childless run as a single completed tool (which
// would inject a skin pill and hide the native ToolRunHeader), nor re-detect
// the collapsed failure as 'completed'.
assert(
  pluginSource.includes('!tool.hasAttribute(\'data-tool-group\')'),
  'groupCompletedTools must exclude native ToolRun groups from skin pill grouping'
)
assert(
  pluginSource.includes('toolRunStateCache'),
  'plugin must cache the ToolRun verdict observed while its children were mounted'
)
assert(
  pluginSource.includes("toolBlock.querySelector('[data-tool-row]')"),
  'ToolRun cache must refresh only while child rows are mounted (expanded)'
)
assert(
  pluginSource.includes('toolRunStateCache.get(toolBlock) || state'),
  'collapsed ToolRun must keep the verdict seen while expanded (red frame stays)'
)
// The skin must not synthesize child-row clicks on collapse: native ?? folds
// the whole run in one click, and folding child rows would lose their open
// state so a re-expand would re-detect the run as 'completed'.
assert(
  !pluginSource.includes('bindToolRunCollapseSync'),
  'plugin must not force child rows closed (native run folds in one click)'
)

console.log('  ✓ Passed: Collapsed ToolRun keeps its native header and failed state')

console.log('[Test 12] Summary-only file edit (hideCodeDiffs) is not wrapped in expandable pill')

// Root cause: under "Hide code diffs", a file edit renders as a permanent
// single-line summary — its disclosure button is disabled with no
// aria-expanded and it has no body. Wrapping that in an expandable pill makes
// the pill open onto nothing but the 2px accent border (the "blue dot").
// The skin must treat a completed tool with no expandable disclosure as a
// non-groupable boundary (keeps its native single-line header).
assert(
  pluginSource.includes("const isExpandable = Boolean(tool.querySelector('button[aria-expanded]'))"),
  'processParentTools must detect whether a completed tool has an expandable disclosure'
)
assert(
  pluginSource.includes("if (state === 'completed' && isExpandable)"),
  'only expandable completed tools may be grouped into a skin pill'
)

console.log('  ✓ Passed: Summary-only file edit stays a native single line, no expandable pill')

console.log('\n=== All Tool UI Flattening Test Assertions Passed Successfully ===\n')
