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
- 🪶 **Ultra-Lightweight & Robust (体积精简)**:
  - Compressed to **~25 KB**, well below Hermes' 32 KiB `customCSS` limit, leaving ample headroom.

---

## 🚀 One-Line Quick Install (一键安装)

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

In the Hermes Desktop App, press `Cmd + R` (or `Ctrl + R`) to reload and enjoy the glass theme!

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
