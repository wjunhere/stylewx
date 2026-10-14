# 编辑器与预览（§9、§12–§13、§17–§18、§24–§25）

编辑器界面与主题库、HTML 回导闭环、同步滚动、组件库页、Mermaid 出图、另存为。
上层：[设计说明索引](../DESIGN.md)。

## 9. 本地 Web 编辑器与主题库（WeMD 风格）

**主题库（复用 AI 主题）**
- `@stylewx/service/theme-store.ts` 把自定义 / AI 生成主题持久化到用户级 `~/.stylewx/themes.json`
  （可用环境变量 `STYLEWX_THEMES_PATH` 覆盖）。仅允许出现在 service 层，因用到 Node fs；core/theme/validator 保持同构。
- `list_themes` 自动合并「预置 + 已存」主题（按名去重，预置优先）；`resolveTheme` 也能按**已存主题名**解析。
- MCP 新增工具：`save_theme`（保存主题）、`list_saved_themes`（列出已存）、`export_theme`（导出完整 JSON 复用/分享）；
  `generate_theme` 增加 `save` 选项（AI 生成后直接存档）。

**本地 Web 编辑器**
- `stylewx --transport http` 时，除 `/mcp` 外还提供：
  - `GET /editor` —— 单页编辑器（`apps/mcp-server/editor.html`，零依赖 HTML/JS，布局参考 WeMD：左侧 Markdown 编辑、主题面板、右侧 390px 实时预览）。
  - `GET /editor/api/themes`、`POST /editor/api/render`、`/generate`、`/savetheme`、`/validate`、`/publish`、`GET /editor/api/export` 等 JSON 端点（复用同一编排与依赖注入）。
- 交互：写 Markdown → 选/生成/保存主题 → 实时预览 → 校验 → 复制 HTML / 复制到公众号 / 一键发布草稿箱。
- 还提供：`POST /editor/api/optimize`（AI 优化正文，需 LLM）；「图床设置」开关控制发布时是否把外链图搬运到微信素材库（`publisher.publishDraft` 的 `relocate` 参数）。
- `LlmClient.completeText` 对 Responses 端点需带 `text: { format: { type: 'text' } }`，否则取不到 `output_text`（AI 优化也因此可跑通）。

**错误可读性**
- `asServiceError` 能识别已符合 `{ error: { code, message, hint } }` 形状的对象并原样保留，避免被 `String` 成 `[object Object]` 掩盖真实原因。

## 12. HTML 反向导入（可编辑闭环）

**问题**：渲染产物是 HTML，编辑器只认 Markdown。用户手里只剩 `.html` 时无法继续改。

**关键实测**：微信 `draft/add → draft/get` **完整保留 `data-*` 属性**（含 SVG 元素）。
（脚本：`apps/mcp-server/scripts/probe-wechat-data-attrs.mjs`）

**方案**：渲染时在组件根元素写入机器可读标记，导入时据此精确还原，而不是猜。

- `data-swx` = 组件名；`data-swx-props` = URL 编码的参数；`data-swx-body` = Markdown 正文容器。
- 结构化正文（时间线 / 步骤 / 对比表 / 图库 / 轮播 / 点击展开 / 单图）额外把原始正文写进 `data-swx-src`，
  导入时直接取用——DOM 还原对 `- 2023 | 启动` 这类结构化文本会失真。
- 标记注入集中在 `renderComponent()`（对返回结果的首个元素打标），因此每个组件渲染器无需各自改动。

**冒号分配**：导入时先预扫描整棵树的组件最大嵌套层数，再按 `colons = 3 + (maxDepth - depth - 1)`
分配，保证「外层冒号更多」的语法约定在任意嵌套深度下都成立。

**降级**：没有标记的 HTML 退化为普通 HTML→Markdown；无法映射的标签原样保留为 HTML，不丢内容。
SVG 属性还原时用白名单保持驼峰（`viewBox` / `preserveAspectRatio`），其余属性才连字符化，
否则会产出 `view-box` 这种非法属性。

**验证**：`verify-html-roundtrip.mjs`（本地）与 `verify-wechat-showcase.mjs`（真实微信）双重往返：
示例文章 21/21 组件标记一致、纯文本一致；从微信取回的 HTML 回导后 16/16 组件类型全部还原。

## 13. 编辑器左右栏同步滚动

实测两个栏目的滚动容器并不相同：左侧是 `<textarea>` 自身滚动，
右侧 `.preview-wrap` 不滚（600/600），**真正滚动的是 iframe 内部文档**（4346 > 560）。
因此同步必须同时处理「textarea.scrollTop」与「iframe.contentWindow.scrollY」两种目标。

实现（`apps/mcp-server/editor.html`）：

