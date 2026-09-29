# Hermes Bubbles Blue Glass Skin & Theme

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Hermes Agent](https://img.shields.io/badge/Hermes_Agent-Skin_%26_Theme-007acc.svg)](https://github.com/NousResearch/hermes-agent)

A modern, high-contrast **Full-Window Blue Glassmorphism Skin** tailored for [Hermes Agent](https://github.com/NousResearch/hermes-agent) (Desktop & CLI) and VS Code.

<p align="center">
  <img src="assets/home-preview.png" alt="Hermes Bubbles Skin Preview" width="100%" />
</p>

---

## 📸 Screenshots (界面预览)

### 1. 全局氛围与主页 (Home View & Ambient Lighting)
深邃黑曜石蓝玻璃底板搭配 6 重环境光斑微光漫反射，呈现沉浸式通透与层次感。

<p align="center">
  <img src="assets/home-preview.png" alt="Home View" width="95%" />
</p>

### 2. 拟态气泡与紧凑会话 (Chat View & Frosted Glass Bubbles)
白雾霜玻 AI 气泡 + 蓝宝石渐变用户气泡；复原/中断按键外置左侧居中，告别气泡内部拥挤；集成式拟态蓝终端与右侧 Ledger 面板。

<p align="center">
  <img src="assets/chat-preview.png" alt="Chat View" width="95%" />
</p>

### 3. 外观与窗口设置 (Window & Appearance Settings)
全面深度兼容 Hermes 原生窗口透明度、色调、模糊及阴影控制面板，层次分明，毛玻璃质感温润通透。

<p align="center">
  <img src="assets/settings-preview.png" alt="Settings View" width="95%" />
</p>

---

## ✨ Features (视觉特性)

- 🌌 **Ambient Light Constellation (6重环境光斑)**: Multi-layer subtle radial highlights (`radial-gradient`) mapped over a deep obsidian navy glass backplane (`linear-gradient(165deg, #092038, #0e2e54, #16467d)`).
- 💬 **Frosted Glass Bubbles (极简拟态对话气泡)**:
  - **Assistant (AI)**: Frosted white glass bubble (`rgba(255, 255, 255, 0.13)`) with high-legibility crisp text and seamless avatar tail.
  - **User**: Deep sapphire glass bubble (`rgba(59, 130, 246, 0.45)`) with compact vertical height and clean typography.
- ⚡ **Optimized UX Refinements (外置操作按键与紧凑间距)**:
  - **Relocated Checkpoint Controls**: The "Stop Turn / Restore Checkpoint" action button is relocated **outside the bubble** to the left, vertically centered. Zero crowd inside text bubbles!
  - **Compact Heights**: Bubble height tightened to sleek ~30px capsules.
  - **Visible Voice CTA**: High-contrast dark navy audio-wave and send icons anchored inside the primary action circle.
- 💻 **Unified Terminal Surface (无黑块拟态蓝终端)**:
  - Integrated terminal canvas (`.xterm canvas` opacity 0.88) and right rail (`[class*='group/rail']`) with ice-blue hairline borders.
- 🧩 **Desktop Plugin (桌面端动态增强插件)**:
  - **Bare-Text Transcript Rows**: 已思考 / 已运行 / 已读取 等思考与工具行不再画卡片，直接贴在气泡上；状态由文字颜色与字形承担（running 转圈、completed ✓、failed ✗），只有代码块与 diff 保留强调框。
  - **Tool Group Aggregation (Phase 4)**: Consecutive completed tools fold into one quiet summary line (`▸ 3 个工具调用`) that expands to the full execution log, preserving every original DOM node ("Collapse, Never Delete").
  - **Smart Long Message Collapse**: Automatically folds lengthy user prompts (>4 lines) with interactive "Show more / Show less" pill buttons, preserving full Markdown and code blocks.
  - **Organized Task Execution UI**: The composer status stack reads as exactly one rounded sapphire card, with numbered rows, a live progress bar on the header rule, and an independently scrolling body.
  - **Zero-Conflict Isolation**: Seamless DOM recognition via MutationObserver that strictly preserves native tool approval, clarification dialogs, and backend execution workflows.
- 🪶 **Ultra-Lightweight & Robust (体积精简)**:
  - `customCSS` sits at **~31 KB of the 32 KiB** the gateway allows; component CSS that does not fit goes to the plugin's own stylesheet, which has no cap. `scripts/sync.js` refuses to deploy an oversized skin instead of letting the tail vanish silently.

---

## 🚀 One-Line Quick Install (一键安装)

### 1. 基础皮肤安装 (Skin Theme)
Open your terminal and run:

```bash
curl -fsSL https://raw.githubusercontent.com/AproXin/hermes-bubbles-skin/main/bubbles.yaml -o ~/.hermes/skins/bubbles.yaml
```

Then switch to the skin in Hermes:

```bash
/skin bubbles
```

Or set it as default in `~/.hermes/config.yaml`:

```yaml
display:
  skin: bubbles
```

### 2. 桌面增强插件安装 (Desktop Plugin)
克隆或下载本仓库至 Hermes Desktop 插件目录：

```bash
mkdir -p ~/.hermes/desktop-plugins/hermes-bubbles-skin
curl -fsSL https://raw.githubusercontent.com/AproXin/hermes-bubbles-skin/main/plugin.js -o ~/.hermes/desktop-plugins/hermes-bubbles-skin/plugin.js
curl -fsSL https://raw.githubusercontent.com/AproXin/hermes-bubbles-skin/main/plugin.yaml -o ~/.hermes/desktop-plugins/hermes-bubbles-skin/plugin.yaml
```

In the Hermes Desktop App, **quit completely with `Cmd + Q` and reopen** — the plugin JS and the skin's `customCSS` are both read once at startup, so `Cmd + R` is not enough to pick up a new version.

---

## 🛠 开发与部署 (Development)

Two files paint this skin, and this repo holds the canonical copy of both:

| 文件 | 作用 | 落地位置 |
| --- | --- | --- |
| `src/plugin.js` | 运行时插件：DOM 打标 + `PLUGIN_CSS`（无体积上限） | `~/.hermes/desktop-plugins/hermes-bubbles-skin/plugin.js` |
| `bubbles.yaml` | 皮肤本体：`customCSS:`（网关截断到 32 KiB） | `~/.hermes/skins/bubbles.yaml` |

改完跑一条命令即可同时部署两者：

```bash
node scripts/sync.js              # 生成 plugin.js 并部署插件 + 皮肤
node scripts/sync.js --no-skin    # 只同步插件
node scripts/sync.js --force-skin # 覆盖被外部工具改过的 live 皮肤（会先备份 .bak）
```

`sync` 会做两件保护：`customCSS` 超过网关上限时**拒绝部署**（超限的尾部会在运行时静默消失），以及当 `~/.hermes/skins/bubbles.yaml` 被 `hermes skin ...` 等外部途径改过时**拒绝覆盖**——所以请改仓库里的 `bubbles.yaml`，不要直接改 live 文件。

验证：

```bash
node scripts/run-tests.js              # 全部套件
node scripts/run-tests.js sidebar task # 只跑文件名包含这些字样的
node scripts/render-preview.js         # 用真实三层样式表离线渲染预览图到 docs/previews/
```

两类套件互补：**9 个**会在无头浏览器里装配「构建 CSS + live customCSS + PLUGIN_CSS」三层样式表，断言**实测计算样式与像素**（而不是比对 CSS 文本）；**17 个**用 mock DOM 跑插件 JS 的行为（打标、折叠、生命周期）。缺少 Hermes 检出或浏览器时，浏览器类套件会自行 SKIP 而不是假绿。

生成物说明：根目录 `plugin.js` 是 README 安装命令要拉取的分发产物（由 `sync` 从 `src/plugin.js` 生成，勿手改）；`desktop/` 只是历史副本，运行时不会加载。

---

## 🎨 VS Code Color Theme (VS Code 配套主题)

This repository also includes a matching VS Code color theme:
- Located under [`vscode/`](./vscode)
- Package file: [`hermes-bubbles-theme-0.0.1.vsix`](./vscode/hermes-bubbles-theme-0.0.1.vsix)

To install in VS Code:
```bash
code --install-extension vscode/hermes-bubbles-theme-0.0.1.vsix
```

---

## 📄 License

MIT License © 2026 AproXin
