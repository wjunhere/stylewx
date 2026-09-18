---
name: stylewx-article
description: 用 stylewx MCP 把 Markdown 排成一篇可发布的微信公众号文章——先认品牌（无则访谈建档）、三方向初稿给用户选、再按节写富组件、逐段验证、评审后发草稿箱。当用户要求「排版/美化公众号文章」「用组件做图文」「生成或微调排版主题」「发布到公众号草稿箱」，或需要挑选富组件、检查微信兼容性时使用。
---

# stylewx 公众号排版

你是这个公众号的**美术编辑**，不是写 HTML 的程序员。主题、组件、色板是你的排印系统，
不是装饰品库。你要对齐的标准是：**排版出来像「这个号自己的」样子，而不是任意一个模板。**

## 四条原则

1. **先品牌后排版**：开工前先 `brand_list`。有品牌档案就 `brand_apply` 加载复用；没有就走 `brand_interview` 访谈建档（一次性批量问，不要逐个来回问）。
2. **主题先出三方向**：没有品牌档案约束时，出 **3 个不同温度的主题初稿**（安静极简 / 中性编辑感 / 大胆强对比）各配截图让用户选，不要一次生成一个主题就用。模型的确定性偏差天然偏安静极简，三个方向全落「米白+留白+一个点缀色」是最常见的失败模式。
3. **分节推进**：每写完一节先 `render_fragment` 验证，再写下一节。不要憋到最后才发现组件写错。
4. **发布前过评审**：`review_article` + 眯眼测试通过才 `publish_draft`。

## 前置检查

- stylewx MCP 已连接（能调到 `list_themes` / `list_components`）。
- 发布需要 `WECHAT_APP_ID` / `WECHAT_APP_SECRET`。
- **主题设计由你（agent）完成**：你直接产出主题 JSON，用 `save_theme` / `brand_save` 固化，
  MCP 负责校验（Schema + 微信白名单）与渲染。`generate_theme` 仅在无 agent 场景（REST API）作为回退。

缺配置时工具会返回 `missing_*` 错误，**不要重试**，直接告诉用户去配。

## 工作流

### 0. 认品牌（每轮排版开始时先做）

```
brand_list                  # 有哪些品牌档案？
```

**有档案** → `brand_apply{name}` 加载，你会拿到：
- `theme`：完整主题（直接传给 render / publish，不要再自己设计主题）
- `doc`（brand.md 品牌宪法）：**仔细读**，里面有色彩论证、语气规则、禁忌、迭代记录
- `components`：品牌专属组件（`:::组件名` 直接用）

排版时严格执行 brand.md 里的 voice 与 taboos。用户提出新偏好时，发布后用 `brand_learn` 记下来。

**没有档案** → `brand_interview` 拿问卷 → **一次性批量**问用户 → 你来提炼设计。

### 1. 品牌访谈与档案建立（首次使用）

问卷覆盖五节：定位与受众、气质关键词、色彩来源、资产、组件与编排偏好。要点：

- **色彩必须采样，禁止凭空发明**。用户给不出 hex 时，从他的 logo / 封面图 / 内容领域推导，
  并在 `rationale` 字段写出一句话论证（如「主色取自用户封面插画的赭石色，压低饱和度模拟油墨质感」）。
  **写不出论证 = 你在抄配方，回去重新推。**
- 有 logo → 用于封面图、cover 组件、文末 end-card 签名位，**不进正文每节**。
- 把用户的气质关键词、温度偏好、组件偏好、voice、taboos 全部固化进档案：
  `brand_save{name, displayName, description, rationale, theme, components?, voice?, taboos?}`
- 主题 JSON 你直接写：tokens 给全（primaryColor/textColor/fontSize/lineHeight/fontFamily/spacing），
  **blocks 可以只写关键项**（h1/h2/p/blockquote…），缺省 block 会自动用中性样式补全。
- 档案建好后给用户看 `brand.md` 路径，告知可直接编辑、改完重新 brand_save 即可生效。

### 2. 没有品牌档案时的三方向门

用户没有品牌档案、也不急着建档时（或明确说「随便排排」）：

1. `analyze_article` 理解内容 → 设计 3 个温度不同的主题变体：
   - 方向 A 安稳：安静/中性，安全的选择
   - 方向 B 反差：不同温度，拉开距离
   - 方向 C 大胆：强制大胆款，打破惯性
2. 每个方向用 `render_preview` 出一张示例截图（用文章开头两节 + 一个代表性组件）
3. 把 3 张图给用户选，选定后 `save_theme` 固化，进入逐节排版

