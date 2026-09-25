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
校验与可选截图；写入路径限制在 `writeRoots()`（文章根目录 + 用户主目录，可用 `STYLEWX_WRITE_ROOTS`
追加）内，防目录穿越。编辑器「另存为」弹窗可像文件管理器一样逐层浏览到这些根的任意位置，
但系统位置（`C:\Windows` 等）天然在主目录之外，不可达 —— 见 §21.11。

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
且不需要改动各渲染器的主体逻辑。

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

内置组件是菜单，自定义组件让它变成**可扩展的**：agent 遇到「内置覆盖不到」的表达
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
客户端不再逐个请求（24 个组件逐个渲染会很慢）。

示例 Markdown 的来源：
- 内置组件用 `COMPONENT_CATALOG[].example`（组件目录里的权威示例，已有测试保证每个示例
  都能解析成对应组件）
- 自定义组件用 `defaults` 预填参数 + 两行示例正文（兼容 `{{#each body}}` 的 `this.0`/`this.1`）

**渲染隔离**：每个预览放在独立 iframe（`sandbox="allow-same-origin"`）里，
组件的内联样式不会污染编辑器界面，主题切换后重开即刷新。

**页内交互**：左侧可搜索列表（内置/自定义分组），右侧 390px 预览 + 可定制部位提示 +
示例源码（可复制）+ 「插入到正文」。「富组件」面板顶部也放了入口。

### 验证

`test-editor-component-library.mjs`（Playwright）：入口可见、共 24 个组件、分组正确、
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

## 19. 品牌记忆系统（brand-store）

### 19.1 为什么把「设计」交给 agent 而不是 MCP

最初 `generate_theme` 把 LLM 调用封装在 service 层，于是 MCP 需要单独配置
`LLM_BASE_URL/KEY/MODEL`——而调用方本身就是 agent，手里已经有模型。这层封装是多余的，
还导致「两个大脑各自设计」的不一致。

改造后的职责划分：

| 谁 | 做什么 |
| --- | --- |
| agent | 理解品牌气质、读文章、推导色板、写主题 JSON 与组件模板（**设计决策**） |
| MCP | Schema/白名单校验、编译、落盘、渲染、发布、往返导入（**确定性工程**） |

`generate_theme` 因此降级为「无 agent 场景（REST API）的回退」，不再是主路径。
`brand_interview` 只返回问卷数据、`brand_save` 只做校验与落盘，都不烧 LLM。

### 19.2 双轨档案

`~/.stylewx/brands/<name>/`：

- `profile.json` —— 结构化真相源（完整主题 + 品牌专属组件 + voice/taboos + learnings）。
  MCP 直接消费。
- `brand.md` —— 人可读的「品牌宪法」，由 profile 渲染生成，人可以直接编辑补充；
  改完重新 `brand_save` 即可生效（同名覆盖时 voice/taboos/learnings 保留，不丢迭代记录）。

不做「markdown 反向解析回结构」：md 里塞 15 个 block 与 HTML 模板既不美观也易碎。
真相源放在 JSON，md 负责人读与 agent 上下文注入。

### 19.3 色彩论证（rationale）作为强制闸门

`brand_save` 要求 `rationale` 非空且 ≥10 字，否则报错。理由：色彩必须**采样自真实来源**
（品牌资产 / 内容真图 / 内容文化语境），凭空选色等于从模型先验抽签——抽出来永远是那几个网红色。
写不出「为什么是这个色」就说明在抄配方。这是把「防 AI slop」从口头约定变成机器约束。

### 19.4 主题 blocks 补全

主题 Schema 要求 15 个 block 齐全，但 agent 直出时通常只写关键项（h1/h2/p/blockquote…）。
`theme` 包新增导出 `completeThemeBlocks(partial)`：缺省 block 用中性样式补全，
让 `brand_save` / 未来的 agent 直出路径都能只写关键 block。降低产出门槛，不牺牲校验强度。

### 19.5 review_article：把品味判断拆成确定性与定性两半

确定性部分（工具做）：标题/正文层级比（h1≥2.0、h2≥1.5）、组件堆砌（类型 >6 种、密度 >4/千字）、
主题独特性（与预置主题完全相同 → 缺品牌感）。

定性部分（agent 做）：眯眼测试、AI 感自查、Keep/Fix/Quick Wins 清单。工具返回
`qualitativePrompt` 提示 agent 完成。

### 19.6 踩过的坑：prop() 空字符串与 `??`

`renderCanvas` 里 `const bg = prop(p,'bg')`，`prop()` 缺参返回**空字符串**而非 undefined，
于是 `bg ?? palette.canvasBg` 不短路，`backgroundColor` 变成 `''` 被 `css()` 丢弃 ——
**所有靠 `canvasBg` token 的暗色整页主题背景全部静默失效，且无任何诊断**。

同函数里 `padding` 的注释正好写了这个坑（「用 `||` 而非 `??`」），`bg` 行自己踩了。
已在对比测试中发现（暗场主题截图亮度 236 → 修复后 46）并修复。

教训：`prop()` 这类「缺省返回空串」的取值器，判空一律用 `||`；`??` 只对 null/undefined 有效。

### 19.7 踩过的坑：原生 FormData 在 undici 下 body 被吞

`uploadMaterial` 原用 Node 原生 `FormData` + `Blob`。实测对照：

| 方案 | 结果 |
| --- | --- |
| 原生 FormData + 原生 Blob | ❌ `41005 media data missing` |
| undici FormData + 原生 Blob | ✅ |
| 手动构造 multipart 字节体 | ✅ |

在 undici fetch（尤其挂 `ProxyAgent` dispatcher）下，原生 FormData 的 body 会丢失。
改为手动构造 multipart 字节体，不依赖任何 fetch 实现对 FormData 的支持，测试全绿。

---

### 19.8 品牌主题同步进主题库（一个「agent 能用、人选不到」的不对称）

**症状**：品牌建好了，编辑器主题下拉里却找不到它。

**原因**：`brand_save` **只把组件写进组件库，没把主题写进主题库**：

```ts
saveUserComponent(c)   // 组件 → ~/.stylewx/components.json  ✅
// 主题 → 只写 profile.json，没调 saveTheme          ❌
```

`profile.json` 是 agent 的真相源（`brand_apply` 会把它交回调用方，这条链一直是通的），
但**编辑器主题下拉读的是 `themes.json`**。于是出现不对称：agent 自动排版没问题，
人想在编辑器里切到品牌主题却选不到。实测踩到——`hippie-youth` 品牌装配完整、渲染零错误，
主题库里就是没有它（老品牌 `ink-ledger` 同样如此，说明是一贯行为，不是偶发）。

**防线**：

1. `brand_save` 保存后调 `saveTheme(theme)`；主题名已被强制对齐为品牌名，覆盖写入幂等。
2. `brand_apply` 也同步一次——品牌可能是**早期版本**建的（那时只写 profile），
   或用户手改过 `themes.json`；这里补齐，保证 `brand_apply` 之后编辑器一定能选到。
3. `BrandStoreOptions` 加 `themesFile`（测试隔离用）。
4. **测试隔离**：`mcp.test.ts` 的品牌用例原先只隔离了 `STYLEWX_BRANDS_PATH`，
   现在 `brand_save` 会写主题库，不隔离就会把测试主题 `tide-notes` 写进用户真实主题库。
   一并隔离 `STYLEWX_THEMES_PATH`。
