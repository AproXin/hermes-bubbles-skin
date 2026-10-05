# processParentTools 拆分交底（已完成）

来源：一次代码质量评审指出 `processParentTools` 圈复杂度 58 / 244 行，建议按「识别→分组→降级→嵌套修复」拆 4 个函数，并称"行为已由三个套件覆盖，重构安全"。
评审给的行数**实测正确**：`src/plugin.source.js:671-914`，正好 244 行；调用点只有一个（`:667`）；直接调用它的套件确为 5 个（`phase4-audit`、`phase4-1-audit`、`phase5a-1-audit`、`phase5b-1-audit`、`tool-flattening`）。

但**"重构安全"这个结论我不接受**，两条契约属性没有任何断言兜着（见 §2）。本文件给出：实测边界、必须先补的钉、不许变的对外契约、验收配方。

## 1. 实测边界：是 6 段，不是 4 段

评审给的「降级 / 嵌套修复」在代码里不是独立阶段。按读到的实际结构：

| 段 | 行 | 干什么 | 外部依赖 | 现在谁在测 |
| --- | --- | --- | --- | --- |
| A 分区 | 672-724 | 顺序扫 `tools`，`detectToolState` + `isExpandable`（看 `button[aria-expanded]`）判定可分组；连续兄弟归一 run；不可分组者**释放**三条分组属性 | `detectToolState`、`nextElementSibling`（要跳过已存在的 `.bubbles-tool-group`） | `tool-flattening` Test 12（summary-only 不包裹）、`phase4-audit` |
| B run 解析 | 726-732 | 每 run 取 `getToolGroupId` → `TOOL_GROUP_NS + id` 存储键 → `safeGetStorage` 展开态 | `getToolGroupId`、三个 storage helper | `tool-group-id-stability`（id 跨重建/重载稳定） |
| C header 工厂 | 734-821 | 造 header/toggle/chevron/icon/label，**并在里面装 click 处理器**：改 `data-group-state`、把同组成员的 `data-bubbles-group-collapsed` 全部翻转、聚焦安全（活动焦点在组内则把焦点交回 toggle）、驱动原生 disclosure `click()`、写/清存储 | `document.createElement`、`stats.toolGroupRefreshes += 1`、`getToolTitle`、闭包捕获 `toggleBtn` | `phase4-1-audit` Test 4（聚焦安全）、`final-ux-audit` 维度 4 |
| D header 身份与文案 | 823-855 | 写 `data-group-id` / `data-storage-key` / `data-group-state` / `data-tool-count`；单工具用标题、多工具用 `N tools completed`，并据此开关 icon 的 `display` | `getToolTitle` | `data-tool-count` 有 CSS(2)+测试(4)、`data-group-state` CSS(1)+测试(5) |
| E 重复原生 header 标记 | 857-871 | `run.length === 1` 给原生头盖 `data-bubbles-duplicate-header`，多工具则逐个摘掉 | `querySelector('header, [data-slot="tool-row"], .group\\/disclosure-row, …')` | `tool-flattening` Test 7/8、`tool-flatten-layers`、`transcript-expanded-frame` |
| F 成员打标 + 原生对账 | 873-904 | 每条 tool 写 `in-group` / `tool-flat` / `group-id` / `group-collapsed`；展开态时把原生 disclosure 点开（只开不关） | 同上选择器 | `data-bubbles-group-collapsed` CSS(5)+测试(6) |
| G 孤儿子清理 | 907-913 | `parent.querySelectorAll(':scope > .bubbles-tool-group')` 里不在本轮 `activeHeaders` 的一律 `remove()` | `:scope >` 依赖假 DOM 的 scope 传递（`test/lib/mock-dom.js`） | 隐式：`cleanup-parity`、`phase5a-1` 的重复渲染幂等 |

## 2. 动刀之前必须先钉的两条（这是"重构安全"的真实缺口）

| 属性 | 写 | 读 | 断言 |
| --- | --- | --- | --- |
| `data-bubbles-group-id` | `:824`（header）、`:882`（每条 tool） | `:775` 点击处理器靠它 `[data-bubbles-group-id="…"]` 找回同组成员 | **0**（`grep -rl data-bubbles-group-id test/*.js` 无结果） |
| `data-bubbles-tool-group` | `:739` | `:1710` observer 用它排除自造节点 | **0** |

拆 C 段时最典型的失误就是把这两条写漏或写成不同值：前者会让折叠只影响被点的那一条（症状：折叠时其他工具不动），后者会让 observer 把自己的 header 当新内容反复处理（症状：无限刷新或重复打标）。**两者现有套件全绿。** 所以第一条 PR 应该是给它们各加一条断言（写在 `phase4-audit` 或 `tool-flattening` 里都行），再加两条负控制：把值改掉 → 断言必须变红。

## 3. 不许变的对外契约

