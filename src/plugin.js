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
/* ==========================================================================
   Bubbles Desktop Plugin Phase 4 Runtime Styles
   - Clean Transcript & Tool Collapse (Collapse, Never Delete)
   - Consecutive Completed Tool Grouping & Interactive Toggle
   - Robust Responsive Defenses: clamp(), overflow-wrap, max-width
   - Full Keyboard Focus & Reduced-Motion Accessibility
   Scoped under html[data-bubbles-skin='true']
   ========================================================================== */

/* The terminal's surface token, declared here as well as in the skin's customCSS —
   and the duplication is the point. xterm resolves --ui-terminal-surface-background
   ONCE, when the terminal is created (use-terminal-session.ts:546 → selection.ts:88
   resolveSurfaceColor), and bakes the result into its WebGL canvas. customCSS reaches
   the document later, from ThemeProvider's runtime <style> tag, so a terminal restored
   at boot resolves the app's own dark chrome and paints black forever, whatever CSS
   says afterwards — the panel reads "blue for a moment, then black". This sheet is
   installed by the plugin, before the right sidebar mounts, so the token already holds
   the skin's value at the moment of the bake. test/terminal-surface.test.js pins the
   two copies to the same hex. */
html[data-bubbles-skin='true'] {
  --ui-terminal-surface-background: #113c6a !important;
}

/* --------------------------------------------------------------------------
   1. Conversation Spacing & Assistant Bubble Deepening
   -------------------------------------------------------------------------- */
html[data-bubbles-skin='true'] [data-slot='aui_user-message-root'],
html[data-bubbles-skin='true'] [data-slot='aui_edit-composer-root'] {
  margin-top: 6px !important;
  margin-bottom: 14px !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-end !important;
  justify-content: flex-end !important;
  align-self: flex-end !important;
  width: 100% !important;
  box-sizing: border-box !important;
}

/* User Message & Edit Composer Flex Container Alignment */
html[data-bubbles-skin='true'] [data-slot='aui_user-message-root'] > [data-slot='aui_user-bubble-actions'],
html[data-bubbles-skin='true'] [data-slot='aui_user-message-root'] .human-message-with-todos-wrapper,
html[data-bubbles-skin='true'] [data-slot='aui_user-message-root'] .composer-human-message-container,
html[data-bubbles-skin='true'] [data-slot='aui_edit-composer-root'] .composer-human-message-container,
html[data-bubbles-skin='true'] [data-slot='aui_edit-composer-root'] .human-execution-message-top,
html[data-bubbles-skin='true'] [data-slot='aui_edit-composer-root'] [data-slot='aui_user-message-root'] {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-end !important;
  justify-content: flex-end !important;
  align-self: flex-end !important;
  width: 100% !important;
  box-sizing: border-box !important;
}

html[data-bubbles-skin='true'] [data-slot='aui_user-message-root'] .composer-human-message,
html[data-bubbles-skin='true'] [data-slot='aui_edit-composer-root'] .composer-human-message,
html[data-bubbles-skin='true'] [data-slot='aui_edit-composer-root'] .ui-prompt-input__container {
  margin-left: auto !important;
  margin-right: 0 !important;
  align-self: flex-end !important;
  width: fit-content !important;
  max-width: min(82%, calc(100% - 90px)) !important;
  box-sizing: border-box !important;
}

/* Checkpoint & Context Action Buttons Container: Snugly attached to the left of user bubble
   终止/恢复检查点选项：严密紧贴气泡左侧，垂直绝对居中 */
html[data-bubbles-skin='true'] [data-context-menu-skip] {
  display: flex !important;
  flex-direction: row !important;
  justify-content: flex-end !important;
  align-items: center !important;
  gap: 8px !important;
  position: relative !important;
  width: 100% !important;
  box-sizing: border-box !important;
}

/* 气泡位于右侧，保持 fit-content 完整宽度与高度 */
html[data-bubbles-skin='true'] [data-context-menu-skip] .composer-human-message {
  margin: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  flex: 0 1 auto !important;
  width: fit-content !important;
  max-width: min(82%, calc(100% - 90px)) !important;
  height: auto !important;
  min-height: 30px !important;
  padding: 6px 14px !important;
  order: 2 !important;
  box-sizing: border-box !important;
  display: flex !important;
  flex-direction: column !important;
  visibility: visible !important;
  opacity: 1 !important;
}

/* Action / Checkpoint Button Container: Snugly positioned directly to the left of the bubble
   操作按钮容器：设为 order: 1 紧贴气泡左侧，常态清晰可见（非全隐） */
html[data-bubbles-skin='true'] [data-context-menu-skip] > :is(div, button, [class*='absolute']):not(.composer-human-message):not([data-slot='aui_edit']):not(.bubbles-user-expand-btn) {
  position: static !important;
  inset: auto !important;
  flex: 0 0 auto !important;
  order: 1 !important;
  margin: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  opacity: 0.85 !important;
  pointer-events: auto !important;
  z-index: 40 !important;
  /* This wrapper rule outranks the button rule below (its :is() + three :not()
     add up to 0,6,1 vs 0,4,2), so it has to carry the full list — the button's
     own hover moves background, colour, border and transform, not just opacity. */
  transition: opacity 0.2s ease, background-color 0.2s ease, color 0.2s ease,
              border-color 0.2s ease, transform 0.2s ease !important;
}

html[data-bubbles-skin='true'] [data-context-menu-skip]:hover > :is(div, button, [class*='absolute']):not(.composer-human-message):not([data-slot='aui_edit']):not(.bubbles-user-expand-btn),
html[data-bubbles-skin='true'] .group\\/user-message:hover [data-context-menu-skip] > :is(div, button, [class*='absolute']):not(.composer-human-message):not([data-slot='aui_edit']):not(.bubbles-user-expand-btn) {
  opacity: 1 !important;
}

html[data-bubbles-skin='true'] [data-context-menu-skip] button:not(.composer-human-message):not(.bubbles-user-expand-btn) {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 24px !important;
  height: 24px !important;
  padding: 0 !important;
  background: rgba(13, 42, 77, 0.70) !important;
  border: 1px solid rgba(147, 197, 253, 0.35) !important;
  border-radius: 6px !important;
  color: #93c5fd !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25) !important;
  backdrop-filter: blur(8px) !important;
  -webkit-backdrop-filter: blur(8px) !important;
  /* The hover rule moves exactly these four. */
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease,
              transform 0.2s ease !important;
}

html[data-bubbles-skin='true'] [data-context-menu-skip] button:not(.composer-human-message):not(.bubbles-user-expand-btn):hover {
  background: rgba(30, 64, 175, 0.80) !important;
  color: #ffffff !important;
  border-color: rgba(147, 197, 253, 0.75) !important;
  transform: scale(1.08);
}

html[data-bubbles-skin='true'] [data-context-menu-skip] button:not(.composer-human-message):not(.bubbles-user-expand-btn) svg {
  width: 12px !important;
  height: 12px !important;
  fill: currentColor !important;
}

html[data-bubbles-skin='true'] .checkpoint-container {
  display: flex !important;
  justify-content: flex-end !important;
  align-items: center !important;
  align-self: flex-end !important;
  margin-top: 4px !important;
}

/* Inner input stays left-aligned for natural writing direction */
html[data-bubbles-skin='true'] [data-slot='aui_edit-composer-root'] [data-slot='composer-rich-input'],
html[data-bubbles-skin='true'] [data-slot='aui_edit-composer-root'] .ui-prompt-input-editor__input {
  text-align: left !important;
  direction: ltr !important;
}

html[data-bubbles-skin='true'] [data-slot='aui_edit-composer-root'] {
  padding-right: 0 !important;
}
html[data-bubbles-skin='true'] [data-slot='aui_edit-composer-root']::before,
html[data-bubbles-skin='true'] [data-slot='aui_edit-composer-root']::after {
  display: none !important;
}

html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-root'] {
  margin-top: 4px !important;
  margin-bottom: 14px !important;
}

/* The avatar image lives here rather than in the skin because it is 4,548 base64
   characters: customCSS is sliced at 32,768 by the gateway and every byte of art in
   it is a byte of rule budget lost. This sheet has no cap. Nothing else in either
   sheet targets this pseudo-element, so the move cannot change which declaration
   wins — only where the payload sits. */
