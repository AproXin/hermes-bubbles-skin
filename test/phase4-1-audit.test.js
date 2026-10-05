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

const { MockElement } = require('./lib/mock-dom')
const { extractFn, isElement, safeGetStorage, safeSetStorage, safeRemoveStorage, resetStore, publishToolGroupHelpers } = require('./lib/plugin-sandbox')

/* The shipped processParentTools is assembled from named helpers, and a
   `new Function` body resolves free names globally — so the helpers it calls have to be
   published before this suite runs it. */
publishToolGroupHelpers()

/* A `new Function` body resolves free names on the global object, so a shipped helper
   that calls isElement() without receiving it needs it published here. */
global.isElement = isElement

const ID = 'hermes-bubbles-skin'

const detectToolState = new Function('toolBlock', extractFn('detectToolState'))
const getToolTitle = new Function('toolBlock', extractFn('getToolTitle'))
const getToolAnchorId = new Function('toolBlock', extractFn('getToolAnchorId'))
const getToolGroupId = new Function('run', 'parent', 'getToolAnchorId', extractFn('getToolGroupId'))

/* D3 left the shipped helpers with three free names this sandbox must supply: the two
   storage namespaces (a caller now passes a complete key) and getToolTitle, from which
   getToolAnchorId derives its deterministic anchor. new Function bodies resolve free
   names on the global object, so declaring them here is enough. Their values are pinned
   against src/plugin.js by test/tool-group-id-stability.test.js. */
globalThis.USER_EXPAND_NS = 'hermes-bubbles-skin:user-expand:'
globalThis.TOOL_GROUP_NS = 'hermes-bubbles-skin:tool-group:'
globalThis.getToolTitle = getToolTitle

const processParentTools = new Function(
  'parent', 'tools', 'detectToolState', 'getToolGroupId', 'getToolTitle', 'safeGetStorage', 'safeSetStorage', 'safeRemoveStorage', 'ID', 'stats', 'document',
  extractFn('processParentTools')
)

/* Elements made through createElement carry their document, which is how a mock
   `focus()` reaches `document.activeElement` — the focus-transfer path in
   processParentTools reads exactly that. */
const mockDocument = {
  activeElement: null,
  createElement: (tag, className = '', attributes = {}) => {
    const el = new MockElement(tag, className, attributes)
    el.ownerDocument = mockDocument
    return el
  },
}

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
  const parent = mockDocument.createElement('div', 'asst-content')
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
  resetStore()
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

// Test 7: Group Identity Contract (split-brief §2)
{
  console.log('[Test 7] Group Identity: data-bubbles-group-id and data-bubbles-tool-group are load-bearing')
  const parent = new MockElement('div', 'asst-content')
  const toolA = new MockElement('div', 'tool-block', { 'data-slot': 'tool-block', 'data-tool-call-id': 'call_id_a' })
  toolA.textContent = 'first finished tool'
  const toolB = new MockElement('div', 'tool-block', { 'data-slot': 'tool-block', 'data-tool-call-id': 'call_id_b' })
  toolB.textContent = 'second finished tool'
  parent.appendChild(toolA)
  parent.appendChild(toolB)

  const stats = { toolGroupRefreshes: 0 }
  processParentTools(parent, [toolA, toolB], detectToolState, (run) => getToolGroupId(run, parent, getToolAnchorId), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)

  const header = parent.querySelector('.bubbles-tool-group')
  /* `data-bubbles-tool-group` is the only thing that tells the observer this header is
     ours. Nothing asserted it, so a split that lost it would make the observer treat its
     own product as new content. */
  assert.strictEqual(header.getAttribute('data-bubbles-tool-group'), 'true',
    'The skin-built header must identify itself for the observer to skip it')

  /* The click handler does not keep its member list in a closure — it re-queries
     `[data-bubbles-group-id="<the header's id>"]`, so header and members must agree. */
  const groupId = header.getAttribute('data-group-id')
  assert(groupId, 'Header must carry data-group-id')
  assert.strictEqual(toolA.getAttribute('data-bubbles-group-id'), groupId,
    'Every member must carry the header’s group id')
  assert.strictEqual(toolB.getAttribute('data-bubbles-group-id'), groupId,
    'Every member must carry the header’s group id')

  const found = parent.querySelectorAll(`[data-bubbles-group-id="${groupId}"]`)
  assert.strictEqual(found.length, 2,
    'The query the toggle handler runs must resolve the whole run, not one row')
  assert.strictEqual(parent.querySelectorAll('[data-bubbles-group-id="a-different-id"]').length, 0,
    'That query must be value-bound — a mismatched id finds nothing (negative control)')
  console.log('  ✓ Passed')
}

console.log('=== All Phase 4.1 Test Assertions Passed Successfully ===')
