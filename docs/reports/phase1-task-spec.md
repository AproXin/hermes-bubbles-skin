# hermes-bubbles-skin 第一阶段实现任务

> **目标**: 在现有 AproXin/hermes-bubbles-skin 基础上，参考 FPSUnleashed/hermes-codex-skin 的实现方式，为 Bubbles Skin 增加真正的 Desktop Plugin 能力。
>
> **第一阶段只聚焦两个核心**：
> - Conversation / 对话框
> - Task / 任务执行 UI
>
> **不要**重构 Hermes 本体，不要修改 Hermes 后端逻辑，不要自行实现 Task/Queue 数据层。

---

## 设计哲学（最重要的一句话）

**不要把 hermes-codex-skin 当成模板直接复制。真正应该复制的是它的设计思想：**

```
                 Hermes
                    │
           ┌────────┴────────┐
           │                 │
        数据/状态          原生行为
           │                 │
           └────────┬────────┘
                    ↓
               Bubbles Plugin
                    │
             DOM enhancement
                    │
               Bubbles CSS
                    ↓
           ┌─────────────────┐
           │ Conversation    │
           │ Task            │
           │ Approval        │
           │ Clarify         │
           └─────────────────┘
```

**Hermes 管状态，Plugin 管 DOM，CSS 管视觉。**

这会让项目后面非常容易继续扩展。

---

## 一、核心设计原则

### 1. Hermes 负责业务逻辑

**不要自己实现**：
- Task 数据管理
- Queue 数据管理
- Session 数据管理
- Tool 执行
- Approval 逻辑
- Clarify 逻辑
- 消息持久化
- 后端通信

这些全部继续使用 Hermes 原生实现。

**Bubbles Plugin 只负责**：
- DOM 识别
- DOM 标记
- UI 布局
- CSS class / data attribute
- 视觉样式
- 必要的轻量 UI 状态

### 2. 参考项目

重点参考：**FPSUnleashed/hermes-codex-skin**

尤其检查：
- `codex-chat-look/plugin.js`
- Conversation DOM 处理
- `composer-status-stack`
- Task detection
- Task scroll
- User / Assistant message root
- Long message collapse
- MutationObserver
- Approval / Clarify 的 DOM 识别方式

**不要直接复制整个 Codex Plugin。只提取与本阶段目标有关的实现思想。**

---

## 二、先分析当前项目

在修改任何代码之前：

1. 阅读整个 hermes-bubbles-skin
2. 阅读当前 bubbles.yaml
3. 检查项目是否已经存在 plugin / JavaScript 入口
4. 检查 Hermes 当前 Desktop Plugin API / 插件目录结构
5. 阅读 hermes-codex-skin 当前实现
6. 找出 Bubbles 与 Codex 的 DOM selector / data-slot 差异

先形成一个简短的技术分析文件：`docs/implementation-analysis.md`

内容至少包括：
- 当前项目结构
- Hermes UI 相关 DOM
- Codex Skin 使用的关键 selector
- Bubbles 可以复用的 selector
- 不确定的 selector
- 第一阶段需要增加的文件
- 潜在兼容性风险

**不要在 selector 未确认之前大量写 CSS。**

---

## 三、Conversation 实现

### 目标

让 Bubbles 的聊天消息成为真正稳定的玻璃气泡，而不是只依赖当前静态 CSS。

需要识别：
- `[data-slot="aui_user-message-root"]`
- `[data-slot="aui_assistant-message-root"]`

如果实际 Hermes 版本 selector 不一致：**不要猜**。应该通过当前运行 DOM / Codex Skin / Hermes API 确认后再实现。

### User Message

保持 Bubbles 当前设计：
- Sapphire / blue gradient
- 半透明
- 圆角
- 右侧对齐
- 适当 padding
- 不要过度放大

```
                         ┌──────────────────────┐
                         │ User message         │
                         │                      │
                         └──────────────────────┘
```

### Assistant Message

保持：
- Frosted glass
- 半透明白 / 冰蓝
- 左侧对齐
- 较柔和的 border
- backdrop blur

```
┌──────────────────────────────────────┐
│ Assistant message                    │
│                                      │
│ Markdown / code / list / table       │
└──────────────────────────────────────┘
```

---

## 四、Long Message Collapse

参考 Codex Skin。

### 目标

当 User message 过长时自动折叠。

第一阶段可以采用：
```
超过约 4~6 行
    ↓ collapsed
    ↓ 显示有限高度
    ↓ Show more
```

展开后：`Show less`

### 要求

- 不影响短消息
- 不影响 Markdown
- 不影响代码块
- 不影响图片
- 不影响消息操作按钮
- 不改变 Hermes 原始消息内容
- 不能删除 DOM 内容
- 如果需要保存展开状态，可以使用 localStorage
- 但第一阶段不要设计复杂的数据持久化

