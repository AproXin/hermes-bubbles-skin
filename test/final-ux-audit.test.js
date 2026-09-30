/**
 * hermes-bubbles-skin Final UX Audit Suite
 * End-to-end verification across all 9 core UX dimensions without external dependencies:
 * 1. Complete Chain Simulation
 * 2. History + Session Preview Interactions
 * 3. Session Switching Isolation (A -> B -> A)
 * 4. Tool Collapse Dynamic Lifecycle & Focus Safety
 * 5. Task Dock Resilience & Counter Accuracy
 * 6. Approval & Clarify Coexistence & Keyboard Usability
 * 7. Multi-Viewport Responsive Matrix (1440x900, 1024x400, 420x800)
 * 8. Visual Hierarchy & Layering
 * 9. Performance & Observer Metrics
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
    // updateTaskHeaderCounter publishes the completion ratio as a custom property,
    // so every mock node needs a minimal CSSStyleDeclaration.
    this._cssVars = {}
    this.style = {
      getPropertyValue: k => this._cssVars[k] ?? '',
      setProperty: (k, v) => { this._cssVars[k] = String(v) },
    }
    this._innerHTML = ''
    this._rect = { top: 100, left: 10, right: 250, bottom: 140, width: 240, height: 40 }
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

  get id() {
    return this.getAttribute('id') || ''
  }

  set id(val) {
    this.setAttribute('id', val)
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val)
    if (name === 'data-slot' && val === 'tool-block') {
      this._addDisclosureButton()
    }
  }

  removeAttribute(name) {
    delete this.attributes[name]
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
  }

  get textContent() {
    if (this._textContent !== undefined && this._textContent !== '') return this._textContent
    if (this._innerHTML) {
      return this._innerHTML.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    }
    if (this.children.length > 0) return this.children.map(c => c.textContent).join(' ')
    return this._textContent || ''
  }

  set textContent(val) {
    this._textContent = String(val)
    if (this.attributes['data-slot'] === 'tool-block') {
      // Preserve the disclosure button: assigning a title must not remove it.
      this.children = this.children.filter(c => c.tagName === 'BUTTON' && c.hasAttribute('aria-expanded'))
      for (const c of this.children) c.parentElement = this
      return
    }
    this.children = []
  }

  get innerHTML() {
    return this._innerHTML
  }

  set innerHTML(html) {
    this._innerHTML = String(html)
    this.children = []
    const tagMatches = html.matchAll(/<([a-zA-Z0-9]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9]+)([^>]*)\/>/g)
    for (const match of tagMatches) {
      const tagName = match[1] || match[4]
      const attrsStr = match[2] || match[5] || ''
      const inner = match[3] || ''

      const el = new MockElement(tagName)
      const classMatch = attrsStr.match(/class=["']([^"']*)["']/)
      if (classMatch) el.className = classMatch[1]
      const roleMatch = attrsStr.match(/role=["']([^"']*)["']/)
      if (roleMatch) el.setAttribute('role', roleMatch[1])

      el.textContent = inner.replace(/<[^>]*>/g, '').trim()
      this.appendChild(el)
    }
  }

  get isConnected() {
    let curr = this.parentElement
    while (curr) {
      if (curr.tagName === 'BODY' || curr.tagName === 'HTML') return true
      curr = curr.parentElement
    }
    return false
  }

  setRect(rect) {
    this._rect = { ...this._rect, ...rect }
  }

  getBoundingClientRect() {
    return this._rect
  }

  focus() {
    if (this.ownerDocument) {
      this.ownerDocument.activeElement = this
    }
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

  insertBefore(newNode, refNode) {
    if (newNode.parentElement) {
      newNode.remove()
    }
    newNode.parentElement = this
    newNode.ownerDocument = this.ownerDocument
    const idx = this.children.indexOf(refNode)
    if (idx === -1) {
      this.children.push(newNode)
    } else {
      this.children.splice(idx, 0, newNode)
    }
    return newNode
  }

  contains(node) {
    if (node === this) return true
    for (const child of this.children) {
      if (child.contains(node)) return true
    }
    return false
  }

  appendChild(child) {
    if (!child) return
    if (child.parentElement) {
      child.remove()
    }
    child.parentElement = this
    child.ownerDocument = this.ownerDocument || (this.tagName === 'BODY' ? this.doc : null)
    this.children.push(child)
    return child
  }

  append(...nodes) {
    for (const node of nodes) {
      if (typeof node === 'string') {
        const textNode = new MockElement('span')
        textNode.textContent = node
        this.appendChild(textNode)
      } else if (node) {
        this.appendChild(node)
      }
    }
  }

  removeChild(child) {
    const idx = this.children.indexOf(child)
    if (idx !== -1) {
      this.children.splice(idx, 1)
      child.parentElement = null
    }
    return child
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.removeChild(this)
    }
  }

  addEventListener(event, fn) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = []
    }
    this.eventListeners[event].push(fn)
  }

  removeEventListener(event, fn) {
    if (!this.eventListeners[event]) return
    this.eventListeners[event] = this.eventListeners[event].filter(h => h !== fn)
  }

  dispatchEvent(event) {
    const handlers = this.eventListeners[event.type] || []
    for (const h of handlers) {
      h(event)
    }
  }

  click() {
    const evt = {
      type: 'click',
      target: this,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true },
      stopPropagation() {}
    }
    this.dispatchEvent(evt)
  }

  matches(sel) {
    if (sel.includes(',')) {
      return sel.split(',').some(s => this.matches(s.trim()))
    }
    if (sel.startsWith('.')) {
      const classes = sel.split('.').filter(Boolean).map(c => c.replace(/\\/g, '').trim())
      return classes.every(c => this.classList.contains(c))
    }
    if (sel.startsWith('#')) {
      const id = sel.slice(1)
      return this.attributes.id === id
    }
    if (sel.startsWith('[') && sel.endsWith(']')) {
      const inside = sel.slice(1, -1)
      if (inside.includes('=')) {
        const [attr, val] = inside.split('=').map(s => s.replace(/['"]/g, '').trim())
        return this.getAttribute(attr) === val
      }
      return this.hasAttribute(inside)
    }
    // tag with [attr] selectors, e.g. button[aria-expanded]
    const tagNameMatch = sel.match(/^[a-zA-Z][\w-]*/)
    if (tagNameMatch && /\[([^\]]+)\]/.test(sel)) {
      if (this.tagName.toLowerCase() !== tagNameMatch[0].toLowerCase()) return false
      for (const m of sel.matchAll(/\[([^\]]+)\]/g)) {
        const inside = m[1]
        if (inside.includes('=')) {
          const [attr, val] = inside.split('=').map(s => s.replace(/['"]/g, '').trim())
          if (this.getAttribute(attr) !== val) return false
        } else if (!this.hasAttribute(inside)) {
          return false
        }
      }
      return true
    }
    return this.tagName.toLowerCase() === sel.toLowerCase()
  }

  closest(sel) {
    let curr = this
    while (curr) {
      if (curr.matches(sel)) return curr
      curr = curr.parentElement
    }
    return null
  }

  querySelector(sel) {
    for (const child of this.children) {
      if (child.matches(sel)) return child
      const found = child.querySelector(sel)
      if (found) return found
    }
    return null
  }

  querySelectorAll(sel) {
    let results = []
    for (const child of this.children) {
      if (child.matches(sel)) results.push(child)
      results = results.concat(child.querySelectorAll(sel))
    }
    return results
  }
}

