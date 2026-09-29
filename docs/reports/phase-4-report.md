# hermes-bubbles-skin Phase 4 Clean Transcript & Tool Collapse 执行报告

**版本**: `4.0.0`  
**核心特性**: Clean Transcript / Tool Collapse (折叠聚合，绝不抹除)  
**状态**: ✅ 已完成并全量回归通过 (30 / 30 测试全绿)  
**置信度**: 高 (Confidence: High)

---

## 一、核心原则：“Collapse, Never Delete” 的工程落地

在 Phase 4 中，严格贯彻 **“只折叠，不删除 (Collapse, Never Delete)”** 的核心架构原则：

- ❌ **绝对严禁**:
  - `display: none` 永久移除 Tool。
  - `tool.remove()` 或从 DOM 树中剔除 Tool 节点。
  - `cloneNode()` 复制 Tool 节点破坏事件绑定与 React/assistant-ui 引用。
- ✅ **真实落地实现**:
  - 所有原始 Tool DOM 节点（`[data-slot="tool-block"]`）**100% 完整保留在其原生父节点与相对顺序中**。
  - 折叠仅通过声明式属性 `data-bubbles-group-collapsed="true"` 配合 CSS 规则驱动渲染隐藏。
  - 展开时切换为 `data-bubbles-group-collapsed="false"`，原汁原味地向用户展示工具调用的完整参数、执行日志、错误堆栈和交互按钮。

---

## 二、Tool 状态机与视觉分级

对 `data-bubbles-tool-state` 的四种状态进行严格分级与行为控制：

| 状态 | 识别依据 | 视觉表现 | 折叠/聚合行为 |
| :--- | :--- | :--- | :--- |
| **`running`** | `.animate-spin`、`[data-spinner]`、Braille 动态字符 | 亮蓝外框 + 柔和脉冲呼吸蓝光 (`bubblesPulseGlow`) | **绝不收起！** 保持完全展开，直至执行结束。作为分组的自然边界。 |
| **`completed`** | 静止无报错内容、已完成图标、无 destructive 类名 | 半透明磨砂玻璃卡片 (`opacity: 0.88`) | **默认聚合折叠**。单工具折叠为胶囊，多工具聚合成总览栏。 |
| **`failed`** | `.text-destructive`、`.codicon-error`、错误退出码 | 柔和红底警示 (`rgba(239, 68, 68, 0.15)`) + 红色微光外框 | **绝不折叠！** 维持高可见性，确保报错细节与堆栈第一视线可见。 |
| **`unknown`** | 未能明确分类的 tool block | 默认常规卡片 | 维持展开，避免误吞异常信息。 |

---

## 三、连续聚合与折叠展开逻辑 (Grouping Engine)

### 1. 单个 Tool 折叠
- 折叠时：`▸ Read package.json`（自动提取工具标题/首行指令；如无标题则显示 `▸ 1 tool completed`）。
- 点击展开：`▾ Read package.json`，下方紧跟带有层次缩进的完整 Tool 原始卡片。

### 2. 多个连续已完成 Tool 聚合
- 折叠时：`▸ 3 tools completed`。
- 点击展开：
  ```text
  ▾ 3 tools completed
     ✓ Read package.json   (原始 DOM 卡片)
     ✓ Search components   (原始 DOM 卡片)
     ✓ Edit plugin.js      (原始 DOM 卡片)
  ```
- 展开后的子工具卡片带有 `margin-left: 12px !important; border-left: 2px solid rgba(96, 165, 250, 0.45) !important;` 树状层级线，逻辑清晰。

### 3. 分组边界保护 (Boundary Protection)
分组引擎仅处理**同一个父容器内、连续紧邻**的已完成 Tool。分组在以下情况自动切断，绝不跨边界穿透：
- 遇到正在运行的 Tool (`running`) 或报错的 Tool (`failed`)。
- 遇到非 Tool 的 DOM 节点（如 Markdown 段落 `p`、思考折叠框 `aui_thinking-disclosure`、代码块 `pre` 等）。
- 跨 Assistant Message、User Message 或 Task 面板。