---

## 五、Task 实现

这是第一阶段最重要的部分。

参考 Codex Skin 对 `[data-slot="composer-status-stack"]` 以及 Task 状态的处理。

**首先确认 Hermes 当前版本实际 DOM。不要假设 selector 一定与 Codex 完全相同。**

---

## 六、Task 的 UI 结构

最终目标：

```
┌─────────────────────────────────────────┐
│ ✦ Tasks                           3 / 6 │
├─────────────────────────────────────────┤
│                                         │
│ ✓ Analyze project structure             │
│ ✓ Search relevant files                 │
│ ✓ Inspect implementation                │
│ ◉ Implement Bubbles UI                  │
│ ○ Run tests                             │
│ ○ Final verification                    │
│                                         │
└─────────────────────────────────────────┘
```

**但不要自己生成 Task 数据。** 应该：识别 Hermes 已经渲染出来的 Task DOM，然后重新布局和美化。

---

## 七、Task 状态

视觉上区分：

| 状态 | 图标 | 说明 |
|------|------|------|
| Pending | ○ | 待执行 |
| Running | ◉ | 执行中 |
| Completed | ✓ | 已完成 |
| Failed | ✕ | 失败 |
| Warning / Waiting | ⚠ | 等待/警告 |

颜色尽量使用现有 Bubbles theme variables：
- `ui_ok`
- `ui_error`
- `ui_warn`
- `ui_accent`

**不要重新建立一套颜色系统。**

---

## 八、Task 独立滚动

这是必须实现的。

如果 Task 很多：

**错误：** 整个页面越来越长

**正确：**
```
┌─────────────────────────────┐
│ Tasks                       │
├─────────────────────────────┤
│ ✓ Task 1                    │
│ ✓ Task 2                    │
│ ✓ Task 3                    │
│ ◉ Task 4                    │
│ ○ Task 5                    │
│ ○ Task 6                    │
│       ↑                     │
│       │ scroll              │
└─────────────────────────────┘
```

Task body 应：
- `overflow-y: auto;`
- 同时设置合理 `max-height`
- 不要让整个 composer/status stack 被 Task 撑开

---

## 九、Task 与 Conversation 必须分离

不要把 Task 当成普通聊天消息。

正确结构：
```
Conversation
│   ├── User
│   ├── Assistant
│   ├── Tool / status
│   └── Final answer

Task
│   └── Composer / execution status
```

Task 属于执行状态 UI。
- 不要把 Task clone 到 transcript。
- 不要创建第二份 Task 数据。

---

## 十、MutationObserver

由于 Hermes UI 会动态变化，需要考虑：
- 页面初始化
- 新消息
- streaming
- Task 开始
- Task 更新
- Task 完成
- session 切换
- DOM re-render

可以使用 MutationObserver。但必须避免无限循环：

```
MutationObserver
    ↓ 修改 DOM
    ↓ 触发 MutationObserver
    ↓ 再次修改
    ↓ 无限循环
```

因此：
- 修改前检查状态
- 使用 data attribute 标记已经处理过的节点
- 必要时 debounce / requestAnimationFrame
- 不要持续重复设置相同 style/class

---

## 十一、推荐的 JS 架构

不要把所有代码写成一个巨大的函数。

```
plugin.js
├── constants
├── DOM helpers
├── conversation
│   ├── enhanceUserMessage()
│   ├── enhanceAssistantMessage()
│   └── setupLongMessageCollapse()
├── task
│   ├── findTaskSection()
│   ├── enhanceTaskSection()
│   ├── updateTaskState()
│   └── setupTaskScroll()
├── observer
│   ├── observeConversation()
│   └── observeStatusStack()
└── init()
```

---

## 十二、不要复制 Codex 的所有功能

第一阶段明确不要实现：
- History rail
- History preview
- Clean transcript
- Queue manager
- 自己的 Queue
- 自己的 Session manager
- 后端 API
- Tool execution
- MCP 数据层
- 自己的 Approval handler
- 自己的 Clarify handler

这些以后再考虑。

### 第一版先不要碰这三个东西：

1. **Queue** — Hermes 自己管理。
2. **Clean Transcript** — 等 Conversation + Task 稳定以后再做。
3. **History** — 这是另外一个比较大的 UI 系统，不要和第一阶段混在一起。

---

## 十三、Approval / Clarify

第一阶段不需要重新实现。

只需要确保 Approval / Clarify 在 Bubbles CSS 下：
- 不被隐藏
- 不被 overflow 截断
- 不被 Task 覆盖
- 不破坏 composer
- 不影响原生按钮

可以预留 selector / CSS。

---

