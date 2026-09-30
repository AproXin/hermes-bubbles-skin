/**
 * test/transcript-expanded-frame.test.js
 *
 * The transcript was flattened to bare text on the bubble, which was right for the
 * collapsed row and wrong for the expanded one: opening a tool call to read its
 * output left the detail floating with no edge saying what it belonged to. The
 * agreed shape is frameless at rest, and a hairline sapphire frame around
 * header + content once open.
 *
 * Both states are readable in CSS alone, so this asserts the CSS rather than a
 * stamp: the host renders [data-slot='aui_thinking-body'] only while open
 * (message-parts.tsx:287) and sets data-tool-open on an open ToolEntry
 * (fallback.tsx:577).
 *
 * The hover assertions are the point of the suite. Two existing rules say
 * `border-color: transparent !important` on :hover, and they tie with the new
 * frame rules on specificity (0,3,1 each), so source order alone decides — the
 * frame would have vanished the moment the pointer moved over it and every
 * non-hover assertion would still have passed.
 *   node test/transcript-expanded-frame.test.js
 */

const { loadSheets, launchChromium, pageHtml, pathToFileUrl } = require('../scripts/lib/sheets')

const sheets = loadSheets()
if (sheets.error) { console.log(`SKIPPED — ${sheets.error}`); process.exit(0) }

// Class strings copied from the renderer, per the fixture rule.
// data-bubbles-tool-state is NOT optional in the fixture: enhanceToolBlock stamps
// it on every tool block at runtime, and the state rules further down PLUGIN_CSS
// set `border: none !important` at the same specificity as the frame rule. Leave it
// out and the suite passes while the real transcript shows no frame — which is
// exactly how this test first lied.
const TOOL = (open, state = 'completed', extra = '') => `<div data-slot="tool-block" data-tool-row="" data-conversation-scaffold=""${open ? ' data-tool-open=""' : ''} data-bubbles-tool-state="${state}" class="group/tool-block min-w-0 max-w-full overflow-hidden rounded-[0.3125rem] border border-(--ui-stroke-tertiary) text-[length:var(--conversation-tool-font-size)] text-(--ui-text-tertiary)"><div class="border-b border-(--ui-stroke-tertiary) px-2 py-1.5 flex items-center gap-1.5"><span class="grid size-3.5 shrink-0 place-items-center self-center"><svg class="size-3.5 shrink-0 text-emerald-600/85"></svg></span><span>已运行 npm test</span></div>${open ? '<div class="max-h-20 max-w-full overflow-auto bg-transparent px-2 py-1.5 text-(--ui-text-secondary)"><pre class="font-mono text-[0.7rem]">PASS 3 suites</pre></div>' : ''}${extra}</div>`

const THINKING = open => `<div data-slot="aui_thinking-disclosure" data-conversation-scaffold="" class="text-[length:var(--conversation-tool-font-size)] text-(--ui-text-tertiary)"><button type="button" aria-expanded="${open ? 'true' : 'false'}" class="group/disclosure-row flex items-center gap-1.5"><span class="grid size-3.5 shrink-0 place-items-center self-center"><svg class="codicon codicon-chevron-right"></svg></span><span>已思考</span></button>${open ? '<div data-slot="aui_thinking-body" class="mt-0.5 w-full min-w-0 max-w-full overflow-auto wrap-anywhere pb-1"><div>先确认宿主在展开时渲染哪个节点。</div></div>' : ''}</div>`

const BODY = `<div style="padding:24px;width:680px"><div data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content" class="min-w-0 max-w-full">`
  + `<p>先跑一遍测试再决定改哪层。</p>`
  + `<div id="t-closed">${THINKING(false)}</div>`
  + `<div id="t-open">${THINKING(true)}</div>`
  + `<div id="b-closed">${TOOL(false)}</div>`
  + `<div id="b-open">${TOOL(true)}</div>`
  + `<div data-slot="code-card" class="group/code relative min-w-0 max-w-full overflow-hidden rounded-[0.625rem] bg-(--ui-bg-editor)"><pre class="code-card-body font-mono text-[0.7rem]">const x = 1</pre></div>`
  + `</div></div></div>`

