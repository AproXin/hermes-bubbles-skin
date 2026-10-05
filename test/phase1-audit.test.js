/**
 * test/phase1-audit.test.js
 *
 * Phase 1.1 Automated Regression & Stability Suite
 */

const assert = require('assert')

// Minimal DOM mock for Node testing
const { MockElement } = require('./lib/mock-dom')
const { extractFn, isElement } = require('./lib/plugin-sandbox')

const detectTaskState = new Function('row', 'isElement', extractFn('detectTaskState'))

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
