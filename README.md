# stylewx

<p align="left">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-MIT-green.svg"></a>
  <a href="https://www.npmjs.com/package/@stylewx/mcp-server"><img alt="npm" src="https://img.shields.io/npm/v/@stylewx/mcp-server"></a>
  <a href="https://github.com/wjunhere/stylewx"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-wjunhere%2Fstylewx-181717?logo=github"></a>
  <img alt="Node" src="https://img.shields.io/badge/Node-%E2%89%A520-3C873A">
  <img alt="pnpm" src="https://img.shields.io/badge/pnpm-%E2%89%A510-F69220">
</p>

公众号排版服务，提供 MCP Server 与 REST API。Kimi Code、Claude Code、Cursor、Pi、Codex 等 Agent
可以通过它完成「分析文章 → 选择或生成主题 → 渲染 → 校验 → 发布到公众号草稿箱」的流程。

本项目只负责排版和发布草稿，不负责正文写作。另有一个可选的本地 Web 编辑器，在 HTTP 模式下开在
`/editor`，用于人工排版和主题调试。

## 功能

- 9 个 MCP 工具，覆盖主题管理与文章排版全流程。
- 26 套预置主题（6 套原创 + 20 套 WeMD 移植），支持保存自定义主题和 LLM 生成主题。
- 三档微信 CSS 白名单，经真实草稿 API 实测校准；输出全部为内联样式，不依赖 `<style>` / `<link>` / `class`。
- `core` / `theme` / `validator` 不依赖 DOM 和 Node 独有 API，可独立复用；微信 API 调用集中在 `publisher`。
- 三种接入方式：MCP（stdio / Streamable HTTP）、REST API、本地 Web 编辑器。
- 只发布草稿箱，不实现群发；微信和 LLM 凭据只从环境变量读取。

## 架构

```
┌──────────── Agent（Kimi / Claude / Cursor / Pi / Codex）────────────┐
│  list_themes · list_saved_themes · save_theme · export_theme         │
│  analyze_article · generate_theme · render_preview · validate_article│
│  publish_draft                                                       │
└──────────────┬──────────────────────────┬───────────────────────────┘
         MCP (stdio / Streamable HTTP)         REST API (/themes … /drafts)
               │                                │
               └────────────┬───────────────────┘
                      @stylewx/service（共享 service 层）
              ┌──────────────┼───────────────┬───────────────┐
        core 渲染内核    theme 主题系统   validator 校验器   publisher 发布   preview 截图
```

### 目录结构

```
stylewx/
├── packages/
│   ├── core/        # Markdown → 内联样式 HTML（unified/remark/rehype + juice），纯函数
│   ├── theme/       # 主题 zod Schema（含 JSON Schema 导出）、微信 CSS 白名单、主题→CSS 编译器、26 套预置主题
│   ├── validator/   # 微信兼容性校验器，输出结构化报告 { pass, issues }
│   ├── publisher/   # 微信 API：access_token / 素材上传 / draft.add + 外链图片搬运；不含群发
│   ├── preview/     # Playwright 截图（iPhone 视口 390px）
│   └── service/     # 共享 service 层，被 MCP 与 REST 复用
├── apps/
│   ├── mcp-server/  # MCP Server：stdio + Streamable HTTP 双传输（含本地 Web 编辑器）
│   └── api/         # REST API（Hono），与 MCP tools 一一对应
├── examples/        # mcp.json / mcp-http.json 示例
└── docs/            # 设计说明
```

## 快速开始

要求 Node.js ≥ 20、pnpm ≥ 10。

```bash
pnpm install                       # 安装依赖
pnpm build                         # 全量构建
pnpm test                          # 全量测试
cp .env.example .env               # 配置 WECHAT_* 与 LLM_*

# 可选：render_preview 截图需要 Chromium
pnpm --filter @stylewx/preview exec playwright install chromium
```

## 接入方式

### MCP（Agent 接入）

直接用 npm 包，或使用仓库内构建产物：

```bash
npx -y @stylewx/mcp-server                  # 免安装运行（stdio）
npm i -g @stylewx/mcp-server                # 全局安装
stylewx-mcp                                 # stdio
stylewx-mcp --transport http --port 3777    # HTTP（同时开 /editor）
```

MCP 配置示例（`.mcp.json` 或各 Agent 的 MCP 配置）：

```json
{
  "mcpServers": {
    "stylewx": {
      "command": "npx",
      "args": ["-y", "@stylewx/mcp-server"],
      "env": {
        "WECHAT_APP_ID": "…",
        "WECHAT_APP_SECRET": "…",
        "LLM_BASE_URL": "…",
        "LLM_API_KEY": "…",
        "LLM_MODEL": "…"
      }
    }
  }
}
```

Windows 下把 `command` 改为 `"cmd"`，`args` 改为 `["/c", "npx", "-y", "@stylewx/mcp-server"]`。

各 Agent 的配置文件位置：