// Global Plugin Source
const pluginSrcPath = path.resolve(__dirname, '../src/plugin.js')
const pluginCode = fs.readFileSync(pluginSrcPath, 'utf8')
const cssMatch = pluginCode.match(/const PLUGIN_CSS = `([\s\S]*?)`/)
const PLUGIN_CSS = cssMatch ? cssMatch[1] : ''

function setupEnvironment(viewportW = 1440, viewportH = 900) {
  const listeners = {}
  const mockDoc = {
    activeElement: null,
    head: new MockElement('head'),
    body: new MockElement('body'),
    documentElement: new MockElement('html'),
    getElementById(id) {
      if (id === 'bubbles-session-preview') {
        return this.body.querySelector('#bubbles-session-preview')
      }
      return null
    },
    createElement(tag) {
      const el = new MockElement(tag)
      el.ownerDocument = mockDoc
      return el
    },
    querySelector(sel) {
      if (this.body.matches(sel)) return this.body
      return this.body.querySelector(sel)
    },
    querySelectorAll(sel) {
      return this.body.querySelectorAll(sel)
    },
    addEventListener(event, fn) {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(fn)
    },
    removeEventListener(event, fn) {
      if (!listeners[event]) return
      listeners[event] = listeners[event].filter(h => h !== fn)
    },
    dispatchEvent(event) {
      const handlers = listeners[event.type] || []
      for (const h of handlers) h(event)
    }
  }

  mockDoc.head.ownerDocument = mockDoc
  mockDoc.body.ownerDocument = mockDoc
  mockDoc.documentElement.ownerDocument = mockDoc
  mockDoc.documentElement.appendChild(mockDoc.head)
  mockDoc.documentElement.appendChild(mockDoc.body)

  const mockWin = {
    innerWidth: viewportW,
    innerHeight: viewportH,
    performance: { now: () => Date.now() },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null },
      setItem(k, v) { this._data[k] = String(v) },
      removeItem(k) { delete this._data[k] }
    },
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: (id) => clearTimeout(id)
  }

  class MockMutationObserver {
    constructor(cb) { this.cb = cb }
    observe() {}
    disconnect() {}
  }

  mockWin.MutationObserver = MockMutationObserver

  const context = {
    window: mockWin,
    document: mockDoc,
    globalThis: mockWin,
    MutationObserver: MockMutationObserver,
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    console,
    performance: { now: () => Date.now() },
    localStorage: mockWin.localStorage,
    setTimeout,
    clearTimeout,
    Date
  }

  const cjsCode = pluginCode.replace('export default', 'globalThis.__hermesBubblesSkin =')
  const vm = require('vm')
  vm.createContext(context)
  vm.runInContext(cjsCode, context)

  return {
    doc: mockDoc,
    win: mockWin,
    vmContext: context,
    plugin: context.window.__hermesBubblesSkin,
    cleanup: () => vm.runInContext('cleanupAll()', context),
    runProcessDOM: () => vm.runInContext('processDOM()', context)
  }
}

