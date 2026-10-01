# Hermes 终端表面色在启动时被一次性烘进 WebGL 画布：恢复的终端永远是黑的

对象：Hermes Desktop（`~/.hermes/hermes-agent/apps/desktop/src`）
来源：hermes-bubbles-skin 的终端配色验收；下列行号均已在该检出上逐条核对。
结论先行：**应用里已经有解决这类问题的机制（`hooks/use-theme-epoch.ts`），终端是唯一没接上的消费者。**
补丁 3 行。

## 现象

同一条终端会话，两种结果：

| 终端怎么来的 | 面板颜色 |
| --- | --- |
| 启动时从 `~/.hermes/terminal-sessions/` 恢复的那个标签 | **黑色方块**（四周 instance 的 padding 是主题蓝，中间画布是黑的） |
| 启动后点 `+` 新建的标签 | 正常主题蓝 `rgb(17,60,106)` |

而且是**先蓝后黑**：面板刚出现时是蓝的，xterm 的渲染器画出第一帧后变黑。

皮肤侧已排除（现场探针，构建 `74a330f+d1fca9ef`）：

```
[2] token 解析为 rgb(17, 60, 106)
[3] [data-persistent-terminal]  rgb(17,60,106) image none
[3] .xterm / .xterm-viewport / .xterm-screen   全部 rgb(17,60,106) image none
[3] canvas ×2                    rgba(0,0,0,0)
[4] 中心点命中栈(上→下) canvas.xterm-link-layer > canvas.(无class) > div.xterm-screen=rgb(17,60,106) > …
```

所有 DOM 层都是正确的蓝，黑却在它们上面 → 黑是最上面那张画布的**位图**：宿主设了
`allowTransparency: false`（`use-terminal-session.ts:519`），画布不透明并按
`ITheme.background` 自行清屏，CSS 无从干预。

## 机制

| 位置 | 行为 |
| --- | --- |
| `use-terminal-session.ts:288-291` | `withSurface(theme)` = `{...theme, background: resolveSurfaceColor(theme.background ?? '#ffffff')}` |
| `terminal/selection.ts:88-99` | `resolveSurfaceColor()` 用探针元素读 `--ui-terminal-surface-background` 的**计算值**，读成透明就退回 fallback |
| `use-terminal-session.ts:546` | 终端创建时 `theme: withSurface(initialThemeRef.current)` —— **一次性解析** |
| `use-terminal-session.ts:998` | 重解析 effect 的依赖是 `[activeTheme, themeName]` |
| `themes/context.tsx` | 皮肤的 `customCSS` 是运行时注入的 `<style>`，不在首屏 HTML 里 |
| `styles.css:623` | `--ui-terminal-surface-background: var(--ui-bg-chrome)` —— 皮肤没落地前它是应用自己的深色 |

时序：恢复的终端在 customCSS 注入**之前**创建 → 解析到应用深色 → 烘进画布 →
此后 CSS 再正确也改不动那张位图；而 `themeName` 并没有因为"皮肤样式落地"而变化，
`:998` 的重解析也就不会触发。新建的终端创建得晚，所以正常。

## 皮肤侧为什么修不了（已试）

1. CSS 选择器：DOM 层已经全部正确（见上表探针），黑不在 DOM 层。
2. 把 token 提前写进 PLUGIN_CSS（`src/plugin.js:88-100`，已提交）：插件的
   `installStyles` 仍晚于终端创建，重启后依旧黑。
3. 让插件替 xterm 重设 `term.options.theme`：终端实例在模块作用域内
   （`terminal/terminals.ts` 只导出 atom 与函数，没有任何 `window` 句柄），外部拿不到。

## 补丁：让终端用应用自己的重解析机制

`hooks/use-theme-epoch.ts` 的注释就是这个问题的定义：

> Canvas/probe consumers that rasterize the *computed* color-mix()/oklch tokens must
> re-resolve AFTER the paint — useTheme() can't, since a child's effect runs before the
> provider's applyTheme. A MutationObserver fires post-mutation, so the next
> getComputedStyle is fresh.

