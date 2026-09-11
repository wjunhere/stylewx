# stylewx 设计说明

本文记录关键设计决策、约束与测试覆盖情况。

## 1. 为什么新增 `packages/service`

题目给定的结构为 `core/theme/validator/publisher/preview + apps/mcp-server/api`，
但明确要求 MCP 与 REST「复用同一套 service 层，不重复实现逻辑」。`analyze_article`、
`generate_theme`、`render_preview` 等是跨包编排逻辑，若在每个 app 里各写一份会重复。
为此新增一个轻量 `@stylewx/service` 包，只做编排，不含重型依赖：
MCP Server 与 REST API 都只调用它，实现真正的复用。

## 2. 同构边界

`core / theme / validator` 三个包**不 import 任何 DOM / Node 独有 API**：

- 不引入 `window`/`document`/`navigator`；不引入 `node:fs`/`node:path`/`process`。
- `core` 使用 `juice` 做 CSS 内联：juice 底层用 cheerio（服务端 HTML 解析，无需浏览器全局），
  且我们通过 `webResources: { links, images, scripts, svgs: false }` 完全关闭网络抓取，保持无头可复现。
- `validator`、`theme` 同样纯函数；微信图床域名白名单、CSS 白名单都在 `theme` 单一来源，`validator` 复用。

## 3. 微信 API 只在 publisher

所有微信网络调用（`token`、`material/add_material`、`draft/add`）只出现在 `@stylewx/publisher`。
`service` 通过依赖注入拿到 `WeChatClient`/`LlmClient`，`mcp-server`/`api` 在入口从环境构建它们。

## 4. 统一错误格式

MCP 与 REST 的错误统一为：

```json
{ "error": { "code": "…", "message": "…", "hint": "…" } }
```

- MCP 通过 `isError: true` + 文本 JSON 返回。
- REST 通过 `{ status, json: { error } }` 返回，状态码映射见 `apps/api/src/app.ts`。
- `hint` 是给 Agent 的下一步指引（如「请配置 WECHAT_APP_ID」）。

## 5. 测试策略：用注入 fetch 而非 nock/msw

`publisher` 的微信 API 测试采用**依赖注入的 mock fetch**（构造 `WeChatClient` 时传入自定义 `fetchImpl`），
而非 nock/msw。理由：全局 fetch 走 undici，nock 对 undici 的拦截兼容性不稳定；
注入 fetch 完全确定、零额外依赖，同样达成了「mock 微信 API、无真实网络」的目的。

## 6. 微信兼容白名单（三档，基于真实微信实测校准）

白名单常量在 `@stylewx/theme/src/css-whitelist.ts`。我们用**真实公众号**对 `draft/add → draft/get` 做了实测：
微信的「草稿 API」其实只过滤极少数内联样式属性，其余基本保留。据此把策略改为三档：

- **SAFE**（放行，无提示）：字体/文本、盒模型、纯色背景、边框/圆角、基础 display/列表等。
- **GRAY**（放行 + warning）：`float`、`transform`、`animation`、`transition`、`box-shadow`、`display:flex`、
  `flex-*`、`opacity`、`top/left/z-index`、`gap`、渐变 `background-image` 等 —— 微信**草稿 API 实测保留**、
  **Chromium 移动端实测可渲染**、**真实编辑器（ProseMirror）实测保留并渲染**；仅读者端最终显示需真机核对，
  故不硬禁止，只提示。
- **BANNED**（硬禁止 error）：`position`、`filter` 等**草稿 API 实测会过滤**的属性，以及结构层危险内容
  （`<style>`、`<script>`、`on*` 事件、`javascript:` 链接）。

> 三层实测证据（缺一不可，均用真实公众号 / 真实浏览器完成）：
>
> 1. **草稿 API**（`draft/add → draft/get`，这是我们发布草稿走的唯一路径）：
>    保留 `float/transform/animation/box-shadow/display:flex/opacity/top/z-index/gap/!important` 等；
>    **裁掉 `position`、`filter`**，以及 `<style>`、`<script>`、`on*` 事件、`javascript:` 链接。
> 2. **真实图文编辑器**（kimi-webbridge 驱动 Edge 里的公众号，往 ProseMirror 正文粘贴含 `position:absolute`/`filter`/
>    `transform`/`box-shadow` 的 HTML）——**编辑器本身极宽容**：DOM 完整保留**全部**内联样式（含 `position`、`filter`），
>    且计算样式真实生效（`position=absolute`、`transform=matrix(...)`、`box-shadow=red 0 0 10px`、`opacity=0.5` 均读出）。
>    **即：真正的清洗发生在草稿 API 层，不在编辑器。**
> 3. **Chromium 移动端**（390px 视口 `getComputedStyle`）：gray 属性全部能渲染。
>
> 推论：对「无头排版 → 直接写草稿 API」的管线，`position/filter` 在 API 层即被裁，永远到不了读者端，
> 列为 BANNED 是**证据驱动、正确且安全**的。（编辑器虽会显示它们，但保存后仍会被草稿 API 裁掉。）
> 唯一未覆盖的是**读者移动端最终渲染**（需真机发布后才能核对），故 GRAY 仍以 `warning` 保留谨慎。