5. 断言加在品牌生命周期用例里：`list_saved_themes` 必须能看到该品牌主题。
   （已验证这条断言有效——临时把 `saveTheme` 去掉，用例立刻报
   `expected [] to include 'tide-notes'`。）

**注意**：这条只解决「人选不到」。品牌主题与预置主题仍是两件事（见 §21.7 边界二），
主题库里多一个 `origin: saved` 的条目，不改变「品牌色不进 390px 画布」那条边界。

## 20. 浏览器登录态发布（绕过 API IP 白名单）

### 20.1 问题

`draft/add` 要求调用方 IP 在公众号后台白名单内。校园网 / 多出口 NAT 环境下出口 IP 会漂移
（实测一天内见到 `153.3.21.105` / `153.3.21.153` / `36.152.24.135`），逐个加白名单追不上；
用代理固定出口又会让日常上网受影响，且 Clash 的 `GEOIP,CN → 直连` 规则还会让微信域名绕过代理。

### 20.2 方案：复用浏览器登录态

`apps/mcp-server/scripts/publish-via-browser.mjs` 通过 kimi-webbridge 桥接操控**已登录的浏览器**，
在公众号编辑器页里写正文、传封面、点「保存为草稿」——走后台自己的保存接口，无 IP 白名单约束。

### 20.3 选型：为什么最终用 kimi-webbridge 而不是 opencli

两条路都试过，关键差异在**能否上传本地文件**：

| 能力 | opencli | kimi-webbridge |
| --- | --- | --- |
| 复用登录态 | ✅ 扩展桥接 | ✅ 扩展桥接 |
| 页面内 evaluate / CDP | ✅ | ✅（含原始 `cdp` 透传） |
| 上传本地文件 | ⚠️ `upload` 需自行唤起并接收文件选择器，隐藏 input 场景必失败 | ✅ `upload` 工具，需扩展开「允许访问文件网址」 |
| 元素定位 | CSS / 语义（**语义可退化模糊匹配**） | snapshot 的 `@e` ref（精确） |

`DOM.setFileInputFiles` 在 `chrome.debugger` 沙箱下返回 `Not allowed`（协议层硬限制），
所以真正的出路是扩展自带的 `upload` + 文件访问权限。

### 20.4 技术要点（实测得出）

| 环节 | 结论 |
| --- | --- |
| 正文编辑器 | `.rich_media_content .ProseMirror`。页面上有 **两个** `.ProseMirror`：`[0]` 是标题编辑器（高 30px），`[1]` 才是正文（高 366px）——按所属容器选择最稳 |
| 写入方式 | `execCommand('insertHTML')` 有效，section/span + 内联样式完整保留。合成 `ClipboardEvent('paste')` 无效（ProseMirror 校验事件可信度）；后台窗口 `document.hasFocus()` 为 false，系统剪贴板与 `navigator.clipboard` 都不可用 |
| 外链图片 | 编辑器自动上传到素材库，`src` 变 `mmbiz.qpic.cn` |
| 内联 SVG + SMIL | 完整保留 |
| 封面入口 | hover 才显示的 `pop-opr` 组，需先 DOM 显形；入口有「从正文选择 / 从图片库选择 / 微信扫码上传 / AI 配图」 |
| 封面弹窗 | 微信预渲染**多份 `0×0` 的模板副本**，必须筛「尺寸 > 200」的那个才是可见实例——用错实例会出现「点击完全无反应」 |
| 封面 file input | **只在封面弹窗打开时存在**，且与编辑器工具栏的插图 input 不同（封面那个 `accept` 含 `image/bmp`）。传错会把封面图插进正文 |
| 封面流程 | 图片库 → 点「上传文件」（唤起 input）→ `upload` → 自动选中 → 「下一步」→「编辑封面」→「确认」 |

### 20.5 安全约束：绝不用文本模糊匹配点按钮

构建过程中我用 opencli 的 `click --text "下一步"` 定位按钮，该参数在精确匹配失败时会
**退化匹配**，结果点到了页面上的「退出登录」，**导致账号被登出**（无数据损失，但需重新扫码）。

因此 `publish-via-browser.mjs` 定下硬约束：

1. **只用 snapshot 的 `@e` ref 点击**，不做文本模糊匹配
2. **ALLOW / DENY 双名单**：只允许 `保存为草稿 / 保存 / 下一步 / 确认 / 确定 / 完成`；
   命中 `退出登录 / 删除 / 取消 / 关闭 / 群发 / 发表` 立即中止

教训：自动化点「确认类」按钮时，相邻位置往往就是危险操作（退出、删除、群发）。
**定位方式必须精确且唯一**，且要有独立的危险名单兜底。

### 20.6 调用方式

脚本通过 HTTP 调 kimi-webbridge 守护进程（`http://127.0.0.1:10086/command`），
请求体一律用**文件**传递（Windows shell 会破坏内联 JSON 的非 ASCII 与转义）。

前置：浏览器扩展已登录公众号，且已开启「允许访问文件网址」
（`edge://extensions` → Kimi → 详细信息 → 允许访问文件网址），否则上传封面报
`upload needs Chrome's per-extension file access`。

### 20.7 可编辑性：选通道的第一判据

`draft/add` 写进草稿箱的文章**人在后台改不了**。判据只有一个：

```
draft/get 取回后，数 `leaf=` 出现次数
  leaf = 0   → 后台编辑器没认领，整篇是一个外部导入块，能看能删、改不进去
  leaf > 0   → 编辑器认领过，整篇可编辑
```

实测样本：`draft/add` 发的草稿 `leaf=0`；浏览器保存的 `leaf=30`；人手工写的 `leaf=49~97`。
两者在 `draft/get` 里读起来几乎一样，**只有这个计数能区分** —— 曾经因此把一篇文章
以「看起来正常」的状态发出去，人反馈「改不了」才发现。

**规则：给人看的稿子走浏览器通道；只有不需要人再动手的机器流程才用 `draft/add`。**

### 20.8 cua-driver 通道（Chrome，精确可控）

除 kimi-webbridge 外，还实测了 cua-driver。两者管的是**不同浏览器**：

| | kimi-webbridge | cua-driver |
| --- | --- | --- |
| 控制哪个浏览器 | **Edge**（扩展注入） | **Chrome**（CDP 绑定） |
| 机制 | 扩展在页面里执行 JS（`evaluate`） | CDP 语义快照 + ref 点击 |
| 会话 | 每次调用必须带同一个 `session` | 每个 session 都要重新 `browser_prepare` |
| 现成脚本 | `publish-via-browser.mjs` 已封装全流程 | 需自行编排 |

#### 为什么 Edge 不行、Chrome 行

同一台机器、同一版本驱动，只换浏览器：

| | Edge 153.0.4234.48 | Chrome 153.0.8010.53 |
| --- | --- | --- |
| `browser_prepare` | ✗ `no exact ... consent prompt appeared` | ✓ `status: ok` |
| 远程调试开关 | 被自己回滚成 `false` | 保持 `true` |
| 9222 监听 | 无 | 有 |
| 绑定 | 失败 | ✓ `binding_quality: exact`、`mutation_allowed: true` |
| 副作用 | 开设置页、勾开关、抢焦点 | **全部 `false`** |

