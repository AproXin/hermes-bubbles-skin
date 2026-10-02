# Hermes Bubbles Skin — Phase 5A Implementation & Audit Report
**History / Session Visual Layer (Navigation Surface Enhancement)**

- **Date**: 2026-09-29
- **Build ID**: `5.0.0`
- **Target Component**: Sidebar Session Navigation, Date Dividers, Active/Hover States
- **Status**: ✅ **PASSED (100% Green, 42 Total Regression Assertions)**

---

## 一、Phase 5A 目标与范围界定

本阶段严格围绕 **History / Session 导航层的视觉与层级增强** 展开，全面对接 Hermes Desktop 原生会话列表。

### 1. 架构守则（零越权、零侵入）
继续贯彻项目核心契约：
```text
Hermes Core  = Session / History / 路由导航状态
Bubbles Plugin = DOM 结构识别与只读元数据标记
Bubbles CSS    = 磨砂玻璃、蓝宝石光效与视觉动效
```

### 2. 绝对红线（STRICTLY FORBIDDEN）
在 Phase 5A 开发中绝对遵守以下约束：
- ❌ **不得自建 Session Manager** 或 Session List 数据缓存；
- ❌ **不得自行保存会话列表** 或维护独立的活跃状态；
- ❌ **不得修改或拦截会话切换逻辑**（`onClick` / `onPointerDown` / 路由事件）；
- ❌ **不得改动 Queue / Task 数据层** 或发起自定义 RPC；
- ❌ **暂不实施** History Preview、会话重命名/删除弹窗重写、或自定义全文检索；
- ❌ **不得破坏 TanStack Virtualizer 虚拟列表滚动**。

---

## 二、Hermes Desktop 原生组件架构深度审计

对 `~/.hermes/hermes-agent/apps/desktop/src` 源码完成端到端剖析，确认以下真实 DOM 结构与插槽：

### 1. 侧边栏容器层级 (`components/ui/sidebar.tsx` & `chrome.tsx`)
- `[data-slot="sidebar-wrapper"]`: 顶层包裹容器，声明 `--sidebar-width` (14.8125rem ~ 16rem) 与 `--sidebar-width-icon`；
- `[data-slot="sidebar"]` / `[data-sidebar="sidebar"]`: 侧边栏主面板，承载展开/收起状态与内阴影；
- `[data-slot="sidebar-inner"]`: 内部弹性盒子容器；
- `[data-slot="sidebar-content"]`: 滚动区域，带有 `scrollbar-fade`，存放各组会话列表；
- `[data-slot="sidebar-group"]`: 分组容器（Recents、Pinned、Projects 等）。

### 2. 分组分割线 (`SidebarDateDivider` in `chrome.tsx`)
- 容器结构：
  ```html
  <div class="group/workspace flex select-none items-center gap-2 px-2 pb-0.5 pt-2" data-slot="sidebar-date-divider">
    <span class="shrink-0 text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-quaternary)">
      TODAY / YESTERDAY / PREVIOUS 7 DAYS
    </span>
    <span aria-hidden="true" class="h-px min-w-4 flex-1 bg-(--ui-stroke-tertiary)"></span>
  </div>
  ```

### 3. 会话行主体 (`SidebarSessionRow` / `SidebarRowShell` in `session-row.tsx`)
- 外层 Grid 外壳：
  ```html
  <div class="group row-hover relative grid grid-cols-[minmax(0,1fr)_auto] items-stretch rounded-md [bg-(--ui-row-active-background)]"
       data-working="true"
       data-glass-opaque>
    <!-- 运行动态弧光 -->
    <span aria-hidden="true" class="arc-border arc-row"></span>

    <!-- 点击目标主体 (SidebarRowBody) -->
    <button class="row-button bg-transparent text-left z-0 flex items-center ...">
      <!-- 状态圆点 (SessionStatusDot) -->
      <span class="overflow-hidden"><span class="session-status-dot ..."></span></span>
      <!-- 标题与预览文字容器 -->
      <span class="min-w-0 flex-1 self-center">
        <span class="hover-marquee block font-normal group-hover:text-foreground">
          <span class="hover-marquee-inner">会话标题文本</span>
        </span>
      </span>
    </button>

    <!-- 操作区 (data-row-actions) -->
    <div class="relative z-2 flex shrink-0 items-center justify-end gap-1" data-row-actions>
      <span class="session-row-tail min-w-5 transition-opacity group-hover:opacity-0">
        <time dateTime="...">12m</time>
      </span>
      <button aria-label="Session actions" class="size-5 rounded-[4px] ...">
        <span class="codicon codicon-kebab-vertical"></span>
      </button>
    </div>
  </div>
  ```

### 4. 活跃会话状态识别逻辑
Hermes Desktop 在 `SidebarSessionRowImpl` 中判定：
```typescript
isSelected && 'bg-(--ui-row-active-background)'
openUnfocused && 'bg-(--ui-row-open-background)'
liveTurn && 'text-foreground' (data-working="true")
```
在 Tailwind v4 编译体系下，活跃态行直接带有 `bg-(--ui-row-active-background)` 类名。

---

## 三、Bubbles Skin Phase 5A 实现方案

### 1. 样式系统深化 (`src/plugin.js` -> `PLUGIN_CSS`)
所有样式均在 `html[data-bubbles-skin='true']` 命名空间下隔离：

1. **侧边栏磨砂玻璃底色**：
   - 背景采用高透微暗蓝玻璃：`rgba(8, 20, 38, 0.70)`，搭配 `backdrop-filter: blur(20px) saturate(1.3)`；
   - 右侧边缘带有微蓝荧光描边：`border-right: 1px solid rgba(147, 197, 253, 0.15)`。
