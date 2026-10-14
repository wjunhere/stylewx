---
"@stylewx/theme": minor
"@stylewx/core": minor
---

默认 Markdown 样式重做：默认 block 的层级/节奏/装饰，以及代码块的内联修正。

**默认 block 是所有主题的基线**（6 套原创预置、agent 直出的主题、品牌档案里没写的 block 都继承它），
旧版有三个模板感来源：

- **三级标题全是强调色、字重相同** —— 一屏到处同一种颜色，层级只剩字号，强调色也用尽了。
  改：标题用正文墨色，层级交给字号 + 字重 + 空气；强调色只留给链接、行内代码、组件。
  加粗不再染色（染色加粗是「满屏主色」的另一半来源）。
- **所有元素下边距都是同一个 `spacing.block`** —— 标题和段落一样挤。改：标题上边距用 em，
  h2 给到 1.9em。
- **引用块是圆角灰药丸、行内代码是纯灰块**。改：引用块去圆角（左线 3px + 浅底）；
  行内代码浅底 + 1px 描边；h2 改成「贴字 2px 下划线」（`display: table`）、h3 用左竖线。

借鉴来源与取舍记在 `docs/design/theme-system.md` §32（Tailwind Typography prose 的层级取法、
mdnice 默认主题的引用块、doocs/md 的贴字下划线与行内代码）。`tech-minimal` 顺手删掉
h1/h2 各自的蓝竖线 —— 加上默认的 h2 下划线就是「三层同款装饰」，它的身份由调色板承担。

**代码块不再嵌第二个盒子**：`compileThemeToCss` 追加 `pre code { … }` 重置（只重置盒模型与字号，
不动 color / font-family）。此前代码块里的 `<code>` 会套上行内代码的描边与内边距，
字号还叠两次（0.86em × 0.88em ≈ 0.76em）。

正文新增字距 0.04em；`docs/assets/theme-library.png` 是这次改动前截的图，需要重截。
