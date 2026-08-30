# stylewx — 公众号排版 Agent 服务

面向 AI Agent 的「公众号排版内核 + MCP Server + REST API + 本地 Web 编辑器」：让 Kimi Code / Claude Code / Cursor
等 Agent 根据文章内容自动分析、生成/选择主题、渲染、校验、发布到微信公众号**草稿箱**。

> 核心定位是**无头排版内核**：MCP / REST 供 Agent 编排闭环，不做正文写作（那是上游 Agent 的职责）。
> 另附一个**可选的本地 Web 编辑器**（`--transport http` 时开在 `/editor`，WeMD 风格），方便人工手动排版、
> 生成小众主题并本地复用；不影响 Agent 走无头链路。

---

## 架构

```
┌──────────── Agent（Kimi / Claude / Cursor）────────────┐
│   list_themes · list_saved_themes · save_theme · export_theme · analyze_article · generate_theme │
│   render_preview · validate_article · publish_draft       │
└──────────────┬──────────────────────────┬───────────────┘
         MCP (stdio / Streamable HTTP)         REST API (/themes … /drafts)
               │                                │
               └────────────┬───────────────────┘
                      @stylewx/service  （共享 service 层）
              ┌──────────────┼───────────────┬───────────────┐
        core 渲染内核    theme 主题系统   validator 校验器   publisher 发布   preview 截图
```

`core / theme / validator` 三个包**同构**：不依赖 DOM、不依赖 Node 独有 API，
未来可在浏览器复用；所有微信 API 调用只出现在 `publisher`。

### Monorepo 结构

```
stylewx/
├── packages/
│   ├── core/        # Markdown → 内联样式 HTML（unified/remark/rehype + juice），纯函数
│   ├── theme/       # 主题 zod Schema(含 JSON Schema 导出)、微信 CSS 白名单、主题→CSS 编译器、26 套预置主题(6 原创 + 20 WeMD 移植)
│   ├── validator/   # 微信兼容性校验器，输出结构化报告 { pass, issues }
│   ├── publisher/   # 微信 API：access_token/素材上传/draft.add + 外链图片搬运；不含群发
│   ├── preview/     # Playwright 截图（iPhone 视口 390px）
│   └── service/     # 共享 service 层，被 MCP 与 REST 复用
├── apps/
│   ├── mcp-server/  # MCP Server：stdio + Streamable HTTP 双传输
│   └── api/         # REST API（Hono），与 MCP tools 一一对应
├── examples/        # mcp.json / mcp-http.json 示例
└── docs/            # 说明文档
```

---

## 快速开始

要求：Node.js ≥ 20，pnpm ≥ 10，Turborepo（由 pnpm 管理）。

```bash
# 1) 安装依赖
pnpm install

# 2) 全量构建
pnpm build

# 3) 全量测试
pnpm test

# 4) 安装 Chromium（render_preview 截图需要）
pnpm --filter @stylewx/preview exec playwright install chromium

# 5) 配置环境变量
cp .env.example .env   # 填入 WECHAT_* 与 LLM_*
```

### 本地跑通 stdio MCP Server

```bash
pnpm --filter @stylewx/mcp-server build
node apps/mcp-server/dist/index.js --transport stdio
# 之后用任一 MCP Inspector / 客户端连接该进程
```

一键冒烟（会在 stdio 下真实启动服务并调用全部 9 个 tool）：

```bash
pnpm --filter @stylewx/mcp-server exec node scripts/smoke-stdio.mjs
```

### 启动本地 Web 编辑器（一键）

> 编辑器只在 **`--transport http` 模式**下提供；pi / Agent 里配的 `stylewx` 走 **stdio**（无头，无界面）。
> 想用编辑器，请**另起一个 http 模式的实例**（可与 Agent 的 stdio MCP 共存）。

**一键启动（推荐）**：

