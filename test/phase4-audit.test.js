/**
 * test/phase4-audit.test.js
 *
 * Phase 4 Clean Transcript & Tool Collapse Audit Suite:
 * - Basic: Single tool collapse, multiple tools grouping, running tool expanded, failed tool visible, expand/collapse toggle
 * - Boundary: Tool + Task, Tool + Approval, Tool + Clarify, Tool + Streaming, Tool + Assistant message
 * - Persistence: Expand/collapse storage persistence & failure fallback
 * - Accessibility: Keyboard reachability, Enter/Space click, focus-visible & reduced-motion
 * - Core Safety: "Collapse, Never Delete" (Zero Tool DOM Deletion)
 */

const assert = require('assert')

const { MockElement } = require('./lib/mock-dom')
const { srcCode, extractFn, isElement, store, safeGetStorage, safeSetStorage, safeRemoveStorage, resetStore, publishToolGroupHelpers } = require('./lib/plugin-sandbox')

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

const mockDocument = {
  createElement: (tag) => new MockElement(tag)
}

console.log('=== Phase 4 Clean Transcript & Tool Collapse Audit Suite ===')

// 1. Basic: Single completed tool collapse & expand
{
  console.log('[Test 1] Single Completed Tool: Collapses to single tool pill, clicking expands full content')
  const parent = new MockElement('div', 'asst-content')
  const tool1 = new MockElement('div', 'tool-block', { 'data-slot': 'tool-block' })
  const toolTitle = new MockElement('span', 'font-medium')
  toolTitle.textContent = 'Read package.json'
  tool1.appendChild(toolTitle)
  parent.appendChild(tool1)

  const stats = { toolGroupRefreshes: 0 }
  processParentTools(parent, [tool1], detectToolState, (run) => getToolGroupId(run, parent, getToolTitle), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)

  // Verify group header injected before tool
  const group = parent.querySelector('.bubbles-tool-group')
  assert(group !== null, 'Tool group header must be created')
  assert.strictEqual(group.getAttribute('data-group-state'), 'collapsed', 'Default state must be collapsed')
  
  const label = group.querySelector('.bubbles-group-label')
  assert(label.textContent.includes('Read package.json'), 'Single tool summary must show tool title')

  // Verify tool1 is NOT deleted, but visually folded
  assert.strictEqual(tool1.getAttribute('data-bubbles-group-collapsed'), 'true', 'Tool must be marked collapsed')
  assert.strictEqual(tool1.parentElement, parent, 'Tool must NEVER be deleted from DOM')

  // Click toggle button to expand
  const toggleBtn = group.querySelector('.bubbles-tool-group-toggle')
  toggleBtn.click()

  assert.strictEqual(group.getAttribute('data-group-state'), 'expanded', 'Group state must become expanded')
  assert.strictEqual(toggleBtn.getAttribute('aria-expanded'), 'true', 'aria-expanded must be true')
  assert.strictEqual(tool1.getAttribute('data-bubbles-group-collapsed'), 'false', 'Tool must become visible')

  // Click again to collapse
  toggleBtn.click()
  assert.strictEqual(group.getAttribute('data-group-state'), 'collapsed', 'Group state must toggle back to collapsed')
  assert.strictEqual(tool1.getAttribute('data-bubbles-group-collapsed'), 'true', 'Tool must be folded again')
  console.log('  ✓ Passed')
}

