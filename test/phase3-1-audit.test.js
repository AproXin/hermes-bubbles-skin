/**
 * test/phase3-1-audit.test.js
 *
 * Phase 3.1 Six UI Surfaces Integration & Robustness Audit:
 * 1. Complete Agent Flow: Conversation -> Thinking -> Tool -> Task -> Approval -> Final Answer
 * 2. Task + Tool Coexistence & Zero Collision
 * 3. Task + Approval / Clarify Hierarchy & Non-Clipping Defenses
 * 4. Streaming Performance & Idempotent Processing
 * 5. Responsive Defenses: clamp(), overflow-wrap, table/code horizontal boundaries
 * 6. Accessibility: Keyboard focus-visible & Reduced-Motion verification
 */

const assert = require('assert')
const fs = require('fs')
const path = require('path')

class MockElement {
  constructor(tagName = 'div', className = '', attributes = {}) {
    this.tagName = tagName.toUpperCase()
    this.nodeType = 1
    this.className = className
    this.attributes = { ...attributes }
    this.children = []
    this.parentElement = null
    this.textContent = ''
    this.style = {
      getPropertyValue: (prop) => this.style[prop] || ''
    }
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
    child.parentElement = this
    this.children.push(child)
    return child
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
      if (part.startsWith('.') && this.className.includes(part.slice(1))) return true
      if (part.startsWith('[') && part.endsWith(']')) {
        const inner = part.slice(1, -1)
        if (inner.includes('=')) {
          const [k, v] = inner.split('=').map(s => s.replace(/['"]/g, ''))
          if (this.attributes[k] === v) return true
        } else if (this.hasAttribute(inner)) {
          return true
        }
      }
      if (this.tagName.toLowerCase() === part.toLowerCase()) return true
    }
    return false
  }

  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this)
      if (idx !== -1) this.parentElement.children.splice(idx, 1)
      this.parentElement = null
    }
  }
}

// Read functions from src/plugin.js
const srcCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'plugin.js'), 'utf8')