根因：**Chrome 144+ 有 agent auto-connect 桥**。profile 已在监听时，cua-driver 读
`DevToolsActivePort` + 校验端口归属进程即可接上，**不需要勾设置、不需要确认框、不需要重启浏览器**。
Edge 走的是「自动勾选 + 等确认框」那条路，而确认框出现在它的检查窗口之后 → 回滚 → 失败；
手动点「允许」也无效。

**结论：Windows 上要 CDP 就用 Chrome。**

前置：`mcp.json` 的 cua-driver args 带 `--grant existing-profile`；
Chrome 的「允许远程调试」开关为 `true`（`Local State` → `devtools`）。

#### 演练过的完整链路

```
get_browser_state(pid, window_id)          → 绑定，拿 target_id + tab_id
browser_navigate(target, tab, url)         → 打开页面（refs 失效，必须重新快照）
get_browser_state(target, tab, query="…")   → 语义快照，拿 ref
browser_click(ref="p6:0")                  → 后台点击，不抢焦点
[draft/get 复核]                            → update_time 前进、leaf 不变
```

全程 `delivery.mode: background`、`foregrounding: not_requested` —— 不打断用户。

#### 六个坑

**① 快照会淹上下文。** 不加 `query` 的全页快照在公众号后台能吐出 3400 行 / 72KB。
必须用 `query` 或 `max_elements` 收窄。

**② 刷新即失效。** `browser_navigate` 之后旧 ref 全废，必须重新快照再拿 ref。

**③ `active` 是三态。** `true` 唯一证明是选中页、`false` 证明未选中、`null` 是原生证据分不清。
**`null` 时不要做写操作**，改用直接指定 URL 绕开。

**④ 点列表里的链接会开新标签页**（进的是预览页而不是编辑器）。直接 `browser_navigate`
到编辑 URL 更可控。

**⑤ kimi-webbridge 不带 `session` 时 `list_tabs` 恒返回空数组**，于是「扩展已连接」
但「找不到标签页」，很容易误判成断连。所有调用都要带同一个 session。

**⑥ 别用固定 token。** token 是会话级的，Edge 和 Chrome 登同一个号也会不同。
让页面自己 `location.href.match(/token=(\d+)/)` 取。

### 20.9 安全纪律

- **只用 snapshot 返回的 ref 点击，绝不用文本模糊匹配**（§20.5 的事故）。
- **删草稿前先列一遍同名条目并逐个确认。** 曾把用户亲手写的原生草稿当「重复」删掉。
- **不要盲按 `Ctrl+1/2/3` 切标签页** —— 看不清标签栏时靠猜位置，会误关页面。
  要切标签用 `zoom` 先读标签栏，或用 `browser_navigate` 直接指定 URL。
- **动剪贴板前先读原值，用完还原。** 曾把测试文本留在用户剪贴板里。

---

### 20.10 正文嵌入视频：实测结论（2026-09-25）

**结论：`draft/add` 这条路写不出能播的视频；只有浏览器走官方「视频」组件才行。**

#### 已实测：什么能存活、什么不能

用 `draft/add` 写入 5 种候选结构，再 `draft/get` 取回比对：

| 写入的结构 | `draft/get` 取回后 | 真浏览器渲染 |
| --- | --- | --- |
| `<iframe class="video_iframe" data-vid=... src=...>` | ❌ **整个 iframe 被删** | — |
| **`<mpvideo data-vid="apiv_…">`** | ✅ **完整存活**（属性都在） | ❌ **0×0，不可见** |
| `<mp-common-videosnap data-vid=...>` | ❌ 被剥掉 | — |
| `<iframe>`（不带 class） | ⚠️ 标签留着、**属性全剥** → `<iframe></iframe>` | 废 |
| `<section class="video_iframe">` | ✅ 存活 | ❌ 不生成播放器 |

**关键判据：`draft/get` 存活 ≠ 能播。** `<mpvideo>` 是唯一能完整持久化的，但读者端
它既不进微信的渲染白名单（页面脚本里 `video_iframe` 在列、`mpvideo` **不在**），
也不被升级成播放器 —— Playwright 实测它的 `getBoundingClientRect()` 是 **0×0**，
页面里也没有 `mpvideo.qpic.cn` 这个真实视频流域名。

**教训：以后判断「某结构能不能用」，必须走完 `draft/add → draft/get → 真浏览器渲染`
三步。只做前两步会得出「能用」的错误结论**（`mpvideo` 就骗过了前两步）。

#### 能用的路：素材库 + 浏览器 UI

素材接口是通的，实测可用：

```
POST /cgi-bin/material/add_material?type=video   → { media_id }
POST /cgi-bin/material/get_material              → { vid: "apiv_…", down_url }
```

- 上传成功，`get_material` 能拿到 **`vid`**（形如 `apiv_4709954571878367233`）
- `batchget_material?type=video` 能列出，`materialcount.video_count` 会 +1
- **API 上传限制：MP4、10MB 以内**（后台 UI 上传更宽松）
- 上传后**要过审**才能用；审核状态可用 `get_material` / 查询接口轮询

但**写进正文必须靠浏览器点官方「视频」组件**：编辑器工具栏有
`视频` / `视频号` 两个入口，弹窗里能看到**我们自己通过 API 上传的那个视频**
（实测：素材库列表显示 `stylewx 视频通路测试`），选中后由微信自己生成合法结构。
**API 无法自己拼出那个结构** —— 这也是为什么「上传走 API、插入走浏览器」是唯一组合。

#### 与 SMIL 的分工（别混用）

| | SMIL 内联 SVG | 视频 |
| --- | --- | --- |
| 何时开始动 | **打开文章即动** | **必须点一下** |
| 体积 | ~2.6KB/资产 | 25KB(3s) 起，GIF 更大 16 倍 |
| 半透明 | ✅ 支持 | GIF 只有二值透明 |

所以要「打开就有生命感」用 SMIL；视频是另一种媒介，不是动效的替代品。

#### Remotion 的定位

Remotion（4.0.52x）实测可用，3s/640×360 出 25.5KB MP4，产物能通过
`add_material?type=video` 上传（10MB 限制下轻松）。但它**不能产出 SMIL**——
它是逐帧渲染成视频的框架，官方明确不支持 SMIL/CSS 动画的 SVG。
**用途是「做视频内容」，不是「替换现有动效资产」。**

> **环境注意**：装 Remotion 时不要在仓库里 `pnpm add`——会把 2400+ 行写进根
> `pnpm-lock.yaml` 污染 monorepo。要装在**仓库外的独立目录**（或加进 workspace 并
> 约束），验证完删掉。踩过一次，已还原。

#### B 方案：浏览器脚本自动插入（已实现，待过审视频验证）

`publish-via-browser.mjs --video <名称>` 会在保存前完成插入。**探测到的关键 DOM（真实实测）**：

| 元素 | 选择器 | 备注 |
| --- | --- | --- |
| 「视频」工具栏入口 | `li.tpl_item.jsInsertIcon.video` | 精确 class，不必文本匹配 |
| 弹窗容器 | `.video-select-dialog` | 用**它**作作用域，避免全页误命中 |
| 素材库条目 | `.more-video__item` | 名称取 `innerText` 第一行 |
| 未过审条目 | `.more-video__item_disabled` | **必须跳过**，不能硬点 |
| 底部按钮 | `.weui-desktop-dialog__ft` 里的 `确定` / `取消` | `确定` 未过审时也是 disabled |
| 三个来源标签 | `素材库` / `视频链接` / `本地上传` | `视频链接` 支持公众号/腾讯视频链接 |