## 7. 测试覆盖

核心包（要求 ≥ 80%）实测：

| 包 | 覆盖率 |
| --- | --- |
| `@stylewx/core` | 100%（lines/statements） |
| `@stylewx/theme` | ~95% |

`@stylewx/validator` 实测约 85%。core / theme 的 vitest 已配置 `thresholds`（≥80%）强制约束。

## 8. 安全边界

- 只实现 `draft/add`（发布到草稿箱）；**未实现** `freepublish/submit` 群发。
- 所有凭据只从环境读取（`.env`），已在 `.gitignore` 排除，绝不提交。

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

## 10. 已知限制

- 主题内嵌代码不做逐 token 高亮（无 highlight.js / 网络依赖），由主题统一修饰 `pre/code`。
- `render_preview` 截图依赖本机安装 Chromium：
  `pnpm --filter @stylewx/preview exec playwright install chromium`。
  未安装时服务降级为返回 HTML + 校验报告（不崩溃，可正常发布），并提示安装。
- 微信草稿箱编辑器加载 `draft/add` 建的草稿时以简化视图显示（不完整渲染内联样式）；看点用「预览/发表」的读者端。

## 11. 富组件库（`@stylewx/components`）

目标：让文章不只是「Markdown 换字体」，而是能插入图片组、卡片、时间线、轮播、点击展开、
背景纹理这类**像人精心编辑过**的元素，并且这些元素在微信读者端真实生效。

### 11.1 为什么单独建包

组件既需要「把一段 Markdown 渲染成 HTML」的能力（在 `core`），又需要主题配色（在 `theme`）。
若直接写进 `core`，`core` 会同时承担渲染管线与组件实现两件事；若独立包直接 import `core`，
则形成 `core → components → core` 循环。最终方案：

- `@stylewx/components` 只做**指令解析 + 组件渲染**，不 import `core`；
- `core` 依赖 `components`，并在 `RenderContext` 里注入 `renderMarkdown` / `renderChildren` 两个回调；
- 组件目录（`catalog.ts`）是「有哪些组件、怎么写」的单一事实来源，同时驱动 MCP 工具 `list_components`。

### 11.2 语法与嵌套

`:::name{props}` … `:::`，闭合冒号数必须与开启一致；嵌套时外层用更多冒号。
解析器按冒号数匹配栈帧，并做三件容错：代码围栏内的 `:::` 不解析、未闭合组件在文末自动闭合、
非 callout 组件若带尾随文本则不当作开启（避免「一行写多个 `:::` 导致后续内容被吞」）。

### 11.3 微信端约束是设计输入，不是事后修补

在写任何组件之前，先用真实公众号跑了 `draft/add → draft/get → Chromium` 的实测
（脚本：`apps/mcp-server/scripts/probe-wechat-capabilities.mjs`、`packages/preview/scripts/probe-wechat-svg.mjs`），
得到下面这张「可用性表」，组件设计直接建立在它之上：

| 能力 | 实测结果 | 对设计的约束 |
| --- | --- | --- |
| `<svg>` + `<animate>` / `<animateTransform>` | 保留且真实触发 | 交互全部用 SVG + SMIL |
| `begin="click"` | 保留且可点击触发 | 点击展开用 SMIL 事件，不用 `<details>` |
| SVG 属性大小写 | 被小写化（`viewBox`→`viewbox`） | 浏览器解析器会纠正，照常写驼峰 |
| `id` 属性 | **被剥离** | 禁用 `url(#…)`、`<use>`、渐变/裁剪/遮罩引用 |
| SVG 内 `<a>` | 被移除 | SVG 里不做链接 |
| `href="#…"` | `draft/add` 报 errcode 45166 | 目录组件只做视觉编号，不给锚点 |
| `<details>` | 被剥离（只剩 `<summary>`） | 不能依赖原生折叠 |
| `position` / `filter` | 被过滤 | 布局只用 `flex` + `gap`，重叠靠 SVG 绘制顺序 |
| `flex` / `gap` / `background-image` 渐变 / `box-shadow` / `transform` | 保留 | 卡片、网格、纹理背景可用 |
| 外链 `<img>` / SVG `<image>` | 会被拦截 | `publisher` 搬运时同时处理 `<img src>` 与 `<image href>` |

### 11.4 主题联动