- 按**滚动比例**映射：`ratio = top / (scrollHeight - clientHeight)`，再乘目标栏的可滚动高度。
- `syncLock` 标志 + `requestAnimationFrame` 节流，避免双向回环与抖动。
- iframe 每次 `srcdoc` 重新渲染都会换掉内部 window，因此 `load` 时重新绑定 scroll 监听；
  同时按左栏当前比例恢复右侧位置，避免「一打字预览就跳回顶部」。
- 预览头提供「同步滚动」开关，偏好写入 `localStorage`（`mp-sync-scroll`），默认开启。

验证：`packages/preview/scripts/test-editor-sync-scroll.mjs`
——左→右 50% 与右→左 85% 的比例误差均为 0.000，关闭后互不联动，重新渲染后仍保持一致。

## 17. 自定义组件在编辑器里可见（打通 agent 与人的汇合点）

### 问题

自定义组件定义后存进了 `~/.stylewx/components.json`，MCP 侧 `list_components` 也能查到，
但编辑器的「富组件」面板是一份**写死在 `editor.html` 里的 22 项静态数组**——
人在编辑器里既看不到 agent 定义的组件，也不知道自己有哪些可用。两条链路是断开的。

### 改法

**不把内置列表搬到后端**：编辑器手写的组件片段带中文标签和贴心的占位值
（「封面头图」「整篇画布（包裹全文）」），比自动生成的 `:::cover{...}` 更好用。
所以只让**自定义组件**走后端：

```
GET  /editor/api/components          → { components: [...本地自定义组件] }
POST /editor/api/delete-component    → { name }
```

编辑器打开面板时实时拉取，拼成「内置 22 项 + 我的组件分组」。
自定义组件项由 `defaults` 预填参数，并在面板里直接带一个 `×` 删除（删除不需要回 MCP 工具）。

### 为什么值得单独做

这是「agent 生成 → 人微调」闭环里最容易漏掉的一环：agent 造了组件，人却看不见。
修好之后，人的**可调范围**从「内置若干」扩到了「内置 + agent 造的任意组件」，
而且新增组件**刷新即见**（每次打开面板都重新拉取，无需重启）。

### 顺带修的一个控制台报错

清空编辑器后仍会去打 `/editor/api/render`，后端对空 markdown 返回 400，
控制台白刷一条错误。已在前端加空文档短路。

## 18. 编辑器「组件库」预览页

### 为什么需要

在此之前，编辑器只有「富组件」插入面板——一串文字条目，**看不到渲染效果**。
agent 造了自定义组件、主题改了几个 token，人都得先插进正文才知道长什么样。

### 做法

**一次请求渲染全部**：新增 `POST /editor/api/component-previews { theme }`，
服务端用当前主题把每个组件的示例 Markdown 渲染一遍，一次性返回
`{ name, origin, summary, slots, sample, html, diagnostics }[]`。
客户端不再逐个请求（26 个组件逐个渲染会很慢）。

示例 Markdown 的来源：
- 内置组件用 `COMPONENT_CATALOG[].example`（组件目录里的权威示例，已有测试保证每个示例
  都能解析成对应组件）
- 自定义组件用 `defaults` 预填参数 + 两行示例正文（兼容 `{{#each body}}` 的 `this.0`/`this.1`）

**渲染隔离**：每个预览放在独立 iframe（`sandbox="allow-same-origin"`）里，
组件的内联样式不会污染编辑器界面，主题切换后重开即刷新。

**页内交互**：左侧可搜索列表（内置/自定义分组），右侧 390px 预览 + 可定制部位提示 +
示例源码（可复制）+ 「插入到正文」。「富组件」面板顶部也放了入口。

### 验证

`test-editor-component-library.mjs`（Playwright）：入口可见、共 26 个组件、分组正确、
默认渲染非空且带内联样式、切到 gallery 有 flex 布局、搜索命中 2 条、插入后正文含该组件、0 控制台报错。

### 18.1 踩过的坑：CSS 优先级被基础样式覆盖

第一版预览页出来是「弹窗只有 420px 宽、右侧内容被裁」——因为 `.comp-modal` / `.comp-body`
写在了样式表**前面**（第 40 行），而基础样式 `.modal{width:420px}` / `.modal-body{max-height:60vh}` 在
**后面**（第 147 行）。同样是单类选择器，**后者胜出**。

改用 `.modal.comp-modal` / `.modal-body.comp-body`（特异性 0,2,0）后不再依赖书写顺序，
同时显式重置 `max-width:none` / `max-height:none` / `overflow:hidden` / `padding:0`。

教训：给既有组件加变体类时，**不要靠「写在后面」赢**——要么提高特异性，要么把变体样式放到基础样式之后。
现在 `test-editor-component-library.mjs` 会断言弹窗尺寸（≥1000px）、预览区高度（≥400px）、
`padding=0`、无裁切，`capture-hero.mjs` 也会在截组件库配图前断言弹窗真的打开了——
这类「看起来能用但被静默压扁」的问题不会再溜过去。

