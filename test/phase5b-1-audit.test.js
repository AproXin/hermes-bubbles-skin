/**
 * test/phase5b-1-audit.test.js
 *
 * Phase 5B.1 — Real UI Tool Transcript Polish Audit Suite
 *
 * Verifies:
 * 1. Tool Title Extraction Priority & Deduplication
 *    - data-tool-name > aria-label > title slot (FadeText) > header > fallback
 *    - Deduplication: "Skill Manage1 resultSkill Manage" -> "Skill Manage"
 *    - Halving: "已加载技能已加载技能" -> "已加载技能", "已搜索文件已搜索文件" -> "已搜索文件"
 *    - Clean exclusion of countLabel ("1 result"), diff stats ("+1 -1"), duration ("84ms"), action buttons
 * 2. Tool Summary Data Model
 *    - Single tool: "▸ ✓ Skill Manage" (checkmark visible, clean title)
 *    - Multiple tools: "▸ 3 tools completed" (checkmark hidden, count label)
 *    - Logical separation of status, title, count
 * 3. Accurate Tool Completed vs Failed vs Running Classification
 *    - Diff lines with deletions (.text-destructive) do NOT turn tool into failed
 *    - True failure (error glyph in header / data-tool-status="error") is detected as failed
 *    - Running tool (spinner / pending) is detected as running
 *    - Priority: running > failed > completed > unknown
 * 4. Visual Convergence
 *    - Completed tool: quiet, lower visual weight, muted slate #94a3b8, never red
 *    - Failed tool: prominent error styling
 *    - Running tool: blue glow pulse
 * 5. Strict Complete Collapse & Expansion Layout
 *    - Collapsed: display: none !important, visibility: hidden, zero height/margin/border
 *    - Expanded: 12px indentation, left border hierarchy
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
    this.eventListeners = {}
    this.style = {
      display: '',
      getPropertyValue: (prop) => this.style[prop] || ''
    }
    // A real tool row owns a disclosure button (with aria-expanded) whenever it
    // has expandable content. Add it automatically so the skin's isExpandable
    // check sees these mock tool rows as groupable (a summary-only row has none).
    if (attributes['data-slot'] === 'tool-block') {
      this._addDisclosureButton()
    }
  }

  _addDisclosureButton() {
    if (this._disclosureAdded) return
    this._disclosureAdded = true
    const btn = new MockElement('button')
    btn.setAttribute('aria-expanded', 'false')
    this.appendChild(btn)
  }

  get previousElementSibling() {
    if (!this.parentElement) return null
    const siblings = this.parentElement.children
    const idx = siblings.indexOf(this)
    return idx > 0 ? siblings[idx - 1] : null
  }

  get nextElementSibling() {
    if (!this.parentElement) return null
    const siblings = this.parentElement.children
    const idx = siblings.indexOf(this)
    return idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null
  }

  getAttribute(key) {
    return this.attributes[key] ?? null
  }

  setAttribute(key, value) {
    this.attributes[key] = String(value)
    if (key === 'data-slot' && value === 'tool-block') {
      this._addDisclosureButton()
    }
  }

  hasAttribute(key) {
    return key in this.attributes
  }

  removeAttribute(key) {
    delete this.attributes[key]
  }

  appendChild(child) {
    if (child.parentElement) {
      child.remove()
    }
    child.parentElement = this
    this.children.push(child)
    return child
  }

  append(...nodes) {
    for (const node of nodes) {
      this.appendChild(node)
    }
  }

  insertBefore(newNode, refNode) {
    if (newNode.parentElement) {
      newNode.remove()
    }
    newNode.parentElement = this
    const idx = this.children.indexOf(refNode)
    if (idx === -1) {
      this.children.push(newNode)
    } else {
      this.children.splice(idx, 0, newNode)
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

  addEventListener(event, handler) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = []
    }
    this.eventListeners[event].push(handler)
  }

  dispatchEvent(evt) {
    const handlers = this.eventListeners[evt.type] || []
    for (const h of handlers) {
      h.call(this, evt)
    }
  }

  click() {
    const evt = {
      type: 'click',
      preventDefault: () => {},
      stopPropagation: () => {},
      target: this
    }
    this.dispatchEvent(evt)
  }

  get textContent() {
    if (this._textContent !== undefined && this._textContent !== '') return this._textContent
    if (this.children.length > 0) return this.children.map(c => c.textContent).join(' ')
    return this._textContent || ''
  }

  set textContent(val) {
    this._textContent = val
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches(selector)) return child
      const sub = child.querySelector(selector)
      if (sub) return sub
    }
    return null
  }

  querySelectorAll(selector) {
    const results = []
    for (const child of this.children) {
      if (child.matches(selector)) results.push(child)
      results.push(...child.querySelectorAll(selector))
    }
    return results
  }

  closest(selector) {
    if (this.matches(selector)) return this
    return this.parentElement ? this.parentElement.closest(selector) : null
  }

  matches(selector) {
    const parts = selector.split(',').map(s => s.trim())
    for (const part of parts) {
      if (part.startsWith(':scope > ')) {
        const sub = part.slice(9).trim()
        if (this.matches(sub)) return true
        continue
      }
      if (part.startsWith('[') && part.endsWith(']')) {
        const inner = part.slice(1, -1)
        if (inner.includes('=')) {
          const [k, v] = inner.split('=').map(s => s.replace(/['"]/g, ''))
          if (this.attributes[k] === v) return true
        } else if (this.hasAttribute(inner)) {
          return true
        }
        continue
      }
      // Check compound tag.class, with optional [attr] selectors (button[aria-expanded])
      const tagNameMatch = part.match(/^[a-zA-Z][\w-]*/)
      let tagMatch = true
      let attrMatch = true
      let classMatch = true
      if (tagNameMatch) {
        tagMatch = this.tagName.toLowerCase() === tagNameMatch[0].toLowerCase()
      }
      for (const m of part.matchAll(/\[([^\]]+)\]/g)) {
        const inner = m[1]
        if (inner.includes('=')) {
          const [k, v] = inner.split('=').map(s => s.replace(/['"]/g, ''))
          if (this.attributes[k] !== v) attrMatch = false
        } else if (!this.hasAttribute(inner)) {
          attrMatch = false
        }
      }
      const classes = part.match(/\.(?!\s)([\w-]+)/g)?.map(c => c.slice(1)) || []
      if (classes.length > 0) {
        const elClasses = this.className.split(/\s+/)
        classMatch = classes.every(c => elClasses.includes(c))
      }
      if (tagMatch && attrMatch && classMatch) return true
    }
    return false
  }
}

