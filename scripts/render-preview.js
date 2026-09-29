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
 * Caveat printed with every run: codicon glyphs may not resolve offline, so icons
 * are approximate while geometry, colour and typography are real.
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
// which is the box the skin now has to beat.
const TOOL_ROW = (state, label, glyph) =>
  `<div data-slot="tool-block" data-tool-row="" data-conversation-scaffold="" data-tool-open="" data-bubbles-tool-state="${state}" class="group/tool-block min-w-0 max-w-full overflow-hidden rounded-[0.3125rem] border border-(--ui-stroke-tertiary) text-[length:var(--conversation-tool-font-size)] text-(--ui-text-tertiary)">`
  + `<div class="border-b border-(--ui-stroke-tertiary) px-2 py-1.5 flex items-center gap-1.5"><span class="grid size-3.5 shrink-0 place-items-center self-center">${glyph}</span><span>${label}</span></div></div>`

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
    viewport: { width: 760, height: 360 },
    body: `<div style="padding:24px;width:680px"><div data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content" id="shot" class="min-w-0 max-w-full">`
      + `<p>我先把三个候选文件读一遍，再决定改哪一层。</p>`
      + `<div data-slot="aui_thinking-disclosure" data-conversation-scaffold="" class="text-[length:var(--conversation-tool-font-size)] text-(--ui-text-tertiary)">`
      + `<button type="button" aria-expanded="false" class="group/disclosure-row flex items-center gap-1.5"><span class="grid size-3.5 shrink-0 place-items-center self-center"><i class="codicon codicon-chevron-right shrink-0 rotate-90"></i></span><span class="text-(--conversation-scaffold-text)">已思考</span></button></div>`
      + `<div class="bubbles-tool-group" data-tool-count="3"><button type="button" aria-expanded="true" class="bubbles-tool-group-toggle"><span class="bubbles-group-icon">✓</span><span>3 个工具调用</span><span class="bubbles-group-chevron"></span></button></div>`
      + `<div data-slot="tool-block" data-tool-group="" class="grid min-w-0 max-w-full gap-(--tool-row-gap) overflow-hidden">`
      + `<div data-tool-summary="" data-conversation-scaffold=""><button type="button" aria-expanded="true" class="group/disclosure-row flex items-center gap-1.5"><span class="text-(--ui-text-tertiary) truncate">已探索 4 个文件、运行 4 条命令</span></button></div>`
      + TOOL_ROW('completed', '已读取 disclosure-row.tsx', '<svg viewBox="0 0 256 256" class="shrink-0"></svg>')
      + TOOL_ROW('running', '已运行 sleep 20 + 1 command', '<span role="status" class="glyph-spinner size-3.5 shrink-0 text-[0.95rem]"></span>')
      + TOOL_ROW('failed', 'Reading https://this-domain-surely-not-exist.invalid', '<svg viewBox="0 0 24 24" class="size-3.5 shrink-0 text-destructive"></svg>')
      + `</div>`
      + `<div data-slot="code-card" class="group/code relative min-w-0 max-w-full overflow-hidden rounded-[0.625rem] bg-(--ui-bg-editor)"><pre class="code-card-body font-mono text-[0.7rem] leading-relaxed">status === 'success' &amp;&amp; 'text-green-600 dark:text-green-400'</pre></div>`
      + `<div data-slot="file-diff-panel" class="min-w-0 max-w-full overflow-hidden"><div data-slot="diff-lines" class="min-w-0"><div class="block min-w-max whitespace-pre border-l-2 px-2.5 py-px border-(--ui-diff-add-border) bg-(--ui-diff-add-background)">+ 新加入的一行</div><div class="block min-w-max whitespace-pre border-l-2 px-2.5 py-px border-(--ui-diff-remove-border) bg-(--ui-diff-remove-background)">- 被删掉的一行</div></div></div>`
      + `</div></div></div>`,
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
    fs.writeFileSync(file, pageHtml(sheets, s.body))
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
})()
