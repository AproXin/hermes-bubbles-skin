/**
 * Hermes Bubbles Skin — Desktop Plugin (Phase 3 Complete Agent Loop Edition)
 *
 * Source: src/plugin.js
 * DO NOT EDIT plugin.js or desktop/plugin.js DIRECTLY. Edit this source file,
 * then run `node scripts/sync.js` to compile artifacts.
 *
 * Architecture:
 * ├── 1. Constants, Styles & State (Scoped under html[data-bubbles-skin='true'])
 * ├── 2. DOM Helpers & Storage
 * ├── 3. Conversation Module (User Collapse, Assistant Deepening & Spacing)
 * ├── 4. Thinking & Tool Call Scaffolding (Subordinate Visual Hierarchy)
 * ├── 5. Task Module (Dynamic Header Counter, Pulse Animation, Isolated Scroll)
 * ├── 6. Approval & Clarify UX Module (Frosted Glass Floating Cards, Action Hierarchy)
 * ├── 7. Observer Module (Idempotent RAF Batching & Debug Stats)
 * └── 8. Lifecycle & Registration (Zero-leak re-enable guarantee)
 */

// ============================================================================
// 1. CONSTANTS, STYLES & STATE
// ============================================================================

const ID = 'hermes-bubbles-skin'
const STYLE_ID = `${ID}-runtime-styles`
const BUILD_ID = '5.1.0'
/* Two namespaces, one per persisted thing. The caller owns the full key: the storage
 * helpers used to prepend `user-expand` to whatever they were handed, which made tool
 * groups land in the message-collapse namespace (and, because the host pluginStorage
 * path never added that prefix, meant the two backends disagreed about where a value
 * lives). A key that is complete at the call site cannot be namespaced twice. */
const USER_EXPAND_NS = `${ID}:user-expand:`
const TOOL_GROUP_NS = `${ID}:tool-group:`
const CLAMP_LINE_THRESHOLD_PX = 110 // ~4-5 lines of text

/* Session rows live in the chat sidebar and nowhere else. '.row-hover' is a shared
 * utility used by ~11 other surfaces (right-sidebar file trees, cron, messaging,
 * settings credential rows, capabilities catalog, session switcher, overlay panels,
 * changed-files card, and the composer's own status-row), so an unscoped probe
 * stamped all of them: sidebar row chrome got painted onto unrelated lists, and
 * hovering a file row opened the session preview.
 * components/ui/sidebar.tsx:150 is the only renderer of data-slot="sidebar", and
 * only app/chat/sidebar/* imports that primitive — so the ancestor is a real
 * boundary, not a guess. The gate is an explicit closest() rather than a descendant
 * selector: the picker and the hover handlers run in a MutationObserver hot path,
 * and the audit suites drive them through a mock DOM whose matches() cannot parse
 * combinators at all. */
const SIDEBAR_SELECTOR = '[data-slot="sidebar"]'
const SESSION_ROW_PROBE = '.row-hover, [data-row-actions]'

/** The .row-hover shell for an element, but only when it sits in the sidebar. */
const sessionRowShell = el => {
  const shell = el?.classList?.contains('row-hover') ? el : el?.closest?.('.row-hover')
  return shell && shell.closest?.(SIDEBAR_SELECTOR) ? shell : null
}

/** Also accepts an already-stamped row, so a hover still answers in the window
 *  between the pointer event and the pass that stamps it. */
const closestSessionRow = el => sessionRowShell(el) || el?.closest?.('[data-bubbles-session-row="true"]') || null

let pluginStorage = null

// Zero-overhead debugging metrics accessible via `window.__hermesBubblesSkinStats`
const stats = {
  observerCallbacks: 0,
  sidebarClassCallbacks: 0,
  enhancedMessages: 0,
  taskRefreshes: 0,
  toolRefreshes: 0,
  toolGroupRefreshes: 0,
  // Per-stage failures from runStage(). A stage that throws is otherwise silent:
  // the symptom is only "some surface never appears", with nothing in the console.
  stageErrors: {},
  lastStageError: null,
  approvalRefreshes: 0,
  clarifyRefreshes: 0,
  sessionRefreshes: 0,
  previewShows: 0,
  lastBatchDurationMs: 0,
  retiredStorageKeys: 0
}

if (typeof globalThis !== 'undefined') {
  globalThis.__hermesBubblesSkinStats = stats
}

const PLUGIN_CSS = `
/* __PLUGIN_CSS_BODY__ */
`

// ============================================================================
// 2. DOM HELPERS & STORAGE
// ============================================================================

function isElement(node) {
  return Boolean(node && node.nodeType === 1)
}

function safeGetStorage(key, fallback) {
  if (pluginStorage && typeof pluginStorage.get === 'function') {
    try {
      return pluginStorage.get(key, fallback)
    } catch {
      // Fallback
    }
  }
  try {
    const val = localStorage.getItem(key)
    return val !== null ? JSON.parse(val) : fallback
  } catch {
    return fallback
  }
}

function safeSetStorage(key, value) {
  if (pluginStorage && typeof pluginStorage.set === 'function') {
    try {
      pluginStorage.set(key, value)
      return
    } catch {
      // Fallback
    }
  }
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore quota errors
  }
}

function safeRemoveStorage(key) {
  if (pluginStorage && typeof pluginStorage.remove === 'function') {
    try {
      pluginStorage.remove(key)
      return
    } catch {
      // Fallback
    }
  }
  try {
    localStorage.removeItem(key)
  } catch {
    // Ignore
  }
}

/* Retire the keys the pre-D3 helper produced when it prefixed a key that already carried
   a namespace: `hermes-bubbles-skin:user-expand:hermes-bubbles-skin:tool-group:…`. Nothing
   reads that shape any more and nothing could, so it is pure garbage — and it only ever
   existed in localStorage, because the host pluginStorage path never added a prefix.

   Deliberately narrow. Keys whose element happens to be absent from THIS document are left
   alone: storage spans every session while the DOM holds one transcript at a time, so "not
   on screen" is not "gone for good", and sweeping on that rule would erase the expanded
   state of every other session on boot. Real expiry needs a timestamp, which is a storage
   schema change and was ruled out of this pass. */
function sweepRetiredStorageKeys() {
  const retiredShape = new RegExp(`^${ID}:[\\w-]+:${ID}:`)
  const stale = []
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key && retiredShape.test(key)) stale.push(key)
    }
    for (const key of stale) localStorage.removeItem(key)
  } catch {
    // A blocked or private store has nothing to reclaim either way.
  }
  stats.retiredStorageKeys = stale.length
  return stale.length
}

// ============================================================================
// 3. CONVERSATION MODULE
// ============================================================================

function enhanceUserMessage(userRoot) {
  if (!isElement(userRoot)) return

  // Idempotent attribute stamp
  if (userRoot.getAttribute('data-bubbles-user-message') !== 'true') {
    userRoot.setAttribute('data-bubbles-user-message', 'true')
    userRoot.setAttribute('data-bubbles-role', 'user')
    stats.enhancedMessages += 1
  }

  setupLongMessageCollapse(userRoot)
}

function enhanceAssistantMessage(assistantRoot) {
  if (!isElement(assistantRoot)) return

  // Idempotent attribute stamp
  if (assistantRoot.getAttribute('data-bubbles-assistant-message') !== 'true') {
    assistantRoot.setAttribute('data-bubbles-assistant-message', 'true')
    assistantRoot.setAttribute('data-bubbles-role', 'assistant')
    stats.enhancedMessages += 1
  }
}

function getMessageStorageKey(userRoot) {
  /* The namespace belongs to the key, not to the storage helper: the same helper also
     carries tool-group state, and prefixing it centrally is what put tool groups inside
     the message-collapse namespace. */
  const messageId = userRoot.getAttribute('data-message-id') || userRoot.id
  if (messageId) return `${USER_EXPAND_NS}${messageId}`
  const text = userRoot.textContent?.trim() || ''
  return text ? `${USER_EXPAND_NS}hash_${text.slice(0, 48).replace(/\s+/g, '_')}` : null
}

