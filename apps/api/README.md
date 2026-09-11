# @stylewx/api

把 [MCP 工具](https://www.npmjs.com/package/@stylewx/mcp-server) 的能力镜像成 REST API，
基于 [Hono](https://hono.dev)，可跑在 Node 或任意支持 `fetch` 的运行时。

## 安装与启动

```bash
npm i @stylewx/api

# 该包未声明 bin，直接起编译产物即可
PORT=3000 node node_modules/@stylewx/api/dist/index.js
```

## 端点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 健康检查 |
| `GET` | `/themes` | 主题清单（含本地已保存主题） |
| `POST` | `/themes/generate` | 按文章内容用 LLM 生成主题 |
| `POST` | `/render` | Markdown + 主题 → 微信可用 HTML |
| `POST` | `/validate` | 校验 HTML 是否符合微信约束 |
| `POST` | `/drafts` | 渲染并发布到公众号草稿箱（只发草稿） |

```bash
curl -s localhost:3000/render \
  -H 'content-type: application/json' \
  -d '{"markdown":"# 标题\n\n正文","theme":"magazine"}'
```

## 作为库使用

```ts
import { createApp } from '@stylewx/api'

export default createApp()   // 挂到任意支持的运行时
```

## 凭据

发布到草稿箱需要 `WECHAT_APP_ID` / `WECHAT_APP_SECRET`；
生成主题需要 `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`（见主仓库 `.env.example`）。

---

属于 **[stylewx](https://github.com/wjunhere/stylewx)** —— 把 Markdown 排成微信公众号文章的工具链。MIT License.
