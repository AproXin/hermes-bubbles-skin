# Hermes Bubbles Blue Glass Skin & Theme

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Hermes Agent](https://img.shields.io/badge/Hermes_Agent-Skin_%26_Theme-007acc.svg)](https://github.com/NousResearch/hermes-agent)

A full-window blue glassmorphism **skin** for [Hermes Agent](https://github.com/NousResearch/hermes-agent) Desktop, paired with a **desktop plugin** that restructures the transcript, composer and task surfaces the skin alone cannot reach.

This repo is the canonical source of both halves. `scripts/sync.js` deploys them to a local Hermes install.

<p align="center">
  <img src="assets/home-preview.png" alt="Hermes Bubbles Skin Preview" width="100%" />
</p>

---

## 📸 Screenshots (界面预览)

真机窗口截图，但来自较早的一版：用户气泡的暖冷光谱、composer 的工具栏行与看板配色都是其后才落的，那几处请看「离线预览」一节。

### 1. 全局氛围与主页 (Home View & Ambient Lighting)
深邃黑曜石蓝玻璃底板搭配 6 重环境光斑微光漫反射，呈现沉浸式通透与层次感。

<p align="center">
  <img src="assets/home-preview.png" alt="Home View" width="95%" />
</p>

### 2. 拟态气泡与会话 (Chat View & Frosted Glass Bubbles)
白雾霜玻 AI 气泡 + 暖冷光谱用户气泡；复原/中断按键外置左侧居中，气泡内部不再拥挤。

<p align="center">
  <img src="assets/chat-preview.png" alt="Chat View" width="95%" />
</p>

### 3. 外观与窗口设置 (Window & Appearance Settings)
兼容 Hermes 原生窗口透明度、色调、模糊及阴影控制面板。

<p align="center">
  <img src="assets/settings-preview.png" alt="Settings View" width="95%" />
</p>

---

## ✨ Features (视觉特性)

### 皮肤层（`bubbles.yaml`）

- 🌌 **Ambient Light Constellation (6 重环境光斑)**: 6 层 `radial-gradient` 光斑铺在 `linear-gradient(165deg, #092038, #0e2e54, #16467d)` 的黑曜石蓝玻璃底板上。
- 💬 **Frosted Glass Bubbles**:
  - **Assistant**: 白雾霜玻 `rgba(255, 255, 255, 0.13)` + 顶部白色高光，`min-height: 38px`。
  - **User**: 暖→冷光谱渐变（`#F1594B → #EC8F32 → #D4B236 → #8FB66F → #4EA8B0 → #398DF6`，各 0.55 alpha）压在 `rgba(147, 197, 253, 0.62)` 上，配 `blur(16px) saturate(1.4)`、深色字 `#0a2440`、30px 紧凑高度。
- ⚡ **Relocated Checkpoint Controls**: 停止/复原按钮移出气泡，挂在左侧垂直居中；语音入口保持高对比可见。
- 💻 **Unified Terminal Surface**: 终端各层平涂 `--ui-terminal-surface-background`，不再被环境光斑规则覆盖；右侧 rail 保留光斑。

### 插件层（`src/plugin.js`）

- 📄 **Bare-Text Transcript Rows**: 已思考 / 已运行 / 已读取 等行不画卡片，状态由文字颜色与字形承担（running 转圈、completed ✓、failed ✗）；只有代码块与 diff 保留强调框。
- 🧭 **One Frame Rule (展开才有框)**: 收起时无框、展开时一个发丝线圆角框，**标题永远在框外**。组内再展开的明细降级为左侧竖线；单独一个工具的 run 因为没有外层汇总，保留完整框。`[data-delegate-card]` 与 agents 树节点走同一套发丝线质感。
- 🧾 **Tool Group Aggregation**: 连续完成的工具折成一行安静摘要（`▸ 3 个工具调用`），展开看完整执行日志——**Collapse, Never Delete**，原始 DOM 节点一个不删。
- ✂️ **Smart Long Message Collapse**: 超过 4 行的用户长消息自动折叠，配 Show more / Show less 胶囊，Markdown 与代码块完整保留。
- 🧑‍💻 **Codex-style Composer**: 输入主体在上，一条 1px 低对比分隔线（左右内缩、再淡一档）在下，分隔线下方是一行工具栏：模型 / 推理强度 / 附件靠左，语音靠右，同一基线垂直居中。
- 📋 **Organized Task UI**: Composer 状态栈只有一张圆角蓝宝石卡（归属 `[data-bubbles-task-section]`），编号行、标题分隔线上跑进度条、正文独立滚动。
- 🎛 **Capabilities Page**: 工具集/技能页的开关与页面其它开关同尺寸同动效同配色，选中态可读；分类标签选中态加强（填充 + 发丝描边 + 内发光）。
- 🗂 **Kanban Follows The Theme**: 看板页背景走主题变量（`--ui-surface-background: transparent`），让环境光透出，不再硬编码独立颜色。
- 🧹 **Zero-Conflict Isolation & Symmetric Cleanup**: MutationObserver 打标识别 DOM，严格保留原生审批、澄清对话框与后端执行流；`cleanupAll` 对称移除插件写入的属性与宿主内联变量，有对等测试兜底。

---

## 🚀 Install (安装)

### 1. 皮肤 (Skin Theme)

```bash
curl -fsSL https://raw.githubusercontent.com/AproXin/hermes-bubbles-skin/main/bubbles.yaml -o ~/.hermes/skins/bubbles.yaml
```

在 Hermes 里切换：

```
/skin bubbles
```

或写进 `~/.hermes/config.yaml`：

```yaml
display:
  skin: bubbles
```

### 2. 桌面插件 (Desktop Plugin)

```bash
mkdir -p ~/.hermes/desktop-plugins/hermes-bubbles-skin
curl -fsSL https://raw.githubusercontent.com/AproXin/hermes-bubbles-skin/main/plugin.js -o ~/.hermes/desktop-plugins/hermes-bubbles-skin/plugin.js
curl -fsSL https://raw.githubusercontent.com/AproXin/hermes-bubbles-skin/main/plugin.yaml -o ~/.hermes/desktop-plugins/hermes-bubbles-skin/plugin.yaml
```

**必须 `Cmd + Q` 完全退出后重开**——插件 JS 与 `customCSS` 都是每个 renderer 文档启动时读一次，`Cmd + R` 拿不到新版本。

装完想确认窗口真的加载了这一版，在 DevTools 里跑：

```js
document.documentElement.dataset.bubblesBuild   // 部署构建号；teardown 时会消失
```

控制台也会打一行 `[bubbles] styles installed at NNNNms (build …)`。

---

## 🛠 开发与部署 (Development)

两个文件负责绘制，本仓库持有两者的权威副本：

| 文件 | 作用 | 落地位置 |
| --- | --- | --- |
| `src/plugin.js` | 运行时插件：DOM 打标 + `PLUGIN_CSS`（**无体积上限**） | `~/.hermes/desktop-plugins/hermes-bubbles-skin/plugin.js` |
| `bubbles.yaml` | 皮肤本体：`customCSS: \|`（网关截断到 32 KiB） | `~/.hermes/skins/bubbles.yaml` |

当前实测体积：`customCSS` **29,926 / 32,768** 字符（余量 2,842），`PLUGIN_CSS` 运行时 **~80.8 KB**。放不进 32 KiB 的组件样式一律走插件自带样式表。

改完跑一条命令同时部署两者：

```bash
node scripts/sync.js              # 生成 plugin.js 并部署插件 + 皮肤
node scripts/sync.js --no-skin    # 只同步插件
node scripts/sync.js --force-skin # 覆盖被外部工具改过的 live 皮肤（会先备份 .bak）
```

`sync` 做两件保护：`customCSS` 超上限时**拒绝部署**（超限的尾部会在运行时静默消失），以及当 live 皮肤被 `hermes skin …` 等外部途径改过时**拒绝覆盖**——所以请改仓库里的 `bubbles.yaml`。部署号只由源码内容决定，重复执行 `sync` 不产生新字节。

### 测试

```bash
node scripts/run-tests.js              # 全部套件
node scripts/run-tests.js sidebar task # 只跑文件名包含这些字样的
```

**47 个套件**，三类互补：**25 个**会在无头浏览器里装配「构建 CSS + live customCSS + PLUGIN_CSS」三层真实样式表，断言**实测计算样式与像素**（而不是比对 CSS 文本）；**13 个**用 mock DOM 跑插件 JS 的行为（打标、折叠、状态判定、生命周期与 cleanup）；**9 个**不碰 DOM，守仓库与构建本身——源码可解析、宿主选择器漂移、`customCSS` 体积预算、CSS 作用域纪律、断言普查、sync 的部署与参数校验。

缺少 Hermes 检出或浏览器时，浏览器套件会 SKIP 而不是假绿；关键套件把 SKIP 判为失败。

### 离线预览

```bash
node scripts/render-preview.js              # 全部界面
node scripts/render-preview.js kanban       # 只渲染某几个（界面名是位置参数）
node scripts/render-preview.js --scale 3    # 也支持 --out / --width
```

六个界面：`bubbles` `task-panel` `composer` `transcript-rows` `kanban` `capabilities`。它们用真实三层样式表离线合成，可在不重启 Hermes 的前提下判断几何、颜色与排版；**注意两点失真**：codicon 字形离线不一定解析（看几何别看图标），且 `--ui-bg-*` / `--ui-text-*` 由宿主运行时写在 `<html>` 内联样式上，所以离线卡片色会比真机浅。

| 组件夹具 | 说明 |
| --- | --- |
| <img src="docs/previews/composer.png" width="420" alt="Composer"> | 分隔线 + 工具栏行 |
| <img src="docs/previews/task-panel.png" width="420" alt="Task panel"> | 单卡任务进度 |
| <img src="docs/previews/transcript-rows.png" width="420" alt="Transcript rows"> | 扁平行 + 展开框 |
| <img src="docs/previews/capabilities.png" width="420" alt="Capabilities"> | 开关两态 + 标签选中态 |
| <img src="docs/previews/kanban.png" width="420" alt="Kanban"> | 看板并入主题 |

---

## ⚠️ 已知限制 (Known Limitations)

- **启动时恢复出来的终端标签底色不跟随皮肤（宿主侧）**。xterm 在终端创建时把 `--ui-terminal-surface-background` 解析成一个具体颜色并烘进 WebGL 画布清屏色（`allowTransparency: false`），而皮肤的 `customCSS` 是运行时注入的 `<style>`，晚于这次解析；重解析 effect 只依赖 `[activeTheme, themeName]`，皮肤落地不改这两个值，之后任何 CSS 都改不动那张位图。**变通**：关掉恢复出来的标签、点 `+` 新建一个（新建路径本来就正确）。完整定位、探针原始输出见 [`docs/hermes-terminal-surface-boot-reresolve.md`](./docs/hermes-terminal-surface-boot-reresolve.md)，自建桌面端要用的 3 行补丁与 `patch` 文件在 [`docs/hermes-terminal-surface-host-patch.md`](./docs/hermes-terminal-surface-host-patch.md)。
- **`customCSS` 有 32 KiB 硬上限**，超限部分静默截断。`sync` 会拒绝部署，`test/skin-css-budget.test.js` 会盯余量。
- **`PLUGIN_CSS` 写在 JS 模板字符串里**，所以 CSS 转义（`\/`、`\[`、`\.`）会被 JS 先吃掉一层，导致整条逗号规则被静默丢弃；注释里出现反引号会**截断整张样式表**。有 `test/css-escapes-survive.test.js` 按运行时文本守卫。
- 皮肤 CSS 全部 scoped 在 `html[data-bubbles-skin='true']` 下，不删任何 DOM 节点，只改样式与加监听。

---

## 🎨 VS Code Color Theme (配套主题)

- 位于 [`vscode/`](./vscode)
- 安装包：[`hermes-bubbles-theme-0.0.1.vsix`](./vscode/hermes-bubbles-theme-0.0.1.vsix)

```bash
code --install-extension vscode/hermes-bubbles-theme-0.0.1.vsix
```

---

## 📚 文档

索引见 [`docs/README.md`](./docs/README.md)。`docs/reports/` 下是各阶段实现与审计记录，属于当时快照；`docs/hermes-*.md` 是给宿主的反馈类文档。

---

## 📄 License

MIT License © 2026 AproXin