function setupLongMessageCollapse(userRoot) {
  const isEditing = Boolean(
    userRoot.matches?.('[data-slot="aui_edit-composer-root"]') ||
    userRoot.closest?.('[data-slot="aui_edit-composer-root"]') ||
    userRoot.querySelector?.('[data-slot="aui_edit-composer-root"], [data-slot="composer-rich-input"], .ui-prompt-input-editor__input')
  )

  const clamp = userRoot.querySelector('.sticky-human-clamp')
  const bubble = clamp?.closest('.composer-human-message')
  const contextSkip = bubble?.closest('[data-context-menu-skip]')

  if (isEditing) {
    if (userRoot.getAttribute('data-bubbles-editing') !== 'true') {
      userRoot.setAttribute('data-bubbles-editing', 'true')
    }
    if (userRoot.getAttribute('data-bubbles-user-expanded') !== 'true') {
      userRoot.setAttribute('data-bubbles-user-expanded', 'true')
    }
    const btn = userRoot.querySelector('.bubbles-user-expand-btn')
    if (btn && btn.style) {
      btn.style.display = 'none'
    }
    return
  } else if (userRoot.hasAttribute('data-bubbles-editing')) {
    userRoot.removeAttribute('data-bubbles-editing')
    const storageKey = getMessageStorageKey(userRoot)
    const prevExpanded = storageKey ? Boolean(safeGetStorage(storageKey, false)) : false
    if (prevExpanded) {
      userRoot.setAttribute('data-bubbles-user-expanded', 'true')
    } else {
      userRoot.removeAttribute('data-bubbles-user-expanded')
    }
    const btn = userRoot.querySelector('.bubbles-user-expand-btn')
    if (btn && btn.style) {
      btn.style.display = ''
    }
  }

  if (!clamp || !bubble || !contextSkip) {
    clearLongUserDecoration(userRoot)
    return
  }

  const inner = clamp.firstElementChild
  const measuredHeight = Number.parseFloat(clamp.style.getPropertyValue('--human-msg-full'))
  const batched = clampHeightBatch && clampHeightBatch.has(userRoot)
    ? clampHeightBatch.get(userRoot)
    : null
  const fullHeight = Number.isFinite(measuredHeight) && measuredHeight > 0
    ? measuredHeight
    : (Number.isFinite(batched) && batched > 0 ? batched
      : inner?.scrollHeight || clamp.scrollHeight || 0)

  // Check if content exceeds threshold (~4-5 lines)
  if (fullHeight <= CLAMP_LINE_THRESHOLD_PX) {
    clearLongUserDecoration(userRoot)
    return
  }

  if (userRoot.getAttribute('data-bubbles-long-user') !== 'true') {
    userRoot.setAttribute('data-bubbles-long-user', 'true')
  }

  const storageKey = getMessageStorageKey(userRoot)
  const isExpanded = storageKey ? Boolean(safeGetStorage(storageKey, false)) : false

  if (isExpanded) {
    if (userRoot.getAttribute('data-bubbles-user-expanded') !== 'true') {
      userRoot.setAttribute('data-bubbles-user-expanded', 'true')
    }
  } else {
    if (userRoot.hasAttribute('data-bubbles-user-expanded')) {
      userRoot.removeAttribute('data-bubbles-user-expanded')
    }
  }

  let expandBtn = userRoot.querySelector('.bubbles-user-expand-btn')
  if (!expandBtn) {
    expandBtn = document.createElement('button')
    expandBtn.type = 'button'
    expandBtn.className = 'bubbles-user-expand-btn'
    expandBtn.setAttribute('data-bubbles-user-expand', 'true')

    const labelSpan = document.createElement('span')
    labelSpan.className = 'bubbles-expand-label'
    labelSpan.textContent = isExpanded ? 'Show less' : 'Show more'

    const chevronSpan = document.createElement('span')
    chevronSpan.className = 'bubbles-expand-chevron'
    chevronSpan.setAttribute('aria-hidden', 'true')

    expandBtn.append(labelSpan, chevronSpan)

    // Crucial: stop propagation to prevent triggering edit mode or drag/drop
    expandBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
    })
    expandBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()

      const currentExpanded = userRoot.getAttribute('data-bubbles-user-expanded') === 'true'
      const nextExpanded = !currentExpanded

      if (nextExpanded) {
        userRoot.setAttribute('data-bubbles-user-expanded', 'true')
        labelSpan.textContent = 'Show less'
        if (storageKey) safeSetStorage(storageKey, true)
      } else {
        userRoot.removeAttribute('data-bubbles-user-expanded')
        labelSpan.textContent = 'Show more'
        if (storageKey) safeRemoveStorage(storageKey)
      }
    })

    bubble.appendChild(expandBtn)
  } else {
    if (expandBtn.parentElement !== bubble) {
      bubble.appendChild(expandBtn)
    }
    if (expandBtn.style && expandBtn.style.display === 'none') {
      expandBtn.style.display = ''
    }
    const labelSpan = expandBtn.querySelector('.bubbles-expand-label')
    if (labelSpan) {
      const expectedText = isExpanded ? 'Show less' : 'Show more'
      if (labelSpan.textContent !== expectedText) {
        labelSpan.textContent = expectedText
      }
    }
  }
}

function clearLongUserDecoration(userRoot) {
  if (userRoot.hasAttribute('data-bubbles-long-user')) {
    userRoot.removeAttribute('data-bubbles-long-user')
  }
  if (userRoot.hasAttribute('data-bubbles-user-expanded')) {
    userRoot.removeAttribute('data-bubbles-user-expanded')
  }
  if (userRoot.hasAttribute('data-bubbles-editing')) {
    userRoot.removeAttribute('data-bubbles-editing')
  }
  const btn = userRoot.querySelector('.bubbles-user-expand-btn')
  if (btn) btn.remove()
}

// ============================================================================
// 4. THINKING & TOOL CALL MODULE
// ============================================================================

function enhanceThinkingBlock(thinkingEl) {
  if (!isElement(thinkingEl)) return
  if (thinkingEl.getAttribute('data-bubbles-thinking') !== 'true') {
    thinkingEl.setAttribute('data-bubbles-thinking', 'true')
  }
}

/* The host puts every header verdict in one place: fallback.tsx:257 wraps the
   glyph node in TOOL_HEADER_GLYPH_WRAP_CLASS (`span.grid.size-3.5`), and both the
   braille spinner (:200-207) and the error AlertCircle (:210) go through it. Read
   that cell, never the whole header row — the row also carries the title, and a
   title is command- or path-derived text, so one braille character in it used to
   pin a finished tool to "running" forever.
   Everything below stays inline inside detectToolState on purpose: several suites
   eval this one function's source in isolation, so a top-level helper would be
   undefined there. test/tool-state-detection.test.js runs the real module. */
function detectToolState(toolBlock) {
  if (!isElement(toolBlock)) return 'completed'

  // 1. Running check (highest priority: running > failed > completed)
  //    Only signals the renderer actually emits. An earlier version also read
  //    data-tool-state / data-tool-pending / data-spinner / data-glyph-spinner;
  //    none of those exist in apps/desktop/src (test/host-selector-drift.test.js
  //    is what proves it), so those branches could never fire.
  if (
    toolBlock.querySelector('.animate-spin, .codicon-loading, .status-row-icon.animate-spin')
  ) {
    return 'running'
  }

  // The braille frames of glyph-spinner.tsx:96-110 are ALL in the DOM from mount
  // (a transform keyframe scrolls between them), so this text test is the only
  // thing that detects the host's spinner — `.animate-spin` never matches it.
  const headerRow = toolBlock.querySelector('.status-row-icon, .group\\/disclosure-row, [data-slot="tool-row"]')
  let glyphCell = null
  if (headerRow) {
    glyphCell = headerRow.classList?.contains('status-row-icon')
      ? headerRow
      : headerRow.querySelector('.status-row-icon, .grid.size-3\\.5')
  }
  if (glyphCell && /[\u2800-\u28FF]/.test(glyphCell.textContent || '')) {
    return 'running'
  }

  // 2. Failed check. The renderer has no error ATTRIBUTE — fallback.tsx expresses
  //    a failure through the glyph (AlertCircle, :210), the title class (:320) and
  //    the body error block (:676), all of which are covered below.
  // Status icon error checks (AlertCircle, codicon-error, text-destructive on status icon)
  if (glyphCell) {
    const errorIcon = glyphCell.querySelector(
      'svg.text-destructive, .codicon-error, [aria-label*="error" i], [aria-label*="failed" i], .status-row-icon.text-destructive'
    )
    if (errorIcon) {
      return 'failed'
    }
  }

  // Destructive classes. Every match is examined, not just the first: a red line
  // inside a <pre> earlier in the document used to hide a real error marker later.
  for (const destructive of toolBlock.querySelectorAll('.text-destructive, .bg-destructive')) {
    if (typeof destructive.closest !== 'function') return 'failed'
    // A node owned by a nested tool block is that block's verdict, not ours.
    if (destructive.closest('[data-slot="tool-block"]') !== toolBlock) continue
    if (destructive.closest('[data-slot="file-diff-panel"], [data-slot="diff-lines"], [data-slot="diff-skeleton"], [class*="tabular-nums"], pre, code, .diff-stat')) continue
    return 'failed'
  }

  // 3. No marker. This is the host's own done state, not a missing verdict:
  //    fallback.tsx:262 says "Success is silent — the row reads as done without a
  //    checkmark", and ToolGlyph returns null when the tool has no status, no file
  //    and no icon. An unmarked row therefore means completed, and adding an
  //    'unknown' tier here would only invent a state the renderer never emits.
  return 'completed'
}

// Cache the last state observed for a native ToolRun while its children were
// mounted. React unmounts the children when the run collapses, so a failure
// would otherwise be re-detected as 'completed' (red frame -> blue frame).
const toolRunStateCache = new WeakMap()

function enhanceToolBlock(toolBlock) {
  if (!isElement(toolBlock)) return
  if (toolBlock.getAttribute('data-bubbles-tool') !== 'true') {
    toolBlock.setAttribute('data-bubbles-tool', 'true')
  }
  if (toolBlock.getAttribute('data-bubbles-tool-flat') !== 'true') {
    toolBlock.setAttribute('data-bubbles-tool-flat', 'true')
  }
  let state = detectToolState(toolBlock)
  if (toolBlock.hasAttribute('data-tool-group')) {
    // Children are mounted while expanded; refresh the cached verdict then.
    // When collapsed (no child rows), keep the verdict seen while expanded.
    if (typeof toolBlock.querySelector === 'function' && toolBlock.querySelector('[data-tool-row]')) {
      toolRunStateCache.set(toolBlock, state)
    } else {
      state = toolRunStateCache.get(toolBlock) || state
    }
  }
  if (toolBlock.getAttribute('data-bubbles-tool-state') !== state) {
    toolBlock.setAttribute('data-bubbles-tool-state', state)
    stats.toolRefreshes += 1
  }
}

