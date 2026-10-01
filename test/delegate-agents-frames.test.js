/**
 * test/delegate-agents-frames.test.js
 *
 * Two expandable surfaces the transcript rules never reached, both because they do
 * not emit data-tool-open / data-tool-row:
 *
 *   delegate card   message-parts.tsx:102 routes the `delegate_task` tool here;
 *                   delegate.tsx:159 is the [data-delegate-card] container and
 *                   delegate.tsx:95 is one row per subagent. The row carried the
 *                   app's own grey stroke (rounded-xl border-(--ui-stroke-tertiary)),
 *                   so it read as a card from a different skin.
 *   agents node     app/agents/index.tsx:352 — a subagent row in the Agents view:
 *                   a direct <button aria-expanded> title, then the activity stream
 *                   (:379) and the files list (:393) as siblings, both marked
 *                   [data-selectable-text]. Collapsed it shows two stream lines;
 *                   expanded it should frame what it reveals, title outside, exactly
 *                   like a transcript row.
 *
 * The children wrapper (:411) is deliberately NOT framed — each nested node frames
 * its own stream, so a parent box around the whole subtree would be a frame around
 * frames.
 *   node test/delegate-agents-frames.test.js
 */

const { loadSheets, launchChromium, pageHtml, pathToFileUrl } = require('../scripts/lib/sheets')

const sheets = loadSheets()
if (sheets.error) { console.log(`SKIPPED — ${sheets.error}`); process.exit(0) }

const DELEGATE_ROW = (id, goal) => `<div id="${id}" class="grid min-w-0 max-w-full gap-0.5 rounded-xl border border-(--ui-stroke-tertiary) px-3 py-2"><div class="flex min-w-0 max-w-full items-center gap-1.5" data-conversation-scaffold=""><span class="grid size-3.5 shrink-0 place-items-center"><svg class="codicon codicon-agent"></svg></span><button class="min-w-0 truncate text-left" type="button">${goal}</button><span class="shrink-0 text-[0.625rem] tabular-nums">gpt-4o · 12s</span></div><div class="min-w-0 max-w-full pl-5"><span>读取 src/a.ts</span></div></div>`

const AGENT_NODE = (id, open, withFiles, withChildren) => `<div id="${id}" class="grid min-w-0 max-w-full gap-2" data-slot="tool-block"><button aria-expanded="${open ? 'true' : 'false'}" class="group flex w-full min-w-0 items-start gap-2.5 text-left" type="button"><span class="mt-0.5 flex h-[1.1rem] shrink-0 items-center"><svg class="codicon codicon-pass"></svg></span><span class="flex min-w-0 flex-1 flex-col gap-0.5"><span class="wrap-anywhere text-[0.82rem] font-medium leading-[1.1rem] text-foreground/90">重写 selection.ts</span></span></button><div class="grid min-w-0 gap-1 pl-6" data-selectable-text="true"><div class="font-mono text-[0.67rem]">npm test 通过</div></div>${open && withFiles ? '<div class="grid min-w-0 gap-0.5 pl-6" data-selectable-text="true"><p class="text-[0.58rem] font-medium tracking-wider uppercase">文件</p><p class="wrap-break-word font-mono text-[0.67rem]">+ selection.ts</p></div>' : ''}${withChildren ? '<div class="grid min-w-0 gap-3 pl-6">' + AGENT_NODE(id + '-child', true, false, false) + '</div>' : ''}</div>`

const BODY = `<div style="padding:24px;width:680px"><div data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content" class="min-w-0 max-w-full">`
  + `<div data-delegate-card="" data-slot="tool-block" class="grid min-w-0 gap-(--tool-row-gap)" id="card">`
  + DELEGATE_ROW('d-row-1', '排查 pip 报错') + DELEGATE_ROW('d-row-2', '补齐 requirements')
  + `</div>`
  + AGENT_NODE('a-open', true, true, true)
  + AGENT_NODE('a-closed', false, false, false)
  + `<div data-slot="code-card" class="group/code relative min-w-0 max-w-full overflow-hidden rounded-[0.625rem] bg-(--ui-bg-editor)"><pre class="code-card-body font-mono text-[0.7rem]">const x = 1</pre></div>`
  + `</div></div></div>`

