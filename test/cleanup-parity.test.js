/**
 * test/cleanup-parity.test.js
 *
 * The plugin's own header promises a "zero-leak re-enable guarantee": every
 * side effect is released in onDispose. A source scan of setAttribute vs
 * removeAttribute found 13 attributes written and never removed, and one of them
 * lands on a HOST element — updateTaskHeaderCounter writes an inline
 * `--bubbles-task-progress` onto Hermes' own .status-section-trigger and nothing
 * takes it back, so a disabled plugin still edits the host's style attribute.
 *
 * This checks the live DOM rather than the source text: drive the real
 * processDOM over a fixture that mirrors the renderer, snapshot what the plugin
 * touched, run cleanupAll(), and require the document to come back clean.
 *   node test/cleanup-parity.test.js
 */

const { launchChromium, pluginScriptForPage } = require('../scripts/lib/sheets')

const ROW = state => `<div class="status-row" data-slot="status-row" data-task-state="${state}">
  <span class="status-row-icon"><i class="codicon ${TASK_GLYPH[state]}"></i></span>
  <div class="status-row-content"><div><p>步骤 ${state}</p></div></div></div>`
// The states have to be claimed the way the host claims them. detectTaskState
// reads the glyph, not data-task-state — which is OUR attribute — so a fixture
// that only sets the latter proves nothing about the counting path.
const TASK_GLYPH = {
  completed: 'codicon-pass-filled text-emerald-500/80',
  running: 'codicon-loading animate-spin',
  pending: 'codicon-circle-large-outline',
}

// status-stack/index.tsx + status-section.tsx, per scripts/render-preview.js.
const BODY = `<div data-slot="sidebar">
  <div class="row-hover"><button class="row-button" type="button"><span class="hover-marquee-inner">会话一</span></button></div>
</div>
<div data-slot="aui_user-message-root" data-message-id="m1">
  <div class="composer-human-message-container"><div class="composer-human-message">一条提问</div></div>
</div>
<div data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content">
  <div data-slot="aui_thinking-disclosure"><button type="button" aria-expanded="false" class="group/disclosure-row">
    <span class="grid size-3.5 shrink-0 place-items-center self-center"></span><span>已思考</span></button></div>
  <div data-slot="tool-block" data-tool-row="" data-conversation-scaffold="" class="group/tool-block">
    <div class="border-b px-2 py-1.5"><button type="button" aria-expanded="false" class="group/disclosure-row flex items-center gap-1.5">
      <span class="grid size-3.5 shrink-0 place-items-center self-center"><svg class="size-3.5 shrink-0 text-emerald-600/85"></svg></span>
      <span>已读取 a.ts</span></button></div></div>
</div></div>
<div data-slot="composer-status-stack">
  <div data-slot="status-stack-scroll"><div data-slot="status-stack-content">
    <div data-slot="status-section">
      <div class="status-section-header"><button type="button" class="status-section-trigger">
        <i class="codicon codicon-checklist"></i><span>任务</span></button></div>
      <div class="status-section-body">${ROW('completed')}${ROW('completed')}${ROW('running')}</div>
    </div>
  </div></div>
</div>`

const SNAPSHOT = `function snapshot() {
  const owned = []
  for (const el of document.querySelectorAll('*')) {
    for (const name of el.getAttributeNames()) {
      if (name.startsWith('data-bubbles-')) owned.push({ tag: el.tagName, name, value: el.getAttribute(name) })
    }
    const style = el.getAttribute('style') || ''
    if (style.includes('--bubbles-')) owned.push({ tag: el.tagName, name: 'style:--bubbles-*', value: style })
  }
  return {
    owned,
    preview: !!document.getElementById('bubbles-session-preview'),
    groups: document.querySelectorAll('.bubbles-tool-group').length,
  }
}`

