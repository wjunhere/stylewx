# @stylewx/components

富组件库：用 Markdown 里的 `:::name{props}` 指令写出卡片、时间线、轮播、封面等排版组件，
渲染成**微信公众号真正保留的 HTML**。

## 安装

```bash
npm i @stylewx/components
```

## 组件一览

| 类别 | 组件 |
| --- | --- |
| 图片位 | `image`、`gallery`、`image-card`、`carousel`、`cover` |
| 结构位 | `card`、`timeline`、`steps`、`compare`、`quote`、`toc`、`section-title` |
| 装饰位 | `divider`、`badge`、`callout`、`background`、`canvas`、`draw` |
| 交互位 | `reveal`、`progress`、`pulse` |
| 文章级 | `end-card`（别名 `follow`） |

## 用法

```ts
import {
  COMPONENT_CATALOG,
  getComponentSpec,
  parseComponents,
  renderDocument,
  htmlToMarkdown,
} from '@stylewx/components'

// 目录：每个组件的 props、语义槽位、示例
for (const spec of COMPONENT_CATALOG) console.log(spec.name, spec.summary)

// 组件示例 Markdown（可直接抄给用户）
const example = getComponentSpec('gallery')?.example

// Markdown（含 ::: 指令）→ 渲染节点树
const nodes = parseComponents(':::card{title="结论"}\n正文支持 **Markdown**\n:::')

// 反向：把渲染出的 HTML 还原成 Markdown（保留 ::: 指令，可无损回导编辑器）
const markdown = htmlToMarkdown(html)
```

> 多数场景直接用 [`@stylewx/core`](https://www.npmjs.com/package/@stylewx/core) 的
> `renderMarkdownToHtml(markdown, theme)` 更省事——它会一并处理主题与校验。

## 交互是怎么做的

微信正文**禁用 JavaScript**，`<details>` 会被剥离，`:target` 这类方式也不可靠。
所以这里的交互全部用**内联 SVG + SMIL**（`<animate>` / `<animateTransform>` / `begin="click"`）实现，
实测微信完整保留。

## 自定义组件

支持用 HTML 模板定义自己的组件，模板语法刻意做小：
`{{prop}}`、`{{prop|raw}}`、`{{body}}`、`{{theme.*}}`、`{{#if}}`、`{{#unless}}`、
`{{#each body}}`（含 `{{this}}` / `{{@index}}`）。
保存时会用样例渲染跑一次安全闸门，确保产物仍符合微信约束。

---

属于 **[stylewx](https://github.com/wjunhere/stylewx)** —— 把 Markdown 排成微信公众号文章的工具链。MIT License.