```bash
# 方式 A：pnpm（自动加载仓库根 .env，默认端口 3777）
pnpm stylewx:editor

# 方式 B：Windows 双击 stylewx-editor.bat（仓库根）

# 方式 C：直接跑脚本（可指定 .env 路径与端口）
node apps/mcp-server/scripts/editor.mjs [.env路径] [端口]
```

启动后浏览器打开：**http://localhost:3777/editor**（同时该进程也提供 `http://localhost:3777/mcp` 的 MCP(HTTP) 端点）。

**手动以 HTTP 模式启动**（等价）：

```bash
cd apps/mcp-server && set -a && . ../.env && set +a
node dist/index.js --transport http --port 3777
# http://localhost:3777/editor 编辑器 · http://localhost:3777/mcp  MCP(Streamable HTTP)
```

编辑器（WeMD 风格）提供：左侧 Markdown 编辑 + 富文本工具栏、主题选择/生成/保存、右侧 390px 实时预览、
校验、复制 HTML/复制到公众号、一键发布草稿箱、历史记录与图床设置。编辑器的 `/editor/api/*` 复用同一 service 编排与依赖注入。

### 启动 REST API

```bash
pnpm --filter @stylewx/api dev
# http://localhost:3001  GET /themes · POST /render · POST /validate · POST /drafts · POST /themes/generate
```

---

## npm 分发

`@stylewx/*` 已发布到 npm（`core / theme / validator / publisher / preview / service / mcp-server / api`，`0.1.1`）。

- **MCP 给 Agent 用（stdio）**：
  ```bash
  npx -y stylewx-mcp
  ```
- **本地 Web 编辑器 + MCP(HTTP)**：
  ```bash
  npx -y stylewx-mcp --transport http --port 3777
  # http://localhost:3777/editor（编辑器）· http://localhost:3777/mcp（MCP HTTP）
  ```
- **想长期/全局安装**（之后用裸命令，无需每次 `npx`）：
  ```bash
  npm i -g @stylewx/mcp-server
  stylewx-mcp            # 已装到全局，直接可调
  stylewx-mcp --transport http --port 3777   # 编辑/HTTP 模式
  ```
- **环境变量**：`WECHAT_APP_ID / WECHAT_APP_SECRET`（发布草稿）、`LLM_BASE_URL / LLM_API_KEY / LLM_MODEL / LLM_API_STYLE`（AI 生成主题；`LLM_API_STYLE` 默认 `chat`，opencode go 用 `responses`）。
  缺凭据时对应功能返回明确错误（不崩），其余功能正常。
- **截图（可选）**：`render_preview` 的预览截图依赖本地 Chromium：`npx playwright install chromium`；未装则降级为返回 HTML + 校验报告。编辑器右侧实时预览用 iframe，**不依赖 Chromium**。

> 发布说明：用 `pnpm publish`（会自动把 `workspace:*` 替换为真实版本）；旧版 `0.1.0` 的坏依赖已由 `0.1.1` 修复。`@stylewx` 是 npm 组织作用域。

## 在 Agent 中接入

### Claude Desktop

把 `examples/mcp.json` 复制到 `~/Library/Application Support/Claude/claude_desktop_config.json`（macOS）
或 `%APPDATA%\Claude\claude_desktop_config.json`（Windows），填入 `command`/`args`/`env` 后重启 Claude。

### Cursor

把 `examples/mcp.json` 放到项目根目录 `.cursor/mcp.json`（内容同 `mcpServers` 结构），在 Cursor 设置里启用该 MCP。

### Kimi Code

参考其 MCP 配置格式，将 `examples/mcp.json` 中的 `mcpServers.stylewx` 加入 `~/.kimi/…/mcp.json` 或项目级配置；
stdio 与 http 二选一即可。

### 远程 HTTP 示例

