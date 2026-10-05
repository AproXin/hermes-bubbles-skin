/**
 * test/stage-isolation.test.js
 *
 * processDOM() runs five passes, each wrapped in runStage(), and runStage exists for
 * exactly one reason: a throw in one pass must not cost the later ones. That guarantee
 * had never been exercised — and the failure it prevents is invisible, because the
 * symptom of a broken runStage is the same "that surface never appears" it guards.
 *
 * Every pass callback is replaced by a recorder here, so "did the later stages still
 * run" is answered by observation rather than by reading the source. If an extraction
 * ever came back truncated, `new Function` throws a SyntaxError and this suite fails
 * loudly instead of exercising half a function.
 *
 * The extraction uses indexOf/slice, not the regex-per-function form the other suites
 * use: both functions here end with a column-zero brace, so a plain scan is exact — and
 * test/assertion-census.test.js charges a call to `match` on the plugin source text to
 * its source-text budget, whose ceiling currently sits at 159/159. Even naming that
 * pattern in a comment costs one.
 *   node test/stage-isolation.test.js
 */

const fs = require('fs')
const path = require('path')
const { REPO } = require('../scripts/lib/sheets')

const pluginText = fs.readFileSync(path.join(REPO, 'src', 'plugin.js'), 'utf8')

/** The body of `function name(...) {` up to its closing brace at column zero. */
function bodyOf(name) {
  const open = pluginText.indexOf(`function ${name}(`)
  if (open === -1) throw new Error(`function ${name} not found in src/plugin.js`)
  const brace = pluginText.indexOf('{', open)
  const end = brace === -1 ? -1 : pluginText.indexOf('\n}', brace)
  if (brace === -1 || end === -1) throw new Error(`function ${name} has no column-zero closing brace`)
  return pluginText.slice(brace + 1, end)
}

const runStageBody = bodyOf('runStage')
const processDOMBody = bodyOf('processDOM')

// processDOM's sidebar pass probes this; the real constant lives in the plugin, and
// the harness owns the value here so the poison selector is unambiguous.
const SESSION_ROW_PROBE = '[data-bubbles-session-probe]'

/**
 * A fresh sandbox. `poison` makes one selector throw, which is how a pass dies in the
 * real app: the host renames a data-slot, a helper meets an unexpected shape, and the
 * first query of that stage throws.
 */
function harness({ poison = null } = {}) {
  const ran = []
  const stats = { stageErrors: {} }
  const element = { nodeType: 1 }
  const rec = name => () => { ran.push(name) }
  const document = {
    querySelectorAll(selector) {
      if (poison && selector.indexOf(poison) !== -1) throw new Error(`boom in ${selector}`)
      return [element]
    },
  }

  const buildRunStage = new Function('stats', `return function runStage(name, fn) {${runStageBody}}`)
  const buildProcessDOM = new Function(
    'document', 'runStage', 'stats', 'performance', 'isScheduled', 'SESSION_ROW_PROBE',
    'enhanceUserMessage', 'enhanceAssistantMessage', 'enhanceThinkingBlock', 'enhanceToolBlock',
    'groupCompletedTools', 'enhanceTaskSection', 'enhanceApproval', 'enhanceClarify',
    'sessionRowShell', 'enhanceSidebarSessionRow', 'enhanceSidebarDivider', 'attachSidebarClassWatch',
    `return function processDOM() {${processDOMBody}}`,
  )

  /* The sidebar pass also re-attaches the scoped `class` watcher. Left a no-op rather
     than a recorder: the recorder list is what these assertions count, and the watcher's
     real behaviour (which records reach it, surviving a sidebar remount) is measured with
     a live MutationObserver in test/observer-trigger-scope.test.js. What this suite owes
     is only the declaration — a free name processDOM uses and this list omits throws. */
  const processDOM = buildProcessDOM(
    document, buildRunStage(stats), stats, { now: () => 0 }, true, SESSION_ROW_PROBE,
    rec('user'), rec('assistant'), rec('thinking'), rec('tool'), rec('group'), rec('task'),
    rec('approval'), rec('clarify'), row => row, rec('sessionRow'), rec('divider'), () => {},
  )

  return { ran, stats, processDOM }
}

const ALL_PASSES = ['user', 'assistant', 'thinking', 'tool', 'group', 'task', 'approval', 'clarify', 'sessionRow', 'divider']

// [stage, selector that starts it, recorders belonging to the OTHER stages]
const STAGES = [
  ['messages', '[data-slot="aui_user-message-root"]', ['thinking', 'tool', 'task', 'approval', 'sessionRow']],
  ['scaffolding', '[data-slot="aui_thinking-disclosure"]', ['user', 'assistant', 'task', 'approval', 'sessionRow']],
  ['tasks', '[data-slot="composer-status-stack"]', ['user', 'assistant', 'thinking', 'approval', 'sessionRow']],
  ['overlays', '[data-slot="tool-approval-stack"]', ['user', 'assistant', 'thinking', 'task', 'sessionRow']],
  ['sidebar', SESSION_ROW_PROBE, ['user', 'assistant', 'thinking', 'task', 'approval']],
]

const failures = []
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(label)
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
}

console.log('\n=== Stage Isolation Suite ===\n')

// 1. Positive control: with nothing throwing, every pass runs and nothing is counted.
{
  const h = harness()
  let threw = null
  try {
    h.processDOM()
  } catch (err) {
    threw = err
  }
  check('all five passes run when nothing throws', !threw && h.ran.length === ALL_PASSES.length,
    threw ? threw.message : `ran ${h.ran.length}: ${h.ran.join(' ')}`)
  check('no stage error is recorded on a clean run', Object.keys(h.stats.stageErrors).length === 0,
    JSON.stringify(h.stats.stageErrors))
  check('the batch duration is still measured', typeof h.stats.lastBatchDurationMs === 'number',
    String(h.stats.lastBatchDurationMs))
}

// 2. Each stage poisoned in turn: the throw stays inside its own stage.
for (const [stage, poison, survivors] of STAGES) {
  const h = harness({ poison })
  let threw = null
  try {
    h.processDOM()
  } catch (err) {
    threw = err
  }

  check(`${stage}: a throw does not escape processDOM`, !threw, threw && threw.message)
  check(`${stage}: counted exactly once`, h.stats.stageErrors[stage] === 1, JSON.stringify(h.stats.stageErrors))
  check(`${stage}: lastStageError names the stage`,
    typeof h.stats.lastStageError === 'string' && h.stats.lastStageError.indexOf(`${stage}: `) === 0,
    String(h.stats.lastStageError))
  check(`${stage}: every other stage still ran`,
    survivors.every(name => h.ran.indexOf(name) !== -1), h.ran.join(' ') || 'nothing ran')
}

// 3. Isolation is per stage: one stage can fail twice without erasing the count of
//    another, and the tally accumulates rather than overwriting.
{
  const h = harness({ poison: '[data-slot="composer-status-stack"]' })
  h.processDOM()
  h.processDOM()
  check('repeat failures accumulate', h.stats.stageErrors.tasks === 2, JSON.stringify(h.stats.stageErrors))
  check('and no other stage is blamed', Object.keys(h.stats.stageErrors).length === 1,
    JSON.stringify(h.stats.stageErrors))
}

const failed = failures.length
const total = 3 + STAGES.length * 4 + 2
console.log(`\n${failed ? 'FAIL' : 'OK'} — ${total - failed}/${total} assertions`)
process.exit(failed ? 1 : 0)