---

## 24. Mermaid 图（:::mermaid）

工具栏「Mermaid 图」插入 `:::mermaid` 源码块，正文就是 mermaid.live 同语法
（flowchart / sequence / class / state / ER / gantt / pie / mindmap / timeline / journey 十类已实测）。

**渲染架构（为什么这么绕）**：

1. `@stylewx/components` 的 mermaid 组件只渲染**占位符**（同步、无 DOM，图源码 base64url 进
   `data-swx-mermaid`；占位符必须是叶子节点，service 靠正则整块替换）。
2. `@stylewx/service` 的 renderPreview 在校验**之前**调 `inlineMermaidDiagrams`：
   交给 `@stylewx/preview` 在 Chromium 里跑**官方 mermaid**（node_modules 注入，无 CDN）→
   SVG → canvas 位图化（2x 白底 PNG）→ `saveImageAsset` 落资产库 → 替换成 `<img src="/editor/api/asset/…">`。
3. 发布时 relocate 把资产 URL 搬到微信素材库（与用户上传的截图同一条已验证通道）。
   编辑器防抖 300ms 一发渲染，靠内存缓存 + 资产文件内容寻址兜底。

**为什么必须出 PNG 而不是内联 SVG**：mermaid SVG 依赖大量 id（url(#…) / marker / clipPath），
微信剥 id（validator 的 `svg-url-ref-broken` 会直接报错），SVG 原样发到读者端必裂。

**三个实测踩到的坑**（2026-09，修的都是既有管线的 bug）：

- **`escapeAttr` 不转义 `>`**（有意为之，带引号的属性值里 `>` 合法），于是 `data-swx-src` 里的
  mermaid 箭头 `-->` 会把天真正则 `[^>]*>` 的「标签结束」提前截断。service 的占位符正则必须写成
  `(?:"[^"]*"|[^>"])*` 风格吞掉整个带引号属性。
- **`relocate.ts` 递归漏传 `resolveLocal`**：`processImages(child, client, result)` 少了第四个参数，
  导致所有嵌套在 section 里的正文图片（第 1 层起）发布时都走 HTTP 下载而不是本地资产解析。
  相对资产 URL 在 `new URL()` 直接 throw —— 也就是说**修复前用户的本地图发布时根本搬不动**。
- **multipart 结束 boundary 前缺 CRLF**：`client.uploadMaterial` 的图片分支在数据 part 后直接接
  `--boundary--`，视频分支反而有前置 `\r\n`。微信对 add_material 的文件嗅探按规范解析时
  文件尾损坏，报 40113 unsupported file type（同字节手工加 `\r\n` 直连即成功）。
  这是「上传图片偶发 40113」的根源。

**验证**：`node apps/mcp-server/scripts/probe-mermaid-wechat.mjs` —— 渲染 → 真实 draft/add →
draft/get 回读，断言 `<img src="mmbiz…">` 存活且无 `url(#` 引用（会真实写一条 [probe] 草稿，可删）。

## 25. 编辑器「另存为」：文件管理器式选位置

**两代实现，第一代有真问题**：

1. 最初用 `window.prompt` 问文件名 —— 被 Chrome 的「阻止此页面创建更多对话框」
   静默禁用后 `prompt()` 直接返回 null，前端静默退出，表现为「点了没反应」
   （而且连提示都没有）。本地 Web 应用**不要用原生对话框**做关键交互。
2. 第一版弹窗只能选文章根目录内的位置 —— 用户合理质疑：为什么不能像文件管理器
   一样选任意路径？

**现行设计（便利与安全的折中）**：

- 浏览范围 = **允许写入的根**（`writeRoots()`：文章根目录 + 用户主目录，
  可用 `STYLEWX_WRITE_ROOTS` 追加，如把文章库放其他盘）。弹窗从「此电脑」层
  （列出允许根）逐层进入，行为对齐文件管理器；上次保存位置优先打开。
- **为什么不全盘开放**：编辑器是 HTTP 服务（localhost:3777），`/editor/api/*`
  能被本机任意浏览器页面以 CSRF 方式打 —— 全盘写 = 任何网页可写启动项/SSH config。
  主目录白名单已覆盖「文章放哪都行」的常见场景，系统位置天然在主目录之外。
- `list-dir` / `make-dir` / `save-file` 三个端点共用同一道 `isInsideAnyRoot` 闸门；
  盘根符号链（`c:` → `c:\`）在前端 `joinPath`/面包屑里统一处理。

**教训**：加「目录浏览」这类能力时，浏览是只读的可以放宽，但**写入口子必须白名单**；
且白名单的默认值要覆盖 90% 的真实需求（主目录），否则用户会反过来要求全盘开放。