组件配色由 `buildPalette(tokens)` 从主题 token 派生（主色、文字色、圆角、间距等），
主题 Schema 新增 8 个**可选** token（`accentColor` / `cardBg` / `dividerColor` / `radius` 等），
老主题不填也能正常工作——因此 26 套预置主题零改动即可驱动全部组件。

### 11.5 端到端验证

`apps/mcp-server/scripts/verify-wechat-showcase.mjs` 把 `examples/component-showcase.md`
渲染后真实发布到草稿箱，再取回逐项核对：**23/23 项存活**，8 张外链图（含 4 张 SVG `<image>`）
全部搬运为 `mmbiz.qpic.cn`，且 `script` / `class` / 页内锚点均不存在。

## 12. HTML 反向导入（可编辑闭环）

**问题**：渲染产物是 HTML，编辑器只认 Markdown。用户手里只剩 `.html` 时无法继续改。

**关键实测**：微信 `draft/add → draft/get` **完整保留 `data-*` 属性**（含 SVG 元素）。
（脚本：`apps/mcp-server/scripts/probe-wechat-data-attrs.mjs`）

**方案**：渲染时在组件根元素写入机器可读标记，导入时据此精确还原，而不是猜。

- `data-swx` = 组件名；`data-swx-props` = URL 编码的参数；`data-swx-body` = Markdown 正文容器。
- 结构化正文（时间线 / 步骤 / 对比表 / 图库 / 轮播 / 点击展开 / 单图）额外把原始正文写进 `data-swx-src`，
  导入时直接取用——DOM 还原对 `- 2023 | 启动` 这类结构化文本会失真。
- 标记注入集中在 `renderComponent()`（对返回结果的首个元素打标），因此 22 个组件渲染器无需各自改动。

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

## 14. 从「一步成稿」到「小原语 + 分步迭代」

早期工具面偏向「一次调用产出成品」：`render_preview` 每次都返回整篇 HTML + 截图，
改一个颜色也只能整包重新生成主题。长文迭代时既费上下文又费 LLM。

调整为：MCP 提供**可组合的小原语**，agent 分步做，人在本地编辑器收尾。

### 新增的三个原语

| 工具 | 职责 | 与旧路径的区别 |
| --- | --- | --- |
| `tweak_theme` | 在现有主题上确定性修改 token / 元素 CSS | 不调用 LLM，秒回；替代「改一点就重生成」 |
| `render_fragment` | 只渲染一段，返回组件清单 + 诊断 + 校验 + 截图 | 默认**不返回 HTML**，逐段迭代不撑爆上下文 |
| `save_article` | Markdown 落盘 + 返回 `editorUrl` | 建立「agent 生成 → 人微调」的交接点 |

`tweak_theme` 的纯函数实现放在 `@stylewx/theme`（`tweak.ts`），service 层负责解析主题名、
校验与可选截图；写入路径限制在 `STYLEWX_ARTICLES_DIR`（默认 cwd）内，防目录穿越。

### 交接闭环

```
save_article → { path, editorUrl }
editorUrl = <STYLEWX_EDITOR_URL>/editor?file=<绝对路径>
编辑器 GET /editor/api/load-file?file=…（同样限制在文章根目录内）
```

`verify-handoff.mjs` 验证：落盘 → 用返回的 editorUrl 从编辑器端点读回 → 内容逐字节一致。
编辑器侧还有 Playwright 用例覆盖「越权路径被拒绝（`path_not_allowed`）」。

### Skill

仓库内置 `.agents/skills/stylewx-article/`（项目级、随 git 分发）：
`SKILL.md` 写工作流与选型原则，`references/` 放微信硬约束与主题配方，
遵循渐进披露——只有描述常驻上下文，细节按需加载。

## 15. 组件样式覆盖（让 agent 能改组件内部）

### 问题

组件此前是「半固定」的：颜色/圆角/字体/间距跟主题 token 走，但组件的结构尺寸与内部字号
（卡片标题 15px、左色带 4px、徽章胶囊圆角 999px、时间线圆点 11px…）共 144 处写死在渲染器里，
主题和实例都改不到。agent 想「把卡片标题调大一点」只能放弃或用实例 HTML。

### 三种寻址

在主题上新增 `components` 段，按 `组件名 → 部位 → 声明` 三层寻址：

| 键 | 命中 |
| --- | --- |
| `root` | 组件最外层 |
| `*` | 组件内所有元素（适合统一字体/颜色/行高） |
| 语义部位 | 渲染器用 `data-swx-slot` 标记的部位（title / body / footer …） |

再加实例级 `style` 参数做一次性微调。优先级：`*` → `root` 或部位 → 实例 `style`。

### 关键取舍

**没有采用「把 144 处硬编码抽成 token」的方案**：那个方案成本高（26 套预置主题要重新校准），
但自由度只到「组件级」——依然改不了「卡片标题栏」。改为在渲染后做样式合并后处理，做到**部位级**，
且不需要改动 22 个渲染器的主体逻辑。

