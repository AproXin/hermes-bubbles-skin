/**
 * scripts/lib/sheets.js
 *
 * The skin's look is decided by three stylesheets stacked in a fixed order:
 *   1. the built Tailwind sheet      apps/desktop/dist/assets/index-*.css
 *   2. the active skin's customCSS   ~/.hermes/skins/<skin>.yaml
 *   3. PLUGIN_CSS                    src/plugin.js, installed as textContent
 *
 * Anything that renders a preview offline has to load the same three, in the same
 * order, or it is judging a stylesheet the app never shows. The test suite already
 * grows a private copy of these readers per file; new tooling uses this one.
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

const HOME = os.homedir()
const HERMES_HOME = process.env.HERMES_HOME || path.join(HOME, '.hermes')
const REPO = path.join(__dirname, '..', '..')
const DESKTOP = path.join(HERMES_HOME, 'hermes-agent', 'apps', 'desktop')

/** Newest built renderer sheet, or null when there is no Hermes checkout. */
function builtCssPath() {
  const dirs = [
    path.join(DESKTOP, 'dist', 'assets'),
    path.join(DESKTOP, 'release', 'mac-arm64', 'Hermes.app', 'Contents',
      'Resources', 'app.asar.unpacked', 'dist', 'assets'),
  ]
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    const sheets = fs.readdirSync(dir)
      .filter(f => /^index-.*\.css$/.test(f))
      .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    if (sheets.length) return path.join(dir, sheets[0].f)
  }
  return null
}

/** Value of a YAML block scalar (`key: |`), de-indented by two. */
function blockScalar(text, key) {
  const lines = text.split('\n')
  const start = lines.findIndex(l => l.startsWith(`${key}: |`))
  if (start === -1) return null
  const out = []
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\S/.test(lines[i]) && lines[i].trim() !== '') break
    out.push(lines[i].replace(/^ {2}/, ''))
  }
  return out.join('\n')
}

/** The skin name config.yaml selects, or null when nothing selects one. sync.js needs
 *  that distinction: warning "config activates a different skin" is only true when a
 *  config actually exists. */
