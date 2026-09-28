# Hermes Bubbles Blue Glass Skin & Theme

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Hermes Agent](https://img.shields.io/badge/Hermes_Agent-Skin_%26_Theme-007acc.svg)](https://github.com/NousResearch/hermes-agent)

A modern, high-contrast **Full-Window Blue Glassmorphism Skin** tailored for [Hermes Agent](https://github.com/NousResearch/hermes-agent) (Desktop & CLI) and VS Code.

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
