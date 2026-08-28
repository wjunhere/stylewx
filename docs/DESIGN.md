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
  `flex-*`、`opacity`、`top/left/z-index`、`gap`、渐变 `background-image` 等 —— 微信草稿 API 实测会保留，
  但编辑器手动粘贴 / 读者最终渲染仍不确定，故不硬禁止，只提示。
- **BANNED**（硬禁止 error）：`position`、`filter` 等实测会过滤的属性，以及结构层危险内容
  （`<style>`、`<script>`、`on*` 事件、`javascript:` 链接）。

> 实测边界说明：以上结论针对 **draft 草稿 API**（我们发布草稿走的路）。微信的**编辑器手动粘贴**与
> **读者渲染**是另一套清洗逻辑，未纳入本次 API 实测，故 GRAY 属性仍以 `warning` 提示，保留谨慎。

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

## 9. 已知限制

- 主题内嵌代码不做逐 token 高亮（无 highlight.js / 网络依赖），由主题统一修饰 `pre/code`。
- `render_preview` 截图依赖本机安装 Chromium：
  `pnpm --filter @mp-style/preview exec playwright install chromium`。
  未安装时服务降级为返回 HTML + 校验报告（不崩溃，可正常发布），并提示安装。
