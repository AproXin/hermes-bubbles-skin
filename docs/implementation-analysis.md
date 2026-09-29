# hermes-bubbles-skin 第一阶段技术实现分析

> **分析时间**: 2026-09-28  
> **置信度**: 高 (基于 Hermes Desktop `apps/desktop/src` 源码真实 DOM 树及 `FPSUnleashed/hermes-codex-skin` v1.8.1 生产实现比对)

---

## 1. 当前项目结构与现状

### 1.1 `hermes-bubbles-skin` 现状
```text
hermes-bubbles-skin/
├── LICENSE
├── README.md
├── assets/                 # 预览截图
├── bubbles.yaml            # 纯静态皮肤定义（包含 colors + 463 行 customCSS，约 26KB）
└── vscode/                 # 配套 VS Code 颜色主题
```

**现状判定**：
- 目前仅通过 `~/.hermes/skins/bubbles.yaml` 提供静态 CSS 覆盖，不存在任何 JavaScript 入口、Plugin 配置或 DOM 增强运行时。
- 纯 CSS 面临局限：
  1. 无法实现超长用户消息的动态计算与可折叠展开（`Show more / Show less`）。
  2. 无法智能识别 Task 状态并重构执行列表的独立滚动与精细徽标渲染。
  3. 无法针对 Hermes 动态重渲染、流式输出、分步执行进行安全的生命周期监听与状态更新。

### 1.2 Hermes Desktop 插件机制与架构
根据 Hermes 桌面端运行时加载器源码（`apps/desktop/src/contrib/runtime-loader.ts`）及插件规范：
- 桌面插件物理路径入口为：`~/.hermes/desktop-plugins/<id>/plugin.js`。
- 采用标准 ESM 格式，由 Electron 在 Renderer 进程动态导入（经 live shim map 重写 `@hermes/plugin-sdk`、`react`、`react/jsx-runtime`）。
- 模块必须 `export default` 一个 `HermesPlugin` 对象：
  ```javascript
  export default {
    id: 'hermes-bubbles-skin',
    name: 'Bubbles Skin',
    register(ctx) {
      // ctx.storage (get/set/remove)
      // ctx.onDispose(fn)
      // ctx.setTimeout / ctx.setInterval / ctx.addEventListener
    }
  }
  ```
- 桌面端具备自热更机制（File Watcher 监控 `plugin.js`），支持即时卸载与重新注册，无需频繁重启应用。

---

## 2. Hermes UI 相关真实 DOM 树解析

通过对 Hermes Desktop 源码（`apps/desktop/src`）的关键组件进行审计，提取出真实渲染结构：

### 2.1 用户消息 (User Message)
- 源码位置：`src/components/assistant-ui/thread/user-message.tsx`
- 结构特征：
  ```html
  <div data-role="user" data-slot="aui_user-message-root" class="group/user-message sticky ...">
    <div data-slot="aui_user-bubble-actions" class="relative w-full max-w-full">
      <div class="human-message-with-todos-wrapper flex w-full flex-col gap-0">
        <div data-context-menu-skip class="relative w-full">
          <!-- 气泡外壳（只读或编辑模式为 button） -->
          <button class="composer-human-message standalone-glass relative ...">
            <div class="sticky-human-clamp" data-clamped="true">
              <div class="min-h-[1.25rem]">
                <div class="wrap-anywhere ..."><p>User Prompt Text</p></div>
              </div>
            </div>
          </button>
          <!-- 终止/恢复检查点悬浮操作层 -->
          <div class="pointer-events-none absolute right-2 bottom-2 ...">
            <button aria-label="Stop / Restore" class="pointer-events-auto ...">...</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  ```

### 2.2 助手消息 (Assistant Message)
- 源码位置：`src/components/assistant-ui/thread/assistant-message.tsx`
- 结构特征：
  ```html
  <div data-role="assistant" data-slot="aui_assistant-message-root" class="group flex w-full ...">
    <div data-slot="aui_assistant-message-content" class="wrap-anywhere ...">
      <!-- Markdown 渲染内容 (p, pre, code, ul, ol, table) -->
      <!-- Tool 调用卡片、Artifacts、Status Slot -->
    </div>
    <!-- 时间戳与底部工具栏 -->
  </div>
  ```

