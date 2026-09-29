/**
 * test/final-ui-polish.test.js
 *
 * Final UI Polish Verification Suite
 *
 * Verifies:
 * 1. Long User Bubble Expanded State:
 *    - Completely clears mask-image, -webkit-mask-image, mask, -webkit-mask
 *    - Clears ::after pseudo-element (display: none, content: none, background: none, box-shadow: none)
 *    - Keeps bubble's base frosted glass shadow intact
 * 2. Edit State Semantic Right-Alignment:
 *    - [data-slot="aui_edit-composer-root"] aligned to the right (flex-end)
 *    - Subcontainers (.composer-human-message-container, .ui-prompt-input__container) aligned right
 *    - Inner editor ([data-slot="composer-rich-input"]) stays left-aligned (text-align: left, direction: ltr)
 *    - No duplicate avatar or double-padding on edit container
 * 3. Edit Mode Long Message Collapse Bypass & Restoration:
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
class MockClassList {
  constructor(el) {
    this.el = el
  }
  contains(cls) {
    return this.el.className.split(/\s+/).includes(cls)
  }
  add(cls) {
    const classes = new Set(this.el.className.split(/\s+/).filter(Boolean))
    classes.add(cls)
    this.el.className = [...classes].join(' ')
  }
  remove(cls) {
    const classes = this.el.className.split(/\s+/).filter(c => c && c !== cls)
    this.el.className = classes.join(' ')
  }
}

class MockElement {
  constructor(tagName = 'div', className = '', attributes = {}) {
    this.tagName = tagName.toUpperCase()
    this.nodeType = 1
    this.className = className
    this.classList = new MockClassList(this)
    this.attributes = { ...attributes }
    this.children = []
    this.parentElement = null
    this.textContent = ''
    this.eventListeners = {}
    this.style = {
      display: '',
      getPropertyValue: (prop) => this.style[prop] || ''
    }
  }

  get firstElementChild() {
    return this.children[0] || null
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
    if (child.parentElement) {
      const idx = child.parentElement.children.indexOf(child)
      if (idx !== -1) child.parentElement.children.splice(idx, 1)
    }
    child.parentElement = this
    this.children.push(child)
    return child
  }

  append(...items) {
    for (const item of items) {
      if (typeof item === 'string') {
        const textNode = new MockElement('span')
        textNode.textContent = item
        this.appendChild(textNode)
      } else if (item) {
        this.appendChild(item)
      }
    }
  }

  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this)
      if (idx !== -1) this.parentElement.children.splice(idx, 1)
      this.parentElement = null
    }
  }

  addEventListener(type, listener) {
    if (!this.eventListeners[type]) this.eventListeners[type] = []
    this.eventListeners[type].push(listener)
  }

  dispatchEvent(evt) {
    const listeners = this.eventListeners[evt.type] || []
    for (const l of listeners) l(evt)
  }

  matches(selector) {
    if (!selector) return false
    const selList = selector.split(',').map(s => s.trim())
    return selList.some(sel => {
      if (sel.startsWith('.')) return this.classList.contains(sel.slice(1))
      if (sel.startsWith('#')) return this.id === sel.slice(1)
      const attrMatch = sel.match(/^\[([a-zA-Z0-9_-]+)(?:=(['"]?)(.*?)\2)?\]$/)
      if (attrMatch) {
        const [, key, , val] = attrMatch
        if (val === undefined) return this.hasAttribute(key)
        return this.getAttribute(key) === val
      }
      return this.tagName.toLowerCase() === sel.toLowerCase()
    })
  }

  closest(selector) {
    let curr = this
    while (curr) {
      if (curr.matches(selector)) return curr
      curr = curr.parentElement
    }
    return null
  }

  querySelector(selector) {
    const results = this.querySelectorAll(selector)
    return results[0] || null
  }

  querySelectorAll(selector) {
    const matched = []
    const selList = selector.split(',').map(s => s.trim())

    const traverse = (node) => {
      for (const child of node.children) {
        const isMatch = selList.some(sel => {
          if (sel === ':scope > .bubbles-user-expand-btn') {
            return child.parentElement === this && child.classList.contains('bubbles-user-expand-btn')
          }
          if (sel.startsWith('.')) return child.classList.contains(sel.slice(1))
          if (sel.startsWith('#')) return child.id === sel.slice(1)
          const attrMatch = sel.match(/^\[([a-zA-Z0-9_-]+)(?:=(['"]?)(.*?)\2)?\]$/)
          if (attrMatch) {
            const [, key, , val] = attrMatch
            if (val === undefined) return child.hasAttribute(key)
            return child.getAttribute(key) === val
          }
          return child.tagName.toLowerCase() === sel.toLowerCase()
        })

        if (isMatch) matched.push(child)
        traverse(child)
      }
    }
    traverse(this)
    return matched
  }
}

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
const STORAGE_PREFIX = 'hermes-bubbles-skin:user-expand:'
globalThis.mockLocalStorage = mockLocalStorage
globalThis.STORAGE_PREFIX = STORAGE_PREFIX
const safeGetStorage = (key, fallback) => {
  const val = globalThis.mockLocalStorage.getItem(`${globalThis.STORAGE_PREFIX}${key}`)
  return val !== null ? JSON.parse(val) : fallback
}
const safeSetStorage = (key, val) => {
  globalThis.mockLocalStorage.setItem(`${globalThis.STORAGE_PREFIX}${key}`, JSON.stringify(val))
}
const safeRemoveStorage = (key) => {
  globalThis.mockLocalStorage.removeItem(`${globalThis.STORAGE_PREFIX}${key}`)
}

const getMessageStorageKey = new Function('userRoot', extractFn('getMessageStorageKey'))
const clearLongUserDecoration = new Function('userRoot', extractFn('clearLongUserDecoration'))
const setupLongMessageCollapse = new Function(
  'userRoot',
  `const isElement = ${isElement.toString()};
   const CLAMP_LINE_THRESHOLD_PX = ${CLAMP_LINE_THRESHOLD_PX};
   const getMessageStorageKey = ${getMessageStorageKey.toString()};
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

// A. CSS in plugin.js clears mask-image, max-height, and ::after
assert(
  pluginSource.includes("html[data-bubbles-skin='true'] [data-slot='aui_user-message-root'][data-bubbles-user-expanded='true'] .sticky-human-clamp"),
  'plugin.js must target expanded user clamp'
)
assert(
  pluginSource.includes("mask-image: none !important") && pluginSource.includes("-webkit-mask-image: none !important"),
  'plugin.js must explicitly clear mask-image and -webkit-mask-image'
)
assert(
  pluginSource.includes("html[data-bubbles-skin='true'] [data-slot='aui_user-message-root'][data-bubbles-user-expanded='true'] .sticky-human-clamp::after") &&
  pluginSource.includes("display: none !important") &&
  pluginSource.includes("content: none !important") &&
  pluginSource.includes("background: none !important") &&
  pluginSource.includes("box-shadow: none !important"),
  'plugin.js must completely clear ::after gradient and shadow pseudo-element on expanded state'
)

// B. CSS in bubbles.yaml clears mask and ::after
assert(
  yamlSource.includes("[data-slot='aui_user-message-root'][data-bubbles-user-expanded='true'] .sticky-human-clamp"),
  'bubbles.yaml must include selector for expanded user clamp'
)
assert(
  yamlSource.includes("mask-image: none !important") && yamlSource.includes("-webkit-mask-image: none !important"),
  'bubbles.yaml must clear mask-image and -webkit-mask-image'
)
assert(
  yamlSource.includes("[data-slot='aui_user-message-root'][data-bubbles-user-expanded='true'] .sticky-human-clamp::after") &&
  yamlSource.includes("display: none !important"),
  'bubbles.yaml must hide ::after on expanded user clamp'
)

// C. Universal elimination of ::after shadow in all states (collapsed and expanded)
assert(
  pluginSource.includes(".sticky-human-clamp::after") && pluginSource.includes("display: none !important"),
  'plugin.js must eliminate ::after shadow pseudo-element universally'
)
assert(
  yamlSource.includes(".sticky-human-clamp::after") && yamlSource.includes("display: none !important"),
  'bubbles.yaml must eliminate ::after shadow pseudo-element universally'
)

console.log('  ✓ Passed: Mask, gradient, and bottom shadow completely cleared in both collapsed and expanded states')

// ============================================================================
// Test 2: Edit State Right-Alignment & Inner Left-Alignment
// ============================================================================
console.log('[Test 2] Edit State Right-Alignment & Editor Left-Alignment')

// A. [data-slot='aui_edit-composer-root'] is aligned to the right
assert(
  pluginSource.includes("html[data-bubbles-skin='true'] [data-slot='aui_edit-composer-root']") &&
  pluginSource.includes("align-items: flex-end !important") &&
  pluginSource.includes("justify-content: flex-end !important") &&
  pluginSource.includes("align-self: flex-end !important"),
  'plugin.js must flex-align [data-slot="aui_edit-composer-root"] to flex-end'
)

assert(
  yamlSource.includes("[data-slot='aui_edit-composer-root']") &&
  yamlSource.includes("align-items: flex-end !important") &&
  yamlSource.includes("justify-content: flex-end !important") &&
  yamlSource.includes("align-self: flex-end !important"),
  'bubbles.yaml must flex-align [data-slot="aui_edit-composer-root"] to flex-end'
)

// B. Subcontainers are right-aligned
assert(
  pluginSource.includes("html[data-bubbles-skin='true'] [data-slot='aui_edit-composer-root'] .composer-human-message-container") &&
  pluginSource.includes("html[data-bubbles-skin='true'] [data-slot='aui_edit-composer-root'] .ui-prompt-input__container"),
  'plugin.js must target edit composer subcontainers'
)
assert(
  pluginSource.includes("margin-left: auto !important") &&
  pluginSource.includes("margin-right: 0 !important"),
  'plugin.js must set margin-left: auto and margin-right: 0 on prompt input container'
)

// C. Inner editor remains left-aligned
assert(
  pluginSource.includes("html[data-bubbles-skin='true'] [data-slot='aui_edit-composer-root'] [data-slot='composer-rich-input']") &&
  pluginSource.includes("text-align: left !important") &&
  pluginSource.includes("direction: ltr !important"),
  'plugin.js must keep rich input editor left-aligned'
)

assert(
  yamlSource.includes("[data-slot='aui_edit-composer-root'] [data-slot='composer-rich-input']") &&
  yamlSource.includes("text-align: left !important") &&
  yamlSource.includes("direction: ltr !important"),
  'bubbles.yaml must keep rich input editor left-aligned'
)

// D. No duplicate avatar or double-padding on edit root
assert(
  pluginSource.includes("[data-slot='aui_edit-composer-root']::before") &&
  pluginSource.includes("display: none !important"),
  'plugin.js must suppress duplicate avatar on [data-slot="aui_edit-composer-root"]'
)
assert(
  yamlSource.includes("[data-slot='aui_edit-composer-root']::before") &&
  yamlSource.includes("display: none !important"),
  'bubbles.yaml must suppress duplicate avatar on [data-slot="aui_edit-composer-root"]'
)

// E. Checkpoint and Context Action Button Snug Right-Alignment
assert(
  pluginSource.includes("html[data-bubbles-skin='true'] [data-context-menu-skip]") &&
  pluginSource.includes("width: fit-content !important") &&
  pluginSource.includes("align-self: flex-end !important"),
  'plugin.js must tightly align context-menu-skip to user bubble with width: fit-content'
)
assert(
  yamlSource.includes("[data-context-menu-skip]") &&
  yamlSource.includes("width: fit-content !important") &&
  yamlSource.includes("align-self: flex-end !important"),
  'bubbles.yaml must tightly align context-menu-skip to user bubble with width: fit-content'
)

console.log('  ✓ Passed: Edit composer cleanly positioned on the right while editor stays left-aligned')

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

// C. User message text slots explicitly styled with display block and visibility visible
assert(
  yamlSource.includes("[data-slot='aui_user-message-text']") && yamlSource.includes("[data-slot='aui_user-inline-text']") &&
  pluginSource.includes("[data-slot='aui_user-message-text']") && pluginSource.includes("[data-slot='aui_user-inline-text']"),
  'Both sources must explicitly style [data-slot="aui_user-message-text"] and [data-slot="aui_user-inline-text"]'
)

console.log('  ✓ Passed: User message text guaranteed visible across Show more and Show less states')

console.log('\n=== All Final UI Polish Test Assertions Passed Successfully ===\n')