function cleanToolTitle(raw) {
  if (!raw || typeof raw !== 'string') return ''
  let text = raw.trim()

  // 1. Remove leading/trailing bullet or status glyphs: ▸, •, ✓, ✕, ◉, etc.
  text = text.replace(/^[▸•✓✕◉\s\-\:]+/, '').replace(/[▸•✓✕◉\s\-\:]+$/, '').trim()

  // 2. Handle embedded count/result/duration label: e.g. "Skill Manage1 resultSkill Manage"
  const countPattern = /\d+\s*(?:results|result|entries|entry|files|file|items|item|lines|line|ms|s)(?=[A-Z\s\d_-]|$|[^a-zA-Z0-9])/i
  if (countPattern.test(text)) {
    const parts = text.split(countPattern).map(s => s.trim()).filter(Boolean)
    if (parts.length > 0) {
      text = parts[0]
    }
  }

  // 3. Remove trailing count/result/duration: e.g. "search_files 3 results", "read_file 12ms"
  text = text.replace(/\s*\d+\s*(?:results?|entries?|files?|items?|lines?|ms|s)$/i, '').trim()

  // 4. Halving deduplication: e.g. "已加载技能已加载技能" (even length exact duplicate)
  const len = text.length
  if (len >= 4 && len % 2 === 0) {
    const half = len / 2
    if (text.slice(0, half) === text.slice(half)) {
      text = text.slice(0, half)
    }
  }

  // 5. Space-separated repetition: e.g. "Skill Manage Skill Manage"
  const spaceMatch = text.match(/^(.{2,})\s+\1$/)
  if (spaceMatch) {
    text = spaceMatch[1]
  }

  // 6. Delimiter-separated repetition: e.g. "write_file / write_file"
  const delimMatch = text.match(/^(.{2,})\s*[\/\|\-]\s*\1$/)
  if (delimMatch) {
    text = delimMatch[1]
  }

  // 7. General substring 2x repetition (for odd lengths or variable splits)
  for (let k = 2; k <= Math.floor(text.length / 2); k++) {
    const sub = text.slice(0, k)
    if (text === sub + sub) {
      text = sub
      break
    }
  }

  return text.trim().slice(0, 40)
}

if (typeof globalThis !== 'undefined') {
  globalThis.cleanToolTitle = cleanToolTitle
}

function getToolTitle(toolBlock) {
  if (!isElement(toolBlock)) return ''

  const sanitize = typeof cleanToolTitle === 'function' ? cleanToolTitle : (s) => (s || '').trim()

  // There used to be a step 1 here reading data-tool-name / data-tool-title /
  // data-call-name off the block and its descendants. The renderer emits none of
  // them (test/host-selector-drift.test.js), so the step could only ever fall
  // through — and a fallback chain that starts with a branch that never fires
  // reads as coverage where there is none.

  // 1. aria-label on toolBlock or disclosure button
  const aria = toolBlock.getAttribute('aria-label') ||
    toolBlock.querySelector?.('button[aria-expanded], .group\\/disclosure-row button')?.getAttribute('aria-label')
  if (aria && typeof aria === 'string' && !/^(tool|disclosure|expand|collapse|toggle|close)$/i.test(aria.trim())) {
    const cleanAria = sanitize(aria.replace(/^(?:run|call|executing|executed)?\s*(?:tool)?\s*[:\-]?\s*/i, ''))
    if (cleanAria && cleanAria !== 'tool') return cleanAria
  }

  // 2. Explicit title / name element. Hermes' ToolTitle renders a FadeText with
  //    the scaffold label class and no data-slot of its own, so the class
  //    fragments are the live path; the tool-title / tool-name /
  //    tool-fallback-title slots that used to head this list do not exist.
  const titleSlot = toolBlock.querySelector?.(
    '.tool-title, ' +
    'span[class*="conversation-scaffold-text"], span.FadeText, span[class*="FadeText"], span[class*="fade-text"], ' +
    '[data-conversation-scaffold] span:not([class*="tabular-nums"]):not([class*="shrink-0"]):not(.status-row-icon), ' +
    'span.font-medium, span.font-semibold, strong, code'
  )
  if (titleSlot && titleSlot.textContent?.trim()) {
    const cleaned = sanitize(titleSlot.textContent)
    if (cleaned) return cleaned
  }

  // 3. Header element (inspect header only, NEVER full toolBlock content)
  const headerEl = toolBlock.querySelector?.('header, .group\\/disclosure-row, [data-slot="tool-row"], .status-row-content')
  if (headerEl) {
    const headerTitleEl = headerEl.querySelector?.(
      'span:not([class*="tabular-nums"]):not([class*="shrink-0"]):not(.status-row-icon), strong, code, .font-medium, .font-semibold'
    )
    if (headerTitleEl && headerTitleEl.textContent?.trim()) {
      const cleaned = sanitize(headerTitleEl.textContent)
      if (cleaned) return cleaned
    }
  }

  // 5. Limited fallback (sanitized first line, excluding result/output/status badges)
  const fallbackLine = (headerEl?.textContent || toolBlock.textContent || '').trim().split('\n')[0]
  if (fallbackLine) {
    const cleaned = sanitize(fallbackLine)
    if (cleaned) return cleaned
  }

  return 'Tool'
}

function getToolAnchorId(toolBlock) {
  if (!isElement(toolBlock)) return 'anchor_unknown'
  // The renderer puts no call-id on a tool block, so the element's own id is the
  // only stable handle available; everything else falls back to the anchor we mint.
  if (toolBlock.id) return toolBlock.id

  let anchorId = toolBlock.getAttribute('data-bubbles-tool-anchor-id')
  if (!anchorId) {
    /* Position plus title — never a random token. A random id lives only as long as the
       element does, so every reload minted a fresh one, the group id changed with it,
       and the persisted expanded state could never be found again: the exact case
       groupCompletedTools' own comment claims to survive ("including after a reload").
       (parent, index) is already unique among tool blocks, so the title only makes the
       key readable — an empty or duplicated title cannot collide. */
    const parent = toolBlock.parentElement
    const peers = parent ? [...parent.children].filter(el => el?.getAttribute?.('data-slot') === 'tool-block') : []
    const index = peers.indexOf(toolBlock)
    const slug = getToolTitle(toolBlock).replace(/\s+/g, '_').slice(0, 32)
    anchorId = `anchor_${index === -1 ? 'x' : index}_${slug}`
    toolBlock.setAttribute('data-bubbles-tool-anchor-id', anchorId)
  }
  return anchorId
}

function getToolGroupId(run, parent) {
  const asstRoot = parent.closest('[data-slot="aui_assistant-message-root"]')
  const asstId = asstRoot?.getAttribute('data-message-id') || asstRoot?.id || ''
  const sessionEl = parent.closest('[data-session-id]') || asstRoot?.closest?.('[data-session-id]')
  const sessId = sessionEl?.getAttribute('data-session-id') || ''
  const anchorId = getToolAnchorId(run[0])
  const prefix = sessId ? `${sessId}_` : ''
  return `grp_${prefix}${asstId || 'gen'}_${anchorId}`
}

function groupCompletedTools() {
  // Clean up any headers that were erroneously placed inside a tool block (nested tool block bug)
  for (const h of document.querySelectorAll('[data-slot="tool-block"] .bubbles-tool-group')) {
    h.remove()
  }

  // Clean up any grouping attributes on nested tool blocks
  for (const nested of document.querySelectorAll('[data-slot="tool-block"] [data-slot="tool-block"]')) {
    nested.removeAttribute('data-bubbles-group-collapsed')
    nested.removeAttribute('data-bubbles-in-group')
    nested.removeAttribute('data-bubbles-group-id')
  }

  // Only select top-level tool blocks (exclude tool blocks nested inside another tool block)
  const allTools = [...document.querySelectorAll('[data-slot="tool-block"]')].filter(tool => {
    // A native ToolRun (data-tool-group) is already grouped by Hermes and owns
    // its own ToolRunHeader. Never re-wrap it in a skin pill: when the run
    // collapses, React unmounts its children, which would otherwise make it
    // look like a single completed tool -> skin pill injected, native header
    // hidden, and the failure box reads as "open but won't close".
    return (
      !tool.hasAttribute('data-tool-group') &&
      !tool.parentElement?.closest?.('[data-slot="tool-block"]')
    )
  })

  if (allTools.length === 0) {
    for (const h of document.querySelectorAll('.bubbles-tool-group')) {
      h.remove()
    }
    for (const dh of document.querySelectorAll('[data-bubbles-duplicate-header]')) {
      dh.removeAttribute('data-bubbles-duplicate-header')
    }
    return
  }

  // Clean up any headers that have no completed tools or are orphaned
  for (const h of document.querySelectorAll('.bubbles-tool-group')) {
    const p = h.parentElement
    if (!p || !p.querySelector('[data-slot="tool-block"]')) {
      h.remove()
    }
  }

  // Group tools by parent element
  const parentMap = new Map()
  for (const tool of allTools) {
    const parent = tool.parentElement
    if (!parent) continue
    if (!parentMap.has(parent)) {
      parentMap.set(parent, [])
    }
    parentMap.get(parent).push(tool)
  }

  for (const [parent, tools] of parentMap.entries()) {
    processParentTools(parent, tools)
  }
}

