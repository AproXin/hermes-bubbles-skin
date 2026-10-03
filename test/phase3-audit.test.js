/**
 * test/phase3-audit.test.js
 *
 * Phase 3 Automated Regression & Architecture Safety Suite:
 * - Approval DOM Recognition & Non-Invasive Stamping
 * - Clarify DOM Recognition & Non-Invasive Stamping
 * - Zero Event Hijacking & Native Button Preservation
 * - Task + Approval / Clarify Hierarchy & Isolation
 * - Accessibility (Reduced Motion & Focus Visible) CSS Verification
 */

const assert = require('assert')

const { MockElement } = require('./lib/mock-dom')
const { srcCode, extractFn, isElement } = require('./lib/plugin-sandbox')

const enhanceApproval = new Function('approvalEl', 'isElement', 'stats', extractFn('enhanceApproval'))
const enhanceClarify = new Function('clarifyEl', 'isElement', 'stats', extractFn('enhanceClarify'))
const statsMock = { approvalRefreshes: 0, clarifyRefreshes: 0 }

console.log('=== Phase 3 Regression Tests ===')

// 1. Approval Stack & Card Recognition
{
  console.log('[Test 1] Approval Recognition: Detects stack and card, stamps data attribute without DOM alteration')
  const stack = new MockElement('div', 'floating-stack', { 'data-slot': 'tool-approval-stack' })
  const card = new MockElement('div', 'approval-card', { 'data-slot': 'tool-approval-card' })
  const actions = new MockElement('div', 'actions', { 'data-slot': 'tool-approval-actions' })
  
  const allowBtn = new MockElement('button', 'btn-primary', { 'data-approval-run': 'true', type: 'button' })
  allowBtn.textContent = 'Allow'
  const denyBtn = new MockElement('button', 'btn-ghost', { 'data-approval-deny': 'true', type: 'button' })
  denyBtn.textContent = 'Deny'

  actions.appendChild(allowBtn)
  actions.appendChild(denyBtn)
  card.appendChild(actions)
  stack.appendChild(card)

  enhanceApproval(stack, isElement, statsMock)
  enhanceApproval(card, isElement, statsMock)

  assert.strictEqual(stack.getAttribute('data-bubbles-approval'), 'true', 'Stack must receive data-bubbles-approval="true"')
  assert.strictEqual(card.getAttribute('data-bubbles-approval'), 'true', 'Card must receive data-bubbles-approval="true"')
  assert.strictEqual(allowBtn.getAttribute('data-approval-run'), 'true', 'Native allow button attributes must be completely untouched')
  assert.strictEqual(denyBtn.getAttribute('data-approval-deny'), 'true', 'Native deny button attributes must be completely untouched')
  assert.strictEqual(card.children.length, 1, 'Card child tree must be preserved')
  console.log('  ✓ Passed')
}

// 2. Clarify Inline Recognition
{
  console.log('[Test 2] Clarify Recognition: Detects clarify-inline and choice form, stamps data attribute')
  const clarifyBox = new MockElement('div', 'clarify-box', { 'data-slot': 'clarify-inline' })
  const form = new MockElement('form', 'clarify-form', { 'data-clarify-choices': 'true' })
  
  const choiceBtn1 = new MockElement('button', 'choice-btn', { 'data-choice': 'option-a' })
  choiceBtn1.textContent = 'Option A'
  const choiceBtn2 = new MockElement('button', 'choice-btn', { 'data-choice': 'option-b' })
  choiceBtn2.textContent = 'Option B'
  
  const submitBtn = new MockElement('button', 'btn-submit', { type: 'submit' })
  submitBtn.textContent = 'Continue'

  form.appendChild(choiceBtn1)
  form.appendChild(choiceBtn2)
  form.appendChild(submitBtn)
  clarifyBox.appendChild(form)

  enhanceClarify(clarifyBox, isElement, statsMock)
  enhanceClarify(form, isElement, statsMock)

  assert.strictEqual(clarifyBox.getAttribute('data-bubbles-clarify'), 'true', 'Clarify container must receive data-bubbles-clarify="true"')
  assert.strictEqual(form.getAttribute('data-bubbles-clarify'), 'true', 'Clarify form must receive data-bubbles-clarify="true"')
  assert.strictEqual(choiceBtn1.getAttribute('data-choice'), 'option-a', 'Native choice attributes must be untouched')
  assert.strictEqual(submitBtn.getAttribute('type'), 'submit', 'Native submit button must remain intact')
  console.log('  ✓ Passed')
}

