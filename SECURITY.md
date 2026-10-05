# Security Policy

## 支持的版本

只有 `main` 分支上的最新代码会收到修复。本仓不往任何包管理器发版，`main` 就是最新版。

## 上报漏洞

**请不要开公开 issue。** 请使用 GitHub 的私密漏洞上报通道：

1. 打开本仓库的 **Security** 标签页
2. 点 **Report a vulnerability**
3. 写清楚：影响面、复现步骤、你判断的严重度

我们会尽快回复，并在确认后的修复版本里致谢（如果你希望匿名，请说明）。

> 如果上述通道用不了，可以先开一个**不含任何细节**的 issue，只说"想私下联系"，我们再约渠道。

## 影响面评估的起点：这个项目到底是什么

本仓只有两样东西，**都不联网**。

| 部分 | 形态 | 运行位置 |
| --- | --- | --- |
| 皮肤 | `bubbles.yaml` 里的 `customCSS`（纯 CSS，32 KiB 上限） | 由 Hermes 注入为一个 `<style>` 元素 |
| 桌面插件 | `plugin.js`（单个 JS 文件，无依赖） | 在 Hermes 桌面应用的渲染进程里执行 |

插件的边界，是可以逐条复核的成文事实：

- **不发起任何网络请求。** `src/plugin.source.js` 中不存在 `fetch` / `XMLHttpRequest` / `WebSocket` / `EventSource` / `navigator.sendBeacon` / 动态 `import()`，也不含任何 `http://` 或 `https://` 字面量。可自行复核：
  ```bash
  grep -cE 'fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|import\(|https?://' src/plugin.source.js
  ```
  期望输出：`0`
- **只做两类事**：读改页面的 DOM 与样式；把界面状态存在本机。
  - DOM 侧用到的是 `document.querySelector` / `createElement` / `addEventListener` / `MutationObserver` / `requestAnimationFrame`
  - 存储侧只写宿主的 `pluginStorage` 与 `localStorage`，键名带 `hermes-bubbles-skin:` 命名空间前缀
- **不删除任何 DOM 节点**，只改样式、加监听；不注入新脚本，不提升权限，不读取与界面无关的数据。

## 不在范围内

- **Hermes Agent 自身的漏洞** —— 请上报给上游 [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)，它有自己的 `SECURITY.md` 与上报流程。本仓无法修复宿主侧问题。
- **第三方依赖的漏洞**（Tailwind、xterm 等）—— 请上报给对应项目。
- **纯观感问题**（颜色、间距、字形不对）—— 走普通 issue 即可，不必走私密通道。

## 本仓如何保护自己

- 全量验证套件在 **CI 与本地 pre-push 双门禁**下运行：**0 失败且 0 跳过**才算通过——跳过被严格视为失败，防止"看着绿其实是跳过了量像素的套件"。
- CI 以**最小权限**运行（`permissions: contents: read`）：只读仓库、跑测试，不写入仓库、不上传产物、不在 PR 上留言。
- CI **不使用任何仓库密钥**（workflow 中不存在 `secrets.*` 引用）。
- 仓库以 MIT 许可发布，完整条款见 [`LICENSE`](./LICENSE)。
