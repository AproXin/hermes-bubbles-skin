# Hermes 任务面板存活期反馈：轮次结束即卸载，长任务反而看不到进度

对象：Hermes Desktop（`~/.hermes/hermes-agent/apps/desktop/src`）
来源：hermes-bubbles-skin 的并发压测验收；下列行号均已在该检出上逐条核对。

## 现象

一次 8 步并发任务（含后台进程、预期失败项）中，Composer 上方的任务面板只有约 **0.5 秒**
就消失了；另一次正常跑完的 8 步任务，面板存活 **104 秒**并实时推进 `任务 0/8 → 7/8`。
皮肤侧无任何删除/隐藏行为：两次运行的现场探针显示面板元素由宿主自行挂载与卸载；在第二次
（存活 104 秒）那次里，插件标记 `data-bubbles-task-section` 在挂载后的下一帧即打上
（`stamped:false → true`，8 行全部处理，`taskRefreshes 24 → 40`），说明渲染侧接手正常。

也就是说：**面板是被宿主自己卸载的**，且卸载时机恰好发生在最需要看进度的那一类运行上。

## 机制（源码）

| 位置 | 行为 |
| --- | --- |
| `store/todos.ts:22` | `todoListActive(todos)`：只要还有 pending / in_progress 项即为"活动" |
| `store/todos.ts:70` | `FINISHED_LINGER_MS = 4_000` |
| `store/todos.ts:111-112` | **仅当列表不再活动**（全部完成/取消）才安排 4 秒后丢弃 |
| `store/todos.ts:146-154` | `clearActiveSessionTodos`：轮次结束时若列表**仍是活动的**（说明本轮没写最终 `todo` 更新），**立即** `dropSessionTodos`，无任何 linger |
| `store/todos.ts:63-64` | `todosForHydration`：从历史恢复时，活动列表一律不重钉（返回 null），只有已完成列表可恢复 |
| `status-stack/index.tsx:310,316` | `visible = sections.length > 0`；为空时组件 `return null` → 面板元素**不进 DOM** |
| `gateway-event/tools.ts:26`、`use-message-stream/index.ts:508` | 唯一的注入口：`todo.updated` → `setSessionTodos` |

结论：**"轮次结束 + 仍有未完成项" = 面板瞬间消失**。而并发/长任务恰恰最容易命中这一条件
（模型在跑工具时不会每步都补 `todo` 更新，或某一轮提前结束），于是越是需要进度可见的运行，
面板越看不见。恢复路径（`todosForHydration`）也不会把它带回来。

## 为什么这对皮肤层无解

插件只能改 CSS 与加监听，不重建 DOM 节点（本项目硬约束）。宿主 `return null` 之后，
`[data-slot='composer-status-stack']` 与其父级 `.status-drawer-content` 里没有任何可样式化的目标。

## 建议方案（按侵入性从小到大）

1. **给活动列表一个短 linger**：`clearActiveSessionTodos` 改为复用
   `clearTimers.schedule(sid, FINISHED_LINGER_MS, ...)`，与完成列表同等对待。
   改动约 3 行，风险低；至少让用户看清"停在哪一步"。
2. **区分"本轮结束"与"任务作废"**：轮次结束但仍有 in_progress 项时，保留列表并置为
   可折叠的"未完成（本轮结束）"态，而不是清空。语义上与 `todos.ts:140-144` 注释里担心的
   "面板永远钉在 Composer 上方"并不冲突——折叠即可。
3. **让 `todo.updated` 在轮次边界补一次快照**：若最终 `todo` 更新缺失，由宿主以当前
   in_progress 状态发一次 `todo.updated`，使 `todoListActive` 判定与用户所见一致。

## 复现

1. 让 Agent 先登记 8 步待办列表，然后并发派发（其中放一个 `sleep 20` 后台任务、一个必然失败的域名请求）。
2. 观察 Composer 上方任务面板：本轮结束（或某步提前返回）后，面板在 1 秒内消失。
3. 对照实验：同一列表全部正常完成后，面板按 `FINISHED_LINGER_MS` 停留 4 秒。

## 现场数据（可直接引用）

```
# 运行一（空转的一轮）：挂载 514.6ms 后被卸载
[stack] {"t":759.6, "mounted":true, "sections":1,"stamped":0}
[stack] {"t":1274.2,"mounted":false,"sections":0,"stamped":0}

# 运行二（正常推进的一轮）：存活 104.5s，皮肤在下一帧接手
[stack] {"t":1759.6,"mounted":true, "sections":1,"stamped":0}
[stack] {"t":1864.1,"mounted":false,"sections":0,"stamped":0}
[panel] {"mounted":true,"checklist":true,"rows":8,"stamped":true,"task":32}
[panel] {"mounted":true,"checklist":true,"rows":8,"stamped":true,"task":40,"header":"任务 7/8"}
```
