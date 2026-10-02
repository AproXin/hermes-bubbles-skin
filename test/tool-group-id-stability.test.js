/**
 * test/tool-group-id-stability.test.js
 *
 * A tool group's persisted expanded state is keyed grp_<session>_<message>_<anchor>, and
 * the anchor used to be `anchor_<Math.random()>` whenever the tool block carries no id —
 * which is every tool block, because the renderer puts no call-id on one. So a reload
 * produced a different group id, the stored value could never be found again, and
 * groupCompletedTools' own comment ("including after a reload when the skin pill is
 * expanded") described a case that did not exist.
 *
 * Second target: the storage helpers used to prepend the message-collapse namespace to
 * every key they were handed, so a tool-group key arrived as
 * `…:user-expand:…:tool-group:…` — and only on the localStorage path, because the host
 * pluginStorage path never added it. Both are asserted here.
 *
 * Runs the shipped functions, extracted from src/plugin.js rather than retyped, against a
 * real DOM in a real browser.
 *   node test/tool-group-id-stability.test.js
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { launchChromium, loadSheets, pageHtml, pathToFileUrl } = require('../scripts/lib/sheets')

const REPO = path.join(__dirname, '..')
const SRC = path.join(REPO, 'src', 'plugin.js')

const skip = reason => {
  console.log(`\n=== Tool Group Id Stability Suite: SKIPPED — ${reason} ===\n`)
  process.exit(0)
}
if (!fs.existsSync(SRC)) skip('no src/plugin.js')

const src = fs.readFileSync(SRC, 'utf8')
const grab = (label, re) => {
  const m = src.match(re)
  assert(m, `${label} not found in src/plugin.js — this test no longer runs the shipped code`)
  return m[0]
}

const code = [
  grab('ID', /^const ID = .*$/m),
  grab('USER_EXPAND_NS', /^const USER_EXPAND_NS = .*$/m),
  grab('TOOL_GROUP_NS', /^const TOOL_GROUP_NS = .*$/m),
  grab('isElement', /^function isElement\(node\) \{[\s\S]*?^\}/m),
  grab('cleanToolTitle', /^function cleanToolTitle\(raw\) \{[\s\S]*?^\}/m),
  grab('getToolTitle', /^function getToolTitle\(toolBlock\) \{[\s\S]*?^\}/m),
  grab('getToolAnchorId', /^function getToolAnchorId\(toolBlock\) \{[\s\S]*?^\}/m),
  grab('getToolGroupId', /^function getToolGroupId\(run, parent\) \{[\s\S]*?^\}/m),
  grab('getMessageStorageKey', /^function getMessageStorageKey\(userRoot\) \{[\s\S]*?^\}/m),
].join('\n\n')

// Three completed tools in one assistant message, the shape a finished run leaves behind.
// The group under test starts at the second one, so its anchor must carry index 1.
const TRANSCRIPT = `
  <div data-session-id="sess_1">
    <div data-slot="aui_assistant-message-root" data-message-id="msg_1">
      <div id="run-parent">
        <div data-slot="tool-block"><header><span>bash</span></header></div>
        <div data-slot="tool-block"><header><span>read file</span></header></div>
        <div data-slot="tool-block"><header><span>write file</span></header></div>
      </div>
    </div>
  </div>`

const MEASURE = () => {
  const parent = document.getElementById('run-parent')
  const tools = [...parent.children]
  const run = [tools[1], tools[2]]
  const groupId = getToolGroupId(run, parent)
  return {
    groupId,
    anchor: getToolAnchorId(run[0]),
    stamped: run[0].getAttribute('data-bubbles-tool-anchor-id'),
    groupKey: `${TOOL_GROUP_NS}${groupId}`,
    messageKey: getMessageStorageKey(document.querySelector('[data-slot="aui_assistant-message-root"]')),
    userNs: USER_EXPAND_NS,
    groupNs: TOOL_GROUP_NS,
  }
}

;(async () => {
  const sheets = loadSheets()
  if (sheets.error) skip(sheets.error)
  const browser = await launchChromium()
  if (!browser) skip('no Chromium/Edge/Chrome available')

  /* A file on disk rather than setContent, so page.reload() is a real document reload
     with a fresh DOM — the case the old random anchor failed. */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bubbles-grpid-'))
  const file = path.join(dir, 'index.html')
  fs.writeFileSync(file, pageHtml(sheets, TRANSCRIPT), 'utf8')

  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))

  await page.goto(pathToFileUrl(file))
  await page.addScriptTag({ content: code })
  const first = await page.evaluate(MEASURE)
  assert(errors.length === 0, `the shipped functions threw while being exercised: ${errors.join(' | ')}`)

  // Same transcript, brand new element nodes, without leaving the document.
  await page.evaluate(t => { document.body.innerHTML = t }, `<div id="run-parent-holder">${TRANSCRIPT}</div>`)
  const rebuilt = await page.evaluate(MEASURE)

  await page.goto(pathToFileUrl(file))
  await page.addScriptTag({ content: code })
  const reloaded = await page.evaluate(MEASURE)

  const lines = []
  const check = (label, ok, detail = '') => {
    lines.push(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
    assert(ok, `${label}${detail ? ` — ${detail}` : ''}`)
  }

  console.log('\n=== Tool Group Id Stability Suite ===\n')
  check('the group id survives a node rebuild', first.groupId === rebuilt.groupId,
    `${first.groupId} vs ${rebuilt.groupId}`)
  check('and survives a real document reload', first.groupId === reloaded.groupId,
    `${first.groupId} vs ${reloaded.groupId}`)
  check('the anchor is derived from position + title, not randomness',
    first.anchor === 'anchor_1_read_file', first.anchor)
  check('and is stamped so later passes reuse the same value', first.stamped === first.anchor,
    String(first.stamped))
  check('a message key carries the message namespace',
    first.messageKey === `${first.userNs}msg_1`, first.messageKey)
  check('a group key carries the group namespace',
    first.groupKey === `${first.groupNs}${first.groupId}`, first.groupKey)
  check('neither key is namespaced twice',
    first.groupKey.split('hermes-bubbles-skin:').length === 2
    && first.messageKey.split('hermes-bubbles-skin:').length === 2,
    `${first.groupKey} | ${first.messageKey}`)
  check('and a group key never lands in the message-collapse namespace',
    first.groupKey.indexOf(first.userNs) === -1, first.groupKey)

  console.log(lines.join('\n'))
  await browser.close()
  fs.rmSync(dir, { recursive: true, force: true })
  console.log('\n=== Tool Group Id Stability Suite: PASS ===\n')
})().catch(err => {
  console.error(err)
  process.exit(1)
})
