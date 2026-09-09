# 微信端硬约束（实测）

以下结论来自真实公众号 `draft/add → draft/get → Chromium 渲染` 全链路实测，
不是社区传闻。复现脚本在仓库里：`apps/mcp-server/scripts/probe-wechat-capabilities.mjs`、
`probe-wechat-data-attrs.mjs`、`packages/preview/scripts/probe-wechat-svg.mjs`。

## 会被保留

| 特性 | 说明 |
| --- | --- |
| `<svg>` / `<animate>` / `<animateTransform>` | 完整保留，SMIL 动画真实播放 |
| `begin="click"` | 点击可真实触发（点击展开就靠它） |
| `flex` / `gap` | 布局可以用 |
| `background-image` 渐变、`box-shadow`、`transform`、`transition` | 灰度属性，草稿 API 保留 |
| `data-*` 属性 | 完整保留（含 SVG 元素上），所以组件标记能往返 |
| `aria-label` / `role` | 保留 |

## 会被剥离

| 特性 | 后果 |
| --- | --- |
| `id` | 所有 `id` 消失 → `url(#…)`、`<use>`、SVG 渐变/裁剪/遮罩全部失效 |
| `<svg>` 内的 `<a>` | 链接被移除 |
| `<details>` | 只剩 `<summary>`，折叠功能失效 |
| `position` / `filter` | 被过滤 → 不能用绝对定位叠层 |

## 会直接报错

| 写法 | 结果 |
| --- | --- |
| `href="#…"` 页内锚点 | `draft/add` 返回 **errcode 45166**，整条草稿发不出去 |

所以 `:::toc` 只做视觉编号，不带跳转链接。

## SVG 属性大小写

微信会把属性名小写化（`viewBox` → `viewbox`、`attributeName` → `attributename`），
但浏览器 HTML 解析器会按规范纠正回来，**照常写驼峰即可**，不用自己降级。

## 图片

- 外链图片（非 `mmbiz.qpic.cn`）在读者端会被拦截。
- `publish_draft` 会自动下载并上传到微信素材库，把 `<img src>` 与 SVG `<image href>`
  都替换成 `mmbiz.qpic.cn` 链接。**你不需要自己处理图片域名。**
- 缺封面时 `publish_draft` 会自动生成一张主题色渐变封面。

## 校验器会拦的三类问题

| 规则 | 级别 | 原因 |
| --- | --- | --- |
| `no-hash-anchor` | error | `href="#…"` 导致 draft/add 失败 |
| `id-will-be-stripped` | warning | 依赖 id 的逻辑在读者端失效 |
| `svg-url-ref-broken` | error | `url(#…)` 引用在 id 被剥离后必然失效 |

`css-property-gray` / `css-property-unknown` 是 warning 级别，实测可用，可以保留。
