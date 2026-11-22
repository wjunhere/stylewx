# @stylewx/theme

## 0.8.0

### Patch Changes

- 0b7379f: 修一批会静默毁掉正文、或让发布静默半成功的问题，并给两处「静默」加硬拦截。
  
  **正文/渲染**
  - `publish-via-browser.mjs --theme <主题名>` 之前必崩（`homedir` 未导入，只走预设名或已保存名这条路就会 `ReferenceError`）。
  - 浏览器通道注入前把 `<pre>` 内换行焊成 `<br>`：微信编辑器保存时剥掉 `white-space`，代码块所有行会挤成一段（新增 `scripts/lib/wechat-html.mjs`）。
  - 编译器给 `pre` 兜一层 `text-align: left`：正文容器默认 `justify` 会把等宽字体长行拉出大空隙；主题显式声明则不改。
  - `/editor/api/asset/` 补 `Access-Control-Allow-Origin: *`：微信编辑保存时会用 XHR 抓外链图，跨源被拦后保存「成功」但草稿里没有内容。
  
  **硬拦截（不再静默半成功）**
  - 浏览器通道注入前先确认编辑器是空的（剔除编辑器的占位 widget），有内容就中止、不保存；注入后校对 `img`/`pre` 数量，DOM 少于源 HTML 即中止。
  - `save_article` 遇到 `%file` / `@file` 这类文件引用写法直接报错（原来会把它当正文原样落盘成垃圾文件，还报成功）。
  
  **图片管道（`prepareImage`）**
  - 唯一触发条件改成「体积超 `maxBytes`」：**不再**因为「最长边 > 1600」这个没有平台依据的常量砍像素；不超预算的图连浏览器都不起。
  - 超预算时**先保像素**：不透明的图先试原尺寸转 JPEG（质量阶梯 0.88→0.68），进预算就停；透明的留 PNG 缩像素（长边不低于 800）。
  - 压完比原图还大（截图类 PNG）就回退原图并标 `fellBack`；压到底仍超预算则标 `overBudget`（不再静默当成功）。
  - 免压通道用新增的 `readImageSize()`（PNG/GIF/JPEG/WebP 文件头解析，不启浏览器）报真宽高，不再返回 `0×0`。
  - `upload-image` 的响应体透传 `overBudget` / `fellBack` / `jpegQuality`：这三个值存在的意义就是给调用方分支用，
    只拼进 `note` 中文句子等于让人解析字符串。`overBudget` / `fellBack` 是**必填布尔值**（不再靠 `undefined` 表达「否」）。
  - `upload-image` 的原图体积提示改用上传字节计算（原来会显示「707KB → 707KB」）。
  - 破坏性变更：`PrepareImageOptions.maxEdge` 与 `quality` 已移除；`PrepareImageResult` 新增 `overBudget`。
  
  **主题库来源标记**
  - `themes.json` 新增旁挂的 `origins`（`agent` / `brand:<名字>`）；`deleteTheme` 拒绝删除品牌派生主题（`brand_apply` 会幂等补回），也拒绝删除没有标记的存量主题，除非显式 `allowUnknown`。
  - `verify-drafts.mjs` 只检查稿子里**真的存在**的组件：一头一尾都在才比对字母（只放尾图不再误报「不同字母」），没放推荐搜索就不再判它✗。

## 0.7.2

No changes in this release.

## 0.7.1

No changes in this release.

## 0.7.0

### Minor Changes

- 5a626d6: 10 套社区流行样式、表格 block、tech-minimal 换掉默认科技蓝、三个组件重做。
  
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
- 3f68b60: 默认 Markdown 样式重做：默认 block 的层级/节奏/装饰，以及代码块的内联修正。
  
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

## 0.6.0

No changes in this release.

## 0.5.0

### Minor Changes

- b71ae67: 编辑器新增四项能力，均为「补齐与主流公众号编辑器的必要差距」：
  
  - **正文图片上传**：本地图经 Chromium 规范化（等比缩放、降质，GIF 不重编）后存入本地资产库，正文可引用；发布时 `relocate` 经 `resolveLocal` 钩子解析回字节并搬运到微信素材库。此前正文只能引用 http(s) 外链。
  - **封面生成**：`renderCoverPng` 按主题色渐变 + 标题 + 品牌角标生成 900×383 封面，替代原先无文字的纯渐变兜底。
  - **深色模式预览**：模拟微信暗色页底，用真实计算样式扫描「深色文字且无任何底色」的元素；新增可选 token `pageBackgroundColor`（白名单 GRAY 档）写进根节点，未设置时不输出，预置主题不受影响。
  - **排版设置面板**：字体/字号/行高/字距/正文色/主色/页面底色；编辑器改为向 API 传递完整主题对象，支持另存为自定义主题。
  
  修复：组件库参数表未初始化、切主题不回填；顶栏结构未闭合导致主内容被吞入；「主题管理」下拉遮挡封面弹层。

## 0.4.1

No changes in this release.

## 0.4.0

No changes in this release.