html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-root']::before {
  content: '';
  position: absolute;
  left: 4px; top: 0;
  width: 38px; height: 38px;
  flex-shrink: 0;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEwAAABMCAMAAADwSaEZAAADAFBMVEUAAAD///8AAAB4eHgCAgIBAQEDAwMKCgoHBwcICAgNDQ35+fkGBgYFBQUJCQkMDAwEBARwcHA6Ojr+/v4kJCQREREYGBh/f38PDw8AAAChoaH9/f3z8/P19fX4+PgQEBAtLS3Z2dm1tbWnp6dHR0cmJiYqKirs7OwnJycaGhr39/f09PQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABCQkJmZma2trZcXFwSEhI7Ozs0NDQ5OTlSUlITExMdHR0jIyMwMDDU1NQWFhaOjo78/PzPz8+4uLgvLy/q6upGRkZTU1Pb29txcXG+vr4pKSkXFxcgICAsLCxaWloeHh6qqqqfn58UFBR1dXXo6OgAAAAAAAAAAAA4ODhISEi/v79UVFSPj4+oqKienp5WVlYiIiKmpqbX19cbGxurq6s9PT3p6ekVFRUzMzN6enqJiYn7+/s+Pj4hISHi4uIuLi4AAABNTU3T09N0dHTv7+/h4eHu7u60tLSioqLn5+ff39+dnZ3k5ORBQUF+fn55eXmbm5uAgIA/Pz8xMTE2NjbS0tIlJSVMTEwODg5ycnIfHx8oKCjc3NwcHBwAAAAAAAAAAAAAAAAAAAAZGRlbW1sAAAAAAAAAAAAAAADm5uZtbW1DQ0Pj4+PDw8NQUFCxsbEAAAC3t7ft7e2Li4sAAABnZ2cAAAArKyvIyMjCwsLR0dG6urpZWVlERETFxcWzs7PW1tapqallZWX6+vre3t5jY2OcnJxKSkpiYmK7u7uWlpbMzMzw8PD29vbAwMDKysrl5eWQkJDa2tp8fHxAQEBXV1eurq5gYGBqampdXV08PDxRUVGMjIzOzs5YWFi8vLxOTk7g4ODy8vJkZGSamppsbGx9fX03NzesrKx7e3uCgoKUlJSRkZGKiooAAACysrIAAADV1dUAAABvb2/d3d2FhYW5ubkAAAAAAABFRUWVlZULCwt3d3eTk5NhYWHQ0NDExMS9vb2tra2Dg4NVVVWkpKQyMjI1NTWlpaXLy8tPT08Yd5qFAAAA7nRSTlP//wD/////////////////////////////Nf///////////////////////w1Y/fH1i/Iowf/////////////////////////////////////////////////RyqX///////////////////////////////+G//////////////////////////////////////8tATaJEP//1CfTEf////////8C////iv8s/////////////////////////////////////////////////////////////////////////6b/NP/L/////4TSrVk+ZAAACRNJREFUeNqtmHdYFNcWwM+E7SxlgaUsUqUIaGIJvRfp0qtK79KkiICiKIiFqqmmiIWoIWLD3gBjV7D3Es3Ly0tI7z15d2a2zczufprP+WPvzi2/ueWcc8858ILyM/mVKQtmvwhP9bw4e8GUVyZThoPi76uvvT7nJXim56U5r7/2qiqY2dyp8C+eqXPNGLA3pk3Hm97MWC/SespHtD7DGB8zfdobVNiMl1GtMFNio409w6NtI8kUooEvz1CGzXgLVRnYmmPP/JjbGqChb81QwN5+B4BrMgH7V88EEy7AO2/LYO+iNQomahowU1vbUH3rRAFa6btS2DQ0LzUsQ+0NWU96s+1cN9a55WSNqKOhuU0jYWZIuExUdjq5aeHm3I/rtxiRUqBr79bXoLKjCRI5Mxz23n/Q3qvar8ateXl9oYvQv21h+UKpWIVvj1C1b+gU5r6HYGZTgefObP/Qo8CTB8AryF+Mb9cn9jIpdShUQXPnwdT/Itj7AJEz6Y2n1uvKZVw/6lNUU+Qle2f1OzJPKBLg/Rdg8v+A3URrWvKZKUVliktQ5el58nfXpQxaExvmTIYPpoNxNLWhz4GugNwzqPrzSfJ377N0WLQxTP8ApgD4UHTIYpzHVGd2M2r5gku+CDkwi75SbR9AqAUAHsq1pb5UDAeRdvhl+segtllSETEoy46xpNE8AL6ErwBmKdUt+1oH7y/myGBOyyEgZ6ChJXAb+lAs6LBANy689dzmnTQY+tBsQHZVS1HlmB1uxQKIPw8sfRYB469IuGCO7ar3bkHN3wAfSVT4xdJtkkvOVJgWAGGiFTDLzxLLA43FVhXG34oDk5BUAPgn7/4Qw0L9R9vQNkWsXJUiyhhDavYdfysDBlSY+1Bl9uVU6z3fWxULWkpsm6/o7b1qMf/7ym9+EKwOQ0wsOWfDYP2P+3Yu3sLKdtEMc/xkifOy/qiqn9bsT2nedQDDYmzx6hgeX8gDoe98DLumOy83Scy9fjA2SfyzZtjuNUgTl/6StXvgUETWjZuVOXmFt24HnY0hBSzVBsOcDSBgOUB1VHwBpJlrgrlcT7Hd7RjzxO5me6ADx8gPWTlBtd1Gtw4+2Q9XygoksU6g7x3Ih4TDmmBhgeVG5XcSWNxOorqMZPB5nlI5EdUkV57jgxXS0uAdXODf1QQT1ZqG83gsmYRNMqKpwd4jbH6vJ7AMrEAfF6B8C/Uwl8upvCS2Ymx8HQ1m+mtg4BgqjRLI94Bd6mGHU5GkKo3lVZjSaF9P4vr+5gc8O3L2Or+rh/3Eoo3tyqe+J2XqA7vgDzasdCIrRs3VwhbLR+mRO27dp0uB6cnmbfQnWVrffgpYNWkHWUdHVfsXesfIr3GD1MJuKHarLYP8cogALzr16LRjfqSVK1ELs1Hs9+pTx7yOl9n9tSS3yjVy47078TR7WetDlvfVwpzPS98FLVnalpZ/bV+xPi25hjAmjbkCCkxcR4pQlHqhlbABjeH0S/4mxG6Xgw5wrFfMx19uxcl2gDS/HVZEuapBLczyArQ/AP2U6Nyz+FUZJPoBoLsnagD9X0t4YuBTeOJAFf7nMqn7pkXqrcY2X2j9Azx7HEJwC++inQeQs698vwL2IDPhny34CpMiyaEPNRjHk9uv2C6HR36xuLtw6PM1iR1HTYjjtwmmnoBONnFVQJoGGIal1zTD0eX38GUa1pQ0rcjbRFQP0zXLNZ4szDXBMGwcOh6tpd+xJ/RpMHvSW1hXoxnWC242jNs/j3HH1xGarHNCM2wPK4Xp5VQwVMqOFI5KjTBDV3/bJUtp6zTfwoDVkg6Jr6EmmMWqWMeB0zSPbkIsAxa3mij8HTXBSo3aXZYtpK3y02+ZlmMeYTk47ppg0cHi9Iv0E3hIs5ssLrBWkrakVRPsmi6E7dszNETxmT6iTUvoj248MfF3pbMGWBgbDlr42CWODSl5bRdImymfH78dSZoxsFCF2EYDLAV5UQt/d3cpslGEERaE+erUEsph6EDiuoGLr7RJA+xXVGFyuET5SsROJ+HdvE4oZoauVG486KLVwnGVMMJwYUfwQJHmAP9I3O0fRcvtLW8dOoROEOIXaO2ICljjMFFsxGvqaV4+semhi8pkrimHXDDHG11fgr+ZsENdhHCNED6B6TAFdhevm9cwJHWQuZ6yGZbjlknChA2uJqR+Daly/8xXhrUQitMBUt8hVX4h1Hajn14m7LHRErw4QA5gP9rk7FIaFHb0AC4gaaRBnHVMOjO59+yAW++VMxmwj3UI/zlR1u9Nh55iMbJiBy3JjmyvLOwMmya8k6xxmxbBgI3D3nQMu4h21JNPGdCGYSG4LiLzLeHQTSQO0xuWw6Suu3MIDxLcEpF11nPjUgbo/ow9xtUxbUNyN13b7fFl6vTJXXdpUDHyeLm0Q4UInbnyeiKbiNNjxekwTEc7LrVwVx5USMMd864Qa0Ic7w+KQWivvB42a891NRmSasLnCJGHO7JALDk8WWt17fHBRm+knHspQy45FwWrhhUTO3JGHojJQkRLu+Dtg8vSw8JRa/555RFHkJ5eTFXFYnPZsmWSIaI8eF2aAeLYAHx9wbmKocZjK4j4bfBPlTQiUn5I+ikoeFWE1em9pO3ULVSyhXEyo+tYScg9D/8a36nYStFFECoPq5UD/tD71dauHjeG45Q+7iu1kSNtug788itGbL0dD7xXVfWn7ZD1sEbbYCsN+CmpCJMjRaV4dOMk92bJW9Twi1VOlVebrq7rHg9ynLDosHuX792D0h5pSqkISpIk1HSdPRKngjSFTBVswLS3dpSN7j+1VksnsVGm/Gt+G+ol2juHlZIk1PSNBBeCnp33lBaas9iO47rZPOj2d9CmZEzS838h/OguSvqGmli6JQmZGJFeLEfxOXoB9oWHsGsNQ5wnFCu3P7EEafFxZ2piiZnyqpSz/Nw4otBlGDawucZzjJapGpdUCUMwC2rKi5GMW9Qjh/V7eZ1ENZsuuYQIimhX80LRqBu2lZ6Mo6cJm2X+IcfonP4+vKatHsuMYuRs7vRH1THThEoJTA+RllaAVL7jywICBKJWrdZ6v5tpplUVtASmh5NAZQLz+aZWn3PS9zmko/8PyuU15xLdpb0AAAAASUVORK5CYII=") center/cover no-repeat;
}

/* Assistant Message Frosted Glass Refinement */
html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-content'] {
  padding: 12px 18px !important;
  border-radius: 12px !important;
  border: none !important;
  box-shadow: none !important;
  line-height: 1.65 !important;
  max-width: min(85%, calc(100% - 80px)) !important;
  overflow-wrap: break-word !important;
  word-break: break-word !important;
  box-sizing: border-box !important;
}

/* Markdown Typography within Assistant Bubble */
html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-content'] :is(h1, h2, h3, h4) {
  color: #e0f2fe !important;
  font-weight: 600 !important;
  margin-top: 0.9em !important;
  margin-bottom: 0.35em !important;
  line-height: 1.35 !important;
}

html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-content'] p {
  margin-bottom: 0.65em !important;
}

html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-content'] p:last-child {
  margin-bottom: 0 !important;
}

html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-content'] :is(ul, ol) {
  padding-left: 20px !important;
  margin-bottom: 0.65em !important;
}

html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-content'] li::marker {
  color: #93c5fd !important;
}

/* Frosted Glass Tables */
html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-content'] table {
  border-collapse: separate !important;
  border-spacing: 0 !important;
  border: 1px solid rgba(147, 197, 253, 0.25) !important;
  border-radius: 8px !important;
  display: block !important;
  overflow-x: auto !important;
  max-width: 100% !important;
  margin: 10px 0 !important;
  width: 100% !important;
}

html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-content'] th {
  background: rgba(14, 46, 84, 0.70) !important;
  color: #bfdbfe !important;
  padding: 6px 12px !important;
  font-weight: 600 !important;
  border-bottom: 1px solid rgba(147, 197, 253, 0.25) !important;
  text-align: left !important;
}

html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-content'] td {
  padding: 6px 12px !important;
  border-bottom: 1px solid rgba(147, 197, 253, 0.12) !important;
  color: #f1f5f9 !important;
}

html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-content'] tr:last-child td {
  border-bottom: none !important;
}

html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-content'] tr:hover td {
  background: rgba(255, 255, 255, 0.04) !important;
}

/* Inline Code & Code Blocks */
html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-content'] code:not(pre code) {
  background: rgba(14, 46, 84, 0.55) !important;
  color: #93c5fd !important;
  padding: 2px 6px !important;
  border-radius: 4px !important;
  font-size: 0.88em !important;
  border: 1px solid rgba(147, 197, 253, 0.20) !important;
  word-break: break-all !important;
}

html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-content'] pre {
  background: rgba(6, 20, 42, 0.70) !important;
  border: 1px solid rgba(147, 197, 253, 0.22) !important;
  border-radius: 8px !important;
  padding: 10px 14px !important;
  padding-right: 52px !important;
  margin: 8px 0 !important;
  overflow-x: auto !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
}

/* Native Code Card Flattening (single visual container inside prose).
   Hermes wraps a fenced block in a rounded card, and react-shiki nests a
   SECOND pre inside the outer one — the blanket rule above matched both, so one
   snippet drew two dark bordered frames and doubled the inset. The card also
   mounts an overflow cue when the code is taller than the scroller: a
   full-width strip coloured by --expandable-fade-from and faded to transparent.
   That strip is a background-image, not a box-shadow, so no amount of
   box-shadow:none could remove the band it leaves under the card. Its right-hand
   end holds the only ∨ toggle, so the strip stays in the layout and only its
   paint goes.

   The frame therefore lives on the CARD, never on a pre: CodeCardBody ships
   [&_pre]:bg-transparent!, and an !important declaration inside @layer
   utilities outranks an unlayered !important however specific the latter is —
   verified against the built sheet. Padding stays on the outer Pre, which keeps
   the 52px copy-button corridor without the inner pre doubling it.
   Scoped to the card: the bubble surfaces keep their own paint. */