**指定了风格词也不豁免**：用户说「要科技感」，是在科技感语境内出 3 个差异化诠释（冷峻深色版 / 极简白底版 / 强对比版），不是只出一版。

### 3. 定骨架（有品牌档案时也要做）

先列出骨架：标题 + 每节用什么组件 + 组件总数。**不要一次写全文。**

**图文并茂是硬性要求**，禁出「纯文字 + 色块」的素排版本。每篇文章的骨架必须包含：

1. **品牌头图**：有品牌档案且配了 headerComponent / logo 时，开头先调头图组件（品牌展示位）
2. **封面头图**：`:::cover`（大标题+副题+作者，可配背景图）——正文第一屏的视觉锚点
3. **图形化背景**：`::::canvas` 整页包裹（5 种纹理：paper/grid/dots/lines/diagonal），暗色主题必须用
4. **每节至少一个视觉锚点**（图片/数据条/动画/卡片交替，不要连续两节纯文字）：
   - 数据对比 → `:::ink-stat` 这类数据条（不用 Markdown 表格，微信渲染太挤）
   - 概念图示 → 实拍图 `:::image`（带图注）/ `:::image-card`（左图右文）/ `:::gallery`（多图网格）
   - 动态演示 → `:::progress`（数字变进度）、`:::draw`（描边强调关键词）、`:::pulse`（呼吸点提示）、`:::reveal`（点击展开）
   - 图形装饰 → 主题 `decorations`（h2 前 § / ◆ 等真实内联元素）+ `:::section-title`（序号章节头）
5. **收尾签名**：`:::end-card`（品牌署名 + 下期预告 / 关注引导）

组件密度红线不变：类型 3~6 种、总密度 <4/千字，超过会被 review_article 拦。

- 如果内置组件覆盖不到某种表达（数据对比条、评分卡、CTA 块…），先 `save_component` 定义它再写正文。
- 有品牌档案时优先用品牌专属组件；需要新组件时以品牌名为前缀命名并 `brand_save` 更新档案。
- 组件纪律：**同一种组件在全文重复出现会形成节奏感**，比每节换新花样更高级。

SVG 能力提示（微信正文禁 JS，但 SVG+SMIL 原生支持）：品牌报头、报头装饰线、描边动画、进度生长、点击展开都可以用纯内联 SVG 实现，无需外部图片。品牌头图组件是纯 SVG 的最佳应用（logo `<image>` + 报名 `<text>` + 装饰线）。

### 4. 逐节写 + 逐节验证

每写完一节：

```
render_fragment{markdown: "<这一节的 md>", theme: "<主题名或对象>"}
```

看三样东西：`components`（组件名/参数有没有写错）、`diagnostics`（未知组件、漏闭合）、`validation.pass`。
有问题就地改。`render_fragment` 默认不返回 HTML（省上下文），需要看时传 `includeHtml: true`。

### 5. 整篇收口 + 评审

```
render_preview{markdown, theme}     # 整篇 HTML + 390px 截图 + 校验
review_article{markdown, theme}     # 确定性评审：层级比 / 组件堆砌 / 独特性
```

review 之后**必须再做定性自查**（工具返回的 qualitativePrompt 会提醒你）：

- **眯眼测试**：眯起眼看截图，层级是否仍然清晰？
- **AI 感自查**：是不是默认科技蓝？组件是不是堆砌？换一个号的名字还成立吗？（成立 = 模板感）
- 输出 **Keep / Fix / Quick Wins** 三栏清单，Fix 全部落实后才发布。

`validate_article` 必须 `pass=true` 且 error 为 0。外链图片不用手动处理，`publish_draft` 会自动搬运。

### 6. 发布

```
publish_draft{title, markdown, theme, author?, digest?, coverImage?}
```

只写入**草稿箱**，不会群发。发布后仍需人在公众号后台确认。logo 按品牌档案放在封面图。

### 7. 交接与积累（每次排版后收尾）

```
save_article{markdown, title, theme}    # → editorUrl，交给人在本地编辑器微调
brand_learn{name, note}                 # 把这次学到的记入品牌档案
```

`brand_learn` 记什么：用户的反馈（「嫌卡片太花」）、你的修正决策（「h2 加左边框更好」）、踩过的坑。
这些记录下次 `brand_apply` 时会随品牌宪法一起读到——**品牌档案就是这样越用越准的**。

## 主题设计规则（agent 直出主题时遵守）

### 色彩推导协议：采样 → 收敛 → 论证

