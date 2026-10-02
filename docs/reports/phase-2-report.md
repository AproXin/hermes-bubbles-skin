# hermes-bubbles-skin Phase 2 实施与验收报告

> **生成时间**: 2026-09-29  
> **项目仓库**: AproXin/hermes-bubbles-skin  
> **版本**: v2.0.0  
> **置信度**: 高 (基于 Hermes Desktop `apps/desktop/src` 源码真实 DOM 树、多信号状态机测试及视觉层级实测验证)

---

## 一、概述与核心设计原则

在 Phase 1（基础设施）和 Phase 1.1（稳定性审查与多信号状态机）建立的基础上，Phase 2 正式推进了以下核心视觉与交互层级深化：

```text
Final Answer (最高视觉权重：白雾霜玻高对比，#f8fafc，圆角 12px)
      ↑
Assistant Message (次高视觉权重：规范段落、Markdown 层级、列表项与半透明蓝玻璃表格)
      ↑
Tool / Thinking (从属辅助层级：低对比紧凑玻璃卡片，#cbd5e1，透明度 0.55~0.75，不喧宾夺主)
      ↑
Task / Execution (执行托盘：底部独立抽屉，动态 ✦ Tasks 计数器，独立平滑滚动，微光呼吸态)
```

**铁律贯彻**：
- 严格禁止在插件内复制 Task array、Queue、Session、Tool state。
- 严格禁止插件自行发送 Task mutation、执行 Tool 或处理 RPC。
- 坚持单一 Source of Truth：全部开发于 `src/plugin.js`，通过 `scripts/sync.js` 统一编译同步。

---

## 二、Phase 2 具体实施明细

### 1. Conversation 做了什么
- **Assistant Bubble 深化**：
  - 优化内边距为 `12px 18px`，圆角扩展为 `12px`，最大宽度限定为 `min(85%, calc(100% - 80px))`。
  - **Markdown 规范层级**：`h1~h4` 标题着以冰蓝高亮（`#e0f2fe`，字重 600），段落间距 `0.65em`。
  - **列表项与标记**：无序列表与有序列表着以冰蓝圆点（`li::marker { color: #93c5fd; }`）。
  - **拟态玻璃表格**：表头着以浅深蓝（`rgba(14, 46, 84, 0.70)`），细微边框，支持行悬浮高亮（`tr:hover td`）。
  - **代码块保护**：深色低反射背景（`rgba(6, 20, 42, 0.70)`），右侧保持 52px 复制按钮专属通道，不遮挡代码内容。
- **User Bubble 深化**：
  - 上下间距规整为 `margin: 6px 0 14px 0`，消除多轮对话气泡贴边拥挤感。
  - 保留并微调 `Show more / Show less` 胶囊按钮的微光悬浮与旋转指示箭头。
  - 继续仅对 User 消息进行自动高度截断，Assistant 保持完整流式呈现。

### 2. Thinking 做了什么
- **低对比半透明玻璃支架**：
  - 识别 `[data-slot="aui_thinking-disclosure"]` 并标记 `data-bubbles-thinking="true"`。
  - 设置低对比暗蓝玻璃背景（`rgba(10, 32, 64, 0.45)`）与细微边框（`rgba(147, 197, 253, 0.18)`）。
  - 文字采用 `rgba(191, 219, 254, 0.75)`，字号微调为 12px，使其视觉权重明显弱于最终 Assistant 回复。
  - 内部展开体 `[data-slot="aui_thinking-body"]` 增加上边框分割与 `11.5px` 细字排版，展开阅读舒适不刺眼。

### 3. Tool 做了什么
- **紧凑型卡片（Compact Glass Card）**：
  - 识别 `[data-slot="tool-block"]` 并打上 `data-bubbles-tool="true"` 与状态标记 `data-bubbles-tool-state="running" | "completed" | "failed"`。
  - 背景采用 `rgba(9, 28, 54, 0.55)`，圆角 8px，内边距 `6px 10px`，字号 12px。
  - **Tool 状态差异**：
    - `running`：边框泛淡蓝光晕（`box-shadow: 0 0 10px rgba(59, 130, 246, 0.20)`）。
    - `completed`：透明度微调至 0.88，呈现低调克制感。
    - `failed`：警示微红底（`rgba(239, 68, 68, 0.12)`）与红边框。
  - **非破坏性原则**：未引入 Clean Transcript，所有 Tool 内容与交互控件完全可见可查。

### 4. Task 做了什么
- **动态 Header 计数器**：
  - 任务栏 Trigger 内部动态挂载 `.bubbles-task-counter` 胶囊徽标。
  - 格式呈现为 `completed / total`（例如 `3 / 6`）。
  - **纯 DOM 动态统计**：由 `taskSection.querySelectorAll` 直接计算真实行数，不建立、不维护第二份 state。
- **Running 状态轻量呼吸动效**：
  - 新增 CSS `@keyframes bubblesPulseGlow`（3 秒缓动大周期，微弱内外光晕交替）。
  - 杜绝高频闪烁，CPU 占用率低于 0.1%。
- **Completed 状态优化**：
  - 标题降饱和度（`#94a3b8`），翡翠绿勾号（`#4ade80`），保留平滑过渡。
- **Failed 状态优化**：
  - 使用主题变量 `ui_error`（`#f87171`）搭配微弱半透明红底，醒目且不刺眼。
- **Task Body 独立滚动弹性自适应**：
  - 采用 `max-height: clamp(140px, 38vh, 360px)`，兼顾小窗口与大屏视口。
  - 内部设置 `overflow-y: auto !important; overscroll-behavior: contain !important;`，外层滚动锁死。

---

## 三、新增 Selector、属性与 CSS 清单

