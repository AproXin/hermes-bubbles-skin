# hermes-bubbles-skin Phase 4.1: Tool Collapse 专项审计与稳定性加固报告

**版本**: `4.1.0`  
**核心任务**: Tool Collapse 动态生命周期、身份稳定性 (Group Identity) 及焦点安全 (Focus Safety) 专项深度审计  
**状态**: ✅ 审计完成，全量回归测试 100% 绿灯 (36 / 36 断言全绿)  
**置信度**: 高 (Confidence: High)

---

## 1. Group Identity（身份稳定性设计与实现）

### 实际采用的 Identity 策略
在 Phase 4.1 审计中，我们对原先临时包含 `run.length` 与动态标题的 Group ID 方案进行了重构加固，彻底消除 DOM 重绘、索引漂移与文本微变导致的 Identity 丢失风险：

1. **优先利用 Hermes 原生稳定属性**:
   优先提取首个工具节点（`run[0]`）的原生 ID：
   ```javascript
   const explicitId = toolBlock.getAttribute('data-tool-call-id') ||
                      toolBlock.getAttribute('data-call-id') ||
                      toolBlock.getAttribute('data-tool-id') ||
                      toolBlock.id;
   ```
2. **确定性锚点打标 (Anchor Stamping Fallback)**:
   若原生未挂载显式 tool-id，则在首个工具节点上一次性注入稳定的确定性锚点：
   ```javascript
   toolBlock.setAttribute('data-bubbles-tool-anchor-id', anchorId);
   ```
3. **最终 Group ID 构成**:
   ```text
   grp_<messageId>_<anchorId>
   ```
   - **完全解耦**: 不依赖 `run.length`（当 Tool B、Tool C 陆续追加完成时，`run[0]` 锚点保持恒定，Group ID 绝不变异）。
   - **不依赖 DOM Index**: 列表中插入新段落或前置元素时，ID 不变。
   - **不依赖动态文本/标题**: 工具内容更新或代码高亮重绘时，ID 不变。

---

## 2. Dynamic Lifecycle（动态工具生命周期的实际流转结果）

模拟多步骤流式交互链路：
```text
Tool A running
      ↓
Tool A completed
      ↓
Tool B running
      ↓
Tool B completed
      ↓
Tool C running
      ↓
Tool C completed
```

### 实际执行与渲染表现：
1. **阶段 1 (Tool A running)**:
   - Tool A 处于运行态，呈现亮蓝脉冲呼吸蓝光与动态 Spinner；
   - **不创建 Group Header，绝不提前折叠正在运行的 Tool**。
2. **阶段 2 (Tool A completed)**:
   - Tool A 完成，创建 Group Header（`▸ Read package.json` 或 `▸ 1 tool completed`）；
   - Tool A 标记为 `data-bubbles-group-collapsed="true"`，平滑收敛。
3. **阶段 3 (Tool B running)**:
   - Group Header 维持 1 个，Tool B 在后方以运行态展开展示，互不干扰；
   - 绝不将正在运行的 Tool B 提前吸入折叠组。
4. **阶段 4 (Tool B completed)**:
   - 复用现有 Group Header，无重复 Header 创建；
   - 标签平滑升级为 `2 tools completed`，Tool B 加入折叠队列。
5. **阶段 5 & 6 (Tool C running → completed)**:
   - Tool C 运行完毕后无缝汇入，**最终结果准确收敛为单个 `▸ 3 tools completed`**。
   - 彻底避免了拆碎成 `▸ Tool A`、`▸ Tool B`、`▸ Tool C` 3 个重复 Header 的垃圾布局。

---

## 3. Focus Safety（焦点安全机制）

### 问题机理
当用户使用全键盘导航（Tab 键）聚焦在 Tool 内部的可交互元素（如命令复制按钮、外部链接或输入框）时，若此时该 Tool 被用户折叠：
由于 CSS 使用了 `[data-bubbles-group-collapsed='true'] { display: none !important; }`，浏览器原生机制会将焦点重置到 `document.body`，导致键盘焦点直接丢失，破坏无障碍连续操作。

### 加固策略与实现
在折叠事件执行前，动态探查当前活跃焦点（`document.activeElement`）：
```javascript
// Focus Safety: 若当前活跃焦点位于即将折叠隐藏的工具内部，平滑将焦点转移到 summary 折叠按钮
if (!nextExpanded && typeof document !== 'undefined' && document.activeElement) {
  const hasFocusInside = Array.from(groupedTools).some(tool => {
    return typeof tool.contains === 'function' 
      ? tool.contains(document.activeElement) 
      : tool === document.activeElement;
  });
  if (hasFocusInside && typeof toggleBtn.focus === 'function') {
    toggleBtn.focus();
  }
}
```
- **测试验证**: 焦点从内部元素无缝安全转移至 Summary Toggle Button，用户可立即通过 `Space` / `Enter` 再次展开，或通过 `Tab` 继续向下导航，**零焦点丢失 (Zero Focus Trap)**。

