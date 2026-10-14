# 组件体系与写作原语（§11、§14–§16）

富组件库、小原语工作流、样式覆盖、agent 自造组件。上层：[设计说明索引](../DESIGN.md)；
组件**语法与清单**在 [COMPONENTS.md](../COMPONENTS.md)。

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
老主题不填也能正常工作——因此 36 套预置主题零改动即可驱动全部组件。

### 11.5 端到端验证

`apps/mcp-server/scripts/verify-wechat-showcase.mjs` 把 `examples/component-showcase.md`
渲染后真实发布到草稿箱，再取回逐项核对：**23/23 项存活**，8 张外链图（含 4 张 SVG `<image>`）
全部搬运为 `mmbiz.qpic.cn`，且 `script` / `class` / 页内锚点均不存在。

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

**没有采用「把 144 处硬编码抽成 token」的方案**：那个方案成本高（36 套预置主题要重新校准），
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