function extractFn(name) {
  const match = srcCode.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`))
  if (!match) throw new Error(`Function ${name} could not be extracted`)
  return match[1]
}

function isElement(node) { return Boolean(node && node.nodeType === 1) }
global.isElement = isElement

const enhanceUserMessage = new Function('userRoot', 'isElement', 'stats', 'setupLongMessageCollapse', extractFn('enhanceUserMessage'))
const enhanceAssistantMessage = new Function('assistantRoot', 'isElement', 'stats', extractFn('enhanceAssistantMessage'))
const enhanceThinkingBlock = new Function('thinkingEl', 'isElement', extractFn('enhanceThinkingBlock'))
const detectToolState = new Function('toolBlock', extractFn('detectToolState'))
const enhanceToolBlock = new Function('toolBlock', 'isElement', 'detectToolState', 'stats', extractFn('enhanceToolBlock'))
const detectTaskState = new Function('row', 'isElement', extractFn('detectTaskState'))
const updateTaskHeaderCounter = new Function('taskSection', 'completedCount', 'totalCount', extractFn('updateTaskHeaderCounter'))
const enhanceApproval = new Function('approvalEl', 'isElement', 'stats', extractFn('enhanceApproval'))
const enhanceClarify = new Function('clarifyEl', 'isElement', 'stats', extractFn('enhanceClarify'))

console.log('=== Phase 3.1 Six Surfaces Integration Audit ===')

// 1. Complete Agent Flow Verification
{
  console.log('[Test 1] Complete Flow: User -> Assistant -> Thinking -> Tool -> Task -> Approval -> Final Answer')
  const statsMock = { enhancedMessages: 0, toolRefreshes: 0, taskRefreshes: 0, approvalRefreshes: 0, clarifyRefreshes: 0 }

  // Step 1: User Message
  const userMsg = new MockElement('div', 'user-root', { 'data-slot': 'aui_user-message-root' })
  enhanceUserMessage(userMsg, isElement, statsMock, () => {})
  assert.strictEqual(userMsg.getAttribute('data-bubbles-user-message'), 'true', 'User message tagged')
  assert.strictEqual(userMsg.getAttribute('data-bubbles-role'), 'user', 'Role stamped')

  // Step 2: Assistant Message (Initial Thinking + Tool)
  const assistantMsg = new MockElement('div', 'asst-root', { 'data-slot': 'aui_assistant-message-root' })
  enhanceAssistantMessage(assistantMsg, isElement, statsMock)
  assert.strictEqual(assistantMsg.getAttribute('data-bubbles-assistant-message'), 'true', 'Assistant message tagged')

  // Step 3: Thinking Block
  const thinking = new MockElement('div', 'thinking', { 'data-slot': 'aui_thinking-disclosure' })
  enhanceThinkingBlock(thinking, isElement)
  assert.strictEqual(thinking.getAttribute('data-bubbles-thinking'), 'true', 'Thinking block tagged')

  // Step 4: Tool Block Running -> Completed
  const tool = new MockElement('div', 'tool', { 'data-slot': 'tool-block' })
  const toolSpinner = new MockElement('span', 'animate-spin')
  tool.appendChild(toolSpinner)
  enhanceToolBlock(tool, isElement, detectToolState, statsMock)
  assert.strictEqual(tool.getAttribute('data-bubbles-tool-state'), 'running', 'Active tool detected as running')

  toolSpinner.remove()
  tool.textContent = 'Execution success'
  enhanceToolBlock(tool, isElement, detectToolState, statsMock)
  assert.strictEqual(tool.getAttribute('data-bubbles-tool-state'), 'completed', 'Finished tool detected as completed')

  // Step 5: Task Running
  const taskRow = new MockElement('div', 'status-row', { 'data-slot': 'status-row' })
  const taskIcon = new MockElement('div', 'status-row-icon')
  taskIcon.textContent = '⠋' // braille spinner
  taskRow.appendChild(taskIcon)
  const taskState = detectTaskState(taskRow, isElement)
  assert.strictEqual(taskState, 'running', 'Task row detected as running')

  // Step 6: Approval Interruption
  const approvalStack = new MockElement('div', 'approval-stack', { 'data-slot': 'tool-approval-stack' })
  const approvalCard = new MockElement('div', 'card', { 'data-slot': 'tool-approval-card' })
  const allowBtn = new MockElement('button', 'btn', { 'data-approval-run': 'true' })
  approvalCard.appendChild(allowBtn)
  approvalStack.appendChild(approvalCard)

  enhanceApproval(approvalStack, isElement, statsMock)
  enhanceApproval(approvalCard, isElement, statsMock)
  assert.strictEqual(approvalStack.getAttribute('data-bubbles-approval'), 'true', 'Approval stack marked')
  assert.strictEqual(allowBtn.getAttribute('data-approval-run'), 'true', 'Native allow button untouched')

  // Step 7: Approval accepted & removed, Task completes
  approvalStack.remove()
  taskIcon.textContent = ''
  taskIcon.appendChild(new MockElement('span', 'codicon-check'))
  const taskStateCompleted = detectTaskState(taskRow, isElement)
  assert.strictEqual(taskStateCompleted, 'completed', 'Task transition to completed')

  console.log('  ✓ Passed')
}

// 2. Task + Tool Coexistence & Zero Collision
{
  console.log('[Test 2] Task + Tool Coexistence: Independent state detection and zero cross-leakage')
  const statsMock = { toolRefreshes: 0 }
  
  const toolBlock = new MockElement('div', 'tool', { 'data-slot': 'tool-block' })
  toolBlock.appendChild(new MockElement('span', 'animate-spin'))
  enhanceToolBlock(toolBlock, isElement, detectToolState, statsMock)

  const taskRow = new MockElement('div', 'status-row', { 'data-slot': 'status-row' })
  const taskIcon = new MockElement('div', 'status-row-icon')
  taskIcon.appendChild(new MockElement('span', 'codicon-check'))
  taskRow.appendChild(taskIcon)
  const taskState = detectTaskState(taskRow, isElement)

  assert.strictEqual(toolBlock.getAttribute('data-bubbles-tool-state'), 'running', 'Tool state running')
  assert.strictEqual(taskState, 'completed', 'Task state completed')
  assert.strictEqual(toolBlock.hasAttribute('data-task-state'), false, 'Tool block must not have task state')
  assert.strictEqual(taskRow.hasAttribute('data-bubbles-tool-state'), false, 'Task row must not have tool state')
  console.log('  ✓ Passed')
}

// Tests 3 and 4 used to assert on source text here — including a byte-for-byte
// pin of the whole 13-line clarify block, which failed on a reindent and passed on
// any semantic edit that kept the shape. Their header also advertised a
// "Task Dock (z:30)" tier that exists nowhere in the CSS.
// Replaced by test/overlay-stacking.test.js, which reads z-index off a browser and
// proves the clamp()s by measuring max-height at two viewport sizes.

// 5. Accessibility: Focus-Visible & Reduced Motion
{
  console.log('[Test 5] Accessibility: Keyboard focus outlines & Reduced-Motion multi-surface coverage')
  // Text inputs are excluded on purpose: SearchField's underline variant sizes its
  // input to content ([field-sizing:content]), so a ring on the input hugs the text
  // and floats off the field (measured 58px ring on an 82px field). Real controls
  // glow via .desktop-input-chrome, which owns its own :focus treatment.
  assert(srcCode.includes(':is(button, textarea, select, [role="button"]):focus-visible'), 'Focus visible selector covers the controls that can host a ring')
  assert(!srcCode.includes(':is(button, textarea, input, select'), 'Blanket focus ring must not target bare input')
  assert(srcCode.includes('outline: 2px solid rgba(125, 175, 250, 0.75) !important') && srcCode.includes('outline-offset: -2px !important'), 'Focus ring stays 2px sapphire but sits inside the box — an outset ring read as a stray highlight box')
  assert(srcCode.includes('@media (prefers-reduced-motion: reduce)'), 'Reduced motion query exists')
  assert(srcCode.includes('[data-slot=\'tool-approval-card\']'), 'Approval card covered by reduced motion')
  assert(srcCode.includes('[data-slot=\'clarify-inline\']'), 'Clarify inline card covered by reduced motion')
  console.log('  ✓ Passed')
}

// 6. Idempotent Batching Under High Frequency
{
  console.log('[Test 6] Streaming Idempotence: Repeated batch executions do not bloat stats or re-stamp attributes')
  const statsMock = { enhancedMessages: 0 }
  const asst = new MockElement('div', 'asst', { 'data-slot': 'aui_assistant-message-root' })

  // First call
  enhanceAssistantMessage(asst, isElement, statsMock)
  assert.strictEqual(statsMock.enhancedMessages, 1, 'First pass increments counter')

  // Repeated 100 streaming ticks
  for (let i = 0; i < 100; i++) {
    enhanceAssistantMessage(asst, isElement, statsMock)
  }
  assert.strictEqual(statsMock.enhancedMessages, 1, 'Subsequent ticks must be completely no-op')
  console.log('  ✓ Passed')
}

console.log('=== All Phase 3.1 Test Assertions Passed Successfully ===')
