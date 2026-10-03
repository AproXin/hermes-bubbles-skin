# 文档索引

这个目录只放两类东西：**给宿主的反馈**，和**界面预览图**。

阶段性实现与审计的过程记录（15 份，`reports/`）已删除：它们不随代码更新，自己声明「不代表现在的行为」，
也没有任何代码或测试引用它们——当前行为看 [`../README.md`](../README.md) 的「开发与部署」段，
可执行的定义看 `test/`（55 个套件跑的是实测计算样式与像素，比任何文档都可信）。

需要那些过程记录时，它们都在 git 历史里：

```bash
git log --diff-filter=D --name-only -- docs/reports   # 找到删除它们的那个提交
git show <该提交>^:docs/reports/phase-5b-report.md    # 取回其中任意一份
```

## 给宿主的反馈

| 文档 | 内容 |
| --- | --- |
| [hermes-tasks-panel-lifetime-feedback.md](hermes-tasks-panel-lifetime-feedback.md) | 任务面板在轮次结束即被 Hermes 卸载（`todos.ts:146-154`），皮肤层无解；含源码行号、复现步骤与三档建议 |

> 终端那张「恢复出来的标签为什么是黑的」的定位记录原本也在这里，因为它逐行摘录了未发布的宿主源码、
> 并含改签名应用的操作步骤，公开发布前整体撤下（`docs/patches/` 一并撤下）。结论与变通方法保留在根
> README 的「已知限制」一节。

## 待办交底

| 文档 | 内容 |
| --- | --- |
| [process-parent-tools-split-brief.md](process-parent-tools-split-brief.md) | `processParentTools`（244 行 / CC 58）拆分的交底卡：实测的 7 段结构、动刀前必须先钉的两条无断言契约（`data-bubbles-group-id`、`data-bubbles-tool-group`）、不许变的对外签名，以及逐段比对的快照验收配方 |

## 预览图

[`previews/`](previews) 由 `node scripts/render-preview.js` 生成——整窗、无边框，用真实三层样式表
（构建 CSS + live customCSS + PLUGIN_CSS）离线渲染，可在不重启 Hermes 的情况下判断几何、颜色与排版。
脚本会补上 ThemeProvider 运行时才写进 `<html>` 的**主题种子变量**，所以配色与真机一致；
唯一剩下的失真是 codicon 字形离线不一定解析，看图别看图标。

| 图 | 对应界面 |
| --- | --- |
| `previews/bubbles.png` | 整窗主视觉：气泡、氛围底板与输入区 |
| `previews/transcript-rows.png` | 扁平化后的思考/工具行与保留的代码/diff 框 |
| `previews/composer.png` | 双行输入区 |
| `previews/task-panel.png` | Composer 上方的 Tasks 进度面板 |
| `previews/capabilities.png` | 技能/工具集页（开关两态 + 分类标签选中态） |
| `previews/kanban.png` | 看板页（三列，背景并入主题） |
| `previews/social-preview.png` | 1280×640 分享卡，即 `og:image` 指向的那张 |
