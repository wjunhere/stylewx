# @stylewx/validator

发布前的最后一道闸门：检查 HTML 里的标签、属性、CSS 是否是**微信真正保留的**。

## 安装

```bash
npm i @stylewx/validator
```

## 用法

```ts
import { validateHtml } from '@stylewx/validator'

const report = validateHtml(html)

if (!report.pass) {
  for (const issue of report.issues) {
    console.warn(`[${issue.rule}] ${issue.message}`)
  }
}
```

## 规则依据

所有规则来自真实的 `draft/add` → `draft/get` 往返实测，而不是社区传闻：

**微信会保留**

`<svg>`、`<animate>` / `<animateTransform>`、`begin="click"`、`flex` / `gap`、
渐变、`box-shadow`、`transform`、`data-*` 属性、`aria-label`、`role`

**会被剥离**

- 所有 `id` → 因此 `url(#…)`、`<use>`、以及 SVG 的渐变 / 裁剪 / 遮罩全部失效
- SVG 内的 `<a>`、`<details>`、`position`、`filter`

**会被拒绝（发布报错）**

- `href="#…"` → `draft/add` 返回 **errcode 45166**

**会被小写化**

- SVG 属性名（`viewBox` → `viewbox`）——浏览器 HTML 解析器会自动纠正，照常写驼峰即可

---

属于 **[stylewx](https://github.com/wjunhere/stylewx)** —— 把 Markdown 排成微信公众号文章的工具链。MIT License.