html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-content'] [data-slot='code-card'] {
  --expandable-fade-from: transparent !important;
  background: rgba(6, 20, 42, 0.62) !important;
  border: 1px solid rgba(147, 197, 253, 0.22) !important;
  box-shadow: none !important;
}

html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-content'] [data-slot='code-card'] [class*='bg-linear-to-t'] {
  background: transparent !important;
  background-image: none !important;
  pointer-events: none !important;
}

/* !important is load-bearing: it is the only way to beat the
   code-card-stream-glow @keyframes, and it outranks the card's own accent ring
   shadow while the answer is still streaming. */
html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-content'] [data-slot='code-card'] .aui-shiki {
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  margin: 0 !important;
}

html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-content'] [data-slot='code-card'] .aui-shiki :is(pre, code, .shiki) {
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  padding: 0 !important;
  margin: 0 !important;
  overflow: visible !important;
}

/* --------------------------------------------------------------------------
   2. User Long Message Collapse
   -------------------------------------------------------------------------- */
html[data-bubbles-skin='true'] [data-slot='aui_user-message-root'] .composer-human-message,
html[data-bubbles-skin='true'] [data-slot='aui_edit-composer-root'] .composer-human-message {
  overflow-wrap: break-word !important;
  word-break: break-word !important;
  box-sizing: border-box !important;
}

html[data-bubbles-skin='true'] [data-slot='aui_user-message-root'] .sticky-human-clamp,
html[data-bubbles-skin='true'] [data-slot='aui_edit-composer-root'] .sticky-human-clamp,
html[data-bubbles-skin='true'] .sticky-human-clamp {
  display: block !important;
  width: 100% !important;
  height: auto !important;
  visibility: visible !important;
  opacity: 1 !important;
  color: inherit !important;
  max-height: none !important;
  overflow: visible !important;
  -webkit-mask-image: none !important;
  mask-image: none !important;
  mask: none !important;
  -webkit-mask: none !important;
}

html[data-bubbles-skin='true'] [data-slot='aui_user-message-root'] [data-slot='aui_user-message-text'],
html[data-bubbles-skin='true'] [data-slot='aui_user-message-root'] [data-slot='aui_user-inline-text'],
html[data-bubbles-skin='true'] [data-slot='aui_user-message-root'] .sticky-human-clamp > div {
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
  color: inherit !important;
  max-height: none !important;
  overflow: visible !important;
  word-break: break-word !important;
  overflow-wrap: anywhere !important;
  white-space: pre-wrap !important;
}

html[data-bubbles-skin='true'] [data-slot='aui_user-message-root'][data-bubbles-long-user='true'] .composer-human-message {
  padding-bottom: 32px !important;
  position: relative !important;
}

/* Edit mode forces normal compact bottom padding */
html[data-bubbles-skin='true'] [data-slot='aui_user-message-root'][data-bubbles-editing='true'] .composer-human-message,
html[data-bubbles-skin='true'] [data-slot='aui_edit-composer-root'] .composer-human-message {
  padding-bottom: 6px !important;
}

/* Collapsed state with clean overflow clipping (ZERO shadow, ZERO gradient overlay) */
html[data-bubbles-skin='true'] [data-slot='aui_user-message-root'][data-bubbles-long-user='true']:not([data-bubbles-user-expanded='true']):not([data-bubbles-editing='true']) .sticky-human-clamp {
  position: relative;
  max-height: ${CLAMP_LINE_THRESHOLD_PX}px !important;
  overflow: hidden !important;
  -webkit-mask-image: none !important;
  mask-image: none !important;
  mask: none !important;
  -webkit-mask: none !important;
}

/* Expanded state & Edit mode: completely remove bottom gradient fade, shadow truncation, and masks */
html[data-bubbles-skin='true'] [data-slot='aui_user-message-root'][data-bubbles-user-expanded='true'] .sticky-human-clamp,
html[data-bubbles-skin='true'] [data-slot='aui_user-message-root'][data-bubbles-editing='true'] .sticky-human-clamp,
html[data-bubbles-skin='true'] [data-slot='aui_edit-composer-root'] .sticky-human-clamp {
  max-height: none !important;
  overflow: visible !important;
  -webkit-mask-image: none !important;
  mask-image: none !important;
  mask: none !important;
  -webkit-mask: none !important;
}

/* Complete elimination of ::after shadow, gradient, and mask in ALL states */
html[data-bubbles-skin='true'] [data-slot='aui_user-message-root'][data-bubbles-user-expanded='true'] .sticky-human-clamp::after,
html[data-bubbles-skin='true'] [data-slot='aui_user-message-root'][data-bubbles-long-user='true'] .sticky-human-clamp::after,
html[data-bubbles-skin='true'] [data-slot='aui_user-message-root'][data-bubbles-editing='true'] .sticky-human-clamp::after,
html[data-bubbles-skin='true'] [data-slot='aui_edit-composer-root'] .sticky-human-clamp::after,
html[data-bubbles-skin='true'] .sticky-human-clamp::after {
  display: none !important;
  content: none !important;
  background: none !important;
  box-shadow: none !important;
}

/* Expand / Collapse Pill Button */
.bubbles-user-expand-btn {
  position: absolute !important;
  right: 10px !important;
  bottom: 6px !important;
  z-index: 45 !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 4px;
  padding: 2px 10px;
  font-size: 11px;
  font-family: inherit;
  line-height: 16px;
  color: #bfdbfe;
  background: rgba(13, 42, 77, 0.75);
  border: 1px solid rgba(147, 197, 253, 0.35);
  border-radius: 9999px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  cursor: pointer;
  outline: none;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  /* hover moves colour/border/shadow and lifts with transform; active resets it. */
  transition: background-color 0.2s cubic-bezier(0.16, 1, 0.3, 1),
              color 0.2s cubic-bezier(0.16, 1, 0.3, 1),
              border-color 0.2s cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
}

.bubbles-user-expand-btn:hover {
  background: rgba(37, 99, 235, 0.85);
  color: #ffffff;
  border-color: rgba(147, 197, 253, 0.75);
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.45);
  transform: translateY(-0.5px);
}

.bubbles-user-expand-btn:active {
  transform: translateY(0);
}

.bubbles-expand-chevron {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg);
  transition: transform 0.2s ease;
  margin-top: -2px;
}

[data-bubbles-user-expanded='true'] .bubbles-expand-chevron {
  transform: rotate(-135deg);
  margin-top: 2px;
}

/* --------------------------------------------------------------------------
   3. Thinking & Status Surface (Subordinate Visual Hierarchy)
   -------------------------------------------------------------------------- */
/* Bare text on the bubble. A thinking row is a one-line disclosure, not a card —
   the frame made it compete with the paragraph above it. The chevron and the
   shimmer stay, so the affordance survives without the box. */
html[data-bubbles-skin='true'] [data-slot='aui_thinking-disclosure'] {
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  margin: 1px 0 !important;
  padding: 1px 0 !important;
  font-size: 12px !important;
  color: rgba(191, 219, 254, 0.72) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  transition: color 0.2s ease !important;
}

/* The :hover rules clear the frame, so they must exclude the expanded state —
   they tie with the frame rule on specificity and would win on order alone. */
html[data-bubbles-skin='true'] [data-slot='aui_thinking-disclosure']:hover:not(:has(> [data-slot='aui_thinking-body'])) {
  background: transparent !important;
  border-color: transparent !important;
  color: #ffffff !important;
}

html[data-bubbles-skin='true'] [data-slot='aui_thinking-body'] {
  padding-top: 2px !important;
  margin-top: 2px !important;
  color: rgba(226, 232, 240, 0.72) !important;
  font-size: 11.5px !important;
  line-height: 1.6 !important;
}

/* --------------------------------------------------------------------------
   4. Tool Calls Compact Glass Card & Clean Transcript Grouping (Phase 4)
   -------------------------------------------------------------------------- */
/* Tool Group Header Container */
.bubbles-tool-group {
  margin: 6px 0 !important;
  display: block !important;
}

/* Tool Group Summary Toggle — a text row, not a capsule. With the rows beneath it
   flat, a pill would be the only box left and would read as another card. */