;(async () => {
  const browser = await launchChromium()
  if (!browser) { console.log('SKIPPED — no Chromium available'); process.exit(0) }
  let failures = 0
  try {
    const fs = require('fs')
    const os = require('os')
    const path = require('path')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expanded-frame-'))
    const file = path.join(dir, 'e.html')
    fs.writeFileSync(file, pageHtml(sheets, BODY))
    const page = await browser.newPage({ viewport: { width: 760, height: 620 }, deviceScaleFactor: 2, colorScheme: 'dark' })
    await page.goto(pathToFileUrl(file))

    const measure = () => page.evaluate(() => {
      const read = id => {
        const host = document.getElementById(id)
        const el = id.startsWith('t-')
          ? host.querySelector('[data-slot="aui_thinking-disclosure"]')
          : host.querySelector('[data-slot="tool-block"]')
        const cs = getComputedStyle(el)
        const alpha = v => {
          const m = /rgba?\(([^)]+)\)/.exec(v)
          if (!m) return null
          const parts = m[1].split(',').map(s => parseFloat(s))
          return parts.length === 4 ? parts[3] : 1
        }
        return {
          width: cs.borderTopWidth,
          style: cs.borderTopStyle,
          color: cs.borderTopColor,
          radius: cs.borderTopLeftRadius,
          fillAlpha: alpha(cs.backgroundColor),
          inBubble: Boolean(el.closest('[data-slot="aui_assistant-message-content"]')),
        }
      }
      return { closedT: read('t-closed'), openT: read('t-open'), closedB: read('b-closed'), openB: read('b-open') }
    })

    const check = (name, ok, detail) => {
      if (!ok) failures += 1
      console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
    }
    const framed = s => parseFloat(s.width) >= 1 && s.style !== 'none' && s.fillAlpha > 0
    const bare = s => parseFloat(s.width) === 0 || s.style === 'none'

    console.log('\n=== Transcript Expanded Frame Suite ===\n')
    console.log('[rest]')
    const at = await measure()
    check('collapsed thinking row is frameless', bare(at.closedT), `border ${at.closedT.width}/${at.closedT.style}`)
    check('collapsed tool row is frameless', bare(at.closedB), `border ${at.closedB.width}/${at.closedB.style}`)
    check('expanded thinking row carries the frame', framed(at.openT),
      `border ${at.openT.width} ${at.openT.style} radius ${at.openT.radius} fill α ${at.openT.fillAlpha}`)
    check('expanded tool block carries the frame', framed(at.openB),
      `border ${at.openB.width} ${at.openB.style} radius ${at.openB.radius} fill α ${at.openB.fillAlpha}`)
    check('the frame wraps header + content, inside the bubble',
      at.openB.inBubble && at.openT.inBubble)

    console.log('\n[hover — the trap: two :hover rules set border-color: transparent]')
    /* A raw pointer move rather than page.hover(): hover actionability wants an
       element to be the top hit at its own centre, which says nothing about the
       rule under test — :hover matches every ancestor of whatever is pointed at,
       and the frame rules live on the ancestor. */
    const pointAt = async sel => {
      const box = await page.locator(sel).boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    }
    await pointAt('#b-open [data-slot="tool-block"] > div:first-child')
    await pointAt('#t-open button')
    const hov = await measure()
    check('the open tool block keeps its frame under the pointer', framed(hov.openB),
      `border ${hov.openB.width} colour ${hov.openB.color}`)
    check('the open thinking row keeps its frame under the pointer', framed(hov.openT),
      `border ${hov.openT.width} colour ${hov.openT.color}`)
    check('collapsed rows stay frameless under the pointer too',
      bare(hov.closedB) && bare(hov.closedT))

    /* One frame, not two. The assistant-bubble rule paints every <pre> as a dark
       card, which turned an opened tool call into nested boxes — the look the
       flattening was asked to remove. The code-card assertion below is the control
       that keeps this from being vacuous: if the pre-card rule were gone entirely,
       the "no card inside the frame" check would pass for the wrong reason. */
    const nested = await page.evaluate(() => {
      const read = el => {
        const cs = getComputedStyle(el)
        return { border: `${cs.borderTopWidth} ${cs.borderTopStyle}`, bg: cs.backgroundColor, radius: cs.borderTopLeftRadius }
      }
      return {
        insideFrame: read(document.querySelector('#b-open [data-slot="tool-block"] pre')),
        codeCard: read(document.querySelector('[data-slot="code-card"] pre')),
      }
    })
    check('the output inside an expanded row paints no card of its own',
      nested.insideFrame.border.endsWith('none') && /rgba\(0, 0, 0, 0\)|transparent/.test(nested.insideFrame.bg),
      JSON.stringify(nested.insideFrame))
    check('control: a code card elsewhere keeps its frame',
      !nested.codeCard.border.endsWith('none'), JSON.stringify(nested.codeCard))
  } finally {
    await browser.close()
  }
  console.log(`\n${failures ? 'FAIL' : 'OK'} — ${9 - failures}/9 assertions`)
  process.exit(failures ? 1 : 0)
})().catch(err => { console.error(err); process.exit(1) })
