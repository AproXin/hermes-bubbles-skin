/**
 * test/phase1-audit.test.js
 *
 * Phase 1.1 Automated Regression & Stability Suite
 */

const assert = require('assert')
const fs = require('fs')
const path = require('path')

// Minimal DOM mock for Node testing
class MockElement {
  constructor(tagName = 'div', className = '', attributes = {}) {
    this.tagName = tagName.toUpperCase()
    this.nodeType = 1
    this.className = className
    this.attributes = { ...attributes }
    this.children = []
    this.parentElement = null
    this.textContent = ''
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

// Read and extract detectTaskState from src/plugin.js
const srcCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'plugin.js'), 'utf8')
const detectFnMatch = srcCode.match(/function detectTaskState\(row\) \{([\s\S]*?)\n\}/)
if (!detectFnMatch) {
  throw new Error('detectTaskState function could not be parsed from src/plugin.js')
}

const detectTaskState = new Function('row', 'isElement', `${detectFnMatch[1]}`)
function isElement(node) { return Boolean(node && node.nodeType === 1) }

console.log('--- Phase 1.1 Stability Tests ---')

// 1. Task State Priority & Detection
{
  console.log('[Test 1] Task State: Failed over Completed priority')
  const row = new MockElement('div', 'status-row')
  const icon = new MockElement('div', 'status-row-icon')
  icon.appendChild(new MockElement('i', 'codicon codicon-pass-filled'))
  const exitBadge = new MockElement('span', 'tabular-nums text-destructive')
  exitBadge.textContent = 'exit(1)'
  row.appendChild(icon)
  row.appendChild(exitBadge)

  const state = detectTaskState(row, isElement)
  assert.strictEqual(state, 'failed', 'Exit code / destructive indicator must prioritize "failed" over "completed"')
  console.log('  ✓ Passed')
}

{
  console.log('[Test 2] Task State: Braille spinner identifies "running"')
  const row = new MockElement('div', 'status-row')
  const icon = new MockElement('div', 'status-row-icon')
  icon.textContent = '⠋'
  row.appendChild(icon)

  const state = detectTaskState(row, isElement)
  assert.strictEqual(state, 'running', 'Braille glyph must be recognized as "running"')
  console.log('  ✓ Passed')
}

{
  console.log('[Test 3] Task State: animate-spin fallback identifies "running"')
  const row = new MockElement('div', 'status-row')
  const icon = new MockElement('div', 'status-row-icon')
  icon.appendChild(new MockElement('span', 'animate-spin'))
  row.appendChild(icon)

  const state = detectTaskState(row, isElement)
  assert.strictEqual(state, 'running', 'animate-spin fallback must identify "running"')
  console.log('  ✓ Passed')
}

{
  console.log('[Test 4] Task State: Warning / Paused identifies "waiting"')
  const row = new MockElement('div', 'status-row')
  const icon = new MockElement('div', 'status-row-icon')
  icon.appendChild(new MockElement('i', 'codicon codicon-warning'))
  row.appendChild(icon)

  const state = detectTaskState(row, isElement)
  assert.strictEqual(state, 'waiting', 'codicon-warning must identify "waiting"')
  console.log('  ✓ Passed')
}

{
  console.log('[Test 5] Task State: Checkmark identifies "completed"')
  const row = new MockElement('div', 'status-row')
  const icon = new MockElement('div', 'status-row-icon')
  icon.appendChild(new MockElement('i', 'codicon codicon-pass-filled'))
  row.appendChild(icon)

  const state = detectTaskState(row, isElement)
  assert.strictEqual(state, 'completed', 'codicon-pass-filled must identify "completed"')
  console.log('  ✓ Passed')
}

{
  console.log('[Test 6] Task State: Circle slash identifies "cancelled"')
  const row = new MockElement('div', 'status-row')
  const icon = new MockElement('div', 'status-row-icon')
  icon.appendChild(new MockElement('i', 'codicon codicon-circle-slash'))
  row.appendChild(icon)

  const state = detectTaskState(row, isElement)
  assert.strictEqual(state, 'cancelled', 'codicon-circle-slash must identify "cancelled"')
  console.log('  ✓ Passed')
}

{
  console.log('[Test 7] Task State: Default SVG fallback identifies "pending"')
  const row = new MockElement('div', 'status-row')
  const icon = new MockElement('div', 'status-row-icon')
  icon.appendChild(new MockElement('svg'))
  row.appendChild(icon)

  const state = detectTaskState(row, isElement)
  assert.strictEqual(state, 'pending', 'Unknown SVG icon must safely fallback to "pending"')
  console.log('  ✓ Passed')
}

console.log('--- All 7 Unit Assertions Passed Successfully ---')
