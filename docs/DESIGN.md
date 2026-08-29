# mp-style 设计说明

本文记录关键设计决策、约束与测试覆盖情况。

## 1. 为什么新增 `packages/service`

题目给定的结构为 `core/theme/validator/publisher/preview + apps/mcp-server/api`，
但明确要求 MCP 与 REST「复用同一套 service 层，不重复实现逻辑」。`analyze_article`、
`generate_theme`、`render_preview` 等是跨包编排逻辑，若在每个 app 里各写一份会重复。
为此新增一个轻量 `@mp-style/service` 包，只做编排，不含重型依赖：
MCP Server 与 REST API 都只调用它，实现真正的复用。

## 2. 同构边界

`core / theme / validator` 三个包**不 import 任何 DOM / Node 独有 API**：

- 不引入 `window`/`document`/`navigator`；不引入 `node:fs`/`node:path`/`process`。
- `core` 使用 `juice` 做 CSS 内联：juice 底层用 cheerio（服务端 HTML 解析，无需浏览器全局），
  且我们通过 `webResources: { links, images, scripts, svgs: false }` 完全关闭网络抓取，保持无头可复现。
- `validator`、`theme` 同样纯函数；微信图床域名白名单、CSS 白名单都在 `theme` 单一来源，`validator` 复用。

## 3. 微信 API 只在 publisher

所有微信网络调用（`token`、`material/add_material`、`draft/add`）只出现在 `@mp-style/publisher`。
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

白名单常量在 `@mp-style/theme/src/css-whitelist.ts`。我们用**真实公众号**对 `draft/add → draft/get` 做了实测：
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
| `@mp-style/core` | 100%（lines/statements） |
| `@mp-style/theme` | ~95% |

`@mp-style/validator` 实测约 85%。core / theme 的 vitest 已配置 `thresholds`（≥80%）强制约束。

## 8. 安全边界

- 只实现 `draft/add`（发布到草稿箱）；**未实现** `freepublish/submit` 群发。
- 所有凭据只从环境读取（`.env`），已在 `.gitignore` 排除，绝不提交。

## 9. 本地 Web 编辑器与主题库（WeMD 风格）

**主题库（复用 AI 主题）**
- `@mp-style/service/theme-store.ts` 把自定义 / AI 生成主题持久化到用户级 `~/.mp-style/themes.json`
  （可用环境变量 `MP_STYLE_THEMES_PATH` 覆盖）。仅允许出现在 service 层，因用到 Node fs；core/theme/validator 保持同构。
- `list_themes` 自动合并「预置 + 已存」主题（按名去重，预置优先）；`resolveTheme` 也能按**已存主题名**解析。
- MCP 新增工具：`save_theme`（保存主题）、`list_saved_themes`（列出已存）、`export_theme`（导出完整 JSON 复用/分享）；
  `generate_theme` 增加 `save` 选项（AI 生成后直接存档）。

**本地 Web 编辑器**
- `mp-style --transport http` 时，除 `/mcp` 外还提供：
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
  `pnpm --filter @mp-style/preview exec playwright install chromium`。
  未安装时服务降级为返回 HTML + 校验报告（不崩溃，可正常发布），并提示安装。
- 微信草稿箱编辑器加载 `draft/add` 建的草稿时以简化视图显示（不完整渲染内联样式）；看点用「预览/发表」的读者端。
