/**
 * test/phase5a-1-audit.test.js
 *
 * Phase 5A.1 Session Switching Integration Audit:
 * 1. Session A: Conversation, Task, Tool Collapse ("3 tools completed"), Approval, Clarify.
 * 2. Switch to Session B: Complete state isolation, zero DOM residue, Tool group collapse not inherited.
 * 3. Return to Session A: Full restoration of Conversation, Task, and Tool collapse state without duplicate headers.
 * 4. Virtualizer: Row mount -> unmount -> remount safety without relying on stale DOM nodes.
 * 5. Approval & Clarify Isolation: Verification across session switching boundary.
 * 6. Queue Regression: Zero queue intrusion, native Hermes lifecycle preserved.
 */

const assert = require('assert')

const { MockElement } = require('./lib/mock-dom')
const { srcCode: pluginCode, extractFunctionText, isElement, publishToolGroupHelpers } = require('./lib/plugin-sandbox')

/* The shipped processParentTools is assembled from named helpers. They are
   published globally so the extracted body can reach them by name. */
publishToolGroupHelpers()

/* The eval stays in this file: an extracted function closes over the scope it is
   evaluated in, and the shipped helpers reach for names declared right here. */
const extractFunction = name => eval(`(${extractFunctionText(name)})`)

/* Simulated storage — deliberately NOT the lib's shim. This suite's version tests
   presence with hasOwnProperty, so an inherited key (`toString`, `constructor`) misses,
   while the `in` version the other phase suites run would find it. Unifying the two
   would change which lookups hit, i.e. what is being measured. */
let mockStorage = {}
function safeGetStorage(key, fallback) {
  return Object.prototype.hasOwnProperty.call(mockStorage, key) ? mockStorage[key] : fallback
}
function safeSetStorage(key, val) {
  mockStorage[key] = val
}
function safeRemoveStorage(key) {
  delete mockStorage[key]
}

// Mock DOM environment
const mockDocument = {
  activeElement: null,
  body: new MockElement('body'),
  createElement(tag) {
    return new MockElement(tag)
  },
  querySelectorAll(sel) {
    return this.body.querySelectorAll(sel)
  },
  querySelector(sel) {
    return this.body.querySelector(sel)
  }
}

globalThis.document = mockDocument
globalThis.isElement = isElement
globalThis.safeGetStorage = safeGetStorage
globalThis.safeSetStorage = safeSetStorage
globalThis.safeRemoveStorage = safeRemoveStorage

const detectToolState = extractFunction('detectToolState')
const getToolAnchorId = extractFunction('getToolAnchorId')
const getToolTitle = extractFunction('getToolTitle')
/* D3 gave the shipped helpers free names the sandbox must supply: the storage
   namespaces (a caller now passes a complete key) and getToolTitle, which
   getToolAnchorId derives its deterministic anchor from. Values are pinned against
   src/plugin.js by test/tool-group-id-stability.test.js. */
globalThis.USER_EXPAND_NS = 'hermes-bubbles-skin:user-expand:'
globalThis.TOOL_GROUP_NS = 'hermes-bubbles-skin:tool-group:'
globalThis.getToolTitle = getToolTitle
const getToolGroupId = extractFunction('getToolGroupId')
const processParentTools = extractFunction('processParentTools')
const groupCompletedTools = extractFunction('groupCompletedTools')
const enhanceTaskSection = extractFunction('enhanceTaskSection')
const updateTaskState = extractFunction('updateTaskState')
const detectTaskState = extractFunction('detectTaskState')
const updateTaskHeaderCounter = extractFunction('updateTaskHeaderCounter')
// enhanceTaskSection now keeps the running row in view; the extracted function
// closes over this module's scope, so the test needs the same binding plugin.js
// keeps at module level.
let lastScrolledTaskRow = null
const scrollToActiveTaskRow = extractFunction('scrollToActiveTaskRow')
const setupTaskScroll = extractFunction('setupTaskScroll')
const findTaskSection = extractFunction('findTaskSection')
const enhanceApproval = extractFunction('enhanceApproval')
const enhanceClarify = extractFunction('enhanceClarify')
const enhanceSidebarSessionRow = extractFunction('enhanceSidebarSessionRow')
const isRowActive = extractFunction('isRowActive')

