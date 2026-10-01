/**
 * test/capabilities-page.test.js
 *
 * The 技能 / 工具集 page renders its list inside an <aside> (master-detail.tsx:156), and
 * the skin's blanket "make containers transparent" rule reaches
 * `aside :is(.group\/row, [data-tree-group], div, span, button, h2, h3)` at (0,1,1).
 * That outranks the skin's own `[data-slot='switch']` and `[data-slot='switch-thumb']`
 * rules at (0,1,0), so on that page the thumb was painted transparent, the unchecked
 * track lost both its fill and its border, and every enabled row read as a flat blue
 * capsule with no knob — a switch that cannot show which state it is in.
 *
 * The fix pins the switch rules above the blanket rule by repeating the attribute
 * selector on the same element. This suite measures the painted result rather than the
 * rule text, and keeps the blanket rule itself alive as a control, so "the exception
 * works" cannot mean "the rule was deleted".
 *
 * Markup copied from: text-tab.tsx:15-39 (button[data-active] > span.underline),
 * tab-dropdown.tsx:115-128 (the row, and data-tour="tab-<id>"), switch.tsx:8-34
 * (h-5 w-9 track, size-4 thumb, translate-x-4 when checked), master-detail.tsx:465-510.
 *   node test/capabilities-page.test.js
 */

const { loadSheets, launchChromium, pageHtml, pathToFileUrl } = require('../scripts/lib/sheets')

const sheets = loadSheets()
if (sheets.error) { console.log(`SKIPPED — ${sheets.error}`); process.exit(0) }

const TRACK = 'peer inline-flex shrink-0 items-center rounded-full border h-5 w-9 transition-colors'
/* The knob moves through a state-variant utility, not a plain one: switch.tsx:27
   emits `data-[state=checked]:translate-x-4`, which compiles to
   `.data-\[state\=checked\]\:translate-x-4[data-state=checked]`. Radix puts data-state
   on the thumb too, so the thumb must carry it — otherwise the fixture measures a knob
   that never moves and the assertion tests the fixture instead of the skin. */
const THUMB = 'pointer-events-none block rounded-full bg-foreground shadow-[0_0.0625rem_0.1875rem_color-mix(in_srgb,var(--dt-background)_50%,transparent)] ring-0 transition-transform size-4 data-[state=unchecked]:translate-x-0 data-[state=checked]:translate-x-4 data-[state=checked]:bg-background'
const sw = (id, checked) => `<button ${id} data-slot="switch" role="switch" aria-checked="${checked}" data-state="${checked ? 'checked' : 'unchecked'}" class="${TRACK}${checked ? ' bg-primary border-transparent' : ''}"><span data-slot="switch-thumb" data-state="${checked ? 'checked' : 'unchecked'}" class="${THUMB}"></span></button>`

const row = (title, checked) => `<div class="group/row row-hover flex w-full shrink-0 items-center rounded-md h-11 text-(--ui-text-secondary)"><button class="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md pl-2 pr-1.5 text-left"><span class="min-w-0 flex-1"><span class="block truncate text-[0.78rem] font-medium text-foreground/85">${title}</span></span><span class="shrink-0 rounded bg-(--ui-bg-quinary) px-1 py-px text-[0.6rem] tabular-nums">×6.8k</span></button>${sw('', checked)}</div>`

const TAB = 'inline-flex h-7 items-center gap-1 bg-transparent px-1 font-medium text-(--ui-text-tertiary) transition-colors group/text-tab'
const tab = (domId, tabId, label, active) => `<button ${domId} data-active="${active}" data-tour="tab-${tabId}" class="${TAB}${active ? ' text-foreground' : ' text-(--ui-text-tertiary)'}"><span class="underline-offset-4 decoration-current/25${active ? ' underline' : ''}">${label}</span><span class="text-[0.72em] font-normal text-(--ui-text-tertiary)">46</span></button>`

const BODY = `<section class="flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background)" style="width:760px">`
  + `<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 justify-center" style="padding:8px">`
  + tab('id="tab-skills"', 'skills', '技能', true) + tab('id="tab-toolsets"', 'toolsets', '工具集', false)
  + `</div>`
  + `<aside class="flex min-h-0 flex-col p-2">` + row('Terminal & Processes', true) + row('Kanban', false)
  + `<div id="plain" class="bg-(--ui-bg-quinary) rounded-md p-2">普通容器</div></aside>`
  + `</section>`