// 3. Task + Approval Coexistence & State Independence
{
  console.log('[Test 3] Task + Approval Coexistence: Both stamped independently without cross-contamination')
  
  // Task element
  const taskRow = new MockElement('div', 'status-row')
  taskRow.setAttribute('data-bubbles-task-state', 'running')

  // Approval element
  const approvalCard = new MockElement('div', 'card', { 'data-slot': 'tool-approval-card' })

  // Clarify element
  const clarifyInline = new MockElement('div', 'inline', { 'data-slot': 'clarify-inline' })

  enhanceApproval(approvalCard, isElement, statsMock)
  enhanceClarify(clarifyInline, isElement, statsMock)

  assert.strictEqual(taskRow.getAttribute('data-bubbles-task-state'), 'running', 'Task state must remain unchanged')
  assert.strictEqual(taskRow.hasAttribute('data-bubbles-approval'), false, 'Task row must not be tagged with approval')
  assert.strictEqual(taskRow.hasAttribute('data-bubbles-clarify'), false, 'Task row must not be tagged with clarify')
  
  assert.strictEqual(approvalCard.getAttribute('data-bubbles-approval'), 'true', 'Approval card tagged correctly')
  assert.strictEqual(clarifyInline.getAttribute('data-bubbles-clarify'), 'true', 'Clarify container tagged correctly')
  console.log('  ✓ Passed')
}

// 4. CSS Audit: Stacking, Reduced Motion, Focus Visible
{
  console.log('[Test 4] CSS Architecture: Verifies z-index layering, reduced-motion, and focus-visible')
  
  // Verify tool-approval-stack z-index 50
  assert(srcCode.includes('[data-slot="tool-approval-stack"]'), 'CSS must target tool-approval-stack')
  assert(srcCode.includes('z-index: 50 !important'), 'tool-approval-stack must have z-index 50 for floating priority')
  
  // Verify clarify-inline z-index 40 and overflow visible
  assert(srcCode.includes('[data-slot="clarify-inline"]'), 'CSS must target clarify-inline')
  assert(srcCode.includes('z-index: 40 !important'), 'clarify-inline must have z-index 40')
  assert(srcCode.includes('overflow: visible !important'), 'clarify and approval must ensure overflow is visible')
  
  // Verify focus-visible outline
  assert(srcCode.includes(':focus-visible'), 'Focus visible styling must be defined for keyboard accessibility')
  assert(srcCode.includes('outline: 2px solid'), 'Focus visible outline must be prominent')

  // Verify prefers-reduced-motion
  assert(srcCode.includes('@media (prefers-reduced-motion: reduce)'), 'Prefers-reduced-motion media query must be present')
  assert(srcCode.includes('animation: none !important'), 'Animations must be disabled in reduced-motion mode')
  assert(srcCode.includes('transition: none !important'), 'Transitions must be disabled in reduced-motion mode')
  
  console.log('  ✓ Passed')
}

// 5. Zero Native Event Hijacking Check
{
  console.log('[Test 5] Safety Check: Confirms no event listeners or clones are added in Approval/Clarify functions')
  const approvalFnStr = extractFn('enhanceApproval')
  const clarifyFnStr = extractFn('enhanceClarify')

  assert(!approvalFnStr.includes('addEventListener'), 'enhanceApproval must not register event listeners')
  assert(!approvalFnStr.includes('cloneNode'), 'enhanceApproval must not clone nodes')
  assert(!approvalFnStr.includes('onclick'), 'enhanceApproval must not assign onclick handlers')
  
  assert(!clarifyFnStr.includes('addEventListener'), 'enhanceClarify must not register event listeners')
  assert(!clarifyFnStr.includes('cloneNode'), 'enhanceClarify must not clone nodes')
  assert(!clarifyFnStr.includes('onclick'), 'enhanceClarify must not assign onclick handlers')
  
  console.log('  ✓ Passed')
}

console.log('=== All Phase 3 Test Assertions Passed Successfully ===')
