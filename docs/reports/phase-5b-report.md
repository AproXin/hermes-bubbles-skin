# Hermes Bubbles Skin — Phase 5B Audit Report
**History / Session Preview Visual Layer Audit**

- **Date**: 2026-09-29
- **Build ID**: `5.1.0`
- **Scope**: Floating Session Preview Card, Native DOM-based Data Extraction, Hover & Keyboard Focus Interactions, Virtualizer Recycling Safety, Full Regression Across Phases 1–5B
- **Status**: ✅ **PASSED (100% Green, 55 Total Regression Assertions Across All 9 Suites)**

---

## 一、审计背景与架构原则

Phase 5A 与 Phase 5A.1 确立了 Session History 侧边栏的精细化毛玻璃视觉与切换隔离性。
本阶段（Phase 5B）围绕 **Session Preview** 展开，遵循以下严苛设计守则：

```text
Hermes 原生
  = Session / History / Message 数据与导航生命周期

Bubbles Plugin
  = 单例浮层容器、DOM 文本抽取与被动事件委托

Bubbles CSS
  = 霜白蓝宝石毛玻璃（Frosted Sapphire Glass）与层次排版
```

### 核心约束执行确认：
1. **零自建数据层**：不自建 Session manager、不引入 Session cache、不建立离线/历史数据库；
2. **零网络/RPC 扩展**：不调用任何私有 API 或新增后端 RPC，完全利用 Hermes Desktop 已渲染的 DOM 信息；
3. **纯文本截断（No AI Summary）**：严格遵循 `trim() -> truncate() -> ellipsis`，不引入假想的 AI 摘要生成器；
4. **无可靠信息则不显示（Clean Omission）**：若非当前活跃会话无法获取到助手回答或任务计数，直接略过对应区块，不显示空占位符或假数据；
5. **事件零拦截（Transparent & Non-Invasive）**：浮动卡片设置 `pointer-events: none`，原生点击、键盘回车、重命名、归档等交互丝毫不受干预；
6. **防裁切单例架构**：针对 TanStack Virtualizer 侧边栏容器的 `overflow-x: hidden`，采用挂载在 `document.body` 的单例 `#bubbles-session-preview`，通过 `getBoundingClientRect()` 动态定位，彻底解决局部绝对定位被裁切的问题。

---

## 二、架构实现细节

### 1. 单例浮动容器与视口自适应定位 (`positionPreview`)
侧边栏在窄屏或展开时，浮动卡片通过计算目标行的视口坐标进行绝对定位，并具备视口边界检测能力：
```javascript
function positionPreview(rowEl) {
  const rect = rowEl.getBoundingClientRect()
  const padding = 12
  let left = rect.right + padding
  let top = rect.top

  // 视口右边界防溢出回退（若右侧空间不足则贴在左侧或内缩）
  if (left + 360 > window.innerWidth) {
    left = Math.max(12, rect.left - 360 - padding)
  }
  // 视口底部防溢出
  if (top + 280 > window.innerHeight) {
    top = Math.max(12, window.innerHeight - 280 - 12)
  }

  previewEl.style.left = `${Math.round(left)}px`
  previewEl.style.top = `${Math.round(top)}px`
}
```

### 2. 多源回退数据提取器 (`extractSessionRowPreviewData`)
提取逻辑严格优先从当前行内已渲染的原生节点读取：
* **Session Title**: 提取 `[data-slot="sidebar-row-title"]`、`h3/h4/span` 或行首文本；
* **Timestamp / Metadata**: 提取 `time`、`[data-slot="sidebar-row-time"]` 或副文本；
* **User & Assistant Snippet**:
  * 若为**当前活跃会话**，从主聊天窗口 `aui_user-message-root` 与 `aui_assistant-message-root` 抓取最新真实上下文；
  * 若为**非活跃会话**，从行内副文本（如 `.truncate`、`[data-slot="sidebar-row-preview"]`）提取原生摘要；
* **Task / Tool Stats**: 仅当存在真实计数（如 `.bubbles-task-counter` 或 `.bubbles-group-label`）时才输出徽章。

### 3. 事件委托机制与生命周期完整性
* 使用全局 `document` 级别的被动捕获监听：`pointerover`、`pointerout`、`focusin`、`focusout`、`keydown` (Escape 键快速隐去)；
* 虚拟滚动条在快速复用 DOM 节点时，绝不在单个 row 上挂载/卸载 listener，彻底规避内存泄漏；
* 插件卸载或重载时，`cleanupSessionPreview()` 完整移除全局监听并从 `document.body` 中卸载 `#bubbles-session-preview`。