.bubbles-tool-group-toggle {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 1px 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  color: rgba(148, 163, 184, 0.92) !important;
  font-size: 11.5px !important;
  font-weight: 500 !important;
  font-family: inherit !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  cursor: pointer !important;
  user-select: none !important;
  outline: none !important;
  transition: color 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.bubbles-tool-group-toggle:hover {
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
  color: #e2e8f0 !important;
}

.bubbles-tool-group-toggle:active {
  transform: translateY(0);
}

/* Toggle Chevron */
.bubbles-group-chevron {
  display: inline-block !important;
  width: 5px !important;
  height: 5px !important;
  border-right: 1.5px solid currentColor !important;
  border-bottom: 1.5px solid currentColor !important;
  transform: rotate(-45deg) !important; /* Points right ▸ */
  transition: transform 0.2s ease !important;
  margin-top: -1px !important;
}

[data-group-state='expanded'] .bubbles-group-chevron,
.bubbles-tool-group-toggle[aria-expanded='true'] .bubbles-group-chevron {
  transform: rotate(45deg) !important; /* Points down ▾ */
  margin-top: -3px !important;
}

/* Checkmark Icon in Summary */
.bubbles-group-icon {
  display: inline-flex !important;
  align-items: center !important;
  color: #4ade80 !important;
  font-size: 11px !important;
  opacity: 0.90 !important;
}

.bubbles-tool-group[data-tool-count]:not([data-tool-count='1']) .bubbles-group-icon {
  display: none !important;
}

/* Tool rows are content, not cards. This single rule is what drew a glass box
   around every 已运行 / 已读取 row AND around the ToolRun group that holds them
   (the nine-row frame in the user's screenshot), because both layers carry
   data-slot='tool-block'. State now reads from the glyph slot and the text
   colour, so nothing here may paint. */
html[data-bubbles-skin='true'] [data-slot='tool-block'] {
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  margin: 1px 0 !important;
  padding: 1px 0 !important;
  font-size: 12px !important;
  transition: color 0.2s ease !important;
  overflow-wrap: break-word !important;
  word-break: break-word !important;
  box-sizing: border-box !important;
  max-width: 100% !important;
}

/* An open ToolEntry paints its own frame (fallback.tsx:114
   rounded-[0.3125rem] border border-(--ui-stroke-tertiary)) and underlines its
   header — both are the box coming back through the app's side of the door. */
html[data-bubbles-skin='true'] [data-slot='tool-block'][data-tool-open] > div:first-child {
  border-bottom: 0 !important;
  background: transparent !important;
}

html[data-bubbles-skin='true'] [data-slot='tool-block']:hover:not([data-tool-open]) {
  background: transparent !important;
  border-color: transparent !important;
}

/* Expanded = framed, at rest = bare text — and the frame wraps the DETAIL, never
   the title line. Framing the row made the same title read two different ways: a
   standalone row keeps its native header so the title landed inside the box, while a
   single-tool group hides that header (data-bubbles-duplicate-header) and shows the
   skin's pill above the box, so the identical title looked outside it. That was the
   ✓-outside / ✗-inside split reported from the live window.
   The three targets are the three containers the host renders only while open:
     thinking body            message-parts.tsx:287
     ToolEntry body           fallback.tsx:635  (the row's second child; the header
                              wrapper at :580 is first, and 635-745 is one div)
     ToolRun members          fallback.tsx:1025 (the sibling after [data-tool-summary])
   The members wrapper needs the aria-expanded guard because a collapsed *live* run
   renders a ticker in the same slot (fallback.tsx:1024) and that stays bare.
   Sitting on the detail also escapes the inner-row flatten rule (plugin.js:898,
   (0,5,1) on a ToolEntry nested in a ToolRun), which is why every grouped row —
   Unnamed call, Process Manage poll, 已运行代码 — showed no frame at all while a
   top-level file edit (config.yaml, which never joins a run) did. */
html[data-bubbles-skin='true'] [data-slot='aui_thinking-body'],
html[data-bubbles-skin='true'] [data-slot='tool-block'][data-tool-open][data-tool-row] > :not(:first-child),
html[data-bubbles-skin='true'] [data-slot='tool-block'][data-tool-group]:has([data-tool-summary] button[aria-expanded='true']) > [data-tool-summary] + div {
  background: rgba(147, 197, 253, 0.05) !important;
  border: 1px solid rgba(147, 197, 253, 0.22) !important;
  border-radius: 8px !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  margin: 4px 0 !important;
  padding: 6px 10px !important;
}

/* One box per visual layer. A row opened INSIDE an already-framed run already sits in
   the run's frame, so a second hairline around it read as a card in a card — it steps
   down to the same 2px rail the collapsed grouped rows use, which keeps the "this
   detail belongs to that line" cue without competing edges.
   The :has([data-tool-summary] …) guard is what makes that rule mean something: a run
   of ONE tool renders no summary at all (fallback.tsx:1014 gates on count > 1) and is
   always expanded, so its wrapper paints no frame and its only row must take the full
   frame like any standalone row. Without the guard, 已运行 sed showed a rail while the
   bubbles.yaml edit beside it showed a frame — two identical-looking rows, treated
   differently by an invisible wrapper. */
html[data-bubbles-skin='true'] [data-slot='tool-block'][data-tool-group]:has([data-tool-summary] button[aria-expanded='true']) [data-slot='tool-block'][data-tool-open][data-tool-row] > :not(:first-child) {
  background: transparent !important;
  border: none !important;
  border-left: 2px solid rgba(96, 165, 250, 0.45) !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  margin: 2px 0 2px 2px !important;
  padding: 2px 0 2px 8px !important;
}

/* Two surfaces the rules above never reached, because neither emits data-tool-open
   or data-tool-row: a delegate_task card row (message-parts.tsx:102 →
   delegate.tsx:159/95) wore the app's grey stroke, and an Agents-view node
   (app/agents/index.tsx:352) revealed its stream with no edge at all. Both now borrow
   the transcript hairline, and the agents frame wraps only what the node reveals —
   the title button stays outside it, exactly like a transcript row.
   The children wrapper (index.tsx:411) is deliberately left alone: a nested node
   frames its own stream, so boxing the subtree would frame frames. */
html[data-bubbles-skin='true'] [data-slot='tool-block'][data-delegate-card] > div,
html[data-bubbles-skin='true'] [data-slot='tool-block']:has(> button[aria-expanded='true']) > [data-selectable-text='true'] {
  background: rgba(147, 197, 253, 0.05) !important;
  border: 1px solid rgba(147, 197, 253, 0.22) !important;
  border-radius: 8px !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  margin: 4px 0 !important;
  padding: 6px 10px !important;
}

/* The agents stream carries its column indent as pl-6 inside the wrapper. Under a
   frame that reads as 24px of empty gutter on the left of the box, so the indent
   moves outside it and the frame lines up with the title text instead. */
html[data-bubbles-skin='true'] [data-slot='tool-block']:has(> button[aria-expanded='true']) > [data-selectable-text='true'] {
  margin-left: 24px !important;
}

/* Inside that frame, a <pre> must not paint its own card. The assistant-bubble
   code-block rule (line ~335) gives every pre a dark fill, a hairline and an 8px
   radius, so an opened tool call rendered as two nested boxes — the exact
   "外框看起来很复杂、花眼" the flattening was asked to remove. The 52px right pad
   is the copy-button gutter, which a tool block has no copy button for. */
html[data-bubbles-skin='true'] [data-slot='tool-block'][data-tool-open] pre,
html[data-bubbles-skin='true'] [data-slot='aui_thinking-body'] pre {
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  padding: 2px 0 !important;
  margin: 2px 0 !important;
}

/* Collapsed Grouped Tools (Strict Complete Hiding: Never Deleted, Completely Hidden) */
html[data-bubbles-skin='true'] [data-slot='tool-block'][data-bubbles-group-collapsed='true'] {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  max-height: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  border: 0 !important;
  overflow: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

html[data-bubbles-skin='true'] [data-bubbles-group-collapsed='true'] {
  display: none !important;
}

/* Expanded Grouped Tools: Flatten outer container into clean indented content block (Single Visual Layer)
   :not([data-tool-open]) is required, not cosmetic. This rule ties with the frame
   rule on specificity (0,4,1) and sits later in the file, so before it excluded
   open rows the transcript framed a FAILED row (which stands alone, because only
   consecutive completed tools get grouped) while a grouped SUCCESS row kept the
   2px rail and no frame — the exact inconsistency reported from the live window. */
html[data-bubbles-skin='true'] [data-slot='tool-block'][data-bubbles-in-group='true'][data-bubbles-group-collapsed='false']:not([data-tool-open]),
html[data-bubbles-skin='true'] [data-bubbles-tool-flat='true'][data-bubbles-in-group='true'][data-bubbles-group-collapsed='false']:not([data-tool-open]) {
  display: block !important;
  background: transparent !important;
  border: none !important;
  border-left: 2px solid rgba(96, 165, 250, 0.45) !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  margin-left: 12px !important;
  margin-top: 4px !important;
  margin-bottom: 6px !important;
  padding: 2px 0 2px 10px !important;
}

/* Flatten child disclosure / header inside grouped tools to eliminate duplicate nested cards */
html[data-bubbles-skin='true'] [data-slot='tool-block'][data-bubbles-in-group='true'] :is(
  header,
  .group\\/disclosure-row,
  button.group\\/disclosure-row
) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

/* Single completed tool group: Bubbles group toggle pill is already the primary visible title and toggle trigger.
   Hide the duplicate native disclosure header inside the single tool block to prevent repetitive titles. */
html[data-bubbles-skin='true'] .bubbles-tool-group[data-tool-count='1'] + [data-slot='tool-block'] > :is(
  header,
  .group\\/disclosure-row,
  button.group\\/disclosure-row
),
html[data-bubbles-skin='true'] [data-bubbles-duplicate-header='true'] {
  display: none !important;
}

/* Tool State Variations — a mark in the glyph slot, and nothing else. No boxes,
   and deliberately no row-wide colour: a blanket colour here also dyed the
   duration badges, so a run of failures turned the whole transcript salmon. The
   app already tints the title itself (fallback.tsx:321 text-destructive for
   error, :319 scaffold-meta + shimmer while pending), so the row keeps its own
   hierarchy and we only add the symbol. */
html[data-bubbles-skin='true'] [data-bubbles-tool-state='running'] {
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  animation: none !important;
  display: block !important;
  opacity: 1 !important;
}

/* The row already animates itself — GlyphSpinner with spinner='breathe'
   (fallback.tsx:198-225). It only inherits the sapphire the card used to carry. */
html[data-bubbles-skin='true'] [data-bubbles-tool-state='running'] .glyph-spinner {
  color: #60a5fa !important;
}

/* 运行态工具：子层保持透明，运行由外层文字变蓝 + App 自带转圈表示 */
html[data-bubbles-skin='true'] [data-slot='tool-block'][data-bubbles-tool-state='running'] :is(
  header,
  .group\\/disclosure-row,
  button.group\\/disclosure-row
) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

/* Completed: quiet text, and a check in the glyph slot. The app suppresses its own
   success glyph (leadingStatus maps success/notice to undefined, fallback.tsx:263),
   so a finished row otherwise looks identical to a pending one. */
html[data-bubbles-skin='true'] [data-bubbles-tool-state='completed']:not([data-bubbles-group-collapsed='true']) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  opacity: 0.86 !important;
}

/* Failed: red text + ✗ over the app's AlertCircle, instead of a red container. */
html[data-bubbles-skin='true'] [data-bubbles-tool-state='failed'] {
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  display: block !important;
  opacity: 1 !important;
}

/* The glyph slot carries the state. TOOL_HEADER_GLYPH_WRAP_CLASS is
   'grid size-3.5 shrink-0 place-items-center self-center' (scaffold-row.tsx:27);
   the type glyph goes display:none rather than being removed — flatten, never
   delete — so the terminal/file/eye icon comes back with one rule if the checks
   turn out to be too much of a wall. */
html[data-bubbles-skin='true'] [data-slot='tool-block'][data-tool-row] span[class*='size-3.5'] {
  position: relative;
}

html[data-bubbles-skin='true'] :is([data-bubbles-tool-state='completed'], [data-bubbles-tool-state='failed']) span[class*='size-3.5'] > :first-child {
  display: none !important;
}

html[data-bubbles-skin='true'] :is([data-bubbles-tool-state='completed'], [data-bubbles-tool-state='failed']) span[class*='size-3.5']::after {
  content: '✓';
  display: block;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

html[data-bubbles-skin='true'] [data-bubbles-tool-state='completed'] span[class*='size-3.5']::after {
  color: rgba(74, 222, 128, 0.85);
}

html[data-bubbles-skin='true'] [data-bubbles-tool-state='failed'] span[class*='size-3.5']::after {
  content: '✗';
  color: #f87171;
}

/* Eliminate child red borders and child red backgrounds inside failed tool
   错误状态：子层不再画红框/红底，失败只由外层文字变红 + ✗ 字形表示。
   This list is the superset — the skin used to carry a five-branch copy that had drifted
   (no bg-red, no section variants) with an identical declaration body; test/sheet-
   duplication.test.js is what keeps a second copy from coming back. */
html[data-bubbles-skin='true'] [data-slot='tool-block'][data-bubbles-tool-state='failed'] :is(
  header,
  .group\\/disclosure-row,
  button.group\\/disclosure-row,
  div[class*='border-destructive'],
  div[class*='bg-destructive'],
  div[class*='bg-red'],
  section[class*='border-destructive'],
  section[class*='bg-destructive']
) {
  background: transparent !important;
  border-color: transparent !important;
  border-width: 0 !important;
  box-shadow: none !important;
}

/* Inner ToolEntry flattening (single visual container architecture).
   The outer ToolRun (data-tool-group) is the ONLY visual card; the inner
   ToolEntry (data-tool-row) is a structural wrapper. Strip its duplicate
   shell in every state (completed / running / failed). High specificity AND
   placed after all state rules so it always wins. "Flatten, never delete." */
html[data-bubbles-skin='true'] [data-slot='tool-block'][data-tool-group] [data-slot='tool-block'][data-tool-row] {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  padding: 0 !important;
  margin: 0 !important;
}

/* --------------------------------------------------------------------------
   5. Task Section UI & Independent Scrolling Container
   -------------------------------------------------------------------------- */
html[data-bubbles-skin='true'] [data-slot='composer-status-stack'][data-bubbles-has-task-section='true'] {
  overflow: hidden !important;
}

html[data-bubbles-skin='true'] [data-slot='composer-status-stack'][data-bubbles-has-task-section='true'] [data-slot='status-stack-scroll'] {
  overflow: hidden !important;
}

/* The outer stack is only a flex scroller (status-stack/index.tsx:321). It must
   not draw a frame — doing so put a box around the box, 20px wider than the card
   because the card carries mx-2. */
html[data-bubbles-skin='true'] [data-slot='composer-status-stack'] {
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

/* The dock card must NOT be framed. Its width does not come from --composer-width
   (measured live: card ~738 vs composer surface 612), so a border here draws a
   square-cornered rectangle around everything — the "outer frame" that cannot be
   aligned without reimplementing the composer's own width maths. */
/* The dock card must NOT be framed — but only when our own card exists. Clearing
   it unconditionally made the panel's visibility depend on the JS stamp: if
   enhanceTaskSection ever fails, the rows were left as bare text on the chat
   background with no card at all. :has() keeps the app's own card as the fallback. */
html[data-bubbles-skin='true'] [data-slot='composer-status-stack']:has([data-bubbles-task-section='true']) > div[class*='rounded-t-2xl'],
html[data-bubbles-skin='true'] :is([data-slot='composer-root'], [data-slot='composer-dock']):has([data-bubbles-task-section='true']) div.absolute.inset-x-0.bottom-full > div:first-child {
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

/* The one Tasks card: the section itself, and the ONLY block that declares this
   box — geometry and paint together. Two blocks for one element meant the winner
   depended on rule order. Rounded on all four corners, sapphire stroke,
   translucent #0d2a4d fill, and the page's own light spots pinned with
   background-attachment: fixed so it reads as glass on the same field as the
   composer rather than a dark slab floating over it. */
html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] {
  display: flex !important;
  flex-direction: column !important;
  min-height: 0 !important;
  max-width: 100% !important;
  margin: 4px 6px 6px !important;
  border: 1px solid rgba(147, 197, 253, 0.22) !important;
  border-radius: 14px !important;
  background:
    radial-gradient(950px 500px at 88% -5%, rgba(96, 165, 250, 0.30), transparent 60%),
    radial-gradient(400px 160px at 50% 0%, rgba(96, 165, 250, 0.18), transparent 70%),
    rgba(13, 42, 77, 0.42) !important;
  background-attachment: fixed, scroll, scroll !important;
  box-shadow: inset 0 1px 1px rgba(191, 219, 254, 0.26) !important;
  backdrop-filter: blur(16px) saturate(1.3) !important;
  -webkit-backdrop-filter: blur(16px) saturate(1.3) !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
  color: #f1f5f9 !important;
}

/* Task Section Header — no slab of its own; its rule doubles as the bar's track. */
html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] .status-section-header {
  background: transparent !important;
  border-bottom: 1px solid rgba(147, 197, 253, 0.12) !important;
  padding: 5px 8px !important;
}

html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] .status-section-trigger {
  color: #bfdbfe !important;
  font-size: 12px !important;
  font-weight: 500 !important;
}

html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] .status-section-trigger:hover {
  color: #ffffff !important;
}