- 签名 `processParentTools(parent, tools)` 与调用点 `:667`（沙箱套件按这个名字和参数表提取函数体，改名或加参 = 5 个套件同时红）。
- 函数体必须仍以 `function processParentTools(...) { … }` 形式出现在**列零**收尾（`test/harness-integrity.test.js` 钉的是"提取出来的体花括号平衡"；里面出现行首 `}` 会静默截断）。
- `TOOL_GROUP_NS` 前缀与存储键拼法；`safeGetStorage/Set/Remove` 三个 helper 的调用点。
- `stats.toolGroupRefreshes` **只在真正新建 header 时** +1（`:820`，在 `if` 里面）。重复渲染不增长是 `phase5a-1-audit`「Streaming Idempotence」的判据；把它挪到循环外会立刻红。
- A 段释放路径里的三条 `removeAttribute` 与 `dupHeader` 摘除，顺序无关但不可省。
- `h.remove()`（`:911`）删的是**皮肤自己造的** header，属于本项目允许的自清理；不要把这条当"违反不删 DOM 节点"顺手改掉，也不要把 `removeAttribute` 换成删节点。
- 终端区域一行不碰；`customCSS` 与 `PLUGIN_CSS` 的分工不变（本次是 JS 结构重构，样式表不该有任何字节变化——`git diff src/plugin.css` 应为空）。

## 4. 风险最高的一刀

C 段的 click 处理器是闭包密集区：它捕获 `toggleBtn`，运行时又用 `toggleBtn.closest('.bubbles-tool-group')` 反查 header，再读 `data-group-id`、`data-storage-key`。抽成独立函数时最容易掉的是**聚焦安全**（`document.activeElement` 在组内 → `toggleBtn.focus()`）和**原生 disclosure 同步**（只驱动 `aria-expanded` 不一致的那些，且要 `typeof nt.click === 'function'` 护住假 DOM）。这两条分别由 `phase4-1-audit` Test 4 与 `tool-flattening` Test 10 钉着——抽之前先单独跑它们，抽之后仍然要它们绿。

## 5. 建议顺序（每步都能独立验收、独立回滚）

1. 补 §2 两条断言 + 两条负控制（纯测试，零运行时风险）。
2. 抽 G 孤儿子清理（参数最少、`parent` 与 `activeHeaders` 进得来）。
3. 抽 F 成员打标（纯属性写，快照最容易对齐）。
4. 抽 D header 身份与文案。
5. 抽 E 重复原生 header 标记。
6. 抽 A 分区（返回 `runs`）。
7. 最后抽 C header 工厂——`buildToolGroupHeader()` 只负责造与装，处理器留在原地或整体外提都要单独一个提交。

不建议一次把 4 段全抽完再测。

## 6. 验收配方（每条都要贴原始输出）

```bash
node scripts/run-tests.js            # 期望：55 passed / 0 failed / 0 skipped
node test/assertion-census.test.js   # 期望：105/105，只许降
node test/css-important-ratchet.test.js  # 期望：787/787，只许降
node scripts/build.js && git diff --exit-code src/plugin.css   # 样式表零变化
```

外加一条**打标快照对齐**（本交底的核心验收，因为它能抓住 §2 那两条无断言属性）：

拆分 PR 的**第一个提交**就交一份采集脚本 `scripts/snapshot-tool-groups.js`，复用现成的
`test/lib/plugin-sandbox.js`（按名字提取函数体）与 `test/lib/mock-dom.js`（假 DOM），构造三条
连续 completed 工具 + 一条 running + 一条 summary-only，调 `processParentTools(parent, tools)`，
然后打印每张表的 JSON：

```jsonc
{ "headers": [{ "class": "bubbles-tool-group",
                "attrs": { "data-group-id": "...", "data-storage-key": "hermes-bubbles-skin:tool-group:...",
                           "data-group-state": "collapsed", "data-tool-count": "3",
                           "data-bubbles-tool-group": "true" },
                "children": ["button.bubbles-tool-group-toggle[aria-expanded=false] > span×3"] }],
  "tools":   [{ "data-tool-call-id": "a",
                "attrs": { "data-bubbles-in-group": "true", "data-bubbles-tool-flat": "true",
                           "data-bubbles-group-id": "...", "data-bubbles-group-collapsed": "true" } },
               { "data-tool-call-id": "running-one", "attrs": { /* 三条分组属性必须缺席 */ } } ] }
```

把这份 JSON 存成基线，之后**每抽一段就跑一次**，与上一份逐字段对齐；不一致就是回归，除非能指出哪条
断言证明它本就该变。它同时是 §2 两条断言的替代品之外的第二层保险：属性名、值、出现位置都能对。

## 7. 完成后交回

结果 + 证据（两次全量输出、快照 diff、§2 新断言的文件:行）一并附在本卡末尾；不要顺手改动评审原文，也不要动终端相关规则。