**安全设计（比封面更严）**：只在 `.video-select-dialog` 内查找；条目名用**精确相等**比对
（防同名误选）；`disabled` 一律跳过；出错时点「取消」回滚而不是留着半开弹窗。

**两个发现改变了设计**：

1. **`本地上传` 走的是原生文件选择器**，页面里不出现 `video` 类型的 `<input type=file>`
   （只有一个 `accept` 全是图片的隐藏 input）。扩展的 `upload` 驱动不了它 ——
   所以「绕开 API 的 10MB 限制」这条路**不通**，上传仍必须走 `upload_video`。
2. **占位标记能活过 ProseMirror。** `data-swx-video` / `data-swx-video-title` 经
   `execCommand('insertHTML')` 写入后**完整保留**（实测），因此插入点定位可靠。

#### ⚠️ 决定性发现：API 上传的视频**不能用于图文正文**

上一版这里写的是「等审核通过即可」。**实测推翻了它。** 轮询 25 分钟始终 disabled，
于是去读条目 DOM 里的说明，微信自己写得很清楚：

```html
<span class="more-video__item-status">上传完成
  <div class="weui-desktop-popover__desc">
    API上传完成，可用于自定义菜单、自动回复等场景。
  </div>
</span>
<label><input type="checkbox" disabled="disabled" ...></label>
```

**「可用于自定义菜单、自动回复等场景」——图文正文不在其中。** 这不是等待中的审核状态，
是**通道级限制**：`add_material?type=video` 上传的视频，在正文里就是选不中
（`li.more-video__item_disabled` + `input[disabled]` + 底部「确定」也 disabled），
**永远如此**，等多久都一样。

**推论**：`upload_video` 工具对「正文嵌视频」**没有用**。它的正确用途是自定义菜单/自动回复
（这仍是有价值的工具，但描述里不能说「用于正文」）。正文嵌视频只剩这些路：
人在编辑器点「本地上传」传本地 MP4 —— 因为**本地上传**走的是另一条通道。

#### 本地上传：kimi-webbridge 不行，cua-driver 只能做一半

**kimi-webbridge 完全不行**：点「本地上传」后页面里**不出现任何 `video` 类型的 `<input type=file>`**
（只有 `accept` 全是图片的隐藏 input，`MutationObserver` 也捕获不到新增）——
它唤起的是原生文件选择器，扩展无从插手。

**cua-driver 能做的部分**（走**原生 UIA**，不依赖页面 DOM，这是与扩展/CDP 的本质区别）：

| 步骤 | 能否 | 说明 |
| --- | --- | --- |
| 找到原生「打开」对话框 | ✅ | 它是 Chrome 的**独立子进程窗口**（pid ≠ 浏览器主进程），要按标题全桌面找 |
| 滤掉幽灵窗口 | ✅ | 见下 |
| 命中「文件名」输入框 | ✅ | UIA `ValuePattern.SetValue`，写完可回读核对 |
| **点「打开」确认** | ❌ **不行** | 见下 |

**为什么确认点不了**（这是本节的结论核心）：后台投递会**假成功**——
`click` 返回 `{"delivery":{"mode":"background"},"effect":"unverifiable"}` 看似 OK，
但对话框不关、文件不进；坐标点击直接报 `background_unavailable / uia_status: unavailable`。
试过且都无效的路径：`bring_to_front` 后再 Invoke、聚焦输入框 + `press_key Enter`
（`delivery_failed`，升 foreground 也无效）、`escalate_session`（`invalid_escalation_reason`）、
`get_desktop_state`（返回 0 元素，拿不到桌面层）。

**所以正确形态是「机器填好、人按回车」**（`scripts/lib/native-file-dialog.mjs`）：
机器负责找窗口、滤幽灵、命中输入框、拼对路径、回读核对；人负责最后那下回车。
**不要把它写成「全自动」** —— 曾写成自动点确认并报告成功，但那**不可复现**
（当时窗口恰在前台才蒙对）。一个「有时能用」的自动化比没有更糟：
它会半途停下，留下一个开着对话框的编辑器。

**两个实测踩到的坑**：

1. **幽灵窗口**：浏览器进程被杀后，它的「打开」对话框会**残留在系统窗口列表**里，
   标题完全相同，但只有 5 个元素、没有文件名框。只按标题取第一个会拿到死的那个。
   判据要用「有文件名框 + 有确认按钮」。
2. **`element_token` 每次快照都在变**：实测 `s00000027:121` → `s00000028:121`，
   只有后半截索引稳定。所以写入后的回读**不能按 token 比对**，要按 role+label 重新定位。

所以 B 方案的最终结论：**脚本能正确定位、开窗、识别、回滚（这些都已验证），
但在「API 上传的视频」这条数据源上注定插不进去**。要真正跑通，得先解决视频从哪来：

| 视频来源 | 能否用于正文 | 备注 |
| --- | --- | --- |
| `add_material?type=video`（API） | ❌ **不能** | 微信明说限菜单/自动回复 |
| 编辑器「本地上传」 | ✅ 能 | 原生选择器：扩展不行，**cua-driver 走 UIA 可以** |
| 视频号已发布视频 | ✅ 能 | 需先有视频号内容 + 授权 |

**`--video` 参数的代码保留**：逻辑正确、安全约束完整，一旦视频进了素材库的「可正文使用」
状态（例如人先用本地上传传过一个），它就能工作。但当前**没有可用的自动化数据源**。

## 21. 品牌体系（方向 B · 协议 Protocol）

界面外壳有一套独立于文章主题的品牌层。它与 26 套文章主题是两件事，边界写死在这里。

### 21.1 一句话与理由

**把「内核 + 协议」讲清楚：内容从 agent 流进内核，对齐、校验、再交回人手里。**

选这套而不是另外两套备选（A 铅字、C 双栏）的理由：产品是「无头内核 + 可校验」，
协议方向是唯一把这件事画进标志里的方案——一个校验帧，一个端点。另两套只能靠气质暗示。

代价说在前面：蓝色最安全，也最容易和一排开发工具撞脸。所以**等宽字标不能省**，
它是这套体系里唯一的差异点，任何场合都必须成套出现。

### 21.2 令牌：六个，唯一颜色来源

在 `apps/mcp-server/editor.html` 顶部的 `:root` 里。派生色只从这六个混出来，不新增原始色。

| 令牌 | 值 | sRGB | 用途 |
| --- | --- | --- | --- |
| `--bg` | `oklch(98.4% .002 250)` | `#f9fafb` | 冷纸：页面底、画布外底板 |
| `--surface` | `oklch(100% 0 0)` | `#ffffff` | 白面：侧栏、面板、卡片 |
| `--fg` | `oklch(17% .012 255)` | `#0c1015` | 墨：正文、标题、标记底色、主按钮 |
| `--muted` | `oklch(45% .010 255)` | `#52565b` | 次级墨：说明文字、图注 |
| `--border` | `oklch(90% .005 255)` | `#dcdee1` | 发丝线：分层、描边 |
| `--accent` | `oklch(46% .19 262)` | `#114cbf` | 校验蓝：选中态、聚焦环、链接、唯一一个实底按钮 |

