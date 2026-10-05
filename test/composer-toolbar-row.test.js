/**
 * test/composer-toolbar-row.test.js
 *
 * The composer's second row is one flex container (controls.tsx:116,
 * `div.flex.min-w-0.shrink.items-center.gap-(--composer-control-gap)`) holding, in
 * DOM order, the six controls the user reads left to right: 添加附件 / 模型选择 /
 * 推理强度 / 语音听写 / 语音对话 / 语音引擎. That order was confirmed from the live
 * window — the row is not reordered by anything else in the skin.
 *
 * The agreed shape: the model cluster leads the left group (模型 → 推理 → 附件), the
 * voice cluster sits flush right, everything on one vertically centred line with the
 * row's own gap, and a 1px low-contrast divider between the prompt text and the row.
 *
 * Mechanism, because it has to survive the controls appearing and disappearing:
 *   - the two pills carry real hooks (data-tour="model-pill", data-testid=
 *     "reasoning-pill") and get order:-1, so they lead the row without touching DOM;
 *   - the right group is split off by an auto left margin on the voice cluster's own
 *     fan-menu anchor (voice-fan.tsx:105 → fan-menu.tsx:248), scoped to the controls
 *     row so it cannot reach the ＋ fan in the menu area. An auto margin on "the row's
 *     first child" was tried first and drove a wedge between the two pills — which is
 *     exactly what test/composer-codex-layout.test.js caught.
 *   node test/composer-toolbar-row.test.js
 */

const { loadSheets, launchChromium, pageHtml, pathToFileUrl } = require('../scripts/lib/sheets')

const sheets = loadSheets()
if (sheets.error) { console.log(`SKIPPED — ${sheets.error}`); process.exit(0) }

const ICON_BTN = 'inline-flex size-7 items-center justify-center rounded-full p-0'
/* The composer grid exactly as index.tsx:1526-1547 renders it in the stacked layout,
   with the skin's own grid-template override applied on top. */