### 2.3 状态栈与任务栏 (Composer Status Stack & Tasks)
- 源码位置：`src/app/chat/composer/status-stack/index.tsx` & `status-row.tsx` & `status-section.tsx`
- 结构特征：
  ```html
  <div data-slot="composer-status-stack" class="flex max-h-[40vh] min-h-0 flex-col overflow-hidden">
    <div class="... rounded-b-none border-b border-b-transparent">
      <div data-slot="status-stack-scroll" class="min-h-0 overflow-y-auto overscroll-y-contain">
        <div data-slot="status-stack-content">
          <!-- 每个分组对应一个 status-stack-section -->
          <div data-slot="status-stack-section">
            <div data-slot="status-section">
              <!-- 折叠触发头 -->
              <div class="status-section-header flex items-center ...">
                <button class="status-section-trigger flex min-w-0 flex-1 items-center ...">
                  <!-- 折叠箭头 (DisclosureCaret) -->
                  <svg class="shrink-0" ...></svg>
                  <!-- 分组图标：Task/Todo 使用 checklist 图标 -->
                  <span class="status-section-icon"><i class="codicon codicon-checklist"></i></span>
                  <!-- 分组标题：如 "待办事项 (3/6)" 或 "Todos (3/6)" -->
                  <span class="min-w-0 truncate">待办事项 (3/6)</span>
                  <!-- 运行中指示器 (GlyphSpinner braille) -->
                </button>
              </div>
              <!-- 展开体：包含任务项列表 -->
              <div class="status-section-body">
                <!-- 每一个任务项 -->
                <div data-slot="status-row" class="status-row ...">
                  <div class="status-row-dismiss">...</div>
                  <div class="status-row-icon">
                    <!-- 状态图标：
                         pending: StatusPendingIcon (未完成圆圈/虚线圈)
                         running: GlyphSpinner (Braille 旋转字符)
                         completed: i.codicon.codicon-pass-filled
                         cancelled: i.codicon.codicon-circle-slash
                         failed: .bg-destructive 或 .codicon-error
                    -->
                  </div>
                  <div class="status-row-content">
                    <span class="truncate">任务标题内容</span>
                  </div>
                  <div class="status-row-actions">...</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  ```

### 2.4 人工审核与澄清交互 (Approval & Clarify)
- 澄清卡片：`[data-slot="clarify-inline"]`
- 工具授权确认：`[data-slot="tool-approval-inline"]` / `[data-slot="tool-approval-card"]` / `[data-slot="tool-approval-actions"]`
- 原则：属于原生交互表单，**严禁将其识别为普通文本并折叠，严禁改变其原生事件阻断逻辑**。

---

## 3. Codex Skin 与 Bubbles 的 Selector 对比矩阵

| 目标区域 / 节点 | Codex Skin 使用的 Selector | Bubbles 可直接复用的 Selector | 差异与处理方式 |
| :--- | :--- | :--- | :--- |
| **插件作用域根节点** | `html[data-codex-chat-look='true']` | `html[data-bubbles-skin='true']` | 命名空间替换为 `data-bubbles-skin`，互不干扰 |
| **用户消息根节点** | `[data-slot="aui_user-message-root"]` | `[data-slot="aui_user-message-root"]` | 完全一致，直接复用 |
| **用户气泡本体** | `.composer-human-message` | `.composer-human-message` | 完全一致，保留 Bubbles 的蓝宝石渐变玻璃 |
| **用户文本折叠容器** | `.sticky-human-clamp` | `.sticky-human-clamp` | 完全一致，利用此容器截断超长内容 |
| **展开/收起按钮** | `[data-codex-user-expand]` | `[data-bubbles-user-expand]` | 自建 Bubbles 风格微光收缩按钮 |
| **AI 消息根节点** | `[data-slot="aui_assistant-message-root"]` | `[data-slot="aui_assistant-message-root"]` | 完全一致，直接复用 |
| **AI 消息内容容器** | `[data-slot="aui_assistant-message-content"]` | `[data-slot="aui_assistant-message-content"]` | 完全一致，保留 Bubbles 白雾霜玻样式 |
| **输入框状态托盘** | `[data-slot="composer-status-stack"]` | `[data-slot="composer-status-stack"]` | 完全一致，直接复用 |
| **状态托盘滚动层** | `[data-slot="status-stack-scroll"]` | `[data-slot="status-stack-scroll"]` | 完全一致，用于精确滚动控制 |
| **任务专属 Section** | 通过 `.codicon-checklist` 动态识别 | 匹配 `.codicon-checklist` 对应 section | 完全一致，通过 DOM 检测后打上 `data-bubbles-task-section="true"` 标记 |
| **任务状态行** | `[data-slot="status-row"]` | `[data-slot="status-row"]` | 完全一致，用于状态识别与样式重构 |
| **澄清与审批组件** | `[data-slot="clarify-inline"]`, `[data-slot="tool-approval-inline"]` | 同左 | 必须作为免处理白名单加入 MutationObserver 过滤 |