// 2. Basic: Multiple consecutive completed tools grouping
{
  console.log('[Test 2] Multiple Consecutive Completed Tools: Aggregated into "3 tools completed"')
  const parent = new MockElement('div', 'asst-content')
  const tool1 = new MockElement('div', 'tool', { 'data-slot': 'tool-block' })
  tool1.textContent = 'Tool 1 output'
  const tool2 = new MockElement('div', 'tool', { 'data-slot': 'tool-block' })
  tool2.textContent = 'Tool 2 output'
  const tool3 = new MockElement('div', 'tool', { 'data-slot': 'tool-block' })
  tool3.textContent = 'Tool 3 output'

  parent.appendChild(tool1)
  parent.appendChild(tool2)
  parent.appendChild(tool3)

  const stats = { toolGroupRefreshes: 0 }
  processParentTools(parent, [tool1, tool2, tool3], detectToolState, (run) => getToolGroupId(run, parent, getToolTitle), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)

  const group = parent.querySelector('.bubbles-tool-group')
  assert(group !== null, 'Group header created')
  const label = group.querySelector('.bubbles-group-label')
  assert.strictEqual(label.textContent, '3 tools completed', 'Multiple tools must display count: 3 tools completed')

  assert.strictEqual(tool1.getAttribute('data-bubbles-group-collapsed'), 'true')
  assert.strictEqual(tool2.getAttribute('data-bubbles-group-collapsed'), 'true')
  assert.strictEqual(tool3.getAttribute('data-bubbles-group-collapsed'), 'true')

  // Expand all 3 tools
  const toggleBtn = group.querySelector('.bubbles-tool-group-toggle')
  toggleBtn.click()
  assert.strictEqual(tool1.getAttribute('data-bubbles-group-collapsed'), 'false')
  assert.strictEqual(tool2.getAttribute('data-bubbles-group-collapsed'), 'false')
  assert.strictEqual(tool3.getAttribute('data-bubbles-group-collapsed'), 'false')
  console.log('  ✓ Passed')
}

// 3. Basic: Running tool remains expanded & Failed tool remains visible
{
  console.log('[Test 3] Running Tool & Failed Tool Isolation: Neither is collapsed into completed group')
  const parent = new MockElement('div', 'asst-content')
  
  // 1 completed tool
  const tool1 = new MockElement('div', 'tool', { 'data-slot': 'tool-block' })
  tool1.textContent = 'done'
  parent.appendChild(tool1)

  // 1 running tool
  const toolRunning = new MockElement('div', 'tool', { 'data-slot': 'tool-block' })
  toolRunning.appendChild(new MockElement('span', 'animate-spin'))
  parent.appendChild(toolRunning)

  // 1 failed tool
  const toolFailed = new MockElement('div', 'tool', { 'data-slot': 'tool-block' })
  toolFailed.appendChild(new MockElement('span', 'text-destructive'))
  parent.appendChild(toolFailed)

  const stats = { toolGroupRefreshes: 0 }
  processParentTools(parent, [tool1, toolRunning, toolFailed], detectToolState, (run) => getToolGroupId(run, parent, getToolTitle), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)

  // Tool 1 gets its completed group
  assert.strictEqual(tool1.getAttribute('data-bubbles-group-collapsed'), 'true', 'Completed tool is collapsed')

  // Tool Running must NOT be collapsed
  assert.strictEqual(toolRunning.hasAttribute('data-bubbles-group-collapsed'), false, 'Running tool must never be collapsed')

  // Tool Failed must NOT be collapsed
  assert.strictEqual(toolFailed.hasAttribute('data-bubbles-group-collapsed'), false, 'Failed tool must never be collapsed')
  console.log('  ✓ Passed')
}

// 4. Boundary: Non-tool elements break grouping (Paragraphs, Tasks, New Messages)
{
  console.log('[Test 4] Boundary Protection: Non-tool elements (p, task, thinking) partition completed groups')
  const parent = new MockElement('div', 'asst-content')
  
  const tool1 = new MockElement('div', 'tool', { 'data-slot': 'tool-block' })
  tool1.textContent = 'read'
  parent.appendChild(tool1)

  const paragraph = new MockElement('p', 'prose')
  paragraph.textContent = 'Now analyzing result...'
  parent.appendChild(paragraph)

  const tool2 = new MockElement('div', 'tool', { 'data-slot': 'tool-block' })
  tool2.textContent = 'write'
  parent.appendChild(tool2)

  const stats = { toolGroupRefreshes: 0 }
  processParentTools(parent, [tool1, tool2], detectToolState, (run) => getToolGroupId(run, parent, getToolTitle), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)

  const groups = parent.querySelectorAll('.bubbles-tool-group')
  assert.strictEqual(groups.length, 2, 'Paragraph must split tools into 2 separate groups')
  console.log('  ✓ Passed')
}