---

## 三、CSS 视觉规范 (`PLUGIN_CSS` 8.5)

```css
/* Session Preview Floating Card (Phase 5B) */
.bubbles-session-preview {
  position: fixed;
  z-index: 60;
  width: 320px;
  max-width: calc(100vw - 32px);
  pointer-events: none;
  border-radius: 12px;
  background: var(--bubbles-glass-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--bubbles-border);
  box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.35),
              0 0 0 1px var(--bubbles-border-light),
              0 0 20px -4px rgba(56, 189, 248, 0.12);
  padding: 12px 14px;
  transition: opacity 160ms cubic-bezier(0.16, 1, 0.3, 1),
              transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
}

.bubbles-session-preview[data-visible="false"] {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
  visibility: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .bubbles-session-preview {
    transition: none !important;
  }
}
```

---

## 四、自动化测试套件验证 (`test/phase5b-audit.test.js`)

针对 Phase 5B 编写了 7 个维度的专项自动化测试，均通过模拟真实 DOM 交互完成断言：

| 测试用例编号 | 测试领域 | 验证目标 | 结果 |
| :--- | :--- | :--- | :--- |
| **Test 1** | **基础提取与展示** | 提取 Title、User 消息摘要、Assistant 消息摘要与时间戳，验证卡片渲染内容 | ✅ PASS |
| **Test 2** | **关闭与隐藏防线** | 验证 `hidePreview()` 以及按下 `Escape` 键能立即隐藏预览浮层 | ✅ PASS |
| **Test 3** | **无障碍键盘导航** | 验证通过 Tab 键 `focusin` 聚焦侧边栏条目时展示预览，`focusout` 时收起 | ✅ PASS |
| **Test 4** | **虚拟列表重挂载** | 模拟虚拟滚动 `unmount -> remount`，验证单例浮层不会脱节且正常复用 | ✅ PASS |
| **Test 5** | **跨会话数据隔离** | 验证 Session A 与 Session B 对应悬停时预览内容完全独立，绝不混淆或继承 | ✅ PASS |
| **Test 6** | **零侵入与生命周期** | 验证原生点击事件无阻碍派发，`cleanupAll()` 完全销毁浮层与解除监听 | ✅ PASS |
| **Test 7** | **CSS 与辅助功能** | 验证单例 `pointer-events: none`、`backdrop-filter` 霜雾玻璃与 `reduced-motion` 规则 | ✅ PASS |

---

## 五、全量回归矩阵（Phases 1.1 ~ 5B 完整 9 轮套件）

执行指令：
```bash
node test/phase1-audit.test.js && \
node test/phase2-audit.test.js && \
node test/phase3-audit.test.js && \
node test/phase3-1-audit.test.js && \
node test/phase4-audit.test.js && \
node test/phase4-1-audit.test.js && \
node test/phase5a-audit.test.js && \
node test/phase5a-1-audit.test.js && \
node test/phase5b-audit.test.js
```

### 回归汇总：
* **Phase 1.1** (7 个断言): Task 状态识别与容错 ✅
* **Phase 2** (5 个断言): Conversation & Task 动态状态感知 ✅
* **Phase 3** (5 个断言): Approval & Clarify 视觉增强与零篡改 ✅
* **Phase 3.1** (6 个断言): 完整 Agent 流六大 Surface 级联排版与层级堆叠 ✅
* **Phase 4** (7 个断言): Clean Transcript 工具折叠与聚合 ✅
* **Phase 4.1** (6 个断言): 动态工具生命周期、身份标识与焦点防丢失 ✅
* **Phase 5A** (6 个断言): History / Session 侧边栏高亮与毛玻璃增强 ✅
* **Phase 5A.1** (6 个断言): 会话切换状态彻底隔离与虚拟滚动安全 ✅
* **Phase 5B** (7 个断言): History / Session 浮动预览卡片与零侵入提取 ✅

**总计 55 个断言全部通过，0 失败，0 告警。**

---

## 六、交付物与产物同步

1. **核心逻辑源文件**: [`src/plugin.js`](../../src/plugin.js)（`BUILD_ID = '5.1.0'`）
2. **分发打包目标**:
   - [`plugin.js`](../../plugin.js)
   - `desktop/plugin.js`
   - 用户本机 Hermes Desktop 运行时目录：`~/.hermes/desktop-plugins/hermes-bubbles-skin/`
3. **专属测试套件**: [`test/phase5b-audit.test.js`](../../test/phase5b-audit.test.js)
4. **同步工具**: [`scripts/sync.js`](../../scripts/sync.js)