---

## 4. 不确定性与潜在兼容性风险

### 4.1 潜在风险一：原生 `.sticky-human-clamp` 的高度争抢
- **现象**：Hermes 原生 `user-message.tsx` 自带了对长 prompt 的 ResizeObserver 与软渐变逻辑（第 300~320 行）。
- **对策**：Codex 采用清空原生 clamp 软渐变遮罩（`mask-image: none !important`），并在 JS 中以 4 行高度（约 110px）为阈值进行显式高度控制；Bubbles 应采用相同策略，当未折叠时不干预高度，折叠时使用 `max-height: 110px; overflow: hidden;`，并确保 `Show more` 按钮可正向切换。

### 4.2 潜在风险二：Status Stack 内部嵌套滚动穿透
- **现象**：原生状态托盘中外层 `[data-slot="status-stack-scroll"]` 默认有 `overflow-y: auto`。若 Task 项展开且过长，外层与内层同时滚动会导致滚轮打滑或跳动。
- **对策**：当识别到 Task Section 存在并展开时：
  - 给 `[data-slot="composer-status-stack"]` 标记 `data-bubbles-has-task-section="true"`。
  - 将外层 scroll 容器锁为 `overflow: hidden !important`。
  - 仅给 Task 列表的 body（`.status-section-body`）赋予 `overflow-y: auto !important; max-height: 38vh; overscroll-behavior: contain;`，实现精准单容器独立平滑滚动。

### 4.3 潜在风险三：MutationObserver 循环触发与性能损耗
- **现象**：在 Observer 回调中修改 DOM（添加标记 attribute 或追加展开按钮）若不加以限制，将触发下一轮 Observer 回调导致主线程卡死。
- **对策**：
  1. 细粒度过滤：只监听 `childList` 以及相关的关键属性（`data-clamped`, `data-streaming`, `role`），过滤非关键 DOM 变动（如输入框实时打字）。
  2. 状态幂等标记：在操作前检查 `hasAttribute`，仅当未处理或状态改变时执行变更。
  3. `requestAnimationFrame` 调度节流：所有 DOM 增强任务归并到一个 microtask / animationFrame 执行批次中。

---

## 5. 第一阶段需要新增与调整的文件清单

```text
hermes-bubbles-skin/
├── docs/
│   └── implementation-analysis.md    # [新增] 本技术分析规范文档
├── desktop/
│   └── plugin.js                     # [新增] 核心 Desktop Plugin 运行时入口
├── plugin.yaml                       # [新增] 桌面插件元数据定义
├── bubbles.yaml                      # [保留/调整] 静态皮肤定义，与 plugin.js 协调解耦
└── README.md                         # [更新] 文档补充桌面插件安装与启用指引
```

- **安装部署联动**：
  在用户的开发与调试环境中，将 `desktop/plugin.js` 及 `plugin.yaml` 软链接或部署至 `~/.hermes/desktop-plugins/hermes-bubbles-skin/`，Hermes Desktop 即刻热加载运行！