---

## 4. Persistence（持久化与重渲染保全）

1. **重渲染保全验证**:
   - 用户展开 Group (`▾ 3 tools completed`)；
   - 界面触发 DOM 重渲染（如新 Token 到达、样式刷新、前置段落插入）；
   - 由于 Group ID 基于首个工具的稳定 Anchor，Storage Key 完全一致；
   - 重绘后自动从存储（或内存会话表）恢复 `data-group-state="expanded"` 与 `data-bubbles-group-collapsed="false"`，**展开状态完好保留，杜绝闪烁或意外自动收起**。
2. **Storage 异常降级**:
   - 模拟 `localStorage` 抛出 `QuotaExceededError` 或处于不可用环境；
   - `safeGetStorage` / `safeSetStorage` 内部通过 `try/catch` 静默兜底，自动切换为内存缓存，**UI 与工具折叠交互 100% 顺畅，零控制台报错**。

---

## 5. Boundary（严格边界隔离）

| 组合场景 | 实际处理边界 | 预期与实测结果 |
| :--- | :--- | :---: |
| **`completed Tool` + `running Tool`** | 仅 completed Tool 进入折叠组，running Tool 独立展开显示 | ✅ `▸ completed group` + `◉ running Tool` |
| **`completed Tool` + `failed Tool`** | 失败工具为硬边界，不得被吸进折叠组，维持红底错误高亮 | ✅ `▸ completed group` + `✕ failed Tool` |
| **`completed Tool` + `Task` + `completed Tool`** | 底部 Task 面板与对话流物理隔离，Task 前后工具绝不跨越合并 | ✅ 严格分裂为 2 个独立工具折叠组 |
| **`completed Tool` + `Paragraph (p)` + `completed Tool`** | 文本段落为语义硬边界，切断连续性 | ✅ 严格分裂为 2 个独立工具折叠组 |

---

## 6. Regression（全量测试回归汇总）

在 Node.js 运行时执行包含最新专项审计在内的全部 6 大测试套件：

```bash
cd /Users/yuanxxx/.gemini/antigravity/scratch/hermes-bubbles-skin && node test/phase4-1-audit.test.js && node test/phase4-audit.test.js && node test/phase3-1-audit.test.js && node test/phase3-audit.test.js && node test/phase2-audit.test.js && node test/phase1-audit.test.js
```

### 断言通过明细：
- **Phase 4.1 专项审计套件 (`phase4-1-audit.test.js`)**: **6 / 6 全部通过**
  - [Test 1] Tool Group Identity 跨重绘稳定度
  - [Test 2] 动态生命周期增量汇聚为 `3 tools completed`
  - [Test 3] 折叠/展开循环无损性（零 DOM 销毁、零文本改写）
  - [Test 4] 焦点安全转移保护（Focus Safety）
  - [Test 5] 跨重绘展开状态持久化与异常回退
  - [Test 6] 运行态/失败态/Task 严格隔离边界
- **Phase 4 基础功能套件 (`phase4-audit.test.js`)**: **7 / 7 全部通过**
- **Phase 3.1 六大 Surface 集成套件 (`phase3-1-audit.test.js`)**: **6 / 6 全部通过**
- **Phase 3 Approval/Clarify 套件 (`phase3-audit.test.js`)**: **5 / 5 全部通过**
- **Phase 2 状态优先级套件 (`phase2-audit.test.js`)**: **5 / 5 全部通过**
- **Phase 1.1 状态识别容错套件 (`phase1-audit.test.js`)**: **7 / 7 全部通过**

**全量总断言数**: **36 / 36 绿灯通过（通过率 100%）**。

---

## 七、总结与后续推进建议

通过 Phase 4.1 的专项加固，Tool Collapse 功能现已具备工业级稳定性：
1. **身份恒定**: 不受流式输出及重渲染影响；
2. **生命周期自然**: 增量工具无缝汇聚，不重叠 Header；
3. **无障碍焦点安全**: 全键盘操作流转自然，不丢焦点；
4. **完全可追溯**: 原始 Tool DOM 100% 留存，Debug 与日常阅读随心切换。

Tool Collapse 阶段已具备彻底收官的充分技术支撑。
