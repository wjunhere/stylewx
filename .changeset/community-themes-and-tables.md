---
"@stylewx/theme": minor
"@stylewx/core": minor
"@stylewx/components": minor
"@stylewx/mcp-server": minor
---

10 套社区流行样式、表格 block、tech-minimal 换掉默认科技蓝、三个组件重做。

## 10 套社区样式（编辑器里可挑）

GitHub 文档、GitHub 深色、Tailwind `prose`、Water.css、new.css、Sakura、Pico、LaTeX 论文、
Tufte 长文、doocs/md「优雅」。**按各自上游的原值实现**（颜色/字号/边框/表格线都取自源头，
只把无法内联表达的部分换成等价写法）—— 一旦掺我们的配方，十套都会变成「我们那套默认 + 换个色」，
挑主题时的参照作用就没了。出处与许可（九个 MIT + doocs WTFPL）逐套写在 `community-presets.ts` 文件头。

三处刻意的偏离：正文字距统一 0.04em（中文更耐读）；不用 `box-shadow` / 渐变（GRAY 档与白名单外属性）；
纯黑 `#000` 换成近黑（实测微信会把 `color: #000000` 整条吞掉）。
搬不过来的两处写在文档里而不是硬凑：Tailwind 的反引号（伪元素）、Water.css 的斑马纹与 Tufte 的旁注
（需要 `tr` / 旁注定位）。

## 表格 block

`table` / `th` / `td` 补上了（`EXTRA_BLOCK_NAMES`，**可选**）：判据是「默认基线里有的就是可选」——
自建主题（默认基线、6 套原创、10 套社区）都带表格，而 `wemd-presets.ts` 那 20 套是生成文件，
把它们算成必需会让整批红掉，不设只是回到旧行为。表头底色也做成可选（`Palette.tableHeadBg`）：
GitHub / Tailwind 的表头本来就没底色。默认样式三线或全框都能表达，不需要新机制。

## tech-minimal：换掉 `#0b6bff`

那个蓝正是 SKILL 里「被用烂清单」点名的那一支，一个仓库不该一边教 agent 别用默认科技蓝、
一边把它当默认主题。新配色是石板灰墨 + 工程绿 `#047857`（取自 ui-ux-pro-max 给「developer tool
文档站」的推荐，但把强调色的明度压到 700 档：推荐里的 `#22C55E` 在白底上对比度约 2.2:1，
当文字色不合格）。代码块走深色底（石板 800 + 亮灰字）；标题不再各加一条竖线。
`dark-code` 顺手补上 `pageBackgroundColor` —— 深色整页主题没有页底时，白底上的暗色字不可读。

## 三个组件重做（card / callout / quote）

三者原来都是「同款浅底 + 左色条 + 圆角」，读者分不出哪块是强调、哪块是容器。现在按语义分成三种形状：

- **card** = 有边界的**容器**：四面细边框 + 圆角 + 标题下一条发丝线，`tone` 只染标题前的小竖条。
- **callout** = 贴着左线的**提示**：4px 色线 + 浅底 + 只在右侧收圆角，没有外框。
- **quote** = **引文**：没有盒子也没有底 —— 大引号 + 正文 + 落款上方一条发丝线。

## 其它

- `renderMarkdownToHtml` 的默认配色（未传主题时）跟随 tech-minimal 一起换。
- 预置主题从 26 套变 36 套，品牌 banner 上的数字由代码算出（`pnpm brand:assets` 已重新生成）。
- `docs/assets/theme-library.png` 重截；`capture-theme-library.mjs` 修掉「固定等 2800ms + 只截弹层」，
  改成等预览真的渲染完 + 截整个视口（含页脚版本号）。
- 新增 `packages/service/scripts/theme-sheet.mjs`：多套主题并排的对比图（挑主题用）。