三档状态色（浅色场合）：成功 `oklch(44% .16 152)`、警告 `oklch(45% .13 68)`、
失败 `oklch(50% .19 25)`。校验蓝在 262°、失败红在 25°，色相差 237°，
同一屏里「品牌」和「报错」不会互相误读。

暗底上校验蓝必须提亮到 `oklch(72% .15 262)`（对暗底 7.58:1），原色的 4.3:1 只够大字用。

**对比度实测**：`node scripts/brand/check-contrast.mjs`。21 项检查全部 ≥4.5:1（发丝线是
非文字项，门槛 1.2:1）。这个脚本同时会核对 `editor.html` 里的六令牌和本文档是否漂移，
所以改配色后**必须跑一次**。

### 21.3 品牌色只做状态，不做装饰

原编辑器 16 个变量里，`--brand:#2563eb` 同时当了按钮底、选中底、聚焦环、投影和链接色。
现在它退回四个位置，且**一屏里最多一个实底蓝**：

| 动作类型 | 颜色 | 例子 |
| --- | --- | --- |
| 编辑动作 | 墨色实底 / 描边 | 新建文章、保存到文件、导入导出、插入到正文、生成主题、AI 优化、保存快捷键 |
| 确认动作 | 校验蓝实底 | **只有一个：发布草稿箱** |
| 控件状态 | 校验蓝描边/浅底 | 侧栏选中、聚焦环、链接、标签页选中、开关 |

「强调预算」管的是装饰（眉毛小标、分隔、背景铺色）；**选中态、聚焦环、状态色不算预算**，
它们是控件状态，一个都不能省。这样一屏里可以同时看到蓝色描边和蓝色实底，而不会显得花。

### 21.4 分层：发丝线管边界，柔影管纵深

这条规则在「柔结构」改版（2026-09）时反过一次，两边的理由都留在这里。

**旧规则（`--shadow:none`）**：原来有三层蓝色投影（侧栏、顶栏、主按钮），叠在浅灰底上互相污染，
边界反而更糊，所以当时把投影全砍了。

**新规则（现在）**：投影回来，但换了个性质 —— 不再当「蓝色的强调」用，而当「环境光」用：
中性色相（从 `--fg` 混出）、极低透明、大半径扩散，且 `--shadow` / `--shadow-lg` /
`--lift-1/2/3` 三档各司其职（卡片静置 / 浮层 / 弹窗）。
这是「柔结构」视觉的签名，少了它整个界面就退回「加了描边的扁平」。

代价要说清：白面与纸底的明度差只有 **1.6%**，所以 1px 描边照旧撑住边界，
**描边不能删，也不能调得更浅**；柔影只负责纵深，不负责边界，两者不互相替代。
输入控件另有一套「凹槽」材质（`--plane-3` 底 + `--inset-shadow` 顶边内阴影），
与「浮起的卡」方向相反，两个方向都要有，界面才有纵深。

机器闸门：`check-editor.mjs` 现在断言柔影必须存在、至少两层、且从令牌混出
（硬编码 rgba/hex 一律拒绝），而不是断言 `none`。

### 21.4.1 柔结构的其余签名（同样被 check-editor 守住）

| 签名 | 令牌/规则 | 为什么 |
| --- | --- | --- |
| 面层级 | `--plane-1..4` | 纸底/白面/凹槽/深槽四档，控件陷、卡片浮 |
| 圆角档 | 8 / 12 / 18（`--m-r/--radius-sm/--radius`） | 大圆角 + 同心内角（外 18 配内 12） |
| 缓动 | `--ease: cubic-bezier(.32,.72,0,1)` | 禁止 linear / ease-in-out（无质量感） |
| 字号阶 | `--fs-micro/cap/body/lead/title` 五档 | 层级靠字重与颜色拉，不靠字号暴涨 |
| 入场动画 | `pop`（下拉）/ `sheet`（弹窗） | 只动 transform/opacity，GPU 安全 |

### 21.5 标志：校验帧 + 端点

| 形态 | 文件 | 场合 |
| --- | --- | --- |
| 主标 | `docs/assets/logo-mark.svg` | 56px 及以上 |
| 横式锁定 | `docs/assets/logo-lockup.svg` | 编辑器侧栏、文档页眉（标记与字标间距固定 9px） |
| 单字 `sw` | `docs/assets/logo-mono.svg` | favicon、头像、16px 以下 |
| 暗底反白 | `docs/assets/logo-inverse.svg` | 终端块、深色封面 |
| favicon | `apps/mcp-server/icon.svg` | 16px 简化版：去掉第三行，只留「外框 + 一行 + 端点」 |

- 外框 = 产品里恒定的 390px 预览帧；框内两行 = 文本层级；右下实心圆 = 端点，也是 MCP 调用链上的一个节点。
- 安全边距 ≥ 标记高度的 1/4。
- **禁用**：改成圆形或其它圆角、只取片段丢掉外框、把校验蓝当标记底色。
  标记底色恒为墨色（或暗底反白）——校验蓝属于状态与交互，不属于标志。

`editor.html` 里的 favicon 是内联 base64 的同一形状，因为 `/editor` 是独立页面，
不能依赖 `icon.svg` 的相对路径。

### 21.6 品牌物料生成

```bash
node scripts/brand/gen-brand-assets.mjs   # logo + banner（SVG 源 → PNG 2x）
pnpm brand:check                          # 上面两项 + 按钮层级与自包含检查（CI 也跑）
```

Banner 有 `docs/assets/banner-1280x420.{svg,png}` 与 `banner-640x200.{svg,png}` 两档，
README 用 `<picture>` 按宽度切换。右侧面板画的不是装饰，是真实调用链
（agent → mcp-server → service → core·theme），底部三个数字可以点数。

PNG 是给 GitHub 与 npm 用的：GitHub 渲染 SVG 时对 `<style>` 有限制，npm 页面不渲染 SVG。
**真相是 SVG**，改图改 SVG 再重跑脚本。

### 21.7 与文章主题的关系：两条边界

**边界一：品牌色不进入 390px 画布。** 画布里的每一处颜色都由当前文章主题决定，
切换主题时只有画布变色，外壳一动不动。画布里的 CSS 变量是 `--pc-accent`，与品牌令牌无关。

**边界二：品牌主色是品牌资产，不要求主题库跟随。** 26 套预置主题（6 原创 + 20 移植）
本次一字未改。`tech-minimal` 的 `#0b6bff` 是最容易和校验蓝混淆的一个，
解法不是改主题，而是让品牌蓝只以「外壳」身份出现。

### 21.8 编辑器改造清单（已完成）

1. 顶部 16 个变量 → 六令牌 + 派生色；`--shadow`/`--shadow-lg` 改为 `none`，改由 1px 描边分层。
2. 侧栏方形「M」→ 校验帧标记；字标字体由无衬线改**等宽**；favicon → 单字 `sw` 形状。
3. `.btn.primary` 拆开：新建文章/弹层动作用新加的 `.btn.ink`（墨色实底），
   复制到公众号退描边，**只有发布草稿箱保留实底蓝**。
