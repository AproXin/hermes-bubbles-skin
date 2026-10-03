/**
 * test/task-section-detection.test.js
 *
 * Why this exists: every other Tasks suite (task-panel-layers, task-progress-fields)
 * puts data-bubbles-task-section='true' straight into its fixture, so the suite
 * proves "when stamped, one card" and can never notice that the stamp never
 * landed. That blind spot mattered: PLUGIN_CSS paints the card ONLY on the stamped
 * section, so a detection miss leaves the panel as bare text on the chat
 * background — which reads as "the task list did not appear".
 *
 * So this runs the shipped findTaskSection — extracted from src/plugin.js, not
 * retyped — against the DOM shape the renderer actually builds
 * (status-stack/index.tsx:321-357 + status-section.tsx:40 + GROUP_ICON at
 * status-stack/index.tsx:57-62) and asserts what it must and must not return.
 *   node test/task-section-detection.test.js
 */

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { REPO, launchChromium, pageHtml, pathToFileUrl, loadSheets } = require('../scripts/lib/sheets')

const SRC = path.join(REPO, 'src', 'plugin.js')

const skip = reason => {
  console.log(`\n=== Task Section Detection Suite: SKIPPED — ${reason} ===\n`)
  process.exit(0)
}
if (!fs.existsSync(SRC)) skip('no src/plugin.js')
/* loadSheets() reports a missing host artefact as `{ error }`, not as a throw, so
   read it here: taking `.built` off a failed load hands pageHtml a null path and the
   suite crashes into FAIL instead of standing aside like every other browser suite. */
const sheets = loadSheets()
if (sheets.error) skip(sheets.error)

const src = fs.readFileSync(SRC, 'utf8')
const grab = (label, re) => {
  const m = src.match(re)
  assert(m, `${label} not found in src/plugin.js — this test no longer runs the shipped code`)
  return m[0]
}
const code = [
  grab('isElement', /^function isElement\(node\) \{[\s\S]*?^\}/m),
  grab('findTaskSection', /^function findTaskSection\(statusStack\) \{[\s\S]*?^\}/m),
].join('\n')

// The real nesting: the group icon is a <span class="status-section-icon"> inside
// the trigger button, and every section sits inside a bare
// [data-slot='status-stack-section'] wrapper.
const section = (glyph, id) => `
  <div data-slot="status-section" id="${id}">
    <div class="status-section-header">
      <button type="button" class="status-section-trigger">
        <span class="status-section-icon"><i class="codicon codicon-${glyph}"></i></span>
        <span>label</span>
      </button>
    </div>
    <div class="status-section-body"></div>
  </div>`

const CASES = {
  todo: `<div data-slot="composer-status-stack" id="case">
    <div class="rounded-t-2xl"><div data-slot="status-stack-scroll">
      <div data-slot="status-stack-content">
        <div data-slot="status-stack-section">${section('checklist', 'todo-section')}</div>
      </div></div></div></div>`,
  // A concurrent run can show only subagents / background processes / a goal. None
  // of those is the plan, so findTaskSection must decline rather than adopt one.
  noTodo: `<div data-slot="composer-status-stack" id="case">
    <div class="rounded-t-2xl"><div data-slot="status-stack-scroll">
      <div data-slot="status-stack-content">
        <div data-slot="status-stack-section">${section('target', 'goal-section')}</div>
        <div data-slot="status-stack-section">${section('agent', 'subagent-section')}</div>
        <div data-slot="status-stack-section">${section('server-process', 'bg-section')}</div>
      </div></div></div></div>`,
  // The content wrapper is looked up first but the function falls back to the
  // stack itself, so a re-named wrapper must not blind it.
  noContentWrapper: `<div data-slot="composer-status-stack" id="case">
    <div class="rounded-t-2xl">${section('checklist', 'todo-section')}</div></div>`,
  empty: '<div data-slot="composer-status-stack" id="case"></div>',
}

const RUN = `(function(){ ${code}
  return findTaskSection(document.getElementById('case'))?.id ?? null })()`

;(async () => {
  const browser = await launchChromium()
  if (!browser) skip('playwright-core found but no Chromium/Edge/Chrome to launch')
  // Only the built sheet is stacked: this measures findTaskSection's JS against the
  // host's own nesting, so the skin's two layers must not be in the page.
  const stacked = { built: sheets.built, skinCss: '', pluginCss: '' }
  const results = {}
  for (const [name, body] of Object.entries(CASES)) {
    const page = await browser.newPage()
    await page.setContent(pageHtml(stacked, body))
    results[name] = await page.evaluate(RUN)
    await page.close()
  }
  await browser.close()

  console.log('\n=== Task Section Detection Suite ===')
  for (const [name, found] of Object.entries(results)) console.log(`  ${name.padEnd(18)} -> ${found}`)

  assert.strictEqual(results.todo, 'todo-section', 'the todo section must be adopted by id')
  assert.strictEqual(results.noTodo, null,
    'goal/subagent/background sections are not the plan; adopting one would paint the Tasks card on the wrong box')
  assert.strictEqual(results.noContentWrapper, 'todo-section',
    'the fallback to the stack element must still find the section')
  assert.strictEqual(results.empty, null, 'an empty stack must return null')

  console.log('\n=== Task Section Detection Suite: PASS ===\n')
})().catch(err => {
  console.error('\n' + (err.message || err))
  process.exit(1)
})