;(async () => {
  const browser = await launchChromium()
  if (!browser) { console.log('SKIPPED — no Chromium available'); process.exit(0) }
  let failures = 0
  try {
    const page = await browser.newPage()
    await page.setContent(`<!doctype html><html><body>${BODY}</body></html>`)
    await page.addScriptTag({ content: pluginScriptForPage() })
    await page.addScriptTag({ content: SNAPSHOT })

    const out = await page.evaluate(() => {
      /* installStyles is the only writer of the root stamp, the runtime sheet and the
         build attribute, so it has to run for real here. The build value normally comes
         from globalThis.__bubblesBuild, which sync.js appends to the GENERATED plugin.js
         and which pluginScriptForPage deliberately does not have — so without this the
         "nothing survives" checks below would pass on an attribute nothing ever set. */
      globalThis.__bubblesBuild = 'parity-probe'
      installStyles()
      const installed = {
        styleTag: !!document.getElementById('hermes-bubbles-skin-runtime-styles'),
        root: document.documentElement.hasAttribute('data-bubbles-skin'),
        build: document.documentElement.getAttribute('data-bubbles-build'),
        handles: [typeof globalThis.cleanToolTitle, typeof globalThis.__hermesBubblesSkinStats],
      }
      processDOM()
      const after = snapshot()
      // The active-row preview is built by a hover, not by processDOM. Attach the
      // listeners first: cleanupSessionPreview bails out when none were ever added,
      // so calling showPreview cold would test a path production cannot reach.
      setupSessionPreview()
      showPreview(document.querySelector('.row-hover'))
      const withPreview = snapshot()
      cleanupAll()
      return {
        installed, after, withPreview, cleaned: snapshot(),
        styleTag: !!document.getElementById('hermes-bubbles-skin-runtime-styles'),
        rootAttr: document.documentElement.hasAttribute('data-bubbles-skin'),
        buildAttr: document.documentElement.getAttribute('data-bubbles-build'),
        handles: [typeof globalThis.cleanToolTitle, typeof globalThis.__hermesBubblesSkinStats],
        expandBtns: document.querySelectorAll('.bubbles-user-expand-btn').length,
      }
    })

    console.log('\n=== Cleanup Parity Suite ===\n')
    const check = (name, ok, detail) => {
      if (!ok) failures += 1
      console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
    }

    // The fixture has to actually exercise the code, or a clean result means nothing.
    check('the run stamped host elements', out.after.owned.length > 0,
      `${out.after.owned.length} plugin attributes/props`)
    check('the task progress reached the host trigger as an inline variable',
      out.after.owned.some(o => o.name === 'style:--bubbles-*'),
      JSON.stringify(out.after.owned.filter(o => o.name === 'style:--bubbles-*').map(o => o.value)))
    check('a hover preview was built', out.withPreview.preview && !out.after.preview)

    check('no data-bubbles-* or --bubbles-* survives cleanupAll', out.cleaned.owned.length === 0,
      out.cleaned.owned.map(o => `${o.tag}[${o.name}=${o.value}]`).slice(0, 6).join(' '))
    check('the preview container is gone', !out.cleaned.preview)
    check('no tool-group pill survives', out.cleaned.groups === 0)

    /* Three root-level effects of installStyles were being measured and then dropped on
       the floor: the suite computed styleTag and rootAttr without ever asserting them.
       The build attribute is the one that bites — register() runs cleanupAll BEFORE
       installStyles, so an instance that left through cleanupAll alone kept naming the
       previous deploy, and that attribute exists solely to answer "which build is this
       window painting". */
    check('installStyles stamped the root, the sheet and the build',
      out.installed.styleTag && out.installed.root && out.installed.build === 'parity-probe',
      JSON.stringify(out.installed))
    check('the runtime style tag is gone after cleanupAll', !out.styleTag)
    check('the root stamp is gone', !out.rootAttr)
    check('and so is the build stamp — a stale one names the previous deploy',
      out.buildAttr === null, String(out.buildAttr))
    check('the debug handles are live while the plugin is',
      out.installed.handles.join(',') === 'function,object', out.installed.handles.join(','))
    /* D11. __hermesBubblesSkinStats is only ever a globalThis assignment, so cleanupAll's
       delete is observable here. cleanToolTitle is NOT asserted: pluginScriptForPage loads
       the plugin as a classic script, and a top-level function declaration in a classic
       script creates a non-configurable global binding that `delete` cannot remove —
       whereas the shipped file is an ES module, where the declaration is module-scoped and
       the explicit globalThis assignment IS deletable. Dropping the check the harness
       cannot represent, not the code that makes it so. */
    check('the stats handle is gone after cleanupAll',
      out.handles[1] === 'undefined', out.handles.join(','))
  } finally {
    await browser.close()
  }
  console.log(`\n${failures ? 'FAIL' : 'OK'} — ${13 - failures}/13 assertions`)
  process.exit(failures ? 1 : 0)
})().catch(err => { console.error(err); process.exit(1) })
