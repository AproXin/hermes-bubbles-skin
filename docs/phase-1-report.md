# hermes-bubbles-skin 第一阶段落地实现报告

> **生成时间**: 2026-09-29  
> **项目仓库**: AproXin/hermes-bubbles-skin  
> **置信度**: 高 (基于 Hermes Desktop `apps/desktop/src` 源码真实 DOM 树及 `codex-chat-look` v1.8.1 生产实现比对验证)

---

## 一、项目背景与设计原则

本阶段任务目标是在现有 `AproXin/hermes-bubbles-skin` 基础上，参考 `FPSUnleashed/hermes-codex-skin` 的实现思想，为 Bubbles Skin 增加真正的 Desktop Plugin 能力。

### 1. 核心架构原则：职责严格分离
在实现过程中严格遵循“Hermes 管业务与状态，Plugin 管 DOM 识别与增强，CSS 管视觉渲染”的单一职责原则：

```text
                 Hermes Desktop
                       │
          ┌────────────┴────────────┐
          │                         │
       数据/状态                 原生行为
  (Task / Queue / Session)  (Tool / Approval / Clarify)
          │                         │
          └────────────┬────────────┘
                       ↓
               Bubbles Plugin (DOM)
                       │
             ┌─────────┴─────────┐
             │                   │
         DOM 状态识别        DOM 结构增强
             │                   │
             └─────────┬─────────┘
                       ↓
               Bubbles Skin (CSS)
                       │
     ┌─────────────────┼─────────────────┐
     ↓                 ↓                 ↓
Conversation         Tasks           Approval
  (气泡/折叠)       (染色/独立滚动)   (置顶/免干预)
```

### 2. 明确的范围边界
第一阶段聚焦且仅聚焦于：
1. **Conversation / 对话框**（气泡形态与长文本智能折叠）
2. **Task / 任务执行 UI**（状态染色与独立滚动容器）

明确**不包含**且**不修改**：
- 不做 History rail 与 History preview
- 不做 Clean transcript（隐藏工具调用）
- 不自行实现 Queue / Session / Task 数据层与存储
- 不修改 Hermes 后端与 RPC 通信逻辑
- 不篡改 Approval / Clarify 原生表单与业务事件

---

## 二、修改与新增文件清单

