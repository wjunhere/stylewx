# @stylewx/core

Markdown → 微信公众号 HTML 的渲染管线：预处理、组件解析、主题注入、微信兼容处理。

## 安装

```bash
npm i @stylewx/core @stylewx/theme
```

## 用法

```ts
import { renderMarkdownToHtml } from '@stylewx/core'
import { getPresetTheme } from '@stylewx/theme'

const theme = getPresetTheme('magazine')!

const { html, diagnostics } = renderMarkdownToHtml(
  '# 标题\n\n正文 **加粗**，还有 ==高亮==。\n\n:::card{title="结论"}\n卡片正文\n:::',
  theme,
)

console.log(html)        // 可直接投喂 <stylewx/publisher> 发布，或贴进公众号后台
console.log(diagnostics) // 组件层的警告（缺参数、参数未被模板使用等）
```

输出的 `html` 已经按微信规则处理过：保留 SVG/SMIL 交互、剥离所有 `id`、
不使用 `href="#…"`（会导致 `draft/add` 报 errcode 45166）。

## 其它导出

| 函数 | 说明 |
| --- | --- |
| `markdownToHtml(markdown, options)` | 不带主题的纯 Markdown → HTML |
| `collectHeadings(markdown)` | 提取标题树（`toc` 组件用） |
| `countWords` / `estimateReadingMinutes` | 字数与预计阅读时长 |

---

属于 **[stylewx](https://github.com/wjunhere/stylewx)** —— 把 Markdown 排成微信公众号文章的工具链。MIT License.