const stats = {
  toolGroupRefreshes: 0,
  taskRefreshes: 0,
  approvalRefreshes: 0,
  clarifyRefreshes: 0,
  sessionRefreshes: 0
}
globalThis.stats = stats
globalThis.ID = 'hermes-bubbles-skin'

console.log('\n=== Phase 5A.1 Session Switching Integration Audit Suite ===')

// Test 1 & 2 & 3: Full Session Switching Lifecycle (Session A -> Session B -> Session A)
{
  console.log('[Test 1] Session A Setup: Conversation, Task, Tool Collapse, Approval & Clarify')
  mockStorage = {}
  mockDocument.body = new MockElement('body')

  // Setup sidebar with Session A and Session B rows
  const sidebar = new MockElement('div', 'sidebar', { 'data-slot': 'sidebar' })
  const rowA = new MockElement('div', 'group row-hover bg-(--ui-row-active-background)', { 'data-session-id': 'sess_a' })
  const rowB = new MockElement('div', 'group row-hover', { 'data-session-id': 'sess_b' })
  sidebar.appendChild(rowA)
  sidebar.appendChild(rowB)
  mockDocument.body.appendChild(sidebar)

  enhanceSidebarSessionRow(rowA)
  enhanceSidebarSessionRow(rowB)
  assert.strictEqual(rowA.getAttribute('data-bubbles-session-active'), 'true', 'Session A initially active')
  assert.strictEqual(rowB.getAttribute('data-bubbles-session-active'), 'false', 'Session B initially inactive')

  // Setup Session A Thread
  const threadContainer = new MockElement('div', 'thread-container')
  mockDocument.body.appendChild(threadContainer)

  const sessionADom = new MockElement('div', 'session-a-view', { 'data-session-id': 'sess_a' })
  threadContainer.appendChild(sessionADom)

  // Session A Messages
  const asstMsgA = new MockElement('div', 'asst-msg', { 'data-slot': 'aui_assistant-message-root', 'data-message-id': 'msg_a1' })
  const asstContentA = new MockElement('div', 'asst-content', { 'data-slot': 'aui_assistant-message-content' })
  asstMsgA.appendChild(asstContentA)
  sessionADom.appendChild(asstMsgA)

  // 3 Completed Tools in Session A
  const toolA1 = new MockElement('div', 'tool', { 'data-slot': 'tool-block', 'data-tool-call-id': 'call_a1' })
  toolA1.textContent = 'Read package.json'
  const toolA2 = new MockElement('div', 'tool', { 'data-slot': 'tool-block', 'data-tool-call-id': 'call_a2' })
  toolA2.textContent = 'List workspace files'
  const toolA3 = new MockElement('div', 'tool', { 'data-slot': 'tool-block', 'data-tool-call-id': 'call_a3' })
  toolA3.textContent = 'Check git status'

  asstContentA.appendChild(toolA1)
  asstContentA.appendChild(toolA2)
  asstContentA.appendChild(toolA3)

  // Task section in Session A (2 completed, 1 running -> "2 / 3")
  const statusStackA = new MockElement('div', 'status-stack', { 'data-slot': 'composer-status-stack' })
  const taskSectionA = new MockElement('div', 'status-section', { 'data-slot': 'status-section' })
  const taskHeaderA = new MockElement('div', 'status-section-header')
  const taskChecklistA = new MockElement('span', 'codicon-checklist')
  taskHeaderA.appendChild(taskChecklistA)
  const taskTriggerA = new MockElement('button', 'status-section-trigger')
  taskHeaderA.appendChild(taskTriggerA)
  taskSectionA.appendChild(taskHeaderA)

  const taskBodyA = new MockElement('div', 'status-section-body')
  const tRowA1 = new MockElement('div', 'status-row', { 'data-slot': 'status-row' })
  const iconWrap1 = new MockElement('div', 'status-row-icon')
  iconWrap1.appendChild(new MockElement('span', 'codicon-check'))
  tRowA1.appendChild(iconWrap1)

  const tRowA2 = new MockElement('div', 'status-row', { 'data-slot': 'status-row' })
  const iconWrap2 = new MockElement('div', 'status-row-icon')
  iconWrap2.appendChild(new MockElement('span', 'codicon-check'))
  tRowA2.appendChild(iconWrap2)

  const tRowA3 = new MockElement('div', 'status-row', { 'data-slot': 'status-row' })
  const iconWrap3 = new MockElement('div', 'status-row-icon')
  iconWrap3.appendChild(new MockElement('span', 'codicon-loading animate-spin'))
  tRowA3.appendChild(iconWrap3)

  taskBodyA.appendChild(tRowA1)
  taskBodyA.appendChild(tRowA2)
  taskBodyA.appendChild(tRowA3)
  taskSectionA.appendChild(taskBodyA)
  statusStackA.appendChild(taskSectionA)
  sessionADom.appendChild(statusStackA)

  // Approval in Session A
  const approvalA = new MockElement('div', 'approval', { 'data-slot': 'tool-approval-card' })
  sessionADom.appendChild(approvalA)

  // Clarify in Session A
  const clarifyA = new MockElement('div', 'clarify', { 'data-slot': 'clarify-inline' })
  sessionADom.appendChild(clarifyA)

  // Process DOM for Session A
  groupCompletedTools()
  enhanceTaskSection(statusStackA)
  enhanceApproval(approvalA)
  enhanceClarify(clarifyA)

  // Verify Session A initial state
  const headerA = asstContentA.querySelector('.bubbles-tool-group')
  assert(headerA, 'Session A must have a tool group header')
  assert.strictEqual(headerA.querySelector('.bubbles-group-label').textContent, '3 tools completed')
  assert.strictEqual(taskSectionA.querySelector('.bubbles-task-counter'), null, 'No duplicate counter pill')
  assert.strictEqual(approvalA.getAttribute('data-bubbles-approval'), 'true')
  assert.strictEqual(clarifyA.getAttribute('data-bubbles-clarify'), 'true')

  // User manually expands the tool group in Session A
  const toggleBtnA = headerA.querySelector('.bubbles-tool-group-toggle')
  toggleBtnA.click()
  assert.strictEqual(headerA.getAttribute('data-group-state'), 'expanded', 'Tool group in Session A is now expanded')
  assert.strictEqual(toolA1.getAttribute('data-bubbles-group-collapsed'), 'false')
  console.log('  ✓ Passed')

  // --------------------------------------------------------------------------
  console.log('[Test 2] Switch to Session B: Complete state isolation, zero residue')
  // User switches to Session B:
  // 1. Sidebar updates
  rowA.classList.remove('bg-(--ui-row-active-background)')
  rowB.classList.add('bg-(--ui-row-active-background)')
  enhanceSidebarSessionRow(rowA)
  enhanceSidebarSessionRow(rowB)
  assert.strictEqual(rowA.getAttribute('data-bubbles-session-active'), 'false')
  assert.strictEqual(rowB.getAttribute('data-bubbles-session-active'), 'true', 'Session B highlighted as active')

  // 2. Hermes unmounts Session A DOM and mounts Session B DOM
  threadContainer.removeChild(sessionADom)

  const sessionBDom = new MockElement('div', 'session-b-view', { 'data-session-id': 'sess_b' })
  threadContainer.appendChild(sessionBDom)

  // Session B Assistant Message
  const asstMsgB = new MockElement('div', 'asst-msg', { 'data-slot': 'aui_assistant-message-root', 'data-message-id': 'msg_b1' })
  const asstContentB = new MockElement('div', 'asst-content', { 'data-slot': 'aui_assistant-message-content' })
  asstMsgB.appendChild(asstContentB)
  sessionBDom.appendChild(asstMsgB)

  // 2 Completed Tools in Session B
  const toolB1 = new MockElement('div', 'tool', { 'data-slot': 'tool-block', 'data-tool-call-id': 'call_b1' })
  toolB1.textContent = 'Fetch API documentation'
  const toolB2 = new MockElement('div', 'tool', { 'data-slot': 'tool-block', 'data-tool-call-id': 'call_b2' })
  toolB2.textContent = 'Run linter'
  asstContentB.appendChild(toolB1)
  asstContentB.appendChild(toolB2)

  // Session B has NO Approval, NO Clarify, and NO Tasks
  // Re-run DOM processors
  groupCompletedTools()

  // Verify Session B state:
  // - Session A Conversation, Task, Approval, Clarify are nowhere in document
  assert.strictEqual(mockDocument.querySelector('[data-message-id="msg_a1"]'), null, 'Session A message unmounted')
  assert.strictEqual(mockDocument.querySelector('.bubbles-task-counter'), null, 'Session A task counter gone')
  assert.strictEqual(mockDocument.querySelector('[data-bubbles-approval]'), null, 'Session A approval gone')
  assert.strictEqual(mockDocument.querySelector('[data-bubbles-clarify]'), null, 'Session A clarify gone')

  // - Session B tool group was created
  const headerB = asstContentB.querySelector('.bubbles-tool-group')
  assert(headerB, 'Session B must have its own tool group header')
  assert.strictEqual(headerB.querySelector('.bubbles-group-label').textContent, '2 tools completed')

  // - Critical Isolation Check: Session B MUST NOT inherit Session A's expanded state!
  assert.strictEqual(headerB.getAttribute('data-group-state'), 'collapsed', 'Session B tool group must be default collapsed, NOT inherited from Session A')
  assert.strictEqual(toolB1.getAttribute('data-bubbles-group-collapsed'), 'true')
  assert.strictEqual(toolB2.getAttribute('data-bubbles-group-collapsed'), 'true')
  console.log('  ✓ Passed')

  // --------------------------------------------------------------------------
  console.log('[Test 3] Return to Session A: Full restoration without duplicate headers or stale residue')
  // User switches back to Session A:
  // 1. Sidebar updates
  rowB.classList.remove('bg-(--ui-row-active-background)')
  rowA.classList.add('bg-(--ui-row-active-background)')
  enhanceSidebarSessionRow(rowA)
  enhanceSidebarSessionRow(rowB)
  assert.strictEqual(rowA.getAttribute('data-bubbles-session-active'), 'true')
  assert.strictEqual(rowB.getAttribute('data-bubbles-session-active'), 'false')

  // 2. Hermes unmounts Session B and remounts Session A
  threadContainer.removeChild(sessionBDom)
  threadContainer.appendChild(sessionADom)

  // Re-run DOM processors
  groupCompletedTools()
  enhanceTaskSection(statusStackA)
  enhanceApproval(approvalA)
  enhanceClarify(clarifyA)

  // Verify Session A restoration
  // - Header count is exactly 1 (no duplicate headers)
  const headersInA = asstContentA.querySelectorAll('.bubbles-tool-group')
  assert.strictEqual(headersInA.length, 1, 'Exactly 1 tool group header in Session A after return')

  // - Restores expanded state from persistence!
  const restoredHeaderA = headersInA[0]
  assert.strictEqual(restoredHeaderA.getAttribute('data-group-state'), 'expanded', 'Session A tool group correctly restored its expanded state')
  assert.strictEqual(toolA1.getAttribute('data-bubbles-group-collapsed'), 'false')
  assert.strictEqual(toolA2.getAttribute('data-bubbles-group-collapsed'), 'false')
  assert.strictEqual(toolA3.getAttribute('data-bubbles-group-collapsed'), 'false')

  // - Task section restored without a duplicate counter pill
  assert.strictEqual(taskSectionA.querySelector('.bubbles-task-counter'), null, 'Task counter pill stays gone')

  // - Zero Session B residue
  assert.strictEqual(mockDocument.querySelector('[data-message-id="msg_b1"]'), null, 'Session B message not in DOM')
  console.log('  ✓ Passed')
}

