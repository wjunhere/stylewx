# @stylewx/components

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
- 41bda5c: 新增 `:::music` 音乐占位组件：发布时**自动插入**微信原生播放器（无需人工）。
  
  与 `:::video` 相反 —— 音乐不需要人工点。实测（`docs/design/platform-widgets.md` §26）：把旧草稿
  `draft/get` 里的 `<mp-common-clmusic …>` 标签直接 `insertHTML`，编辑器完整保留；
  保存后再读回仍完整。两条插入路径：`source`（原样标签，首选）/ `clue`（关键词搜索）。
  
  两个组合性修复（同一个根因，铁律⑨）：
  
  - `injectMarker` 改用引号感知扫描找开标签结尾。此前用 `indexOf('>')`，而 `escapeAttr`
    刻意不转义 `>`，属性值里出现裸 `>` 时开标签会被提前截断，把后续属性写进那个属性的值里
    —— 渲染产物里会多出一段可见的垃圾文本。音乐组件第一次把整段 HTML 当属性值存才踩到。
  - `@stylewx/publisher` 新增 `stripHtmlTags()` 并在 `computeDigest` 使用。此前的
    `/<[^>]+>/g` 会被属性里的 `>` 骗到，把标签文本当正文写进文章摘要。
- bd3e695: 新增 `:::search` 推荐搜索组件（发布时自动插入）+ 三处平台限制防线。
  
  与 `:::music` 同族：数据自包含的 `<mp-common-search>`，可离线合成、零交互插入
  （`docs/design/platform-widgets.md` §28）。昵称与头像**不写进 Markdown**，发布时调 `getaccountbasicinfo` 现取
  —— 昵称不一致就是导流到别人的号，且 `qlogo.cn` 头像直链会随换头像失效。
  
  实测拿到两个反直觉的约束，都做成了防线：
  
  - 搜索词限 **16 单位、全角算 2**（汉字最多 8 个 / 英文最多 16 个），**不是**提示文案说的
    「16 个字符」。超限时保存被平台拦、错误只以浮层出现、URL 无 appmsgid，极易误判为「保存坏了」。
    新增 `overlongSearchKeywords()` / `searchKeywordUnits()` 在渲染期报 error。
  - 必须**注入前预替换**，不能注入后再插：占位块后紧邻含 `<svg>` 的尾图，所有
    `execCommand` 二次插入策略都会把块塞进 svg 内部（六种全测）。
  
  顺带修的两处：
  
  - `publish-via-browser.mjs` 把**组件 error 诊断**当发布闸门（此前只看 validation，漏掉诊断），
    且保存后读不到 `appmsgid` 时直接 fail（此前只打印「请确认」，会误报成功）。
  - `theme-previews.ts` 去掉写死的「内置 24 个组件」（会漂）。

### Patch Changes

- Updated dependencies [5a626d6]
- Updated dependencies [3f68b60]
  - @stylewx/theme@0.7.0

## 0.6.0

### Patch Changes

- @stylewx/theme@0.6.0

## 0.5.0

### Minor Changes

- b71ae67: 编辑器新增四项能力，均为「补齐与主流公众号编辑器的必要差距」：
  
  - **正文图片上传**：本地图经 Chromium 规范化（等比缩放、降质，GIF 不重编）后存入本地资产库，正文可引用；发布时 `relocate` 经 `resolveLocal` 钩子解析回字节并搬运到微信素材库。此前正文只能引用 http(s) 外链。
  - **封面生成**：`renderCoverPng` 按主题色渐变 + 标题 + 品牌角标生成 900×383 封面，替代原先无文字的纯渐变兜底。
  - **深色模式预览**：模拟微信暗色页底，用真实计算样式扫描「深色文字且无任何底色」的元素；新增可选 token `pageBackgroundColor`（白名单 GRAY 档）写进根节点，未设置时不输出，预置主题不受影响。
  - **排版设置面板**：字体/字号/行高/字距/正文色/主色/页面底色；编辑器改为向 API 传递完整主题对象，支持另存为自定义主题。
  
  修复：组件库参数表未初始化、切主题不回填；顶栏结构未闭合导致主内容被吞入；「主题管理」下拉遮挡封面弹层。

### Patch Changes

- Updated dependencies [b71ae67]
  - @stylewx/theme@0.5.0

## 0.4.1

### Patch Changes

- @stylewx/theme@0.4.1

## 0.4.0

### Patch Changes

- @stylewx/theme@0.4.0
