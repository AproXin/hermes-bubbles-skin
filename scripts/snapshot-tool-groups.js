#!/usr/bin/env node
/**
 * scripts/snapshot-tool-groups.js
 *
 * `processParentTools` 拆分的回归网。拆分前它是 244 行、圈复杂度 58 的巨石函数，而它写的两条
 * 属性在整套测试里一条断言都没有（交底卡 §2）：
 *   - `data-bubbles-group-id`  折叠处理器靠 `[data-bubbles-group-id="…"]` 找回同组的其他工具；
 *   - `data-bubbles-tool-group` observer 靠它把自己造的 header 排除掉。
 * 抽函数时漏写或写错任何一条，现有套件照样全绿——前者表现为「折叠只动了点那一条」，
 * 后者表现为「observer 反复处理自己的产物」。这份快照把每张 header 与每条 tool 的
 * 属性名和值逐字段列出来，缺哪个、变哪个都能对上。
 *
 * 跑的是 `src/plugin.js` 里真正出货的函数，配仓库共用的假 DOM（test/lib/mock-dom.js），
 * 不需要浏览器也不需要 Hermes。
 *
 *   node scripts/snapshot-tool-groups.js                       # 打印
 *   node scripts/snapshot-tool-groups.js > 基线.json             # 存基线
 *   node scripts/snapshot-tool-groups.js --compare 基线.json     # 逐字段对齐，不同则退出码 1
 */

const fs = require('fs')
const path = require('path')

const { extractFunctionText, isElement, safeGetStorage, safeSetStorage, safeRemoveStorage, publishToolGroupHelpers } =
  require('../test/lib/plugin-sandbox')
const { MockElement } = require('../test/lib/mock-dom')

/* Evaluated in this file's scope, so every free name the shipped body reaches for is
   answered by the bindings right below — the same trick test/phase5a-1-audit.test.js
   uses, and the reason this can run the real function instead of a paraphrase. */
const extractFunction = name => eval(`(${extractFunctionText(name)})`)

/* The helpers processParentTools delegates to live on globalThis, so this scope sees them
   the same way the app's module scope does. */
publishToolGroupHelpers()

const ID = 'hermes-bubbles-skin'
const TOOL_GROUP_NS = `${ID}:tool-group:`
const stats = { toolRefreshes: 0, toolGroupRefreshes: 0 }

const detectToolState = extractFunction('detectToolState')
const getToolAnchorId = extractFunction('getToolAnchorId')
const getToolTitle = extractFunction('getToolTitle')
const getToolGroupId = extractFunction('getToolGroupId')
const processParentTools = extractFunction('processParentTools')

const document = {
  createElement: tag => new MockElement(tag),
  activeElement: null,
}

function makeTool(callId, title) {
  /* `data-slot='tool-block'` gets a disclosure button from the shared fake DOM, which is
     what makes a tool groupable (the shipped code refuses to wrap a tool that has no
     `button[aria-expanded]`, i.e. a summary-only row under "Hide code diffs"). */
  const tool = new MockElement('div', 'tool-block', {
    'data-slot': 'tool-block',
    'data-tool-call-id': callId,
  })
  const row = new MockElement('div', 'group/disclosure-row')
  const label = new MockElement('span', 'truncate')
  label.textContent = title
  row.appendChild(label)
  tool.appendChild(row)
  return tool
}

function buildFixture() {
  const asstRoot = new MockElement('div', '', {
    'data-slot': 'aui_assistant-message-root',
    'data-message-id': 'msg-snapshot',
  })
  const parent = new MockElement('div', 'tool-stack')
  asstRoot.appendChild(parent)

  const three = [makeTool('a', 'npm run build'), makeTool('b', 'git status'), makeTool('c', 'node scripts/run-tests.js')]
  const running = makeTool('running-one', 'npm run dev')
  running.appendChild(new MockElement('span', 'animate-spin'))

  /* Summary-only: a tool row with no disclosure button at all, so it must stay a
     boundary and keep its three group attributes absent. */
  const summary = new MockElement('div', 'tool-block', {
    'data-slot': 'tool-row',
    'data-tool-call-id': 'summary-only',
  })
  summary.appendChild(new MockElement('span', 'truncate'))

  for (const tool of [...three, running, summary]) parent.appendChild(tool)
  return { parent, tools: [...three, running, summary] }
}