;(async () => {
  const browser = await launchChromium()
  if (!browser) { console.log('SKIPPED — no Chromium available'); process.exit(0) }
  let failures = 0
  let total = 0
  try {
    const fs = require('fs')
    const os = require('os')
    const path = require('path')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delegate-agents-'))
    const file = path.join(dir, 'd.html')
    fs.writeFileSync(file, pageHtml(sheets, BODY))
    const page = await browser.newPage({ viewport: { width: 760, height: 900 }, colorScheme: 'dark' })
    await page.goto(pathToFileUrl(file))

    const read = sel => page.evaluate(s => {
      const el = document.querySelector(s)
      if (!el) return { missing: true }
      const cs = getComputedStyle(el)
      return { w: cs.borderTopWidth, style: cs.borderTopStyle, color: cs.borderTopColor,
        radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, shadow: cs.boxShadow }
    }, sel)

    const check = (name, ok, detail) => {
      total += 1
      if (!ok) failures += 1
      console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
    }
    /* The skin's hairline, spelled the way the transcript frame spells it, so a
       surface that merely kept the app's grey stroke cannot pass as "unified". */
    const HAIRLINE = /rgba\(147, 197, 253, 0\.22\)/
    const skinFramed = f => !f.missing && parseFloat(f.w) === 1 && f.style === 'solid'
      && HAIRLINE.test(f.color) && parseFloat(f.radius) === 8
    const bare = f => !f.missing && (parseFloat(f.w) === 0 || f.style === 'none')

    console.log('\n=== Delegate Card & Agents Node Suite ===\n')
    console.log('[delegate rows wear the skin hairline, not the app stroke]')
    for (const id of ['d-row-1', 'd-row-2']) {
      const f = await read(`#${id}`)
      check(`${id} carries the skin hairline + soft fill`, skinFramed(f) && !/rgba\(0, 0, 0, 0\)/.test(f.bg), JSON.stringify(f))
      check(`${id} casts no shadow`, f.shadow === 'none', f.shadow)
    }
    const card = await read('#card')
    check('the [data-delegate-card] container stays bare (one box per row)', bare(card), JSON.stringify(card))

    console.log('\n[an expanded agents node frames what it reveals]')
    const stream = await read('#a-open > [data-selectable-text="true"]')
    const files = await read('#a-open > div:nth-child(3)')
    check('the activity stream is framed', skinFramed(stream), JSON.stringify(stream))
    check('the files list is framed', skinFramed(files), JSON.stringify(files))
    const title = await read('#a-open > button')
    check('the node title stays outside those frames', bare(title), JSON.stringify(title))
    const wrapsTitle = await page.evaluate(() => {
      const box = document.querySelector('#a-open > [data-selectable-text="true"]')
      return box.contains(document.querySelector('#a-open > button'))
    })
    check('the stream frame does not wrap the title', wrapsTitle === false, String(wrapsTitle))
    const childStream = await read('#a-open-child > [data-selectable-text="true"]')
    check('a nested node frames its own stream (per node, not inherited)',
      skinFramed(childStream), JSON.stringify(childStream))
    const childrenWrap = await read('#a-open > div:nth-child(4)')
    check('the children wrapper paints no box of its own', bare(childrenWrap), JSON.stringify(childrenWrap))

    console.log('\n[collapsed stays bare]')
    const closedStream = await read('#a-closed > [data-selectable-text="true"]')
    check('a collapsed node shows its two preview lines unframed', bare(closedStream), JSON.stringify(closedStream))

    /* Control: the code card keeps its own frame, so "nothing else is framed"
       cannot mean the whole transcript stopped painting boxes. */
    const code = await read('[data-slot="code-card"]')
    check('control: a code card still keeps its frame',
      !code.missing && parseFloat(code.w) === 1 && code.style === 'solid', JSON.stringify(code))
  } finally {
    await browser.close()
  }
  console.log(`\n${failures ? 'FAIL' : 'OK'} — ${total - failures}/${total} assertions`)
  process.exit(failures ? 1 : 0)
})().catch(err => { console.error(err); process.exit(1) })