它观察 `<html>` 的 `class / style / data-hermes-mode / data-hermes-theme`，而
ThemeProvider 应用皮肤时正是重写这些内联自定义属性 → 皮肤落地会 tick 这个 epoch。
现有消费者：`app/starmap/star-map.tsx:163`、`components/assistant-ui/embeds/use-is-dark.ts:12`、
`components/chat/image-generation-placeholder.tsx:4`。**终端不在其中。**

```diff
--- a/src/app/right-sidebar/terminal/use-terminal-session.ts
+++ b/src/app/right-sidebar/terminal/use-terminal-session.ts
@@ -13,6 +13,7 @@ import { isComposerChord } from '@/lib/keybinds/chords'
 import { $previewTarget } from '@/store/preview'
+import { useThemeEpoch } from '@/hooks/use-theme-epoch'
 import { useTheme } from '@/themes/context'
 
@@ -393,6 +394,10 @@ export function useTerminalSession({
   // must match the surface or the ANSI palette inverts against it. themeName
   // re-resolves the canvas surface on skin switches (same mode, new tint).
   const { renderedMode, theme, themeName } = useTheme()
+  // A custom skin paints --ui-terminal-surface-background from a <style> tag that
+  // ThemeProvider injects after this hook's first run, so the one-shot resolve at
+  // creation bakes the pre-skin chrome color into the WebGL clear color — and a
+  // restored terminal stays black for its whole life. The epoch ticks on that paint.
+  const themeEpoch = useThemeEpoch()
 
@@ -995,7 +1000,7 @@ export function useTerminalSession({
     return () => cancelAnimationFrame(raf)
-  }, [activeTheme, themeName])
+  }, [activeTheme, themeName, themeEpoch])
```

`clearTextureAtlas()` 已经在这个 effect 里（`:991`），所以重解析后旧字形的缓存色也会一起
刷新——不需要额外改动。

## 验证

1. 应用补丁后重新构建桌面端（当前运行的是打包件
   `release/mac-arm64/Hermes.app/Contents/Resources/app.asar.unpacked/dist`，构建于 9/26）。
2. 保留一个终端标签 → Cmd+Q → 重启 → 打开终端面板。
3. 期望：不再出现"先蓝后黑"；面板始终是皮肤表面色。
4. 回归：切换明暗主题各一次，终端底色应跟随且无残影（这条走的是同一个 effect）。

## 不重建的话

关掉恢复出来的那个标签、点 `+` 新建一个即可（新建路径本来就正确）。皮肤侧我不再动终端设定。

## 同类未接上的读取（审计）

`getComputedStyle` 在宿主里共 20 余处调用，逐个看完：只有下面三处是"读主题 token 一次、
然后长期持有"，其中只有第一处会烘进位图。

| 位置 | 读什么 | 严重度 |
| --- | --- | --- |
| `terminal/use-terminal-session.ts:546` + 依赖 `:998` | `--ui-terminal-surface-background` → WebGL 清屏色 | **高**：本文主题，永久且可见 |
| `app/chat/composer/voice-activity.tsx:133` | 画布的 `color`（波形色），在 canvas 初始化时读一次 | 中：颜色错到画布重建为止 |
| `components/pet/pet-star-shower.tsx:80` | `--ui-accent`，effect 内读一次 | 低：桌宠星光颜色 |

已正确接上 epoch 的消费者（可作为补丁的写法参照）：`app/starmap/star-map.tsx:163`、
`components/assistant-ui/embeds/use-is-dark.ts:12`、
`components/chat/image-generation-placeholder.tsx:4`（用 `onThemeRepaint`）。

皮肤插件侧：`src/plugin.js` 里 **没有任何 `getComputedStyle`**，所以不存在同类风险。

## 已否决的折中：画布 `mix-blend-mode: screen`（实测数字）

思路是让画布的深色底"透"掉、露出下面正确的表面色。用真实取色（现状烘出来的是
`#0c233a` = rgb(12,35,58)，来自截图取样）在浏览器里做了 A/B 像素测量：

| 元素 | 现状 | screen 后 | 对比度 现状 → screen |
| --- | --- | --- | --- |
| 背景 | rgb(12,35,58) | **rgb(28,87,140)** | — |
| red | rgb(229,85,90) | rgb(231,125,159) | 13.18 → **6.86** |
| green | rgb(80,250,123) | rgb(92,251,178) | 12.05 → **5.91** |
| cyan | rgb(139,233,253) | rgb(147,238,254) | 13.99 → **6.89** |
| white | rgb(248,248,242) | rgb(248,250,247) | 25.08 → **11.70** |
| ANSI black | rgb(77,77,77) | rgb(89,119,151) | 2.66 → **2.05** |