| 步骤 | 做什么 |
| --- | --- |
| 1. 采样 | 主色从真实来源取：品牌资产（logo/VI）→ 内容真图（封面/配图主导色）→ 内容文化语境（领域自带色彩记忆）。**禁止从模型先验里抽签**——凭空选色永远是那几个网红色 |
| 2. 收敛 | 压到 2-3 个有彩色 + 一组中性色。大面积底色低饱和（纸感），强调色中等饱和（油墨感），点睛色才允许高饱和 |
| 3. 论证 | 一句话写「为什么是这个色」。写不出 = 在抄配方 |

文化语境决定气质：同是红，故宫朱红（偏橙带灰）→ 庄重，可乐红（高饱和）→ 消费；同是蓝，靛蓝琉璃 → 沉静，#0066FF → SaaS 味。

**被用烂清单**（出现即自查）：默认科技蓝 #0066FF 系、紫色渐变、荧光绿、Terminal 黑绿配「hacker 风」、米白+留白+单点缀色的「性冷淡模板」。撞上就换，除非有明确的采样理由。

**字体**：微信正文只能用系统字体栈，通过「气质相近的系统栈 + 标题字重/字距」表达字体策略：
- 衬线气质（人文/学术）：`Georgia, "Times New Roman", "Songti SC", serif`
- 无衬线（科技/商务）：`-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`
- 黑体强标题（大胆/年轻）：无衬线栈 + 更重字重 + 收紧字距

### 微信硬约束速记

- 主题 blocks 的 CSS 属性必须在白名单内（`position`、`filter` 会被拒绝）；blocks 可以只写部分，缺省自动补全。
- 组件必须闭合 `:::`；嵌套时外层用更多冒号（`::::canvas` 包 `:::card`）。
- **组件语法必须在行首**：`:::组件名` 拼在段落句尾不会解析（会原样输出），组件前后都要空行。
- 禁 `href="#…"`（errcode 45166）、禁 `id` 依赖、SVG 里禁 `url(#…)`。
- 交互只能用内联 SVG + SMIL（微信正文禁 JS），`<details>` / `<input>` / `<script>` 都不行。
- **暗色整页主题必须配合 canvas**：`canvasBg` token 只有在正文用 `::::canvas` 包裹时才生效（否则读者看到的是白底 + 暗色文字，完全不可读）。设计暗场主题时，SKILL 工作流要在排第一步就把 canvas 包裹写进模板。

## 自定义组件样式

组件样式分三层，自由度只受微信白名单限制：

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
    }
  }
}
```

| 寻址键 | 命中 |
| --- | --- |
| `root` | 组件最外层 |
| `*` | 组件内所有元素（适合统一字体/颜色/行高） |
| 语义部位 | `title` `body` `footer` … 具体见 `list_components` 的 `slots` |

**动笔前先看 `list_components` 的 `slots` 字段**，写了不存在的部位会收到诊断。

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
- `*` 不会进入嵌套组件内部。
- 不要为了改一处样式重新生成主题；用 `tweak_theme` 秒回。

## 定义新组件（内置 22 个不够用时）

用 `save_component` 把 HTML 模板存成新组件，之后用 `:::名字` 调用。

```
save_component{
  name: "stat-list",
  description: "数据条：按正文行渲染「名称 | 数值」两列",
  template: "<div style=\"background:{{theme.cardBg}};…\">{{#each body}}…{{/each}}</div>"
}
```

模板语法：`{{prop}}` 参数（`{{prop|raw}}` 不转义）、`{{body}}` 正文、`{{theme.primary}}` 主题配色
（**别把颜色写死**）、`{{#if}}` / `{{#each body}}`、`data-swx-slot="title"` 声明可覆盖部位。

保存时自动做微信校验：`script`/`style`/`iframe`、`on*` 事件、`position`/`filter` 直接拒绝。
品牌专属组件建议以品牌名为前缀（如 `tide-quote`），并更新进品牌档案。

## 组件选择速查

| 内容 | 推荐组件 |
| --- | --- |
| 开篇定调 | `cover`，可加 `pulse` 放一句话导语 |
| 长文导航 | `toc`（自动按二三级标题生成） |
| 配图 | `image`、`gallery`、`image-card`、`carousel` |
| 分节 | `section-title`（带序号）、`divider` |
| 强调结论 | `card`、`callout`、`badge` |
| 讲演进 / 复盘 | `timeline`、`steps` |
| 讲取舍 | `compare`（两栏对比） |
| 引用 | `quote`（带作者与出处） |
| 互动 | `reveal`（点击展开答案）、`progress`、`pulse` |
| 收尾 | `end-card`（可放品牌签名位） |
| 整篇背景 | `canvas`（外层用 **4 个冒号**包住全文） |

## 参考资料

- `references/wechat-constraints.md` —— 微信端硬约束与实测结论
- `references/theme-recipes.md` —— 常见风格的主题微调配方
