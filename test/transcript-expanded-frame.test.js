/**
 * test/transcript-expanded-frame.test.js
 *
 * The transcript was flattened to bare text on the bubble, which was right for the
 * collapsed row and wrong for the expanded one. The agreed shape: frameless at rest,
 * one hairline sapphire frame around the DETAIL once open, with the title line
 * OUTSIDE the frame — so a pill-titled group and a standalone row read the same way.
 *
 * Why the frame sits on the detail and not on the row: the row's own header is
 * visible when the row stands alone and hidden when the skin replaced it with a
 * group pill (data-bubbles-duplicate-header, plugin.js:785). Framing the row
 * therefore put the title inside the box in one case and outside it in the other —
 * the ✓/✗ inconsistency reported from the live window.
 *
 * Fixture rule: class strings copied from the renderer.
 *   DisclosureRow  disclosure-row.tsx:35-63   div.group/disclosure-row > button[aria-expanded]
 *   ToolEntry      fallback.tsx:568-746       row > header wrapper + one open body div (p-1.5)
 *   ToolRun        fallback.tsx:1003-1026     [data-tool-group] > [data-tool-summary] + members wrapper
 *   Thinking       message-parts.tsx:269-303  disclosure > ScaffoldRow + [data-slot=aui_thinking-body]
 * data-bubbles-tool-state is NOT optional either: enhanceToolBlock stamps it on every
 * tool block at runtime and the state rules set border: none !important.
 *
 * The nested case (an open ToolEntry inside [data-tool-group]) is the one that
 * shipped broken: the inner-row flatten rule at plugin.js:898 is (0,5,1) and the old
 * row-level frame rule (0,4,1), so every grouped row lost the frame while a top-level
 * file edit kept it. A fixture that only ever put the row at top level passed.
 *   node test/transcript-expanded-frame.test.js
 */

const { loadSheets, launchChromium, pageHtml, pathToFileUrl } = require('../scripts/lib/sheets')

const sheets = loadSheets()
if (sheets.error) { console.log(`SKIPPED — ${sheets.error}`); process.exit(0) }

const HEADER = (label, open) => `<div class="${open ? 'border-b border-(--ui-stroke-tertiary) px-2 py-1.5' : ''}"><div class="group/disclosure-row relative flex w-full max-w-full min-w-0 text-(--ui-text-tertiary)"><button aria-expanded="${open ? 'true' : 'false'}" class="flex min-w-0 max-w-fit items-start gap-1.5 text-left transition-colors" type="button"><span class="flex min-w-0 flex-col gap-0.5"><span class="flex min-w-0 items-center gap-1.5"><span class="grid size-3.5 shrink-0 place-items-center"><svg class="codicon codicon-terminal"></svg></span><span>${label}</span></span></span></button></div></div>`

const DETAIL = `<div class="relative grid w-full min-w-0 max-w-full gap-1.5 overflow-hidden p-1.5"><button aria-expanded="false" class="flex min-w-0 max-w-fit items-start gap-1.5 text-left" type="button">Tool payload</button><pre class="font-mono text-[0.7rem]">PASS 3 suites</pre></div>`

/** One ToolEntry, at rest or open. */
const TOOL = (open, label = '已运行 npm test', state = 'completed', extra = '') =>
  `<div data-slot="tool-block" data-tool-row="" data-conversation-scaffold=""${open ? ' data-tool-open=""' : ''} data-bubbles-tool-state="${state}"${extra} class="group/tool-block min-w-0 max-w-full overflow-hidden${open ? ' rounded-[0.3125rem] border border-(--ui-stroke-tertiary)' : ''} text-[length:var(--conversation-tool-font-size)] text-(--ui-text-tertiary)">${HEADER(label, open)}${open ? DETAIL : ''}</div>`

/** A native ToolRun: the summary line plus either the ticker (collapsed) or the
    members wrapper (expanded) — fallback.tsx:1024-1025 renders one or the other. */
const GROUP = (open, members) =>
  `<div data-slot="tool-block" data-tool-group="" data-conversation-scaffold="" class="grid min-w-0 max-w-full gap-(--tool-row-gap) overflow-hidden"><div data-conversation-scaffold="" data-tool-summary="">${HEADER('已运行 2 个命令', open)}</div>${open ? `<div class="grid min-w-0 max-w-full gap-(--tool-row-gap)">${members}</div>` : `<div class="relative overflow-hidden"><div class="absolute inset-0">${members}</div></div>`}</div>`