2. **日期/分组分割线（Date Dividers）**：
   - 标题字体：优雅上浮至 `10.5px`，`color: #93c5fd`（明亮天蓝），字距加宽 `0.12em`，大写字母；
   - 分割线采用渐变流光：`linear-gradient(90deg, rgba(96, 165, 250, 0.30), rgba(147, 197, 253, 0.05))`。
3. **会话卡片与 Hover 态**：
   - 圆角柔化至 `8px`，内外边距精细对齐；
   - Hover 时平滑泛出蓝宝石微光：`rgba(30, 64, 175, 0.20)`，边框强化为 `rgba(147, 197, 253, 0.25)`，标题提升至纯白。
4. **当前活跃会话（Active/Selected Session）**：
   - 显著的蓝宝石光晕渐变背景：`linear-gradient(90deg, rgba(37, 99, 235, 0.32) 0%, rgba(30, 58, 138, 0.18) 100%)`；
   - **左侧 3px 蓝宝石高亮指示条**：`border-left: 3px solid #60a5fa !important`；
   - 外发光立体阴影：`box-shadow: 0 2px 10px rgba(37, 99, 235, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.12)`；
   - 标题粗细强化至 `font-weight: 500`，字色高亮为 `#ffffff`。
5. **执行中会话（Working Session）**：
   - 当检测到 `data-working="true"` 时，触发 `bubblesPulseGlow` 柔和周期性呼吸脉冲。
6. **无障碍保护（Reduced Motion & Focus）**：
   - 在 `prefers-reduced-motion: reduce` 下彻底关停呼吸脉冲与过渡动画；
   - 为操作按钮与行元素维持 `outline: 2px solid #60a5fa` 键盘聚焦标识。

### 2. 插件 DOM 增强模块 (`src/plugin.js`)
实现了轻量级无侵入增强：
- **`isRowActive(rowEl)`**:
  精准检测 `bg-(--ui-row-active-background)`、`data-selected="true"` 与 `aria-selected="true"`。
- **`enhanceSidebarSessionRow(rowEl)`**:
  - 打上 `data-bubbles-session-row="true"`；
  - 动态响应活跃状态：打上 `data-bubbles-session-active="true" | "false"`；
  - 记录 `stats.sessionRefreshes` 指标。
- **`enhanceSidebarDivider(dividerEl)`**:
  - 为日期分割线打上 `data-bubbles-session-divider="true"`。
- **`processDOM()`**:
  - 批量扫描 `.row-hover, [data-row-actions], [data-slot="sidebar-row"]` 与 `.group\/workspace`，完成属性注入。
- **`cleanupAll()`**:
  - 在插件停用或页面销毁时，彻底移除所有 `data-bubbles-session-*` 属性，保证零内存泄露。

### 3. 多端构建与同步
执行 `node scripts/sync.js` 将 `src/plugin.js` 统一编译并推送至：
- `plugin.js`（仓库根目录发行版）
- `desktop/plugin.js`（Desktop 打包版）
- `~/.hermes/desktop-plugins/hermes-bubbles-skin/`（本地 Hermes 运行目录）

---

## 四、测试与回归验证

### 1. Phase 5A 专属测试 (`test/phase5a-audit.test.js`)
6 项严密专项断言全部通过：
- **[Test 1] Session Recognition**: 正确标记并区分活跃行与非活跃行及日期分割线。
- **[Test 2] Active Session Transition**: 模拟用户会话切换，原会话立即更新为 `false`，新会话立即更新为 `true`，无残留孤儿标记。
- **[Test 3] Non-Invasive Integrity**: 验证原生 `onClick` 与 `onPointerDown` 事件监听 100% 正常响应，插件未添加任何事件劫持。
- **[Test 4] Virtualized List Idempotence**: 模拟 TanStack Virtualizer 上下滑动、节点挂载/卸载，虚拟行重新进入视图时无缝识别且不重复膨胀 DOM。
- **[Test 5] CSS Architecture**: 静态校验磨砂玻璃 backdrop-filter、3px 蓝宝石左指示条、无障碍 reduced-motion 覆盖。
- **[Test 6] Lifecycle & Zero Leak Cleanup**: 验证 `cleanupAll` 彻底清除所有会话与分割线属性。

### 2. 全阶段回归套件测试（Phase 1.1 ~ 5A）
```text
node test/phase1-audit.test.js (7 assertions)    ✓ All Passed
node test/phase2-audit.test.js (5 assertions)    ✓ All Passed
node test/phase3-audit.test.js (5 assertions)    ✓ All Passed
node test/phase3-1-audit.test.js (6 assertions)  ✓ All Passed
node test/phase4-audit.test.js (7 assertions)    ✓ All Passed
node test/phase4-1-audit.test.js (6 assertions)  ✓ All Passed
node test/phase5a-audit.test.js (6 assertions)   ✓ All Passed

Total: 42 / 42 Assertions Passed (100% Green)
```

---

## 五、结论与后续展望

Phase 5A 的落地，标志着 `hermes-bubbles-skin` 完成了从 **核心对话区 (Conversation)**、**任务执行区 (Task)**、**思维折叠 (Thinking)**、**工具聚合 (Tool Collapse)**、**审批交互 (Approval / Clarify)** 到 **全局会话导航 (History & Session Navigation)** 的全链路视觉闭环。

整个系统完全保持轻量纯粹：
- **0** 个自建数据层
- **0** 行后端代码入侵
- **100%** 兼容 Hermes 原生虚拟滚动与多 profile 隔离
- **全绿** 自动化集成审查套件