// Test 4: Virtualizer Remount Safety
{
  console.log('[Test 4] Virtualizer: Row mount -> unmount -> remount safety without stale state dependency')
  const viewport = new MockElement('div', 'viewport')

  // Session Row mounted on initial view
  const rowNode1 = new MockElement('div', 'group row-hover bg-(--ui-row-active-background)', { 'data-session-id': 'sess_1' })
  viewport.appendChild(rowNode1)
  enhanceSidebarSessionRow(rowNode1)
  assert.strictEqual(rowNode1.getAttribute('data-bubbles-session-row'), 'true')
  assert.strictEqual(rowNode1.getAttribute('data-bubbles-session-active'), 'true')

  // TanStack Virtualizer unmounts rowNode1 when scrolled off-screen
  viewport.removeChild(rowNode1)

  // Scrolled back: TanStack mounts a completely FRESH DOM element for the same session
  const rowNode2 = new MockElement('div', 'group row-hover bg-(--ui-row-active-background)', { 'data-session-id': 'sess_1' })
  viewport.appendChild(rowNode2)

  // Verify fresh node has no attributes yet
  assert.strictEqual(rowNode2.hasAttribute('data-bubbles-session-row'), false)
  assert.strictEqual(rowNode2.hasAttribute('data-bubbles-session-active'), false)

  // Enhance freshly mounted node
  enhanceSidebarSessionRow(rowNode2)
  assert.strictEqual(rowNode2.getAttribute('data-bubbles-session-row'), 'true', 'Freshly mounted virtual row marked')
  assert.strictEqual(rowNode2.getAttribute('data-bubbles-session-active'), 'true', 'Freshly mounted virtual row active state recovered')
  console.log('  ✓ Passed')
}