function processParentTools(parent, tools) {
  // Partition into consecutive completed runs
  const runs = []
  let currentRun = []

  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i]
    const state = detectToolState(tool)
    // A completed tool with NO expandable disclosure cannot reveal anything
    // when the pill opens. This happens for a file edit under "Hide code
    // diffs": it renders as a permanent single-line summary (its disclosure
    // button is disabled and has no aria-expanded). Treat it as a non-groupable
    // boundary so the skin never wraps it in an expandable pill — which would
    // show only the 2px accent border (the "blue dot" with no content).
    const isExpandable = Boolean(tool.querySelector('button[aria-expanded]'))

    if (state === 'completed' && isExpandable) {
      if (currentRun.length === 0) {
        currentRun.push(tool)
      } else {
        const lastTool = currentRun[currentRun.length - 1]
        // Check if tool is next sibling element (skipping any existing .bubbles-tool-group)
        let nextSibling = lastTool.nextElementSibling
        while (nextSibling && nextSibling.classList?.contains('bubbles-tool-group')) {
          nextSibling = nextSibling.nextElementSibling
        }
        if (nextSibling === tool) {
          currentRun.push(tool)
        } else {
          runs.push(currentRun)
          currentRun = [tool]
        }
      }
    } else {
      // Non-completed (running/failed) OR non-expandable (summary-only) tool:
      // never collapse it.
      if (currentRun.length > 0) {
        runs.push(currentRun)
        currentRun = []
      }
      // Running, failed, and summary-only tools are NEVER collapsed
      tool.removeAttribute('data-bubbles-group-collapsed')
      tool.removeAttribute('data-bubbles-in-group')
      tool.removeAttribute('data-bubbles-group-id')
      const dupHeader = tool.querySelector?.('[data-bubbles-duplicate-header]')
      if (dupHeader) {
        dupHeader.removeAttribute('data-bubbles-duplicate-header')
      }
    }
  }

  if (currentRun.length > 0) {
    runs.push(currentRun)
  }

  const activeHeaders = new Set()

  for (const run of runs) {
    const firstTool = run[0]
    const groupId = getToolGroupId(run, parent)
    const storageKey = `${TOOL_GROUP_NS}${groupId}`
    const isExpanded = Boolean(safeGetStorage(storageKey, false))

    // Check if there is already a group header right before firstTool
    let header = firstTool.previousElementSibling
    if (!header || !header.classList?.contains('bubbles-tool-group')) {
      header = document.createElement('div')
      header.className = 'bubbles-tool-group'
      header.setAttribute('data-bubbles-tool-group', 'true')
      header.setAttribute('data-bubbles-tool-flat', 'true')

      const toggleBtn = document.createElement('button')
      toggleBtn.type = 'button'
      toggleBtn.className = 'bubbles-tool-group-toggle'
      toggleBtn.setAttribute('data-bubbles-tool-group-toggle', 'true')

      const chevron = document.createElement('span')
      chevron.className = 'bubbles-group-chevron'
      chevron.setAttribute('aria-hidden', 'true')

      const icon = document.createElement('span')
      icon.className = 'bubbles-group-icon'
      icon.textContent = '✓'

      const label = document.createElement('span')
      label.className = 'bubbles-group-label'

      toggleBtn.append(chevron, icon, label)
      header.appendChild(toggleBtn)

      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        const currentHeader = toggleBtn.closest('.bubbles-tool-group')
        const currentExpanded = currentHeader?.getAttribute('data-group-state') === 'expanded'
        const nextExpanded = !currentExpanded

        currentHeader?.setAttribute('data-group-state', nextExpanded ? 'expanded' : 'collapsed')
        toggleBtn.setAttribute('aria-expanded', String(nextExpanded))

        // Update all tools in this group
        const targetGroupId = currentHeader?.getAttribute('data-group-id')
        if (targetGroupId && currentHeader?.parentElement) {
          const groupedTools = currentHeader.parentElement.querySelectorAll(`[data-bubbles-group-id="${targetGroupId}"]`)

          // Focus Safety: If collapsing and active focus is inside any tool, safely transfer focus to toggleBtn
          if (!nextExpanded && typeof document !== 'undefined' && document.activeElement) {
            const hasFocusInside = Array.from(groupedTools).some(tool => {
              return typeof tool.contains === 'function' ? tool.contains(document.activeElement) : tool === document.activeElement
            })
            if (hasFocusInside && typeof toggleBtn.focus === 'function') {
              toggleBtn.focus()
            }
          }

          for (const gt of groupedTools) {
            gt.setAttribute('data-bubbles-group-collapsed', nextExpanded ? 'false' : 'true')

            // Sync the native ToolEntry disclosure(s) inside this ToolRun.
            // The skin pill replaces the native header in single-tool groups,
            // but the detail body only mounts when the ToolEntry's own
            // disclosure is open. Drive the native toggle (which runs React's
            // open state) so the command details actually render.
            const nativeToggles = gt.querySelectorAll(
              ".group\\/disclosure-row button[aria-expanded], button.group\\/disclosure-row, " +
              "header button[aria-expanded]"
            )
            for (const nt of nativeToggles) {
              const nativeOpen = nt.getAttribute('aria-expanded') === 'true'
              if (nativeOpen !== nextExpanded && typeof nt.click === 'function') {
                nt.click()
              }
            }
          }
        }

        // Persist to storage
        const currentKey = currentHeader?.getAttribute('data-storage-key')
        if (currentKey) {
          if (nextExpanded) {
            safeSetStorage(currentKey, true)
          } else {
            safeRemoveStorage(currentKey)
          }
        }
      })

      parent.insertBefore(header, firstTool)
      stats.toolGroupRefreshes += 1
    }

    activeHeaders.add(header)
    header.setAttribute('data-group-id', groupId)
    header.setAttribute('data-storage-key', storageKey)
    header.setAttribute('data-group-state', isExpanded ? 'expanded' : 'collapsed')
    header.setAttribute('data-tool-count', String(run.length))

    const toggleBtn = header.querySelector('.bubbles-tool-group-toggle')
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', String(isExpanded))
      const icon = toggleBtn.querySelector('.bubbles-group-icon')
      const label = toggleBtn.querySelector('.bubbles-group-label')
      if (label) {
        if (run.length === 1) {
          const title = getToolTitle(run[0]) || 'Tool'
          if (icon) {
            icon.textContent = '✓'
            if (icon.style) icon.style.display = 'inline-flex'
          }
          if (label.textContent !== title) {
            label.textContent = title
          }
        } else {
          const countText = `${run.length} tools completed`
          if (icon) {
            icon.textContent = ''
            if (icon.style) icon.style.display = 'none'
          }
          if (label.textContent !== countText) {
            label.textContent = countText
          }
        }
      }
    }

    // Mark or unmark duplicate native header for single vs multi tools
    if (run.length === 1) {
      const singleTool = run[0]
      const nativeHeader = singleTool.querySelector?.('header, [data-slot="tool-row"], .group\\/disclosure-row, button.group\\/disclosure-row')
      if (nativeHeader && nativeHeader.getAttribute('data-bubbles-duplicate-header') !== 'true') {
        nativeHeader.setAttribute('data-bubbles-duplicate-header', 'true')
      }
    } else {
      for (const tool of run) {
        const nativeHeader = tool.querySelector?.('[data-bubbles-duplicate-header]')
        if (nativeHeader) {
          nativeHeader.removeAttribute('data-bubbles-duplicate-header')
        }
      }
    }

    // Mark all tools in this run
    for (const tool of run) {
      if (tool.getAttribute('data-bubbles-in-group') !== 'true') {
        tool.setAttribute('data-bubbles-in-group', 'true')
      }
      if (tool.getAttribute('data-bubbles-tool-flat') !== 'true') {
        tool.setAttribute('data-bubbles-tool-flat', 'true')
      }
      if (tool.getAttribute('data-bubbles-group-id') !== groupId) {
        tool.setAttribute('data-bubbles-group-id', groupId)
      }
      const collapsedStr = isExpanded ? 'false' : 'true'
      if (tool.getAttribute('data-bubbles-group-collapsed') !== collapsedStr) {
        tool.setAttribute('data-bubbles-group-collapsed', collapsedStr)
      }

      // Reconcile the native ToolEntry disclosure with the persisted group
      // state, so expanded groups reveal their details immediately — including
      // after a reload when the skin pill is expanded. Only drive it open;
      // collapsed groups are hidden anyway (display:none on the ToolRun).
      if (isExpanded) {
        const nativeToggles = tool.querySelectorAll(
          ".group\\/disclosure-row button[aria-expanded], button.group\\/disclosure-row, " +
          "header button[aria-expanded]"
        )
        for (const nt of nativeToggles) {
          if (nt.getAttribute('aria-expanded') !== 'true' && typeof nt.click === 'function') {
            nt.click()
          }
        }
      }
    }
  }

  // Clean up any stale/orphaned headers in this parent
  const existingHeaders = parent.querySelectorAll(':scope > .bubbles-tool-group')
  for (const h of existingHeaders) {
    if (!activeHeaders.has(h)) {
      h.remove()
    }
  }
}

// ============================================================================
// 5. TASK MODULE
// ============================================================================

function findTaskSection(statusStack) {
  if (!isElement(statusStack)) return null
  const content = statusStack.querySelector('[data-slot="status-stack-content"]') || statusStack
  const sections = content.querySelectorAll('[data-slot="status-section"]')
  for (const section of sections) {
    if (section.querySelector('.codicon-checklist')) {
      return section
    }
  }
  return null
}

/**
 * Multi-Signal Task State Recognizer
 *
 * Priority Hierarchy:
 * 1. failed: Signals: .codicon-error, .bg-destructive, .text-destructive, a numeric
 *    exit-code badge, aria-label. An error wins over a spinner, but a spinner alone
 *    never wins an error (see the tabular-nums note in the body).
 * 2. running: Active execution. Signals: Braille characters, .animate-spin, aria-label
 * 3. waiting: Suspended/Paused. Signals: .codicon-warning, .codicon-debug-pause, aria-label
 * 4. completed: Successfully resolved. Signals: .codicon-pass-filled, .codicon-check, aria-label
 * 5. cancelled: Terminated early. Signals: .codicon-circle-slash, .codicon-close, aria-label
 * 6. pending: Default initial queue state. Signals: StatusPendingIcon (svg/circle) or fallback
 */
