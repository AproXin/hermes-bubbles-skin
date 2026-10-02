/**
 * test/storage-sweep.test.js
 *
 * D9 is "localStorage only grows". The honest subset of that is retiring keys nothing
 * can ever read again — the double-prefixed shape the pre-D3 helper wrote — because a
 * general expiry would need a timestamp, i.e. a storage schema change.
 *
 * The dangerous half of the idea is deliberately NOT implemented and this suite pins
 * that too: storage spans every session while the DOM holds one transcript at a time, so
 * sweeping keys "not present in this document" would wipe the expanded state of every
 * other session on boot. A key that merely LOOKS like the retired shape must survive.
 *
 * Runs the shipped sweepRetiredStorageKeys, extracted from src/plugin.js, not retyped.
 *   node test/storage-sweep.test.js
 */

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'src', 'plugin.js')
const src = fs.readFileSync(SRC, 'utf8')
const grab = (label, re) => {
  const m = src.match(re)
  assert(m, `${label} not found in src/plugin.js — this test no longer runs the shipped code`)
  return m[0]
}

const ID = 'hermes-bubbles-skin'
const sweepBody = grab('sweepRetiredStorageKeys', /^function sweepRetiredStorageKeys\(\) \{[\s\S]*?^\}/m)

/** A localStorage stand-in that records what was removed. */
function store(entries, { throwOnRead = false } = {}) {
  const map = new Map(Object.entries(entries))
  const removed = []
  return {
    removed,
    api: {
      get length() {
        if (throwOnRead) throw new Error('SecurityError: storage blocked')
        return map.size
      },
      key(i) { return [...map.keys()][i] ?? null },
      removeItem(k) { removed.push(k); map.delete(k) },
      setItem(k, v) { map.set(k, v) },
      getItem(k) { return map.has(k) ? map.get(k) : null },
    },
  }
}

const run = (localStorage, stats = { retiredStorageKeys: 0 }) => {
  const sweep = new Function('ID', 'localStorage', 'stats', `${sweepBody}\nreturn sweepRetiredStorageKeys()`)
  const n = sweep(ID, localStorage, stats)
  return { n, stats }
}

const KEYS = {
  // Written by the old helper: a namespace inside a namespace. Unreachable since D3.
  retired_group: `${ID}:user-expand:${ID}:tool-group:grp_sess_1_msg_1_anchor_1_read_file`,
  retired_expand: `${ID}:user-expand:${ID}:user-expand:msg_9`,
  // Live shapes that must survive.
  expand_msg: `${ID}:user-expand:msg_1`,
  expand_hash: `${ID}:user-expand:hash_你好_世界`,
  group: `${ID}:tool-group:grp_sess_1_msg_1_anchor_1_read_file`,
  // Adversarial: a message whose text begins with the plugin id, hashed into the key.
  // It is one namespace deep, so it must not be mistaken for the retired shape.
  expand_hash_like: `${ID}:user-expand:hash_${ID} is great`,
  expand_hash_double_colon: `${ID}:user-expand:hash_${ID}:exact colon`,
  // Somebody else's key.
  other: 'some-other-plugin:state',
}

/** The store as the plugin would actually find it: namespaced strings as KEYS. */
const seed = () => Object.fromEntries(Object.values(KEYS).map(key => [key, 'true']))

const check = (label, ok, detail = '') => {
  // Printed here rather than buffered: a failure has to show which shape broke, not
  // just throw the last label off a stack trace.
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  assert(ok, `${label}${detail ? ` — ${detail}` : ''}`)
}

console.log('\n=== Storage Sweep Suite ===\n')

{
  const s = store(seed())
  const { n, stats } = run(s.api)
  check('only the double-prefixed keys are removed',
    s.removed.length === 2 && s.removed.includes(KEYS.retired_group) && s.removed.includes(KEYS.retired_expand),
    s.removed.join(' | '))
  check('the count is reported and lands in stats', n === 2 && stats.retiredStorageKeys === 2, `${n} / ${stats.retiredStorageKeys}`)
  check('every live shape survives',
    [KEYS.expand_msg, KEYS.expand_hash, KEYS.group, KEYS.other,
     KEYS.expand_hash_like, KEYS.expand_hash_double_colon].every(k => s.api.getItem(k) !== null),
    `${Object.keys(KEYS).length - s.removed.length} keys left`)
}

{
  const s = store(seed())
  run(s.api)
  const second = run(s.api)
  check('a second sweep removes nothing (idempotent)', second.n === 0 && second.stats.retiredStorageKeys === 0,
    `second pass removed ${second.n}`)
}

{
  const s = store({}, { throwOnRead: true })
  const { n } = run(s.api)
  check('a blocked store does not throw out of the sweep', n === 0, `returned ${n}`)
}

/* The sweep only helps if it actually runs, and it must not be able to cost a boot: a
   throw here would stop register() before installStyles. */
const registered = /register\(ctx\) \{[\s\S]*?sweepRetiredStorageKeys\(\)/.test(src)
check('register() calls it once per activation', registered)

console.log('\n=== Storage Sweep Suite: PASS ===\n')