const THINKING = open =>
  `<div data-slot="aui_thinking-disclosure" data-conversation-scaffold="" class="text-[length:var(--conversation-tool-font-size)] text-(--ui-text-tertiary)">${HEADER('已思考', open)}${open ? '<div data-slot="aui_thinking-body" class="mt-0.5 w-full min-w-0 max-w-full overflow-auto wrap-anywhere pb-1"><div>先确认宿主在展开时渲染哪个节点。</div></div>' : ''}</div>`

const BODY = `<div style="padding:24px;width:680px"><div data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content" class="min-w-0 max-w-full">`
  + `<p>先跑一遍测试再决定改哪层。</p>`
  + `<div id="t-closed">${THINKING(false)}</div>`
  + `<div id="t-open">${THINKING(true)}</div>`
  + `<div id="b-closed">${TOOL(false)}</div>`
  + `<div id="b-open">${TOOL(true)}</div>`
  /* The skin's own pill group: a completed row whose native header is hidden. */
  + `<div id="b-pill">${TOOL(true, '已运行代码 from hermes_tools', 'completed', ' data-bubbles-in-group="true" data-bubbles-group-collapsed="false" data-bubbles-tool-flat="true"')}</div>`
  /* The live shape that had no frame: an open ToolEntry nested inside a ToolRun. */
  + `<div id="b-nested">${GROUP(true, TOOL(true, 'Unnamed call', 'failed') + TOOL(false, 'Process Manage poll'))}</div>`
  + `<div id="b-group-closed">${GROUP(false, TOOL(false, '已读取 src/a.ts') + TOOL(false, '已读取 src/b.ts'))}</div>`
  + `<div data-slot="code-card" class="group/code relative min-w-0 max-w-full overflow-hidden rounded-[0.625rem] bg-(--ui-bg-editor)"><pre class="code-card-body font-mono text-[0.7rem]">const x = 1</pre></div>`
  + `</div></div></div>`

/* Every element that must carry exactly one frame, and the title line that must
   sit outside it. */
const TARGETS = {
  'thinking detail': '#t-open [data-slot="aui_thinking-body"]',
  'tool detail': '#b-open [data-tool-row] > :not(:first-child)',
  'pill-grouped tool detail': '#b-pill [data-tool-row] > :not(:first-child)',
  'tool run members': '#b-nested [data-tool-group] > [data-tool-summary] + div',
}
/* A detail opened INSIDE an already-framed run steps down to a left rail — one
   box per visual layer, so a nested row reads as content of the run rather than
   as a second card. */
const RAILED = {
  'grouped tool detail': '#b-nested [data-tool-group] > div:last-child > [data-tool-open] > :not(:first-child)',
}
const TITLES = {
  'thinking detail': '#t-open [data-slot="aui_thinking-disclosure"] > div:first-child',
  'tool detail': '#b-open [data-tool-row] > div:first-child',
  'pill-grouped tool detail': '#b-pill [data-tool-row] > div:first-child',
  'grouped tool detail': '#b-nested [data-tool-group] [data-tool-open] > div:first-child',
  'tool run members': '#b-nested [data-tool-summary]',
}