否决理由有两条，第一条就足够：

1. **它连自己的目标都没达到。** 混合后是 rgb(28,87,140)，而皮肤表面色是 rgb(17,60,106)，
   偏 +11/+27/+34 —— 画布会变成一块**比四周更亮的蓝**，接缝还在，只是从"黑块"换成"亮块"。
2. 每个 ANSI 色对背景的对比度**普遍腰斩**（红 13.2→6.9、绿 12.1→5.9），终端里 diff、
   报错、进度条全靠这些色区分；`black` 还会变成蓝灰，与背景几乎并轨。

## 已执行（2026-10-01）

补丁已应用到 `~/.hermes/hermes-agent`（未提交，`git restore` 可撤销），并按 **B 方案**热部署到正在使用的 app：

| 步骤 | 结果 |
| --- | --- |
| `npx tsc --build tsconfig.json` | exit 0，零输出 |
| `npm run build` | 新代 `dist/assets/index-D8qLiO6g.js`，`postbuild` 断言通过 |
| 备份 | `~/.hermes/backups/desktop-dist-pre-theme-epoch-20261001-233346`（48M） |
| 复制到 `app.asar.unpacked/dist` | 与 src 树只差一个旧代 chunk（无害残留） |
| 引用完整性 | `index.html` 点名的 138 个 asset 全部存在 |
| 复制后签名校验 | **失败**：`a sealed resource is missing or invalid` → 确认 unpacked 资源在 seal 范围内 |
| `codesign --force --options runtime --entitlements <原样> --sign -` | 成功；`--verify --strict` 与 `--verify --deep --strict` 均 exit 0；entitlements 逐字节一致；flags 仍是 `adhoc,runtime` |

回滚（一条命令）：

```bash
APP=~/.hermes/hermes-agent/apps/desktop/release/mac-arm64/Hermes.app
rsync -a --delete ~/.hermes/backups/desktop-dist-pre-theme-epoch-20261001-233346/ \
  "$APP/Contents/Resources/app.asar.unpacked/dist/"
codesign --force --options runtime --sign - "$APP"
```

**未验证的一项**：运行时效果（需要 Cmd+Q 重启后由你看）。本地无法先验证的原因是
`node_modules/electron` 未安装、`~/Library/Caches/electron` 为空，任何 `electron .` /
`npm run dev` 都要先联网下载 Electron 40.10.2。

### 热部署 Hermes 渲染层的可复用配方

1. 打包版优先加载 `app.asar.unpacked/dist`（`electron/main.ts:4566-4576` 明写"unpacked 才是
   repair 重写的那一份"），所以改 `dist/**` 就能生效，不必重跑 electron-builder。
2. 但 unpacked 资源**在代码签名 seal 之内**：复制完 `codesign --verify --strict` 会报
   `a sealed resource is missing or invalid`。必须重签外层：
   `codesign --force --options runtime --entitlements <先 dump 出来的原 entitlements> --sign - "$APP"`。
   不要用 `--deep`——那会重签嵌套 helper 并可能丢掉它们的 entitlements。
3. 启动期没有 contentHash 校验（`desktop-build-stamp.json` 只被 `gui_uninstall.py` 读），
   所以替换不会被自愈回滚。

## 附：顺带确认的两个事实（与上面独立，已在皮肤侧修掉）

- `.xterm-scrollable-element` 比 `.xterm-screen` 宽出滚动条那一段，且带 xterm 自己的内联
  底色；宿主只给 `.xterm-screen` / `.xterm-viewport` 加了强制背景
  （`terminal/instance.tsx:21`），所以正常面板的右缘仍会有一条深色。皮肤已纳入该层。
- `resolveSurfaceColor()` 读不到值时的 fallback 是 `theme.background ?? '#ffffff'`
  （`:289`）。若某次皮肤变量整体缺失，终端会拿到主题自带深色而不是皮肤色——与本文主
  题同源，接上 epoch 后一并缓解。
