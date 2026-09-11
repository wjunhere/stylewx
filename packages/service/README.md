# @stylewx/service

把 `theme` / `core` / `components` / `validator` / `publisher` 串起来的**高层服务**，
也是 [MCP 工具](https://www.npmjs.com/package/@stylewx/mcp-server) 与
[REST API](https://www.npmjs.com/package/@stylewx/api) 的共同底座。

## 安装

```bash
npm i @stylewx/service
```

## 用法

```ts
import {
  resolveTheme,
  renderPreview,
  publishDraft,
  listThemes,
} from '@stylewx/service'

// 主题名或完整主题对象都接受（对象会过 zod + 微信白名单校验）
const theme = resolveTheme('magazine')

// 渲染 + 校验（includeScreenshot 默认 true，编辑器里通常关掉以免每次键入都截图）
const { html, validation, diagnostics } = await renderPreview(markdown, theme, {
  includeScreenshot: false,
})

console.log(listThemes().themes.map((t) => t.name))
```

## 能力一览

| 函数 | 说明 |
| --- | --- |
| `renderPreview` / `renderFragment` | 渲染预览（后者默认不回传整页 HTML，省 token） |
| `publishDraft` | 渲染 + 搬运图片 + 发草稿箱（只发草稿） |
| `listThemes` / `resolveTheme` | 主题清单与解析（含本地已保存的自定义主题） |
| `tweakTheme` | **确定性**改主题：改 token / block / 组件级覆盖，不调用 LLM |
| `generateTheme` / `optimizeArticle` | 调 LLM 生成主题 / 优化正文 |
| `saveArticle` | 落盘 Markdown 并返回编辑器 URL（人机交接的入口） |
| `renderComponentPreviews` / `renderThemePreviews` | 组件库 / 主题库预览页数据 |
| `saveUserComponent` / `listUserComponents` | 本地自定义组件库 |
| `analyzeArticle` | 文章体裁 / 语气 / 行业分析（给主题生成做输入） |

## 本地状态

| 路径 | 内容 | 覆盖变量 |
| --- | --- | --- |
| `~/.stylewx/components.json` | 自定义组件库 | `STYLEWX_COMPONENTS_PATH` |
| `~/.stylewx/themes.json` | 已保存的自定义主题 | `STYLEWX_THEMES_PATH` |
| 当前工作目录 | 文章读写根目录 | `STYLEWX_ARTICLES_DIR` |

文件读写会被限制在文章根目录内，避免目录穿越。

---

属于 **[stylewx](https://github.com/wjunhere/stylewx)** —— 把 Markdown 排成微信公众号文章的工具链。MIT License.
