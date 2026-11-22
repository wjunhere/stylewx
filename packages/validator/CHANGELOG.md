# @stylewx/validator

## 0.8.0

### Minor Changes

- 85191f3: 加排版基线闸门：schema 只管类型，管不了「合法但没法读」。
  
  `lineHeight: 0.8~4`、`fontSize` 任意长度在类型上都合法，所以只会照 schema 生成主题的模型
  能写出 `line-height: 1.1` + `font-size: 11px` —— 微信完全支持，人读不了。validator 原先
  18 条规则全是兼容性/安全/数量，一条排版规则都没有。
  
  新增四条（判据取自 36 套预置主题的实测区间，lineHeight 1.55~2.06 中位 1.7、fontSize 14~17px）：
  
  | rule | error（阻断发布） | warning |
  | --- | --- | --- |
  | `typography-line-height` | < 1.3 | < 1.5 或 > 2.2 |
  | `typography-font-size` | < 13px | < 14px 或 > 18px |
  | `typography-block-spacing` | — | < 8px |
  | `typography-letter-spacing` | — | > 0.15em |
  
  分档原则是**只有明显坏才 error**：硬拦「偏离预置区间」会把刻意的极简风（如 1.4 行距的诗体）一起误伤。
  实现上只查正文 `<p>`（h1/h2 的 1.2 紧行高是对的）、值从根节点继承、百分比/px/em 都换算成比值、
  每个 rule 最多报一次。
  
  它搭的是现成的车：`publish-via-browser.mjs` 本来就「validation.pass 不过就中止」，所以弱模型
  写坏的排版在发布那一刻就被拦住，不需要新铺管线。`generate_theme` 的提示词也补了合理区间
  （原文只写「lineHeight 数字 0.8~4」，把类型边界当成了合理值）。

### Patch Changes

- Updated dependencies [0b7379f]
  - @stylewx/theme@0.8.0

## 0.7.2

### Patch Changes

- @stylewx/theme@0.7.2

## 0.7.1

### Patch Changes

- @stylewx/theme@0.7.1

## 0.7.0

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