// Test 5: Approval & Clarify Isolation across Session Boundaries
{
  console.log('[Test 5] Approval & Clarify Isolation: Verification across session switching boundary')
  const host = new MockElement('div', 'host')

  // Session 1 has Approval & Clarify
  const s1 = new MockElement('div', 's1')
  const app1 = new MockElement('div', 'approval', { 'data-slot': 'tool-approval-card' })
  const clar1 = new MockElement('div', 'clarify', { 'data-slot': 'clarify-inline' })
  s1.appendChild(app1)
  s1.appendChild(clar1)
  host.appendChild(s1)

  enhanceApproval(app1)
  enhanceClarify(clar1)
  assert.strictEqual(app1.getAttribute('data-bubbles-approval'), 'true')
  assert.strictEqual(clar1.getAttribute('data-bubbles-clarify'), 'true')

  // Switch to Session 2 (Clean session, no approvals or clarifies)
  host.removeChild(s1)
  const s2 = new MockElement('div', 's2')
  host.appendChild(s2)

  // Verify no approvals or clarifies present
  assert.strictEqual(host.querySelector('[data-slot="tool-approval-card"]'), null)
  assert.strictEqual(host.querySelector('[data-slot="clarify-inline"]'), null)
  assert.strictEqual(host.querySelector('[data-bubbles-approval]'), null)
  assert.strictEqual(host.querySelector('[data-bubbles-clarify]'), null)

  // Switch back to Session 1
  host.removeChild(s2)
  host.appendChild(s1)

  enhanceApproval(app1)
  enhanceClarify(clar1)
  assert.strictEqual(app1.getAttribute('data-bubbles-approval'), 'true', 'Approval restored on Session 1')
  assert.strictEqual(clar1.getAttribute('data-bubbles-clarify'), 'true', 'Clarify restored on Session 1')
  console.log('  ✓ Passed')
}

// Test 6: Queue Regression Guard
{
  console.log('[Test 6] Queue Regression Guard: Zero queue modification or hijacking')
  assert(!pluginCode.includes('queueManager'), 'Plugin must not declare a queueManager')
  assert(!pluginCode.includes('manageQueue'), 'Plugin must not implement queue management')
  assert(!pluginCode.includes('interceptQueue'), 'Plugin must not intercept queue actions')
  assert(!pluginCode.includes('customQueue'), 'Plugin must not create a custom queue')
  console.log('  ✓ Passed')
}

console.log('=== All Phase 5A.1 Test Assertions Passed Successfully ===\n')
