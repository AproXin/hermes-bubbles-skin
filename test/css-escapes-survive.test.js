/**
 * test/css-escapes-survive.test.js
 *
 * PLUGIN_CSS is one JS template literal. A CSS class escape needs a backslash — the
 * class is `group/disclosure-row`, so the selector must reach the browser as
 * `.group\/disclosure-row` — but inside a template literal `\/` is itself an escape
 * sequence and evaluates to `/`. The browser then gets `.group/disclosure-row`, which
 * is not a valid selector, and because one invalid selector voids an entire comma
 * list, the whole rule disappears with no console error. Nine rules were dead that
 * way, including four whose only other alternative (`header`) never renders in the
 * transcript, so they matched nothing at all.
 *
 * The harness hid it: extracting the literal by slicing source text keeps the
 * backslash, so every fixture measured a stylesheet the app never installs.
 * scripts/lib/sheets.js now hands fixtures the runtime text, and this suite pins both
 * halves — the escape resolves, and Chromium keeps every rule.
 *   node test/css-escapes-survive.test.js
 */

const assert = require('assert')
const fs = require('fs')
const { DESKTOP, builtCssPath, launchChromium, pluginCss, pluginCssSource, resolveJsEscapes } = require('../scripts/lib/sheets')

/* The last section asks the built sheet whether Tailwind really emits each escaped
   class, so without that artefact the honest report is SKIPPED — reading a null path
   crashed this suite into FAIL while the other browser suites stood aside. */
const builtCss = builtCssPath()
if (!builtCss) {
  console.log(`\n=== CSS Escapes Survive Suite: SKIPPED — no built renderer CSS under ${DESKTOP}/dist ===\n`)
  process.exit(0)
}

/* Top-level blocks only: a depth walk, so @keyframes frames and @media contents are
   not mistaken for selectors (a naive `[^{}]*{` scan counted 202 "blocks" and blamed
   rules that never existed). */
function topLevelBlocks(css) {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  const blocks = []
  let depth = 0
  let selStart = 0
  for (let i = 0; i < code.length; i += 1) {
    const c = code[i]
    if (c === '{') {
      if (depth === 0) {
        const sel = code.slice(selStart, i).trim()
        blocks.push({ sel, isAtRule: sel.startsWith('@') })
      }
      depth += 1
    } else if (c === '}') {
      depth -= 1
      if (depth === 0) selStart = i + 1
    }
  }
  return blocks
}

const runtime = pluginCss()
const source = pluginCssSource()
assert(runtime, 'PLUGIN_CSS could not be extracted')
const blocks = topLevelBlocks(runtime)
const declaredSelectors = blocks.filter(b => !b.isAtRule).map(b => b.sel)