function activeSkinNameOrNull() {
  const configFile = path.join(HERMES_HOME, 'config.yaml')
  if (!fs.existsSync(configFile)) return null
  return (fs.readFileSync(configFile, 'utf8').match(/^\s*skin:\s*['"]?([\w-]+)/m) || [])[1] || null
}

/** The skin name Hermes selected, via `skin:` in config.yaml. */
function activeSkinName() {
  return activeSkinNameOrNull() ?? 'bubbles'
}

/** The skin Hermes actually loads (config.yaml `skin:`), falling back to the repo copy.
 *  This is the only resolver. test/skin-source.js and test/skin-css-budget.test.js each
 *  carried their own copy of these lines, so "how is the active skin found" had to be
 *  remembered in three places — and reading the wrong file is precisely the failure this
 *  resolver exists to prevent: source assertions would pass against a file that is not
 *  the one producing pixels. */
function skinYamlPath() {
  const live = path.join(HERMES_HOME, 'skins', `${activeSkinName()}.yaml`)
  return fs.existsSync(live) ? live : path.join(REPO, 'bubbles.yaml')
}

/**
 * The PLUGIN_CSS template literal **as the runtime receives it**.
 *
 * Two things happen between this file and the renderer: `${}` interpolations are
 * evaluated (left verbatim here — they only appear in values, never in selectors, so a
 * rule stays parseable), and JS escape sequences are RESOLVED.
 *
 * The second is the trap this function exists for. A CSS class escape needs a
 * backslash (`.group\/row` for class `group/row`), but inside a template literal `\/`
 * is itself an escape sequence that evaluates to `/`. The browser then receives the
 * invalid selector `.group/row`, and because one invalid selector voids a whole comma
 * list, the entire rule is dropped — silently, with no console error. Reading the raw
 * source text hid that completely: fixtures passed on a stylesheet the app never
 * installed. So fixtures get this text, and the guard lives in
 * test/css-escapes-survive.test.js. Write `\\/` in PLUGIN_CSS when a CSS escape is
 * meant.
 *
 * Extraction itself searches for newline + backtick as the terminator, so it cannot see
 * a MID-LINE stray backtick cutting the string short (that has happened twice);
 * test/plugin-source-parses.test.js owns that case against the raw source.
 */
function pluginCss(source = null) {
  const raw = pluginCssSource(source)
  return raw === null ? null : resolveJsEscapes(raw)
}

/** The literal's characters exactly as written in src/plugin.js. */
function pluginCssSource(source = null) {
  const src = source ?? fs.readFileSync(path.join(REPO, 'src', 'plugin.js'), 'utf8')
  const at = src.indexOf('const PLUGIN_CSS = `')
  if (at === -1) return null
  const body = src.indexOf('`', at) + 1
  const end = src.indexOf('\n`', body)
  return end === -1 ? null : src.slice(body, end)
}

/** Resolve the escape sequences a JS template literal processes. */
function resolveJsEscapes(text) {
  const named = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v' }
  return text.replace(
    /\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})|\\(.)/g,
    (all, uBrace, u4, hex2, ch) => {
      if (uBrace !== undefined) return String.fromCodePoint(parseInt(uBrace, 16))
      if (u4 !== undefined) return String.fromCharCode(parseInt(u4, 16))
      if (hex2 !== undefined) return String.fromCharCode(parseInt(hex2, 16))
      if (ch === '\n') return ''
      return named[ch] !== undefined ? named[ch] : ch
    })
}

/** The cap the gateway slices customCSS at, read from the engine that applies it.
 *  It is not a number we own: if skin_engine.py changes its slice, this follows. */
function customCssCap() {
  const engine = path.join(HERMES_HOME, 'hermes-agent', 'hermes_cli', 'skin_engine.py')
  if (!fs.existsSync(engine)) return null
  const line = fs.readFileSync(engine, 'utf8').split('\n')
    .find(l => /custom_css/.test(l) && /\[\s*:\s*\d+\s*\]/.test(l))
  const n = Number(((line || '').match(/\[\s*:\s*(\d+)\s*\]/) || [])[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Everything a preview page needs, or a reason why there is not one. */
function loadSheets() {
  const built = builtCssPath()
  if (!built) return { error: `no built renderer CSS under ${DESKTOP}/dist` }
  const skinCss = blockScalar(fs.readFileSync(skinYamlPath(), 'utf8'), 'customCSS')
  if (!skinCss) return { error: `no customCSS block scalar in ${skinYamlPath()}` }
  const css = pluginCss()
  if (!css) return { error: 'PLUGIN_CSS could not be extracted from src/plugin.js' }
  return { built, skinPath: skinYamlPath(), skinCss, pluginCss: css }
}

/** playwright-core from the Hermes checkout, launched with the only browser present. */
async function launchChromium() {
  let chromium = null
  for (const id of ['playwright-core', path.join(HERMES_HOME, 'hermes-agent', 'node_modules', 'playwright-core')]) {
    try { chromium = require(id).chromium; break } catch { /* next */ }
  }
  if (!chromium) return null
  for (const opts of [{ channel: 'msedge' }, { channel: 'chrome' }, {}]) {
    try { return await chromium.launch({ headless: true, ...opts }) } catch { /* next */ }
  }
  return null
}

/** A full HTML document stacking the three sheets in live order.
 *
 *  `htmlClass` defaults to empty, i.e. exactly what every existing caller renders.
 *  Pass 'dark' for a surface that leans on the app's own --ui-bg-* tokens: the live
 *  app puts `.dark` on <html> (themes/context.tsx, see hooks/use-theme-epoch.ts:3),
 *  and without it a kanban card resolves to the LIGHT --ui-bg-elevated, which makes
 *  the preview show a white card on a blue page and invites a wrong judgement. */
function pageHtml(sheets, body, { zoom = 1, htmlClass = '' } = {}) {
  return `<!doctype html><html${htmlClass ? ` class="${htmlClass}"` : ''} data-bubbles-skin='true' data-hermes-mode='dark'><head><meta charset="utf-8">
<style>html{zoom:${zoom}}</style>
<link rel="stylesheet" href="${pathToFileUrl(sheets.built)}">
<style id="hermes-desktop-custom-css">${sheets.skinCss}</style>
<style id="hermes-bubbles-skin-runtime-styles">${sheets.pluginCss}</style>
<style>body{margin:0;background:#08192f}</style>
</head><body>${body}</body></html>`
}

function pathToFileUrl(p) {
  return require('url').pathToFileURL(p).href
}

/**
 * src/plugin.js rewritten as a classic script, so a browser page can call its
 * internal functions directly.
 *
 * Why not scrape one function out with a brace counter: the plugin's detection
 * rules are DOM semantics (`button:first-child`, `closest`, nested subtrees), and
 * a hand-rolled mock gets those wrong — a mock that does not implement
 * `:first-child` cannot catch a bug caused by `:first-child`. Loading the real
 * file into a real DOM tests the shipped code. The only edit is the module
 * export, which a classic script cannot contain; every top-level `function`
 * declaration becomes a window binding as-is.
 */
function pluginScriptForPage(source = null) {
  const src = source ?? fs.readFileSync(path.join(REPO, 'src', 'plugin.js'), 'utf8')
  const marker = 'export default {'
  const i = src.indexOf(marker)
  if (i === -1) throw new Error('pluginScriptForPage: no `export default {` in the plugin source')
  return src.slice(0, i) + 'globalThis.__bubblesPlugin = {' + src.slice(i + marker.length)
}

module.exports = {
  HOME, HERMES_HOME, REPO, DESKTOP,
  builtCssPath, blockScalar, skinYamlPath, activeSkinName, activeSkinNameOrNull, pluginCss, pluginCssSource, resolveJsEscapes,
  loadSheets, customCssCap,
  launchChromium, pageHtml, pathToFileUrl, pluginScriptForPage,
}
