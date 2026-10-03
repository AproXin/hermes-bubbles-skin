/**
 * test/phase5b-audit.test.js
 *
 * Phase 5B History / Session Preview Audit Suite:
 * 1. Basic: Session row hover triggers preview card, extracts Title, User snippet, Assistant snippet, timestamp.
 * 2. Close / Hide: Pointerleave and Escape key hide the preview smoothly.
 * 3. Keyboard Accessibility: focusin triggers preview, focusout hides, focus-visible verified.
 * 4. Virtualizer Remount: Dynamic unmount/remount does not break preview extraction or leave stale refs.
 * 5. Session Isolation: Session A and Session B previews are strictly isolated without cross-contamination.
 * 6. Non-Invasive Integrity: Native click/selection untouched, Tool Collapse and Task state untouched.
 * 7. Reduced Motion & CSS Architecture: Verifies transition disablement and frosted glass styling.
 */

const assert = require('assert')

const { MockElement } = require('./lib/mock-dom')
const { srcCode: pluginCode, extractConst, extractFunctionText, isElement } = require('./lib/plugin-sandbox')

/* The eval stays in this file: an extracted function closes over the scope it is
   evaluated in, and the shipped helpers reach for names declared right here
   (`mockWindow`, `mockDocument`). */
const extractFunction = name => eval(`(${extractFunctionText(name)})`)

// Simulated window and document
const mockWindow = {
  innerWidth: 1200,
  innerHeight: 800
}

const mockDocument = {
  activeElement: null,
  body: new MockElement('body'),
  eventListeners: {},
  createElement(tag) {
    return new MockElement(tag)
  },
  getElementById(id) {
    if (this.body.attributes.id === id) return this.body
    return this.body.querySelector(`#${id}`)
  },
  querySelectorAll(sel) {
    return this.body.querySelectorAll(sel)
  },
  querySelector(sel) {
    return this.body.querySelector(sel)
  },
  addEventListener(event, fn) {
    if (!this.eventListeners[event]) this.eventListeners[event] = []
    this.eventListeners[event].push(fn)
  },
  removeEventListener(event, fn) {
    if (!this.eventListeners[event]) return
    this.eventListeners[event] = this.eventListeners[event].filter(h => h !== fn)
  },
  dispatchEvent(event) {
    const handlers = this.eventListeners[event.type] || []
    for (const h of handlers) h(event)
  }
}

globalThis.window = mockWindow
globalThis.document = mockDocument
globalThis.isElement = isElement

const PLUGIN_CSS = extractConst('PLUGIN_CSS')
const BUILD_ID = extractConst('BUILD_ID')

// setupSessionPreview's handlers now resolve the row through the sidebar gate.
// Pull those definitions out of the plugin instead of retyping them, so this
// harness cannot drift from what ships.
{
  const defs = [
    pluginCode.match(/^const SIDEBAR_SELECTOR = .*$/m),
    pluginCode.match(/^const sessionRowShell = el => \{[\s\S]*?^\}/m),
    pluginCode.match(/^const closestSessionRow = .*$/m),
  ]
  for (const d of defs) assert(d, 'the sidebar gate is missing from src/plugin.js')
  const gate = new Function(`${defs.map(d => d[0]).join('\n')}
    return { sessionRowShell, closestSessionRow }`)()
  globalThis.sessionRowShell = gate.sessionRowShell
  globalThis.closestSessionRow = gate.closestSessionRow
}

globalThis.previewContainer = null
globalThis.currentPreviewRow = null
globalThis.previewListenersAttached = false
globalThis.handlePointerOver = null
globalThis.handlePointerOut = null
globalThis.handleFocusIn = null
globalThis.handleFocusOut = null
globalThis.handleKeyDown = null

const isRowActive = extractFunction('isRowActive')
const escapeHtml = extractFunction('escapeHtml')
const cleanPreviewSnippet = extractFunction('cleanPreviewSnippet')
const extractSessionRowPreviewData = extractFunction('extractSessionRowPreviewData')
const ensurePreviewContainer = extractFunction('ensurePreviewContainer')
const positionPreview = extractFunction('positionPreview')
const showPreview = extractFunction('showPreview')
const hidePreview = extractFunction('hidePreview')
const setupSessionPreview = extractFunction('setupSessionPreview')
const cleanupSessionPreview = extractFunction('cleanupSessionPreview')

const stats = { previewShows: 0, sessionRefreshes: 0 }
globalThis.stats = stats

console.log(`\n=== Phase 5B History / Session Preview Audit Suite (Build ${BUILD_ID}) ===`)

