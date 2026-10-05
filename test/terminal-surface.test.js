/**
 * test/terminal-surface.test.js
 *
 * The terminal panel rendered as a dark slab inside a frosted UI, and the first fix
 * (retuning --ui-terminal-surface-background to #113c6a) did nothing. Reason: the
 * skin's own ambient-backdrop rule listed [class*='bg-(--ui-terminal-surface-background)']
 * and .xterm/.xterm-viewport/.xterm-screen and painted them with a viewport-fixed
 * gradient stack plus `background-color: #0d2a4d !important`. A literal !important in
 * the unlayered skin sheet outranks the app's own utility, so the token the app reads
 * never reached the screen — measured live, the token resolved to rgb(17,60,106) while
 * the element painted rgb(13,42,77).
 *
 * The invariant this pins: the terminal paints its OWN token, with no gradient under
 * it, because xterm hands the resolved color to a WebGL canvas that cannot composite
 * one (terminal/selection.ts:82, right-sidebar/terminal/instance.tsx:21). The rail is
 * the control — it keeps the ambient gradient, so a passing "no gradient on the
 * terminal" cannot mean the backdrop rule stopped working.
 *   node test/terminal-surface.test.js
 */

const { loadSheets, launchChromium, pageHtml, pathToFileUrl } = require('../scripts/lib/sheets')

const sheets = loadSheets()
if (sheets.error) { console.log(`SKIPPED — ${sheets.error}`); process.exit(0) }

/* Class strings copied from the renderer: surfaces.tsx:63, instance.tsx:15/21,
   rail.tsx:47. The xterm element names are what xterm.js itself emits. */
const BODY = `<div style="padding:0;width:680px;height:420px"><div data-slot="sidebar-container" class="flex h-full">`
  + `<div id="rail" class="group/rail relative z-40 flex h-full w-9 shrink-0 flex-col items-center border-l border-(--ui-stroke-quaternary) bg-(--ui-terminal-surface-background)"></div>`
  + `<div id="panel" class="relative flex h-full min-h-0 flex-col overflow-hidden bg-(--ui-terminal-surface-background)">`
  + `<div id="instance" class="absolute inset-0 flex flex-col bg-(--ui-terminal-surface-background) px-2 pb-2 pt-0">`
  + `<div id="xterm" class="terminal xterm"><div id="viewport" class="xterm-viewport"><div id="screen" class="xterm-screen"></div></div>`
  /* xterm's own Viewport element. It carries an inline background from the resolved
     theme, and it is WIDER than .xterm-screen by the scrollbar gutter — which is the
     dark strip down the right edge of an otherwise correct panel. The host only pins
     .xterm-screen and .xterm-viewport (instance.tsx:21), so this one needs the skin. */
  + `<div id="scrollable" class="xterm-scrollable-element mac" style="background-color: rgb(11, 31, 51)"><div class="xterm-helper-textarea"></div></div>`
  + `</div></div></div></div>`

const SURFACES = ['panel', 'instance', 'xterm', 'viewport', 'screen', 'scrollable']

