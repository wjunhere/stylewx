# stylewx 设计说明（索引）

面向维护者：设计决策、约束、实测结论。**这页只是地图，正文在 [`docs/design/`](./design/)。**

> **`§N` 是全仓库的稳定 id**：源码注释、MCP 工具提示、`AGENTS.md` 都直接写 `§20.10`。
> 所以拆文件时**编号与标题一字未改**，`rg '^## 20\.' docs/` 永远能定位到。
> 新增一节接着往下编号，**不要重排、不要复用旧号**。

| 文件 | 覆盖 | 讲什么 |
|---|---|---|
| [`design/core.md`](./design/core.md) | §1–§8、§10 | 包边界（同构 / API 只在 publisher）、统一错误、测试策略、微信兼容白名单、已知限制 |
| [`design/component-system.md`](./design/component-system.md) | §11、§14–§16 | 富组件库、小原语工作流、组件样式覆盖、agent 自造组件 |
| [`design/editor.md`](./design/editor.md) | §9、§12–§13、§17–§18、§24–§25 | 编辑器与主题库、HTML 回导、同步滚动、组件库页、Mermaid 出图、另存为 |
| [`design/brand-system.md`](./design/brand-system.md) | §19、§21 | 品牌记忆（谁做设计）、六令牌品牌层、柔结构签名、品牌物料 |
| [`design/publishing.md`](./design/publishing.md) | §20、§29 | 浏览器登录态发布、可编辑性判据、正文视频、草稿箱纪律 |
| [`design/platform-widgets.md`](./design/platform-widgets.md) | §26–§28 | 音乐、推荐搜索、以及「平台组件该不该做」的判据 |
| [`design/brand-pack.md`](./design/brand-pack.md) | §30–§31 | 品牌三方一致性闸门（`brand doctor`）、`.brand` 打包与分发 |
| [`design/theme-system.md`](./design/theme-system.md) | §32–§33 | 默认 Markdown 样式：默认 block、代码块内联、表格 block；以及 10 套社区样式与它们的取法 |
| [`design/pitfalls.md`](./design/pitfalls.md) | §22 | **踩过的坑全量**（按症状 → 原因 → 防线） |
| [`design/manual-scripts.md`](./design/manual-scripts.md) | §23 | 不进 CI 的手动验证脚本清单 |

## 写在这里面的约定

- **踩坑**按「症状 → 原因 → 防线」记：只写结论会让后来者在不了解代价时把它改坏。
- **说清「为什么」和「代价」**：本项目大量决策是权衡的结果（例如取消全部投影的代价是发丝线不能调浅）。
- 每节开头尽量给出**判据**而不是罗列现象 —— 判据能迁移，现象不能。
