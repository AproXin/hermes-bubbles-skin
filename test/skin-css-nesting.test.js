/**
 * test/skin-css-nesting.test.js
 *
 * The skin's customCSS is one long flat string. A single missing `}` does not
 * throw: Chromium parses it, keeps the declarations it can attribute to the still
 * open block, and silently RE-SCOPES every rule that follows as a nested selector
 * (CSS Nesting is on by default). The result is a rule that reads fine in the
 * file, exists in DevTools, and can never match — e.g. the composer dropdown
 * rescue ending up scoped under `.composer-human-message`, which is not an
 * ancestor of the overlay.
 *
 * Text assertions cannot see this. Only a real parser can, so this suite loads
 * the live customCSS into Chromium and asks the stylesheet what it actually is.
 *   node test/skin-css-nesting.test.js
 */

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { skinSourcePath } = require('./skin-source')

const HERMES_HOME = process.env.HERMES_HOME || path.join(require('os').homedir(), '.hermes')

const skip = reason => {
  console.log(`\n=== Skin CSS Nesting Suite: SKIPPED — ${reason} ===\n`)
  process.exit(0)
}

/* Sheet resolution lives in scripts/lib/sheets.js — one copy of these paths. */
const { blockScalar, launchChromium } = require('../scripts/lib/sheets')


const skinSource = skinSourcePath()
const css = blockScalar(fs.readFileSync(skinSource, 'utf8'), 'customCSS')
assert(css, `no customCSS block scalar found in ${skinSource}`)

// A naive brace walk: where does depth first go negative, and how many top-level
// rule blocks does the file claim to have? Comments are blanked (not removed) so
// a `}` inside prose cannot shift the line numbers.
const code = css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
{
  let depth = 0
  const negatives = []
  for (let i = 0; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1
    else if (code[i] === '}') {
      depth -= 1
      if (depth < 0) negatives.push({ at: i, line: code.slice(0, i).split('\n').length })
    }
  }
  assert.strictEqual(depth, 0, `customCSS braces do not balance (depth ${depth})`)
  assert.strictEqual(negatives.length, 0,
    `brace depth went negative at line(s) ${negatives.map(n => n.line).join(', ')} — an extra \`}\` `
    + `means every rule after the previous block lost its own closer`)
}

const expectedTopLevel = (code.match(/\n\s*[^{}\s][^{}]*\{/g) || []).length

;(async () => {
  const browser = await launchChromium()
  if (!browser) skip('playwright-core found but no Chromium/Edge/Chrome to launch')

  const page = await browser.newPage()
  await page.setContent('<html><body><div id="probe"></div></body></html>')
  const parsed = await page.evaluate(cssText => {
    const el = document.createElement('style')
    el.textContent = cssText
    document.head.appendChild(el)
    const sheet = el.sheet
    if (!sheet) return { error: 'stylesheet failed to parse' }
    const dump = [...sheet.cssRules].map(r => ({
      type: r.type,
      selector: r.selectorText || r.conditionText || '',
      z: r.style && r.style.zIndex ? r.style.zIndex : null,
      nested: r.cssRules ? [...r.cssRules].map(n => n.selectorText || String(n.cssText).slice(0, 60)) : [],
    }))
    // What the user bubble actually computes, so a brace fix cannot quietly
    // change the glass design.
    const msg = document.createElement('div')
    msg.className = 'composer-human-message'
    document.body.appendChild(msg)
    const s = getComputedStyle(msg)
    const bubble = {
      radius: s.borderTopLeftRadius,
      border: s.borderTopWidth + ' ' + s.borderTopStyle,
      shadow: s.boxShadow,
      minHeight: s.minHeight,
      bg: s.backgroundColor,
    }
    return { count: dump.length, dump, bubble }
  }, css)
  await browser.close()

  console.log('=== Skin CSS Nesting Suite ===')
  console.log(`skin: ${skinSource}`)
  console.log(`file claims ~${expectedTopLevel} rule blocks; Chromium parsed ${parsed.count} top-level rules`)

  assert(!parsed.error, `customCSS did not parse: ${parsed.error}`)

  const isTopLevel = sel => parsed.dump.some(r => r.selector && r.selector.includes(sel))

  // General guard: in a flat stylesheet no top-level rule should contain nested
  // style rules. Any that do swallowed a `}` above it and lost its own scope.
  const swallowers = parsed.dump.filter(r => r.nested.length)
  assert.strictEqual(swallowers.length, 0,
    `${swallowers.length} rule(s) contain nested rules, i.e. an unclosed block re-scoped everything `
    + `inside them: ${swallowers.map(r => `${r.selector} => ${r.nested.join(' | ')}`).join('\n  ')}`)

  // The overlay rescue must be a real, matchable rule.
  const overlay = parsed.dump.find(r => r.selector && r.selector.includes('select-content'))
  assert(overlay,
    'the [data-slot=select-content] dropdown rescue is not a top-level rule — it was swallowed by an '
    + 'unclosed block above it and can never match the overlay')
  assert(!overlay.selector.includes('composer-human-message'),
    `dropdown rescue got re-scoped as a nested selector: ${overlay.selector}`)
  assert.strictEqual(overlay.z, '99999', 'dropdown rescue must carry its z-index')
  assert(isTopLevel('composer-rich-input'),
    'composer input field rescue must be top-level')

  // Design pin: the sapphire bubble keeps radius / border / glow / capsule height.
  assert.notStrictEqual(parsed.bubble.radius, '0px', 'user bubble must keep its border-radius')
  assert.notStrictEqual(parsed.bubble.border, '0px none', 'user bubble must keep its border')
  assert.notStrictEqual(parsed.bubble.shadow, 'none', 'user bubble must keep its glass shadow')
  assert.strictEqual(parsed.bubble.minHeight, '30px', 'user bubble must keep the compact 30px capsule')
  // The hue moved off the old rgba(59,130,246,.45) the user called 过蓝, but the
  // pin still holds: blue-dominant, and never collapsing into the assistant's
  // white frost (rgba(255,255,255,.13)) — the distinction is the design.
  const bg = (parsed.bubble.bg.match(/[\d.]+/g) || []).map(Number)
  assert(bg.length >= 3 && bg[2] > bg[0] && bg[2] > bg[1], `user bubble must stay blue-dominant: ${parsed.bubble.bg}`)
  assert(!/255,\s*255,\s*255/.test(parsed.bubble.bg), `user bubble must not become the assistant's white glass: ${parsed.bubble.bg}`)

  console.log(`user bubble computes: ${JSON.stringify(parsed.bubble)}`)
  console.log(`dropdown rescue: ${overlay.selector} { z-index: ${overlay.z} }`)
  console.log('\n=== Skin CSS Nesting Suite: PASS ===\n')
})().catch(err => {
  console.error('\n' + (err.message || err))
  process.exit(1)
})
