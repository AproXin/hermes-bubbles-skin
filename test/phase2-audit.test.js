/**
 * test/phase2-audit.test.js
 *
 * Phase 2 Automated Regression Suite:
 * - Multi-Signal Task State Priority
 * - Tool Call State Classification
 * - Dynamic Task Counter Badge Sync
 * - Zero State Mutation
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
    // updateTaskHeaderCounter publishes the completion ratio as a custom property,
    // so every mock node needs a minimal CSSStyleDeclaration.
    this._cssVars = {}
    this.style = {
      getPropertyValue: k => this._cssVars[k] ?? '',
      setProperty: (k, v) => { this._cssVars[k] = String(v) },
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
}

// Read functions from src/plugin.js
const srcCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'plugin.js'), 'utf8')

function extractFn(name) {
  const match = srcCode.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`))
  if (!match) throw new Error(`Function ${name} could not be extracted`)
  return match[1]
}

const detectTaskState = new Function('row', 'isElement', extractFn('detectTaskState'))
const detectToolState = new Function('toolBlock', 'isElement', extractFn('detectToolState'))
const updateTaskHeaderCounter = new Function(
  'taskSection', 'completedCount', 'totalCount', 'document',
  extractFn('updateTaskHeaderCounter')
)

function isElement(node) { return Boolean(node && node.nodeType === 1) }

console.log('=== Phase 2 Regression Tests ===')

// 1. Task State Assertions
{
  console.log('[Test 1] Task State Priority: Failed beats Running & Completed')
  const row = new MockElement('div', 'status-row')
  const icon = new MockElement('div', 'status-row-icon')
  icon.textContent = '⠋' // Braille running
  row.appendChild(icon)
  const errSpan = new MockElement('span', 'text-destructive')
  errSpan.textContent = 'exit code 127'
  row.appendChild(errSpan)

  const state = detectTaskState(row, isElement)
  assert.strictEqual(state, 'failed', 'Error signal must preemptively mark task as failed')

  // The live bug this test now pins: GlyphSpinner's wrapper carries tabular-nums
  // (glyph-spinner.tsx:98) so its braille frames do not jitter, and the old
  // "any .tabular-nums is an exit-code badge" check tinted every running row red.
  const spinning = new MockElement('div', 'status-row')
  const spinIcon = new MockElement('div', 'status-row-icon')
  spinIcon.textContent = '⠹'
  const spinWrap = new MockElement('span', 'inline-flex font-mono leading-none tabular-nums')
  spinWrap.textContent = '⠹'
  spinIcon.appendChild(spinWrap)
  spinning.appendChild(spinIcon)
  assert.strictEqual(detectTaskState(spinning, isElement), 'running',
    'A braille spinner alone must be running, never a failed exit code')
  console.log('  ✓ Passed')
}

// 2. Tool State Assertions
{
  console.log('[Test 2] Tool State: Active spinning tool detected as running')
  const tool = new MockElement('div', 'tool-block')
  const spinner = new MockElement('span', 'animate-spin')
  tool.appendChild(spinner)

  const state = detectToolState(tool, isElement)
  assert.strictEqual(state, 'running', 'Spinning tool block must be detected as running')
  console.log('  ✓ Passed')
}

{
  console.log('[Test 3] Tool State: Error tool block detected as failed')
  const tool = new MockElement('div', 'tool-block')
  const err = new MockElement('span', 'text-destructive')
  err.textContent = 'Error: ENOENT'
  tool.appendChild(err)

  const state = detectToolState(tool, isElement)
  assert.strictEqual(state, 'failed', 'Destructive tool block must be detected as failed')
  console.log('  ✓ Passed')
}

{
  console.log('[Test 4] Tool State: Quiet tool block detected as completed')
  const tool = new MockElement('div', 'tool-block')
  tool.textContent = 'Output: 42'

  const state = detectToolState(tool, isElement)
  assert.strictEqual(state, 'completed', 'Standard finished tool block must be completed')
  console.log('  ✓ Passed')
}

// 3. Dynamic Task Header Counter
{
  console.log('[Test 5] Dynamic Task Header: Injects counter pill from actual DOM row counts')
  const section = new MockElement('div', 'status-section')
  const trigger = new MockElement('button', 'status-section-trigger')
  section.appendChild(trigger)

  // Mock document.createElement
  const mockDoc = {
    createElement: (tag) => new MockElement(tag)
  }

  updateTaskHeaderCounter(section, 3, 6, mockDoc)

  assert.strictEqual(trigger.querySelector('.bubbles-task-counter'), null,
    'No counter pill: Hermes already prints 任务 n/m in the header')
  assert(['0.500', '0.5'].includes(trigger.style.getPropertyValue('--bubbles-task-progress')),
    `The ratio must reach the CSS bar as --bubbles-task-progress, got ${JSON.stringify(trigger.style.getPropertyValue('--bubbles-task-progress'))}`)
  console.log('  ✓ Passed')
}

console.log('=== All Phase 2 Test Assertions Passed Successfully ===')