/* Task Counter Pill Badge — retired. Hermes' own header prints 任务 n/m, and the
   pill duplicated it while also lying whenever the section collapsed (no rows in
   the DOM meant "0 / 0"). cleanupAll still removes one an older build left behind. */

/* Phase C fields — an index column and a completion bar.
 *
 * The index is a CSS counter rendered by the row's own ::before. That keeps the
 * "never add or remove DOM content" rule intact: a pseudo-element is not a node,
 * and status-row-content keeps exactly the children the renderer gave it. The
 * native row grid is action/icon/content/actions, so every cell shifts one column. */
html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] .status-section-body {
  counter-reset: bubbles-task;
}

html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] .status-row {
  counter-increment: bubbles-task;
  grid-template-columns: var(--status-index-width, 1.5rem) var(--status-action-width) var(--status-icon-width) minmax(0, 1fr) auto !important;
}

html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] .status-row::before {
  content: counter(bubbles-task, decimal-leading-zero);
  grid-area: 1 / 1;
  align-self: start;
  padding-right: 0.3rem;
  color: rgba(148, 163, 184, 0.70);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  line-height: 1rem;
  text-align: right;
}

html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] .status-row-dismiss { grid-column: 2; }
html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] .status-row-icon { grid-column: 3; }
html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] .status-row-content { grid-column: 4; }
html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] .status-row-actions { grid-column: 5; }

/* The bar's only input is --bubbles-task-progress, written by
 * updateTaskHeaderCounter from the completed/total it already counts. scaleX, not
 * width, so a tick repaints instead of reflowing the header row. */
html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] .status-section-trigger {
  position: relative;
}

html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] .status-section-trigger::after {
  content: '';
  position: absolute;
  /* bottom: 0 — the bar replaces the header's separator instead of lying on top
     of it (at -3px the two lines read as one thick smudge). */
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  border-radius: 9999px;
  background: linear-gradient(90deg, #60a5fa, #93c5fd);
  transform: scaleX(var(--bubbles-task-progress, 0));
  transform-origin: left center;
}

/* The running row's accent. bubbles.yaml line 70 flattens .status-row with
 * box-shadow / border none !important on purpose (Tool UI flattening), so any
 * row-level accent either loses outright or wins only by escalating the
 * !important war. A pseudo-element is not matched by that rule, so the bar lives
 * on ::after — absolutely positioned, which also means it cannot eat inner width
 * the way the sidebar's old border-left did. */
html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] .status-row {
  position: relative;
}

html[data-bubbles-skin='true'] [data-bubbles-task-row][data-task-state='running']::after {
  content: '';
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 0;
  width: 3px;
  border-radius: 9999px;
  background: #60a5fa;
  animation: bubblesTaskAccent 3s ease-in-out infinite;
}

@keyframes bubblesTaskAccent {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* Task Section Body - Isolated Scroll Area */
html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] .status-section-body {
  min-height: 40px !important;
  max-height: clamp(90px, 28vh, 320px) !important;
  overflow-y: auto !important;
  overscroll-behavior: contain !important;
  padding: 4px 6px !important;
  scrollbar-width: thin !important;
  /* Invisible at rest, revealed on hover (reference plugin.js:1911-1917): an
     always-on blue rail competes with the ambient light field. */
  scrollbar-color: transparent transparent !important;
}

html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] .status-section-body:hover {
  scrollbar-color: rgba(147, 197, 253, 0.25) transparent !important;
}

html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] .status-section-body::-webkit-scrollbar {
  width: 5px !important;
}

html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] .status-section-body::-webkit-scrollbar-thumb {
  background: transparent !important;
  border-radius: 9999px !important;
}

html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] .status-section-body:hover::-webkit-scrollbar-thumb {
  background: rgba(147, 197, 253, 0.30) !important;
}

html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] .status-section-body::-webkit-scrollbar-thumb:hover {
  background: rgba(147, 197, 253, 0.55) !important;
}

/* Task Item Row Styling — the reference's density (its plugin.js:1951-1958):
   24px rows, 1px vertical padding, 8px radius, no per-row margin, no border. The
   previous 4px/8px + 1px transparent border cost 30px per row, and that border was
   only ever visible as the pulse's animated ring — the ::after accent replaced it. */
html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] [data-slot='status-row'] {
  min-height: 24px !important;
  border: 0 !important;
  border-radius: 8px !important;
  gap: 6px !important;
  margin: 0 !important;
  padding: 1px 8px !important;
  transition: background 0.20s ease-out !important;
}

html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] [data-slot='status-row']:hover {
  background: rgba(255, 255, 255, 0.08) !important;
}

/* Task State Glyphs & Visual Hierarchy */
/* Pending: ○ */
html[data-bubbles-skin='true'] [data-bubbles-task-row][data-task-state='pending'] .status-row-icon {
  color: #93c5fd !important;
  opacity: 0.70;
}

/* Running: ◉ with gentle 3s pulse glow.
   The 3px accent is an inset shadow baked into BOTH keyframe stops: an animation
   outranks a normal author declaration, so a static box-shadow would be erased
   the moment the pulse starts, and a border-left would eat inner width (the exact
   bug Phase A removed from the sidebar rows). The static rule below is what the
   bar falls back to under prefers-reduced-motion, where the animation is off. */
@keyframes bubblesPulseGlow {
  0%, 100% {
    box-shadow: inset 3px 0 0 0 #60a5fa, inset 0 0 8px rgba(59, 130, 246, 0.20), 0 0 6px rgba(96, 165, 250, 0.15);
    border-color: rgba(96, 165, 250, 0.35);
  }
  50% {
    box-shadow: inset 3px 0 0 0 #60a5fa, inset 0 0 14px rgba(59, 130, 246, 0.35), 0 0 12px rgba(96, 165, 250, 0.30);
    border-color: rgba(96, 165, 250, 0.65);
  }
}

html[data-bubbles-skin='true'] [data-bubbles-task-row][data-task-state='running'] {
  background: rgba(30, 64, 175, 0.22) !important;
  animation: bubblesPulseGlow 3s ease-in-out infinite !important;
}

html[data-bubbles-skin='true'] [data-bubbles-task-row][data-task-state='running'] .status-row-icon {
  color: #60a5fa !important;
}

html[data-bubbles-skin='true'] [data-bubbles-task-row][data-task-state='running'] .status-row-content span {
  color: #ffffff !important;
  font-weight: 500;
}

/* Completed: ✓ */
html[data-bubbles-skin='true'] [data-bubbles-task-row][data-task-state='completed'] {
  opacity: 0.88 !important;
}

html[data-bubbles-skin='true'] [data-bubbles-task-row][data-task-state='completed'] .status-row-icon {
  color: #4ade80 !important;
}

html[data-bubbles-skin='true'] [data-bubbles-task-row][data-task-state='completed'] .status-row-content span {
  color: #94a3b8 !important;
}

/* Cancelled: ⊘ */
html[data-bubbles-skin='true'] [data-bubbles-task-row][data-task-state='cancelled'] .status-row-icon {
  color: #64748b !important;
  opacity: 0.60;
}

html[data-bubbles-skin='true'] [data-bubbles-task-row][data-task-state='cancelled'] .status-row-content span {
  color: #64748b !important;
  text-decoration: line-through;
}

/* Failed: ✕ (ui_error) */
html[data-bubbles-skin='true'] [data-bubbles-task-row][data-task-state='failed'] {
  background: rgba(239, 68, 68, 0.12) !important;
  border-color: rgba(248, 113, 113, 0.35) !important;
}

html[data-bubbles-skin='true'] [data-bubbles-task-row][data-task-state='failed'] .status-row-icon {
  color: #f87171 !important;
}

/* Warning / Waiting: ⚠ */
html[data-bubbles-skin='true'] [data-bubbles-task-row][data-task-state='waiting'] {
  background: rgba(245, 158, 11, 0.12) !important;
}

html[data-bubbles-skin='true'] [data-bubbles-task-row][data-task-state='waiting'] .status-row-icon {
  color: #fbbf24 !important;
}

