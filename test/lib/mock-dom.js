/**
 * test/lib/mock-dom.js
 *
 * Thirteen behaviour suites run the plugin's DOM functions without a browser. The
 * plugin decides by `closest`, `:first-child`, `textContent` and attribute
 * presence, so each suite had to answer those questions — and each grew its own
 * answer: 2,192 lines across 13 files, 12 incompatible versions of `constructor`
 * and 7 of `matches`. A fix to one fake DOM left twelve behind, and the same
 * plugin call could be answered differently by two suites.
 *
 * This is the union of what those copies could do. Where they merely disagreed on
 * style, the more faithful behaviour won: appending removes the node from its old
 * parent, handlers run with `this` set to the element, and `appendChild(null)` is
 * ignored. `data-slot='tool-block'` rows get a disclosure button because the live
 * ToolBlock renders one whenever its content expands and the plugin's isExpandable
 * check keys on `[aria-expanded]`.
 *
 * What it is NOT: a CSS engine. `matches` understands only the selector shapes the
 * plugin and these suites actually emit — comma lists, `tag`, `#id`, `.a.b`,
 * `tag.class`, `[attr]`, `[attr=value]`, `:scope > x` — and answers false for
 * anything else (substring attribute matches, descendant combinators). That is a
 * real limit, not a bug: paint is measured in the browser fixtures, which stack the
 * same three sheets the app installs (see scripts/lib/sheets.js).
 */

class MockClassList {
  constructor(el) {
    this.el = el
  }
  contains(cls) {
    return this.el.className.split(/\s+/).includes(cls)
  }
  add(cls) {
    const classes = new Set(this.el.className.split(/\s+/).filter(Boolean))
    classes.add(cls)
    this.el.className = [...classes].join(' ')
  }
  remove(cls) {
    const classes = this.el.className.split(/\s+/).filter(c => c && c !== cls)
    this.el.className = classes.join(' ')
  }
}

class MockElement {
  constructor(tagName = 'div', className = '', attributes = {}) {
    this.tagName = tagName.toUpperCase()
    this.nodeType = 1
    this.className = className
    this.classList = new MockClassList(this)
    this.attributes = { ...attributes }
    this.children = []
    this.parentElement = null
    this.ownerDocument = null
    this._textContent = ''
    this._innerHTML = ''
    this.eventListeners = {}
    this.isFocused = false
    // updateTaskHeaderCounter publishes the completion ratio as a custom property,
    // so every mock node needs a minimal CSSStyleDeclaration. Suites that read a
    // plain property (`style.display`) read the same object.
    this._cssVars = {}
    this.style = {
      display: '',
      getPropertyValue: k => (
        this._cssVars[k] !== undefined ? this._cssVars[k]
          : (typeof this.style[k] === 'string' ? this.style[k] : '')),
      setProperty: (k, v) => { this._cssVars[k] = String(v) },
    }
    this._rect = { top: 100, left: 10, right: 250, bottom: 140, width: 240, height: 40 }
    if (attributes['data-slot'] === 'tool-block') this._addDisclosureButton()
  }

  _addDisclosureButton() {
    if (this._disclosureAdded) return
    this._disclosureAdded = true
    const btn = new MockElement('button')
    btn.setAttribute('aria-expanded', 'false')
    this.appendChild(btn)
  }

  get id() {
    return this.getAttribute('id') || ''
  }

