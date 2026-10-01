#!/usr/bin/env node
/**
 * scripts/render-preview.js — draw a skin surface from the REAL three stylesheets.
 *
 * Why this exists: some surfaces only exist at runtime. The Tasks panel needs a
 * `todo.updated` event (or a running subagent), so "the skin looks unchanged" is
 * often untestable by eye on demand. This renders the same DOM Hermes would build,
 * with built CSS + the live skin customCSS + PLUGIN_CSS stacked in live order, and
 * writes a PNG you can judge.
 *
 *   node scripts/render-preview.js                      # every surface
 *   node scripts/render-preview.js task-panel           # one of them
 *   node scripts/render-preview.js --out /tmp/prev --scale 2 --width 700
 *
 * Adding a surface = one entry in SURFACES. Markup must be copied from the
 * renderer (apps/desktop/src), not invented: a fixture that drifts from the real
 * DOM proves nothing.
 *
 * Caveats printed with every run: codicon glyphs may not resolve offline, so icons
 * are approximate while geometry, colour and typography are real. And a surface that
 * leans on the app's own --ui-bg-* / --ui-text-* tokens reads lighter offline than
 * live, because ThemeProvider writes those inline on <html> at runtime — pass
 * `htmlClass: 'dark'` on the surface to get partway there, and judge the thing the
 * change was actually about (the page background) rather than the card fill. And the PNG bytes
 * are NOT stable — two runs of the same CSS can differ by a few hundred bytes
 * (measured: 192890 / 192890 / 192833 for one unchanged stylesheet), so never use
 * a byte or hash diff of a preview as a regression signal. The measured-style and
 * pixel tests under test/ are the arbiter; this is for the eye.
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadSheets, launchChromium, pageHtml, pathToFileUrl, REPO } = require('./lib/sheets')

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

const TODO_ROW = (state, label) => `
  <div class="status-row" data-slot="status-row" data-bubbles-task-row="true" data-task-state="${state}">
    <span class="status-row-dismiss">×</span>
    <span class="status-row-icon"><i class="codicon ${GLYPH[state]}"></i></span>
    <div class="status-row-content"><div><p>${label}</p></div></div>
    <div class="status-row-actions"><button type="button">✎</button></div>
  </div>`
const GLYPH = {
  completed: 'codicon-pass-filled text-emerald-500/80',
  running: 'codicon-loading animate-spin',
  cancelled: 'codicon-circle-slash text-muted-foreground/45',
  pending: 'codicon-circle-large-outline',
}

// fallback.tsx:567-580 — an OPEN ToolEntry carries the app's own frame classes,
// which is the box the skin now has to beat. `open` is explicit here because the
// skin frames an open row and leaves a closed one as bare text: a fixture that set
// data-tool-open on every row would render nothing but frames.
const TOOL_ROW = (state, label, glyph, { open = false, detail = '' } = {}) =>
  `<div data-slot="tool-block" data-tool-row="" data-conversation-scaffold=""${open ? ' data-tool-open=""' : ''} data-bubbles-tool-state="${state}" class="group/tool-block min-w-0 max-w-full overflow-hidden rounded-[0.3125rem] border border-(--ui-stroke-tertiary) text-[length:var(--conversation-tool-font-size)] text-(--ui-text-tertiary)">`
  + `<div class="border-b border-(--ui-stroke-tertiary) px-2 py-1.5 flex items-center gap-1.5"><span class="grid size-3.5 shrink-0 place-items-center self-center">${glyph}</span><span>${label}</span></div>`
  + (open ? `<div class="max-h-20 overflow-auto bg-transparent px-2 py-1.5 text-(--ui-text-secondary)"><pre class="font-mono text-[0.7rem]">${detail}</pre></div>` : '')
  + `</div>`

const SURFACES = {
  // status-section.tsx:40-55 + status-row.tsx leadingGlyph, with the plugin's
  // data-bubbles-task-section stamp applied (findTaskSection does that at runtime).
  'task-panel': {
    shot: '#shot',
    viewport: { width: 620, height: 360 },
    body: `
      <div style="padding:24px">
        <div style="width:520px" data-slot="composer-status-stack">
          <div class="shrink-0 border border-border/65 rounded-t-2xl border-b-0 mx-2 flex min-h-0 max-h-[inherit] shrink flex-col overflow-hidden rounded-b-none">
            <div data-slot="status-stack-scroll" class="min-h-0 overflow-y-auto overscroll-y-contain">
              <div data-slot="status-stack-content">
                <div data-slot="status-section" data-bubbles-task-section="true" id="shot">
                  <div class="status-section-header">
                    <button type="button" class="status-section-trigger"><span>任务</span></button>
                  </div>
                  <div class="status-section-body">
                    ${TODO_ROW('completed', '读取 ~/.hermes/skins/bubbles.yaml')}
                    ${TODO_ROW('completed', '列出 3 个可改进点')}
                    ${TODO_ROW('running', '只改注释，不改行为')}
                    ${TODO_ROW('pending', '跑 node --check 校验')}
                    ${TODO_ROW('cancelled', '已取消的分支')}
                    ${TODO_ROW('pending', '同步到仓库副本')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`,
    // The bar's ratio is normally written by updateTaskHeaderCounter.
    async prepare(page) {
      await page.evaluate(() => document.querySelector('.status-section-trigger')
        .style.setProperty('--bubbles-task-progress', '0.333'))
    },
  },

  // composer index.tsx:1454-1547, in the two-row geometry Phase B forces.
  'composer': {
    shot: '#shot',
    viewport: { width: 720, height: 300 },
    body: `
      <div style="padding:24px;display:flex;justify-content:center">
        <div style="width:612px" id="shot" data-slot="composer-dock">
          <div data-slot="composer-root" class="group/composer relative">
            <div data-slot="composer-surface" class="group/composer-surface relative z-4 isolate grid overflow-hidden rounded-[inherit] border">
              <div class="relative z-1 flex min-w-0 w-full flex-col overflow-hidden rounded-[inherit] px-(--composer-surface-pad-x) py-(--composer-surface-pad-y)">
                <div class="grid w-full grid-cols-[auto_1fr_auto] items-center gap-(--composer-control-gap) [grid-template-areas:&quot;menu_input_controls&quot;]">
                  <div class="flex items-start gap-(--composer-control-gap) self-start [grid-area:menu]">
                    <button type="button" class="inline-flex size-6 items-center justify-center"><i class="codicon codicon-add"></i></button>
                  </div>
                  <div class="min-w-0 [grid-area:input]"><div class="relative flex-1">
                    <div contenteditable="true" class="min-h-6 w-full text-sm">你在想什么？</div>
                  </div></div>
                  <div class="flex min-w-0 items-center justify-end gap-(--composer-control-gap) [grid-area:controls]"><div class="flex min-w-0 shrink items-center gap-(--composer-control-gap)">
                    <button type="button" data-tour="model-pill" data-state="closed" class="inline-flex items-center rounded-md px-2 text-xs">Nemotron 3 Super 12…</button>
                    <button type="button" data-testid="reasoning-pill" data-state="closed" class="inline-flex items-center rounded-md px-2 text-xs">Low</button>
                    <span data-slot="fan-menu-anchor" class="relative inline-flex size-6 items-center justify-center"><i class="codicon codicon-microphone"></i></span>
                    <span class="flex items-center"><button type="button" class="inline-flex size-7 items-center justify-center rounded-full bg-foreground text-background">➤</button></span>
                  </div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`,
  },

  // Transcript rows after the 2026-09-29 flattening: thinking + tool rows are bare
  // text on the assistant bubble, state carried by colour and the glyph slot.
  // Same markup as test/transcript-row-flatness.test.js, so the picture and the
  // assertions cannot drift apart. Kept on single lines on purpose: the app
  // inherits white-space: pre-wrap, so pretty-printing the fixture would render
  // every newline as a blank row (JSX emits no such text nodes in the real DOM).
  'transcript-rows': {
    shot: '#shot',
    viewport: { width: 760, height: 480 },
    body: `<div style="padding:24px;width:680px"><div data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content" id="shot" class="min-w-0 max-w-full">`
      + `<p>我先把三个候选文件读一遍，再决定改哪一层。</p>`
      + `<div data-slot="aui_thinking-disclosure" data-conversation-scaffold="" class="text-[length:var(--conversation-tool-font-size)] text-(--ui-text-tertiary)">`
      + `<button type="button" aria-expanded="false" class="group/disclosure-row flex items-center gap-1.5"><span class="grid size-3.5 shrink-0 place-items-center self-center"><i class="codicon codicon-chevron-right shrink-0 rotate-90"></i></span><span class="text-(--conversation-scaffold-text)">已思考</span></button></div>`
      // The same disclosure, open: aui_thinking-body only exists in this state
      // (message-parts.tsx:287), and it is the state the skin frames.
      + `<div data-slot="aui_thinking-disclosure" data-conversation-scaffold="" class="text-[length:var(--conversation-tool-font-size)] text-(--ui-text-tertiary)">`
      + `<button type="button" aria-expanded="true" class="group/disclosure-row flex items-center gap-1.5"><span class="grid size-3.5 shrink-0 place-items-center self-center"><i class="codicon codicon-chevron-right shrink-0 rotate-90"></i></span><span class="text-(--conversation-scaffold-text)">已思考</span></button>`
      + `<div data-slot="aui_thinking-body" class="mt-0.5 w-full min-w-0 overflow-auto wrap-anywhere pb-1"><div>先看宿主在展开时渲染哪个节点，再决定框挂在哪一层。</div></div></div>`
      + `<div class="bubbles-tool-group" data-tool-count="3"><button type="button" aria-expanded="true" class="bubbles-tool-group-toggle"><span class="bubbles-group-icon">✓</span><span>3 个工具调用</span><span class="bubbles-group-chevron"></span></button></div>`
      + `<div data-slot="tool-block" data-tool-group="" class="grid min-w-0 max-w-full gap-(--tool-row-gap) overflow-hidden">`
      + `<div data-tool-summary="" data-conversation-scaffold=""><button type="button" aria-expanded="true" class="group/disclosure-row flex items-center gap-1.5"><span class="text-(--ui-text-tertiary) truncate">已探索 4 个文件、运行 4 条命令</span></button></div>`
      + TOOL_ROW('completed', '已读取 disclosure-row.tsx', '<svg viewBox="0 0 256 256" class="shrink-0"></svg>')
      + TOOL_ROW('running', '已运行 sleep 20 + 1 command', '<span role="status" class="glyph-spinner size-3.5 shrink-0 text-[0.95rem]"></span>')
      + TOOL_ROW('failed', 'Reading https://this-domain-surely-not-exist.invalid', '<svg viewBox="0 0 24 24" class="size-3.5 shrink-0 text-destructive"></svg>')
      + `</div>`
      // A single open ToolEntry, framed: header + output under one edge.
      + TOOL_ROW('completed', '已运行 npm test', '<svg viewBox="0 0 256 256" class="shrink-0"></svg>',
        { open: true, detail: 'PASS  src/lib/sheets (1.2s)\n  36 passed, 0 failed' })
      + `<div data-slot="code-card" class="group/code relative min-w-0 max-w-full overflow-hidden rounded-[0.625rem] bg-(--ui-bg-editor)"><pre class="code-card-body font-mono text-[0.7rem] leading-relaxed">status === 'success' &amp;&amp; 'text-green-600 dark:text-green-400'</pre></div>`
      + `<div data-slot="file-diff-panel" class="min-w-0 max-w-full overflow-hidden"><div data-slot="diff-lines" class="min-w-0"><div class="block min-w-max whitespace-pre border-l-2 px-2.5 py-px border-(--ui-diff-add-border) bg-(--ui-diff-add-background)">+ 新加入的一行</div><div class="block min-w-max whitespace-pre border-l-2 px-2.5 py-px border-(--ui-diff-remove-border) bg-(--ui-diff-remove-background)">- 被删掉的一行</div></div></div>`
      + `</div></div></div>`,
  },

  // The two bubbles side by side, so a hue change can be judged by eye rather
  // than by reading rgba() values. Selectors from bubbles.yaml section 7:
  // assistant paints [data-slot='aui_assistant-message-content'], the user bubble
  // is .composer-human-message inside [data-slot='aui_user-message-root'].
  // The third bubble is deliberately long: the user bubble is content-sized, so a
  // gradient that reads as "warm top, cool bottom" on one line stretches into a
  // wide middle band on five, and that is the case worth seeing.
  bubbles: {
    shot: '#shot',
    viewport: { width: 900, height: 560 },
    body: `<div id="shot" style="padding:28px;display:flex;flex-direction:column;gap:18px;width:840px">`
      + `<div data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content" class="min-w-0 max-w-full"><p>助手回复：这是白雾霜玻气泡，用来和任务/工具脚手架区分。</p></div></div>`
      + `<div data-slot="aui_user-message-root" class="group/user-message"><div class="composer-human-message-container"><div class="composer-human-message">我的提问：这是用户气泡，现在穿的是图标里那条暖到冷的谱。</div></div></div>`
      + `<div data-slot="aui_user-message-root" class="group/user-message"><div class="composer-human-message-container"><div class="composer-human-message">第二条短消息</div></div></div>`
      + `<div data-slot="aui_user-message-root" class="group/user-message"><div class="composer-human-message-container"><div class="composer-human-message">长消息用来验证渐变被拉开的样子：气泡宽度跟着内容走，高度跟着行数走，所以同一份 linear-gradient 在一行时是"上暖下蓝"，到五六行中间那一段会被摊得很宽。看这个才知道真机里多条长提问会不会糊成一片，或者把黄色绿色顶到不该出现的位置。</div></div></div>`
      + `</div>`,
  },

  // The kanban page, to judge the surface unification by eye: board.tsx:1327 roots
  // itself in bg-(--ui-surface-background), which styles.css:365 defines as
  // --ui-bg-editor (the editor's near-black) until the skin routes that token to
  // transparent. Class strings copied from board.tsx:1327 (root), :1332-1335 (header
  // + count chip), :855 (notice) and :268 (card). The column wrapper is layout
  // filler — the real one is virtualised — so judge the background and the card fill
  // here, not column spacing. One limit worth stating: the card and text colours come
  // from --ui-bg-elevated / --ui-text-*, which the live app paints from
  // ThemeProvider's inline custom props on <html>. Offline we only have the built
  // sheet plus `.dark`, so the card reads light-grey. What this preview IS faithful
  // about is the thing that changed: the page no longer paints the editor's slab.
  kanban: {
    shot: '#shot',
    htmlClass: 'dark',
    viewport: { width: 900, height: 460 },
    body: `<div id="shot" style="width:860px;height:420px;display:flex">`
      + `<div class="relative flex h-full flex-col overflow-hidden bg-(--ui-surface-background)" style="flex:1">`
      + `<header class="flex shrink-0 flex-wrap items-center gap-2 px-4 py-2"><h1 class="text-sm font-semibold text-foreground">看板</h1><span class="rounded-full bg-(--ui-bg-quaternary) px-1.5 py-px text-[0.625rem] tabular-nums text-(--ui-text-tertiary)">35</span></header>`
      + `<div class="mx-4 mb-2 flex flex-col items-start gap-1.5 rounded-lg bg-(--ui-bg-quinary) px-3 py-2.5 text-[0.75rem] leading-relaxed text-(--ui-text-secondary)">卡片不由你运行，而是由代理运行。把带有负责人的卡片放入"就绪"，代理会在一分钟内领取。</div>`
      + `<div style="display:flex;min-height:0;flex:1;gap:8px;padding:0 16px"><div style="width:250px;display:flex;flex-direction:column;gap:8px">`
      + `<div class="flex items-center gap-1.5 text-[0.7rem] text-(--ui-text-tertiary)"><span>●</span><span>完成</span><span class="rounded-full bg-(--ui-bg-quaternary) px-1.5 py-px text-[0.625rem] tabular-nums">35</span></div>`
      + `<div class="group relative flex cursor-grab flex-col gap-2 rounded-md border border-(--ui-stroke-tertiary) border-l-2 bg-(--ui-bg-elevated) p-2.5"><div class="text-[0.78rem] font-medium text-foreground/85">核实 Eppendorf 5425R 停产/替代情报</div><div class="text-[0.68rem] text-(--ui-text-tertiary)">5425R 情报已开源并编译竞品层</div></div>`
      + `<div class="group relative flex cursor-grab flex-col gap-2 rounded-md border border-(--ui-stroke-tertiary) border-l-2 bg-(--ui-bg-elevated) p-2.5"><div class="text-[0.78rem] font-medium text-foreground/85">贝克曼国产 C 系列参数卡编译入 wiki</div></div>`
      + `</div></div></div></div>`,
  },

  // The 技能 / 工具集 page. Both cases that were broken sit side by side: the
  // switches (track and knob were being painted transparent by the skin's blanket
  // aside rule) and the category tabs (the selected one had no cue but a 25%-alpha
  // underline). Class strings copied from text-tab.tsx:15-39, tab-dropdown.tsx:115,
  // switch.tsx:8-34 — including the data-[state=checked]:translate-x-4 variant,
  // which is what actually moves the knob — and master-detail.tsx:156/465-512.
  capabilities: {
    shot: '#shot',
    htmlClass: 'dark',
    viewport: { width: 760, height: 340 },
    body: `<div id="shot" style="width:720px">`
      + `<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 justify-center" style="padding:10px">`
      + `<button data-active="true" data-tour="tab-skills" class="group/text-tab inline-flex h-7 items-center gap-1 bg-transparent px-1 font-medium text-foreground" type="button"><span class="underline-offset-4 decoration-current/25 underline">技能</span><span class="text-[0.72em] font-normal text-(--ui-text-tertiary)">46</span></button>`
      + `<button data-active="false" data-tour="tab-toolsets" class="group/text-tab inline-flex h-7 items-center gap-1 bg-transparent px-1 font-medium text-(--ui-text-tertiary)" type="button"><span class="underline-offset-4 decoration-current/25">工具集</span><span class="text-[0.72em] font-normal text-(--ui-text-tertiary)">25</span></button>`
      + `<button data-active="false" data-tour="tab-connectors" class="group/text-tab inline-flex h-7 items-center gap-1 bg-transparent px-1 font-medium text-(--ui-text-tertiary)" type="button"><span class="underline-offset-4 decoration-current/25">Connectors</span></button>`
      + `</div>`
      + `<aside class="flex min-h-0 flex-col p-2">`
      + `<div class="group/row row-hover flex w-full shrink-0 items-center rounded-md h-11 bg-(--ui-row-active-background) text-foreground"><button class="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md pl-2 pr-1.5 text-left" type="button"><span class="min-w-0 flex-1"><span class="block truncate text-[0.78rem] font-medium text-foreground/85">Terminal &amp; Processes</span><span class="flex min-w-0 items-center gap-1 text-[0.62rem] text-muted-foreground/50"><span>terminal, process</span></span></span><span class="shrink-0 rounded bg-(--ui-bg-quinary) px-1 py-px text-[0.6rem] tabular-nums">×6.8k</span></button>`
      + `<button data-slot="switch" role="switch" aria-checked="true" data-state="checked" class="peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors bg-primary border-transparent" type="button"><span data-slot="switch-thumb" data-state="checked" class="pointer-events-none block size-4 rounded-full bg-background shadow-[0_0.0625rem_0.1875rem_color-mix(in_srgb,var(--dt-background)_50%,transparent)] ring-0 transition-transform data-[state=unchecked]:translate-x-0 data-[state=checked]:translate-x-4 data-[state=checked]:bg-background"></span></button></div>`
      + `<div class="group/row row-hover flex w-full shrink-0 items-center rounded-md h-11 text-(--ui-text-secondary)"><button class="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md pl-2 pr-1.5 text-left" type="button"><span class="min-w-0 flex-1"><span class="block truncate text-[0.78rem] font-normal text-muted-foreground/60">Kanban</span><span class="flex min-w-0 items-center gap-1 text-[0.62rem] text-muted-foreground/50"><span>opt-in task board tools</span></span></span><span class="shrink-0 rounded bg-(--ui-bg-quinary) px-1 py-px text-[0.6rem] tabular-nums">×128</span></button>`
      + `<button data-slot="switch" role="switch" aria-checked="false" data-state="unchecked" class="peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border opacity-60 transition-colors" type="button"><span data-slot="switch-thumb" data-state="unchecked" class="pointer-events-none block size-4 rounded-full bg-foreground shadow-[0_0.0625rem_0.1875rem_color-mix(in_srgb,var(--dt-background)_50%,transparent)] ring-0 transition-transform data-[state=unchecked]:translate-x-0 data-[state=checked]:translate-x-4 data-[state=checked]:bg-background"></span></button></div>`
      + `</aside></div>`,
  },
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? dflt : argv.splice(i, 2)[1]
}
const outDir = opt('out', path.join(REPO, 'docs', 'previews'))
const scale = Number(opt('scale', 2))
const widthOverride = Number(opt('width', 0))
const wanted = argv.filter(a => !a.startsWith('--'))
const names = wanted.length ? wanted : Object.keys(SURFACES)

for (const n of names) {
  if (!SURFACES[n]) {
    console.error(`unknown surface: ${n}\navailable: ${Object.keys(SURFACES).join(', ')}`)
    process.exit(2)
  }
}

;(async () => {
  const sheets = loadSheets()
  if (sheets.error) { console.error(`cannot render: ${sheets.error}`); process.exit(1) }
  const browser = await launchChromium()
  if (!browser) { console.error('cannot render: no Chromium/Edge/Chrome via playwright-core'); process.exit(1) }

  fs.mkdirSync(outDir, { recursive: true })
  console.log(`sheets: built=${path.basename(sheets.built)} skin=${sheets.skinPath.replace(os.homedir(), '~')} plugin=${sheets.pluginCss.length}b`)

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bubbles-preview-'))
  for (const name of names) {
    const s = SURFACES[name]
    const file = path.join(dir, `${name}.html`)
    fs.writeFileSync(file, pageHtml(sheets, s.body, { htmlClass: s.htmlClass || '' }))
    const page = await browser.newPage({
      viewport: { width: widthOverride || s.viewport.width, height: s.viewport.height },
      deviceScaleFactor: scale, colorScheme: 'dark',
    })
    await page.goto(pathToFileUrl(file))
    if (s.prepare) await s.prepare(page)
    const out = path.join(outDir, `${name}.png`)
    await page.locator(s.shot).screenshot({ path: out })
    console.log(`  ${name.padEnd(12)} → ${out.replace(os.homedir(), '~')}  (${fs.statSync(out).size} bytes)`)
    await page.close()
  }
  await browser.close()
  console.log('note: codicon glyphs may not resolve offline — judge geometry/colour/type, not icons.')
  console.log('note: surfaces that lean on --ui-bg-* / --ui-text-* read lighter here than live,')
  console.log('      because ThemeProvider writes those tokens inline on <html> at runtime.')
})()
