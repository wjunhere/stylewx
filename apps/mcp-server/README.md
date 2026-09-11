# @stylewx/mcp-server

**stylewx 的入口包**：一个 MCP Server，把微信公众号排版能力交给 AI Agent
（Kimi Code / Claude Code / Cursor 等）。

内置 **15 个工具**，支持 **stdio** 与 **Streamable HTTP** 两种传输；HTTP 模式下还附带一个
**本地 Web 编辑器**，用于人工排版、主题调试与最后收尾。

## 接入 MCP

stdio（推荐，Agent 里配置这个）：

```json
{
  "mcpServers": {
    "stylewx": {
      "command": "npx",
      "args": ["-y", "@stylewx/mcp-server"]
    }
  }
}
```

HTTP 模式：

```bash
npx @stylewx/mcp-server --transport http --port 3777
# MCP 端点在 http://localhost:3777/mcp
```

## 本地 Web 编辑器

```bash
npx @stylewx/mcp-server --transport http --port 3777
# 打开 http://localhost:3777/editor
```

编辑器能力：Markdown 编辑与富文本工具栏、22 个内置富组件插入、
**组件库预览页**（内置 + 自定义组件，按当前主题实时渲染）、
**主题预览页**（用统一示例文章对比所有主题的排版与调色板，一键应用）、
390px 实时预览、左右栏同步滚动、导入 HTML（带组件标记时精确还原 `:::` 指令）、
导入/导出 Markdown、一键发布草稿箱、历史记录与图床设置。

> 注意：Agent 里配的 `stylewx` 走 stdio（没有界面）。要用编辑器需**另起**一个 HTTP 实例，
> 两者可以共存。

## 15 个工具

**排版与发布**

| 工具 | 说明 |
| --- | --- |
| `render_preview` | Markdown + 主题 → 微信可用 HTML（可选截图） |
| `render_fragment` | 只渲染片段，默认不回整页 HTML（省 token） |
| `validate_article` | 按微信约束校验 HTML |
| `publish_draft` | 发布到公众号草稿箱（只发草稿，不群发） |
| `save_article` | Markdown 落盘并返回编辑器 URL（人机交接） |

**主题**

| 工具 | 说明 |
| --- | --- |
| `list_themes` / `list_saved_themes` | 主题清单 |
| `tweak_theme` | 确定性改主题，秒回、不烧 LLM |
| `generate_theme` | 按文章内容用 LLM 生成主题 |
| `save_theme` / `export_theme` | 保存 / 导出主题 |

**组件与文章**

| 工具 | 说明 |
| --- | --- |
| `list_components` | 组件目录（props、语义槽位、示例） |
| `save_component` / `delete_component` | 自定义组件（HTML 模板）的增删 |
| `analyze_article` | 文章体裁 / 语气 / 行业分析 |

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 发布草稿箱（不配则只能渲染与预览） |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | AI 生成主题、优化正文 |
| `WECHAT_API_BASE` | 可选，微信接口地址（走代理或自建网关时用） |
| `STYLEWX_ARTICLES_DIR` | 文章读写根目录（默认当前工作目录） |
| `STYLEWX_COMPONENTS_PATH` | 自定义组件库路径（默认 `~/.stylewx/components.json`） |
| `STYLEWX_THEMES_PATH` | 自定义主题库路径（默认 `~/.stylewx/themes.json`） |
| `STYLEWX_EDITOR_URL` | 自定义编辑器地址（`save_article` 交接链接用） |

凭据一律从环境变量注入，不会写进代码或配置文件。文章读写被限制在
`STYLEWX_ARTICLES_DIR` 内，防目录穿越。

---

属于 **[stylewx](https://github.com/wjunhere/stylewx)** —— 把 Markdown 排成微信公众号文章的工具链。MIT License.
