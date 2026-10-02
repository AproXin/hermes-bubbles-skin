# 宿主补丁说明：终端表面色需要在皮肤重绘后重新解析

This project is a plugin + skin for Hermes Agent, **not** a fork of the agent itself, so this patch has
deliberately **not** been submitted upstream — no fork, no pull request, no issue. It lives as a local
commit in a private checkout of `~/.hermes/hermes-agent`, which is only the build source for the desktop
app this skin runs inside.

If you build Hermes Desktop yourself, applying this 3-line patch is the only way to fix the
"restored terminal tab is black" symptom described in
[hermes-terminal-surface-boot-reresolve.md](hermes-terminal-surface-boot-reresolve.md); no amount of
skin CSS can reach it, because the color is baked into a WebGL clear color before the skin's stylesheet
is injected.

## The patch

| | |
| --- | --- |
| file | `apps/desktop/src/app/right-sidebar/terminal/use-terminal-session.ts` (+8 / −1) |
| patch file | [`patches/0001-desktop-terminal-surface-theme-epoch.patch`](patches/0001-desktop-terminal-surface-theme-epoch.patch) |
| upstream base it applies to | `d0288be5b33` |
| local commit | `main` @ `e381e400e9d`, plus branch `fix/desktop-terminal-surface-theme-epoch` @ `e999f9d5db9` (identical tree, parented directly on the upstream base) |

Apply it with `git apply patches/0001-desktop-terminal-surface-theme-epoch.patch` from the repo root,
then rebuild the desktop renderer.

The change itself: subscribe `useTerminalSession` to the `useThemeEpoch()` the app already maintains for
"rasterize a computed token, then re-read it after the paint", and add the epoch to the re-resolve
effect's dependency array. `clearTextureAtlas()` already runs in that effect, so the glyph atlas repaints
too — nothing else is needed.

## Verification actually performed

- `git apply --check -p1` against a pristine copy of the upstream file passes, and applying it for real
  produces a file byte-identical to the branch blob (`diff -q` against `git show <branch>:<file>`). The
  patch header's `index efa82cd232d..` matches `git rev-parse d0288be5b33:<file>`, so the base has not
  drifted under it.
- In the agent repo: `tsc --build` (exit 0), `npm run build` (ok), `prettier --check` on the file
  (clean), `eslint` on the file (exit 0), and the folder's existing suite `vitest run --project ui
  src/app/right-sidebar/terminal` → **11 files / 71 tests passed** on the patched tree.
- On the real app: rebuilt renderer hot-deployed into `app.asar.unpacked/dist` and re-signed, then
  `Cmd + Q` + restart — the restored terminal tab renders the skin's surface color instead of black.

No test was added for the patch itself. Upstream's PR template asks for one on bug fixes; a meaningful
test would have to mount `useTerminalSession`, which pulls in xterm, the gateway socket and the terminal
registry — that harness work was not attempted here.

## If this ever goes upstream

The commit message, and a paste-ready PR title and body (Symptom / Cause / Fix / How to verify / the
`mix-blend-mode` alternative that was measured and rejected), are kept in
[`patches/pr-body-terminal-surface.md`](patches/pr-body-terminal-surface.md) and
[`patches/0001-desktop-terminal-surface-theme-epoch.patch`](patches/0001-desktop-terminal-surface-theme-epoch.patch).
Upstream requires a PR template (`What does this PR do? / Related Issue / Type of Change / Changes Made /
How to Test / Checklist`) — the body file predates that template, so it would need folding into it.

Recover the local work at any point with:

```
git -C ~/.hermes/hermes-agent log -1 fix/desktop-terminal-surface-theme-epoch
git -C ~/.hermes/hermes-agent checkout fix/desktop-terminal-surface-theme-epoch -- \
  apps/desktop/src/app/right-sidebar/terminal/use-terminal-session.ts
```