function detectTaskState(row) {
  if (!isElement(row)) return 'pending'

  const iconContainer = row.querySelector('.status-row-icon')
  const rowAria = row.getAttribute('aria-label') || ''
  const iconAria = iconContainer?.getAttribute('aria-label') || ''
  const combinedAria = `${rowAria} ${iconAria}`.toLowerCase()
  const iconText = iconContainer?.textContent || ''
  const hasBraille = /[\u2800-\u28FF]/.test(iconText)

  // 1. FAILED — but an exit-code badge has to look like one. The old check was
  //    `row.querySelector('.tabular-nums')`, and GlyphSpinner carries that class to
  //    keep its braille frames from jittering (glyph-spinner.tsx:98), so EVERY
  //    running row read as failed and got tinted red (maroon over the navy card).
  //    A destructive/error signal still wins over a spinner: a row can be both.
  const looksLikeExitCode = text => /^\s*-?\d{1,4}\s*$/.test(text) || /^\s*(exit|code|退出码|返回码)\b/i.test(text)
  const hasCodeBadge = [...row.querySelectorAll('.tabular-nums')]
    .some(el => looksLikeExitCode((el.textContent || '').trim()))
  if (
    iconContainer?.querySelector('.codicon-error') ||
    iconContainer?.matches?.('.codicon-error') ||
    row.querySelector('.text-destructive, .bg-destructive') ||
    row.querySelector('span[class*="text-destructive"], span[class*="bg-destructive"]') ||
    hasCodeBadge ||
    /failed|error|失败|错误/.test(combinedAria)
  ) {
    return 'failed'
  }

  // 2. RUNNING
  if (
    hasBraille ||
    iconContainer?.querySelector('.animate-spin') ||
    iconContainer?.matches?.('.animate-spin') ||
    /running|executing|运行中|执行中/.test(combinedAria)
  ) {
    return 'running'
  }

  // 3. WAITING / PAUSED CHECK
  if (
    iconContainer?.querySelector('.codicon-warning, .codicon-debug-pause') ||
    iconContainer?.matches?.('.codicon-warning, .codicon-debug-pause') ||
    /waiting|paused|等待|暂停/.test(combinedAria)
  ) {
    return 'waiting'
  }

  // 4. COMPLETED CHECK
  if (
    iconContainer?.querySelector('.codicon-pass-filled, .codicon-check, .codicon-pass') ||
    iconContainer?.matches?.('.codicon-pass-filled, .codicon-check, .codicon-pass') ||
    /completed|done|finished|已完成|完成/.test(combinedAria)
  ) {
    return 'completed'
  }

  // 5. CANCELLED CHECK
  if (
    iconContainer?.querySelector('.codicon-circle-slash, .codicon-close') ||
    iconContainer?.matches?.('.codicon-circle-slash, .codicon-close') ||
    /cancelled|canceled|已取消|取消/.test(combinedAria)
  ) {
    return 'cancelled'
  }

  // 6. PENDING CHECK (Fallback)
  if (
    iconContainer?.querySelector('svg, circle, [data-status-icon]') ||
    iconContainer?.matches?.('svg, circle, [data-status-icon]') ||
    /pending|queued|待办|等待中/.test(combinedAria)
  ) {
    return 'pending'
  }

  return 'pending'
}

function updateTaskState(row) {
  if (!isElement(row)) return
  const state = detectTaskState(row)

  if (row.getAttribute('data-bubbles-task') !== 'true') {
    row.setAttribute('data-bubbles-task', 'true')
  }
  if (row.getAttribute('data-bubbles-task-row') !== 'true') {
    row.setAttribute('data-bubbles-task-row', 'true')
  }
  if (row.getAttribute('data-task-state') !== state) {
    row.setAttribute('data-task-state', state)
    stats.taskRefreshes += 1
  }
}

function updateTaskHeaderCounter(taskSection, completedCount, totalCount) {
  const trigger = taskSection?.querySelector?.('.status-section-trigger')
  if (!trigger) return

  // There is no pill badge here any more. Hermes' own header already prints
  // 任务 n/m (status-stack/index.tsx:87), so a second counter only duplicated it
  // — and lied: when the section collapses, the renderer swaps the rows for a
  // preview, we counted 0 of 0, and the pill showed that. cleanupAll still
  // removes any pill an older build left behind.
  //
  // Zero rows is that same case: keep the last ratio instead of animating the
  // bar back to zero on a section that merely folded.
  if (totalCount <= 0) return

  const ratio = Math.min(1, Math.max(0, completedCount / totalCount))
  const next = ratio.toFixed(3)
  if (trigger.style.getPropertyValue('--bubbles-task-progress') !== next) {
    trigger.style.setProperty('--bubbles-task-progress', next)
  }
}

/* Keep the running task in view — once per change. Re-scrolling on every refresh
 * would yank the list away from anyone reading the completed rows above it. */
let lastScrolledTaskRow = null

function scrollToActiveTaskRow(sectionEl) {
  if (!isElement(sectionEl) || typeof document === 'undefined') return false
  const body = sectionEl.querySelector('.status-section-body')
  const active = sectionEl.querySelector("[data-bubbles-task-row][data-task-state='running']")
  if (!isElement(body) || !isElement(active)) return false
  if (active === lastScrolledTaskRow) return false

  const boxRect = body.getBoundingClientRect()
  const rowRect = active.getBoundingClientRect()
  const inView = rowRect.top >= boxRect.top - 1 && rowRect.bottom <= boxRect.bottom + 1
  lastScrolledTaskRow = active
  if (inView) return false
  active.scrollIntoView({ block: 'nearest' })
  return true
}

function enhanceTaskSection(statusStack) {
  const taskSection = findTaskSection(statusStack)
  if (!taskSection) {
    if (statusStack.hasAttribute('data-bubbles-has-task-section')) {
      statusStack.removeAttribute('data-bubbles-has-task-section')
    }
    return
  }

  if (statusStack.getAttribute('data-bubbles-has-task-section') !== 'true') {
    statusStack.setAttribute('data-bubbles-has-task-section', 'true')
  }
  if (taskSection.getAttribute('data-bubbles-task') !== 'true') {
    taskSection.setAttribute('data-bubbles-task', 'true')
  }
  if (taskSection.getAttribute('data-bubbles-task-section') !== 'true') {
    taskSection.setAttribute('data-bubbles-task-section', 'true')
  }

  setupTaskScroll(taskSection)

  const rows = taskSection.querySelectorAll('[data-slot="status-row"]')
  let completedCount = 0
  for (const row of rows) {
    updateTaskState(row)
    if (row.getAttribute('data-task-state') === 'completed') {
      completedCount += 1
    }
  }

  // Update dynamic header counter badge
  updateTaskHeaderCounter(taskSection, completedCount, rows.length)
  scrollToActiveTaskRow(taskSection)
}

function setupTaskScroll(taskSection) {
  const body = taskSection.querySelector('.status-section-body')
  if (!body) return
  if (body.getAttribute('data-bubbles-task-scroll') !== 'true') {
    body.setAttribute('data-bubbles-task-scroll', 'true')
  }
}

// ============================================================================
// 6. APPROVAL & CLARIFY UX MODULE
// ============================================================================

function enhanceApproval(approvalEl) {
  if (!isElement(approvalEl)) return
  if (approvalEl.getAttribute('data-bubbles-approval') !== 'true') {
    approvalEl.setAttribute('data-bubbles-approval', 'true')
    stats.approvalRefreshes += 1
  }
}

function enhanceClarify(clarifyEl) {
  if (!isElement(clarifyEl)) return
  if (clarifyEl.getAttribute('data-bubbles-clarify') !== 'true') {
    clarifyEl.setAttribute('data-bubbles-clarify', 'true')
    stats.clarifyRefreshes += 1
  }
}

// ============================================================================
// 6.5. SESSION & HISTORY MODULE (Phase 5A)
// ============================================================================

function isRowActive(rowEl) {
  if (!isElement(rowEl)) return false
  return (
    rowEl.classList?.contains('bg-(--ui-row-active-background)') ||
    rowEl.classList?.contains('bg-[var(--ui-row-active-background)]') ||
    rowEl.getAttribute?.('data-selected') === 'true' ||
    rowEl.getAttribute?.('aria-selected') === 'true' ||
    Boolean(rowEl.matches?.('.bg-\\(--ui-row-active-background\\)')) ||
    false
  )
}

function enhanceSidebarSessionRow(rowEl) {
  if (!isElement(rowEl)) return

  // Mark row as recognized session row
  if (rowEl.getAttribute('data-bubbles-session-row') !== 'true') {
    rowEl.setAttribute('data-bubbles-session-row', 'true')
    stats.sessionRefreshes += 1
  }

  // Update active state dynamically
  const active = isRowActive(rowEl)
  const currentActiveAttr = rowEl.getAttribute('data-bubbles-session-active')
  const newActiveAttr = active ? 'true' : 'false'
  if (currentActiveAttr !== newActiveAttr) {
    rowEl.setAttribute('data-bubbles-session-active', newActiveAttr)
    stats.sessionRefreshes += 1
  }
}

function enhanceSidebarDivider(dividerEl) {
  if (!isElement(dividerEl)) return
  if (dividerEl.getAttribute('data-bubbles-session-divider') !== 'true') {
    dividerEl.setAttribute('data-bubbles-session-divider', 'true')
  }
}

// ============================================================================
// 6.6. SESSION PREVIEW MODULE (Phase 5B)
// ============================================================================

let previewContainer = null
let currentPreviewRow = null
let previewListenersAttached = false
let handlePointerOver = null
let handlePointerOut = null
let handleFocusIn = null
let handleFocusOut = null
let handleKeyDown = null

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function cleanPreviewSnippet(s, maxLen = 130) {
  if (!s) return ''
  const oneLiner = s.replace(/\s+/g, ' ').trim()
  return oneLiner.length > maxLen ? `${oneLiner.slice(0, maxLen)}…` : oneLiner
}

