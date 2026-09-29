# 文档索引

`reports/` 里的都是**某一时刻的过程记录**（阶段实现、验收审计、当时的源码分析），
不随代码更新——它们解释「当初为什么这样做」，不代表现在的行为。当前行为看
[`../README.md`](../README.md) 的「开发与部署」段，可执行的定义看 `test/`：
26 个套件跑的是实测计算样式与像素，比这些文档更可信。

## 阶段实现报告

| 文档 | 内容 |
| --- | --- |
| [phase-1-report.md](reports/phase-1-report.md) | 第一阶段落地：气泡与基础玻璃层 |
| [phase-2-report.md](reports/phase-2-report.md) | 第二阶段：交互与紧凑度 |
| [phase-3-report.md](reports/phase-3-report.md) | 第三阶段执行报告 |
| [phase-3-1-report.md](reports/phase-3-1-report.md) | 3.1：六大 UI Surface 集成 |
| [phase-4-report.md](reports/phase-4-report.md) | 第四阶段：Clean Transcript 与工具折叠 |
| [phase-4-1-report.md](reports/phase-4-1-report.md) | 4.1：工具折叠专项审计 |
| [phase-5a-report.md](reports/phase-5a-report.md) | 5A：侧栏会话行与日期分组 |
| [phase-5a-1-report.md](reports/phase-5a-1-report.md) | 5A.1 审计报告 |
| [phase-5b-report.md](reports/phase-5b-report.md) | 5B 审计报告（历史/会话预览） |
| [phase-5b-1-report.md](reports/phase-5b-1-report.md) | 5B.1：真实 UI 工具转录打磨 |

## 审计与分析

| 文档 | 内容 |
| --- | --- |
| [final-ux-audit.md](reports/final-ux-audit.md) | 全链路 UX 终检报告 |
| [history-analysis.md](reports/history-analysis.md) | Hermes 原生历史/会话组件结构分析（改侧栏前的摸底） |
| [implementation-analysis.md](reports/implementation-analysis.md) | 第一阶段技术实现分析 |
| [phase1-task-spec.md](reports/phase1-task-spec.md) | 第一阶段任务书 |
| [prompt-tool-nesting-fix.md](reports/prompt-tool-nesting-fix.md) | 工具卡片嵌套状态修复的提示词记录 |

## 预览图

[`previews/`](previews) 由 `node scripts/render-preview.js` 生成——用真实三层样式表
（构建 CSS + live customCSS + PLUGIN_CSS）离线渲染，可在不重启 Hermes 的情况下判断
几何、颜色与排版。注意 codicon 字形离线不一定解析，看几何别看图标。

| 图 | 对应界面 |
| --- | --- |
| `previews/task-panel.png` | Composer 的 Tasks 进度面板 |
| `previews/composer.png` | 双行输入区 |
| `previews/transcript-rows.png` | 扁平化后的思考/工具行与保留的代码/diff 框 |