/* --------------------------------------------------------------------------
   6. Approval & Clarify UX Enhancement (Phase 3 Core)
   -------------------------------------------------------------------------- */

/* Global Stacking & Clipping Defenses */
html[data-bubbles-skin='true'] [data-slot='tool-approval-stack'] {
  z-index: 50 !important;
  overflow: visible !important;
  margin-top: 8px !important;
  margin-bottom: 8px !important;
  pointer-events: auto !important;
}

/* Approval Card Surface */
html[data-bubbles-skin='true'] [data-slot='tool-approval-card'] {
  display: block !important;
  visibility: visible !important;
  overflow: hidden !important;
  opacity: 1 !important;
  border-radius: 14px !important;
  background:
    radial-gradient(400px 140px at 50% 0%, rgba(96, 165, 250, 0.22), transparent 70%),
    rgba(10, 32, 64, 0.92) !important;
  border: 1px solid rgba(147, 197, 253, 0.38) !important;
  box-shadow:
    0 12px 36px rgba(2, 18, 44, 0.55),
    inset 0 1px 1px rgba(255, 255, 255, 0.25) !important;
  backdrop-filter: blur(20px) saturate(1.4) !important;
  -webkit-backdrop-filter: blur(20px) saturate(1.4) !important;
  pointer-events: auto !important;
  margin-bottom: 4px !important;
  box-sizing: border-box !important;
  max-width: 100% !important;
}

/* Approval Header with Terminal Glyph */
html[data-bubbles-skin='true'] [data-slot='tool-approval-card'] > div:first-child {
  background: rgba(14, 46, 84, 0.70) !important;
  border-bottom: 1px solid rgba(147, 197, 253, 0.20) !important;
  padding: 8px 12px !important;
  color: #bfdbfe !important;
  font-weight: 600 !important;
  font-size: 12px !important;
}

html[data-bubbles-skin='true'] [data-slot='tool-approval-card'] > div:first-child .codicon-terminal {
  color: #60a5fa !important;
}

/* Approval Command Display Area */
html[data-bubbles-skin='true'] [data-slot='tool-approval-card'] pre {
  background: rgba(5, 18, 38, 0.85) !important;
  border: 1px solid rgba(147, 197, 253, 0.20) !important;
  border-radius: 8px !important;
  margin: 8px 10px !important;
  padding: 8px 12px !important;
  color: #f1f5f9 !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
  font-size: 12px !important;
  line-height: 1.55 !important;
  white-space: pre-wrap !important;
  word-break: break-all !important;
  max-height: clamp(100px, 24vh, 200px) !important;
  overflow: auto !important;
  scrollbar-width: thin !important;
  box-sizing: border-box !important;
}

html[data-bubbles-skin='true'] [data-slot='tool-approval-card'] pre::-webkit-scrollbar {
  width: 5px !important;
  height: 5px !important;
}

html[data-bubbles-skin='true'] [data-slot='tool-approval-card'] pre::-webkit-scrollbar-thumb {
  background: rgba(147, 197, 253, 0.30) !important;
  border-radius: 9999px !important;
}

/* Approval Actions Bar & Native Buttons Enhancement */
html[data-bubbles-skin='true'] [data-slot='tool-approval-actions'] {
  display: flex !important;
  align-items: center !important;
  justify-content: flex-end !important;
  gap: 8px !important;
  padding: 6px 12px 10px !important;
  background: transparent !important;
}