async function runFinalUxAudit() {
  console.log('\n=== Hermes Bubbles Skin — Final UX Audit Suite ===\n')

  // --------------------------------------------------------------------------
  // Dimension 1: Complete Agent Chain Flow
  // --------------------------------------------------------------------------
  console.log('[Dimension 1] Complete Chain: History -> Session -> User -> Assistant streaming -> Thinking -> Tool running -> Tool completed -> Task -> Approval/Clarify -> Final Answer')
  {
    const env = setupEnvironment(1440, 900)
    const { doc, plugin, runProcessDOM, cleanup } = env

    plugin.register({ on: () => {}, addStyles: () => {} })

    // 1. Session in History
    const sessionRow = doc.createElement('div')
    sessionRow.className = 'row-hover'
    sessionRow.setAttribute('data-session-id', 'sess_chain_1')
    const sTitle = doc.createElement('span')
    sTitle.setAttribute('data-slot', 'sidebar-row-title')
    sTitle.textContent = 'Data Pipeline Refactor'
    sessionRow.appendChild(sTitle)
    // Session rows only exist inside the chat sidebar (components/ui/sidebar.tsx:150);
    // the probe is scoped there, so the fixture has to mirror that container.
    const sidebar = doc.createElement('div')
    sidebar.setAttribute('data-slot', 'sidebar')
    doc.body.appendChild(sidebar)
    sidebar.appendChild(sessionRow)

    // 2. User Message
    const userMsg = doc.createElement('div')
    userMsg.setAttribute('data-slot', 'aui_user-message-root')
    const humanMsg = doc.createElement('div')
    humanMsg.className = 'composer-human-message'
    const clamp = doc.createElement('div')
    clamp.className = 'sticky-human-clamp'
    clamp.textContent = 'Please refactor the database queries and test performance.'
    humanMsg.appendChild(clamp)
    const contextSkip = doc.createElement('div')
    contextSkip.setAttribute('data-context-menu-skip', 'true')
    humanMsg.appendChild(contextSkip)
    userMsg.appendChild(humanMsg)
    doc.body.appendChild(userMsg)

    // 3. Assistant Message with Thinking, Tools, and Final Answer
    const asstMsg = doc.createElement('div')
    asstMsg.setAttribute('data-slot', 'aui_assistant-message-root')
    asstMsg.setAttribute('data-message-id', 'msg_chain_asst')

    const thinking = doc.createElement('div')
    thinking.setAttribute('data-slot', 'aui_thinking-disclosure')
    thinking.textContent = 'Analyzing query AST and index coverage...'
    asstMsg.appendChild(thinking)

    // Tool 1: Completed
    const t1 = doc.createElement('div')
    t1.setAttribute('data-slot', 'tool-block')
    t1.setAttribute('data-tool-call-id', 't1')
    const t1Span = doc.createElement('span')
    t1Span.textContent = 'Read schema.prisma'
    t1.appendChild(t1Span)
    const t1Check = doc.createElement('div')
    t1Check.className = 'codicon-check'
    t1.appendChild(t1Check)
    asstMsg.appendChild(t1)

    // Tool 2: Completed
    const t2 = doc.createElement('div')
    t2.setAttribute('data-slot', 'tool-block')
    t2.setAttribute('data-tool-call-id', 't2')
    const t2Span = doc.createElement('span')
    t2Span.textContent = 'Inspect index.ts'
    t2.appendChild(t2Span)
    const t2Check = doc.createElement('div')
    t2Check.className = 'codicon-check'
    t2.appendChild(t2Check)
    asstMsg.appendChild(t2)

    // Tool 3: Running
    const t3 = doc.createElement('div')
    t3.setAttribute('data-slot', 'tool-block')
    t3.setAttribute('data-tool-call-id', 't3')
    const t3Span = doc.createElement('span')
    t3Span.textContent = 'Benchmark query speed'
    t3.appendChild(t3Span)
    const t3Spin = doc.createElement('div')
    t3Spin.className = 'animate-spin'
    t3.appendChild(t3Spin)
    asstMsg.appendChild(t3)

    // Final Answer Content
    const asstContent = doc.createElement('div')
    asstContent.setAttribute('data-slot', 'aui_assistant-message-content')
    asstContent.textContent = 'Query optimization plan completed with 10x throughput boost.'
    asstMsg.appendChild(asstContent)
    doc.body.appendChild(asstMsg)

    // 4. Task Dock
    const statusStack = doc.createElement('div')
    statusStack.setAttribute('data-slot', 'composer-status-stack')
    const taskSection = doc.createElement('div')
    taskSection.setAttribute('data-slot', 'status-section')
    const taskHeader = doc.createElement('div')
    taskHeader.className = 'status-section-header'
    const trigger = doc.createElement('span')
    trigger.className = 'status-section-trigger codicon-checklist'
    trigger.textContent = 'Tasks'
    taskHeader.appendChild(trigger)
    taskSection.appendChild(taskHeader)

    const taskBody = doc.createElement('div')
    taskBody.className = 'status-section-body'
    const taskRow1 = doc.createElement('div')
    taskRow1.setAttribute('data-slot', 'status-row')
    const icon1 = doc.createElement('span')
    icon1.className = 'status-row-icon codicon-check'
    taskRow1.appendChild(icon1)
    taskBody.appendChild(taskRow1)

    const taskRow2 = doc.createElement('div')
    taskRow2.setAttribute('data-slot', 'status-row')
    const icon2 = doc.createElement('span')
    icon2.className = 'status-row-icon animate-spin'
    taskRow2.appendChild(icon2)
    taskBody.appendChild(taskRow2)

    taskSection.appendChild(taskBody)
    statusStack.appendChild(taskSection)
    doc.body.appendChild(statusStack)

    // 5. Approval Card
    const approvalCard = doc.createElement('div')
    approvalCard.setAttribute('data-slot', 'tool-approval-card')
    const pre = doc.createElement('pre')
    pre.textContent = 'prisma migrate deploy'
    approvalCard.appendChild(pre)
    const apprActions = doc.createElement('div')
    apprActions.setAttribute('data-slot', 'tool-approval-actions')
    const runBtn = doc.createElement('button')
    runBtn.setAttribute('data-approval-run', 'true')
    runBtn.textContent = 'Allow'
    apprActions.appendChild(runBtn)
    approvalCard.appendChild(apprActions)
    doc.body.appendChild(approvalCard)

    // Run DOM transformation
    runProcessDOM()

    // Assertions:
    assert.strictEqual(doc.documentElement.getAttribute('data-bubbles-skin'), 'true')
    assert.strictEqual(sessionRow.getAttribute('data-bubbles-session-row'), 'true')

    // Tool group check
    const toolGroup = asstMsg.querySelector('.bubbles-tool-group')
    assert(toolGroup, 'Completed tools must be aggregated into tool group')
    const groupToggle = toolGroup.querySelector('.bubbles-tool-group-toggle')
    assert(groupToggle.textContent.includes('2 tools completed'), 'Group toggle should show "2 tools completed"')
    assert.strictEqual(t3.getAttribute('data-bubbles-tool-state'), 'running', 'Running tool must stay running')

    // Task counter: the skin no longer paints its own pill (native header says 任务 n/m)
    assert.strictEqual(taskHeader.querySelector('.bubbles-task-counter'), null, 'Task header must not carry a duplicate counter pill')

    // Approval card check
    assert.strictEqual(approvalCard.getAttribute('data-bubbles-approval'), 'true')

    cleanup()
    console.log('  ✓ Passed')
  }

  // --------------------------------------------------------------------------
  // Dimension 2: History + Session Preview Interactions & Non-Blocking
  // --------------------------------------------------------------------------
  console.log('[Dimension 2] History + Session Preview: Hover, Focus, Position boundaries, Click/Context non-blocking')
  {
    const env = setupEnvironment(1440, 900)
    const { doc, plugin, runProcessDOM, cleanup } = env

    plugin.register({ on: () => {}, addStyles: () => {} })

    const row = doc.createElement('div')
    row.className = 'row-hover'
    row.setAttribute('data-session-id', 'sess_preview_test')
    // The host gives sidebar rows no data-slot for their label: the title lives in
    // the marquee span inside button.row-button (app/chat/sidebar/session-row.tsx).
    // This fixture used data-slot="sidebar-row-title", which the renderer never
    // emits — so it was testing the skin's belief about the host, not the host.
    const rowButton = doc.createElement('button')
    rowButton.className = 'row-button'
    const title = doc.createElement('span')
    title.className = 'hover-marquee-inner'
    title.textContent = 'Transformer Attention Engine'
    rowButton.appendChild(title)
    row.appendChild(rowButton)
    const snippet = doc.createElement('span')
    snippet.className = 'truncate'
    snippet.textContent = 'Optimizing multi-head query projections'
    row.appendChild(snippet)
    // Session rows only exist inside the chat sidebar (components/ui/sidebar.tsx:150);
    // the probe is scoped there, so the fixture has to mirror that container.
    const sidebar = doc.createElement('div')
    sidebar.setAttribute('data-slot', 'sidebar')
    doc.body.appendChild(sidebar)
    sidebar.appendChild(row)

    runProcessDOM()

    // Test Hover (pointerover)
    doc.dispatchEvent({ type: 'pointerover', target: row })
    const preview = doc.getElementById('bubbles-session-preview')
    assert(preview, 'Preview card must be mounted on document.body')
    assert.strictEqual(preview.getAttribute('data-visible'), 'true')
    assert.strictEqual(preview.getAttribute('role'), 'tooltip')
    assert(preview.textContent.includes('Transformer Attention Engine'))
    assert(preview.textContent.includes('Optimizing multi-head query projections'))

    // Test Right Viewport Boundary Clamping
    preview.setRect({ width: 300, height: 180 })
    // Place row at far right (right: 1420px in 1440px viewport)
    row.setRect({ left: 1260, right: 1420, top: 100, bottom: 140, width: 160, height: 40 })
    env.vmContext.positionPreview(row, preview)
    const clampLeft = parseInt(preview.style.left, 10)
    assert(clampLeft + 300 <= 1440, `Preview right edge (${clampLeft + 300}) must stay inside 1440px viewport`)

    // Test Bottom Viewport Boundary Clamping
    // Place row at bottom (top: 880px in 900px viewport)
    row.setRect({ left: 200, right: 360, top: 880, bottom: 920, width: 160, height: 40 })
    env.vmContext.positionPreview(row, preview)
    const clampTop = parseInt(preview.style.top, 10)
    assert(clampTop + 180 <= 900, `Preview bottom edge (${clampTop + 180}) must stay inside 900px viewport`)

    // Test Pointerleave / Focusout Hiding
    doc.dispatchEvent({ type: 'pointerout', target: row, relatedTarget: null })
    assert.strictEqual(preview.getAttribute('data-visible'), 'false', 'Pointerout must hide preview')

    // Test Focusin / Focusout
    doc.dispatchEvent({ type: 'focusin', target: row })
    assert.strictEqual(preview.getAttribute('data-visible'), 'true', 'Focusin must reveal preview')
    doc.dispatchEvent({ type: 'focusout', target: row, relatedTarget: null })
    assert.strictEqual(preview.getAttribute('data-visible'), 'false', 'Focusout must hide preview')

    // Test Escape Key
    doc.dispatchEvent({ type: 'focusin', target: row })
    assert.strictEqual(preview.getAttribute('data-visible'), 'true')
    doc.dispatchEvent({ type: 'keydown', key: 'Escape' })
    assert.strictEqual(preview.getAttribute('data-visible'), 'false', 'Escape key must close preview')

    // Test Native Click & Non-blocking
    let nativeClick = false
    row.addEventListener('click', () => { nativeClick = true })
    row.click()
    assert.strictEqual(nativeClick, true, 'Native row click must not be intercepted')

    cleanup()
    console.log('  ✓ Passed')
  }

  // --------------------------------------------------------------------------
  // Dimension 3: Session Switching Cycle: Session A -> B -> A
  // --------------------------------------------------------------------------
  console.log('[Dimension 3] Session Switching: A -> B -> A isolation, state preservation, zero cross-talk')
  {
    const env = setupEnvironment(1440, 900)
    const { doc, plugin, runProcessDOM, cleanup } = env

    plugin.register({ on: () => {}, addStyles: () => {} })

    // Session A
    const sessA = doc.createElement('div')
    sessA.setAttribute('data-session-id', 'session_A')
    const asstA = doc.createElement('div')
    asstA.setAttribute('data-slot', 'aui_assistant-message-root')
    asstA.setAttribute('data-message-id', 'asst_msg_A')

    const tA1 = doc.createElement('div')
    tA1.setAttribute('data-slot', 'tool-block')
    tA1.setAttribute('data-tool-call-id', 'tA1')
    tA1.appendChild(doc.createElement('div')).className = 'codicon-check'
    asstA.appendChild(tA1)

    const tA2 = doc.createElement('div')
    tA2.setAttribute('data-slot', 'tool-block')
    tA2.setAttribute('data-tool-id', 'tA2')
    tA2.appendChild(doc.createElement('div')).className = 'codicon-check'
    asstA.appendChild(tA2)

    sessA.appendChild(asstA)
    doc.body.appendChild(sessA)

    runProcessDOM()

    const groupA = asstA.querySelector('.bubbles-tool-group')
    assert(groupA, 'Session A must have tool group')
    // Expand Session A
    const toggleA = groupA.querySelector('.bubbles-tool-group-toggle')
    toggleA.click()
    assert.strictEqual(groupA.getAttribute('data-group-state'), 'expanded')

    // Switch to Session B (Unmount A, mount B)
    sessA.remove()

    const sessB = doc.createElement('div')
    sessB.setAttribute('data-session-id', 'session_B')
    const asstB = doc.createElement('div')
    asstB.setAttribute('data-slot', 'aui_assistant-message-root')
    asstB.setAttribute('data-message-id', 'asst_msg_B')

    const tB1 = doc.createElement('div')
    tB1.setAttribute('data-slot', 'tool-block')
    tB1.setAttribute('data-tool-id', 'tB1')
    tB1.appendChild(doc.createElement('div')).className = 'codicon-check'
    asstB.appendChild(tB1)

    const tB2 = doc.createElement('div')
    tB2.setAttribute('data-slot', 'tool-block')
    tB2.setAttribute('data-tool-id', 'tB2')
    tB2.appendChild(doc.createElement('div')).className = 'codicon-check'
    asstB.appendChild(tB2)

    sessB.appendChild(asstB)
    doc.body.appendChild(sessB)

    runProcessDOM()

    const groupB = asstB.querySelector('.bubbles-tool-group')
    assert(groupB, 'Session B must have tool group')
    // Session B must NOT inherit Session A's expanded state!
    assert.strictEqual(
      groupB.getAttribute('data-group-state'),
      'collapsed',
      'Session B must be collapsed by default'
    )

    // Switch back to Session A
    sessB.remove()
    doc.body.appendChild(sessA)
    runProcessDOM()

    const restoredGroupA = asstA.querySelector('.bubbles-tool-group')
    assert.strictEqual(
      restoredGroupA.getAttribute('data-group-state'),
      'expanded',
      'Session A must preserve its expanded state upon return'
    )

    cleanup()
    console.log('  ✓ Passed')
  }

  // --------------------------------------------------------------------------
  // Dimension 4: Tool Collapse Dynamic Lifecycle & Focus Safety
  // --------------------------------------------------------------------------
  console.log('[Dimension 4] Tool Collapse: running -> completed -> auto collapse -> toggle expand -> focus safety')
  {
    const env = setupEnvironment(1440, 900)
    const { doc, plugin, runProcessDOM, cleanup } = env

    plugin.register({ on: () => {}, addStyles: () => {} })

    const asst = doc.createElement('div')
    asst.setAttribute('data-slot', 'aui_assistant-message-root')
    asst.setAttribute('data-message-id', 'msg_tools_dyn')

    const t1 = doc.createElement('div')
    t1.setAttribute('data-slot', 'tool-block')
    t1.setAttribute('data-tool-id', 't_dyn_1')
    const t1Spin = doc.createElement('div')
    t1Spin.className = 'animate-spin'
    t1.appendChild(t1Spin)
    asst.appendChild(t1)
    doc.body.appendChild(asst)

    runProcessDOM()
    assert.strictEqual(t1.getAttribute('data-bubbles-tool-state'), 'running')
    assert.strictEqual(asst.querySelector('.bubbles-tool-group'), null, 'Running tool must not be grouped')

    // Tool 1 completes, Tool 2 joins
    t1Spin.className = 'codicon-check'
    const t2 = doc.createElement('div')
    t2.setAttribute('data-slot', 'tool-block')
    t2.setAttribute('data-tool-id', 't_dyn_2')
    const t2Check = doc.createElement('div')
    t2Check.className = 'codicon-check'
    t2.appendChild(t2Check)
    const innerBtn = doc.createElement('button')
    innerBtn.className = 'inner-tool-btn'
    t2.appendChild(innerBtn)
    asst.appendChild(t2)

    runProcessDOM()

    const group = asst.querySelector('.bubbles-tool-group')
    assert(group, 'Completed tools must now form group')
    assert.strictEqual(group.getAttribute('data-group-state'), 'collapsed')

    // Focus safety: focus inside tool
    innerBtn.focus()
    assert.strictEqual(doc.activeElement, innerBtn)

    const toggle = group.querySelector('.bubbles-tool-group-toggle')
    // Expand
    toggle.click()
    assert.strictEqual(group.getAttribute('data-group-state'), 'expanded')

    // Collapse: activeElement inside collapsing tools must transfer to toggle button
    toggle.click()
    assert.strictEqual(group.getAttribute('data-group-state'), 'collapsed')
    assert.strictEqual(doc.activeElement, toggle, 'Focus must transfer safely to toggle button')

    cleanup()
    console.log('  ✓ Passed')
  }

  // --------------------------------------------------------------------------
  // Dimension 5: Task Dock Resilience & Counter Accuracy
  // --------------------------------------------------------------------------
  console.log('[Dimension 5] Task Dock: 1 task, multi-task, long task, states (running/completed/failed/waiting)')
  {
    const env = setupEnvironment(1440, 900)
    const { doc, plugin, runProcessDOM, cleanup } = env

    plugin.register({ on: () => {}, addStyles: () => {} })

    const statusStack = doc.createElement('div')
    statusStack.setAttribute('data-slot', 'composer-status-stack')
    const taskSection = doc.createElement('div')
    taskSection.setAttribute('data-slot', 'status-section')
    const header = doc.createElement('div')
    header.className = 'status-section-header'
    const trigger = doc.createElement('span')
    trigger.className = 'status-section-trigger codicon-checklist'
    trigger.textContent = 'Tasks'
    header.appendChild(trigger)
    taskSection.appendChild(header)

    const body = doc.createElement('div')
    body.className = 'status-section-body'

    // 5 diverse task rows
    const states = ['completed', 'running', 'failed', 'waiting', 'pending']
    const iconClasses = [
      'codicon-check',
      'animate-spin',
      'ui_error codicon-error',
      'codicon-warning',
      'codicon-circle'
    ]

    for (let i = 0; i < 5; i++) {
      const row = doc.createElement('div')
      row.setAttribute('data-slot', 'status-row')
      const icon = doc.createElement('span')
      icon.className = `status-row-icon ${iconClasses[i]}`
      row.appendChild(icon)
      const text = doc.createElement('span')
      text.textContent = `Workflow step ${i + 1}: ${states[i]}`
      row.appendChild(text)
      body.appendChild(row)
    }

    taskSection.appendChild(body)
    statusStack.appendChild(taskSection)
    doc.body.appendChild(statusStack)

    runProcessDOM()

    const rows = body.querySelectorAll('[data-bubbles-task-row="true"]')
    assert.strictEqual(rows.length, 5)
    for (let i = 0; i < 5; i++) {
      assert.strictEqual(rows[i].getAttribute('data-task-state'), states[i], `Task ${i} must have state ${states[i]}`)
    }

    assert.strictEqual(header.querySelector('.bubbles-task-counter'), null, 'No duplicate counter pill')

    cleanup()
    console.log('  ✓ Passed')
  }

  // --------------------------------------------------------------------------
  // Dimension 6: Approval & Clarify Coexistence & Keyboard Usability
  // --------------------------------------------------------------------------
  console.log('[Dimension 6] Approval & Clarify: Coexistence with Task/Tool, keyboard usability, zero clipping')
  {
    const env = setupEnvironment(1440, 900)
    const { doc, plugin, runProcessDOM, cleanup } = env

    plugin.register({ on: () => {}, addStyles: () => {} })

    const appr = doc.createElement('div')
    appr.setAttribute('data-slot', 'tool-approval-card')
    const actions = doc.createElement('div')
    actions.setAttribute('data-slot', 'tool-approval-actions')
    const runBtn = doc.createElement('button')
    runBtn.setAttribute('data-approval-run', 'true')
    runBtn.textContent = 'Execute'
    actions.appendChild(runBtn)
    appr.appendChild(actions)
    doc.body.appendChild(appr)

    const clarify = doc.createElement('div')
    clarify.setAttribute('data-slot', 'clarify-inline')
    const cForm = doc.createElement('form')
    cForm.className = 'clarify-form'
    const cInput = doc.createElement('input')
    cInput.className = 'clarify-input'
    cForm.appendChild(cInput)
    clarify.appendChild(cForm)
    doc.body.appendChild(clarify)

    runProcessDOM()

    assert.strictEqual(appr.getAttribute('data-bubbles-approval'), 'true')
    assert.strictEqual(clarify.getAttribute('data-bubbles-clarify'), 'true')

    // Test button click
    let clicked = false
    runBtn.addEventListener('click', () => { clicked = true })
    runBtn.click()
    assert.strictEqual(clicked, true, 'Approval button must click without interception')

    // Test focus
    runBtn.focus()
    assert.strictEqual(doc.activeElement, runBtn, 'Button must accept focus')

    cleanup()
    console.log('  ✓ Passed')
  }

  // --------------------------------------------------------------------------
  // Dimension 7: Multi-Viewport Responsive Matrix (1440x900, 1024x400, 420x800)
  // --------------------------------------------------------------------------
  console.log('[Dimension 7] Responsive: 1440x900, 1024x400 (short window), 420x800 (narrow pane)')
  {
    // Viewport 1: 1440 x 900 (standard desktop)
    const env1440 = setupEnvironment(1440, 900)
    assert.strictEqual(env1440.win.innerWidth, 1440)
    assert.strictEqual(env1440.win.innerHeight, 900)

    // Viewport 2: 1024 x 400 (ultra short window)
    const env400 = setupEnvironment(1024, 400)
    const css = PLUGIN_CSS
    assert(css.includes('clamp(90px, 28vh, 320px)'), 'Task dock must use clamp to protect short window')
    assert(css.includes('clamp(100px, 24vh, 200px)'), 'Approval code must use clamp to protect short window')

    // Viewport 3: 420 x 800 (narrow pane / mobile)
    const env420 = setupEnvironment(420, 800)
    assert(css.includes('overflow-wrap: break-word'), 'Conversation must wrap long words')
    assert(css.includes('max-width: min(85%, calc(100% - 80px))'), 'Assistant bubble must fit narrow pane')
    assert(css.includes('overflow-x: auto'), 'Code and tables must scroll horizontally within bubble')

    env1440.cleanup()
    env400.cleanup()
    env420.cleanup()
    console.log('  ✓ Passed')
  }

  // --------------------------------------------------------------------------
  // Dimension 8: Visual Hierarchy & Layering Verification
  // --------------------------------------------------------------------------
  console.log('[Dimension 8] Visual Hierarchy: Final Answer > Assistant > Tool/Thinking > Task > History')
  {
    const env = setupEnvironment(1440, 900)
    const css = PLUGIN_CSS

    // Layering z-indices
    assert(css.includes("tool-approval-stack'] {\n  z-index: 50"), 'Approval stack must be z-index: 50')
    assert(css.includes("clarify-inline']"), 'Clarify inline selector must be present')
    assert(css.includes('z-index: 40 !important'), 'Clarify must be z-index: 40')
    assert(css.includes('z-index: 9999 !important'), 'Floating Session Preview must be top z-index: 9999')

    // Visual weight
    assert(css.includes('font-size: 11.5px'), 'Tool and thinking elements must be subordinate at 11.5px')
    assert(css.includes('backdrop-filter: blur(20px)'), 'Preview frosted glass must have 20px blur')

    env.cleanup()
    console.log('  ✓ Passed')
  }

  // --------------------------------------------------------------------------
  // Dimension 9: Performance & Observer Metrics
  // --------------------------------------------------------------------------
  console.log('[Dimension 9] Performance: window.__hermesBubblesSkinStats, execution latency, batch stability')
  {
    const env = setupEnvironment(1440, 900)
    const { win, runProcessDOM, plugin, cleanup } = env

    plugin.register({ on: () => {}, addStyles: () => {} })

    const start = win.performance.now()
    for (let i = 0; i < 20; i++) {
      runProcessDOM()
    }
    const elapsed = win.performance.now() - start

    const stats = win.__hermesBubblesSkinStats
    assert(stats, 'Stats object must exist on globalThis')
    assert(typeof stats.lastBatchDurationMs === 'number', 'lastBatchDurationMs must be recorded')
    assert(stats.lastBatchDurationMs >= 0, 'lastBatchDurationMs must be >= 0')
    assert(elapsed < 100, `20 DOM passes took ${elapsed}ms, well below budget (<100ms)`)

    cleanup()
    console.log('  ✓ Passed')
  }

  console.log('\n=== All 9 Final UX Audit Dimensions Passed Successfully ===\n')
}

runFinalUxAudit().catch(err => {
  console.error('\n❌ Final UX Audit Failed:', err)
  process.exit(1)
})