```json
{
  "mcpServers": {
    "stylewx": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

---

## MCP Tools

| Tool | 用途 | 关键输入 |
| --- | --- | --- |
| `list_themes` | 列出预置 + 已保存主题（含完整 token/block，可直接复用） | — |
| `list_saved_themes` | 列出本地已保存的自定义/AI 主题（`~/.stylewx/themes.json`） | — |
| `save_theme` | 把一个主题对象保存到本地主题库（过 Schema + 微信白名单校验） | `theme` / `name` |
| `export_theme` | 导出主题为完整 JSON（已存/预置/对象）供复用或分享 | `theme` |
| `analyze_article` | 分析内容类型/基调/建议主题/阅读时长 | `markdown` |
| `generate_theme` | LLM 生成主题（可 `save` 存档），内置自检修复循环（最多 2 次），失败降级并标记 `fallback` | `prompt` / `article` / `baseTheme` / `save` |
| `render_preview` | 渲染 → 内联样式 HTML + 校验报告 + iPhone(390px) 截图 | `markdown`, `theme` |
| `validate_article` | 校验微信兼容性，输出结构化报告 | `html` |
| `publish_draft` | 发布到**草稿箱**（搬运外链图、上传封面） | `title`, `markdown`/`html`, `theme` 等 |

> `render_preview` / `publish_draft` 的 `theme` 参数支持**预置主题名**（如 `tech-minimal`）或**完整主题 JSON**。

所有 tool 的错误统一为：

```json
{ "error": { "code": "invalid_theme", "message": "…", "hint": "…" } }
```

`hint` 面向 Agent，指明下一步该怎么做。缺少微信 / LLM 凭据时返回对应错误，**绝不静默失败**。

---

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 公众号凭据（`publish_draft` 必需） |
| `WECHAT_API_BASE` | 微信 API 基地址，默认 `https://api.weixin.qq.com` |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | OpenAI 兼容接口，`generate_theme` 必需 |
| `PORT` | REST API 端口，默认 `3001` |

---

## 安全边界（有意的）

- 只实现 **`draft/add`（发布到草稿箱）**，**未实现**任何群发接口（`freepublish/submit`）。
- 内容进入草稿箱后仍需人工在公众号后台确认，本项目不提供任何绕过人工确认的自动化群发能力。
- 微信 AppSecret 与 LLM API Key 只通过环境变量注入，绝不硬编码或提交。

## 校验与合规

- 输出 HTML **不含 `<style>` / `<link>` / `class` 依赖**，样式全部内联（juice）。
- 主题 CSS 采用**三档白名单**（经真实微信草稿 API 实测校准）：`position`/`filter` 硬禁止；`transform`/`animation`/`float`/`box-shadow`/`flex`/`opacity` 等为**灰色属性**（微信保留但提示建议）；仅 `safe` 档无提示。
- 外链图（非 `mmbiz.qpic.cn`）会被校验器提示，`publish_draft` 会自动搬运到素材库。

## 本地示例脚本

```bash
# 排版一篇 Markdown（analyze → 生成主题 → 渲染 → 校验，输出到 <md>/typeset-out/）
node apps/mcp-server/scripts/typeset-article.mjs 文章.md "主题提示词"

# 把渲染好的 HTML 发布到公众号草稿箱（缺封面自动生成渐变封面）
node apps/mcp-server/scripts/publish-draft.mjs out/文章.html "标题"
```

## 许可

MIT License，详见 [LICENSE](./LICENSE)。

## 致谢

本项目的代码为全新实现（MIT），不含参考项目源码。设计思路参考了以下开源项目（保留原作者版权声明）：

- [doocs/md](https://github.com/doocs/md) — Markdown→微信 HTML 渲染 / juice 内联思路
- [WeMD](https://github.com/mdnice/WeMD) — 包拆分与主题设计器思路
- [caol64/wenyan-mcp](https://github.com/caol64/wenyan-mcp)（Apache-2.0）— 微信 API 封装 / MCP 远程模式
- `gzh-design-skill` — 主题 JSON 结构与微信兼容性规则清单
