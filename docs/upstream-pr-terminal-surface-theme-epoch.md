# Upstream PR packet — terminal surface re-resolve

Local commits in `~/.hermes/hermes-agent`:

| | |
| --- | --- |
| submit from | branch `fix/desktop-terminal-surface-theme-epoch` @ `e999f9d5db9`, parented directly on upstream `d0288be5b33` |
| same change on | `main` @ `e381e400e9d` (keeps the local rebuild path working; identical tree, not what to push) |
| file | `apps/desktop/src/app/right-sidebar/terminal/use-terminal-session.ts` (+8 / −1) |
| patch | `docs/patches/0001-desktop-terminal-surface-theme-epoch.patch` |

Patch validity was checked, not assumed: applying it with `git apply --check -p1` to a pristine copy of
the upstream file passes, and applying it for real produces a file byte-identical to the branch blob
(`diff -q` against `git show fix/…:…`). The patch header's `index efa82cd232d..` matches
`git rev-parse d0288be5b33:…`, so upstream HEAD has not drifted under it.

Checks run before committing: `tsc --build` (exit 0), `npm run build` (ok), `prettier --check` on the
file (clean), `eslint` on the file (exit 0). Repo style followed: `fix(desktop): <lowercase imperative>`,
body = symptom paragraph + what-the-code-now-does paragraph (`desktop` is the dominant scope: 154 of the
last 400 commits). `hooks/use-theme-epoch.ts` is imported between `@/debug/right-pane-events` and
`@/lib/haptics`, matching the existing alphabetical `@/` order, and the project has no pre-commit hook
(`.git/hooks` has only samples, no `.husky`).

Chinese background, probe output and the rejection of the `mix-blend-mode` workaround are in
[hermes-terminal-surface-boot-reresolve.md](hermes-terminal-surface-boot-reresolve.md).

## Title

```
fix(desktop): re-resolve the terminal surface color after a skin repaint
```

## Body

Paste-ready as pure markdown in [patches/pr-body-terminal-surface.md](patches/pr-body-terminal-surface.md)
(Symptom / Cause / Fix / How to verify / Alternative I measured and rejected). It is a separate file
because it contains its own fenced block, which an enclosing fence would close early.

## Blocked on you, deliberately

Nothing has been pushed and no PR has been opened: that is an outside-visible action on a shared repo,
and this session has no way to do it even if you said yes.

1. **Committer identity is still machine-derived.** That repo has no `user.name`/`user.email` in either
   the global or local config, so git fell back to `Yuanxxx@ <yuanxxx@YuanxxxdeMacBook-Air.local>`. I set
   the **author** of `e999f9d5db9` to `AproXin <81232165+AproXin@users.noreply.github.com>` — taken from
   the local config of this skin repo — with `GIT_AUTHOR_*` + `git commit-tree`, which left the working
   tree untouched and created no amend. GitHub attributes a PR by author, so that is the field that
   mattered. The **committer** line still reads `.local`; correcting it needs
   `git config --global user.name/user.email`, which I do not run. Set it and `--reset-author` on a
   fresh `cherry-pick` if you want both fields clean.
2. **No fork, no `gh`.** `origin` and `upstream` both point at
   `https://github.com/NousResearch/hermes-agent.git`, and `gh` is not installed. `origin` is a
   `tree:0` partial clone (`promisor=true`), which normally makes you worry about pushing objects you
   never downloaded — measured here instead: `git rev-list --objects <branch> --not d0288be5b33` yields
   9 objects and `git cat-file -e` finds all 9 locally, so a push would ship only my commit, its blob
   and the trees on the changed path. The partial clone is not a blocker; a fork URL (or `gh`) is.
   `git ls-remote https://github.com/AproXin/hermes-agent.git` returns *Repository not found* — either
   the fork does not exist yet or it is private and this shell has no credentials (GitHub answers 404
   for both), so nothing to push to today.
3. **What I would run once you have a fork** (for your review, not for me to execute silently):
   ```
   gh repo fork NousResearch/hermes-agent --remote-name fork --remote
   git -C ~/.hermes/hermes-agent push -u fork fix/desktop-terminal-surface-theme-epoch
   gh pr create --repo NousResearch/hermes-agent --head AproXin:fix/desktop-terminal-surface-theme-epoch \
     --title "$(git -C ~/.hermes/hermes-agent log -1 --format=%s fix/desktop-terminal-surface-theme-epoch)" \
     --body-file ~/.gemini/antigravity/scratch/hermes-bubbles-skin/docs/patches/pr-body-terminal-surface.md
   ```
   Without `gh`, create the fork in the web UI, `git remote add fork <url>`, push the branch, and paste
   the title plus the body file into the PR form. `main`'s duplicate commit is not pushed.

`git -C ~/.hermes/hermes-agent log -1 fix/desktop-terminal-surface-theme-epoch` and
`git -C ~/.hermes/hermes-agent checkout fix/desktop-terminal-surface-theme-epoch -- apps/desktop/src/app/right-sidebar/terminal/use-terminal-session.ts`
recover the change at any point; the patch file is a second copy outside that repo.
