# @stylewx/mcp-server

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
  - @stylewx/service@0.5.0
  - @stylewx/preview@0.5.0
  - @stylewx/publisher@0.5.0
  - @stylewx/theme@0.5.0
  - @stylewx/components@0.5.0
  - @stylewx/core@0.5.0
  - @stylewx/validator@0.5.0

## 0.4.1

### Patch Changes

- 修复 `initialize` 握手返回的版本号一直停留在 `0.1.0`。
  
  `SERVER_VERSION` 是硬编码常量，从首个版本起就没跟过 `package.json`。
  MCP 客户端把 `serverInfo.version` 显示给用户，所以每个装了 stylewx 的人
  看到的都是 `0.1.0`（0.2.0 / 0.3.0 / 0.4.0 三个版本都受影响）。
  
  改为从包元数据读取，并新增回归测试：握手返回的版本必须与 `package.json` 一致，
  版本升级忘记同步时会直接失败。
- @stylewx/components@0.4.1
  - @stylewx/core@0.4.1
  - @stylewx/publisher@0.4.1
  - @stylewx/service@0.4.1
  - @stylewx/theme@0.4.1
  - @stylewx/validator@0.4.1

## 0.4.0

### Minor Changes

- 品牌体系（方向 B · 协议 Protocol）落地到编辑器界面。
  
  - **六令牌建立**：`editor.html` 顶部 16 个变量收敛为六个（`--bg` / `--surface` / `--fg` /
    `--muted` / `--border` / `--accent`），派生色只从它们混出来。原来的 `--panel` / `--line` /
    `--ink` / `--brand` 等旧名保留为**兼容别名**（映射到新令牌），所以 `renderEditor` 注入的
    片段与既有自定义组件不受影响。
  - **分层改发丝线**：取消全部投影（`--shadow` / `--shadow-lg` → `none`），改由 1px 描边撑住
    边界。白面与纸底的明度差只有 1.6%，描边不能删也不能调浅。
  - **按钮分工**：新增 `.btn.ink` 承担编辑动作（新建文章、弹层确认等），实底蓝收敛到唯一一处
    「发布草稿箱」。
  - **标志**：新增 `apps/mcp-server/icon.svg`（校验帧 + 端点，16px 简化版），侧栏方形「M」
    替换为母题；favicon 内联为同一形状（`/editor` 是独立页面，不能依赖相对路径）。
  - **校验条重构**：原本直接铺开的 N 条诊断改为「结论 + 统计」胶囊常驻、明细可折叠；
    每条明细带判定词，颜色不再独立承载语义。
  - **修复**：
    - `.ai-*` 系列引用了从未定义的 `--blue`，实际渲染成继承色；
    - `.btn.ink` 与 `.btn:disabled` 同权重，导致禁用态仍渲染成实底、看起来可点；
    - 「灰档」一词被误用于非 CSS 属性的普通警告（如 `image-count-zero`），
      现仅 `css-property-gray` 使用该词，其余显示为「警告」。
  - **品牌资产与校验**：新增 logo 四态、1280×420 与 640×200 两档 banner（SVG 源 + PNG 2x）、
    对比度核对脚本（21 项，含令牌漂移检查）与编辑器回归检查脚本；CI 增加 `pnpm brand:check`。
    新增 `pnpm brand:assets` / `brand:contrast` / `brand:check` 三个脚本。
  
  完整说明见 `docs/DESIGN.md` 第 21 节与 `README.md`「维护品牌资产」。

### Patch Changes

- @stylewx/components@0.4.0
  - @stylewx/core@0.4.0
  - @stylewx/publisher@0.4.0
  - @stylewx/service@0.4.0
  - @stylewx/theme@0.4.0
  - @stylewx/validator@0.4.0
