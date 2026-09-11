---
name: stylewx-article
description: 用 stylewx MCP 把 Markdown 排成一篇可发布的微信公众号文章——先定主题、再按节写富组件、逐段验证、最后发草稿箱并交接给本地编辑器微调。当用户要求「排版/美化公众号文章」「用组件做图文」「生成或微调排版主题」「发布到公众号草稿箱」，或需要挑选富组件、检查微信兼容性时使用。
---

# stylewx 公众号排版

把「排版」当成一个**分步、可回退的迭代过程**，不要一次性生成整篇文章。

## 四条原则

1. **分节推进**：每写完一节先 `render_fragment` 验证，再写下一节。不要憋到最后才发现组件写错。
2. **组件按语义选**：一篇文章 3~6 个组件通常就够。堆砌组件比没有组件更糟。
3. **主题先定骨架再微调**：改一个颜色不要重新生成整包主题，用 `tweak_theme`。
4. **最终交给人在编辑器收尾**：`save_article` 落盘并给出 `editorUrl`，让人微调。

## 前置检查

- stylewx MCP 已连接（能调到 `list_themes` / `list_components`）。
- 发布需要 `WECHAT_APP_ID` / `WECHAT_APP_SECRET`；生成主题需要 `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`。
  缺配置时工具会返回 `missing_*` 错误，**不要重试**，直接告诉用户去配。

## 工作流

### 0. 先看清单（整轮只做一次）

```
list_components              # 全部组件 + 参数 + 示例；只要某一类时传 category
list_themes                  # 预置主题（含完整 token/block，可直接复用）
```

### 1. 定主题

按情况选一条路径：

| 情况 | 用什么 | 代价 |
| --- | --- | --- |
| 用户给了明确风格描述 | `generate_theme{prompt}` | 慢，烧 LLM |
| 已有一篇稿子，想让主题贴合内容 | `generate_theme{article}` | 慢，烧 LLM |
| 已选好主题，只想改几处 | `tweak_theme{theme, tokens}` | 秒回，不烧 LLM |
| 想精确控制某个元素样式 | `tweak_theme{theme, blocks}` | 秒回 |

`tweak_theme` 常用字段：`primaryColor`、`textColor`、`fontSize`、`lineHeight`、`fontFamily`、`radius`、`cardBg`、`dividerColor`。
满意后用 `save_theme` 存档，后续直接按名复用。

### 2. 拆结构

先列出骨架：标题 + 每节打算用什么组件。**不要一次写全文。**

### 3. 逐节写 + 逐节验证

每写完一节：

```
render_fragment{markdown: "<这一节的 md>", theme: "<主题名或对象>"}
```

看三样东西：
- `components`：组件名/参数有没有写错
- `diagnostics`：有没有「未知组件」「漏写闭合 `:::`」这类问题
- `validation.pass`：有没有 error

有问题就地改。`render_fragment` 默认**不返回 HTML**（省上下文），需要看时传 `includeHtml: true`。

### 4. 整篇收口

```
render_preview{markdown, theme}     # 整篇 HTML + 390px 截图 + 校验
validate_article{html}              # 必须 pass=true 且 error 为 0
```

外链图片不用手动处理，`publish_draft` 会自动下载并上传到微信素材库。

### 5. 发布

```
publish_draft{title, markdown, theme, author?, digest?, coverImage?}
```

只写入**草稿箱**，不会群发。发布后仍需人在公众号后台确认。

### 6. 交接给人微调

```
save_article{markdown, title}
# → { path, bytes, editorUrl }
```

把 `editorUrl` 给用户，他在本地编辑器里改。改完你可以直接读同一个 `.md` 继续迭代。
写入范围默认限制在当前工作目录（可用 `STYLEWX_ARTICLES_DIR` 调整）。

## 自定义组件样式

组件样式分三层，**自由度只受微信白名单限制**：

### 1. 主题级（可复用，首选）→ `tweak_theme` 的 `components`

按 `组件名 → 部位 → 声明` 三层寻址：

```json
{
  "theme": "tech-minimal",
  "components": {
    "card": {
      "root":  { "padding": "20px 24px", "border-left-width": "6px" },
      "title": { "font-size": "19px", "letter-spacing": "1px" },
      "*":     { "line-height": "1.9" }
    },
    "badge": { "root": { "border-radius": "6px" } }
  }
}
```

| 寻址键 | 命中 |
| --- | --- |
| `root` | 组件最外层 |
| `*` | 组件内所有元素（适合统一字体/颜色/行高） |
| 语义部位 | `title` `body` `footer` … 具体见 `list_components` 的 `slots` |

**动笔前先看 `list_components` 的 `slots` 字段**，别猜部位名。
写了不存在的部位会收到诊断（不会静默失效），例如：
`主题里为 :::card 配置了「nosuch」部位，但该组件没有这个部位，覆盖未生效。`

### 2. 实例级（一次性微调）→ 组件的 `style` 参数

```
:::card{title="核心结论" style="border-left-width:5px;padding:18px 20px"}
正文
:::
```

只作用于该实例的最外层，优先级高于主题覆盖。

### 3. 优先级与边界

- 优先级：`*` → `root` 或语义部位 → 实例 `style`（后者覆盖前者）。
- 覆盖值同样要过微信白名单：`position`、`filter` 会被直接拒绝。
- `*` 不会进入嵌套组件内部，别指望用外层 `*` 去改内层组件。
- 不要为了改一处样式重新 `generate_theme`；用 `tweak_theme` 的 `components` 秒回。

---
## 组件选择速查

| 内容 | 推荐组件 |
| --- | --- |
| 开篇定调 | `cover`，可加 `pulse` 放一句话导语 |
| 长文导航 | `toc`（自动按二三级标题生成） |
| 配图 | `image`（单图+图注）、`gallery`（多图网格）、`image-card`（图文卡片）、`carousel`（自动轮播） |
| 分节 | `section-title`（带序号）、`divider`（波浪/渐变/圆点） |
| 强调结论 | `card`、`callout`、`badge` |
| 讲演进 / 复盘 | `timeline`、`steps` |
| 讲取舍 | `compare`（两栏对比） |
| 引用 | `quote`（带作者与出处） |
| 互动 | `reveal`（点击展开答案）、`progress`（进度条）、`pulse`（呼吸强调） |
| 收尾 | `end-card` |
| 整篇背景 | `canvas`（外层用 **4 个冒号**包住全文） |

**避坑**（都是真实微信 API 实测结论）：

- `:::card` 这类组件**必须闭合**，漏写 `:::` 会把后面内容吞进去；`render_fragment` 的 `diagnostics` 会提示。
- 嵌套时**外层用更多冒号**：`::::canvas` 里放 `:::card`。
- 不要写 `href="#…"`（`draft/add` 直接返回 errcode 45166）、不要依赖 `id`、SVG 里不要用 `url(#…)`。
- 交互只能用内联 SVG + SMIL（微信正文禁 JS），不要指望 `<details>` / `<input>` / `<script>`。

## 组件写法

```
:::card{title="核心结论" tone="primary"}
正文继续用 Markdown，支持 **加粗**、列表、图片。
:::
```

- 参数写在 `{key="value"}` 里，不写等号表示 `true`（如 `outline`）。
- 每个组件的完整参数见 `list_components` 的返回，不要凭记忆写。

## 参考资料

- `references/wechat-constraints.md` —— 微信端硬约束与实测结论
- `references/theme-recipes.md` —— 常见风格的主题微调配方