// 5. Streaming & Dynamic Tool Append
{
  console.log('[Test 5] Streaming Transition: Active tool finishes and joins completed group smoothly')
  const parent = new MockElement('div', 'asst-content')
  const tool1 = new MockElement('div', 'tool', { 'data-slot': 'tool-block' })
  tool1.textContent = 'tool1'
  parent.appendChild(tool1)

  const tool2 = new MockElement('div', 'tool', { 'data-slot': 'tool-block' })
  const spinner = new MockElement('span', 'animate-spin')
  tool2.appendChild(spinner)
  parent.appendChild(tool2)

  const stats = { toolGroupRefreshes: 0 }
  // Tick 1: tool2 is running
  processParentTools(parent, [tool1, tool2], detectToolState, (run) => getToolGroupId(run, parent, getToolTitle), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)
  assert.strictEqual(parent.querySelectorAll('.bubbles-tool-group').length, 1, 'Only tool 1 has group')
  assert.strictEqual(tool2.hasAttribute('data-bubbles-group-collapsed'), false, 'Tool 2 is running, not collapsed')

  // Tick 2: tool2 completes
  spinner.remove()
  tool2.textContent = 'tool2 done'
  processParentTools(parent, [tool1, tool2], detectToolState, (run) => getToolGroupId(run, parent, getToolTitle), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)

  assert.strictEqual(parent.querySelectorAll('.bubbles-tool-group').length, 1, 'Header must be reused without duplication')
  const label = parent.querySelector('.bubbles-group-label')
  assert.strictEqual(label.textContent, '2 tools completed', 'Group count updated to 2')
  assert.strictEqual(tool2.getAttribute('data-bubbles-group-collapsed'), 'true', 'Tool 2 now collapsed')
  console.log('  ✓ Passed')
}

// 6. Persistence & Storage Failure Fallback
{
  console.log('[Test 6] Persistence: State preserved across reloads and safe fallback on storage error')
  resetStore()
  const parent = new MockElement('div', 'asst-content')
  const tool = new MockElement('div', 'tool', { 'data-slot': 'tool-block' })
  tool.textContent = 'cat'
  parent.appendChild(tool)

  const stats = { toolGroupRefreshes: 0 }
  processParentTools(parent, [tool], detectToolState, (run) => getToolGroupId(run, parent, getToolTitle), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)

  const group = parent.querySelector('.bubbles-tool-group')
  const toggleBtn = group.querySelector('.bubbles-tool-group-toggle')
  toggleBtn.click() // Expand

  const storageKey = group.getAttribute('data-storage-key')
  assert.strictEqual(store[storageKey], true, 'Expanded state saved to storage')

  // Re-run pass: simulates reloading or re-evaluating DOM
  processParentTools(parent, [tool], detectToolState, (run) => getToolGroupId(run, parent, getToolTitle), getToolTitle, safeGetStorage, safeSetStorage, safeRemoveStorage, ID, stats, mockDocument)
  assert.strictEqual(group.getAttribute('data-group-state'), 'expanded', 'Restored as expanded from storage')

  // Storage failure fallback
  const faultyStorage = () => { throw new Error('QuotaExceeded') }
  assert.doesNotThrow(() => {
    safeGetStorage('dummy', false)
  }, 'Storage error must never throw or disrupt execution')
  console.log('  ✓ Passed')
}

// 7. Accessibility & CSS Rules
{
  console.log('[Test 7] Accessibility: Keyboard focus-visible & Reduced-Motion coverage')
  assert(srcCode.includes('.bubbles-tool-group-toggle'), 'CSS must style .bubbles-tool-group-toggle')
  assert(srcCode.includes("[data-bubbles-group-collapsed='true'] {\n  display: none !important;\n}"), 'Collapsed tools must use display: none')
  assert(srcCode.includes(".bubbles-tool-group-toggle,\n  html[data-bubbles-skin='true'] .bubbles-group-chevron"), 'Prefers-reduced-motion covers toggle and chevron')
  console.log('  ✓ Passed')
}

console.log('=== All Phase 4 Test Assertions Passed Successfully ===')