4. 原生 `select`/`input[type=text]` 聚焦态：浏览器默认蓝 → `--accent` + 3px `--accent-soft` 外圈。
5. 校验结果行 → 胶囊，见下节。
6. 补上滚动条、`color-scheme`、`::selection`、`@media (prefers-reduced-motion)`。
7. 顺带修掉一个 bug：`.ai-*` 系列引用了**从未定义**的 `--blue`，实际渲染成继承色。现在统一到 `--accent`。
8. 工具条 SVG 图标线宽 `1.7` → `2.4`。图标画在 24 网格上、渲染 15px，`1.7` 折算只有 **1.06px**，
   而同一排的 B/S/H 是 700 字重——细到和文字不像一套。`2.4` 折算 **1.5px**，落在这套图标族的中间档
   （品牌标记大尺寸 `2.2`、16px 简化版 `2.6`，见 `scripts/brand/gen-brand-assets.mjs`）。
   **只改 `#toolbar`**：侧栏 `.btn` 与主题菜单的图标旁边有文字撑重量，保持 1.6/1.7 不动。
   代价是同屏里工具条图标比侧栏图标粗一档——这是刻意的，不是漂移。
9. 组件库参数表：以前只给「可定制部位」和示例 Markdown，**不给参数取值**，作者只能靠猜。
   现在按组件目录的 `props` 渲染一张**可编辑**参数表（枚举/布尔点 chip，其余给输入框），
   改动后下方预览实时重渲染，顶部「生成示例」把改过的参数重组回 markdown 写进代码块。
   四条约束：
   - **取值不在编辑器里写死**。`packages/service/src/previews.ts` 把 `props`/`notes`/`previewPrefix`
     透传出来，唯一事实来源仍是 `packages/components/src/catalog.ts`；那里同时把 14 个 tone 参数的
     `颜色名` 改成了显式枚举（从 `palette.ts` 的 `TONES` 派生）——`resolveTone()` 只认这 7 个名字，
     写别的会**静默回退到 primary**。
   - **只把用户真改过的参数写回 markdown**（判据 `values !== init`）。没动过的 token 原样保留，
     所以 28 个组件在不动参数时生成的示例与原始 sample **逐字一致**——否则示例会被整体重排，
     引号写法、参数顺序全变。
   - `toc` 单独渲染是空的（读的是**全文**标题），用 `previewPrefix` 补一段上下文；
     前缀**不进 example**，「插入到正文」「复制示例」拿到的仍是最小写法。
   - 自定义组件的参数名取 `defaults` ∪ 模板里的 `{{占位符}}`（按小写合并，因为解析器统一小写），
     模板用了但没声明默认值的也列出来——否则模板里存在一个参数、界面上却看不见。
   实时重渲染走已有的 `/editor/api/render`，加了个 `placeholders:true`：
   示例里的 `example.com` 要换成内联 SVG，不然改个参数预览就变一张裂图。

圆角档位从 10/14px 收到 **6/8/12px**（`--m-r` / `--radius-sm` / `--radius`），与品牌体系一致。
（柔结构改版后调为 **8/12/18px**，见 §21.4.1。）
触控高度：工具条按钮 32px、侧栏项 40px、主按钮 / 发布 40px+。
（柔结构改版后工具条 34px、按钮 38px，仍是文档 ≥32 的达标值。）

### 21.9 校验条为什么要胶囊

原来的校验结果是一行彩色文字，后面跟着若干条灰档提示。文字一多，颜色和语义就分不开了。

现在分两层（`setVal` / `renderVal`）：

- **常驻**：结论胶囊（`✓ 渲染完成 · 校验通过 · HTML 25255 字`）+ 统计胶囊（`0 硬禁止`、`1 灰档 · 需真机核对`）。
- **折叠**：明细默认收起，点「展开明细 N 条」才铺出来；每条明细带判定词（硬禁止 / 灰档 / 警告），
  **颜色只负责快速扫读，判定词必须写在里面**——色盲用户和黑白打印都读得出来。

一个用词约束：「灰档」是产品里的**专有概念**，特指微信草稿 API 实测会保留、
但读者端需真机核对的 CSS 属性。其余警告（如 `image-count-zero`）只能说「警告」，
不能借用「灰档」这个词，否则用户会以为都是同一类问题。

### 21.10 柔结构改版（全元素级）

用户反馈「界面粗糙，要高级精致」，参考 soft-skill（Soft Structuralism：冷纸/白底、
漫射环境影、Double-Bezel 嵌套、自定义缓动）做了一次全元素改版。六令牌与色系**一字未改**
（用户要求色系保持一致；且 check-contrast 锁死六令牌值）。

改了什么（每个面都能在截图里对上）：

- **材质**：新增面层级（`--plane-1..4`）与柔影三档（`--lift-1/2/3`），输入控件换「凹槽」材质
  （§21.4 / §21.4.1）。纸底叠两层极淡径向渐变，让白卡有「纸的厚度」。
- **主题管理面板**（用户点名最简陋的一处）：从 260px 单列改为 328px 分节卡片
  （字体 / 字阶 / 颜色三张内嵌卡）+ 自绘滑杆（填充段用 `--fill` 运行时变量）+ 色块行 +
  粘底动作条；「已保存的自定义主题」从「• 名字」纯文本升级为行卡片
  （色板 + 名字 + 当前标记，**点击即切换**，原来这个列表根本不能点）。
- **弹窗统一规格**：标题 + 副标题 + 圆形关闭按钮（hover 旋转 90°）+ 凹槽输入 +
  `::file-selector-button` 拉齐全站按钮 + 遮罩加一次轻模糊（只用在 fixed 遮罩上）。
- **入场动画**：下拉 `pop`（从入口向下生长）、弹窗 `sheet`（从深处升起）、
  toast 改为「从底下浮上来」，全部只动 transform/opacity。
- **图标**：撤销/重做的裸文本 `↶ ↷`、新建的 `＋`、弹窗关闭的 `×` 全部换成同一套内联 SVG；
  线宽按「有效线宽」归一（24 网格，14–20px 渲染 → CSS 属性选择器覆盖 presentation attribute）。
  代价：多一条 CSS 规则；收益：30 个图标终于像一套。
- **文案**：弹窗头部补一句副标题（原来标题不说人话，如「插入视频」不提为什么只能占位）；
  快捷键弹窗的提示与副标题重复，改为冲突规则说明；可见文本中的破折号改写。

**没有做的，和为什么**：

- 不引外部图标库/字体（taste-skill 禁手写 SVG，但自包含是硬闸门，无 CDN 可用；
  记录为有记录的 override）。
- 不做暗色主题：深色模式按钮模拟的是**微信读者端**的暗色，不是编辑器自己的主题，
  两者混用会破坏「品牌色不进 390px 画布」的边界。
- 不用 AI 默认的紫色渐变/居中 Hero 那一套：这是工具界面，可预测性优先（DIAL：
  VARIANCE 4 / MOTION 4 / DENSITY 5）。

**验证方式**：`node packages/preview/scripts/ui-shots.mjs <目录>` 把 19 个面（主界面、
顶栏三浮层、工具条两浮层、7 个弹窗、空态、两档窄屏、toast）各拍一张，
改前改后各跑一次逐面对比；脚本只依赖 Playwright 与 3777 端口的编辑器，不进 CI。

## 22. 踩过的坑（全量）

按「症状 → 原因 → 防线」记，都是真实发生过的。

