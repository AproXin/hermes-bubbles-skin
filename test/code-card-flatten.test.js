/**
 * test/code-card-flatten.test.js
 *
 * Native CodeCard Flattening Verification Suite
 *
 * Hermes renders every fenced code block inside an assistant reply as:
 *
 *   [data-slot='code-card']                 rounded, overflow-hidden slab
 *     [data-slot='code-card-body']
 *       div                                 ExpandableBlock outer (position: relative)
 *         div                               scroller (max-h-[7.5rem])
 *           pre.aui-shiki                   our <Pre>
 *             pre.shiki                     react-shiki nests a SECOND pre
 *         div[class~='bg-linear-to-t']      overflow fade + the only ∨ toggle,
 *                                           mounted only when content overflows
 *
 * Three stacked paints read as "shadow plus two nested frames":
 *   1. the skin's blanket bubble `pre` rule matched BOTH nested pre elements, so
 *      one code block drew two dark bordered boxes;
 *   2. the ExpandableBlock fade is a `background-image` gradient painted from
 *      `--expandable-fade-from: var(--ui-bg-editor)` down to transparent. It is
 *      NOT a box-shadow, which is why `box-shadow: none !important` never
 *      removed it;
 *   3. the card glows with a large accent box-shadow while
 *      [data-streaming='true'], driven by a @keyframes animation.
 *
 * Verifies:
 * 1. Exactly one dark surface per code card; deeper wrappers are flat.
 * 2. The fade band cannot paint, and stays pointer-transparent.
 * 3. The streaming glow is neutralised with !important (beats the animation).
 * 4. Zero contamination of assistant/user bubble surfaces.
 * 5. Card rules are emitted after the blanket pre rule.
 */

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const pluginSource = fs.readFileSync(path.join(__dirname, '../src/plugin.js'), 'utf8')

const SCARD = "[data-slot='code-card']"
const BUBBLE = "[data-slot='aui_assistant-message-content']"

/** Body of the first rule whose selector text contains `needle`. */
function ruleBody(needle) {
  const idx = pluginSource.indexOf(needle)
  if (idx === -1) return null
  const open = pluginSource.indexOf('{', idx)
  const close = pluginSource.indexOf('}', open)
  if (open === -1 || close === -1) return null
  return pluginSource.slice(open + 1, close)
}

console.log('\n=== Native CodeCard Flattening Audit Suite ===\n')

// ============================================================================
// Test 1: Exactly one visual container per code card
// ============================================================================
console.log('[Test 1] Single Visual Container Inside Code Card')

assert(
  pluginSource.includes(`${BUBBLE} pre`),
  'Blanket bubble pre rule must remain for code outside a card'
)

const flatRule = pluginSource.match(
  /html\[data-bubbles-skin='true'\][^\n{]*code-card[^\n{]*\.aui-shiki\s+:is\(pre, code, \.shiki\)\s*\{[^}]*\}/
)
assert(
  flatRule,
  'Skin must flatten the second pre/code nested inside a native code card'
)
for (const [prop, value] of [
  ['background', 'transparent'],
  ['border', 'none'],
  ['box-shadow', 'none'],
  ['border-radius', '0']
]) {
  assert(
    new RegExp(`${prop}:\\s*${value}\\s*!important`).test(flatRule[0]),
    `Inner code wrappers must declare ${prop}: ${value} !important`
  )
}

const cardRule = ruleBody(SCARD)
assert(cardRule, 'Skin must carry a rule for the native code card slot')
assert(
  /background:\s*rgba\(/.test(cardRule),
  'The card itself must paint the single frame'
)
assert(
  /border:\s*1px solid/.test(cardRule),
  'The card itself must carry the single border'
)

// The trap this guards: CodeCardBody ships [&_pre]:bg-transparent!, and an
// !important inside @layer utilities outranks an unlayered !important no matter
// how specific the latter is. A background on a pre inside a card silently
// never paints, so the frame has to sit on the card.
for (const m of pluginSource.matchAll(/html\[data-bubbles-skin='true'\]([^\n{]*)\{([^}]*)\}/g)) {
  const [, sel, body] = m
  if (!sel.includes('code-card')) continue
  if (!/(^|\s)(pre|\.aui-shiki|\.shiki)\b/.test(sel.replace(SCARD, ''))) continue
  assert(
    /background:\s*transparent\s*!important/.test(body),
    `Rules targeting code wrappers inside a card must stay transparent, found: ${sel.trim()}`
  )
}

console.log('  ✓ Passed: one dark surface, all deeper wrappers flat')

// ============================================================================
// Test 2: The overflow fade cannot read as a drop shadow
// ============================================================================
console.log('[Test 2] Overflow Fade Band Is Not a Shadow')

assert(
  /--expandable-fade-from:\s*transparent\s*!important/.test(cardRule),
  'Skin must neutralise --expandable-fade-from, the colour the fade band paints'
)
assert(
  /box-shadow:\s*none\s*!important/.test(cardRule),
  'Card box-shadow must be !important: only an !important author declaration\n' +
    'outranks the code-card-stream-glow @keyframes in the cascade'
)

const fadeRule = pluginSource.match(
  /html\[data-bubbles-skin='true'\][^\n{]*code-card[^\n{]*bg-linear-to-t[^\n{]*\{[^}]*\}/
)
assert(
  fadeRule && /background-image:\s*none\s*!important/.test(fadeRule[0]),
  'Skin must also clear the fade band directly — Tailwind has renamed this\n' +
    'utility class before, so the custom property alone is not enough'
)
assert(
  fadeRule && /pointer-events:\s*none\s*!important/.test(fadeRule[0]),
  'Fade band must stay pointer-transparent so the ∨ toggle and scrolling work'
)

console.log('  ✓ Passed: fade band paints nothing, toggle still clickable')

// ============================================================================
// Test 3: Bubble surfaces untouched
// ============================================================================
console.log('[Test 3] Conversation Bubbles Untouched')

const bubbleRule = ruleBody(BUBBLE)
assert(bubbleRule !== null, 'Assistant bubble rule must remain')
assert(
  /box-shadow:\s*none\s*!important/.test(bubbleRule),
  'Assistant bubble must keep its own shadow removal'
)
assert(
  !/background:\s*transparent/.test(bubbleRule),
  'Assistant bubble must never be forced transparent — that deletes the bubble'
)

for (const m of pluginSource.matchAll(/html\[data-bubbles-skin='true'\]([^\n{]*)\{([^}]*)\}/g)) {
  const [full, sel] = m
  if (!sel.includes('code-card')) continue
  assert(
    !/aui_user-message-root|composer-human-message|aui_assistant-message-root/.test(full),
    `Code card rules must stay scoped to the card, found: ${sel.trim()}`
  )
}

console.log('  ✓ Passed: every new rule is card-scoped')

// ============================================================================
// Test 4: Cascade order
// ============================================================================
console.log('[Test 4] Rule Ordering')

assert(
  pluginSource.indexOf(`${BUBBLE} pre`) < pluginSource.indexOf(flatRule[0]),
  'Flattening must be emitted after the blanket pre rule so it wins on order too'
)

console.log('  ✓ Passed: flattening follows the blanket pre rule')

console.log('\n=== All CodeCard Flattening Test Assertions Passed Successfully ===\n')
