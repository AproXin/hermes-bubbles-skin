/**
 * test/session-row-scope.test.js
 *
 * Phase A leftover: the session-row probe was document-wide —
 *   document.querySelectorAll('.row-hover, [data-row-actions], [data-slot="sidebar-row"]')
 * '.row-hover' is a shared Tailwind utility, not a sidebar hook. It is also on:
 *   right-sidebar file trees + remote picker, cron rows, messaging rows, settings
 *   credential rows, capabilities catalog, session switcher, overlay panels,
 *   master-detail, pane-shell layout picker, changed-files card, and
 *   components/chat/status-row.tsx — the composer's own Tasks rows.
 * So every one of those got stamped data-bubbles-session-row="true" and picked up
 * sidebar row chrome, and hovering a file row opened the session preview
 * (setupSessionPreview matched the same bare class). '[data-slot="sidebar-row"]'
 * does not exist anywhere in the renderer at all.
 *
 * This executes the REAL source lines, not a copy: a retyped selector would keep
 * passing after someone un-scoped the probe again.
 *   node test/session-row-scope.test.js
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { launchChromium } = require('../scripts/lib/sheets')

const REPO = path.join(__dirname, '..')
const SRC = path.join(REPO, 'src', 'plugin.js')

const skip = reason => {
  console.log(`\n=== Session Row Scope Suite: SKIPPED — ${reason} ===\n`)
  process.exit(0)
}
if (!fs.existsSync(SRC)) skip('no src/plugin.js')

const src = fs.readFileSync(SRC, 'utf8')

// Grab the constants and the picker loop verbatim.
const grab = (label, re) => {
  const m = src.match(re)
  assert(m, `${label} not found in src/plugin.js — the probe is no longer the shape this test reads`)
  return m[0]
}
const consts = [
  grab('SIDEBAR_SELECTOR', /^const SIDEBAR_SELECTOR = .*$/m),
  grab('SESSION_ROW_PROBE', /^const SESSION_ROW_PROBE = .*$/m),
  grab('sessionRowShell', /^const sessionRowShell = el => \{[\s\S]*?^\}/m),
  grab('closestSessionRow', /^const closestSessionRow = .*$/m),
].join('\n')
const picker = grab('the sessionRows picker',
  /const sessionRows = document\.querySelectorAll\(SESSION_ROW_PROBE\)[\s\S]*?\n {2}}/)

// The gate must stay an explicit ancestor check, not a document-wide class probe.
assert(/querySelectorAll\('\.row-hover/.test(src) === false,
  "the sessionRows probe went document-wide again — it must go through SESSION_ROW_PROBE")
assert(/const sessionRowShell = [\s\S]*?closest\?\.\(SIDEBAR_SELECTOR\)/.test(src),
  'sessionRowShell no longer gates on the sidebar ancestor')

const DOM = `
<div data-slot="sidebar">
  <div class="row-hover" id="in-sidebar"><div data-row-actions id="in-sidebar-actions"></div></div>
  <div class="row-hover" id="in-sidebar-2"></div>
  <button id="in-sidebar-caret" class="flex items-center"></button>
</div>
<div id="file-tree" class="row-hover"></div>
<div id="tasks-status-row" class="status-row row-hover"></div>
<div id="stray-actions"><div data-row-actions></div></div>`

// Run the extracted picker verbatim against a stub recorder, so what is asserted
// is the shipped loop — not a paraphrase of it.
const RUN = `(function () {\n${consts}
  const stamped = []
  const enhanceSidebarSessionRow = el => stamped.push(el.id || el.tagName)
  ${picker}
  return { stamped,
    caret: !!sessionRowShell(document.getElementById('in-sidebar-caret')),
    previewFromFileTree: !!closestSessionRow(document.getElementById('file-tree')),
    previewFromStatusRow: !!closestSessionRow(document.getElementById('tasks-status-row')),
    previewFromSidebarChild: !!closestSessionRow(document.getElementById('in-sidebar-actions')) }
})()`

;(async () => {
  const browser = await launchChromium()
  if (!browser) skip('playwright-core found but no Chromium/Edge/Chrome to launch')
  const pg = await browser.newPage()
  await pg.setContent(`<!doctype html><html><body>${DOM}</body></html>`)
  const out = await pg.evaluate(RUN)
  await browser.close()

  console.log('\n=== Session Row Scope Suite ===')
  // #in-sidebar is reached twice (as .row-hover and through its [data-row-actions]
  // child); enhanceSidebarSessionRow guards on the stamped attribute, so a repeat
  // is a no-op in production. Compare sets.
  const unique = [...new Set(out.stamped)].sort()
  console.log(`stamped   : ${JSON.stringify(out.stamped)} → ${JSON.stringify(unique)}`)
  console.log(`caret matches the probe: ${out.caret}`)
  console.log(`preview opens from: file-tree=${out.previewFromFileTree} status-row=${out.previewFromStatusRow} sidebar-child=${out.previewFromSidebarChild}`)

  assert.deepStrictEqual(unique, ['in-sidebar', 'in-sidebar-2'],
    'exactly the sidebar rows may be treated as session rows')
  assert.strictEqual(out.caret, false,
    'the sidebar caret button must not match the probe — it was the empty floating frame in Phase A')
  assert.strictEqual(out.previewFromFileTree, false, 'hovering a file-tree row must not open the session preview')
  assert.strictEqual(out.previewFromStatusRow, false, 'the composer Tasks status rows are not session rows')
  assert.strictEqual(out.previewFromSidebarChild, true, 'a real sidebar row must still answer from its children')

  console.log('\n=== Session Row Scope Suite: PASS ===\n')
})().catch(err => {
  console.error('\n' + (err.message || err))
  process.exit(1)
})