function extractSessionRowPreviewData(rowEl) {
  if (!isElement(rowEl)) return null

  // 1. Session Title. The sidebar rows carry no data-slot for their label; the
  //    marquee span and the row button are what the renderer emits.
  const titleEl = rowEl.querySelector('.hover-marquee-inner') || rowEl.querySelector('.hover-marquee')
  const title = (titleEl?.textContent || rowEl.querySelector('button.row-button')?.textContent || '').trim()
  if (!title) return null

  // 2. Timestamp / Age
  const timeEl = rowEl.querySelector('time')
  const time = (timeEl?.getAttribute('aria-label') || timeEl?.textContent || '').trim()

  // 3. User & Assistant snippets
  let userSnippet = ''
  let asstSnippet = ''
  let metaInfo = ''

  const active = isRowActive(rowEl)

  if (active) {
    // Current open session: extract latest live messages
    const userMsgs = document.querySelectorAll('[data-slot="aui_user-message-root"]')
    if (userMsgs.length > 0) {
      const lastUser = userMsgs[userMsgs.length - 1]
      // No aui_user-message-content slot exists; the message root's own text is
      // what the preview shows.
      userSnippet = (lastUser.textContent || '').trim()
    }

    const asstMsgs = document.querySelectorAll('[data-slot="aui_assistant-message-root"]')
    if (asstMsgs.length > 0) {
      const lastAsst = asstMsgs[asstMsgs.length - 1]
      const asstContent = lastAsst.querySelector('[data-slot="aui_assistant-message-content"]') || lastAsst
      asstSnippet = (asstContent.textContent || '').trim()
    }

    // Task & Tool stats if present in current DOM. The count comes from Hermes' own
    // section header — we no longer paint a pill of our own to read.
    const taskHeader = document.querySelector('.status-section-header')
    const toolGroupLabel = document.querySelector('.bubbles-group-label')
    if (taskHeader?.textContent?.trim()) {
      metaInfo = `✦ ${taskHeader.textContent.trim().replace(/\s+/g, ' ').slice(0, 24)}`
    } else if (toolGroupLabel) {
      metaInfo = `✦ ${toolGroupLabel.textContent.trim()}`
    }
  } else {
    // Inactive session: extract from row's native rendered metadata / preview lines
    const textSpans = rowEl.querySelectorAll('.truncate, .wrap-anywhere')
    for (const span of textSpans) {
      const text = (span.textContent || '').trim()
      if (text.includes('·') || text.includes('tokens') || text.includes('messages') || text.includes('tasks')) {
        metaInfo = `✦ ${text}`
      } else if (!userSnippet && text.length > 0) {
        userSnippet = text
      }
    }
  }

  return {
    title: cleanPreviewSnippet(title, 80),
    userSnippet: cleanPreviewSnippet(userSnippet, 130),
    asstSnippet: cleanPreviewSnippet(asstSnippet, 130),
    metaInfo: cleanPreviewSnippet(metaInfo, 60),
    time
  }
}

function ensurePreviewContainer() {
  if (previewContainer && previewContainer.isConnected) return previewContainer
  let el = document.getElementById('bubbles-session-preview')
  if (!el) {
    el = document.createElement('div')
    el.id = 'bubbles-session-preview'
    el.className = 'bubbles-session-preview'
    el.setAttribute('aria-hidden', 'true')
    el.setAttribute('role', 'tooltip')
    document.body.appendChild(el)
  }
  previewContainer = el
  return el
}

function positionPreview(rowEl, previewEl) {
  if (!isElement(rowEl) || !isElement(previewEl)) return
  if (typeof rowEl.getBoundingClientRect !== 'function') return

  const rect = rowEl.getBoundingClientRect()
  const pad = 10
  const viewportW = (typeof window !== 'undefined' ? window.innerWidth : 1024) || 1024
  const viewportH = (typeof window !== 'undefined' ? window.innerHeight : 768) || 768

  const cardRect = previewEl.getBoundingClientRect?.() || { width: 300, height: 180 }
  const previewW = cardRect.width || 300
  const previewH = cardRect.height || 180

  let left = rect.right + pad
  let top = rect.top

  // Horizontal boundary defense: flip or clamp
  if (left + previewW > viewportW - pad) {
    if (rect.left - previewW - pad > 0) {
      left = rect.left - previewW - pad
    } else {
      left = Math.max(pad, viewportW - previewW - pad)
    }
  }

  // Vertical boundary defense: clamp
  if (top + previewH > viewportH - pad) {
    top = Math.max(pad, viewportH - previewH - pad)
  }

  previewEl.style.left = `${Math.round(left)}px`
  previewEl.style.top = `${Math.round(top)}px`
}

function showPreview(rowEl) {
  if (!isElement(rowEl)) return
  /* One build per hovered row. `pointerover` fires for every child the pointer
     crosses, and for the ACTIVE row a build walks the whole document for the
     latest messages — so a mouse sweep down the sidebar re-ran that per crossing.
     The preview is a snapshot taken when the hover starts, which is what a tooltip
     does; it refreshes when the pointer enters another row. */
  if (rowEl === currentPreviewRow) return

  const data = extractSessionRowPreviewData(rowEl)
  if (!data || !data.title) {
    hidePreview()
    return
  }

  currentPreviewRow = rowEl
  const container = ensurePreviewContainer()

  const node = (tag, className, text) => {
    const el = document.createElement(tag)
    el.className = className
    if (text !== undefined) el.textContent = text
    return el
  }

  const card = node('div', 'bubbles-preview-card')

  const header = node('div', 'bubbles-preview-header')
  header.appendChild(node('span', 'bubbles-preview-icon', '✦'))
  header.appendChild(node('span', 'bubbles-preview-title', data.title))
  card.appendChild(header)

  if (data.userSnippet || data.asstSnippet) {
    const body = node('div', 'bubbles-preview-body')
    if (data.userSnippet) {
      const section = node('div', 'bubbles-preview-section bubbles-preview-user')
      section.appendChild(node('span', 'bubbles-preview-role', 'You'))
      section.appendChild(node('p', 'bubbles-preview-text', data.userSnippet))
      body.appendChild(section)
    }
    if (data.asstSnippet) {
      const section = node('div', 'bubbles-preview-section bubbles-preview-assistant')
      section.appendChild(node('span', 'bubbles-preview-role', 'Hermes'))
      section.appendChild(node('p', 'bubbles-preview-text', data.asstSnippet))
      body.appendChild(section)
    }
    card.appendChild(body)
  }

  if (data.metaInfo || data.time) {
    const footer = node('div', 'bubbles-preview-footer')
    if (data.metaInfo) {
      footer.appendChild(node('span', 'bubbles-preview-meta', data.metaInfo))
    }
    if (data.time) {
      footer.appendChild(node('span', 'bubbles-preview-time', data.time))
    }
    card.appendChild(footer)
  }

  container.replaceChildren(card)
  container.setAttribute('data-visible', 'true')
  container.setAttribute('aria-hidden', 'false')

  stats.previewShows += 1
  positionPreview(rowEl, container)
}

function hidePreview() {
  currentPreviewRow = null
  if (previewContainer) {
    previewContainer.setAttribute('data-visible', 'false')
    previewContainer.setAttribute('aria-hidden', 'true')
  }
}

/* Phase B v2 — anchor the composer pill menus to their trigger.
 *
 * Both pill menus are Radix DropdownMenus declared with align="end", so the
 * panel's RIGHT edge tracks the pill. That was fine while the pills sat at the
 * right of a single-row composer; Phase B moved them left, and an end-aligned
 * 240px panel now hangs off the pill's left edge.
 *
 * Radix owns the popper wrapper's inline left/top (and its transform for
 * animations), so we never fight it by writing those. We append one translateX
 * and remember the transform we found, so a re-open cannot stack shifts.
 *
 * The panel is chosen by state, not by position in the document: Radix keeps a
 * closed content mounted while it animates out, and w-64 is not a unique width in
 * the app, so "first w-64" was regularly not "the menu that just opened".
 * data-state is on MenuContent itself (@radix-ui/react-menu dist/index.mjs:300). */
const COMPOSER_PILL_MENUS = [
  { trigger: "[data-tour='model-pill']", width: 'w-64' },
  { trigger: "[data-testid='reasoning-pill']", width: 'w-52' },
]

function alignComposerPillMenu(triggerEl) {
  if (!isElement(triggerEl) || typeof document === 'undefined') return false
  const pair = COMPOSER_PILL_MENUS.find(p => triggerEl.matches?.(p.trigger))
  if (!pair) return false
  const open = `[data-slot='dropdown-menu-content'][data-state='open']`
  /* The width stays as the trigger→panel hint (Radix links them only for
     submenus), but it filters rather than falls back: shifting some other
     menu that happens to be open is worse than not aligning ours. */
  const panel = document.querySelector(`${open}[class~='${pair.width}']`)
  if (!isElement(panel)) return false

  const wrapper = panel.closest('[data-radix-popper-content-wrapper]') || panel
  const triggerRect = triggerEl.getBoundingClientRect()
  const panelRect = panel.getBoundingClientRect()
  // Left-align to the trigger, but never push the panel off-screen.
  const targetLeft = Math.min(
    Math.max(triggerRect.left, 8),
    Math.max(8, window.innerWidth - 8 - panelRect.width)
  )
  const dx = Math.round(targetLeft - panelRect.left)
  if (Math.abs(dx) < 1) return false

  if (wrapper.dataset.bubblesMenuBaseTransform === undefined) {
    wrapper.dataset.bubblesMenuBaseTransform = wrapper.style.transform || ''
  }
  wrapper.style.transform = `${wrapper.dataset.bubblesMenuBaseTransform} translateX(${dx}px)`.trim()
  return true
}

let handleComposerPillOpen = null

function setupComposerMenuAlign() {
  if (handleComposerPillOpen || typeof document === 'undefined') return
  handleComposerPillOpen = (e) => {
    const target = e.target
    if (!isElement(target)) return
    const trigger = target.closest?.(COMPOSER_PILL_MENUS.map(p => p.trigger).join(','))
    if (!trigger) return
    // Radix measures and positions in its own frame; align after two paints.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => alignComposerPillMenu(trigger))
    })
  }
  document.addEventListener('click', handleComposerPillOpen, true)
}