  set id(val) {
    this.setAttribute('id', val)
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val)
    if (name === 'data-slot' && val === 'tool-block') this._addDisclosureButton()
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
  }

  removeAttribute(name) {
    delete this.attributes[name]
  }

  get textContent() {
    if (this._textContent !== undefined && this._textContent !== '') return this._textContent
    if (this._innerHTML) {
      return this._innerHTML.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    }
    if (this.children.length > 0) return this.children.map(c => c.textContent).join(' ')
    return this._textContent || ''
  }

  set textContent(val) {
    this._textContent = String(val)
    if (this.attributes['data-slot'] === 'tool-block') {
      // Preserve the disclosure button: assigning a title must not remove it.
      this.children = this.children.filter(c => c.tagName === 'BUTTON' && c.hasAttribute('aria-expanded'))
      for (const c of this.children) c.parentElement = this
      return
    }
    this.children = []
  }

  get innerHTML() {
    /* A string assigned by the setter is returned verbatim, as before. A tree built
       one node at a time has no such string, and a real element serialises its
       children there — without that, `innerHTML` reads back empty for a subtree the
       browser would have rendered. */
    if (this._innerHTML) return this._innerHTML
    return this.children.map(child => child._serialize()).join('')
  }

  _serialize() {
    const tag = this.tagName.toLowerCase()
    const cls = this.className ? ` class="${this.className}"` : ''
    const inner = this.children.length > 0
      ? this.children.map(child => child._serialize()).join('')
      : String(this._textContent).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<${tag}${cls}>${inner}</${tag}>`
  }

  set innerHTML(html) {
    this._innerHTML = String(html)
    this.children = []
    const tagMatches = html.matchAll(/<([a-zA-Z0-9]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9]+)([^>]*)\/>/g)
    for (const match of tagMatches) {
      const tagName = match[1] || match[4]
      const attrsStr = match[2] || match[5] || ''
      const inner = match[3] || ''
      const el = new MockElement(tagName)
      const classMatch = attrsStr.match(/class=["']([^"']*)["']/)
      if (classMatch) el.className = classMatch[1]
      const roleMatch = attrsStr.match(/role=["']([^"']*)["']/)
      if (roleMatch) el.setAttribute('role', roleMatch[1])
      el.textContent = inner.replace(/<[^>]*>/g, '').trim()
      this.appendChild(el)
    }
  }

  get isConnected() {
    let curr = this.parentElement
    while (curr) {
      if (curr.tagName === 'BODY' || curr.tagName === 'HTML') return true
      curr = curr.parentElement
    }
    return false
  }

  get firstElementChild() {
    return this.children[0] || null
  }

  get previousElementSibling() {
    if (!this.parentElement) return null
    const siblings = this.parentElement.children
    const idx = siblings.indexOf(this)
    return idx > 0 ? siblings[idx - 1] : null
  }

  get nextElementSibling() {
    if (!this.parentElement) return null
    const siblings = this.parentElement.children
    const idx = siblings.indexOf(this)
    return idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null
  }

  setRect(rect) {
    this._rect = { ...this._rect, ...rect }
  }

  getBoundingClientRect() {
    return this._rect
  }

  focus() {
    const doc = this.ownerDocument
    if (doc) {
      const prev = doc.activeElement
      if (prev && prev !== this) prev.isFocused = false
      doc.activeElement = this
    }
    this.isFocused = true
  }

  /**
   * `ownerDocument` follows the tree, as it does in a real DOM: attaching a subtree
   * to a node that has a document hands the document to every descendant, not just
   * the child being appended. Suites read `document.activeElement` after focusing a
   * node several levels down, which only works if the whole subtree knows its
   * document. A parent with no document leaves the subtree's owner alone rather than
   * clearing it.
   */
  _adopt(ownerDocument) {
    if (!ownerDocument) return
    this.ownerDocument = ownerDocument
    for (const child of this.children) child._adopt(ownerDocument)
  }

  appendChild(child) {
    if (!child) return child
    if (child.parentElement) child.remove()
    child.parentElement = this
    child._adopt(this.ownerDocument)
    this.children.push(child)
    return child
  }

  append(...nodes) {
    for (const node of nodes) {
      if (typeof node === 'string') {
        const textNode = new MockElement('span')
        textNode.textContent = node
        this.appendChild(textNode)
      } else if (node) {
        this.appendChild(node)
      }
    }
  }

  /**
   * Replaces the whole child list, the way the DOM method of the same name does:
   * detached children lose their parent, and a previously assigned `innerHTML`
   * string no longer describes the node.
   */
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentElement = null
    this.children = []
    this._innerHTML = ''
    this.append(...nodes)
  }

  insertBefore(newNode, refNode) {
    if (!newNode) return newNode
    if (newNode.parentElement) newNode.remove()
    newNode.parentElement = this
    newNode._adopt(this.ownerDocument)
    const idx = this.children.indexOf(refNode)
    if (idx === -1) this.children.push(newNode)
    else this.children.splice(idx, 0, newNode)
    return newNode
  }

  removeChild(child) {
    const idx = this.children.indexOf(child)
    if (idx !== -1) {
      this.children.splice(idx, 1)
      child.parentElement = null
    }
    return child
  }

  remove() {
    if (this.parentElement) this.parentElement.removeChild(this)
  }

  contains(node) {
    if (node === this) return true
    for (const child of this.children) {
      if (child.contains(node)) return true
    }
    return false
  }

  addEventListener(event, fn) {
    if (!this.eventListeners[event]) this.eventListeners[event] = []
    this.eventListeners[event].push(fn)
  }

  removeEventListener(event, fn) {
    if (!this.eventListeners[event]) return
    this.eventListeners[event] = this.eventListeners[event].filter(h => h !== fn)
  }

  dispatchEvent(event) {
    const handlers = this.eventListeners[event.type] || []
    for (const h of handlers) h.call(this, event)
    return true
  }

  _fire(type) {
    const evt = {
      type,
      target: this,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true },
      stopPropagation() {},
    }
    this.dispatchEvent(evt)
    return evt
  }

  click() {
    return this._fire('click')
  }

  pointerDown() {
    return this._fire('pointerdown')
  }

  /**
   * `scope` is the node a query started from; `:scope > x` only matches children of
   * it. Callers that ask "does this element match" pass nothing.
   *
   * Only the shapes listed in the header are answered. A selector the fake DOM
   * cannot parse (`[class*=x]`, a descendant combinator, a pseudo-class) returns
   * false, exactly as every one of the 13 copies it replaced did — quietly
   * "supporting" more than they did would change what the plugin finds.
   */
  matches(selector, scope = null) {
    if (!selector) return false
    const sel = String(selector).trim()
    if (!sel) return false
    if (sel.includes(',')) return sel.split(',').some(s => this.matches(s, scope))
    if (sel.startsWith(':scope')) {
      const rest = sel.replace(/^:scope\s*>\s*/, '')
      if (rest === sel) return false
      if (scope && this.parentElement !== scope) return false
      return this.matches(rest, null)
    }

    const attrs = sel.match(/\[[^\]]*\]/g) || []
    const bare = sel.replace(/\[[^\]]*\]/g, '')
    if (/[^\w.#/-]/.test(bare.replace(/\\/g, ''))) return false

    let rest = bare
    const tag = bare.match(/^[a-zA-Z][\w-]*/)
    if (tag) {
      if (this.tagName.toLowerCase() !== tag[0].toLowerCase()) return false
      rest = bare.slice(tag[0].length)
    }
    if (rest.startsWith('#')) {
      if (this.id !== rest.slice(1)) return false
    } else {
      const classes = rest.split('.').filter(Boolean).map(c => c.replace(/\\/g, '').trim())
      if (!classes.every(c => this.classList.contains(c))) return false
    }
    for (const bracket of attrs) {
      const inside = bracket.slice(1, -1)
      const eq = inside.indexOf('=')
      if (eq === -1) {
        if (!this.hasAttribute(inside.trim())) return false
        continue
      }
      const name = inside.slice(0, eq).trim()
      const value = inside.slice(eq + 1).replace(/^['"]|['"]$/g, '').trim()
      if (this.getAttribute(name) !== value) return false
    }
    return true
  }

  closest(selector) {
    let curr = this
    while (curr) {
      if (curr.matches(selector)) return curr
      curr = curr.parentElement
    }
    return null
  }

  /**
   * Depth-first, in document order, with the query's starting node kept as the
   * `:scope` for every level — the recursion has to carry it, because `:scope`
   * means "the node querySelector was called on", not "the node I am on".
   */
  _query(selector, scope, firstOnly) {
    const found = []
    for (const child of this.children) {
      if (child.matches(selector, scope)) {
        if (firstOnly) return child
        found.push(child)
      }
      if (firstOnly) {
        const deeper = child._query(selector, scope, true)
        if (deeper) return deeper
      } else {
        found.push(...child._query(selector, scope, false))
      }
    }
    return firstOnly ? null : found
  }

  querySelector(selector) {
    return this._query(selector, this, true)
  }

  querySelectorAll(selector) {
    return this._query(selector, this, false)
  }
}

class MockMutationObserver {
  constructor(cb) {
    this.cb = cb
  }
  observe() {}
  disconnect() {}
}

module.exports = { MockClassList, MockElement, MockMutationObserver }