---

## 四、UI 规范与视觉权重

完全融入 Bubbles 蓝宝石磨砂玻璃设计规范：
- **Summary 胶囊按钮 (`.bubbles-tool-group-toggle`)**:
  - 背景：`rgba(10, 32, 64, 0.65)` 配合 `backdrop-filter: blur(10px)`。
  - 边框：冰蓝细边框 `1px solid rgba(147, 197, 253, 0.28)`。
  - 旋转箭头：展开/折叠动态顺时针旋转 90 度（`-45deg` → `45deg`）。
  - 成功徽标：绿色对勾 `✓`（`#4ade80`）。
- **层级位置**:
  - 高于普通背景层；
  - 显著低于 Assistant 气泡文本与 Final Answer（高信噪比，避免干扰用户阅读结论）。

---

## 五、状态持久化机制 (Persistence with Fallback)

1. **唯一 Key 标识**:
   基于父消息 ID、第一个工具标题及工具数量动态生成稳定哈希 Key：
   ```text
   hermes-bubbles-skin:tool-group:grp_<msgId>_<toolTitle>_<count>
   ```
2. **容错保障**:
   - 读写全程置于 `try/catch` 守卫中。
   - 若本地存储因隐私模式、容量受限（`QuotaExceededError`）或被禁用而报错，静默降级为内存会话状态，**100% 不影响 Tool 正常执行与界面响应**。

---

## 六、流式输出 (Streaming) 与 Observer 防抖保护

针对 `Tool running` → `Tool completed` 动态流式过程进行了严格加固：
1. **零重复创建**:
   在每个 `requestAnimationFrame` 批处理周期内，引擎自动复用并就地更新已有的 `.bubbles-tool-group` 容器，直接将标签文字平滑刷新（如从 `2 tools completed` 变为 `3 tools completed`），无 DOM 闪烁。
2. **Observer 过滤隔离**:
   `setupObserver` 明确将 `.bubbles-tool-group`、`.bubbles-tool-group-toggle` 列入 ignore 黑名单，新增或更新 Header 时绝不会再次触发 Observer 回调，**彻底根除死循环重绘**。

---

## 七、全量自动化回归测试结果

全套 5 个自动化测试套件执行结果如下：

```bash
node test/phase4-audit.test.js && node test/phase3-1-audit.test.js && node test/phase3-audit.test.js && node test/phase2-audit.test.js && node test/phase1-audit.test.js
```

