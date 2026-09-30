/**
 * test/transcript-row-flatness.test.js
 *
 * The transcript was a stack of nested cards: every 已思考 row, every 已运行 /
 * 已读取 row, the ToolRun group that holds them, and our own group-summary pill
 * each painted background + border + radius + frost. User's call:
 * 「这些思考项、代码执行、工具调用的外框看起来很复杂、花眼，去掉吧，直接暴露在
 *   聊天气泡上就行，只保留这类任务汇报中用强调色表示修改内容或强调内容的框」
 * So rows become bare text on the bubble, and the ONLY boxes left are the ones
 * that carry emphasised content: the code card and the diff panels.
 *
 * State still has to read at a glance, without a box:
 *   running   → the app's own GlyphSpinner, tinted sapphire (fallback.tsx:198-225)
 *   failed    → ✗ over the glyph slot, red text
 *   completed → ✓ over the glyph slot
 * The type glyph (terminal / file / eye) is hidden by CSS, never removed —
 * "flatten, never delete" is the standing constraint for this skin.
 *
 * Class strings come from the app source, not from imagination:
 *   thinking   message-parts.tsx:268-306
 *   ToolRun    fallback.tsx:1001-1013   (grid, no frame of its own)
 *   ToolEntry  fallback.tsx:567-580     (rounded-[0.3125rem] border
 *                                        border-(--ui-stroke-tertiary) WHEN OPEN,
 *                                        header carries border-b)
 *   summary    fallback.tsx:835-863     (div[data-tool-summary] > DisclosureRow)
 *   glyph wrap TOOL_HEADER_GLYPH_WRAP_CLASS = grid size-3.5 shrink-0
 *              place-items-center self-center
 *   keeps frame code-card.tsx:12-46, diff-lines.tsx:637-649
 *   node test/transcript-row-flatness.test.js
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadSheets, launchChromium, pageHtml, pathToFileUrl } = require('../scripts/lib/sheets')

const sheets = loadSheets()
const skip = reason => {
  console.log(`\n=== Transcript Row Flatness Suite: SKIPPED — ${reason} ===\n`)
  process.exit(0)
}
if (sheets.error) skip(sheets.error)

const WRAP = 'grid size-3.5 shrink-0 place-items-center self-center'
const header = inner => `<div class="border-b border-(--ui-stroke-tertiary) px-2 py-1.5 flex items-center gap-1.5">${inner}</div>`
const entry = (state, label, glyph) => `
  <div data-slot="tool-block" data-tool-row="" data-conversation-scaffold="" data-tool-open=""
       data-bubbles-tool-state="${state}" id="row-${state}"
       class="group/tool-block min-w-0 max-w-full overflow-hidden rounded-[0.3125rem] border border-(--ui-stroke-tertiary) text-[length:var(--conversation-tool-font-size)] text-(--ui-text-tertiary)">
    ${header(`<span class="${WRAP}" data-probe="glyph">${glyph}</span><span>${label}</span>`)}
    <pre class="px-2 py-1">输出</pre>
  </div>`

const BODY = `
<div data-slot="aui_assistant-message-root" class="relative w-full">
 <div data-slot="aui_assistant-message-content" class="min-w-0 max-w-full">
  <div data-slot="aui_thinking-disclosure" data-conversation-scaffold="" id="thinking"
       class="text-[length:var(--conversation-tool-font-size)] text-(--ui-text-tertiary)">
    <div data-conversation-scaffold="">
      <button type="button" aria-expanded="false" class="group/disclosure-row flex items-center gap-1.5">
        <span class="${WRAP}"><i class="codicon codicon-chevron-right shrink-0 transition-transform duration-150 rotate-90"></i></span>
        <span class="text-(--conversation-scaffold-text)">已思考</span>
      </button>
    </div>
    <!-- Resting state on purpose: [data-slot='aui_thinking-body'] only exists
         while the disclosure is open (message-parts.tsx:287), and an OPEN row is
         framed by design — see test/transcript-expanded-frame.test.js. Keeping the
         body here would make this suite assert the old, always-flat rule. -->
  </div>

  <div data-slot="tool-block" data-tool-group="" id="tool-run"
       class="grid min-w-0 max-w-full gap-(--tool-row-gap) overflow-hidden">
    <div data-tool-summary="" data-conversation-scaffold="" id="summary">
      <button type="button" aria-expanded="true" class="group/disclosure-row flex items-center gap-1.5">
        <span class="text-(--ui-text-tertiary) truncate">已探索 4 个文件、运行 4 条命令</span>
      </button>
    </div>
    <!-- The members sit in their own wrapper, as in the renderer: fallback.tsx:1025
         renders <div class="grid …">{children}</div> after the summary, and that
         wrapper — not the first member — is what the expanded frame rule paints.
         Without it this fixture made [data-tool-summary] + div land on a row and
         the suite read the design as broken. -->
    <div class="grid min-w-0 max-w-full gap-(--tool-row-gap)">
      ${entry('completed', '已读取 disclosure-row.tsx', '<svg viewBox="0 0 256 256" class="shrink-0"></svg>')}
      ${entry('running', '已运行 sleep 20', '<span role="status" class="glyph-spinner size-3.5 shrink-0 text-[0.95rem]"></span>')}
      ${entry('failed', 'Reading https://this-domain-surely-not-exist.invalid', '<svg viewBox="0 0 24 24" class="size-3.5 shrink-0 text-destructive"></svg>')}
    </div>
  </div>

  <div class="bubbles-tool-group" data-tool-count="3" id="group">
    <button type="button" class="bubbles-tool-group-toggle" aria-expanded="true" id="group-toggle">
      <span class="bubbles-group-icon">✓</span><span>3 个工具调用</span><span class="bubbles-group-chevron"></span>
    </button>
  </div>

  <div data-slot="code-card" id="code-card"
       class="group/code relative min-w-0 max-w-full overflow-hidden rounded-[0.625rem] bg-(--ui-bg-editor)">
    <pre class="code-card-body font-mono text-[0.7rem]">status === 'success'</pre>
  </div>
  <div data-slot="file-diff-panel" id="diff-panel" class="min-w-0 max-w-full overflow-hidden">
    <div data-slot="diff-lines" class="min-w-0">
      <div class="block min-w-max whitespace-pre border-l-2 px-2.5 py-px border-(--ui-diff-add-border) bg-(--ui-diff-add-background)">+ 新行</div>
    </div>
  </div>
 </div>
</div>`

const MEASURE = () => {
  const q = id => document.getElementById(id)
  const pick = e => {
    if (!e) return null
    const c = getComputedStyle(e)
    return { borderW: c.borderTopWidth, borderStyle: c.borderTopStyle, borderBottom: c.borderBottomWidth,
      borderBottomStyle: c.borderBottomStyle, radius: c.borderTopLeftRadius,
      bg: c.backgroundColor, bgImage: c.backgroundImage, shadow: c.boxShadow, blur: c.backdropFilter,
      padTop: c.paddingTop, color: c.color }
  }
  const glyphState = id => {
    const wrap = q(id)?.querySelector('[data-probe="glyph"]')
    if (!wrap) return null
    const after = getComputedStyle(wrap, '::after')
    const inner = wrap.firstElementChild
    return { content: after.content, afterDisplay: after.display, afterColor: after.color,
      spinnerColor: (() => { const sp = wrap.querySelector('.glyph-spinner')
        return sp ? getComputedStyle(sp).color : null })(),
      glyphDisplay: inner ? getComputedStyle(inner).display : 'missing' }
  }
  const headerOf = id => q(id)?.querySelector(':scope > div:first-child')
  return {
    thinking: pick(q('thinking')),
    toolRun: pick(q('tool-run')),
    summary: pick(q('summary')),
    summaryBtn: pick(document.querySelector('#summary button')),
    rowBodies: ['row-completed', 'row-running', 'row-failed'].map(id => pick(q(id))),
    rowHeaders: ['row-completed', 'row-running', 'row-failed'].map(id => pick(headerOf(id))),
    groupToggle: pick(q('group-toggle')),
    glyphs: { completed: glyphState('row-completed'), running: glyphState('row-running'), failed: glyphState('row-failed') },
    rowColors: { completed: pick(q('row-completed')).color, running: pick(q('row-running')).color, failed: pick(q('row-failed')).color },
    codeCard: pick(q('code-card')),
    diffLine: (() => { const el = document.querySelector('#diff-panel [data-slot="diff-lines"] > div'); const c = getComputedStyle(el)
      return { bg: c.backgroundColor, borderLeft: c.borderLeftWidth + ' ' + c.borderLeftColor } })(),
  }
}

;(async () => {
  const file = path.join(os.tmpdir(), 'bubbles-transcript-rows.html')
  fs.writeFileSync(file, pageHtml(sheets, `<div style="padding:24px;width:640px">${BODY}</div>`))
  const browser = await launchChromium()
  if (!browser) skip('playwright-core found but no Chromium/Edge/Chrome to launch')
  const pg = await browser.newPage({ viewport: { width: 760, height: 900 }, colorScheme: 'dark' })
  await pg.goto(pathToFileUrl(file))
  const m = await pg.evaluate(`(${MEASURE.toString()})()`)
  await browser.close()

  const flat = (label, layer) => {
    assert(layer, `${label} missing from the fixture`)
    assert(parseFloat(layer.borderW) === 0 || layer.borderStyle === 'none',
      `${label} must not draw a border: ${layer.borderW} ${layer.borderStyle}`)
    assert(/0, 0, 0, 0/.test(layer.bg), `${label} must not paint a fill: ${layer.bg}`)
    assert(layer.shadow === 'none', `${label} must not cast a shadow: ${layer.shadow}`)
    assert(!/blur/.test(layer.blur), `${label} must not frost: ${layer.blur}`)
  }

  console.log('\n=== Transcript Row Flatness Suite ===')
  console.log(`thinking  : ${JSON.stringify(m.thinking)}`)
  console.log(`tool-run  : ${JSON.stringify(m.toolRun)}`)
  console.log(`summary   : ${JSON.stringify(m.summary)}  btn=${JSON.stringify(m.summaryBtn)}`)
  console.log(`rows      : ${JSON.stringify(m.rowBodies)}`)
  console.log(`headers   : ${JSON.stringify(m.rowHeaders.map(h => h.borderBottom + ' ' + h.borderBottomStyle))}`)
  console.log(`toggle    : ${JSON.stringify(m.groupToggle)}`)
  console.log(`glyphs    : ${JSON.stringify(m.glyphs)}`)
  console.log(`row colors: ${JSON.stringify(m.rowColors)}`)
  console.log(`keep      : code-card=${JSON.stringify(m.codeCard)} diff=${JSON.stringify(m.diffLine)}`)

  // 1. Every row layer is bare text on the bubble.
  flat('the thinking disclosure', m.thinking)
  flat('the ToolRun group container', m.toolRun)
  flat('the group summary row', m.summary)
  flat('the group summary button', m.summaryBtn)
  flat('our group toggle pill', m.groupToggle)
  m.rowBodies.forEach((r, i) => flat(`tool row ${['completed', 'running', 'failed'][i]}`, r))
  // The app paints `border-b` on an OPEN row's header — a line across the row is
  // still a frame once the row itself has no box.
  m.rowHeaders.forEach((h, i) => assert(parseFloat(h.borderBottom) === 0 || h.borderBottomStyle === 'none',
    `tool row ${['completed', 'running', 'failed'][i]} header must not underline itself: ${h.borderBottom} ${h.borderBottomStyle}`))

  // 2. State without a box: a mark in the glyph slot, in the row's own colour.
  assert(/✓|✔/.test(m.glyphs.completed.content), `completed needs a check in the glyph slot, got ${m.glyphs.completed.content}`)
  assert(/✗|✕|×/.test(m.glyphs.failed.content), `failed needs a cross in the glyph slot, got ${m.glyphs.failed.content}`)
  assert(m.glyphs.completed.glyphDisplay === 'none', 'the type glyph must be hidden (by CSS, not removed) where a state mark replaces it')
  assert(m.glyphs.failed.glyphDisplay === 'none', 'the error circle must be hidden where the cross takes the slot')
  assert(m.glyphs.running.glyphDisplay !== 'none',
    'running keeps the app spinner — it is already the animation the user asked for')
  // The colour belongs to the mark, not to the row. A row-wide `color` also dyed
  // the duration badges, so a burst of failures turned the entire transcript
  // salmon (seen live: ~40 failed rows, all red). The app already tints the title
  // itself (fallback.tsx:321 text-destructive), so painting the row is redundant
  // and it flattens the hierarchy.
  const red = c => /252, 165, 165|248, 113, 113|239, 68, 68/.test(c || '')
  const blue = c => /59, 130, 246|96, 165, 250|147, 197, 253/.test(c || '')
  assert(!red(m.rowColors.failed) && !blue(m.rowColors.failed),
    `the failed row must not be dyed row-wide — the badges would go salmon with it: ${m.rowColors.failed}`)
  assert(!blue(m.rowColors.running) && !red(m.rowColors.running),
    `the running row must not be dyed row-wide: ${m.rowColors.running}`)
  assert(red(m.glyphs.failed.afterColor),
    `the cross should carry the red instead, got ${m.glyphs.failed.afterColor}`)
  assert(blue(m.glyphs.running.spinnerColor),
    `the app spinner should carry the sapphire, got ${m.glyphs.running.spinnerColor}`)

  // 3. The emphasis boxes survive — that is the whole point of "只保留…".
  assert(!/0, 0, 0, 0/.test(m.codeCard.bg) || m.codeCard.bgImage !== 'none',
    `the code card must keep its own surface, got ${m.codeCard.bg}`)
  assert(parseFloat(m.codeCard.radius) >= 8, `the code card must stay rounded, got ${m.codeCard.radius}`)
  assert(!/0, 0, 0, 0/.test(m.diffLine.bg), `added diff lines must keep their tint, got ${m.diffLine.bg}`)
  assert(parseFloat(m.diffLine.borderLeft) > 0, `added diff lines must keep their rule, got ${m.diffLine.borderLeft}`)

  // 4. Scope guard: flattening may only reach tool / thinking / group hooks, never
  //    a bubble-level selector (constraint: 不能影响普通文字消息的气泡外观).
  const offenders = [...sheets.pluginCss.matchAll(/([^{}]+)\{([^}]*background:\s*transparent[^}]*)\}/g)]
    .filter(([, sel]) => /aui_assistant-message|aui_user-message|aui_message-content|\.prose/.test(sel)
      && !/tool-block|thinking|tool-summary|tool-group|tool-row|disclosure|code-card|diff/.test(sel))
    .map(([, sel]) => sel.replace(/\s+/g, ' ').slice(0, 90))
  assert(offenders.length === 0, `rules that flatten a bubble-level selector: ${offenders.join(' | ')}`)

  console.log('\n=== Transcript Row Flatness Suite: PASS ===\n')
})().catch(err => {
  console.error('\n' + (err.message || err))
  process.exit(1)
})