function cleanupComposerMenuAlign() {
  if (handleComposerPillOpen && typeof document !== 'undefined') {
    document.removeEventListener('click', handleComposerPillOpen, true)
  }
  handleComposerPillOpen = null
}

function setupSessionPreview() {
  if (previewListenersAttached || typeof document === 'undefined') return

  handlePointerOver = (e) => {
    const target = e.target
    if (!isElement(target)) return
    const row = closestSessionRow(target)
    if (row) {
      showPreview(row)
    }
  }

  handlePointerOut = (e) => {
    const target = e.target
    if (!isElement(target)) return
    const row = closestSessionRow(target)
    const related = e.relatedTarget && isElement(e.relatedTarget) ? closestSessionRow(e.relatedTarget) : null
    if (row && row !== related) {
      hidePreview()
    }
  }

  handleFocusIn = (e) => {
    const target = e.target
    if (!isElement(target)) return
    const row = closestSessionRow(target)
    if (row) {
      showPreview(row)
    }
  }

  handleFocusOut = (e) => {
    const target = e.target
    if (!isElement(target)) return
    const row = closestSessionRow(target)
    const related = e.relatedTarget && isElement(e.relatedTarget) ? closestSessionRow(e.relatedTarget) : null
    if (row && row !== related) {
      hidePreview()
    }
  }

  handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      hidePreview()
    }
  }

  document.addEventListener('pointerover', handlePointerOver, { passive: true })
  document.addEventListener('pointerout', handlePointerOut, { passive: true })
  document.addEventListener('focusin', handleFocusIn, { passive: true })
  document.addEventListener('focusout', handleFocusOut, { passive: true })
  document.addEventListener('keydown', handleKeyDown, { passive: true })

  previewListenersAttached = true
}

function cleanupSessionPreview() {
  if (!previewListenersAttached || typeof document === 'undefined') return

  if (handlePointerOver) document.removeEventListener('pointerover', handlePointerOver)
  if (handlePointerOut) document.removeEventListener('pointerout', handlePointerOut)
  if (handleFocusIn) document.removeEventListener('focusin', handleFocusIn)
  if (handleFocusOut) document.removeEventListener('focusout', handleFocusOut)
  if (handleKeyDown) document.removeEventListener('keydown', handleKeyDown)

  previewListenersAttached = false
  handlePointerOver = null
  handlePointerOut = null
  handleFocusIn = null
  handleFocusOut = null
  handleKeyDown = null

  if (previewContainer) {
    previewContainer.remove()
    previewContainer = null
  }
  currentPreviewRow = null
}

// ============================================================================
// 7. OBSERVER MODULE (Idempotent Batching)
// ============================================================================

let observerInstance = null
let sidebarClassObserver = null
let sidebarClassEl = null
/* Clamp heights read ahead of the stamps for the current pass (see the messages stage
   of processDOM). Null whenever no batch is in force, so a call from anywhere else
   measures live exactly as before. */
let clampHeightBatch = null
let animationFrameId = null
let isScheduled = false

/* Run one pass stage in isolation. Stages are sequential and the Tasks panel is
   third — behind the message and tool passes that carry all the load when many
   tools run concurrently — so a single throw used to silently cost every later
   stage, and the only symptom was "that surface never appears". The count lands in
   stats so window.__hermesBubblesSkinStats can show it. */
function runStage(name, fn) {
  try {
    fn()
  } catch (err) {
    stats.stageErrors[name] = (stats.stageErrors[name] || 0) + 1
    stats.lastStageError = `${name}: ${(err && err.message) || String(err)}`
  }
}

function processDOM() {
  isScheduled = false
  const startTime = performance.now()

  // 1. Process Conversation Messages
  runStage('messages', () => {
    const roots = [...document.querySelectorAll('[data-slot="aui_user-message-root"], [data-slot="aui_edit-composer-root"]')]
    /* Measure every clamp height before stamping any of them. The stamps change
       computed style — the collapsed max-height is a CSS rule keyed on
       [data-bubbles-long-user] — so a height read that follows a stamp makes the engine
       lay the page out again. Measured in test/layout-read-batching.test.js: read and
       stamp per message interleaved cost one forced reflow per message (39 of them for
       40 messages in one pass). */
    const heights = new Map()
    for (const root of roots) {
      const clamp = root.querySelector?.('.sticky-human-clamp')
      if (!clamp) continue
      const cached = Number.parseFloat(clamp.style.getPropertyValue('--human-msg-full'))
      if (Number.isFinite(cached) && cached > 0) continue
      const inner = clamp.firstElementChild
      heights.set(root, inner?.scrollHeight || clamp.scrollHeight || 0)
    }
    clampHeightBatch = heights
    try {
      for (const msg of roots) {
        enhanceUserMessage(msg)
      }
      for (const msg of document.querySelectorAll('[data-slot="aui_assistant-message-root"]')) {
        enhanceAssistantMessage(msg)
      }
    } finally {
      // A throw inside a stage is caught by runStage outside; the batch must not
      // outlive the pass, or the next pass would clamp on stale heights.
      clampHeightBatch = null
    }
  })

  // 2. Process Thinking & Tool Call Blocks
  runStage('scaffolding', () => {
    for (const tb of document.querySelectorAll('[data-slot="aui_thinking-disclosure"]')) {
      enhanceThinkingBlock(tb)
    }
    for (const tool of document.querySelectorAll('[data-slot="tool-block"]')) {
      enhanceToolBlock(tool)
    }
    // Group and collapse consecutive completed tools (Phase 4 Clean Transcript)
    groupCompletedTools()
  })

  // 3. Process Composer Status Stack & Tasks
  runStage('tasks', () => {
    for (const stack of document.querySelectorAll('[data-slot="composer-status-stack"]')) {
      enhanceTaskSection(stack)
    }
  })

  // 4. Process Approval & Clarify Components
  runStage('overlays', () => {
    for (const app of document.querySelectorAll('[data-slot="tool-approval-stack"], [data-slot="tool-approval-card"]')) {
      enhanceApproval(app)
    }
    for (const cl of document.querySelectorAll('[data-slot="clarify-inline"], form[data-clarify-choices]')) {
      enhanceClarify(cl)
    }
  })

  // 5. Process Sidebar Sessions & Date Dividers (Phase 5A)
  runStage('sidebar', () => {
    // The sidebar may mount after setupObserver ran, or be replaced; this pass is the
    // first thing its mount triggers, so the scoped `class` watcher follows it here.
    attachSidebarClassWatch()
    for (const r of document.querySelectorAll(SESSION_ROW_PROBE)) {
      // A row shell is a .row-hover element inside the sidebar, and nothing else.
      // The old fallback to r itself stamped the section-collapse caret button (91x20,
      // empty) and the age/actions column as session rows, so the shell chrome (1px
      // border + navy fill on hover) painted a large empty frame beside the caret.
      const rowShell = sessionRowShell(r)
      if (rowShell) enhanceSidebarSessionRow(rowShell)
    }
    for (const d of document.querySelectorAll('.group\\/workspace')) {
      enhanceSidebarDivider(d)
    }
  })

  stats.lastBatchDurationMs = performance.now() - startTime
}

function scheduleProcess() {
  if (isScheduled) return
  isScheduled = true
  animationFrameId = requestAnimationFrame(processDOM)
}

/* The trigger list, hoisted out of setupObserver so both observers answer to one copy
   of the rules and processDOM can re-attach the scoped watcher without duplicating them. */
const RELEVANT_SELECTORS = [
  '[data-slot="aui_user-message-root"]',
  '[data-slot="aui_edit-composer-root"]',
  '[data-slot="aui_assistant-message-root"]',
  '[data-slot="aui_thinking-disclosure"]',
  '[data-slot="tool-block"]',
  '[data-slot="composer-status-stack"]',
  '[data-slot="status-section"]',
  '[data-slot="status-row"]',
  '[data-slot="tool-approval-stack"]',
  '[data-slot="tool-approval-card"]',
  '[data-slot="clarify-inline"]',
  // Trigger list only — the sidebar gate lives in sessionRowShell, which the
  // picker applies. A stray .row-hover elsewhere costs one rAF, not a mis-stamp.
  SESSION_ROW_PROBE,
  '.group\\/workspace'
].join(', ')

/**
 * One record in, one answer out. Shared by the body-wide observer and the sidebar
 * `class` watcher, so narrowing the reach cannot quietly change the criteria: the two
 * ignore walks run in the same order, and the session-row test is the same test.
 */
function mutationIsRelevant(mutation) {
  const target = mutation.target
  if (!isElement(target)) return false

  // Ignore typing and input interactions
  if (target.closest('[data-slot="composer-rich-input"], textarea, input')) return false

  // Ignore our own expand button triggers, counter, and tool groups
  if (target.closest('.bubbles-user-expand-btn, .bubbles-tool-group, .bubbles-tool-group-toggle')) return false

  if (mutation.type === 'childList') {
    const allNodes = [...mutation.addedNodes, ...mutation.removedNodes].filter(isElement)
    return allNodes.some(node => {
      if (node.classList?.contains('bubbles-tool-group') || node.hasAttribute?.('data-bubbles-tool-group')) return false
      return Boolean(node.matches?.(RELEVANT_SELECTORS) || node.querySelector?.(RELEVANT_SELECTORS))
    })
  }

  if (mutation.type === 'attributes') {
    const attr = mutation.attributeName
    if (attr === 'data-clamped' || attr === 'data-streaming' || attr === 'role' || attr === 'data-selected' || attr === 'aria-selected') return true
    return attr === 'class' && Boolean(closestSessionRow(target))
  }

  return false
}

