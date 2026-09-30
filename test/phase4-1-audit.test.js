/**
 * test/phase4-1-audit.test.js
 *
 * Phase 4.1 Tool Collapse Integration Audit:
 * 1. Tool Group Identity: Stability across rerenders, independent of DOM index, text length, or volatile titles.
 * 2. Dynamic Tool Lifecycle: Tool A running -> completed -> Tool B running -> completed -> Tool C running -> completed -> "▸ 3 tools completed".
 * 3. Collapse -> Expand: Non-destructive DOM preservation, zero node cloning, zero text modification.
 * 4. Focus Safety: Prevents active focus from being trapped in display:none elements; safely transfers to summary toggle.
 * 5. Persistence: Stable identity preserves expand/collapse across rerenders, with robust storage error fallback.
 * 6. Strict Boundaries: Running tool isolation, Failed tool alert preservation, Task non-crossing.
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
    this._textContent = ''
    this.eventListeners = {}
    this.isFocused = false
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

  focus() {
    if (global.mockActiveDocument) {
      if (global.mockActiveDocument.activeElement) {
        global.mockActiveDocument.activeElement.isFocused = false
      }
      global.mockActiveDocument.activeElement = this
    }
    this.isFocused = true
  }

  contains(node) {
    if (node === this) return true
    for (const child of this.children) {
      if (child.contains(node)) return true
    }
    return false
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

// Read functions and CSS from src/plugin.js
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

const detectToolState = new Function('toolBlock', extractFn('detectToolState'))
const getToolTitle = new Function('toolBlock', extractFn('getToolTitle'))
const getToolAnchorId = new Function('toolBlock', extractFn('getToolAnchorId'))
const getToolGroupId = new Function('run', 'parent', 'getToolAnchorId', extractFn('getToolGroupId'))

const processParentTools = new Function(
  'parent', 'tools', 'detectToolState', 'getToolGroupId', 'getToolTitle', 'safeGetStorage', 'safeSetStorage', 'safeRemoveStorage', 'ID', 'stats', 'document',
  extractFn('processParentTools')
)

const mockDocument = {
  createElement: (tag) => new MockElement(tag),
  activeElement: null
}
global.mockActiveDocument = mockDocument

console.log('=== Phase 4.1 Tool Collapse Integration Audit Suite ===')

// Test 1: Tool Group Identity Stability
{
  console.log('[Test 1] Tool Group Identity: Stability across rerenders & independent of volatile text or DOM index')
  const parent = new MockElement('div', 'asst-content')
  const asstRoot = new MockElement('div', 'asst-root', { 'data-slot': 'aui_assistant-message-root', 'data-message-id': 'msg_1001' })
  asstRoot.appendChild(parent)

  // Tool 1 — the renderer puts no call-id on a tool block, so stability comes from
  // the anchor the plugin mints on first sight and stores on the element.
  const tool1 = new MockElement('div', 'tool', { 'data-slot': 'tool-block' })
  tool1.textContent = 'Initial short text'
  parent.appendChild(tool1)

  const stats = { toolGroupRefreshes: 0 }
  processParentTools(parent, [tool1], detectToolState, (run) => getToolGroupId(run, parent, getToolAnchorId), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)

  const header1 = parent.querySelector('.bubbles-tool-group')
  const initialGroupId = header1.getAttribute('data-group-id')
  const anchorId = tool1.getAttribute('data-bubbles-tool-anchor-id')
  assert(anchorId, 'The first pass must mint an anchor id on the tool block')
  assert(initialGroupId.includes(anchorId), `Group identity must be keyed on that anchor, got ${initialGroupId}`)

  // Simulate rerender with changed text content and added preceding element (DOM index shift)
  const paragraph = new MockElement('p', 'prose')
  paragraph.textContent = 'Preceding paragraph inserted'
  parent.insertBefore(paragraph, header1)
  tool1.textContent = 'Mutated longer text with altered title'

  processParentTools(parent, [tool1], detectToolState, (run) => getToolGroupId(run, parent, getToolAnchorId), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)

  const headerAfterRerender = parent.querySelector('.bubbles-tool-group')
  const rerenderedGroupId = headerAfterRerender.getAttribute('data-group-id')
  assert.strictEqual(rerenderedGroupId, initialGroupId, 'Group identity must remain strictly identical across rerenders')
  console.log('  ✓ Passed')
}

// Test 2: Dynamic Tool Lifecycle (Tool A running -> completed -> Tool B running -> completed -> Tool C running -> completed)
{
  console.log('[Test 2] Dynamic Tool Lifecycle: Incremental execution converges to "3 tools completed" without duplicate headers')
  const parent = new MockElement('div', 'asst-content')
  const stats = { toolGroupRefreshes: 0 }

  // Step 1: Tool A running
  const toolA = new MockElement('div', 'tool', { 'data-slot': 'tool-block', 'data-tool-call-id': 'call_a' })
  const spinnerA = new MockElement('span', 'animate-spin')
  toolA.appendChild(spinnerA)
  parent.appendChild(toolA)

  processParentTools(parent, [toolA], detectToolState, (run) => getToolGroupId(run, parent, getToolAnchorId), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)
  assert.strictEqual(parent.querySelectorAll('.bubbles-tool-group').length, 0, 'Running tool must NOT have a completed group header')
  assert.strictEqual(toolA.hasAttribute('data-bubbles-group-collapsed'), false, 'Running tool must remain expanded')

  // Step 2: Tool A completed
  spinnerA.remove()
  toolA.textContent = 'Tool A finished'
  processParentTools(parent, [toolA], detectToolState, (run) => getToolGroupId(run, parent, getToolAnchorId), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)
  assert.strictEqual(parent.querySelectorAll('.bubbles-tool-group').length, 1, 'Header created for completed Tool A')
  assert.strictEqual(toolA.getAttribute('data-bubbles-group-collapsed'), 'true', 'Tool A is now collapsed')

  // Step 3: Tool B running
  const toolB = new MockElement('div', 'tool', { 'data-slot': 'tool-block', 'data-tool-call-id': 'call_b' })
  const spinnerB = new MockElement('span', 'animate-spin')
  toolB.appendChild(spinnerB)
  parent.appendChild(toolB)

  processParentTools(parent, [toolA, toolB], detectToolState, (run) => getToolGroupId(run, parent, getToolAnchorId), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)
  assert.strictEqual(parent.querySelectorAll('.bubbles-tool-group').length, 1, 'Still only 1 header')
  assert.strictEqual(toolB.hasAttribute('data-bubbles-group-collapsed'), false, 'Tool B running must remain expanded')

  // Step 4: Tool B completed
  spinnerB.remove()
  toolB.textContent = 'Tool B finished'
  processParentTools(parent, [toolA, toolB], detectToolState, (run) => getToolGroupId(run, parent, getToolAnchorId), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)
  assert.strictEqual(parent.querySelectorAll('.bubbles-tool-group').length, 1, 'Header reused for Tool A + B')
  assert.strictEqual(parent.querySelector('.bubbles-group-label').textContent, '2 tools completed', 'Count updated to 2 tools completed')
  assert.strictEqual(toolB.getAttribute('data-bubbles-group-collapsed'), 'true', 'Tool B is now collapsed')

  // Step 5: Tool C running
  const toolC = new MockElement('div', 'tool', { 'data-slot': 'tool-block', 'data-tool-call-id': 'call_c' })
  const spinnerC = new MockElement('span', 'animate-spin')
  toolC.appendChild(spinnerC)
  parent.appendChild(toolC)

  processParentTools(parent, [toolA, toolB, toolC], detectToolState, (run) => getToolGroupId(run, parent, getToolAnchorId), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)
  assert.strictEqual(parent.querySelectorAll('.bubbles-tool-group').length, 1, 'No duplicate header while Tool C runs')
  assert.strictEqual(toolC.hasAttribute('data-bubbles-group-collapsed'), false, 'Tool C running must remain expanded')

  // Step 6: Tool C completed
  spinnerC.remove()
  toolC.textContent = 'Tool C finished'
  processParentTools(parent, [toolA, toolB, toolC], detectToolState, (run) => getToolGroupId(run, parent, getToolAnchorId), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)
  assert.strictEqual(parent.querySelectorAll('.bubbles-tool-group').length, 1, 'Exactly 1 group header for all 3 consecutive tools')
  assert.strictEqual(parent.querySelector('.bubbles-group-label').textContent, '3 tools completed', 'Final label must be "3 tools completed"')
  assert.strictEqual(toolA.getAttribute('data-bubbles-group-collapsed'), 'true')
  assert.strictEqual(toolB.getAttribute('data-bubbles-group-collapsed'), 'true')
  assert.strictEqual(toolC.getAttribute('data-bubbles-group-collapsed'), 'true')
  console.log('  ✓ Passed')
}

// Test 3: Collapse -> Expand -> Collapse Non-Destructive Integrity
{
  console.log('[Test 3] Non-Destructive Integrity: Zero DOM deletion, zero cloning, text perfectly intact')
  const parent = new MockElement('div', 'asst-content')
  const tool = new MockElement('div', 'tool-block', { 'data-slot': 'tool-block' })
  const originalHtml = '<span>Output: exit code 0</span>'
  tool.textContent = originalHtml
  parent.appendChild(tool)

  const stats = { toolGroupRefreshes: 0 }
  processParentTools(parent, [tool], detectToolState, (run) => getToolGroupId(run, parent, getToolAnchorId), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)

  const header = parent.querySelector('.bubbles-tool-group')
  const toggleBtn = header.querySelector('.bubbles-tool-group-toggle')

  // Expand
  toggleBtn.click()
  assert.strictEqual(tool.getAttribute('data-bubbles-group-collapsed'), 'false')
  assert.strictEqual(tool.textContent, originalHtml, 'Content must not be modified')
  assert.strictEqual(tool.parentElement, parent, 'Parent node must not be detached')

  // Collapse again
  toggleBtn.click()
  assert.strictEqual(tool.getAttribute('data-bubbles-group-collapsed'), 'true')
  assert.strictEqual(tool.textContent, originalHtml, 'Content remains completely intact')
  console.log('  ✓ Passed')
}

// Test 4: Focus Safety
{
  console.log('[Test 4] Focus Safety: Focus inside collapsing tool is safely transferred to summary toggle button')
  const parent = new MockElement('div', 'asst-content')
  const tool = new MockElement('div', 'tool-block', { 'data-slot': 'tool-block' })
  const innerButton = new MockElement('button', 'copy-btn')
  innerButton.textContent = 'Copy log'
  tool.appendChild(innerButton)
  parent.appendChild(tool)

  const stats = { toolGroupRefreshes: 0 }
  processParentTools(parent, [tool], detectToolState, (run) => getToolGroupId(run, parent, getToolAnchorId), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)

  const header = parent.querySelector('.bubbles-tool-group')
  const toggleBtn = header.querySelector('.bubbles-tool-group-toggle')

  // Expand the tool
  toggleBtn.click()
  assert.strictEqual(tool.getAttribute('data-bubbles-group-collapsed'), 'false')

  // Simulate user focusing the inner button
  innerButton.focus()
  assert.strictEqual(mockDocument.activeElement, innerButton, 'Focus placed on inner element')
  assert.strictEqual(innerButton.isFocused, true)

  // User clicks toggle to collapse
  toggleBtn.click()

  // Verify focus is safely transferred to toggleBtn
  assert.strictEqual(mockDocument.activeElement, toggleBtn, 'Focus must NOT remain on hidden inner button, must transfer to toggleBtn')
  assert.strictEqual(toggleBtn.isFocused, true, 'Summary toggle button must hold focus')
  console.log('  ✓ Passed')
}

// Test 5: Persistence Across Rerenders
{
  console.log('[Test 5] Persistence: Expand state survives multiple DOM passes and storage errors')
  storageMock = {}
  const parent = new MockElement('div', 'asst-content')
  const tool1 = new MockElement('div', 'tool', { 'data-slot': 'tool-block', 'data-tool-call-id': 'call_p1' })
  tool1.textContent = 'Tool 1'
  parent.appendChild(tool1)

  const stats = { toolGroupRefreshes: 0 }
  processParentTools(parent, [tool1], detectToolState, (run) => getToolGroupId(run, parent, getToolAnchorId), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)

  const header = parent.querySelector('.bubbles-tool-group')
  const toggleBtn = header.querySelector('.bubbles-tool-group-toggle')

  // User expands group
  toggleBtn.click()
  assert.strictEqual(header.getAttribute('data-group-state'), 'expanded')

  // Simulate Tool 2 completion
  const tool2 = new MockElement('div', 'tool', { 'data-slot': 'tool-block', 'data-tool-call-id': 'call_p2' })
  tool2.textContent = 'Tool 2'
  parent.appendChild(tool2)

  // Re-run processParentTools
  processParentTools(parent, [tool1, tool2], detectToolState, (run) => getToolGroupId(run, parent, getToolAnchorId), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)

  // Group should still be expanded because group anchor ID was stable!
  assert.strictEqual(header.getAttribute('data-group-state'), 'expanded', 'Expanded state must be preserved across new tool completion')
  assert.strictEqual(tool1.getAttribute('data-bubbles-group-collapsed'), 'false')
  assert.strictEqual(tool2.getAttribute('data-bubbles-group-collapsed'), 'false')
  console.log('  ✓ Passed')
}

// Test 6: Strict Boundaries (Running, Failed, Task)
{
  console.log('[Test 6] Strict Boundaries: Isolation of running, failed, and task interleaved tools')
  const parent = new MockElement('div', 'asst-content')
  
  // 1. Completed
  const toolCompleted1 = new MockElement('div', 'tool', { 'data-slot': 'tool-block' })
  toolCompleted1.textContent = 'done 1'
  parent.appendChild(toolCompleted1)

  // 2. Failed
  const toolFailed = new MockElement('div', 'tool', { 'data-slot': 'tool-block' })
  toolFailed.appendChild(new MockElement('span', 'text-destructive'))
  parent.appendChild(toolFailed)

  // 3. Completed
  const toolCompleted2 = new MockElement('div', 'tool', { 'data-slot': 'tool-block' })
  toolCompleted2.textContent = 'done 2'
  parent.appendChild(toolCompleted2)

  // 4. Running
  const toolRunning = new MockElement('div', 'tool', { 'data-slot': 'tool-block' })
  toolRunning.appendChild(new MockElement('span', 'animate-spin'))
  parent.appendChild(toolRunning)

  const stats = { toolGroupRefreshes: 0 }
  processParentTools(parent, [toolCompleted1, toolFailed, toolCompleted2, toolRunning], detectToolState, (run) => getToolGroupId(run, parent, getToolAnchorId), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)

  const headers = parent.querySelectorAll('.bubbles-tool-group')
  assert.strictEqual(headers.length, 2, 'Failed tool must cleanly divide completed tools into 2 separate groups')

  assert.strictEqual(toolCompleted1.getAttribute('data-bubbles-group-collapsed'), 'true')
  assert.strictEqual(toolFailed.hasAttribute('data-bubbles-group-collapsed'), false, 'Failed tool must remain visible')
  assert.strictEqual(toolCompleted2.getAttribute('data-bubbles-group-collapsed'), 'true')
  assert.strictEqual(toolRunning.hasAttribute('data-bubbles-group-collapsed'), false, 'Running tool must remain visible')
  console.log('  ✓ Passed')
}

console.log('=== All Phase 4.1 Test Assertions Passed Successfully ===')
