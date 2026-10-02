## Symptom

With a custom skin that paints `--ui-terminal-surface-background`, a terminal tab that was **restored at boot** stays black for its whole life, while a tab created **after** the skin has landed renders the skin's tint. Only the outer panel is wrong: every DOM layer around it (`[data-persistent-terminal]`, `.xterm`, `.xterm-viewport`, `.xterm-screen`) computes the skin's color. Sampling the rendered panel gives `#0c233a`, i.e. the app's pre-skin chrome color.

## Cause

`resolveSurfaceColor()` (`right-sidebar/terminal/selection.ts:86`) probes the *computed* value of `--ui-terminal-surface-background`, and the terminal is created once with `theme: withSurface(initialThemeRef.current)` (`use-terminal-session.ts:546`). Because the renderer runs with `allowTransparency: false` (`:519` — deliberate, and the comment there reads "our surface (`--ui-bg-chrome`) is opaque anyway"), that resolved color is baked into the WebGL canvas clear color.

A skin's `customCSS` is a `<style>` element ThemeProvider injects at runtime (`themes/context.tsx`), so it is not in the first-paint HTML — it lands *after* a restored terminal has already resolved.

The re-resolve effect at `:985-998` already defends against the lag inside one React commit ("ThemeProvider's applyTheme repaints the CSS vars in a sibling effect that runs after this one, so reading now would lag a mode behind. By the next frame the vars are current"). What it cannot see is a skin arriving on its own: the effect is keyed on `[activeTheme, themeName]`, and neither changes when a customCSS block lands, so it never re-runs. A terminal created *after* the skin resolves correctly, which is why the two tabs disagree.

## Fix

Subscribe the hook to the epoch the app already has for exactly this class of problem. `hooks/use-theme-epoch.ts` documents it:

> Canvas/probe consumers that rasterize the *computed* color-mix()/oklch tokens must re-resolve AFTER the paint — useTheme() can't, since a child's effect runs before the provider's applyTheme. A MutationObserver fires post-mutation, so the next getComputedStyle is fresh.

ThemeProvider rewrites the inline custom properties on `<html>` when it applies a skin, which is what the observer watches, so a skin landing ticks the epoch. `app/starmap/star-map.tsx:163` and `components/assistant-ui/embeds/use-is-dark.ts:12` consume `useThemeEpoch()`, and `components/chat/image-generation-placeholder.tsx:291` consumes `onThemeRepaint` from the same hook. The terminal was the one canvas consumer that never did.

```ts
const themeEpoch = useThemeEpoch()
// ...
}, [activeTheme, themeName, themeEpoch])
```

No other change is needed: `clearTextureAtlas()` already runs inside that effect (`:994`), so the glyph atlas repaints with the new surface.

## How to verify

1. Apply the patch and build the desktop app.
2. Leave a terminal tab open, quit with Cmd+Q (or the Windows equivalent) and start again — the restored tab must render the skin's surface color immediately, with no black phase.
3. Regression: flip light/dark and switch between two skins that tint the surface differently. The terminal background should follow each time with no residual clear color, on both the restored tab and a newly created one.

Without the fix, the workaround is to close the restored tab and create a new one.

## Alternative I measured and rejected

`mix-blend-mode: screen` on the xterm canvas (CSS-only, no host change) to hide the baked clear color. Measured against the skin's `rgb(17,60,106)` target: the blended background came out `rgb(28,87,140)` — off by `+11/+27/+34`, so the seam stays, and every ANSI color loses contrast (red 13.18 → 6.86, green 12.05 → 5.91, white 25.08 → 11.70, ANSI black 2.66 → 2.05).