const BODY = `<div style="padding:24px;width:960px"><div data-slot='composer-root'><div data-slot='composer-dock'>`
  + `<div data-slot='composer-surface' class='relative w-full rounded-2xl px-3 pb-2 pt-2'>`
  + `<div class='grid w-full grid-cols-[auto_1fr] gap-(--composer-row-gap) [grid-template-areas:"input_input"_"menu_controls"]'>`
  + `<div class='flex translate-y-[3px] items-start gap-(--composer-control-gap) self-start [grid-area:menu]' id='menu'>`
  + `<div data-slot='fan-menu-anchor' id='plus' class='relative inline-flex'><button class='${ICON_BTN}' type='button'>+</button></div>`
  + `</div>`
  + `<div class='min-w-0 [grid-area:input]' id='inputarea'><div class='relative w-full'>`
  + `<div aria-label='消息' contenteditable='true' id='prompt' class='min-h-6 w-full text-[0.9rem]'>把看板背景统一</div>`
  + `</div></div>`
  + `<div class='flex min-w-0 items-center justify-end gap-(--composer-control-gap) [grid-area:controls]' id='controls'>`
  + `<div class='flex min-w-0 shrink items-center gap-(--composer-control-gap)' id='row'>`
  + `<button id='attach' class='${ICON_BTN}' type='button'>clip</button>`
  + `<button id='model' data-tour='model-pill' class='inline-flex h-7 items-center gap-1 rounded-full px-2' type='button'>Qwen3.8-Flash</button>`
  + `<button id='reasoning' data-testid='reasoning-pill' class='inline-flex h-7 items-center gap-1 rounded-full px-2' type='button'>极高</button>`
  + `<div data-slot='fan-menu-anchor' id='dictate' class='relative inline-flex'><button class='${ICON_BTN}' type='button'>mic</button></div>`
  + `<button id='conversation' class='${ICON_BTN}' type='button'>wave</button>`
  + `<button id='engine' data-slot='select-trigger' class='inline-flex h-7 items-center gap-1 rounded-md px-2' type='button'>engine</button>`
  + `</div></div></div></div></div></div>`

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

  console.log('\n=== Composer Toolbar Row Suite ===\n')
  const fs = require('fs')
  const os = require('os')
  const path = require('path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'composer-row-'))
  const file = path.join(dir, 'c.html')
  fs.writeFileSync(file, pageHtml(sheets, BODY))
  const page = await browser.newPage({ viewport: { width: 1020, height: 320 }, deviceScaleFactor: 2, colorScheme: 'dark' })
  await page.goto(pathToFileUrl(file))

  const m = await page.evaluate(() => {
    const rect = id => {
      const r = document.getElementById(id).getBoundingClientRect()
      return { x: Math.round(r.left), right: Math.round(r.right), cy: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) }
    }
    const ids = ['plus', 'attach', 'model', 'reasoning', 'dictate', 'conversation', 'engine']
    const out = { items: Object.fromEntries(ids.map(id => [id, rect(id)])) }
    const row = document.getElementById('row')
    const rs = getComputedStyle(row)
    out.rowGap = rs.gap
    out.rowAlign = rs.alignItems
    out.rowWrap = rs.flexWrap
    const input = document.getElementById('inputarea')
    const af = getComputedStyle(input, '::after')
    const ir = input.getBoundingClientRect()
    const ar = document.getElementById('attach').getBoundingClientRect()
    out.divider = {
      content: af.content, height: af.height, bg: af.backgroundColor,
      left: af.left, right: af.right, top: af.top, position: af.position,
      insetFromRowTop: Math.round(ar.top - ir.bottom)
    }
    out.inputPosition = getComputedStyle(input).position
    return out
  })
  const it = m.items
  const order = ['attach', 'model', 'reasoning', 'dictate', 'conversation', 'engine']
    .slice().sort((a, b) => it[a].x - it[b].x)

  console.log('[left group: 模型 → 推理 → 附件]')
  check(`visual order is model, reasoning, attach — got ${order.slice(0, 3).join(' → ')}`,
    order[0] === 'model' && order[1] === 'reasoning' && order[2] === 'attach', JSON.stringify(order))
  const left = ['model', 'reasoning', 'attach'].map(k => it[k]).sort((a, b) => a.x - b.x)
  const leftGaps = [left[1].x - left[0].right, left[2].x - left[1].right]
  check('the three left items sit next to each other (no auto gap inside the group)',
    leftGaps.every(g => g >= 0 && g <= 14), `gaps ${leftGaps.join('px / ')}px`)

  console.log('\n[right group: the voice cluster is pinned right]')
  const leftEnd = Math.max(it.attach.right, it.model.right, it.reasoning.right)
  check('the voice cluster starts after a real gap', it.dictate.x - leftEnd >= 40,
    `gap ${it.dictate.x - leftEnd}px`)
  check('voice items keep the row gap between each other',
    it.conversation.x - it.dictate.right <= 14 && it.engine.x - it.conversation.right <= 14,
    `${it.conversation.x - it.dictate.right}px / ${it.engine.x - it.conversation.right}px`)
  check('the voice cluster is the rightmost thing in the row',
    it.engine.right >= it.dictate.right && it.engine.right > it.attach.right, JSON.stringify(it.engine))

  console.log('\n[one row, vertically centred, equal gaps]')
  const centers = order.map(k => it[k].cy)
  check('all six controls share one line', Math.max(...centers) - Math.min(...centers) <= 1,
    `cy spread ${Math.max(...centers) - Math.min(...centers)}px`)
  const plusLine = Math.abs(it.plus.cy - centers[0])
  check('the leading + menu sits on the same line too', plusLine <= 1, `Δcy ${plusLine}px`)
  check('the row centres its items (align-items: center)', m.rowAlign === 'center', m.rowAlign)
  check('the row does not wrap', m.rowWrap === 'nowrap', m.rowWrap)
  const heights = order.map(k => it[k].h)
  check('icon controls keep one height', new Set(heights.filter((h, i) => ['attach', 'dictate', 'conversation'].includes(order[i]))).size <= 2,
    JSON.stringify(Object.fromEntries(order.map(k => [k, it[k].h]))))

  console.log('\n[divider between the prompt and the toolbar]')
  check('the input area is positioned so the line can hang off it',
    m.inputPosition === 'relative', m.inputPosition)
  check('a 1px pseudo-element divider exists under the prompt',
    m.divider.content !== 'none' && parseFloat(m.divider.height) <= 1.5, JSON.stringify(m.divider))
  check('it is low contrast (alpha ≤ 0.16)', (() => {
    const p = (m.divider.bg.match(/[\d.]+/g) || []).map(Number)
    return p.length === 4 ? p[3] > 0 && p[3] <= 0.16 : false
  })(), m.divider.bg)
  check('it is inset from both edges, not full width',
    parseFloat(m.divider.left) >= 8 && parseFloat(m.divider.right) >= 8,
    `left ${m.divider.left} / right ${m.divider.right}`)
  check('the toolbar row sits below the line, not on it', m.divider.insetFromRowTop >= 2,
    `attach starts ${m.divider.insetFromRowTop}px below the input area`)

  await browser.close()
  console.log(`\n${failures ? 'FAIL' : 'OK'} — ${total - failures}/${total} assertions`)
  process.exit(failures ? 1 : 0)
})().catch(err => { console.error(err); process.exit(1) })