### 终端测试断言输出：
```text
=== Phase 4 Clean Transcript & Tool Collapse Audit Suite ===
[Test 1] Single Completed Tool: Collapses to single tool pill, clicking expands full content
  ✓ Passed
[Test 2] Multiple Consecutive Completed Tools: Aggregated into "3 tools completed"
  ✓ Passed
[Test 3] Running Tool & Failed Tool Isolation: Neither is collapsed into completed group
  ✓ Passed
[Test 4] Boundary Protection: Non-tool elements (p, task, thinking) partition completed groups
  ✓ Passed
[Test 5] Streaming Transition: Active tool finishes and joins completed group smoothly
  ✓ Passed
[Test 6] Persistence: State preserved across reloads and safe fallback on storage error
  ✓ Passed
[Test 7] Accessibility: Keyboard focus-visible & Reduced-Motion coverage
  ✓ Passed
=== All Phase 4 Test Assertions Passed Successfully ===

=== Phase 3.1 Six Surfaces Integration Audit ===
[Test 1] Complete Flow: User -> Assistant -> Thinking -> Tool -> Task -> Approval -> Final Answer
  ✓ Passed
[Test 2] Task + Tool Coexistence: Independent state detection and zero cross-leakage
  ✓ Passed
[Test 3] Stacking Hierarchy: Approval (z:50) > Clarify (z:40) > Task Dock (z:30) > Conversation (z:auto)
  ✓ Passed
[Test 4] Responsive Defenses: clamp() for ultra-short windows & break-word/overflow-x for narrow screens
  ✓ Passed
[Test 5] Accessibility: Keyboard focus outlines & Reduced-Motion multi-surface coverage
  ✓ Passed
[Test 6] Streaming Idempotence: Repeated batch executions do not bloat stats or re-stamp attributes
  ✓ Passed
=== All Phase 3.1 Test Assertions Passed Successfully ===

=== Phase 3 Regression Tests ===
[Test 1] Approval Recognition: Detects stack and card, stamps data attribute without DOM alteration
  ✓ Passed
[Test 2] Clarify Recognition: Detects clarify-inline and choice form, stamps data attribute
  ✓ Passed
[Test 3] Task + Approval Coexistence: Both stamped independently without cross-contamination
  ✓ Passed
[Test 4] CSS Architecture: Verifies z-index layering, reduced-motion, and focus-visible
  ✓ Passed
[Test 5] Safety Check: Confirms no event listeners or clones are added in Approval/Clarify functions
  ✓ Passed
=== All Phase 3 Test Assertions Passed Successfully ===

=== Phase 2 Regression Tests ===
[Test 1] Task State Priority: Failed beats Running & Completed
  ✓ Passed
[Test 2] Tool State: Active spinning tool detected as running
  ✓ Passed
[Test 3] Tool State: Error tool block detected as failed
  ✓ Passed
[Test 4] Tool State: Quiet tool block detected as completed
  ✓ Passed
[Test 5] Dynamic Task Header: Injects counter pill from actual DOM row counts
  ✓ Passed
=== All Phase 2 Test Assertions Passed Successfully ===

--- Phase 1.1 Stability Tests ---
[Test 1] Task State: Failed over Completed priority
  ✓ Passed
[Test 2] Task State: Braille spinner identifies "running"
  ✓ Passed
[Test 3] Task State: animate-spin fallback identifies "running"
  ✓ Passed
[Test 4] Task State: Warning / Paused identifies "waiting"
  ✓ Passed
[Test 5] Task State: Checkmark identifies "completed"
  ✓ Passed
[Test 6] Task State: Circle slash identifies "cancelled"
  ✓ Passed
[Test 7] Task State: Default SVG fallback identifies "pending"
  ✓ Passed
--- All 7 Unit Assertions Passed Successfully ---
```

**测试通过率**: **100% (30 / 30 全部断言全绿通过)**。

---

## 八、为什么现在不建议做 History（架构与定位剖析）

当前 Bubbles 已经建立起极清晰且优雅的信息权重链条：
```text
            用户问题 (User Prompt)
                     ↓
          Final Answer (最高对比度与白雾霜玻)
                     ↓
       Assistant 正文 (清晰 Markdown 排版)
                     ↓
    Thinking / Tool 聚合折叠 (▸ 3 tools completed)
                     ↓
         Task 执行列表 (底部 dock 独立滚动)
                     ↓
      Approval / Clarify (按需浮动置顶)
```

此时引入侧边栏式的 **History Rail / Preview**，极容易造成两大弊端：
1. **定位冲突**: 会将一个纯粹轻盈的 **“Agent Conversation UI”** 强行膨胀为类似重度 IDE 的项目管理控制台，稀释 Bubbles 的毛玻璃沉浸质感。
2. **状态负担**: Hermes Desktop 原生已有完整的会话切换机制。强行在插件层自建会话索引、拉取历史 transcript 与状态缓存，会破坏现有的轻量化、无侵入架构原则。

因此，当前以 Phase 4 的 Clean Transcript 作为核心体验的收官点，达成：
> **“平时阅读安静通透，Agent 工作时清晰可见，需要审批时交互顺滑，排查 Debug 时数据完整不丢”** 的最佳平衡态。