### 22.1 `initialize` 握手版本号停在 0.1.0（三个版本没发现）

**症状**：每个装了 stylewx 的人，在 MCP 客户端 `serverInfo` 里看到的版本都是 `0.1.0`，与 npm 对不上。

**原因**：`apps/mcp-server/src/server.ts` 里写着 `export const SERVER_VERSION = '0.1.0'`，
**从首个版本起就没跟过 `package.json`**。

**为什么没被发现**：单测用 in-memory 传输，从不读握手返回值；`smoke-stdio.mjs` 虽然起了真实进程、
连了真实 Client，却只断言工具列表与行为，**没断言版本**。"有真实进程"和"覆盖了真实契约"是两件事。

**防线**：`server.ts` 改为从包元数据读（源码与 `dist/` 下 `../package.json` 都解析到正确位置）；
`mcp.test.ts` 与 `smoke-stdio.mjs` 都断言握手版本等于 `package.json`；
新增 `check:artifact`（§3.2）并接进 `pnpm release`。

**更重要的教训**：我是**发完 0.4.0 才去验证已发布产物**时发现的，只能补发 0.4.1。
**验证必须发生在不可逆动作之前。**

### 22.2 `check:pack` 本地不幂等

**症状**：本地连跑两次报 `✗ 存在未能对应到任何包的 tarball：stylewx-validator-0.4.0.tgz`。

**原因**：它不清理 `pack-out/`，上一轮 tarball 被 `verify-pack.mjs` 当成"未能对应到任何包"。
**CI 遇不到**，因为每次是新检出、`pack-out/` 天然为空。

**防线**：`check:pack` 前置清理。用 `node -e "require('fs').rmSync(...)"`，**不要用 rimraf** ——
这个仓库并没装它（原 `clean` 脚本里的 rimraf 同样是坏的）。

**教训**：**只在 CI 跑的脚本，在本地可能是坏的。** 本地会累积状态，CI 不会 ——
"CI 一直绿"不能证明脚本健壮。

### 22.3 引用了从未定义的 CSS 变量

**症状**：编辑器 AI 弹层选中态颜色不对（继承色而非品牌色）。

**原因**：`.ai-chip` / `.ai-selinfo` / `.ai-prompt:focus` 引用了 `--blue`，而它**从未在 `:root` 定义过**。
CSS 对未定义变量不报错，静默回退。

**防线**：`scripts/brand/check-editor.mjs` 扫描所有 `var(--x)` 并比对已定义集合。
**教训**：CSS 自定义变量的拼写错误是静默的，必须有脚本兜。

### 22.4 同权重选择器让禁用态看起来可点

**症状**：组件库弹层里禁用按钮仍渲染成实底深色，像是能点。

**原因**：新加的 `.btn.ink`（墨色实底）与既有 `.btn:disabled` **特异性相同**，而后者写在前面，被盖掉了。

**防线**：禁用态与每个实底变体**成对声明**：

```css
.btn.ink:disabled { background: color-mix(in oklch, var(--fg) 34%, var(--bg)); ... }
```

混色对象用 `--bg` 而非无彩的 `--surface`，避免在 oklch 插值里跑出怪色相。

### 22.5 专有概念被挪用到别的语义上

**症状**：校验条把 `[image-count-zero]`（正文没有图片）也标成「灰档」。

**原因**：「灰档」是**专有概念** —— 特指微信草稿 API 实测会保留、但读者端需真机核对的 CSS 属性。
用它描述普通警告，会让人以为两类问题是一回事。

**防线**：只有 `[css-property-gray]` 能叫「灰档」，其余显示为「警告」。
**教训**：领域词进了 UI 就是术语，不能当形容词用。

### 22.6 其它值得知道的

- **不要靠"写在后面"赢同权重样式** —— 见 `docs/DESIGN.md` §18.1。
- **`prop()` 判空用 `||` 不用 `??`** —— 它缺省返回**空串**，`??` 对空串无效。见 §19.6。
- **原生 `FormData` 在 undici 下 body 会被吞**（微信报 41005）—— 见 §19.7。
- **自动化点「确认类」按钮很危险** —— 曾用 opencli 的 `click --text "下一步"`，该参数精确匹配失败时
  会**退化模糊匹配**，结果点到「退出登录」导致账号登出。定位必须精确唯一并配危险名单兜底。见 §20.5。
- **直接调 `renderMarkdownToHtml` 会漏掉自定义组件** —— `renderPreview` / `renderFragment` 都经过
  `safeUserComponents()`，不传就从 `~/.stylewx/components.json` 兜底读；而绕过它们直接调核心渲染时
  必须自己传 `userComponents`，否则 `:::我的组件` 会被当成普通文本渲染，只报一条
  「未知组件」，看着就像组件坏了。组件库预览曾因此五个自定义组件全部不渲染。
- **`package.json` 的 `files` 写错 npm 不报错** —— 只是安静地少打包，运行时才炸。
  所以有 `verify-pack.mjs` 把 tarball 拆开看。
- **直接 import 的包必须自己声明依赖，靠传递依赖在 monorepo 里能跑通、在产物里必断** ——
  workspace 链接是平的，`@stylewx/preview` 作为 service 的传递依赖在 dev 环境能解析到，
  于是 mcp-server 直接 import 它却没写进自己的 dependencies，也没人发现；
  直到 `check:artifact` 起真实产物进程才报 ERR_MODULE_NOT_FOUND。
  单测、`check:pack` 都查不出来，因为它们不解析依赖图。规则：**写一行 import 就补一行声明**，
  拿不准就看 `check:artifact`（它就是为这类「装上产物才暴露」的问题存在的）。
- **flex 容器里的 `vertical-align` 是死属性** —— flex item 会被 blockify，`vertical-align`（以及
  `text-align`、`float`）对它们无效。工具条「上标/下标」两个按钮曾因此渲染成**一模一样**：
  `x<sup>2</sup>` 里的 `<sup>` 成了 flex item，`vertical-align:super` 被忽略。
  防线：这类行内内容要包一层元素还原行内上下文（`editor.html` 工具条上标/下标那两个按钮上就带着这条注释）。
  半连的另一个坑：sup/sub 还会把**行盒撑高**，于是 `x²` 与 `x₂` 的 x 不在同一水平线（实测差 2.83px），
  还得给 sup/sub 加 `line-height:0` 把它们从行盒高度计算里摘出去。两个坑合起来才算真对齐。

### 22.7 写跨平台 Node 脚本会碰到的五件事

写 `scripts/ci/verify-artifact.mjs` 时全踩了一遍。不是本仓特有的 bug，但会反复消耗时间。

**① `execFileSync('pnpm', ...)` 会 ENOENT**：`D:\Nodejs\pnpm` 是 **POSIX shell 脚本**
（真入口是 `pnpm.CMD`），不经 shell 执行不了。要么 `shell: true`，要么直接调 `.cmd`。
同理别假设 `python`/`python3`/`tar` 背后是什么（实测 `python3` 是 Store 空壳）。

**② GNU tar 会把 `C:\path` 当远程主机**（`Cannot connect to C: resolve failed`）：
盘符冒号被当成 `host:path`。解法是**传文件名 + 把 cwd 设成目标目录**，
而不是传 Windows 绝对路径 —— 比依赖 `--force-local`（GNU 专属）更稳。