// Load src/plugin.js source
const srcCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'plugin.js'), 'utf8')

function extractFn(name) {
  const match = srcCode.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`))
  if (!match) throw new Error(`Function ${name} could not be extracted`)
  return match[1]
}

function isElement(node) { return Boolean(node && node.nodeType === 1) }
global.isElement = isElement

const ID = 'hermes-bubbles-skin'
let storageMock = {}
function safeGetStorage(key, fallback) {
  return key in storageMock ? storageMock[key] : fallback
}
function safeSetStorage(key, val) {
  storageMock[key] = val
}
function safeRemoveStorage(key) {
  delete storageMock[key]
}

const cleanToolTitle = new Function('raw', extractFn('cleanToolTitle'))
global.cleanToolTitle = cleanToolTitle

const detectToolState = new Function('toolBlock', extractFn('detectToolState'))
const getToolTitle = new Function('toolBlock', extractFn('getToolTitle'))
const getToolAnchorId = new Function('toolBlock', extractFn('getToolAnchorId'))
const getToolGroupId = new Function('run', 'parent', 'getToolAnchorId', extractFn('getToolGroupId'))

const processParentTools = new Function(
  'parent', 'tools', 'detectToolState', 'getToolGroupId', 'getToolTitle', 'safeGetStorage', 'safeSetStorage', 'safeRemoveStorage', 'ID', 'stats', 'document',
  extractFn('processParentTools')
)

const mockDocument = {
  createElement: (tag) => new MockElement(tag)
}

console.log('\n=== Phase 5B.1 Real UI Tool Transcript Polish Audit Suite ===\n')

// ============================================================================
// 1. Tool Title Extraction & Deduplication
// ============================================================================
{
  console.log('[Test 1] Tool Title Extraction Priority & Deduplication')

  // 1.1 Priority: data-tool-name
  const toolWithAttr = new MockElement('div', 'tool-block', { 'data-tool-name': 'Skill Manage', 'data-slot': 'tool-block' })
  assert.strictEqual(getToolTitle(toolWithAttr), 'Skill Manage', 'data-tool-name must have highest priority')

  // 1.2 Priority: aria-label
  const toolWithAria = new MockElement('div', 'tool-block', { 'aria-label': 'Run tool: search_files', 'data-slot': 'tool-block' })
  assert.strictEqual(getToolTitle(toolWithAria), 'search_files', 'aria-label must be cleaned and extracted')

  // 1.3 Deduplication of concatenated text: "Skill Manage1 resultSkill Manage"
  const toolDuplicated = new MockElement('div', 'tool-block', { 'data-slot': 'tool-block' })
  const titleSpan = new MockElement('span', 'font-medium')
  titleSpan.textContent = 'Skill Manage1 resultSkill Manage'
  toolDuplicated.appendChild(titleSpan)
  assert.strictEqual(getToolTitle(toolDuplicated), 'Skill Manage', 'Concatenated "Skill Manage1 resultSkill Manage" must cleanly deduplicate to "Skill Manage"')

  // 1.4 Halving repetition: "已加载技能已加载技能"
  const toolChineseSkill = new MockElement('div', 'tool-block', { 'data-slot': 'tool-block' })
  const chineseTitle1 = new MockElement('span', 'tool-title')
  chineseTitle1.textContent = '已加载技能已加载技能'
  toolChineseSkill.appendChild(chineseTitle1)
  assert.strictEqual(getToolTitle(toolChineseSkill), '已加载技能', 'Identical Chinese doubling "已加载技能已加载技能" must halve to "已加载技能"')

  // 1.5 Halving repetition: "已搜索文件已搜索文件"
  const toolChineseSearch = new MockElement('div', 'tool-block', { 'data-slot': 'tool-block' })
  const chineseTitle2 = new MockElement('span', 'tool-title')
  chineseTitle2.textContent = '已搜索文件已搜索文件'
  toolChineseSearch.appendChild(chineseTitle2)
  assert.strictEqual(getToolTitle(toolChineseSearch), '已搜索文件', 'Identical Chinese doubling "已搜索文件已搜索文件" must halve to "已搜索文件"')

  // 1.6 Hermes Scaffold DOM structure: ToolTitle + countLabel ("1 result")
  const hermesTool = new MockElement('div', 'tool-block', { 'data-slot': 'tool-block', 'data-conversation-scaffold': '' })
  const disclosureRow = new MockElement('div', 'group/disclosure-row')
  const scaffoldLabel = new MockElement('span', 'text-(--conversation-scaffold-text)')
  scaffoldLabel.textContent = 'Skill Manage'
  const countLabel = new MockElement('span', 'shrink-0 text-[0.625rem] tabular-nums text-(--conversation-scaffold-meta)')
  countLabel.textContent = '1 result'
  disclosureRow.appendChild(scaffoldLabel)
  disclosureRow.appendChild(countLabel)
  hermesTool.appendChild(disclosureRow)

  assert.strictEqual(getToolTitle(hermesTool), 'Skill Manage', 'Hermes Scaffold DOM must extract clean title without countLabel')

  console.log('  ✓ Passed')
}

// ============================================================================
// 2. Tool Summary Data Model: Single vs Multiple Tools
// ============================================================================
{
  console.log('[Test 2] Tool Summary Data Model: Single (▸ ✓ Title) vs Multiple (▸ N tools completed)')
  storageMock = {}

  const parent = new MockElement('div', 'assistant-content')

  // Single completed tool
  const toolSingle = new MockElement('div', 'tool-block', { 'data-slot': 'tool-block', 'data-tool-name': 'Skill Manage' })
  parent.appendChild(toolSingle)

  const stats = { toolGroupRefreshes: 0 }
  processParentTools(
    parent,
    [toolSingle],
    detectToolState,
    (run) => getToolGroupId(run, parent, getToolAnchorId),
    getToolTitle,
    safeGetStorage,
    safeSetStorage,
    safeRemoveStorage,
    ID,
    stats,
    mockDocument
  )

  const groupSingle = parent.querySelector('.bubbles-tool-group')
  assert(groupSingle !== null, 'Group header must be created')
  assert.strictEqual(groupSingle.getAttribute('data-tool-count'), '1', 'data-tool-count must be 1')

  const singleIcon = groupSingle.querySelector('.bubbles-group-icon')
  const singleLabel = groupSingle.querySelector('.bubbles-group-label')

  assert.strictEqual(singleIcon.textContent, '✓', 'Single tool must display checkmark')
  assert.strictEqual(singleLabel.textContent, 'Skill Manage', 'Single tool must display clean title in label')

  // Multiple completed tools
  const parentMulti = new MockElement('div', 'assistant-content')
  const toolA = new MockElement('div', 'tool-block', { 'data-slot': 'tool-block', 'data-tool-name': 'read_file' })
  const toolB = new MockElement('div', 'tool-block', { 'data-slot': 'tool-block', 'data-tool-name': 'write_file' })
  const toolC = new MockElement('div', 'tool-block', { 'data-slot': 'tool-block', 'data-tool-name': 'search_files' })

  parentMulti.appendChild(toolA)
  parentMulti.appendChild(toolB)
  parentMulti.appendChild(toolC)

  processParentTools(
    parentMulti,
    [toolA, toolB, toolC],
    detectToolState,
    (run) => getToolGroupId(run, parentMulti, getToolAnchorId),
    getToolTitle,
    safeGetStorage,
    safeSetStorage,
    safeRemoveStorage,
    ID,
    stats,
    mockDocument
  )

  const groupMulti = parentMulti.querySelector('.bubbles-tool-group')
  assert(groupMulti !== null, 'Multi-tool group header must be created')
  assert.strictEqual(groupMulti.getAttribute('data-tool-count'), '3', 'data-tool-count must be 3')

  const multiIcon = groupMulti.querySelector('.bubbles-group-icon')
  const multiLabel = groupMulti.querySelector('.bubbles-group-label')

  assert.strictEqual(multiIcon.textContent, '', 'Multi-tool checkmark text must be hidden')
  assert.strictEqual(multiLabel.textContent, '3 tools completed', 'Multi-tool label must display "3 tools completed"')

  console.log('  ✓ Passed')
}

// ============================================================================
// 3. Accurate Tool Completed vs Failed vs Running Classification
// ============================================================================
{
  console.log('[Test 3] Accurate Tool Completed vs Failed vs Running Classification')

  // 3.1 Tool with diff line deletions must NOT be failed
  const diffTool = new MockElement('div', 'tool-block', { 'data-slot': 'tool-block', 'data-tool-status': 'success' })
  const diffContent = new MockElement('div', 'tool-fallback-content', { 'data-slot': 'tool-fallback-content' })
  const deletedDiffLine = new MockElement('span', 'text-destructive')
  deletedDiffLine.textContent = '- const oldCode = true;'
  diffContent.appendChild(deletedDiffLine)
  diffTool.appendChild(diffContent)

  const diffState = detectToolState(diffTool)
  assert.strictEqual(diffState, 'completed', 'Tool with diff deletion inside content body must NOT be marked failed')

  // 3.2 Real failed tool with error status glyph
  const failedTool = new MockElement('div', 'tool-block', { 'data-slot': 'tool-block', 'data-tool-status': 'error' })
  const failedState = detectToolState(failedTool)
  assert.strictEqual(failedState, 'failed', 'Tool with data-tool-status="error" must be detected as failed')

  // 3.3 Running tool with spinner
  const runningTool = new MockElement('div', 'tool-block', { 'data-slot': 'tool-block' })
  const spinner = new MockElement('span', 'animate-spin')
  runningTool.appendChild(spinner)
  const runningState = detectToolState(runningTool)
  assert.strictEqual(runningState, 'running', 'Tool with animate-spin must be detected as running')

  // 3.4 Priority: running > failed > completed
  const conflictTool = new MockElement('div', 'tool-block', { 'data-slot': 'tool-block', 'data-tool-status': 'error' })
  conflictTool.appendChild(new MockElement('span', 'animate-spin'))
  const conflictState = detectToolState(conflictTool)
  assert.strictEqual(conflictState, 'running', 'Running priority must supersede failed status during active execution')

  console.log('  ✓ Passed')
}

// ============================================================================
// 4. Visual Styles: Completed Muted vs Failed vs Running
// ============================================================================
{
  console.log('[Test 4] Visual Styling: flat rows, state by colour + glyph')

  // The group toggle is a text row now — quiet slate type, no capsule.
  assert(/\.bubbles-tool-group-toggle\s*\{[\s\S]{0,400}?color:\s*rgba\(148, 163, 184/.test(srcCode),
    'Toggle button text must stay quiet muted slate')
  assert(/\.bubbles-tool-group-toggle\s*\{[\s\S]{0,200}?background:\s*transparent\s*!important/.test(srcCode),
    'Toggle button must not paint a capsule')

  // Completed: no fill, and a check in the glyph slot (the app hides its own).
  assert(srcCode.includes("html[data-bubbles-skin='true'] [data-bubbles-tool-state='completed']"), 'CSS must style completed tool state')
  assert(srcCode.includes("content: '✓'"), 'Completed tool must carry a check in the glyph slot')

  // Failed: red text + cross, no red container.
  assert(srcCode.includes("html[data-bubbles-skin='true'] [data-bubbles-tool-state='failed']"), 'CSS must style failed tool state')
  assert(srcCode.includes("color: #fca5a5 !important;"), 'Failed tool must read red in its own text')

  // Running: the app's own spinner, tinted — no pulsing card.
  assert(srcCode.includes("html[data-bubbles-skin='true'] [data-bubbles-tool-state='running']"), 'CSS must style running tool state')
  assert(srcCode.includes('animation: none !important;'), 'Running tool must not pulse a card any more')
  assert(srcCode.includes("color: #93c5fd !important;"), 'Running tool must read sapphire')

  console.log('  ✓ Passed')
}

// ============================================================================
// 5. Strict Complete Collapse & Expansion Layout
// ============================================================================
{
  console.log('[Test 5] Strict Complete Collapse & Expansion Layout')
  storageMock = {}

  // CSS strict hiding rules
  assert(srcCode.includes("html[data-bubbles-skin='true'] [data-slot='tool-block'][data-bubbles-group-collapsed='true']"), 'CSS must target collapsed tool-block')
  assert(srcCode.includes('visibility: hidden !important;'), 'Collapsed tools must be visibility: hidden')
  assert(srcCode.includes('max-height: 0 !important;'), 'Collapsed tools must enforce max-height: 0')
  assert(srcCode.includes('pointer-events: none !important;'), 'Collapsed tools must disable pointer-events')

  // Expanded indentation and left border line
  assert(srcCode.includes('margin-left: 12px !important;'), 'Expanded tools must have 12px tree indentation')
  assert(srcCode.includes('border-left: 2px solid rgba(96, 165, 250, 0.45) !important;'), 'Expanded tools must feature hierarchical left border line')

  // Functional toggle test
  const parent = new MockElement('div', 'assistant-content')
  const tool = new MockElement('div', 'tool-block', { 'data-slot': 'tool-block', 'data-tool-name': 'inspect_code' })
  parent.appendChild(tool)

  const stats = { toolGroupRefreshes: 0 }
  processParentTools(
    parent,
    [tool],
    detectToolState,
    (run) => getToolGroupId(run, parent, getToolAnchorId),
    getToolTitle,
    safeGetStorage,
    safeSetStorage,
    safeRemoveStorage,
    ID,
    stats,
    mockDocument
  )

  const group = parent.querySelector('.bubbles-tool-group')
  const toggleBtn = group.querySelector('.bubbles-tool-group-toggle')

  // Initially collapsed
  assert.strictEqual(tool.getAttribute('data-bubbles-group-collapsed'), 'true', 'Tool initially folded')
  assert.strictEqual(group.getAttribute('data-group-state'), 'collapsed', 'Group state is collapsed')

  // Click to expand
  toggleBtn.click()
  assert.strictEqual(tool.getAttribute('data-bubbles-group-collapsed'), 'false', 'Tool expanded on click')
  assert.strictEqual(group.getAttribute('data-group-state'), 'expanded', 'Group state is expanded')

  // Click to collapse again
  toggleBtn.click()
  assert.strictEqual(tool.getAttribute('data-bubbles-group-collapsed'), 'true', 'Tool folded back on second click')
  assert.strictEqual(group.getAttribute('data-group-state'), 'collapsed', 'Group state is collapsed again')

  console.log('  ✓ Passed')
}

console.log('\n=== All Phase 5B.1 Test Assertions Passed Successfully ===\n')