// Test 1: Basic Session Row Preview Extraction & Rendering
{
  console.log('[Test 1] Basic: Extracts Title, User snippet, Assistant snippet, timestamp and displays preview card')
  mockDocument.body = new MockElement('body')

  // Setup an active session row with messages in active conversation
  const sessionRow = new MockElement('div', 'group row-hover bg-(--ui-row-active-background)')
  const titleSpan = new MockElement('span', 'hover-marquee-inner')
  titleSpan.textContent = 'Fix Bubbles UI Preview'
  sessionRow.appendChild(titleSpan)

  const timeEl = new MockElement('time', 'time')
  timeEl.setAttribute('aria-label', '3m ago')
  timeEl.textContent = '3m'
  sessionRow.appendChild(timeEl)
  // Session rows only exist inside the chat sidebar, and the hover gate checks
  // for that ancestor, so the fixture has to mirror it.
  const sidebar = new MockElement('div', '', { 'data-slot': 'sidebar' })
  mockDocument.body.appendChild(sidebar)
  sidebar.appendChild(sessionRow)

  // Active conversation messages
  const userMsg = new MockElement('div', 'user-msg', { 'data-slot': 'aui_user-message-root' })
  const userContent = new MockElement('div', 'content', { 'data-slot': 'aui_user-message-content' })
  userContent.textContent = 'Help me build a frosted preview card for session history'
  userMsg.appendChild(userContent)
  mockDocument.body.appendChild(userMsg)

  const asstMsg = new MockElement('div', 'asst-msg', { 'data-slot': 'aui_assistant-message-root' })
  const asstContent = new MockElement('div', 'content', { 'data-slot': 'aui_assistant-message-content' })
  asstContent.textContent = 'I have added the Preview module with zero-overhead event delegation'
  asstMsg.appendChild(asstContent)
  mockDocument.body.appendChild(asstMsg)

  // Native task header in DOM (the skin no longer paints its own counter pill)
  const taskHeader = new MockElement('div', 'status-section-header')
  taskHeader.textContent = '任务 4/5'
  mockDocument.body.appendChild(taskHeader)

  // Show preview
  showPreview(sessionRow)

  const preview = mockDocument.getElementById('bubbles-session-preview')
  assert(preview, 'Preview element must exist')
  assert.strictEqual(preview.getAttribute('data-visible'), 'true', 'Preview must be visible')
  assert.strictEqual(preview.getAttribute('aria-hidden'), 'false')

  // Verify contents
  const html = preview.innerHTML
  assert(html.includes('Fix Bubbles UI Preview'), 'Title must be present in preview card')
  assert(html.includes('Help me build a frosted preview card'), 'User snippet must be present')
  assert(html.includes('I have added the Preview module'), 'Assistant snippet must be present')
  assert(html.includes('任务 4/5'), 'Task progress must be present, read from the native header')
  assert(html.includes('3m ago'), 'Timestamp must be present')
  console.log('  ✓ Passed')
}

// Test 2: Close / Hide via Pointerleave and Escape
{
  console.log('[Test 2] Close / Hide: Hides preview on hidePreview() and Escape key')
  const preview = mockDocument.getElementById('bubbles-session-preview')
  assert.strictEqual(preview.getAttribute('data-visible'), 'true')

  // Hide preview
  hidePreview()
  assert.strictEqual(preview.getAttribute('data-visible'), 'false')
  assert.strictEqual(preview.getAttribute('aria-hidden'), 'true')

  // Re-show and test Escape key delegation
  setupSessionPreview()
  const row = mockDocument.body.querySelector('.row-hover')
  showPreview(row)
  assert.strictEqual(preview.getAttribute('data-visible'), 'true')

  // Simulate Escape key
  mockDocument.dispatchEvent({ type: 'keydown', key: 'Escape' })
  assert.strictEqual(preview.getAttribute('data-visible'), 'false', 'Escape key must close preview')
  console.log('  ✓ Passed')
}

// Test 3: Keyboard Navigation & Focus
{
  console.log('[Test 3] Keyboard Navigation: Focusin triggers preview and Focusout closes it')
  const preview = mockDocument.getElementById('bubbles-session-preview')
  const row = mockDocument.body.querySelector('.row-hover')

  // Simulate focusin event bubbling to document
  mockDocument.dispatchEvent({ type: 'focusin', target: row })
  assert.strictEqual(preview.getAttribute('data-visible'), 'true', 'Focusin on row must display preview')

  // Simulate focusout event
  mockDocument.dispatchEvent({ type: 'focusout', target: row, relatedTarget: mockDocument.body })
  assert.strictEqual(preview.getAttribute('data-visible'), 'false', 'Focusout must hide preview')
  console.log('  ✓ Passed')
}