;(async () => {
  const browser = await launchChromium()
  if (!browser) { console.log('SKIPPED — no Chromium available'); process.exit(0) }
  let failures = 0
  let total = 0
  try {
    const fs = require('fs')
    const os = require('os')
    const path = require('path')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expanded-frame-'))
    const file = path.join(dir, 'e.html')
    fs.writeFileSync(file, pageHtml(sheets, BODY))
    const page = await browser.newPage({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' })
    await page.goto(pathToFileUrl(file))

    const readFrame = sel => page.evaluate(s => {
      const el = document.querySelector(s)
      if (!el) return { missing: true }
      const cs = getComputedStyle(el)
      const alpha = v => {
        const m = /rgba?\(([^)]+)\)/.exec(v)
        if (!m) return null
        const parts = m[1].split(',').map(x => parseFloat(x))
        return parts.length === 4 ? parts[3] : 1
      }
      return {
        width: cs.borderTopWidth,
        style: cs.borderTopStyle,
        color: cs.borderTopColor,
        leftWidth: cs.borderLeftWidth,
        radius: cs.borderTopLeftRadius,
        fillAlpha: alpha(cs.backgroundColor),
        inBubble: Boolean(el.closest('[data-slot="aui_assistant-message-content"]')),
      }
    }, sel)

    const isBare = sel => page.evaluate(s => {
      const el = document.querySelector(s)
      if (!el) return { missing: true }
      const cs = getComputedStyle(el)
      return { width: cs.borderTopWidth, style: cs.borderTopStyle, fill: cs.backgroundColor }
    }, sel)

    const check = (name, ok, detail) => {
      total += 1
      if (!ok) failures += 1
      console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
    }
    const framed = f => !f.missing && parseFloat(f.width) >= 1 && f.style !== 'none' && f.fillAlpha > 0
    const bare = f => !f.missing && (parseFloat(f.width) === 0 || f.style === 'none')

    console.log('\n=== Transcript Expanded Frame Suite ===\n')
    console.log('[every expanded detail carries one frame]')
    for (const [name, sel] of Object.entries(TARGETS)) {
      const f = await readFrame(sel)
      check(`${name} is framed`, framed(f), JSON.stringify(f))
      check(`${name} sits inside the bubble`, !f.missing && f.inBubble)
    }

    console.log('\n[a detail nested inside a framed run steps down to a left rail]')
    for (const [name, sel] of Object.entries(RAILED)) {
      const f = await readFrame(sel)
      const railed = !f.missing && parseFloat(f.leftWidth) >= 2 && parseFloat(f.width) === 0 && f.fillAlpha === 0
      check(`${name} is a rail, not a second box`, railed, JSON.stringify(f))
    }

    console.log('\n[the title line stays outside every frame]')
    for (const [name, titleSel] of Object.entries(TITLES)) {
      const t = await isBare(titleSel)
      check(`${name}: its title line carries no frame of its own`, bare(t), JSON.stringify(t))
      const wrapped = await page.evaluate(([frame, title]) => {
        const f = document.querySelector(frame)
        const h = document.querySelector(title)
        return !f || !h ? null : f.contains(h)
      }, [TARGETS[name] || RAILED[name], titleSel])
      check(`${name}: the frame does not wrap the title`, wrapped === false, `frame contains title: ${wrapped}`)
    }

    console.log('\n[rest stays bare]')
    for (const [name, sel] of [
      ['collapsed thinking disclosure', '#t-closed [data-slot="aui_thinking-disclosure"]'],
      ['collapsed tool row', '#b-closed [data-tool-row]'],
      ['collapsed tool row header', '#b-closed [data-tool-row] > div:first-child'],
      ['collapsed tool run summary', '#b-group-closed [data-tool-summary]'],
      ['collapsed tool run ticker wrapper', '#b-group-closed [data-tool-group] > div:last-child'],
    ]) {
      const b = await isBare(sel)
      check(`${name} is frameless`, bare(b), JSON.stringify(b))
    }
    const openRow = await isBare('#b-open [data-tool-row]')
    check('the open row itself is not framed (one frame, not two)', bare(openRow), JSON.stringify(openRow))

    console.log('\n[hover — the trap: two :hover rules set border-color: transparent]')
    /* A raw pointer move rather than page.hover(): hover actionability wants an
       element to be the top hit at its own centre, which says nothing about the
       rule under test — :hover matches every ancestor of whatever is pointed at. */
    const pointAt = async sel => {
      const box = await page.locator(sel).boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    }
    for (const [key, title] of [['tool detail', '#b-open [data-tool-row] > div:first-child'],
      ['thinking detail', '#t-open [data-slot="aui_thinking-disclosure"] > div:first-child'],
      ['tool run members', '#b-nested [data-tool-summary]']]) {
      await pointAt(title)
      const f = await readFrame(TARGETS[key])
      check(`${key} keeps its frame while the pointer is on its title`, framed(f), JSON.stringify(f))
    }
    await pointAt('#b-nested [data-tool-group] [data-tool-open] > div:first-child')
    const hoveredRail = await readFrame(RAILED['grouped tool detail'])
    check('a nested detail keeps its rail while the pointer is on its title',
      parseFloat(hoveredRail.leftWidth) >= 2 && parseFloat(hoveredRail.width) === 0,
      JSON.stringify(hoveredRail))
    await pointAt('#b-closed [data-tool-row] > div:first-child')
    const hoveredClosed = await isBare('#b-closed [data-tool-row]')
    check('a collapsed row under the pointer still has no frame', bare(hoveredClosed), JSON.stringify(hoveredClosed))

    /* One frame, not two. The assistant-bubble rule paints every <pre> as a dark
       card, which turned an opened tool call into nested boxes. The code-card
       assertion is the control that keeps this from being vacuous. */
    const nested = await page.evaluate(() => {
      const read = el => {
        const cs = getComputedStyle(el)
        return { border: `${cs.borderTopWidth} ${cs.borderTopStyle}`, bg: cs.backgroundColor, radius: cs.borderTopLeftRadius }
      }
      return {
        insideFrame: read(document.querySelector('#b-open [data-tool-row] pre')),
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
  console.log(`\n${failures ? 'FAIL' : 'OK'} — ${total - failures}/${total} assertions`)
  process.exit(failures ? 1 : 0)
})().catch(err => { console.error(err); process.exit(1) })