;(async () => {
  const browser = await launchChromium()
  if (!browser) { console.log('SKIPPED — no Chromium available'); process.exit(0) }
  let failures = 0
  let total = 0
  try {
    const fs = require('fs')
    const os = require('os')
    const path = require('path')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-surface-'))
    const file = path.join(dir, 't.html')
    fs.writeFileSync(file, pageHtml(sheets, BODY))
    const page = await browser.newPage({ viewport: { width: 720, height: 460 }, deviceScaleFactor: 2, colorScheme: 'dark' })
    await page.goto(pathToFileUrl(file))

    const read = () => page.evaluate(ids => {
      /* Resolve the token the way the app does: a probe element the browser paints,
         not the custom property's authored string (it may be a color-mix). */
      const probe = document.createElement('span')
      probe.style.cssText = 'position:absolute;visibility:hidden;background-color:var(--ui-terminal-surface-background)'
      document.body.append(probe)
      const token = getComputedStyle(probe).backgroundColor
      probe.remove()
      const lum = rgb => {
        const [r, g, b] = rgb.match(/\d+/g).slice(0, 3).map(v => {
          const s = v / 255
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
        })
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
      }
      const out = { token, tokenLuminance: lum(token) }
      for (const id of ids) {
        const cs = getComputedStyle(document.getElementById(id))
        out[id] = { bg: cs.backgroundColor, image: cs.backgroundImage.slice(0, 40), attach: cs.backgroundAttachment }
      }
      return out
    }, SURFACES.concat('rail'))

    const check = (name, ok, detail) => {
      total += 1
      if (!ok) failures += 1
      console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
    }

    console.log('\n=== Terminal Surface Suite ===\n')
    const at = await read()
    const opaque = /rgb\(\d+, \d+, \d+\)/.test(at.token)
    check('the terminal token resolves to an opaque color (xterm needs one)', opaque, at.token)
    check('and it is not near-black', opaque && at.tokenLuminance >= 0.04,
      `${at.token} luminance ${at.tokenLuminance.toFixed(3)} (floor 0.040)`)

    for (const id of SURFACES) {
      check(`${id} paints the terminal token`, at[id].bg === at.token, `${at[id].bg} vs ${at.token}`)
      check(`${id} carries no ambient gradient`, at[id].image === 'none', at[id].image)
    }

    /* The control: the rail is in the same backdrop rule and must keep the gradient.
       Without it, "no gradient on the terminal" would also pass if the whole rule
       had been deleted. */
    check('control: the terminal rail keeps the ambient constellation',
      /radial-gradient/.test(at.rail.image), at.rail.image)

    /* The bake-time path. xterm resolves the token once when the terminal is created
       and not again unless the theme changes, and customCSS reaches the document later
       than that from ThemeProvider's runtime <style> — which is what makes a restored
       panel read "blue for a moment, then black". PLUGIN_CSS is installed by the plugin
       before the right sidebar mounts, so it has to carry the token itself. Load ONLY
       the built sheet plus PLUGIN_CSS and read what the app's probe would see at boot. */
    const earlyFile = path.join(dir, 'early.html')
    fs.writeFileSync(earlyFile, `<!doctype html><html data-bubbles-skin='true' data-hermes-mode='dark'><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileUrl(sheets.built)}">
<style>${sheets.pluginCss}</style></head><body></body></html>`)
    const earlyPage = await browser.newPage()
    await earlyPage.goto(pathToFileUrl(earlyFile))
    const early = await earlyPage.evaluate(() => {
      const probe = document.createElement('span')
      probe.style.cssText = 'position:absolute;visibility:hidden;background-color:var(--ui-terminal-surface-background)'
      document.body.append(probe)
      const v = getComputedStyle(probe).backgroundColor
      probe.remove()
      return v
    })
    await earlyPage.close()
    check('PLUGIN_CSS alone resolves the token (the pre-customCSS boot window)',
      early === at.token, `${early} vs ${at.token}`)

    /* Two copies of one decision must not drift apart. */
    const hex = t => ((t || '').match(/--ui-terminal-surface-background:\s*(#[0-9a-f]{6})/i) || [])[1] || ''
    check('customCSS and PLUGIN_CSS agree on the terminal hex',
      !!hex(sheets.skinCss) && hex(sheets.skinCss).toLowerCase() === hex(sheets.pluginCss).toLowerCase(),
      `customCSS ${hex(sheets.skinCss) || '—'} / PLUGIN_CSS ${hex(sheets.pluginCss) || '—'}`)
  } finally {
    await browser.close()
  }
  console.log(`\n${failures ? 'FAIL' : 'OK'} — ${total - failures}/${total} assertions`)
  process.exit(failures ? 1 : 0)
})().catch(err => { console.error(err); process.exit(1) })