/* Allow / Run Button (Primary Action) */
html[data-bubbles-skin='true'] [data-slot='tool-approval-actions'] button[data-approval-run] {
  background: linear-gradient(135deg, #2563eb, #1d4ed8) !important;
  color: #ffffff !important;
  border: 1px solid rgba(147, 197, 253, 0.50) !important;
  border-radius: 8px !important;
  padding: 5px 14px !important;
  font-weight: 500 !important;
  font-size: 12px !important;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.40) !important;
  cursor: pointer !important;
  /* The gradient background never interpolated under a blanket transition
     either — background-image is not animatable between two gradients — so
     listing the two properties that really move keeps the hover identical. */
  transition: box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

html[data-bubbles-skin='true'] [data-slot='tool-approval-actions'] button[data-approval-run]:hover {
  background: linear-gradient(135deg, #3b82f6, #2563eb) !important;
  box-shadow: 0 0 14px rgba(59, 130, 246, 0.60) !important;
  transform: translateY(-0.5px);
}

/* Deny / Reject Button (Destructive/Secondary Action) */
html[data-bubbles-skin='true'] [data-slot='tool-approval-actions'] button[data-approval-deny] {
  background: rgba(14, 46, 84, 0.65) !important;
  color: #cbd5e1 !important;
  border: 1px solid rgba(147, 197, 253, 0.25) !important;
  border-radius: 8px !important;
  padding: 5px 12px !important;
  font-size: 12px !important;
  cursor: pointer !important;
  /* hover only repaints. */
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease !important;
}

html[data-bubbles-skin='true'] [data-slot='tool-approval-actions'] button[data-approval-deny]:hover {
  background: rgba(239, 68, 68, 0.22) !important;
  border-color: rgba(248, 113, 113, 0.50) !important;
  color: #f87171 !important;
}

/* More Options Button */
html[data-bubbles-skin='true'] [data-slot='tool-approval-actions'] button:not([data-approval-run]):not([data-approval-deny]) {
  background: rgba(14, 46, 84, 0.65) !important;
  border: 1px solid rgba(147, 197, 253, 0.25) !important;
  border-radius: 8px !important;
  color: #bfdbfe !important;
  font-size: 12px !important;
  transition: background-color 0.2s ease, color 0.2s ease !important;
}

html[data-bubbles-skin='true'] [data-slot='tool-approval-actions'] button:not([data-approval-run]):not([data-approval-deny]):hover {
  background: rgba(30, 64, 175, 0.50) !important;
  color: #ffffff !important;
}

/* Clarify Surface */
html[data-bubbles-skin='true'] [data-slot='clarify-inline'] {
  display: block !important;
  visibility: visible !important;
  overflow: visible !important;
  opacity: 1 !important;
  border-radius: 14px !important;
  background:
    radial-gradient(400px 140px at 50% 0%, rgba(96, 165, 250, 0.20), transparent 70%),
    rgba(10, 32, 64, 0.92) !important;
  border: 1px solid rgba(147, 197, 253, 0.35) !important;
  box-shadow:
    0 12px 36px rgba(2, 18, 44, 0.50),
    inset 0 1px 1px rgba(255, 255, 255, 0.22) !important;
  backdrop-filter: blur(20px) saturate(1.4) !important;
  -webkit-backdrop-filter: blur(20px) saturate(1.4) !important;
  z-index: 40 !important;
  padding: 14px 16px !important;
  margin: 10px 0 !important;
  box-sizing: border-box !important;
  max-width: 100% !important;
  overflow-wrap: break-word !important;
  word-break: break-word !important;
}

/* Clarify Question Headline */
html[data-bubbles-skin='true'] [data-slot='clarify-inline'] span.font-medium {
  color: #ffffff !important;
  font-weight: 500 !important;
  font-size: 13.5px !important;
  line-height: 1.5 !important;
}

/* Clarify Choice Buttons */
html[data-bubbles-skin='true'] [data-slot='clarify-inline'] button[data-choice] {
  border-radius: 8px !important;
  border: 1px solid rgba(147, 197, 253, 0.18) !important;
  background: rgba(13, 38, 72, 0.55) !important;
  color: #cbd5e1 !important;
  padding: 6px 10px !important;
  margin-bottom: 4px !important;
  /* hover repaints three; the highlighted/pressed state adds the glow. */
  transition: background-color 0.18s ease, border-color 0.18s ease,
              color 0.18s ease, box-shadow 0.18s ease !important;
  white-space: normal !important;
  text-align: left !important;
  word-break: break-word !important;
}

html[data-bubbles-skin='true'] [data-slot='clarify-inline'] button[data-choice]:hover {
  background: rgba(30, 64, 175, 0.40) !important;
  border-color: rgba(96, 165, 250, 0.45) !important;
  color: #ffffff !important;
}

html[data-bubbles-skin='true'] [data-slot='clarify-inline'] button[data-choice][data-highlighted],
html[data-bubbles-skin='true'] [data-slot='clarify-inline'] button[data-choice][aria-pressed='true'] {
  background: rgba(37, 99, 235, 0.45) !important;
  border-color: #60a5fa !important;
  box-shadow: 0 0 10px rgba(59, 130, 246, 0.30) !important;
  color: #ffffff !important;
}

/* Keypad Badges */
html[data-bubbles-skin='true'] [data-slot='clarify-inline'] kbd {
  background: rgba(10, 32, 64, 0.85) !important;
  border: 1px solid rgba(147, 197, 253, 0.35) !important;
  color: #93c5fd !important;
  border-radius: 4px !important;
  font-weight: 600 !important;
}

/* Clarify Textarea (Other Option) */
html[data-bubbles-skin='true'] [data-slot='clarify-inline'] textarea {
  background: rgba(6, 20, 42, 0.70) !important;
  border: 1px solid rgba(147, 197, 253, 0.30) !important;
  border-radius: 8px !important;
  color: #ffffff !important;
  padding: 6px 10px !important;
  font-size: 12px !important;
}

html[data-bubbles-skin='true'] [data-slot='clarify-inline'] textarea:focus {
  border-color: #60a5fa !important;
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.35) !important;
  outline: none !important;
}

/* Clarify Action Buttons (Skip & Continue) */
html[data-bubbles-skin='true'] form[data-clarify-choices] button[type='submit'] {
  background: linear-gradient(135deg, #2563eb, #1d4ed8) !important;
  color: #ffffff !important;
  border: 1px solid rgba(147, 197, 253, 0.50) !important;
  border-radius: 8px !important;
  padding: 5px 14px !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.40) !important;
  /* Same reasoning as the approval button: the gradient never interpolated. */
  transition: box-shadow 0.2s ease, transform 0.2s ease !important;
}

html[data-bubbles-skin='true'] form[data-clarify-choices] button[type='submit']:hover {
  background: linear-gradient(135deg, #3b82f6, #2563eb) !important;
  box-shadow: 0 0 14px rgba(59, 130, 246, 0.60) !important;
  transform: translateY(-0.5px);
}

html[data-bubbles-skin='true'] form[data-clarify-choices] button[variant='text'] {
  color: #94a3b8 !important;
  border-radius: 8px !important;
  font-size: 12px !important;
}

html[data-bubbles-skin='true'] form[data-clarify-choices] button[variant='text']:hover {
  color: #f1f5f9 !important;
  background: rgba(255, 255, 255, 0.08) !important;
}

/* --------------------------------------------------------------------------
   8. History & Session Navigation Layer (Phase 5A)
   -------------------------------------------------------------------------- */

/* Sidebar container: transparent. The 🌌 ambient light constellation lives in the
   fixed main background layer; a navy + blur panel here hid it and cut a hard
   rectangular seam through the Sessions column. Keep only the sapphire seam. */
html[data-bubbles-skin='true'] [data-slot='sidebar'],
html[data-bubbles-skin='true'] aside[data-slot='sidebar'],
html[data-bubbles-skin='true'] [data-slot='sidebar-container'] {
  background: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border-right: 1px solid rgba(147, 197, 253, 0.15) !important;
  /* No state rule changes anything on this container, so it needs no transition. */
}

html[data-bubbles-skin='true'] [data-slot='sidebar-inner'] {
  background: transparent !important;
}

/* Date Dividers & Group Headers */
html[data-bubbles-skin='true'] .group\\/workspace,
html[data-bubbles-skin='true'] [data-bubbles-session-divider='true'] {
  padding-top: 10px !important;
  padding-bottom: 4px !important;
}

/* The divider's own caption, by the class the host puts on it
   (chrome.tsx:134 'shrink-0 text-[0.64rem] font-semibold uppercase …').
   There used to be a second selector here —
   '[data-bubbles-session-divider='true'] span:first-child' — and it was wrong: the
   plugin stamps every '.group/workspace', which is also the project header
   (workspace-header.tsx:263) and the row cluster (chrome.tsx:294), and a descendant
   combinator reaches a 'span:first-child' at ANY depth. LaneLabel
   (workspace-header.tsx:35-38) splits the project name into a truncating head and a
   pinned tail so the tail survives narrow widths — for "projects" that is "proj" +
   "ects" — so the head alone got recoloured, upper-cased and letter-spaced while its
   own tail stayed grey. Measured in the live app: head rgb(147,197,253)/uppercase/1.26px
   vs tail rgba(240,246,255,.54)/none/normal, inside one word. */
html[data-bubbles-skin='true'] .group\\/workspace span.text-\\[0\\.64rem\\] {
  color: #93c5fd !important;
  font-size: 10.5px !important;
  font-weight: 600 !important;
  letter-spacing: 0.12em !important;
  text-transform: uppercase !important;
  opacity: 0.90 !important;
}

html[data-bubbles-skin='true'] .group\\/workspace span.h-px,
html[data-bubbles-skin='true'] [data-bubbles-session-divider='true'] span[aria-hidden='true'] {
  background: linear-gradient(90deg, rgba(96, 165, 250, 0.30), rgba(147, 197, 253, 0.05)) !important;
  height: 1px !important;
}

/* Sidebar Session Row Shell */
html[data-bubbles-skin='true'] [data-bubbles-session-row='true'],
html[data-bubbles-skin='true'] [data-slot='sidebar'] .row-hover,
html[data-bubbles-skin='true'] [data-slot='sidebar'] [data-sidebar='menu-button'] {
  border-radius: 8px !important;
  margin: 1px 4px !important;
  border: 1px solid transparent !important;
  color: #94a3b8 !important;
  transition: background 0.18s cubic-bezier(0.16, 1, 0.3, 1),
              border-color 0.18s cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 0.18s cubic-bezier(0.16, 1, 0.3, 1),
              color 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
  box-sizing: border-box !important;
}

/* Hover State. The sidebar container is transparent (the constellation shows
   through), so a 50%-alpha navy wash over it barely registered. Lifted to a
   clearly readable sapphire band with a hairline that matches the composer and
   Tasks card stroke, plus a top inner highlight so it reads as glass, not fill. */
html[data-bubbles-skin='true'] [data-bubbles-session-row='true']:hover,
html[data-bubbles-skin='true'] [data-slot='sidebar'] .row-hover:hover,
html[data-bubbles-skin='true'] [data-slot='sidebar'] [data-sidebar='menu-button']:hover {
  background: rgba(30, 71, 128, 0.62) !important;
  border-color: rgba(147, 197, 253, 0.38) !important;
  box-shadow: inset 0 1px 0 rgba(191, 219, 254, 0.14) !important;
  color: #f1f5f9 !important;
}

html[data-bubbles-skin='true'] [data-bubbles-session-row='true']:hover .hover-marquee,
html[data-bubbles-skin='true'] [data-slot='sidebar'] .row-hover:hover .hover-marquee {
  color: #ffffff !important;
}

/* Active / Selected Session */
html[data-bubbles-skin='true'] [data-bubbles-session-active='true'],
html[data-bubbles-skin='true'] [data-slot='sidebar'] .row-hover.bg-\\(--ui-row-active-background\\),
html[data-bubbles-skin='true'] [data-slot='sidebar'] .row-hover[data-selected='true'],
html[data-bubbles-skin='true'] [data-slot='sidebar'] .row-hover[aria-selected='true'],
html[data-bubbles-skin='true'] [data-slot='sidebar'] [data-sidebar='menu-button'][data-active='true'] {
  background: rgba(14, 38, 72, 0.70) !important;
  border-color: rgba(147, 197, 253, 0.40) !important;
  /* The accent bar is an inset shadow, not a border-left. A border that only the
     active row carries eats 3px of inner width under border-box, so the selected
     title sits sideways of every sibling; a shadow paints the same bar with no
     reflow and still follows the 8px radius. */
  box-shadow: inset 3px 0 0 0 #60a5fa, inset 0 0 16px rgba(59, 130, 246, 0.18),
              0 2px 8px rgba(2, 18, 44, 0.30) !important;
  color: #ffffff !important;
  font-weight: 500 !important;
}

html[data-bubbles-skin='true'] [data-bubbles-session-row='true'][data-bubbles-session-active='true'] .hover-marquee,
html[data-bubbles-skin='true'] [data-slot='sidebar'] .row-hover.bg-\\(--ui-row-active-background\\) .hover-marquee {
  color: #ffffff !important;
  font-weight: 500 !important;
}

/* Working / Live Turn Session Pulse */
html[data-bubbles-skin='true'] [data-bubbles-session-row='true'][data-working='true'] {
  animation: bubblesPulseGlow 3s ease-in-out infinite !important;
}

/* Focus Visible */
html[data-bubbles-skin='true'] [data-bubbles-session-row='true']:focus-visible,
html[data-bubbles-skin='true'] [data-slot='sidebar'] .row-hover:focus-visible,
html[data-bubbles-skin='true'] [data-slot='sidebar'] [data-sidebar='menu-button']:focus-visible {
  outline: 2px solid rgba(96, 165, 250, 0.75) !important;
  outline-offset: -1px !important;
}

/* The section-collapse caret. Its hit area is a flex-1 button (measured 91x20)
   that is mostly empty space, so row chrome on it reads as a floating frame.
   Ring the 12x12 marker instead — box-shadow, not border/padding, so the caret
   cannot shift when it fades in on hover. */
html[data-bubbles-skin='true'] [data-slot='sidebar'] button:hover :is(i, svg)[class*='codicon-chevron'] {
  border-radius: 4px !important;
  box-shadow: 0 0 0 1px rgba(147, 197, 253, 0.25), 0 0 0 3px rgba(16, 42, 78, 0.50) !important;
}

/* Session Actions Cluster */
html[data-bubbles-skin='true'] [data-row-actions] {
  padding-right: 6px !important;
}

html[data-bubbles-skin='true'] [data-row-actions] time {
  color: #94a3b8 !important;
  font-size: 11px !important;
}

/* --------------------------------------------------------------------------
   8.5. Session Preview Floating Card (Phase 5B)
   -------------------------------------------------------------------------- */
.bubbles-session-preview {
  position: fixed !important;
  z-index: 9999 !important;
  pointer-events: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
  transform: translateX(-4px) !important;
  transition: opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.18s cubic-bezier(0.16, 1, 0.3, 1),
              visibility 0.18s !important;
  font-family: inherit !important;
}

.bubbles-session-preview[data-visible='true'] {
  opacity: 1 !important;
  visibility: visible !important;
  transform: translateX(0) !important;
}

.bubbles-preview-card {
  min-width: 240px !important;
  max-width: min(340px, calc(100vw - 32px)) !important;
  border-radius: 12px !important;
  background:
    radial-gradient(350px 120px at 50% 0%, rgba(96, 165, 250, 0.22), transparent 70%),
    rgba(10, 30, 60, 0.94) !important;
  backdrop-filter: blur(20px) saturate(1.4) !important;
  -webkit-backdrop-filter: blur(20px) saturate(1.4) !important;
  border: 1px solid rgba(147, 197, 253, 0.35) !important;
  box-shadow: 0 12px 36px rgba(2, 18, 44, 0.55), inset 0 1px 1px rgba(255, 255, 255, 0.22) !important;
  padding: 12px 14px !important;
  box-sizing: border-box !important;
}

.bubbles-preview-header {
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  border-bottom: 1px solid rgba(147, 197, 253, 0.18) !important;
  padding-bottom: 8px !important;
  margin-bottom: 8px !important;
}

.bubbles-preview-icon {
  color: #60a5fa !important;
  font-size: 12px !important;
}

.bubbles-preview-title {
  color: #ffffff !important;
  font-weight: 600 !important;
  font-size: 13px !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  flex: 1 !important;
}

.bubbles-preview-body {
  display: flex !important;
  flex-direction: column !important;
  gap: 8px !important;
}

.bubbles-preview-section {
  display: flex !important;
  flex-direction: column !important;
  gap: 2px !important;
}

.bubbles-preview-role {
  color: #93c5fd !important;
  font-size: 10.5px !important;
  font-weight: 600 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.08em !important;
}

.bubbles-preview-text {
  color: #cbd5e1 !important;
  font-size: 11.5px !important;
  line-height: 1.45 !important;
  margin: 0 !important;
  word-break: break-word !important;
  overflow: hidden !important;
  display: -webkit-box !important;
  -webkit-line-clamp: 3 !important;
  -webkit-box-orient: vertical !important;
}

.bubbles-preview-footer {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 8px !important;
  border-top: 1px solid rgba(147, 197, 253, 0.12) !important;
  padding-top: 6px !important;
  margin-top: 8px !important;
  font-size: 11px !important;
}

.bubbles-preview-meta {
  color: #60a5fa !important;
  font-weight: 500 !important;
}

.bubbles-preview-time {
  color: #94a3b8 !important;
}

/* --------------------------------------------------------------------------
   9. Composer Two-Row Layout (Phase B)
   -------------------------------------------------------------------------- */

/* Hermes already owns this two-row template (index.tsx:1530) but only engages it
   once useComposerMetrics measures the dock as narrow. Forcing it keeps the input
   on row 1 and hands row 2 to the controls, without touching the DOM. */
html[data-bubbles-skin='true'] [data-slot='composer-surface'] div:has(> [class*='grid-area:input']) {
  grid-template-columns: auto minmax(0, 1fr) !important;
  grid-template-areas: "input input" "menu controls" !important;
  align-items: stretch !important;
  row-gap: 6px !important;
}

/* The native input wrapper keeps flex-1 plus a content min-width from the
   single-row line; in a full-width grid area that can push past the surface. */
html[data-bubbles-skin='true'] [data-slot='composer-surface'] [class*='grid-area:input'] > div {
  width: 100% !important;
  min-width: 0 !important;
}

/* Row 2 is one flex container of six controls in DOM order: 附件 / 模型 / 推理 /
   听写 / 对话 / 引擎 (confirmed from the live window). The agreed reading is the model
   cluster first, then attach, with the voice cluster flush right.
     - the two pills carry real hooks, so order:-1 leads the group without touching DOM;
     - the row's first child takes an auto right margin, which makes it the LAST item of
       the left group and carries everything after it to the right edge. That survives
       hideModelPill (the margin lands on whatever is first) and foldedVoice (where the
       mic is no longer a fan-menu-anchor, which is what the previous blanket
       fan-menu-anchor auto margin depended on — it is gone because two auto
       margins split the free space and park the voice cluster mid-row).
   Every hook here is structural (data-slot / data-testid / data-tour) — never
   aria-label text, which the reference skin keys on and i18n silently breaks. */
html[data-bubbles-skin='true'] [data-slot='composer-surface'] [class*='grid-area:controls'] {
  justify-content: flex-start !important;
}

html[data-bubbles-skin='true'] [data-slot='composer-surface'] [class*='grid-area:controls'] > div {
  flex: 1 1 auto !important;
}

html[data-bubbles-skin='true'] [data-slot='composer-surface'] [class*='grid-area:controls'] > div > :is([data-tour='model-pill'], [data-testid='reasoning-pill']) {
  order: -1 !important;
}

/* The split lives on the voice cluster's own anchor, not on "the last left item":
   an auto margin on the row's first child drove a wedge between the model pill and the
   reasoning pill (composer-codex-layout caught it), and two auto margins split the
   free space. The mic is a FanMenu hub (voice-fan.tsx:105 → fan-menu.tsx:248), so its
   anchor is the first element of the right group; scoped to the controls row it can no
   longer reach the ＋ fan in the menu area. */
html[data-bubbles-skin='true'] [data-slot='composer-surface'] [class*='grid-area:controls'] > div > [data-slot='fan-menu-anchor'] {
  margin-left: auto !important;
}

/* The prompt text and the toolbar row are two different jobs; one hairline says so.
   Inset 12px on both sides so it reads as a rule under the text, not as the box's own
   edge, and low contrast enough to disappear at a glance. */
html[data-bubbles-skin='true'] [data-slot='composer-surface'] [class*='grid-area:input'] {
  position: relative !important;
  padding-bottom: 7px !important;
}

html[data-bubbles-skin='true'] [data-slot='composer-surface'] [class*='grid-area:input']::after {
  content: '' !important;
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 3px;
  height: 1px;
  background: rgba(147, 197, 253, 0.09);
  pointer-events: none;
}

/* The ＋ sits in the menu area, which the host drops to the row's top with a 3px
   nudge for the single-row layout. On a two-row grid that nudge puts it one hairline
   off the toolbar it belongs to. */
html[data-bubbles-skin='true'] [data-slot='composer-surface'] [class*='grid-area:menu'] {
  align-items: center !important;
  align-self: center !important;
  translate: none !important;
}

html[data-bubbles-skin='true'] [data-slot='composer-surface'] :is([data-tour='model-pill'], [data-testid='reasoning-pill']) {
  height: 28px !important;
  min-height: 28px !important;
  padding: 0 8px !important;
  border: 0 !important;
  border-radius: 9999px !important;
  background: transparent !important;
  box-shadow: none !important;
  color: rgba(226, 232, 240, 0.72) !important;
}

html[data-bubbles-skin='true'] [data-slot='composer-surface'] :is([data-tour='model-pill'], [data-testid='reasoning-pill'])[data-state='open'] {
  background: rgba(59, 130, 246, 0.22) !important;
  color: #ffffff !important;
}

/* The two pill menus. They are the only dropdown surfaces that ship with an
   exact w-64 / w-52 width class, so a word match reaches them without restyling
   every other menu in the app. Frosted identity is kept on purpose: translucent
   fill + blur, not the reference's solid card. */
html[data-bubbles-skin='true'] [data-slot='dropdown-menu-content']:is([class~='w-64'], [class~='w-52']) {
  width: 240px !important;
  padding: 4px !important;
  border: 1px solid rgba(147, 197, 253, 0.18) !important;
  border-radius: 12px !important;
  background: rgba(9, 28, 54, 0.72) !important;
  backdrop-filter: blur(16px) saturate(1.3) !important;
  -webkit-backdrop-filter: blur(16px) saturate(1.3) !important;
  box-shadow: 0 12px 32px rgba(2, 18, 44, 0.45) !important;
}

html[data-bubbles-skin='true'] [data-slot='dropdown-menu-content']:is([class~='w-64'], [class~='w-52']) [data-slot='dropdown-menu-item'] {
  height: 28px !important;
  min-height: 28px !important;
  padding: 0 8px !important;
  border-radius: 6px !important;
  font-size: 12px !important;
}

/* Composer glass. The fill is the global #0d2a4d made translucent, and two of the
   backdrop's own light spots are repeated with background-attachment: fixed, so
   the composer shows a continuation of the field behind it instead of its own
   highlight. The white-5% fill plus a white stroke it replaced is exactly why the
   surface read grey-black. */
html[data-bubbles-skin='true'] [data-slot='composer-surface'] {
  background:
    radial-gradient(400px 140px at 50% 0%, rgba(147, 197, 253, 0.14), transparent 70%),
    radial-gradient(950px 500px at 88% -5%, rgba(96, 165, 250, 0.36), transparent 60%),
    radial-gradient(480px 480px at -5% 105%, rgba(29, 78, 216, 0.40), transparent 60%),
    rgba(13, 42, 77, 0.42) !important;
  background-attachment: scroll, fixed, fixed, scroll !important;
  border: 1px solid rgba(147, 197, 253, 0.22) !important;
  box-shadow: inset 0 1px 1px rgba(191, 219, 254, 0.26), 0 4px 20px rgba(2, 18, 44, 0.28) !important;
  backdrop-filter: blur(16px) saturate(1.3) !important;
  -webkit-backdrop-filter: blur(16px) saturate(1.3) !important;
  outline: none !important;
  transition: background 0.25s cubic-bezier(0.16, 1, 0.3, 1),
              border-color 0.25s cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

html[data-bubbles-skin='true'] [data-slot='composer-surface']:focus-within {
  background:
    radial-gradient(450px 160px at 50% 0%, rgba(96, 165, 250, 0.28), transparent 70%),
    radial-gradient(950px 500px at 88% -5%, rgba(96, 165, 250, 0.36), transparent 60%),
    radial-gradient(480px 480px at -5% 105%, rgba(29, 78, 216, 0.40), transparent 60%),
    rgba(13, 42, 77, 0.52) !important;
  background-attachment: scroll, fixed, fixed, scroll !important;
  border-color: rgba(96, 165, 250, 0.70) !important;
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.38), inset 0 1px 1px rgba(191, 219, 254, 0.34) !important;
}

/* Native backing layer sits inside the surface; left painted it buries the glass. */
html[data-bubbles-skin='true'] [data-slot='composer-surface'] > [aria-hidden] {
  background: transparent !important;
  background-image: none !important;
}

/* --------------------------------------------------------------------------
   10. Shared Page Tab Row (技能 / 工具集 / Connectors / 插件)
   -------------------------------------------------------------------------- */
/* One selected-state treatment for every page that renders the shared tab row
   (tab-dropdown.tsx:115-128). The host marks the winner with data-active and gives it
   text-foreground plus a 25%-alpha underline (text-tab.tsx:17-32) — on the ambient
   field that reads as no selection at all. Anchored on data-tour ("tab-<id>",
   tab-dropdown.tsx:121) because it is structural and locale-free; the label text is
   i18n and would be dead in every other language. */
html[data-bubbles-skin='true'] button[data-tour^='tab-'][data-active='true'] {
  background: rgba(59, 130, 246, 0.22) !important;
  border: 1px solid rgba(147, 197, 253, 0.42) !important;
  border-radius: 9px !important;
  color: #ffffff !important;
  padding-inline: 10px !important;
  box-shadow: inset 0 0 14px rgba(96, 165, 250, 0.22) !important;
}

/* The host's own underline is the weaker version of the same signal; keeping both
   would double the cue and the count badge would inherit the white. */
html[data-bubbles-skin='true'] button[data-tour^='tab-'][data-active='true'] > span:first-child {
  text-decoration: none !important;
  color: #ffffff !important;
}

/* --------------------------------------------------------------------------
   7. Focus Navigation & Accessibility (prefers-reduced-motion)
   -------------------------------------------------------------------------- */
/* The bare input selector is deliberately absent from this list: SearchField's
   underline variant sizes its input to content ([field-sizing:content]), so a
   ring there hugs the text and floats off the field (measured 58px ring on an
   82px field). Real controls glow on their own through .desktop-input-chrome. */
html[data-bubbles-skin='true'] :is(button, textarea, select, [role="button"]):focus-visible {
  /* Negative offset: an outset ring floats off the element and reads as a stray
     highlight box (reported on the catalog facet rows, where it also appeared
     only after keyboard-ish focus, which is :focus-visible behaving correctly).
     Inside the box it always looks deliberate and still marks the focused control. */
  outline: 2px solid rgba(125, 175, 250, 0.75) !important;
  outline-offset: -2px !important;
}

/* Facet / filter ticks. CheckboxMark paints a bare Codicon check that inherits
   the row colour — in the overlay sidebar that resolves near-black over the
   frosted panel, so "which sources are on" was unreadable. Give the mark its own
   light sapphire and a box to sit in. */
html[data-bubbles-skin='true'] [data-slot='checkbox-mark'] {
  color: #bfdbfe !important;
  border: 1px solid rgba(147, 197, 253, 0.38) !important;
  border-radius: 4px !important;
  background: rgba(9, 28, 54, 0.55) !important;
}

html[data-bubbles-skin='true'] [data-slot='checkbox-mark'][data-state='checked'] {
  color: #eaf3ff !important;
  border-color: rgba(147, 197, 253, 0.62) !important;
  background: rgba(59, 130, 246, 0.34) !important;
}

@media (prefers-reduced-motion: reduce) {
  html[data-bubbles-skin='true'] [data-bubbles-task-row][data-task-state='running'],
  html[data-bubbles-skin='true'] [data-slot='tool-block'][data-bubbles-tool-state='running'],
  html[data-bubbles-skin='true'] .bubbles-user-expand-btn,
  html[data-bubbles-skin='true'] [data-slot='tool-approval-stack'],
  html[data-bubbles-skin='true'] [data-slot='tool-approval-card'],
  html[data-bubbles-skin='true'] [data-slot='tool-approval-actions'] button,
  html[data-bubbles-skin='true'] [data-slot='clarify-inline'],
  html[data-bubbles-skin='true'] form[data-clarify-choices] button,
  html[data-bubbles-skin='true'] .bubbles-tool-group-toggle,
  html[data-bubbles-skin='true'] .bubbles-group-chevron,
  html[data-bubbles-skin='true'] [data-bubbles-session-row='true'],
  html[data-bubbles-skin='true'] [data-bubbles-session-row='true'][data-working='true'],
  .bubbles-session-preview {
    animation: none !important;
    transition: none !important;
  }

  /* A pseudo-element is not inherited from the row, so it needs its own stop. The
     bar stays fully visible; only the breathing goes away. */
  html[data-bubbles-skin='true'] [data-bubbles-task-row][data-task-state='running']::after {
    animation: none !important;
    opacity: 1;
  }
}
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