function attributeMap(node) {
  const out = {}
  for (const key of Object.keys(node.attributes || {})) out[key] = node.attributes[key]
  return out
}

function describeChild(node) {
  const attrs = attributeMap(node)
  const parts = Object.keys(attrs).sort().map(key => `${key}=${attrs[key]}`)
  return `${node.tagName.toLowerCase()}.${node.className}${parts.length ? `[${parts.join(' ')}]` : ''}`
}

function snapshot() {
  const { parent, tools } = buildFixture()
  processParentTools(parent, tools)
  // A second pass is what proves the factory did not become a leak: the header count and
  // the refresh counter must not move, which is phase5a-1-audit's idempotence criterion.
  processParentTools(parent, tools)

  const headers = parent.children
    .filter(node => node.classList?.contains('bubbles-tool-group'))
    .map(node => ({
      attrs: attributeMap(node),
      children: node.children.map(describeChild),
      deep: node.children.map(child => ({
        self: describeChild(child),
        children: child.children.map(describeChild),
      })),
    }))

  const toolRows = tools.map(node => ({
    callId: node.getAttribute('data-tool-call-id'),
    attrs: attributeMap(node),
    duplicateHeaders: node.children
      .filter(child => child.hasAttribute('data-bubbles-duplicate-header'))
      .map(describeChild),
  }))

  const groupHeaderCountAfterTwoPasses = parent.children
    .filter(node => node.classList?.contains('bubbles-tool-group')).length

  /* A pass with no tools at all turns every header this parent holds into an orphan. It
     is the only thing in here that exercises removeOrphanGroupHeaders — without it a
     sweep that quietly stopped running would still produce the surface above, and the
     symptom in the app is a stale pill left over from a collapsed run. */
  processParentTools(parent, [])
  const orphanGroupHeaders = parent.children
    .filter(node => node.classList?.contains('bubbles-tool-group')).length

  return {
    headers,
    toolRows,
    stats: {
      toolGroupRefreshes: stats.toolGroupRefreshes,
      toolRefreshes: stats.toolRefreshes,
    },
    groupHeaderCountAfterTwoPasses,
    orphanGroupHeaders,
  }
}

const output = JSON.stringify(snapshot(), null, 2)
const compareIndex = process.argv.indexOf('--compare')

if (compareIndex === -1) {
  console.log(output)
  process.exit(0)
}

const baselinePath = process.argv[compareIndex + 1]
if (!baselinePath || !fs.existsSync(baselinePath)) {
  console.error(`snapshot-tool-groups: no baseline at ${baselinePath ?? '(--compare needs a path)'}`)
  process.exit(2)
}
const baseline = fs.readFileSync(baselinePath, 'utf8')
if (baseline.trim() === output.trim()) {
  console.log('OK — snapshot matches the baseline, field for field')
  process.exit(0)
}

const before = JSON.parse(baseline)
const after = JSON.parse(output)
const differences = []
const walk = (a, b, trail) => {
  if (a === b) return
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) differences.push(`${trail}: length ${a.length} -> ${b.length}`)
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) walk(a[i], b[i], `${trail}[${i}]`)
    return
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      walk(a[key], b[key], `${trail}.${key}`)
    }
    return
  }
  if (a !== b) differences.push(`${trail}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`)
}
walk(before, after, '')

console.error(`FAIL — ${differences.length} field(s) differ from ${path.relative(process.cwd(), baselinePath)}`)
for (const line of differences.slice(0, 40)) console.error(`  ${line}`)
process.exit(1)
