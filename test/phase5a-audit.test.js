/**
 * test/phase5a-audit.test.js
 *
 * Phase 5A History / Session Visual Layer Audit:
 * 1. Session Recognition: Identifies sidebar rows and accurately detects active session.
 * 2. Active Session Transition: Switching active session dynamically updates attributes without stale state.
 * 3. Non-Invasive Integrity: Zero event interception, zero click hijacking, no custom session cache.
 * 4. Virtualized List Idempotence: Handles dynamic TanStack virtual scrolling smoothly.
 * 5. CSS Architecture & Bubbles Aesthetics: Frosted sapphire glass, 3px indicator, reduced-motion.
 * 6. Lifecycle & Zero Leak Cleanup: Complete attribute removal on unmount/dispose.
 */

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { pluginCss } = require('../scripts/lib/sheets')

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
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val)
  }

  removeAttribute(name) {
    delete this.attributes[name]
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
  }

  get textContent() {
    if (this.children.length === 0) return this._textContent
    return this.children.map(c => c.textContent).join('')
  }

  set textContent(val) {
    this.children = []
    this._textContent = String(val)
  }

  appendChild(child) {
    if (!child) return
    child.parentElement = this
    this.children.push(child)
    return child
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

  dispatchEvent(event) {
    const handlers = this.eventListeners[event.type] || []
    for (const h of handlers) {
      h(event)
    }
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true } })
  }

  pointerDown() {
    this.dispatchEvent({ type: 'pointerdown', target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true } })
  }

  matches(sel) {
    if (sel.startsWith('.')) {
      const cls = sel.slice(1).replace(/\\/g, '')
      return this.classList.contains(cls)
    }
    if (sel.startsWith('[') && sel.endsWith(']')) {
      const inside = sel.slice(1, -1)
      if (inside.includes('=')) {
        const [attr, val] = inside.split('=').map(s => s.replace(/['"]/g, '').trim())
        return this.getAttribute(attr) === val
      }
      return this.hasAttribute(inside)
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

// Load source file
const pluginSrcPath = path.resolve(__dirname, '../src/plugin.js')
const pluginCode = fs.readFileSync(pluginSrcPath, 'utf8')

// Extract functions & CSS
function extractConst(name) {
  const marker = `const ${name} = `
  const startIdx = pluginCode.indexOf(marker)
  if (startIdx === -1) throw new Error(`Could not find const ${name}`)
  const afterMarker = startIdx + marker.length
  const quoteChar = pluginCode[afterMarker]
  if (quoteChar === '`') {
    const endIdx = pluginCode.indexOf('`', afterMarker + 1)
    if (endIdx === -1) throw new Error(`Could not find closing \` for ${name}`)
    return pluginCode.slice(afterMarker + 1, endIdx)
  }
  const endIdx = pluginCode.indexOf('\n', afterMarker)
  return eval(pluginCode.slice(afterMarker, endIdx).trim().replace(/;$/, ''))
}

const PLUGIN_CSS = extractConst('PLUGIN_CSS')
const BUILD_ID = extractConst('BUILD_ID')

// Extract Session & History module functions
function extractFunction(name) {
  const startIdx = pluginCode.indexOf(`function ${name}(`)
  if (startIdx === -1) throw new Error(`Could not find function ${name}`)
  let braceCount = 0
  let inFunc = false
  let endIdx = startIdx
  for (let i = startIdx; i < pluginCode.length; i++) {
    if (pluginCode[i] === '{') {
      braceCount++
      inFunc = true
    } else if (pluginCode[i] === '}') {
      braceCount--
      if (inFunc && braceCount === 0) {
        endIdx = i + 1
        break
      }
    }
  }
  return eval(`(${pluginCode.slice(startIdx, endIdx)})`)
}

function isElement(node) {
  return Boolean(node && node.nodeType === 1)
}
globalThis.isElement = isElement

const stats = { sessionRefreshes: 0 }
globalThis.stats = stats

const isRowActive = extractFunction('isRowActive')
const enhanceSidebarSessionRow = extractFunction('enhanceSidebarSessionRow')
const enhanceSidebarDivider = extractFunction('enhanceSidebarDivider')

console.log(`\n=== Phase 5A History & Session Visual Layer Audit Suite (Build ${BUILD_ID}) ===`)

// Test 1: Session Recognition & Active State Identification
{
  console.log('[Test 1] Session Recognition: Identifies sidebar rows and accurately detects active session')
  const stats = { sessionRefreshes: 0 }
  globalThis.__hermesBubblesSkinStats = stats

  // Build simulated Hermes Desktop sidebar DOM
  const sidebar = new MockElement('div', 'sidebar', { 'data-slot': 'sidebar' })
  const content = new MockElement('div', 'sidebar-content', { 'data-slot': 'sidebar-content' })
  sidebar.appendChild(content)

  // Date divider: TODAY
  const dividerToday = new MockElement('div', 'group/workspace flex items-center', { 'data-slot': 'sidebar-date-divider' })
  const dividerCaption = new MockElement('span', 'text-[0.64rem] font-semibold uppercase tracking-[0.12em]')
  dividerCaption.textContent = 'TODAY'
  dividerToday.appendChild(dividerCaption)
  content.appendChild(dividerToday)

  // Session Row 1: Active session
  const row1 = new MockElement('div', 'group row-hover relative grid items-stretch rounded-md bg-(--ui-row-active-background)')
  const row1Body = new MockElement('button', 'row-button')
  const row1Title = new MockElement('span', 'hover-marquee-inner')
  row1Title.textContent = 'Refactor auth service'
  row1Body.appendChild(row1Title)
  row1.appendChild(row1Body)
  content.appendChild(row1)

  // Session Row 2: Inactive session
  const row2 = new MockElement('div', 'group row-hover relative grid items-stretch rounded-md')
  const row2Body = new MockElement('button', 'row-button')
  const row2Title = new MockElement('span', 'hover-marquee-inner')
  row2Title.textContent = 'Fix login modal layout'
  row2Body.appendChild(row2Title)
  row2.appendChild(row2Body)
  content.appendChild(row2)

  // Enhance
  enhanceSidebarDivider(dividerToday)
  enhanceSidebarSessionRow(row1)
  enhanceSidebarSessionRow(row2)

  // Assertions
  assert.strictEqual(dividerToday.getAttribute('data-bubbles-session-divider'), 'true', 'Divider marked')
  assert.strictEqual(row1.getAttribute('data-bubbles-session-row'), 'true', 'Row 1 recognized')
  assert.strictEqual(row1.getAttribute('data-bubbles-session-active'), 'true', 'Row 1 identified as active')
  assert.strictEqual(row2.getAttribute('data-bubbles-session-row'), 'true', 'Row 2 recognized')
  assert.strictEqual(row2.getAttribute('data-bubbles-session-active'), 'false', 'Row 2 identified as inactive')
  console.log('  ✓ Passed')
}

// Test 2: Active Session Transition
{
  console.log('[Test 2] Active Session Transition: Switching active session dynamically updates attributes')
  const rowA = new MockElement('div', 'group row-hover bg-(--ui-row-active-background)')
  const rowB = new MockElement('div', 'group row-hover')

  // Initial state: Row A is active
  enhanceSidebarSessionRow(rowA)
  enhanceSidebarSessionRow(rowB)
  assert.strictEqual(rowA.getAttribute('data-bubbles-session-active'), 'true')
  assert.strictEqual(rowB.getAttribute('data-bubbles-session-active'), 'false')

  // User navigates: Row B becomes active, Row A becomes inactive
  rowA.classList.remove('bg-(--ui-row-active-background)')
  rowB.classList.add('bg-(--ui-row-active-background)')

  enhanceSidebarSessionRow(rowA)
  enhanceSidebarSessionRow(rowB)
  assert.strictEqual(rowA.getAttribute('data-bubbles-session-active'), 'false', 'Row A switched to inactive')
  assert.strictEqual(rowB.getAttribute('data-bubbles-session-active'), 'true', 'Row B switched to active')
  console.log('  ✓ Passed')
}

// Test 3: Non-Invasive Integrity (Zero Event Interception)
{
  console.log('[Test 3] Non-Invasive Integrity: Native listeners, clicks, and pointers untouched')
  const row = new MockElement('div', 'group row-hover')
  const kebabBtn = new MockElement('button', 'kebab-btn')
  row.appendChild(kebabBtn)

  let rowClicked = false
  let kebabClicked = false
  let pointerDownFired = false

  row.addEventListener('click', () => { rowClicked = true })
  row.addEventListener('pointerdown', () => { pointerDownFired = true })
  kebabBtn.addEventListener('click', (e) => {
    kebabClicked = true
    e.preventDefault()
  })

  // Enhance
  enhanceSidebarSessionRow(row)

  // Trigger events
  row.click()
  row.pointerDown()
  kebabBtn.click()

  assert.strictEqual(rowClicked, true, 'Row native click handler must fire')
  assert.strictEqual(pointerDownFired, true, 'Row native pointerdown handler must fire')
  assert.strictEqual(kebabClicked, true, 'Kebab button native click must fire')
  console.log('  ✓ Passed')
}

// Test 4: Virtualized List Idempotence (TanStack Virtualizer Simulation)
{
  console.log('[Test 4] Virtualized List Idempotence: Dynamic mounting and scrolling does not duplicate attributes')
  const viewport = new MockElement('div', 'scrollbar-fade overflow-y-auto')
  const virtualContainer = new MockElement('div', 'relative')
  viewport.appendChild(virtualContainer)

  // Generate 20 virtual items, only 3 in view at a time
  const virtualRows = []
  for (let i = 0; i < 20; i++) {
    const item = new MockElement('div', 'group row-hover')
    if (i === 5) {
      item.classList.add('bg-(--ui-row-active-background)') // Item 5 is active
    }
    virtualRows.push(item)
  }

  // Frame 1: Items 0, 1, 2 visible
  virtualContainer.appendChild(virtualRows[0])
  virtualContainer.appendChild(virtualRows[1])
  virtualContainer.appendChild(virtualRows[2])

  for (const r of virtualContainer.children) {
    enhanceSidebarSessionRow(r)
  }
  assert.strictEqual(virtualRows[0].getAttribute('data-bubbles-session-active'), 'false')

  // Frame 2: Scroll down, items 4, 5, 6 visible
  virtualContainer.removeChild(virtualRows[0])
  virtualContainer.removeChild(virtualRows[1])
  virtualContainer.removeChild(virtualRows[2])

  virtualContainer.appendChild(virtualRows[4])
  virtualContainer.appendChild(virtualRows[5])
  virtualContainer.appendChild(virtualRows[6])

  for (const r of virtualContainer.children) {
    enhanceSidebarSessionRow(r)
  }

  assert.strictEqual(virtualRows[5].getAttribute('data-bubbles-session-active'), 'true', 'Virtual item 5 accurately identified as active upon mounting')
  assert.strictEqual(virtualRows[4].getAttribute('data-bubbles-session-active'), 'false')
  console.log('  ✓ Passed')
}

// Test 5: CSS Architecture & Bubbles Frosted Sapphire Aesthetics
{
  console.log('[Test 5] CSS Architecture: Verifies frosted glass, inset accent bar, and reduced-motion')
  assert(PLUGIN_CSS.includes("data-slot='sidebar'"), 'Styles must target [data-slot="sidebar"]')
  assert(PLUGIN_CSS.includes('backdrop-filter: blur'), 'Sidebar must include backdrop blur')
  // 3px sapphire indicator, painted as an inset shadow: a border-left that only the
  // active row carries eats inner width and shoves its title sideways.
  assert(PLUGIN_CSS.includes('inset 3px 0 0 0 #60a5fa'), 'Active session must have a 3px sapphire inset indicator')
  assert(!PLUGIN_CSS.includes('border-left: 3px solid #60a5fa'), 'Accent must not be a border-left (causes per-row reflow)')
  assert(PLUGIN_CSS.includes('data-bubbles-session-row'), 'CSS targets data-bubbles-session-row')
  assert(PLUGIN_CSS.includes('data-bubbles-session-active'), 'CSS targets data-bubbles-session-active')
  /* Checked against the CSS the browser actually receives, not the source text: a
     template literal must write `.group\\/workspace` for the runtime to hold
     `.group\/workspace`, and test/css-escapes-survive.test.js owns that rule. */
  assert(pluginCss().includes('.group\\/workspace'), 'CSS formats group/workspace date divider')

  // Reduced motion
  const reducedMotionIdx = PLUGIN_CSS.indexOf('prefers-reduced-motion: reduce')
  assert(reducedMotionIdx !== -1, 'prefers-reduced-motion block must exist')
  const reducedMotionBlock = PLUGIN_CSS.slice(reducedMotionIdx)
  assert(reducedMotionBlock.includes('[data-bubbles-session-row=\'true\']'), 'Reduced motion must cover session rows')
  console.log('  ✓ Passed')
}

// Test 6 used to live here: it stamped three attributes on two mock elements,
// called removeAttribute on them ITSELF, and asserted they were gone. cleanupAll
// was never invoked, so the suite could not fail whatever the plugin did. The real
// coverage is test/cleanup-parity.test.js, which drives the shipped processDOM and
// cleanupAll over a browser DOM and requires nothing to survive.

console.log('=== All Phase 5A Test Assertions Passed Successfully ===\n')