/**
 * `class` stays watched, but where it carries state instead of everywhere.
 *
 * It was in the body-wide attributeFilter for exactly one reason: isRowActive() reads
 * the active-row class (`bg-(--ui-row-active-background)`), and the host signals
 * selection that way as often as through aria-selected. Everywhere else a class change
 * is hover chrome. Measured in test/observer-trigger-scope.test.js against the previous
 * shape: 200 unrelated class changes arrived as 1 callback costing 800 `closest()`
 * walks (4 per record) and bought nothing — no re-pass, no stamp.
 *
 * Mounting or re-mounting the sidebar is itself a childList mutation the trigger list
 * admits, so the (re)attach rides the pass the mount already causes; the identity check
 * keeps it free on every other pass.
 */
function attachSidebarClassWatch() {
  const el = document.querySelector(SIDEBAR_SELECTOR)
  if (el === sidebarClassEl) return
  if (sidebarClassObserver) {
    sidebarClassObserver.disconnect()
    sidebarClassObserver = null
  }
  sidebarClassEl = el
  if (!el) return
  sidebarClassObserver = new MutationObserver(records => {
    stats.sidebarClassCallbacks += 1
    if (records.some(mutationIsRelevant)) scheduleProcess()
  })
  sidebarClassObserver.observe(el, {
    attributes: true,
    subtree: true,
    attributeFilter: ['class'],
  })
}

function setupObserver(ctx) {
  observerInstance = new MutationObserver(mutations => {
    stats.observerCallbacks += 1
    if (mutations.some(mutationIsRelevant)) scheduleProcess()
  })

  observerInstance.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    // `class` moved to attachSidebarClassWatch(); see the note there for why.
    attributeFilter: ['data-clamped', 'data-streaming', 'role', 'data-selected', 'aria-selected']
  })

  attachSidebarClassWatch()

  // Initial immediate pass
  scheduleProcess()
}

// ============================================================================
// 8. LIFECYCLE & REGISTRATION (Zero-leak re-enable guarantee)
// ============================================================================

function installStyles() {
  let styleEl = document.getElementById(STYLE_ID)
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = STYLE_ID
    styleEl.textContent = PLUGIN_CSS
    document.head.appendChild(styleEl)
  }
  document.documentElement.setAttribute('data-bubbles-skin', 'true')
  /* Which deploy this window is actually painting. The plugin JS and the skin's
     customCSS are both read once per renderer document, so "I changed it and nothing
     moved" is usually "this window predates the deploy" — which used to be unprovable
     from inside the app. sync.js writes the value; one line in DevTools reads it back:
     console.log(document.documentElement.getAttribute('data-bubbles-build')) */
  const build = typeof globalThis === 'undefined' ? null : globalThis.__bubblesBuild
  if (build) document.documentElement.setAttribute('data-bubbles-build', String(build))
  /* When did this sheet actually land? Everything the skin paints through CSS is live
     from here on, but anything the app READS once and caches (xterm resolves the
     terminal surface into a WebGL clear color at terminal creation,
     use-terminal-session.ts:546) only sees the skin if it runs after this moment. The
     restored terminal is black for exactly that reason, and this number is the only
     evidence of the ordering that survives to a bug report. */
  try {
    console.log(`[bubbles] styles installed at ${Math.round(performance.now())}ms (build ${build ?? 'unknown'})`)
  } catch { /* no console or no performance; the attribute above still stands */ }
  return () => {
    styleEl?.remove()
    document.documentElement.removeAttribute('data-bubbles-skin')
    document.documentElement.removeAttribute('data-bubbles-build')
  }
}

function cleanupAll() {
  if (observerInstance) {
    observerInstance.disconnect()
    observerInstance = null
  }
  if (sidebarClassObserver) {
    sidebarClassObserver.disconnect()
    sidebarClassObserver = null
  }
  // Cleared with the observer it names, or a re-register would skip attaching because
  // it still believes the sidebar it saw last time is on watch.
  sidebarClassEl = null
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }

  // Remove injected styles & root attribute
  const styleEl = document.getElementById(STYLE_ID)
  if (styleEl) styleEl.remove()
  document.documentElement.removeAttribute('data-bubbles-skin')
  /* The build stamp goes with it. installStyles returns a teardown that also clears it,
     but register() runs cleanupAll BEFORE installStyles, so an instance that left via
     cleanupAll alone would keep a stamp naming the PREVIOUS build — and the attribute's
     only job is answering "which build is this window painting", where a wrong answer is
     worse than no answer. */
  document.documentElement.removeAttribute('data-bubbles-build')

  // Remove long user buttons and attributes
  for (const el of document.querySelectorAll('[data-bubbles-long-user], [data-bubbles-user-expanded], [data-bubbles-user-message], [data-bubbles-assistant-message]')) {
    clearLongUserDecoration(el)
    el.removeAttribute('data-bubbles-user-message')
    el.removeAttribute('data-bubbles-assistant-message')
    el.removeAttribute('data-bubbles-role')
  }
  for (const btn of document.querySelectorAll('.bubbles-user-expand-btn')) {
    btn.remove()
  }

  // Remove thinking and tool attributes
  for (const el of document.querySelectorAll('[data-bubbles-thinking], [data-bubbles-tool], [data-bubbles-tool-state], [data-bubbles-in-group], [data-bubbles-group-id], [data-bubbles-group-collapsed], [data-bubbles-tool-flat], [data-bubbles-tool-anchor-id]')) {
    el.removeAttribute('data-bubbles-thinking')
    el.removeAttribute('data-bubbles-tool')
    el.removeAttribute('data-bubbles-tool-state')
    el.removeAttribute('data-bubbles-in-group')
    el.removeAttribute('data-bubbles-group-id')
    el.removeAttribute('data-bubbles-group-collapsed')
    el.removeAttribute('data-bubbles-tool-flat')
    // The anchor id is a stable handle the group pill uses to find its first run.
    // Leaving it behind is harmless until the plugin is re-enabled, when a stale
    // id can point a rebuilt header at a row that no longer exists.
    el.removeAttribute('data-bubbles-tool-anchor-id')
  }
  for (const el of document.querySelectorAll('[data-bubbles-duplicate-header]')) {
    el.removeAttribute('data-bubbles-duplicate-header')
  }
  for (const group of document.querySelectorAll('.bubbles-tool-group')) {
    group.remove()
  }

  // Remove task attributes and counter badge
  for (const el of document.querySelectorAll('[data-bubbles-task], [data-bubbles-task-section], [data-bubbles-has-task-section], [data-bubbles-task-row], [data-bubbles-task-scroll]')) {
    el.removeAttribute('data-bubbles-task')
    el.removeAttribute('data-bubbles-task-section')
    el.removeAttribute('data-bubbles-has-task-section')
    el.removeAttribute('data-bubbles-task-row')
    el.removeAttribute('data-bubbles-task-scroll')
    el.removeAttribute('data-task-state')
  }
  // Remove approval and clarify attributes
  for (const el of document.querySelectorAll('[data-bubbles-approval], [data-bubbles-clarify]')) {
    el.removeAttribute('data-bubbles-approval')
    el.removeAttribute('data-bubbles-clarify')
  }

  // Remove session and divider attributes (Phase 5A)
  for (const el of document.querySelectorAll('[data-bubbles-session-row], [data-bubbles-session-active], [data-bubbles-session-divider]')) {
    el.removeAttribute('data-bubbles-session-row')
    el.removeAttribute('data-bubbles-session-active')
    el.removeAttribute('data-bubbles-session-divider')
  }

  /* Inline custom properties. Everything else the plugin paints lives in its own
     <style>, but per-element state has to be written onto host nodes — the task
     progress bar carries its ratio on Hermes' own .status-section-trigger. Those
     survive a `data-bubbles-*` sweep because they are not attributes we stamp, and
     the plugin's header claims every side effect is released. */
  for (const el of document.querySelectorAll('[style*="--bubbles-"]')) {
    const declared = (el.getAttribute('style') || '').match(/--bubbles-[a-z0-9-]+/g)
    if (!declared) continue
    for (const name of new Set(declared)) el.style.removeProperty(name)
  }

  // Cleanup session preview (Phase 5B)
  cleanupSessionPreview()
  cleanupComposerMenuAlign()
  lastScrolledTaskRow = null

  /* Drop the debug handles with the rest of the surface. They are re-armed at the top of
     register(), so this only ever clears what a live instance no longer owns — the point
     is that a disposed plugin leaves nothing behind that could be read as still-live
     stats from a window that stopped painting bubbles several reloads ago. */
  delete globalThis.cleanToolTitle
  delete globalThis.__hermesBubblesSkinStats
}

export default {
  id: ID,
  name: 'Hermes Bubbles Skin',
  register(ctx) {
    pluginStorage = ctx?.storage || null
    // Once per activation, before any pass reads storage.
    sweepRetiredStorageKeys()

    // Clean up any stale artifacts before installing
    cleanupAll()

    /* Re-arm the debug handles AFTER that cleanup, not before: cleanupAll deletes them,
       and register() calls cleanupAll first — arming earlier would delete what it just
       set. A re-register within the same module evaluation (the host re-activating the
       plugin rather than reloading the file) would otherwise leave getToolTitle on its
       unsanitized fallback and take the stats outlet with it, because the assignments at
       the top of this file run once per document, not once per activation. */
    globalThis.cleanToolTitle = cleanToolTitle
    globalThis.__hermesBubblesSkinStats = stats

    const uninstallStyles = installStyles()
    setupObserver(ctx)
    setupComposerMenuAlign()
    setupSessionPreview()

    console.info(`[${ID}] Desktop plugin activated (${BUILD_ID})`)

    ctx?.onDispose?.(() => {
      uninstallStyles()
      cleanupAll()
      console.info(`[${ID}] Desktop plugin disposed`)
    })
  }
}