```js
execFileSync('tar', ['-xzf', basename(tarball), '-C', 'unpacked'], { cwd: work })
```

**③ ESM 不读 `NODE_PATH`**：那是 CJS 的机制，而本仓全是 ESM。要让解包出来的包用上仓库依赖，
得像 pnpm 一样做链接（`symlinkSync(real, target, 'junction')`，junction 在 Windows 上不需要管理员权限）。

**④ `require.resolve('<pkg>/package.json')` 常会抛错**：现代包普遍用 `exports` 限定路径，
很多只开放 `"."`（抛 `ERR_PACKAGE_PATH_NOT_EXPORTED`）；双入口包更麻烦，`require.resolve(dep)`
会去要 `dist/cjs/index.js`，而该文件可能根本没装。
**结论：找依赖目录就直接查文件系统** —— 逐层向上看 `node_modules/<dep>/package.json` 在不在，
与 Node 自身查找规则一致，且绕开 `exports` 与双入口问题。

**⑤ 「本地过、CI 挂」几乎总是环境依赖 —— 用一个干净环境复现。** 最隐蔽的一条。
`verify-artifact.mjs` 在 Windows 本地全绿，推 CI（Linux）报
`Cannot find package '@modelcontextprotocol/sdk' imported from /tmp/.../probe.mjs`。
原因是探针自己也要 import SDK，而 ESM 从**脚本所在目录**向上找 `node_modules`：
探针放在临时目录根部，向上会走到 `%TEMP%` → 用户目录 → 盘根，于是 Windows 上**盘根恰好有
`C:\Users\wjun\node_modules`（意外残留）而侥幸通过**，Linux 一路到 `/` 都没有就失败。
这不是"CI 环境有问题"，是代码依赖了机器上碰巧存在的东西 —— 把探针放进被测包目录（命中 junction）即可。

验证方法：`mv ~/node_modules ~/node_modules.bak && pnpm check:artifact && mv ~/node_modules.bak ~/node_modules`。

**教训**：凡是"在本地能过"的判断，先问一句 *它是不是蹭到了本机环境？*
临时目录、盘根、用户目录都是容易被意外蹭到的地方。

### 22.8 内联 SVG + SMIL 写动效资产会碰到的七件事

微信正文禁 JS、禁外链动画，**内联 SVG + SMIL 是唯一真能动且实测存活的通道**。写
`assets-src/gen-motion.mjs`（Hippie 青年的头/尾图与 logo）时这些坑各踩了一遍。

**① 缩放不能用「绝对坐标 × s」。** 给灯头写 `g(v) = v * s` 会把灯心搬到 `(x·s, y·s)`，
和灯柱的弧头脱开，`s` 越大偏得越远。要用 `transform="translate(x y) scale(s)"`
先搬原点再缩放。**只在 1 倍下看一眼是发现不了的** —— 必须把 s ≠ 1 的实例都截出来。

**② 父级挂了 `<animateTransform transform>` 时，子树里的静态 `transform` 会让整棵子树消失。**
不是动画失效，是**图形整个不见**。原本想用「外层 g 做位移入场 + 内层 g 做静态 scale」两层结构，
结果剪影完全画不出来。当时建了 case1..4 对照组才定位到：唯独这一组合什么都渲染不出。
解法是**把坐标在生成器里烘成绝对值**，只让一个元素承载动画。

**③ 深色底上「大面积 + 低透明」的暖色会调出脏灰。** 夜蓝 `#0A2A6B` 上叠一层
`opacity:0.13` 的暖橘，实测变**芥末灰**。光晕在浅色头图里好看，在深色 logo 里就是泥。

**④ logo 不是插画。** 第一版把整幅插画（灯柱 + 光晕 + 渐层天空）塞进 logo，
`240px` 尚可，`48px` 糊成一团。**判据是缩放对照表**：把同一份 SVG 在 240 / 120 / 48px
并排截出来再决定（`assets-src/contact.mjs` 就是干这个的）。logo 只留一个形、实心、高对比；
光晕、渐变、呼吸这类「气氛」留给头图。

**⑤ 别忽略画布裁切。** 灯罩半圆的顶端是 `y − 30·s`；`y=14, s=0.7` 时顶端为 `−7`，
会被 viewBox 切平。SVG 不会报错，只会安静地切掉。

**⑥ 灯头坐标必须等于 `灯柱 x + bend`。** `hip-end-a` 里灯柱写 `x=60, bend=-26`（弧头在 34），
灯头却写 `x=86` —— **整盏灯向右飘了 52 单位**，而且全套 9 处灯里只有这一处不一致，
所以尤其难发现。改灯柱参数时要同时改灯头，两者没有联动。

**⑦ 同色相邻会“吃”掉形状。** logo 里白色的双腿正好压在同样白色的地平线上，
腿直接消失。不同结构用同一颜色时必须降对比分层（地平线用 `opacity:0.45`）。
同理：底色 `#0A2A6B` 上做暖色光晕会被调成芥末灰，要么缩小面积提高不透明度，要么改实心块。

> 动效资产的可复用产物在 `docs/assets/brand-motion/`（SVG 源 + 组件模板 + 静帧），
> 生成器是 `assets-src/gen-motion.mjs`，品牌档案 `~/.stylewx/brands/hippie-youth/`。
> 本项目已定稿 **方案 A「归途」**（`hip-head-a` + `hip-end-a` + 抽象画青年 logo）。

## 23. 手动验证脚本（不参与 CI）

改动相关模块时按需跑。这些脚本不进 CI，所以**本地坏了不会有人发现** —— 跑之前先确认它还能用。

| 脚本 | 验证什么 |
|---|---|
| `apps/mcp-server/scripts/verify-agent-workflow.mjs` | 模拟 agent 分步工作流（真实 MCP stdio）：微调主题 → 逐段 → 整篇 → 落盘 → editorUrl 读回 |
| `apps/mcp-server/scripts/verify-handoff.mjs` | `save_article` 落盘后从编辑器端点读回（需编辑器在 3777 运行） |
| `apps/mcp-server/scripts/verify-html-roundtrip.mjs` | 本地往返：渲染 → HTML 回导 → 再渲染，比对组件标记与纯文本 |
| `apps/mcp-server/scripts/verify-wechat-showcase.mjs` | 真实微信端到端：发布 → 取回 → 核对组件存活 + 回导还原 |
| `apps/mcp-server/scripts/publish-via-browser.mjs` | 浏览器登录态发布（免 IP 白名单，含封面上传） |
| `scripts/comparison/run.mjs` | 品牌记忆 + 多组排版策略对比（4 篇 × 4 组），输出截图与量化指标 |
| `packages/preview/scripts/test-editor-*.mjs` | 编辑器 E2E（导入 / 同步滚动 / 交接 / 组件面板，需 Playwright + 3777 运行） |
| `packages/preview/scripts/capture-hero.mjs` | 重截 README 配图 `docs/assets/editor-preview.png` |
| `apps/mcp-server/scripts/probe-mermaid-wechat.mjs` | mermaid 图真实微信链路（draft/add → get 回读，会写一条 [probe] 草稿） |
| `packages/preview/scripts/ui-shots.mjs` | 编辑器 19 个面（主界面 / 浮层 / 7 弹窗 / 空态 / 窄屏 / toast）各拍一张，改前后逐面对比 |

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