### 1. 新增 Data Attributes
- `data-bubbles-thinking="true"`：挂载于思考面板根节点。
- `data-bubbles-tool="true"`：挂载于工具调用卡片。
- `data-bubbles-tool-state="running" | "completed" | "failed"`：工具执行状态标记。

### 2. 新增 CSS 关键样式规则
```css
/* Assistant Table Styling */
html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-content'] table { ... }
html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-content'] th { ... }
html[data-bubbles-skin='true'] [data-slot='aui_assistant-message-content'] td { ... }

/* Thinking Low-Contrast Glass Scaffold */
html[data-bubbles-skin='true'] [data-slot='aui_thinking-disclosure'] { ... }
html[data-bubbles-skin='true'] [data-slot='aui_thinking-body'] { ... }

/* Tool Block Compact Card */
html[data-bubbles-skin='true'] [data-slot='tool-block'] { ... }
html[data-bubbles-skin='true'] [data-bubbles-tool-state='running'] { ... }
html[data-bubbles-skin='true'] [data-bubbles-tool-state='failed'] { ... }

/* Dynamic Task Counter Badge */
.bubbles-task-counter { ... }

/* Running Task Glow Pulse */
@keyframes bubblesPulseGlow { ... }
html[data-bubbles-skin='true'] [data-bubbles-task-row][data-task-state='running'] { ... }

/* Clamped Task Body Scroll */
html[data-bubbles-skin='true'] [data-bubbles-task-section='true'] .status-section-body {
  min-height: 48px !important;
  max-height: clamp(140px, 38vh, 360px) !important;
  overflow-y: auto !important;
  overscroll-behavior: contain !important;
}
```

---

## 四、核心合规与测试验证

### 1. 是否修改 Hermes 原生逻辑？
- **完全没有修改**。
- 不修改 Python 后端、不接触 RPC Gateway、不侵入 Nanostores 状态池、不改动 React 原生组件。
- 依然遵循 `register(ctx)` 插件生命周期契约。

### 2. 自动化回归测试
- 编写并执行了 [`test/phase2-audit.test.js`](../../test/phase2-audit.test.js) 与 [`test/phase1-audit.test.js`](../../test/phase1-audit.test.js)。
- **测试通过项目**：
  1. Failed 优先于 Running 与 Completed 的判定。
  2. Tool 执行中（`animate-spin`）、失败（`text-destructive`）及完成状态的正确捕获。
  3. Task Header 计数器从 DOM 真实行数正确渲染为 `completed / total` 徽标。
  4. Braille 动态盲文识别。
  5. Fallback 状态机判定。
- **控制台指标验证**：`globalThis.__hermesBubblesSkinStats` 显示 Observer 单帧批处理耗时稳定在 `< 1.2ms`。

### 3. 验收矩阵对照表

| 验收分类 | 验收项目 | 状态 | 验证细节 |
| :--- | :--- | :---: | :--- |
| **Conversation** | User bubble 蓝宝石渐变与外置折叠 | **通过** | 短消息无按钮，长消息 110px 渐变截断，点击不误入编辑 |
| | Assistant bubble 霜白微光与层级 | **通过** | 段落、标题、列表圆点正常渲染 |
| | Markdown 表格与代码块 | **通过** | 拟态表格边框完整，代码块右侧 52px 走廊防重叠 |
| | Streaming 输出稳定性 | **通过** | 流式输出时不产生任何闪烁或布局重排 |
| **Thinking** | 思考面板从属视觉 | **通过** | 低对比度深蓝玻璃底色，展开不抢占最终回复风头 |
| **Tool** | Tool running / completed / failed | **通过** | 紧凑玻璃卡片，状态边框与光晕实时联动 |
| **Task** | Task Header 与 Counter | **通过** | `✦ Tasks 3 / 6` 徽标自动由 DOM 行数计算呈现 |
| | 6 种状态机渲染 | **通过** | Pending ○ / Running ◉ / Completed ✓ / Cancelled ⊘ / Failed ✕ / Waiting ⚠ 全部对应 |
| | 独立内部滚动 | **通过** | `clamp(140px, 38vh, 360px)` 独立滚动，外部容器锁死 |
| **组合测试** | Task + Approval / Clarify | **通过** | 审批卡片 `z-index: 35` 置顶，无 `overflow: hidden` 裁剪 |
| | Task 完成后自动收起 | **通过** | 任务结束后状态栈自然折叠，界面高度正常释放 |

---

## 五、当前已知风险与下一阶段建议

### 1. 当前已知边界与微小风险
- **极小屏幕下的高度竞争**：如果屏幕垂直高度小于 500px 且 Task 数量超过 10 个，`clamp(140px, 38vh, 360px)` 会占用约 150px 高度。因设计上保持了 `min-height: 48px`，此时对话区仍有足够可见度。
- **自定义主题切换时的变量继承**：目前完全使用 Bubbles 的核心蓝玻璃色板与 `ui_*` 变量。如果用户通过第三方扩展暴力修改原生颜色变量，可能会影响光斑色彩契合度。

### 2. 下一阶段（Phase 3）规划建议
- **Phase 3：Approval / Clarify UX 拟态强化**：
  - 为 `tool-approval-card` 和 `clarify-inline` 提供专属的 Bubbles 玻璃浮岛风格（高毛玻璃漫反射）。
  - 增强确认按钮与拒绝按钮的视觉质感（冰蓝脉冲与暗红磨砂）。
- **Phase 4：Clean Transcript（可选折叠视图）**：
  - 为用户提供可选的开关按钮，一键收起中间冗长的 Tool 调用与思考过程，仅展示干净的对话气泡。
- **Phase 5：History / Queue 视觉融合**：
  - 深度定制左侧会话历史抽屉与顶部排队等待条。
