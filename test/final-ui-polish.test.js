/**
 * test/final-ui-polish.test.js
 *
 * Final UI Polish Verification Suite
 *
 * Groups 1 and 2 below no longer read the CSS text. The mask / ::after / edit
 * alignment / action-cluster claims they used to pin are measured in
 * test/bubble-computed-style.test.js, which stacks the same three sheets the
 * renderer loads and reads getComputedStyle plus geometry against the host's own
 * classes. The conversion also corrected one of them: this file asserted a
 * `[data-context-menu-skip] { width: fit-content; align-self: flex-end }` rule
 * that does not exist, because the three `includes()` calls it was made of each
 * matched a different rule. What is left here pins rule existence with the value
 * bound inside the same rule.
 *
 * Verifies:
 * 1. Long User Bubble Expanded State (measured in bubble-computed-style §1-§2):
 *    - Completely clears mask-image, -webkit-mask-image, mask, -webkit-mask
 *    - Clears ::after pseudo-element (display: none, content: none, background: none, box-shadow: none)
 *    - Keeps bubble's base frosted glass shadow intact
 * 2. Edit State Semantic Right-Alignment (measured in bubble-computed-style §3, §6-§7):
 *    - [data-slot="aui_edit-composer-root"] aligned to the right (flex-end)
 *    - Subcontainers (.composer-human-message-container, .ui-prompt-input__container) aligned right
 *    - Inner editor ([data-slot="composer-rich-input"]) stays left-aligned (text-align: left, direction: ltr)
 *    - No duplicate avatar or double-padding on edit container
 * 3. Edit Mode Long Message Collapse Bypass & Restoration (this file, mock DOM —
 *    it runs the real setupLongMessageCollapse, which is the stamping path the
 *    measured suite's fixture assumes):
 *    - Entering Edit mode forces expanded display (data-bubbles-editing="true", data-bubbles-user-expanded="true")
 *    - Expand button is hidden in Edit mode
 *    - User's storageKey preference is NOT overwritten during edit
 *    - Exiting Edit mode accurately restores previous collapsed or expanded state
 * 4. Session Sidebar Visual Language Unification:
 *    - Transparent container (ambient light constellation stays visible), sapphire border-right
 *    - Low contrast muted slate for normal session rows (#94a3b8)
 *    - Subtle navy hover (rgba(16, 42, 78, 0.50), text #e2e8f0)
 *    - Active session with left accent (inset 3px 0 0 0 #60a5fa) and sapphire glow
 *    - Row chrome is owned by PLUGIN_CSS alone; the skin keeps only non-sidebar rows
 *    - Clean date dividers (#93c5fd uppercase, gradient 1px separator)
 *    - Focus-visible outlines on keyboard navigation
 */

const assert = require('assert')
const fs = require('fs')
const path = require('path')

// ----------------------------------------------------------------------------
// Minimal DOM Mock for Node Environment
// ----------------------------------------------------------------------------
const { MockElement } = require('./lib/mock-dom')

// ----------------------------------------------------------------------------
// Test Environment Setup
// ----------------------------------------------------------------------------
const localStorageStore = {}
const mockLocalStorage = {
  getItem: (k) => localStorageStore[k] ?? null,
  setItem: (k, v) => { localStorageStore[k] = String(v) },
  removeItem: (k) => { delete localStorageStore[k] },
  clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]) }
}

globalThis.localStorage = mockLocalStorage
globalThis.document = {
  createElement: (tag) => new MockElement(tag),
  getElementById: () => null,
  head: new MockElement('head'),
  body: new MockElement('body'),
  querySelectorAll: () => []
}
globalThis.window = {
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  addEventListener: () => {},
  removeEventListener: () => {}
}
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
}

const pluginSource = fs.readFileSync(path.join(__dirname, '../src/plugin.js'), 'utf8')
const { skinSourcePath, skinSourceLabel } = require('./skin-source')
const yamlSource = fs.readFileSync(skinSourcePath(), 'utf8')
console.log(`(skin source: ${skinSourceLabel()} — ${skinSourcePath()})`)

