# stylewx 富组件参考

本文档说明 stylewx 的富组件语法、可用组件与微信端约束。
组件由 `@stylewx/components` 提供，`@stylewx/core` 在 Markdown 渲染阶段编译成**内联样式 HTML**。

---

## 1. 语法

```
:::组件名{参数="值" 参数2=值}
正文（完整 Markdown，可含嵌套组件）
:::
```

- 开启行：至少 3 个冒号 + 组件名 + 可选 `{参数}`。
- 闭合行：与开启行**冒号数量相同**的一行冒号。
- 嵌套：外层用更多冒号。

```
::::canvas{tone="paper" padding="18px 16px"}

:::card{title="卡片标题" icon="📌"}
卡片正文，支持 **加粗**、列表、图片。
:::

::::

```

- 参数值可用双引号或单引号包裹；不写等号时值为 `true`（如 `outline`）。
- 代码围栏（```` ``` ```` / `~~~`）内的 `:::` 不会被解析。
- 未闭合的组件会在文档结尾自动闭合（对 LLM 输出容错）。
- 只有 `callout` 系列支持 `:::warning 标题` 这种尾随标题写法；其它组件必须用 `title="…"`。

> 每个组件都必须闭合。漏写闭合 `:::` 会让后续内容被吞进该组件——此时渲染结果会带一条
> `diagnostics` 警告，`render_preview` 也会在返回里给出。

---

## 2. 微信端约束（实测结论）

以下结论来自对本项目绑定公众号的真实调用：`draft/add` 写入 → `draft/get` 取回 → Chromium 渲染核对。
复现脚本：`apps/mcp-server/scripts/probe-wechat-capabilities.mjs`、`packages/preview/probe-svg-full.mjs`。

| 特性 | 结果 | 说明 |
| --- | --- | --- |
| `<svg>` / `<animate>` / `<animateTransform>` | 保留并生效 | 自动循环、`begin="click"` 点击交互均可真实触发 |
| SVG 属性大小写 | 被小写化 | `viewBox` → `viewbox`；浏览器 HTML 解析器会按规范纠正回来，照常写驼峰即可 |
| `id` 属性 | **被剥离** | 因此 `url(#id)`（渐变 / 裁剪 / 遮罩 / `<use>`）全部失效，组件禁止使用 |
| SVG 内 `<a>` | 被移除 | SVG 里不能放链接 |
| `href="#…"` 页内锚点 | **直接报错** | `draft/add` 返回 errcode 45166，因此目录组件不含跳转链接 |
| `<script>` / `<style>` / `<iframe>` / `<details>` | 被剥离 | `<details>` 只剩 `<summary>`，所以点击展开只能用 SVG + SMIL |
| `position` / `filter` | 被过滤 | 组件不使用；布局一律用 `flex` + `gap` |
| `flex` / `gap` / `background-image`（渐变）/ `box-shadow` / `transform` / `transition` | 保留 | 灰度属性，校验器会给出 warning，但实测可用 |
| `<img>` / SVG `<image>` 外链 | 会被拦截 | `publish_draft` 会自动下载并上传到素材库，替换为 `mmbiz.qpic.cn` 链接（含 SVG `<image>`） |

因此本组件库的交互全部是**声明式 SVG + SMIL**，不含任何 JavaScript。

---

## 3. 组件清单

组件目录的单一事实来源是 `packages/components/src/catalog.ts`，
也可以直接调用 MCP 工具 `list_components`（支持 `category` 与 `format=markdown`）。

### 图片

| 组件 | 说明 |
| --- | --- |
| `:::image` | 单图 + 图注条，支持圆角、阴影、点击跳转 |
| `:::gallery` | 2~4 列多图网格 |
| `:::image-card` | 图文卡片（左图右文 / 上图下文） |
| `:::carousel` | 自动轮播（SVG + SMIL，无需点击） |

### 结构

| 组件 | 说明 |
| --- | --- |
| `:::card` | 卡片容器，可设标题、图标、配色、变体 |
| `:::timeline` | 时间线，每行写 `时间 \| 内容` |
| `:::steps` | 步骤条，每行写 `标题 \| 说明`，纵向或横向 |
| `:::compare` | 两列表格 → 左右对比卡片 |
| `:::quote` | 引用卡片，带作者与出处 |
| `:::toc` | 自动目录（按二三级标题生成，无跳转链接） |

### 装饰

| 组件 | 说明 |
| --- | --- |
| `:::divider` | 分割线：直线 / 圆点 / 波浪 / 渐变 / 带文字 |
| `:::section-title` | 章节标题：大号序号 + 渐变下划线 + 副标题 |
| `:::badge` | 标签 / 徽章，实心或描边 |
| `:::callout` | 提示框（别名 `:::info` / `:::tip` / `:::warning` / `:::danger` / `:::success` / `:::note`） |
| `:::background` | 局部背景块：柔和底色 / 渐变 / 实色 / 描边 |
| `:::canvas` | 整篇画布：给全文套一层纹理或渐变背景 |
| `:::draw` | 描边动画：下划线 / 波浪 / 对勾 / 圆圈 |

### 交互

| 组件 | 说明 |
| --- | --- |
| `:::reveal` | 点击展开（SVG + SMIL，单向；内容为纯文本自动折行） |
| `:::progress` | 进度条，进入文章后从 0 生长到指定百分比 |
| `:::pulse` | 呼吸圆点 + 文字，用于限时 / 重点提示 |

### 文章级

| 组件 | 说明 |
| --- | --- |
| `:::cover` | 封面头图：标题 + 副标题 + 作者日期，可配背景图 |
| `:::end-card` | 结尾卡片（别名 `:::follow`） |

参数与示例见 `list_components` 返回的 `components[].props` / `components[].example`。

---

## 4. 完整示例

见 `examples/component-showcase.md`。渲染产物：

```bash
# HTML + 390px 截图 + 校验报告
node --env-file=.env apps/mcp-server/scripts/render-showcase.mjs

# 真实发布到草稿箱并逐项核对微信侧存活
node --env-file=.env apps/mcp-server/scripts/verify-wechat-showcase.mjs
```

---

## 5. 给 AI Agent 的用法建议

1. 先调 `list_components` 拿到组件清单与参数，避免臆造组件名或参数。
2. 组件正文里继续用 Markdown；需要强调层级时优先用组件（卡片 / 章节标题 / 分割线），
   而不是一味加粗。
3. 需要真交互（点击展开）才用 `reveal`；纯视觉动效用 `progress` / `pulse` / `draw`。
4. 图片直接用外链 URL，发布时会被自动搬运；不要自己拼 `mmbiz.qpic.cn` 链接。
5. 不要写 `href="#…"`、不要依赖 `id`、不要在 SVG 里用 `url(#…)`——这三件事微信端必然失效。
6. `render_preview` 返回的 `diagnostics` 若非空，说明组件写法有问题，按提示修正后再发布。

---

## 6. HTML 反向导入（编辑器「导入 HTML」）

渲染出的 HTML 带机器可读标记，因此可以**再导回编辑器继续编辑**，组件会还原成 `:::` 指令。

### 6.1 标记长什么样

```html
<div data-swx="card" data-swx-props="title=%E6%A0%87%E9%A2%98&amp;tone=primary">
  <div data-swx-body="1">…正文…</div>
</div>
```

- `data-swx`：组件名。
- `data-swx-props`：URL 编码的参数，导入时原样还原成 `{title="标题" tone=primary}`。
- `data-swx-body`：Markdown 正文容器，导入时按 DOM 结构还原成 Markdown。
- `data-swx-src`：结构化正文（时间线 / 步骤 / 表格对比 / 图库 / 轮播 / 点击展开 / 单图）的**原始文本**，导入时直接取用，避免 DOM 还原失真。

这些属性是 `data-*`，**实测微信 `draft/add → draft/get` 会完整保留**（含 SVG 元素），
所以从公众号取回的文章同样能导回。

### 6.2 还原规则

| 情况 | 结果 |
| --- | --- |
| 带 `data-swx` 的组件 | 还原为 `:::组件名{参数}`，嵌套时外层自动分配更多冒号 |
| 组件内 Markdown 正文 | 从 DOM 还原（标题 / 列表 / 表格 / 代码块 / 图片 / 加粗等） |
| 结构化正文组件 | 直接取 `data-swx-src` 原文 |
| 无标记的 HTML | 退化为普通 HTML→Markdown；无法映射的标签原样保留为 HTML |
| 标题 | 优先 `<h1>`，其次 `:::cover` 的 `title` |

### 6.3 用法

编辑器左侧「导入 HTML」→ 粘贴 HTML 或选择 `.html` 文件 → 「导入并还原」。
也可直接调接口：

```bash
curl -X POST http://localhost:3777/editor/api/import-html \
  -H 'content-type: application/json' \
  -d '{"html":"<section>…</section>"}'
# → { markdown, title, components: [{name, props, bodyFrom}], warnings }
```

代码侧：

```ts
import { htmlToMarkdown } from '@stylewx/components'
const { markdown, title, components, warnings } = htmlToMarkdown(html)
```

### 6.4 验证

```bash
# 本地往返：渲染 → 回导 → 再渲染，比对组件标记与纯文本
node --env-file=.env apps/mcp-server/scripts/verify-html-roundtrip.mjs

# 真实微信往返：发布 → 取回 → 回导，检查组件是否全部还原
node --env-file=.env apps/mcp-server/scripts/verify-wechat-showcase.mjs
```

`examples/component-showcase.md` 的实测结果：**21/21 组件标记一致、纯文本一致**；
从微信取回的 HTML 回导后 **16/16 组件类型全部还原**，标题与嵌套冒号均正确，0 条警告。
