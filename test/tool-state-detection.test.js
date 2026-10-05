/**
 * test/tool-state-detection.test.js
 *
 * detectToolState decides whether a tool row shows a spinner, a ✓ or a ✗. It is
 * pure DOM reading, so it is tested against a real DOM running the real shipped
 * function — not a copy scraped out with a brace counter, and not a mock: the
 * bugs here ARE DOM semantics (`button:first-child`, nested subtrees), and a mock
 * that does not implement those cannot catch them.
 *
 * Markup is copied from the renderer, per the project's fixture rule:
 *   fallback.tsx:568-585  the block shell + header wrapper
 *   fallback.tsx:210      error glyph   <svg class="size-3.5 shrink-0 text-destructive">
 *   fallback.tsx:200-207  running glyph <span class="glyph-spinner ...">
 *   fallback.tsx:320      a failed TITLE also carries text-destructive
 *   fallback.tsx:676      the body error block <div class="max-w-full text-xs ... text-destructive">
 *   disclosure-row.tsx    button.group/disclosure-row > span.grid.size-3.5
 *
 * Two cases were RED before the fix (I: a braille character in the title pinned
 * the row to running; H: a nested tool block's failure leaked to its parent), and
 * one audit claim was tested and rejected (G: see its comment).
 *   node test/tool-state-detection.test.js
 */

const { launchChromium, pluginScriptForPage } = require('../scripts/lib/sheets')

const HEADER_GLYPH_WRAP = 'grid size-3.5 shrink-0 place-items-center self-center'
const ERROR_GLYPH = '<svg class="size-3.5 shrink-0 text-destructive" aria-label="出错了"></svg>'
const OK_GLYPH = '<svg class="size-3.5 shrink-0 text-emerald-600/85" aria-label="已完成"></svg>'
// glyph-spinner.tsx:96-110 — the real spinner is NOT `.animate-spin` and carries
// no `data-glyph-spinner`: every braille frame is in the DOM from mount and a
// transform keyframe scrolls between them. So the skin's U+2800–U+28FF text test
// is the ONLY thing that detects a running tool, and it has to stay.
const SPINNER = '<span aria-label="运行中" role="status" class="inline-flex items-center justify-center font-mono leading-none tabular-nums size-3.5 shrink-0 text-[0.95rem]">'
  + '<span aria-hidden="true" class="glyph-spinner"><span class="glyph-spinner__strip">'
  + '<span class="glyph-spinner__frame">⠋</span><span class="glyph-spinner__frame">⠙</span>'
  + '<span class="glyph-spinner__frame">⠹</span></span></span></span>'

const toolBlock = ({ glyph = OK_GLYPH, title = '已编辑 src/a.ts', titleClass = '', body = '', extraAttrs = '' }) =>
  `<div data-slot="tool-block" data-tool-row="" data-conversation-scaffold=""${extraAttrs}`
  + ` class="group/tool-block min-w-0 max-w-full overflow-hidden text-(--ui-text-tertiary)">`
  + `<div class="border-b border-(--ui-stroke-tertiary) px-2 py-1.5">`
  + `<button type="button" aria-expanded="false" class="group/disclosure-row flex items-center gap-1.5">`
  + `<span class="${HEADER_GLYPH_WRAP}">${glyph}</span>`
  + `<span class="text-(--conversation-scaffold-text)${titleClass}">${title}</span>`
  + `</button></div>${body}</div>`

const CASES = [
  // --- controls: the verdicts that must not move -----------------------------
  ['A 头部错误字形 → failed',
    toolBlock({ glyph: ERROR_GLYPH }), 'failed'],
  ['B 标题被标红 (fallback.tsx:320) → failed',
    toolBlock({ glyph: OK_GLYPH, titleClass: ' text-destructive' }), 'failed'],
  ['C 正文错误块 (fallback.tsx:676) → failed',
    toolBlock({ glyph: OK_GLYPH, body: '<div class="max-w-full text-xs leading-relaxed text-destructive"><span>ENOENT: no such file</span></div>' }), 'failed'],
  ['D 头部转圈 → running',
    toolBlock({ glyph: SPINNER }), 'running'],
  ['E 只有 <pre> 里标红 → 不算失败',
    toolBlock({ glyph: OK_GLYPH, body: '<pre class="font-mono text-destructive">- removed line</pre>' }), 'completed'],

  // --- the three bugs --------------------------------------------------------
  ['I 标题里含盲文字符，不得判定为 running',
    // statusGlyph resolves to the whole header row, and the braille test reads its
    // textContent — which includes the TITLE. Titles come from commands and paths,
    // so a braille character in one pins the row to running forever. Only the glyph
    // slot may decide.
    toolBlock({ glyph: OK_GLYPH, title: '已读取 ⠿ 终端输出.log' }), 'completed'],
  ['F 正文 button 含盲文，不得判定为 running',
    // `button:first-child` is a DESCENDANT selector, so the glyph scan can walk
    // into the body. Today the header matches first and wins — this case locks that
    // precedence in, so removing the header alternative cannot silently let the
    // body decide.
    toolBlock({
      glyph: OK_GLYPH,
      body: '<div class="tool-output"><button type="button">⠿ 正在加载终端输出</button></div>',
    }), 'completed'],
  ['G 无任何标记 → completed（宿主的静默成功，不是缺状态）',
    // fallback.tsx:262 "Success is silent — the row reads as done without a
    // checkmark", and ToolGlyph returns null when there is no status, no file and
    // no icon. This case exists because an audit claim of "a queued tool gets a ✓,
    // add an unknown tier" was checked against the renderer and found false; the
    // host has no fourth state to invent.
    `<div data-slot="tool-block" data-tool-row="" data-conversation-scaffold="" class="group/tool-block">`
    + `<div class="px-2 py-1.5"><span class="text-(--conversation-scaffold-text)">等待执行</span></div></div>`,
    'completed'],
  ['H 失败属于嵌套工具块时，外层不得跟着标红',
    // The caller skips nested blocks when iterating, but detectToolState scans the
    // whole subtree — so the inner failure is read as the outer one's.
    toolBlock({
      glyph: OK_GLYPH,
      body: `<div data-slot="tool-block" data-tool-row="" class="group/tool-block">`
        + `<div class="px-2 py-1.5"><button type="button" class="group/disclosure-row flex items-center gap-1.5">`
        + `<span class="${HEADER_GLYPH_WRAP}">${ERROR_GLYPH}</span><span>内层失败的工具</span></button></div></div>`,
    }), 'completed'],
]

;(async () => {
  const browser = await launchChromium()
  if (!browser) { console.log('SKIPPED — no Chromium available'); process.exit(0) }
  let failures = 0
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><html><body><div id="host"></div></body></html>')
    await page.addScriptTag({ content: pluginScriptForPage() })
    const exists = await page.evaluate(() => typeof detectToolState === 'function')
    if (!exists) throw new Error('detectToolState is not callable in the page — pluginScriptForPage broke')

    console.log('\n=== Tool State Detection Suite ===\n')
    for (const [name, html, want] of CASES) {
      const got = await page.evaluate(({ html, want }) => {
        const host = document.getElementById('host')
        host.innerHTML = html
        return detectToolState(host.firstElementChild)
      }, { html, want })
      const ok = got === want
      if (!ok) failures += 1
      console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  (实得 ${got}, 期望 ${want})`}`)
    }
  } finally {
    await browser.close()
  }
  console.log(`\n${failures ? 'FAIL' : 'OK'} — ${CASES.length - failures}/${CASES.length} verdicts`)
  process.exit(failures ? 1 : 0)
})().catch(err => { console.error(err); process.exit(1) })