function extractFn(name) {
  const match = pluginSource.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`))
  if (!match) throw new Error(`Function ${name} could not be extracted: ${name}`)
  return match[1]
}

const isElement = (node) => Boolean(node && node.nodeType === 1)
globalThis.isElement = isElement
const CLAMP_LINE_THRESHOLD_PX = 110
globalThis.mockLocalStorage = mockLocalStorage
/* getMessageStorageKey now returns a complete key, so the namespace it uses has to exist
   in this sandbox. Pinned against src/plugin.js by test/tool-group-id-stability.test.js. */
globalThis.USER_EXPAND_NS = 'hermes-bubbles-skin:user-expand:'
/* These three are injected into the sandbox by source, so they must mirror the shipped
   helpers exactly: since D3 the key arrives complete (namespaced by the caller) and the
   helper stores it unchanged. Prefixing here again would reproduce the very bug. */
const safeGetStorage = (key, fallback) => {
  const val = globalThis.mockLocalStorage.getItem(key)
  return val !== null ? JSON.parse(val) : fallback
}
const safeSetStorage = (key, val) => {
  globalThis.mockLocalStorage.setItem(key, JSON.stringify(val))
}
const safeRemoveStorage = (key) => {
  globalThis.mockLocalStorage.removeItem(key)
}

const getMessageStorageKey = new Function('userRoot', extractFn('getMessageStorageKey'))
const clearLongUserDecoration = new Function('userRoot', extractFn('clearLongUserDecoration'))
const setupLongMessageCollapse = new Function(
  'userRoot',
  `const isElement = ${isElement.toString()};
   const CLAMP_LINE_THRESHOLD_PX = ${CLAMP_LINE_THRESHOLD_PX};
   const getMessageStorageKey = ${getMessageStorageKey.toString()};
   /* The shipped function consults the pass-ahead height batch; this suite calls it
      outside a pass, so the batch is exactly what processDOM leaves it between passes:
      null, meaning "measure live", which is the path these cases have always taken. */
   let clampHeightBatch = null;
   const safeGetStorage = ${safeGetStorage.toString()};
   const safeSetStorage = ${safeSetStorage.toString()};
   const safeRemoveStorage = ${safeRemoveStorage.toString()};
   const clearLongUserDecoration = ${clearLongUserDecoration.toString()};
   ${extractFn('setupLongMessageCollapse')}`
)

console.log('\n=== Final UI Polish Audit Suite ===\n')

// ============================================================================
// Test 1: Long User Bubble Expanded State
// ============================================================================
console.log('[Test 1] Long User Bubble Expanded State: Mask & Gradient Removal')

// A. Mask, gradient and the ::after band are measured, not read.
assert(
  true,
  'measured in test/bubble-computed-style.test.js §1-§2 — the mask is gone in both states and the ::after paints nothing'
)

// B. The stamping path that puts data-bubbles-user-expanded on the root is Test 3
//    below, which runs the real setupLongMessageCollapse against the mock DOM.
//    Nothing here re-pins the CSS text: the host sheet alone paints a real
//    linear-gradient mask (styles.css:1830-1832), so if the clearing rules were
//    deleted the measured twin would go red — which is a stronger pin than the
//    `pluginSource.includes("mask-image: none !important")` this replaced, because
//    that call never bound the declaration to the selector it belongs to.

console.log('  ✓ Passed: Mask, gradient, and bottom shadow measured cleared in both states (see bubble-computed-style)')

// ============================================================================
// Test 2: Edit State Right-Alignment & Inner Left-Alignment
// ============================================================================
console.log('[Test 2] Edit State Right-Alignment & Editor Left-Alignment')

// A. [data-slot='aui_edit-composer-root'] is a real box, the prompt container is
//    pushed onto its right edge, the editor inside stays left-aligned, and the
//    duplicate-avatar ::before stays suppressed — all four measured in
//    test/bubble-computed-style.test.js §3 and §6-§7. They used to be five
//    `includes()` calls that never bound a value to its selector, which is how
//    this file came to assert a rule that does not exist (see the note below).
assert(
  true,
  'measured in test/bubble-computed-style.test.js §3 and §6-§7 — edit root is a box, prompt is right-aligned, editor stays left, ::before suppressed'
)

// B. What actually carries the right alignment, pinned as one block instead of
//    three loose strings. The old E group claimed
//    `[data-context-menu-skip] { width: fit-content; align-self: flex-end }` and
//    passed, because it searched the whole file for each value separately. In the
//    shipped sheet the skip element is `relative w-full` in the host
//    (user-message.tsx:430-436) and carries neither declaration: the cluster is
//    right-aligned by `align-self: flex-end` on its ANCESTOR
//    [data-slot=aui_user-bubble-actions], and the shrink-wrap belongs to the
//    .composer-human-message INSIDE the skip element. Both are measured
//    geometrically in bubble-computed-style §4-§5; this only pins that the two
//    rules still exist, bound to their own selectors inside a single block.
const actionBarRule = pluginSource.match(
  /html\[data-bubbles-skin='true'\] \[data-slot='aui_user-message-root'\]\s*>\s*\[data-slot='aui_user-bubble-actions'\][^{]*\{([^}]*)\}/
)
assert(actionBarRule, 'Skin must still right-align the user bubble action bar')
assert(
  /align-self:\s*flex-end\s*!important/.test(actionBarRule[1]),
  'Action bar must carry align-self: flex-end !important in that same rule'
)

const skipInnerRule = pluginSource.match(
  /html\[data-bubbles-skin='true'\] \[data-context-menu-skip\]\s+\.composer-human-message[^{]*\{([^}]*)\}/
)
assert(skipInnerRule, 'Skin must still shrink-wrap the composer inside the skip element')
assert(
  /width:\s*fit-content\s*!important/.test(skipInnerRule[1]),
  'That same rule must carry width: fit-content !important'
)

console.log('  ✓ Passed: Edit composer measured right-aligned with the editor left-aligned; cluster rules pinned to their own blocks')

// ============================================================================
// Test 3: Edit Mode Long Message Collapse Bypass & Restoration
// ============================================================================
console.log('[Test 3] Edit Mode Collapse Bypass & State Restoration Lifecycle')

// Helper function to build user message DOM tree
function createUserMessageDOM({ id = 'msg-1', text = 'Long user question...', fullHeight = 200, isEditing = false } = {}) {
  const root = new MockElement('div', 'user-root', {
    'data-slot': isEditing ? 'aui_edit-composer-root' : 'aui_user-message-root',
    'data-message-id': id
  })
  const actions = new MockElement('div', '', { 'data-slot': 'aui_user-bubble-actions' })
  const skip = new MockElement('div', '', { 'data-context-menu-skip': 'true' })
  const bubble = new MockElement('div', 'composer-human-message')
  const clamp = new MockElement('div', 'sticky-human-clamp')
  clamp.style['--human-msg-full'] = `${fullHeight}px`
  const inner = new MockElement('div', 'inner-text')
  inner.textContent = text

  clamp.appendChild(inner)
  bubble.appendChild(clamp)
  skip.appendChild(bubble)
  actions.appendChild(skip)
  root.appendChild(actions)

  if (isEditing) {
    const editor = new MockElement('div', 'ui-prompt-input-editor__input', {
      'data-slot': 'composer-rich-input'
    })
    bubble.appendChild(editor)
  }

  return { root, clamp, bubble, skip }
}

mockLocalStorage.clear()

// 1. Initial State: Long User message starts COLLAPSED
const { root: userMsg, skip: userSkip } = createUserMessageDOM({ id: 'msg-test-1', fullHeight: 250, isEditing: false })
setupLongMessageCollapse(userMsg)

assert.strictEqual(userMsg.getAttribute('data-bubbles-long-user'), 'true')
assert.strictEqual(userMsg.hasAttribute('data-bubbles-user-expanded'), false, 'Should start collapsed')
const initialBtn = userMsg.querySelector('.bubbles-user-expand-btn')
assert(initialBtn, 'Expand button should be present')
assert.strictEqual(initialBtn.style.display, '')

// 2. User enters Edit Mode on this message
// Simulating Hermes switching this container to editing
userMsg.setAttribute('data-slot', 'aui_edit-composer-root')
const richInput = new MockElement('div', 'ui-prompt-input-editor__input', { 'data-slot': 'composer-rich-input' })
userMsg.appendChild(richInput)

setupLongMessageCollapse(userMsg)

assert.strictEqual(userMsg.getAttribute('data-bubbles-editing'), 'true', 'Must stamp data-bubbles-editing="true"')
assert.strictEqual(userMsg.getAttribute('data-bubbles-user-expanded'), 'true', 'Must force data-bubbles-user-expanded="true"')
assert.strictEqual(initialBtn.style.display, 'none', 'Expand button must be hidden in edit mode')
assert.strictEqual(mockLocalStorage.getItem('hermes-bubbles-skin:user-expand:msg-test-1'), null, 'User storage must NOT be overwritten')

// 3. User cancels / completes edit mode
userMsg.setAttribute('data-slot', 'aui_user-message-root')
richInput.remove()

setupLongMessageCollapse(userMsg)

assert.strictEqual(userMsg.hasAttribute('data-bubbles-editing'), false, 'data-bubbles-editing must be removed')
assert.strictEqual(userMsg.hasAttribute('data-bubbles-user-expanded'), false, 'Must restore collapsed state because user had not expanded it')
assert.strictEqual(initialBtn.style.display, '', 'Expand button must be visible again')

// 4. Test state restoration when user HAD explicitly expanded it before editing
mockLocalStorage.setItem('hermes-bubbles-skin:user-expand:msg-test-1', 'true')
setupLongMessageCollapse(userMsg)
assert.strictEqual(userMsg.getAttribute('data-bubbles-user-expanded'), 'true', 'Should be expanded per storage')

// Enter edit mode again
userMsg.setAttribute('data-slot', 'aui_edit-composer-root')
userMsg.appendChild(richInput)
setupLongMessageCollapse(userMsg)
assert.strictEqual(userMsg.getAttribute('data-bubbles-editing'), 'true')
assert.strictEqual(initialBtn.style.display, 'none')

// Exit edit mode again
userMsg.setAttribute('data-slot', 'aui_user-message-root')
richInput.remove()
setupLongMessageCollapse(userMsg)

assert.strictEqual(userMsg.hasAttribute('data-bubbles-editing'), false)
assert.strictEqual(userMsg.getAttribute('data-bubbles-user-expanded'), 'true', 'Must restore expanded state per storage')
assert.strictEqual(initialBtn.style.display, '')

console.log('  ✓ Passed: Edit mode forces full expansion and safely restores previous collapsed/expanded preference')

// ============================================================================
// Test 4: Session Sidebar Aesthetics Unification
// ============================================================================
console.log('[Test 4] Session Sidebar Aesthetics: Transparent Container, Sapphire Glow, Slate Text')

// A. Container: the ambient constellation must pass through
// A navy + blur panel here hid the fixed light-spot layer and cut a hard
// rectangular seam through the Sessions column, so the container is transparent
// in BOTH stylesheets and only keeps the sapphire seam.
const sidebarContainerBlock = (src, sel) => {
  const i = src.indexOf(sel)
  return i === -1 ? '' : src.slice(i, src.indexOf('}', i))
}
for (const [name, src] of [['plugin.js', pluginSource], ['bubbles.yaml', yamlSource]]) {
  assert(
    src.includes('border-right: 1px solid rgba(147, 197, 253, 0.15) !important'),
    `${name} sidebar must keep the sapphire seam`
  )
  assert(
    !src.includes('rgba(8, 24, 48, 0.55)'),
    `${name} must not paint the sidebar container navy — it buries the ambient light constellation`
  )
}
assert(
  /background: transparent !important;\s*\n\s*backdrop-filter: none/.test(
    sidebarContainerBlock(pluginSource, "[data-slot='sidebar'],")),
  'plugin.js sidebar container must be transparent with no backdrop-filter'
)

// B. Normal session row low contrast slate
assert(
  pluginSource.includes("color: #94a3b8 !important") &&
  pluginSource.includes("border: 1px solid transparent !important"),
  'plugin.js normal session rows must have low contrast slate text (#94a3b8) and transparent border'
)

// C. Hover State — lifted for legibility over the transparent sidebar (the sidebar
//    container is transparent now, so the old 0.50 navy wash barely registered).
//    Guards the intent, not the retired numbers: a clearly stronger wash, a brighter
//    hairline, near-white text.
assert(
  pluginSource.includes("background: rgba(30, 71, 128, 0.62) !important") &&
  pluginSource.includes("border-color: rgba(147, 197, 253, 0.38) !important") &&
  pluginSource.includes("color: #f1f5f9 !important"),
  'plugin.js hover must read clearly: sapphire wash 0.62 + hairline .38 + #f1f5f9 text'
)

// D. Active Session Accent and Glow
assert(
  pluginSource.includes("background: rgba(14, 38, 72, 0.70) !important") &&
  pluginSource.includes("inset 3px 0 0 0 #60a5fa") &&
  pluginSource.includes("inset 0 0 16px rgba(59, 130, 246, 0.18)") &&
  pluginSource.includes("color: #ffffff !important"),
  'plugin.js active session must have a 3px inset sapphire accent bar and sapphire glow'
)

// E. Focus-visible outline
assert(
  pluginSource.includes("outline: 2px solid rgba(96, 165, 250, 0.75) !important") &&
  pluginSource.includes("outline-offset: -1px !important"),
  'plugin.js must provide clear 2px sapphire focus outline on keyboard navigation'
)

// F. ONE owner for the row chrome.
//
// The same row rules used to live in both sheets. Both were !important, so the
// winner was whichever <style> the renderer appended last — the skin re-applies
// when the theme refreshes, and re-ordering then silently changes the accent.
// bubbles.yaml also duplicated the accent as `border-left`, which reflows the
// selected title sideways relative to its siblings. Keep the plugin as the sole
// owner of the sidebar row shell, and keep any left-accent out of both sheets.
assert(
  !/\.row-hover[^{]*\{[^}]*margin/.test(yamlSource),
  'bubbles.yaml must not set row geometry — PLUGIN_CSS owns the sidebar row shell'
)
assert(
  !yamlSource.includes('border-left: 3px'),
  'bubbles.yaml must not use an active-only border-left: it eats inner width and shifts the selected title'
)
assert(
  !pluginSource.includes('border-left: 3px solid #60a5fa'),
  'plugin.js must paint the accent as an inset shadow, not a border-left'
)

// F. Date dividers
assert(
  pluginSource.includes("color: #93c5fd !important") &&
  pluginSource.includes("font-size: 10.5px !important") &&
  pluginSource.includes("letter-spacing: 0.12em !important") &&
  pluginSource.includes("text-transform: uppercase !important"),
  'plugin.js date divider headers must have crisp #93c5fd uppercase styling'
)

console.log('  ✓ Passed: Session sidebar visual language harmonized with Bubbles glass aesthetic')

// ============================================================================
// Test 5: processDOM & setupObserver Selectors
// ============================================================================
console.log('[Test 5] processDOM & setupObserver Selectors Coverage')

assert(
  pluginSource.includes('querySelectorAll(\'[data-slot="aui_user-message-root"], [data-slot="aui_edit-composer-root"]\')'),
  'processDOM must query both normal and edit user message roots'
)

assert(
  pluginSource.includes('\'[data-slot="aui_edit-composer-root"]\','),
  'setupObserver relevantSelectors must include [data-slot="aui_edit-composer-root"]'
)

console.log('  ✓ Passed: DOM processor and observer cover inline edit mode dynamically')

// ============================================================================
// Test 6: User Message Text Visibility in Show more and Show less States
// ============================================================================
console.log('[Test 6] User Message Text Visibility in Show more and Show less States')

// A. Action button selector strictly excludes .composer-human-message to prevent 24px height collapse
assert(
  yamlSource.includes("[data-context-menu-skip] button:not(.composer-human-message):not(.bubbles-user-expand-btn)") &&
  pluginSource.includes("[data-context-menu-skip] button:not(.composer-human-message):not(.bubbles-user-expand-btn)"),
  'Button styles inside [data-context-menu-skip] must explicitly exclude .composer-human-message'
)

// B. .sticky-human-clamp explicitly visible and not clipped
assert(
  yamlSource.includes(".sticky-human-clamp") && yamlSource.includes("visibility: visible !important") &&
  pluginSource.includes(".sticky-human-clamp") && pluginSource.includes("visibility: visible !important"),
  'Both sources must set .sticky-human-clamp to visibility: visible !important'
)

// C. User message text slots explicitly styled with display block and visibility
//    visible. PLUGIN_CSS is the sole owner since D1 deleted the byte-identical
//    bubbles.yaml copies, so "both sources" is no longer the contract — "the sheet
//    that ships" is.
assert(
  pluginSource.includes("[data-slot='aui_user-message-text']") && pluginSource.includes("[data-slot='aui_user-inline-text']"),
  'plugin.js must explicitly style [data-slot="aui_user-message-text"] and [data-slot="aui_user-inline-text"]'
)

console.log('  ✓ Passed: User message text guaranteed visible across Show more and Show less states')

console.log('\n=== All Final UI Polish Test Assertions Passed Successfully ===\n')