## 十四、CSS 设计原则

继续使用当前 Bubbles 的设计语言。

**核心：Frosted Glass + Blue / Sapphire + Soft Border + Subtle Shadow + Backdrop Blur**

不要直接复制 Codex 的黑灰色视觉。Bubbles 应该保持自己的品牌视觉。

---

## 十五、兼容性

所有新增代码必须尽量：
- selector 精确
- scope 限定
- 不污染全局
- 不修改 Hermes 原生逻辑
- 不覆盖无关 UI
- 不依赖固定 DOM 层级，除非确认必要

优先级：
1. 优先 `[data-slot="..."]`
2. 其次 `[data-codex-*]`
3. 或者 Bubbles 自己：`[data-bubbles-*]`

推荐使用：
- `data-bubbles-task`
- `data-bubbles-user-message`
- `data-bubbles-assistant-message`

避免使用：`.bubble` `.task` `.message` 这种过于宽泛的 class。

---

## 十六、测试要求

完成后至少验证：

### Conversation
- 普通 User message
- 普通 Assistant message
- Markdown
- code block
- list
- table
- 图片
- 长 User message
- 长 Assistant message
- streaming message

### Task
- 无 Task
- 单 Task
- 多 Task
- Task running
- Task completed
- Task failed
- Task 很长
- Task 滚动
- Task 完成后 UI 正常恢复

### 状态
- Approval
- Clarify
- Queue
- Stop
- session 切换

---

## 十七、最重要的验收标准

完成后必须回答：

1. Task 数据是不是仍然来自 Hermes？
2. 有没有复制/维护第二份 Task state？
3. Queue 是否仍然由 Hermes 管理？
4. 是否修改 Hermes 原始业务逻辑？
5. MutationObserver 是否可能无限触发？
6. Task 很多时是不是只有 Task body 滚动？
7. 长消息是否可以展开/折叠？
8. Conversation 与 Task 是否保持结构分离？
9. Approval / Clarify 是否仍然可以正常使用？
10. 禁用 Bubbles Plugin 后 Hermes 是否仍然正常工作？

---

## 十八、实现顺序

严格按照：

```
Step 1 读取并分析现有 Bubbles
    ↓
Step 2 读取 Codex plugin.js
    ↓
Step 3 确认 Hermes 当前 DOM selector
    ↓
Step 4 建立 plugin.js 最小框架
    ↓
Step 5 实现 User / Assistant bubble enhancement
    ↓
Step 6 实现 Long Message Collapse
    ↓
Step 7 实现 Task detection
    ↓
Step 8 实现 Task layout
    ↓
Step 9 实现 Task scrolling
    ↓
Step 10 测试 Approval / Clarify / Queue
    ↓
Step 11 整理 README
    ↓
Step 12 提交最终 diff / 文件列表 / 测试结果
```

**不要跳过前面的 DOM 分析直接开始大规模修改。**

---

## 最终输出

完成后必须输出：

- 修改了哪些文件
- 每个文件做了什么
- 新增了哪些 selector
- Task 是如何识别的
- Conversation 是如何增强的
- 是否使用 MutationObserver
- 是否修改 Hermes 原生逻辑
- 测试了什么
- 当前已知问题

---

## 第一阶段完成后的理想效果

```
╭─────────────────────────────────────────────╮
│                                             │
│                         User                │
│             ╭──────────────────────────╮    │
│             │ 帮我分析这个项目……       │    │
│             ╰──────────────────────────╯    │
│                                             │
│  ╭──────────────────────────────────────╮   │
│  │ Hermes                               │   │
│  │                                      │   │
│  │ 我会先检查项目结构，然后……           │   │
│  ╰──────────────────────────────────────╯   │
│                                             │
│  ╭──────────────────────────────────────╮   │
│  │ ✦ Tasks                       3 / 5 │   │
│  │──────────────────────────────────────│   │
│  │ ✓ Analyze project                   │   │
│  │ ✓ Read configuration                │   │
│  │ ✓ Inspect UI                        │   │
│  │ ◉ Implement Bubbles                 │   │
│  │ ○ Test                              │   │
│  │                                      │   │
│  ╰──────────────────────────────────────╯   │
│                                             │
│  ╭──────────────────────────────────────╮   │
│  │ Hermes                               │   │
│  │                                      │   │
│  │ 实现完成，我发现……                   │   │
│  ╰──────────────────────────────────────╯   │
│                                             │
╰─────────────────────────────────────────────╯
```

这才是 hermes-bubbles-skin 借鉴 hermes-codex-skin 最有价值的方向：**不是变成 Codex Skin，而是让 Bubbles 拥有 Codex Skin 的"运行时 UI 能力"，同时保留自己的蓝色玻璃视觉。**