;(async () => {
  const browser = await launchChromium()
  if (!browser) { console.log('SKIPPED — no Chromium available'); process.exit(0) }
  let failures = 0
  let total = 0
  const check = (name, ok, detail) => {
    total += 1
    if (!ok) failures += 1
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  }

  console.log('\n=== CSS Escapes Survive Suite ===\n')
  console.log('[the resolver does what the JS spec says]')
  check('`\\\\/` in source reaches the browser as a CSS escape `\\/`',
    resolveJsEscapes(String.raw`a\\/b`) === String.raw`a\/b`, JSON.stringify(resolveJsEscapes(String.raw`a\\/b`)))
  check('a single `\/` is erased — this is the trap',
    resolveJsEscapes(String.raw`a\/b`) === 'a/b', JSON.stringify(resolveJsEscapes(String.raw`a\/b`)))
  check('`\\\\` stays a single backslash (no double-unescaping)',
    resolveJsEscapes('a\\\\b') === 'a\\b', JSON.stringify(resolveJsEscapes('a\\\\b')))
  check('the disclosure-row escape is written in the surviving form',
    source.includes(String.raw`group\\/disclosure-row`) && !/group\\\/disclosure/.test(source))

  const page = await browser.newPage()
  await page.setContent('<html><head></head><body></body></html>')
  const parseCount = text => page.evaluate(cssText => {
    const el = document.createElement('style')
    el.textContent = cssText
    document.head.appendChild(el)
    const rules = [...el.sheet.cssRules]
    return { parsed: rules.length, kept: rules.map(r => r.selectorText || '') }
  }, text)

  const report = await parseCount(runtime)
  const serialised = report.kept.join('\n')

  console.log('\n[Chromium keeps every rule the file declares]')
  check(`all ${blocks.length} declared blocks parsed as rules`,
    report.parsed === blocks.length, `parsed ${report.parsed} of ${blocks.length}`)

  /* Which ones? Validate each declared selector list on its own — Chromium's
     re-serialisation makes text diffing unreliable, and querySelector throws on
     exactly the lists the parser would void. */
  const invalid = await page.evaluate(sels => sels
    .map(sel => {
      try { document.createDocumentFragment().querySelector(sel); return null } catch { return sel }
    })
    .filter(Boolean), declaredSelectors)
  check('every declared selector list parses',
    invalid.length === 0, `${invalid.length} invalid: ${invalid.map(s => s.replace(/\s+/g, ' ').slice(0, 70)).join(' || ')}`)

  check('no rule text carries a bare `/` inside a class token',
    !/\.[A-Za-z0-9_-]*\//.test(serialised),
    (serialised.match(/\.[A-Za-z0-9_-]*\/[A-Za-z0-9_-]*/g) || []).slice(0, 4).join(' '))

  console.log('\n[the classes we escape are ones the app actually emits]')
  const built = fs.readFileSync(builtCss, 'utf8')
  /* Scan the SOURCE, not the runtime text: an erased escape leaves no backslash to
     find, which is the whole problem. Every `.name\/sub` in the file is the skin
     reaching for a Tailwind class; two backslashes is the only form that survives the
     template literal, so a run of one is the bug and a run of two is the fix. */
  const sites = [...source.matchAll(/\.([A-Za-z0-9_-]+)(\\+)\/([A-Za-z0-9_-]+)/g)]
    .map(m => ({ pair: `${m[1]}/${m[3]}`, slashes: m[2].length }))
  const escaped = [...new Map(sites.map(s => [s.pair, s])).values()]
  for (const { pair, slashes } of escaped) {
    check(`.${pair} is written with a surviving escape (needs \\\\/, found ${slashes})`,
      slashes === 2, `${slashes} backslash${slashes === 1 ? '' : 'es'} → the runtime gets "${pair.replace('/', '')}"`)
    const emitted = built.includes(`.${pair.replace('/', '\\/')}`) || built.includes(`.${pair}`)
    check(`.${pair} is a class the app really emits`, emitted, 'Tailwind never emitted this class')
    /* The direct pin. A dropped rule is loud; a `:is()` with one bad branch is not —
       :is() is forgiving, so the rule parses, DevTools shows it, and the erased branch
       simply never matches anything. Assert the escape survives into the runtime text. */
    check(`.${pair} survives into the runtime CSS`,
      runtime.includes(`.${pair.replace('/', '\\/')}`), 'the backslash was eaten by the template literal')
  }
  check('the skin escapes at least one slashed class (so the loops above are not vacuous)',
    escaped.length > 0, escaped.map(e => e.pair).join(','))

  console.log('\n[negative control: a broken escape really does drop the rule]')
  const control = await parseCount(`${runtime}\n.broken\\/control { color: red }\n.broken/control { color: red }\n`)
  /* Two blocks added, one kept: the escaped selector parses, the erased one does not —
     and an erased selector also voids anything comma-joined to it, which is how nine
     rules went missing one line at a time. */
  check('control: the sheet grows by exactly one rule when one of two is invalid',
    control.parsed === report.parsed + 1, `parsed ${control.parsed} after adding 2 blocks to ${report.parsed}`)

  await browser.close()
  console.log(`\n${failures ? 'FAIL' : 'OK'} — ${total - failures}/${total} assertions`)
  process.exit(failures ? 1 : 0)
})().catch(err => { console.error(err); process.exit(1) })