;(async () => {
  const browser = await launchChromium()
  if (!browser) { console.log('SKIPPED — no Chromium available'); process.exit(0) }
  let failures = 0
  let total = 0
  try {
    const fs = require('fs')
    const os = require('os')
    const path = require('path')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capabilities-'))
    const file = path.join(dir, 'c.html')
    fs.writeFileSync(file, pageHtml(sheets, BODY))
    const page = await browser.newPage({ viewport: { width: 800, height: 520 }, deviceScaleFactor: 2, colorScheme: 'dark' })
    await page.goto(pathToFileUrl(file))

    const read = sel => page.evaluate(s => {
      const el = document.querySelector(s)
      if (!el) return { missing: true }
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return { bg: cs.backgroundColor, borderW: cs.borderTopWidth, borderStyle: cs.borderTopStyle,
        radius: cs.borderTopLeftRadius, shadow: cs.boxShadow, transition: cs.transitionProperty,
        transform: cs.transform, translate: cs.translate,
        w: Math.round(r.width), h: Math.round(r.height), color: cs.color }
    }, sel)

    const check = (name, ok, detail) => {
      total += 1
      if (!ok) failures += 1
      console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
    }
    const alpha = v => {
      const m = /rgba?\(([^)]+)\)/.exec(v)
      if (!m) return null
      const p = m[1].split(',').map(Number)
      return p.length === 4 ? p[3] : 1
    }
    const visible = f => !f.missing && alpha(f.bg) > 0.4
    /* Tailwind v4 moves the knob with the standalone `translate` property
       (translate-x-4 → `translate: 16px 0px`), not with `transform`. */
    const tx = f => {
      const t = parseFloat((f.translate || '0').split(' ')[0])
      if (Number.isFinite(t) && f.translate !== 'none') return t
      const m = /matrix\(([^)]+)\)/.exec(f.transform || '')
      return m ? Number(m[1].split(',')[4]) : 0
    }

    console.log('\n=== Capabilities Page Suite ===\n')
    console.log('[the switch shows its state again]')
    const on = await read('aside [data-slot="switch"][data-state="checked"]')
    const off = await read('aside [data-slot="switch"][data-state="unchecked"]')
    const onThumb = await read('aside [data-state="checked"] [data-slot="switch-thumb"]')
    const offThumb = await read('aside [data-state="unchecked"] [data-slot="switch-thumb"]')

    check('checked track paints an opaque fill', visible(on), JSON.stringify(on))
    check('unchecked track paints an opaque fill (it was invisible)', visible(off), JSON.stringify(off))
    check('both tracks keep a real border', parseFloat(on.borderW) >= 1 && on.borderStyle === 'solid'
      && parseFloat(off.borderW) >= 1 && off.borderStyle === 'solid',
      `on ${on.borderW} ${on.borderStyle} / off ${off.borderW} ${off.borderStyle}`)
    check('the knob is opaque white on both', visible(onThumb) && visible(offThumb)
      && /255, 255, 255/.test(onThumb.bg), `on=${onThumb.bg} off=${offThumb.bg}`)
    check('the knob is a real circle inside the track',
      onThumb.w === onThumb.h && onThumb.w > 12 && onThumb.w < on.h && parseFloat(onThumb.radius) >= onThumb.w / 2,
      `${onThumb.w}x${onThumb.h} r${onThumb.radius} inside ${on.w}x${on.h}`)
    check('checked and unchecked put the knob in different places',
      tx(onThumb) > onThumb.w / 2 && tx(offThumb) === 0, `checked tx ${tx(onThumb)}px, unchecked tx ${tx(offThumb)}px`)
    check('the knob still animates (transition: transform)', /transform/.test(onThumb.transition), onThumb.transition)
    check('both switches are the same size as each other',
      on.w === off.w && on.h === off.h, `${on.w}x${on.h} vs ${off.w}x${off.h}`)
    check('the two states differ in track colour, not just in knob',
      on.bg !== off.bg, `on=${on.bg} off=${off.bg}`)

    console.log('\n[the selected category tab is obvious]')
    const active = await read('[data-tour="tab-skills"][data-active="true"]')
    const idle = await read('[data-tour="tab-toolsets"][data-active="false"]')
    check('selected tab carries its own background + border', alpha(active.bg) > 0
      && parseFloat(active.borderW) >= 1 && active.borderStyle === 'solid', JSON.stringify(active))
    check('unselected tab stays flat', alpha(idle.bg) === 0 && parseFloat(idle.borderW) === 0, JSON.stringify(idle))
    check('selected text is brighter than unselected',
      active.color !== idle.color && /rgb\(255, 255, 255\)/.test(active.color), `${active.color} vs ${idle.color}`)
    check('the two states are not the same box', active.bg !== idle.bg, `${active.bg} vs ${idle.bg}`)

    console.log('\n[control: the blanket aside rule is still in force]')
    const plain = await read('#plain')
    check('a plain container inside the page stays transparent',
      !plain.missing && alpha(plain.bg) === 0, JSON.stringify(plain))
  } finally {
    await browser.close()
  }
  console.log(`\n${failures ? 'FAIL' : 'OK'} — ${total - failures}/${total} assertions`)
  process.exit(failures ? 1 : 0)
})().catch(err => { console.error(err); process.exit(1) })