| Agent | 配置文件 |
| --- | --- |
| Claude Desktop | macOS `~/Library/Application Support/Claude/claude_desktop_config.json`；Windows `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor | 项目根 `.cursor/mcp.json` |
| Kimi Code | `~/.kimi/…/mcp.json` 或项目级配置 |
| Pi | `~/.pi/agent/mcp.json`（`mcpServers.stylewx`） |
| Codex | `~/.codex/config.toml` → `[mcp_servers.stylewx]` |
| 远程 HTTP | `{ "mcpServers": { "stylewx": { "type": "http", "url": "http://localhost:PORT/mcp" } } }` |

stdio 与 Streamable HTTP 二选一即可。

### 本地 Web 编辑器

编辑器只在 `--transport http` 模式下提供。Agent 里配置的 `stylewx` 走 stdio，没有界面；
要用编辑器需要另起一个 HTTP 模式实例，两者可以共存。

```bash
pnpm stylewx:editor                                   # 自动加载仓库根 .env，默认端口 3777
node apps/mcp-server/scripts/editor.mjs [.env路径] [端口]   # 手动指定
```

Windows 也可以直接双击仓库根的 `stylewx-editor.bat`。启动后打开
http://localhost:3777/editor，同一进程还提供 http://localhost:3777/mcp。

编辑器功能：左栏 Markdown 编辑与富文本工具栏（标题/列表/警告框/上下标等）、主题选择/生成/保存、
右栏 390px 实时预览、校验、复制 HTML 或复制到公众号、一键发布草稿箱、历史记录与图床设置。

### REST API

```bash
pnpm --filter @stylewx/api dev
# http://localhost:3001
# GET /themes · POST /render · POST /validate · POST /drafts · POST /themes/generate
```

## MCP 工具

| Tool | 用途 | 关键输入 |
| --- | --- | --- |
| `list_themes` | 列出预置 + 已保存主题（含完整 token/block，可直接复用） | — |
| `list_saved_themes` | 列出本地已保存的自定义/AI 主题（`~/.stylewx/themes.json`） | — |
| `save_theme` | 保存主题到本地主题库（过 Schema + 微信白名单校验） | `theme` / `name` |
| `export_theme` | 导出主题为完整 JSON（已存/预置/对象） | `theme` |
| `analyze_article` | 分析内容类型/基调/建议主题/阅读时长 | `markdown` |
| `generate_theme` | LLM 生成主题（可 `save` 存档），内置自检修复循环，失败时降级并标记 `fallback` | `prompt` / `article` / `baseTheme` / `save` |
| `render_preview` | 渲染为内联样式 HTML + 校验报告 + iPhone(390px) 截图 | `markdown`, `theme` |
| `validate_article` | 校验微信兼容性，输出结构化报告 | `html` |
| `publish_draft` | 发布到草稿箱（搬运外链图、上传封面） | `title`, `markdown`/`html`, `theme` 等 |

`render_preview` 和 `publish_draft` 的 `theme` 参数支持预置主题名（如 `tech-minimal`）或完整主题 JSON。

所有 tool 的错误统一为：

```json
{ "error": { "code": "invalid_theme", "message": "…", "hint": "…" } }
```

`hint` 用于提示 Agent 下一步该怎么做；缺少微信或 LLM 凭据时返回对应错误，不会静默失败。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 公众号凭据（`publish_draft` 必需） |
| `WECHAT_API_BASE` | 微信 API 基地址，默认 `https://api.weixin.qq.com` |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | OpenAI 兼容接口（`generate_theme` 和编辑器 AI 优化必需） |
| `LLM_API_STYLE` | LLM 调用风格，默认 `chat`；opencode go 用 `responses` |
| `PORT` | REST API 端口，默认 `3001` |

缺少凭据时相关功能返回明确错误，其余功能正常。凭据只从环境变量注入。

## 边界与校验

- 只实现 `draft/add`（发布到草稿箱），未实现任何群发接口（`freepublish/submit`）。
- 内容进入草稿箱后仍需人工在公众号后台确认，本项目不提供绕过人工确认的自动化群发能力。
- 微信 AppSecret 与 LLM API Key 只通过环境变量注入，不硬编码、不提交。
- 输出 HTML 不含 `<style>` / `<link>` / `class` 依赖，样式全部内联（juice）。
- 主题 CSS 采用三档白名单（经真实微信草稿 API 实测校准）：`position` / `filter` 硬禁止；
  `transform` / `animation` / `float` / `box-shadow` / `flex` / `opacity` 等为灰色属性（微信保留但提示）；
  只有 `safe` 档无提示。
- 外链图（非 `mmbiz.qpic.cn`）会被校验器提示，`publish_draft` 会自动搬运到素材库。

## 示例脚本

```bash
# 排版一篇 Markdown（analyze → 生成主题 → 渲染 → 校验，输出到 <md>/typeset-out/）
node apps/mcp-server/scripts/typeset-article.mjs 文章.md "主题提示词"

# 把渲染好的 HTML 发布到公众号草稿箱（缺封面时自动生成渐变封面）
node apps/mcp-server/scripts/publish-draft.mjs out/文章.html "标题"
```

## 许可

MIT License，详见 [LICENSE](./LICENSE)。

## 致谢

代码为全新实现（MIT），不含参考项目源码。设计思路参考了以下开源项目（保留原作者版权声明）：

- [doocs/md](https://github.com/doocs/md) — Markdown → 微信 HTML 渲染 / juice 内联思路
- [WeMD](https://github.com/mdnice/WeMD) — 包拆分与主题设计器思路
- [caol64/wenyan-mcp](https://github.com/caol64/wenyan-mcp)（Apache-2.0）— 微信 API 封装 / MCP 远程模式
- `gzh-design-skill` — 主题 JSON 结构与微信兼容性规则清单