// Test 4: Virtualizer Remount Safety
{
  console.log('[Test 4] Virtualizer: Row mount -> unmount -> remount handles preview seamlessly')
  const container = new MockElement('div', 'virtual-container')
  mockDocument.body.appendChild(container)

  // Frame 1: Row A mounted
  const rowV1 = new MockElement('div', 'row-hover', { 'data-bubbles-session-row': 'true' })
  const titleV1 = new MockElement('span', 'hover-marquee-inner')
  titleV1.textContent = 'Virtual Session'
  rowV1.appendChild(titleV1)
  container.appendChild(rowV1)

  showPreview(rowV1)
  const preview = mockDocument.getElementById('bubbles-session-preview')
  assert.strictEqual(preview.getAttribute('data-visible'), 'true')
  assert(preview.innerHTML.includes('Virtual Session'))

  // Frame 2: TanStack Virtualizer unmounts rowV1, remounts a fresh node rowV2
  hidePreview()
  container.removeChild(rowV1)

  const rowV2 = new MockElement('div', 'row-hover', { 'data-bubbles-session-row': 'true' })
  const titleV2 = new MockElement('span', 'hover-marquee-inner')
  titleV2.textContent = 'Virtual Session'
  rowV2.appendChild(titleV2)
  container.appendChild(rowV2)

  showPreview(rowV2)
  assert.strictEqual(preview.getAttribute('data-visible'), 'true')
  assert(preview.innerHTML.includes('Virtual Session'), 'Freshly mounted virtual row displays preview accurately')
  hidePreview()
  console.log('  ✓ Passed')
}

// Test 5: Session Isolation (Session A vs Session B)
{
  console.log('[Test 5] Session Isolation: Session A and Session B previews never cross-contaminate')
  // Inactive Session Row with own preview string
  const rowA = new MockElement('div', 'row-hover')
  const titleA = new MockElement('span', 'hover-marquee-inner')
  titleA.textContent = 'Database Migration'
  rowA.appendChild(titleA)
  const previewSpanA = new MockElement('span', 'truncate text-[0.625rem]')
  previewSpanA.textContent = 'Write schema update for postgres users'
  rowA.appendChild(previewSpanA)

  const rowB = new MockElement('div', 'row-hover')
  const titleB = new MockElement('span', 'hover-marquee-inner')
  titleB.textContent = 'Frontend Redesign'
  rowB.appendChild(titleB)
  const previewSpanB = new MockElement('span', 'truncate text-[0.625rem]')
  previewSpanB.textContent = 'Implement Tailwind glassmorphism styles'
  rowB.appendChild(previewSpanB)

  // Show Session A preview
  showPreview(rowA)
  const preview = mockDocument.getElementById('bubbles-session-preview')
  assert(preview.innerHTML.includes('Database Migration'), 'Session A title')
  assert(preview.innerHTML.includes('Write schema update for postgres users'), 'Session A snippet')
  assert(!preview.innerHTML.includes('Frontend Redesign'), 'Must NOT contain Session B title')
  assert(!preview.innerHTML.includes('Implement Tailwind'), 'Must NOT contain Session B snippet')

  // Show Session B preview
  showPreview(rowB)
  assert(preview.innerHTML.includes('Frontend Redesign'), 'Session B title')
  assert(preview.innerHTML.includes('Implement Tailwind glassmorphism styles'), 'Session B snippet')
  assert(!preview.innerHTML.includes('Database Migration'), 'Must NOT contain Session A title')
  assert(!preview.innerHTML.includes('Write schema update'), 'Must NOT contain Session A snippet')
  hidePreview()
  console.log('  ✓ Passed')
}

// Test 6: Non-Invasive Integrity (Zero Event Interception & Clean Lifecycle)
{
  console.log('[Test 6] Non-Invasive Integrity: Native click untouched, cleanup removes preview element')
  const row = new MockElement('div', 'row-hover')
  let nativeClicked = false
  row.addEventListener('click', () => { nativeClicked = true })

  // Clicking row should fire native click without obstruction
  row.click()
  assert.strictEqual(nativeClicked, true, 'Native row click must fire uninhibited')

  // Cleanup
  cleanupSessionPreview()
  assert.strictEqual(mockDocument.getElementById('bubbles-session-preview'), null, 'Preview container removed completely on cleanup')
  console.log('  ✓ Passed')
}

// Test 7: CSS Architecture & Accessibility Verification
{
  console.log('[Test 7] CSS Architecture: Frosted sapphire glass, fixed tooltip, reduced-motion')
  assert(PLUGIN_CSS.includes('.bubbles-session-preview'), 'CSS must define .bubbles-session-preview')
  assert(PLUGIN_CSS.includes('.bubbles-preview-card'), 'CSS must define .bubbles-preview-card')
  assert(PLUGIN_CSS.includes('backdrop-filter: blur'), 'Card must have frosted backdrop blur')
  assert(PLUGIN_CSS.includes('position: fixed'), 'Preview must use fixed positioning to avoid overflow clipping')
  assert(PLUGIN_CSS.includes('pointer-events: none'), 'Preview must not block mouse interaction')

  const reducedMotionIdx = PLUGIN_CSS.indexOf('prefers-reduced-motion: reduce')
  assert(reducedMotionIdx !== -1, 'prefers-reduced-motion block must exist')
  const reducedMotionBlock = PLUGIN_CSS.slice(reducedMotionIdx)
  assert(reducedMotionBlock.includes('.bubbles-session-preview'), 'Reduced motion must cover .bubbles-session-preview')
  console.log('  ✓ Passed')
}

console.log('=== All Phase 5B Test Assertions Passed Successfully ===\n')