**标记的产出是有条件的**：`ctx.slot()` 只在「该组件确实配置了覆盖」时才输出 `data-swx-slot`。
未配置覆盖时输出与改造前**逐字节一致**（有回归测试比对整篇 showcase 的 HTML）。
这既避免了每次渲染都做解析/序列化的开销，也保证既有主题零影响。

**`data-swx-slot` 是渲染期临时属性**，应用覆盖后立即剥离，不会进入最终产物、不发给读者。

**诊断而非静默**：主题里写了组件不存在的部位，会返回
`主题里为 :::card 配置了「xxx」部位，但该组件没有这个部位，覆盖未生效。`，
提示 agent 去看 `list_components` 的 `slots` 字段。

**登记表自校验**：`COMPONENT_SLOTS` 是「哪些部位可用」的对外契约。
`components.test.ts` 用一份「把所有部位都写出来」的样本逐项渲染，断言每个声明的部位都能被真实命中，
并断言登记表里的每个组件都有样本——登记表与实现一旦漂移就会测试失败。

**安全**：覆盖值仍走真实微信实测的白名单校验，`position` / `filter` 直接报错；
实例级 `style` 也会被 validator 逐元素检查。

## 16. 自定义组件（F 能力：agent 造新组件）

### 目标

内置 22 个组件是菜单，自定义组件让它变成**可扩展的**：agent 遇到「内置覆盖不到」的表达
（数据对比条、评分卡、CTA 块…）时，可以先定义一个组件，再在正文里用 `:::名字` 调用。

### 模板引擎（`packages/components/src/user-component.ts`）

刻意保持最小语法，够用且好教：

| 写法 | 含义 |
| --- | --- |
| `{{prop}}` / `{{prop\|raw}}` | 参数（默认转义） |
| `{{body}}` | 正文（Markdown 已渲染） |
| `{{theme.primary}}` | 主题配色，避免写死颜色；换主题自动跟随 |
| `{{#if}}` / `{{#unless}}` | 条件块（支持嵌套，用配对计数提取） |
| `{{#each body}}` | 按正文非空行迭代，块内 `{{this}}` / `{{this.0}}` / `{{@index}}` |

没有做完整模板语言：模板越强，agent 越容易写出难调试的东西，而微信能用的 HTML 子集本来就窄。

### 安全闸门

`save_component` **不是把模板存下来就完事**——它会用一个「把所有参数都填上」的样例输入先渲染一遍，
再跑 `validateHtml`，不通过直接拒绝。这样 `script`/`style`/`iframe`、`on*` 事件、
`position`/`filter` 在**定义阶段**就被拦下，而不是等到发布时才炸。

组件名也做了约束：小写字母/数字/连字符，且不能与内置组件重名。

### 两个方向的自查诊断

模板与调用方之间的「静默失效」有两类，都通过 diagnostics 点出来：

1. 模板引用 `{{x}}` 但调用没给 `x`（且不在 `#if` 里）→ 提示缺失。
   `#if` 内的参数视为可选，不报警——这正是 `#if` 的用途。
2. 调用给了 `x` 但模板完全没用到 → 提示「可能拼错了参数名」。
   这类错误在原型阶段最常见，且肉眼极难发现。

### 与既有机制的复用

- **样式覆盖**：模板里的 `data-swx-slot` 就是部位声明，因此自定义组件**天然支持**主题级
  `components.<名字>.<部位>` 覆盖，不需要额外适配。
- **往返导入**：自定义组件按 raw body 处理，原始正文存进 `data-swx-src`，
  HTML 导入可无损还原成 `:::名字{…}`。
- **组件库文件**：`~/.stylewx/components.json`，与主题库同一套模式（fs 只在 service 层）。
- **工具面**：`save_component` / `delete_component`；`list_components` 合并自定义组件并用
  `origin: "user" | "builtin"` 区分。

## 17. 自定义组件在编辑器里可见（打通 agent 与人的汇合点）

### 问题

自定义组件定义后存进了 `~/.stylewx/components.json`，MCP 侧 `list_components` 也能查到，
但编辑器的「富组件」面板是一份**写死在 `editor.html` 里的 22 项静态数组**——
人在编辑器里既看不到 agent 定义的组件，也不知道自己有哪些可用。两条链路是断开的。

### 改法

**不把内置列表搬到后端**：编辑器手写的 22 个片段带中文标签和贴心的占位值
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
修好之后，人的**可调范围**从「内置 22 个」扩到了「内置 + agent 造的任意组件」，
而且新增组件**刷新即见**（每次打开面板都重新拉取，无需重启）。

### 顺带修的一个控制台报错

清空编辑器后仍会去打 `/editor/api/render`，后端对空 markdown 返回 400，
控制台白刷一条错误。已在前端加空文档短路。