| 文件路径 | 变更类型 | 核心职责说明 |
| :--- | :--- | :--- |
| [`docs/implementation-analysis.md`](file:///Users/yuanxxx/.gemini/antigravity/scratch/hermes-bubbles-skin/docs/implementation-analysis.md) | **新增** | 技术分析与 DOM 选择器规范文档，包含 Hermes 真实 DOM 树、Codex 选择器比对与兼容性风险矩阵。 |
| [`plugin.js`](file:///Users/yuanxxx/.gemini/antigravity/scratch/hermes-bubbles-skin/plugin.js) | **新增** | 核心桌面插件运行时代码（ESM 标准模块），包含 Conversation 增强、长消息折叠、Task 状态检测与防抖 MutationObserver。 |
| [`desktop/plugin.js`](file:///Users/yuanxxx/.gemini/antigravity/scratch/hermes-bubbles-skin/desktop/plugin.js) | **新增** | 遵循 Hermes 统一扩展包规范的双重入口镜像，保证多目录结构自适配。 |
| [`plugin.yaml`](file:///Users/yuanxxx/.gemini/antigravity/scratch/hermes-bubbles-skin/plugin.yaml) | **新增** | 桌面插件元数据清单（ID: `hermes-bubbles-skin`，Version: `0.1.0`）。 |
| [`README.md`](file:///Users/yuanxxx/.gemini/antigravity/scratch/hermes-bubbles-skin/README.md) | **修改** | 补充桌面端动态增强插件特性与一键安装 / 启用文档。 |
| [`docs/phase-1-report.md`](file:///Users/yuanxxx/.gemini/antigravity/scratch/hermes-bubbles-skin/docs/phase-1-report.md) | **新增** | 本第一阶段落地验收与实现总结报告。 |

---

## 三、新增属性与 Selector 清单

为避免类名污染全局，遵循最高兼容性原则，所有选择器均严格限定在根作用域 `html[data-bubbles-skin='true']` 下，优先采用精准的 `[data-slot="..."]` 与规范的 `[data-bubbles-*]` 属性：

| 目标区域 / 作用 | 新增 / 复用的 Selector | 说明与用途 |
| :--- | :--- | :--- |
| **插件作用域** | `html[data-bubbles-skin='true']` | 由插件生命周期挂载至根节点，卸载时干净移除 |
| **用户消息** | `[data-slot="aui_user-message-root"]`<br>`[data-bubbles-user-message='true']` | 识别用户消息根容器，挂载 Bubbles 蓝宝石渐变与右对齐 |
| **长文本折叠** | `[data-bubbles-long-user='true']`<br>`[data-bubbles-user-expanded='true']` | 超长文本（>110px）截断状态与展开状态标记 |
| **展开按钮** | `.bubbles-user-expand-btn`<br>`.bubbles-expand-chevron` | 外置防穿透微光胶囊按钮（`Show more` / `Show less`） |
| **助手消息** | `[data-slot="aui_assistant-message-root"]`<br>`[data-bubbles-assistant-message='true']` | 识别 AI 消息根容器，挂载白雾霜玻半透明气泡 |
| **状态托盘** | `[data-slot="composer-status-stack"]`<br>`[data-bubbles-has-task-section='true']` | 识别底部状态托盘，当存在 Task 时锁定外层溢出 |
| **任务容器** | `[data-bubbles-task='true']`<br>`[data-bubbles-task-section='true']` | 动态识别出的 Todo/Task 专属卡片容器 |
| **任务行** | `[data-slot="status-row"]`<br>`[data-bubbles-task-row='true']` | 任务列表中的具体单行项 |
| **任务状态** | `[data-task-state='pending' \| 'running' \| 'completed' \| 'cancelled' \| 'failed' \| 'waiting']` | 状态机识别结果属性，用于驱动精准色彩渲染 |
| **任务滚动体** | `.status-section-body`<br>`[data-bubbles-task-scroll='true']` | 限制 `max-height: 38vh` 并独立启用平滑滚动 |
| **审批与澄清** | `[data-slot='clarify-inline']`<br>`[data-slot='tool-approval-inline']` | 白名单保护区域，确保 `z-index: 30` 且不被覆盖或截断 |

---

## 四、核心技术实现细节

### 1. Task 是如何识别的？
- **背景依据**：Hermes 原生前端 `ComposerStatusStack` 中待办事项分组固定采用 Codicon 图标 `.codicon-checklist`。
- **定位方式**：`findTaskSection()` 在 `[data-slot="composer-status-stack"]` 内检索包含 `.codicon-checklist` 的 `[data-slot="status-section"]`，准确定位原生 Task Section 节点。
- **状态感知**：`detectTaskState(row)` 检查任务项图标容器 `.status-row-icon` 的真实子节点：
  - 含有 `.codicon-pass-filled` $\rightarrow$ `completed`
  - 含有 `.codicon-circle-slash` $\rightarrow$ `cancelled`
  - 含有 Braille 盲文动态字符 `[\u2800-\u28FF]` 或 `.animate-spin` $\rightarrow$ `running`
  - 含有 `.codicon-error` 或 `.text-destructive` $\rightarrow$ `failed`
  - 含有 `.codicon-warning` 或 `.codicon-debug-pause` $\rightarrow$ `waiting`
  - 含有原生等待圆圈 $\rightarrow$ `pending`
- 识别后通过 `setAttribute('data-task-state', state)` 挂载，由 Bubbles CSS 完成微光与色彩渲染。

### 2. Conversation 是如何增强的？
- **User 消息**：
  - 识别 `[data-slot="aui_user-message-root"]`，挂载 `data-bubbles-user-message`。
  - 通过 `setupLongMessageCollapse` 读取 `clamp.scrollHeight` 与 `--human-msg-full`。
  - 高度超过 110px（约 4~5 行）时打上 `data-bubbles-long-user="true"`，并向操作容器注入拟态蓝胶囊按钮。
  - **防穿透机制**：按钮严格拦截 `pointerdown` / `click` 的冒泡事件，防止误触 Hermes 外层 `<ActionBarPrimitive.Edit>` 的输入编辑模式。
- **Assistant 消息**：
  - 识别 `[data-slot="aui_assistant-message-root"]`，挂载 `data-bubbles-assistant-message`。
  - 保持白雾霜玻半透明拟态效果，保留文本、代码块预留走廊、表格的排版完整性。

### 3. 是否使用 MutationObserver？
- **使用**。DOM 会因流式传输、多会话切换、异步工具调用而动态刷新，必须通过 Observer 维持状态标记。
- **死循环防护措施**：
  1. 忽略输入框（`textarea`, `input`, `[data-slot="composer-rich-input"]`）及自身折叠按钮的 DOM 变更。
  2. 属性过滤限定在 `['data-clamped', 'data-streaming', 'role']`。
  3. 状态变更检查幂等性，变更前比对属性值是否相同。
  4. 采用 `requestAnimationFrame` 统一将多个微小变更合并为单帧批处理。

### 4. 是否修改 Hermes 原生逻辑？
- **完全没有修改**。
- 不修改 Hermes Python 后端代码，不接触 RPC 管道，不修改 React 核心组件。
- 遵循生命周期协议：`export default { id, name, register(ctx) }`，卸载时在 `ctx.onDispose` 中干净回退。

---

## 五、最重要的 10 项验收标准自检回答

| # | 验收标准问题 | 审查结论与技术佐证 |
| :---: | :--- | :--- |
| **1** | **Task 数据是不是仍然来自 Hermes？** | **是**。数据完全由 Hermes 后端推送及前端 `useSessionSlice($statusItemsBySession)` 原生渲染，插件仅做 DOM 标记。 |
| **2** | **有没有复制/维护第二份 Task state？** | **没有**。代码内没有任何 Task 数组、状态缓存或本地任务队列副本。 |
| **3** | **Queue 是否仍然由 Hermes 管理？** | **是**。第一阶段未触碰 Queue 逻辑，完全保留 Hermes 原生入队与调度机制。 |
| **4** | **是否修改 Hermes 原始业务逻辑？** | **否**。无后端代码修改，前端仅通过桌面插件合法接口（`ctx` + DOM API）运行。 |
| **5** | **MutationObserver 是否可能无限触发？** | **否**。输入框事件全局静音，属性变更有白名单限制，且所有写操作前均校验状态幂等性并经过 `requestAnimationFrame` 节流。 |
| **6** | **Task 很多时是不是只有 Task body 滚动？** | **是**。外层 `[data-slot="composer-status-stack"]` 在存在任务时设置 `overflow: hidden !important`，仅 `.status-section-body` 启用独立滚动（`max-height: 38vh; overflow-y: auto; overscroll-behavior: contain;`）。 |
| **7** | **长消息是否可以展开/折叠？** | **是**。超长用户消息默认平滑截断至约 4~5 行并显示微光渐变，点击 "Show more" 可完整展开，点击 "Show less" 可收回，且不误触发编辑。 |
| **8** | **Conversation 与 Task 是否保持结构分离？** | **是**。Conversation 属于 `aui_thread-viewport` 消息流水线，Task 属于底部悬浮托盘 `composer-status-stack`，两者逻辑结构与 DOM 作用域完全解耦。 |
| **9** | **Approval / Clarify 是否仍然可以正常使用？** | **是**。已设立专用保护层，`z-index: 30` 确保置顶可见，原生点击与回传事件完全不受折叠或层级挤压影响。 |
| **10** | **禁用 Bubbles Plugin 后 Hermes 是否仍然正常工作？** | **是**。插件提供完整的 `onDispose` 清理流程，卸载时移除所有注入样式及 `data-bubbles-*` 属性，应用即刻恢复原生形态。 |

---

## 六、测试验证情况与已知边界

### 1. 测试验证覆盖
- **普通消息**：短 Prompt、短 AI 文本回复、Emoji 反应均正常显示。
- **复杂富文本**：Markdown 标题、代码块预留走廊、列表项、表格清晰通透。
- **长文本截断**：长段用户输入自动进入 110px 截断状态，展示渐变蒙层与折叠按钮；点击展开高度自适应。
- **任务状态感知**：单 Task、多 Task 状态变更（Braille 转 Completed/Failed）均能触发准确染色。
- **任务独立滚动**：大量 Task 场景下仅任务列表区域内部产生滚动条，输入框和主对话界面保持平稳。
- **生命周期**：热重载（`Cmd + R`）与插件 Dispose 均无残留与报错。

### 2. 当前已知边界（按设计第一阶段暂不包含）
- **History Rail & Preview**：按照指令第一阶段明确不予包含，将在后续阶段作为独立面板组件规划。
- **Clean Transcript**：按照指令暂不隐藏中间工具链调用过程，确保排查与调试的透明度。
- **本地生效部署**：已同步部署至本机 `~/.hermes/desktop-plugins/hermes-bubbles-skin/`，重启或刷新 Hermes 客户端即可即时体验。
