/**
 * 组件目录（供 AI 查阅 / MCP 工具返回 / 编辑器组件面板使用）。
 * 这是「让 AI 知道有哪些组件、怎么写」的单一事实来源。
 */

export type ComponentCategory = 'image' | 'structure' | 'decor' | 'interactive' | 'article' | 'custom'

export interface ComponentPropSpec {
  name: string
  type: string
  description: string
  default?: string
}

export interface ComponentSpec {
  name: string
  category: ComponentCategory
  summary: string
  example: string
  props?: ComponentPropSpec[]
  notes?: string
  /** 支持的样式覆盖寻址键（root / * / 语义部位），由 COMPONENT_SLOTS 提供。 */
  slots?: string[]
}

export const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  image: '图片',
  structure: '结构',
  decor: '装饰',
  interactive: '交互',
  article: '文章级',
  custom: '自定义',
}

export const COMPONENT_CATALOG: ComponentSpec[] = [
  // ---------------- 图片 ----------------
  {
    name: 'image',
    category: 'image',
    summary: '单张图片，支持图注条、圆角、阴影、点击跳转。',
    example: `:::image{src="https://example.com/a.jpg" caption="图注文字" caption-position="bar" rounded="true"}
:::`,
    props: [
      { name: 'src', type: 'url', description: '图片地址（发布时会自动搬运到微信素材库）' },
      { name: 'caption', type: 'text', description: '图注' },
      { name: 'caption-position', type: 'bar | overlay | none', description: '图注样式，bar=底部色条，overlay=贴底图注条', default: 'bar' },
      { name: 'rounded', type: 'boolean', description: '是否圆角', default: 'true' },
      { name: 'shadow', type: 'boolean', description: '是否投影', default: 'false' },
      { name: 'width', type: 'full | inset | 百分比', description: '图片宽度', default: 'full' },
      { name: 'href', type: 'url', description: '点击跳转链接' },
    ],
  },
  {
    name: 'gallery',
    category: 'image',
    summary: '多图网格，2~4 列，自动排布并显示小图注。',
    example: `:::gallery{cols="3" caption="图组说明"}
![图一](https://example.com/1.jpg)
![图二](https://example.com/2.jpg)
![图三](https://example.com/3.jpg)
:::`,
    props: [
      { name: 'cols', type: '1-4', description: '列数（默认按图片数量自动选 2 或 3）' },
      { name: 'caption', type: 'text', description: '整组图注' },
      { name: 'show-caption', type: 'boolean', description: '是否显示每张图的小图注', default: 'true' },
    ],
  },
  {
    name: 'image-card',
    category: 'image',
    summary: '图文卡片：左图右文或上图下文，带标题与描述。',
    example: `:::image-card{src="https://example.com/cover.jpg" title="卡片标题" desc="一句话描述" layout="left" href="https://example.com"}
:::`,
    props: [
      { name: 'src', type: 'url', description: '图片地址' },
      { name: 'title', type: 'text', description: '标题' },
      { name: 'desc', type: 'text', description: '描述文字' },
      { name: 'layout', type: 'left | top', description: '左图右文 / 上图下文', default: 'left' },
      { name: 'href', type: 'url', description: '点击跳转链接' },
    ],
  },
  {
    name: 'carousel',
    category: 'image',
    summary: '自动轮播图（SVG + SMIL，微信端真实播放，无需点击）。',
    example: `:::carousel{height="200" interval="3"}
![第一张](https://example.com/1.jpg)
![第二张](https://example.com/2.jpg)
:::`,
    props: [
      { name: 'height', type: 'number', description: '画布高度（viewBox 单位，宽度固定 320）', default: '200' },
      { name: 'interval', type: 'number', description: '每张停留秒数', default: '3' },
      { name: 'caption', type: 'text', description: '轮播下方说明' },
    ],
    notes: '微信会剥离 id，因此不能使用 SVG 渐变/裁剪引用；轮播用叠加 <image> + 错峰 opacity 动画实现。',
  },

  // ---------------- 结构 ----------------
  {
    name: 'card',
    category: 'structure',
    summary: '卡片容器：标题 + 正文，可设图标、配色与样式变体。',
    example: `:::card{title="核心结论" tone="primary" icon="📌"}
正文支持完整 Markdown，包括 **加粗**、列表、图片。
:::`,
    props: [
      { name: 'title', type: 'text', description: '卡片标题（也可直接写在 :::card 后）' },
      { name: 'tone', type: 'primary | success | warning | danger | info | neutral | dark', description: '配色', default: 'primary' },
      { name: 'icon', type: 'emoji/文字', description: '标题前图标，缺省用色块' },
      { name: 'variant', type: 'soft | plain | raised', description: '视觉变体', default: 'soft' },
      { name: 'footer', type: 'text', description: '底部备注' },
    ],
  },
  {
    name: 'timeline',
    category: 'structure',
    summary: '时间线：每行写「时间 | 内容」。',
    example: `:::timeline{title="项目历程"}
- 2023 | 项目启动
- 2024-03 | 首版上线
- 2025 | 组件库发布
:::`,
    props: [
      { name: 'title', type: 'text', description: '时间线标题' },
      { name: 'tone', type: '颜色名', description: '节点配色', default: 'primary' },
    ],
  },
  {
    name: 'steps',
    category: 'structure',
    summary: '步骤条：每行写「标题 | 说明」，纵向或横向。',
    example: `:::steps{layout="vertical"}
1. 注册账号 | 用手机号完成注册
2. 配置主题 | 选择或让 AI 生成主题
3. 发布草稿 | 一键写入公众号草稿箱
:::`,
    props: [
      { name: 'layout', type: 'vertical | horizontal', description: '排布方向', default: 'vertical' },
      { name: 'tone', type: '颜色名', description: '序号配色', default: 'primary' },
    ],
  },
  {
    name: 'compare',
    category: 'structure',
    summary: '左右对比：把两列表格渲染成两栏卡片。',
    example: `:::compare{layout="stack"}
| 旧方案 | 新方案 |
| --- | --- |
| 手动调格式 | AI 自动排版 |
| 样式单调 | 组件丰富 |
:::`,
    props: [
      { name: 'layout', type: 'stack | side', description: '上下堆叠 / 左右并排', default: 'stack' },
      { name: 'left-tone', type: '颜色名', description: '左栏配色', default: 'neutral' },
      { name: 'right-tone', type: '颜色名', description: '右栏配色', default: 'primary' },
    ],
  },
  {
    name: 'quote',
    category: 'structure',
    summary: '引用卡片：带引号装饰、作者与出处。',
    example: `:::quote{author="鲁迅" source="《热风》"}
愿中国青年都摆脱冷气，只是向上走。
:::`,
    props: [
      { name: 'author', type: 'text', description: '作者' },
      { name: 'source', type: 'text', description: '出处' },
      { name: 'tone', type: '颜色名', description: '配色', default: 'primary' },
    ],
  },
  {
    name: 'toc',
    category: 'structure',
    summary: '自动目录：根据文章二三级标题生成编号目录。',
    example: `:::toc{title="本文目录" max-level="2"}
:::`,
    props: [
      { name: 'title', type: 'text', description: '目录标题', default: '目录' },
      { name: 'max-level', type: '2 | 3', description: '收录到几级标题', default: '2' },
    ],
    notes: '微信会拒绝 href="#…"（draft/add 直接报 45166），因此目录不含跳转链接，只做视觉编号。',
  },

  // ---------------- 装饰 ----------------
  {
    name: 'divider',
    category: 'decor',
    summary: '分割线：直线 / 圆点 / 波浪 / 渐变 / 带文字。',
    example: `:::divider{style="wave" tone="primary"}
:::`,
    props: [
      { name: 'style', type: 'line | dot | wave | gradient', description: '样式', default: 'line' },
      { name: 'text', type: 'text', description: '居中文字（有文字时渲染为左右夹线）' },
      { name: 'tone', type: '颜色名', description: '配色', default: 'primary' },
    ],
  },
  {
    name: 'section-title',
    category: 'decor',
    summary: '章节标题：大号序号 + 标题 + 渐变下划线 + 副标题。',
    example: `:::section-title{index="01" title="为什么要做组件库" subtitle="WHY COMPONENTS" align="left"}
:::`,
    props: [
      { name: 'index', type: 'text', description: '序号，如 01' },
      { name: 'title', type: 'text', description: '标题' },
      { name: 'subtitle', type: 'text', description: '副标题' },
      { name: 'align', type: 'left | center', description: '对齐', default: 'left' },
      { name: 'tone', type: '颜色名', description: '配色', default: 'primary' },
    ],
  },
  {
    name: 'badge',
    category: 'decor',
    summary: '标签 / 徽章，可实心或描边。',
    example: `:::badge{text="新功能" tone="success"}
:::`,
    props: [
      { name: 'text', type: 'text', description: '标签文字' },
      { name: 'tone', type: '颜色名', description: '配色', default: 'primary' },
      { name: 'outline', type: 'boolean', description: '描边样式', default: 'false' },
      { name: 'block', type: 'boolean', description: '独占一行', default: 'false' },
    ],
  },
  {
    name: 'callout',
    category: 'decor',
    summary: '提示框，兼容旧写法 :::warning / :::tip / :::info 等。',
    example: `:::callout{type="warning" title="注意"}
正文会继续按 Markdown 渲染。
:::`,
    props: [
      { name: 'type', type: 'info | tip | important | warning | danger | success | note', description: '类型', default: 'info' },
      { name: 'title', type: 'text', description: '标题' },
      { name: 'icon', type: 'emoji/文字', description: '自定义图标' },
    ],
  },
  {
    name: 'background',
    category: 'decor',
    summary: '局部背景块：柔和底色 / 渐变 / 实色 / 描边。',
    example: `:::background{tone="primary" variant="gradient"}
被背景包住的正文。
:::`,
    props: [
      { name: 'tone', type: '颜色名', description: '配色', default: 'primary' },
      { name: 'variant', type: 'soft | gradient | solid | outline', description: '背景样式', default: 'soft' },
      { name: 'padding', type: 'css 长度', description: '内边距', default: '14px 16px' },
    ],
  },
  {
    name: 'canvas',
    category: 'decor',
    summary: '整篇画布：给全文套一层带纹理/渐变的背景。',
    example: `::::canvas{tone="paper" padding="18px"}
# 文章标题

全文内容写在这里。

:::card{title="注意"}
组件可以嵌套在画布内。
:::
::::`,
    props: [
      { name: 'tone', type: 'paper | grid | dots | lines | diagonal | gradient', description: '背景样式', default: 'paper' },
      { name: 'bg', type: 'css 颜色', description: '自定义底色（会覆盖 tone）' },
      { name: 'padding', type: 'css 长度', description: '内边距', default: '16px' },
    ],
    notes: '纹理使用 CSS repeating-linear-gradient / radial-gradient 实现，不依赖外部图片。',
  },
  {
    name: 'draw',
    category: 'decor',
    summary: '描边动画：下划线 / 波浪 / 对勾 / 圆圈，进入文章后自动绘制。',
    example: `:::draw{shape="underline" tone="primary" text="重点在这里"}
:::`,
    props: [
      { name: 'shape', type: 'underline | wave | check | circle', description: '图形', default: 'underline' },
      { name: 'duration', type: 'css 时间', description: '动画时长', default: '1.6s' },
      { name: 'loop', type: 'boolean', description: '是否循环播放', default: 'false' },
      { name: 'text', type: 'text', description: '图形下方说明' },
      { name: 'tone', type: '颜色名', description: '配色', default: 'primary' },
    ],
  },

  // ---------------- 交互 ----------------
  {
    name: 'reveal',
    category: 'interactive',
    summary: '点击展开：点一下显示答案（SVG + SMIL，微信端真实可点）。',
    example: `:::reveal{label="点击查看答案" tone="primary"}
这里的文字会在点击后淡入显示。
:::`,
    props: [
      { name: 'label', type: 'text', description: '按钮文字', default: '点击查看答案' },
      { name: 'answer', type: 'text', description: '答案文字（缺省取组件正文）' },
      { name: 'font-size', type: 'number', description: '答案字号', default: '14' },
      { name: 'tone', type: '颜色名', description: '配色', default: 'primary' },
    ],
    notes: '单向展开（SMIL 无状态，无法再次点击收起）；内容为纯文本，自动按宽度折行。',
  },
  {
    name: 'progress',
    category: 'interactive',
    summary: '进度条：进入文章后从 0 生长到指定百分比。',
    example: `:::progress{value="72" label="完成度" tone="primary"}
:::`,
    props: [
      { name: 'value', type: '0-100', description: '百分比' },
      { name: 'label', type: 'text', description: '左侧标签' },
      { name: 'height', type: 'number', description: '条高（viewBox 单位）', default: '10' },
      { name: 'show-value', type: 'boolean', description: '是否显示百分比数字', default: 'true' },
      { name: 'duration', type: 'css 时间', description: '动画时长', default: '1.4s' },
    ],
  },
  {
    name: 'pulse',
    category: 'interactive',
    summary: '呼吸强调：闪烁圆点 + 文字，用于限时/重点提示。',
    example: `:::pulse{text="限时福利，仅剩 3 天" tone="danger"}
:::`,
    props: [
      { name: 'text', type: 'text', description: '文字' },
      { name: 'tone', type: '颜色名', description: '配色', default: 'danger' },
      { name: 'dot', type: 'boolean', description: '是否显示呼吸圆点', default: 'true' },
    ],
  },

  // ---------------- 文章级 ----------------
  {
    name: 'cover',
    category: 'article',
    summary: '封面头图：大标题 + 副标题 + 作者日期，可配背景图。',
    example: `:::cover{title="组件库上线了" subtitle="RICH COMPONENTS" author="stylewx" date="2025-09" image="https://example.com/cover.jpg"}
:::`,
    props: [
      { name: 'title', type: 'text', description: '主标题' },
      { name: 'subtitle', type: 'text', description: '副标题' },
      { name: 'author', type: 'text', description: '作者' },
      { name: 'date', type: 'text', description: '日期' },
      { name: 'image', type: 'url', description: '背景图（缺省用主题渐变）' },
      { name: 'height', type: 'number', description: '高度（viewBox 单位）', default: '220' },
      { name: 'tone', type: '颜色名', description: '无背景图时的配色', default: 'primary' },
    ],
  },
  {
    name: 'end-card',
    category: 'article',
    summary: '结尾卡片：感谢阅读 / 下期预告 / 关注引导。',
    example: `:::end-card{title="感谢阅读" footer="stylewx · 让排版自动化"}
如果这篇对你有帮助，欢迎**转发**给同事。
:::`,
    props: [
      { name: 'title', type: 'text', description: '标题', default: '感谢阅读' },
      { name: 'text', type: 'text', description: '正文（缺省取组件正文）' },
      { name: 'footer', type: 'text', description: '底部小字' },
      { name: 'tone', type: '颜色名', description: '配色', default: 'primary' },
    ],
  },
]

/** 按名称查组件规格。 */
export function getComponentSpec(name: string): ComponentSpec | undefined {
  return COMPONENT_CATALOG.find((c) => c.name === name)
}

/** 生成给 LLM 看的组件速查表（Markdown）。 */
export function catalogToMarkdown(categories?: ComponentCategory[]): string {
  const list = categories?.length ? COMPONENT_CATALOG.filter((c) => categories.includes(c.category)) : COMPONENT_CATALOG
  const lines: string[] = []
  for (const category of Object.keys(CATEGORY_LABELS) as ComponentCategory[]) {
    const items = list.filter((c) => c.category === category)
    if (items.length === 0) continue
    lines.push(`### ${CATEGORY_LABELS[category]}`)
    for (const item of items) {
      const slots = slotsForComponent(item.name).filter((x) => x !== 'root' && x !== '*')
      lines.push(`- \`:::${item.name}\` — ${item.summary}${slots.length ? `（可定制部位：root / * / ${slots.join(' / ')}）` : '（可定制：root / *）'}`)
      lines.push('```')
      lines.push(item.example)
      lines.push('```')
    }
  }
  return lines.join('\n')
}

/**
 * 各组件支持的样式覆盖寻址键（主题 `components.<组件名>.<部位>`）。
 *
 * - `root` 组件最外层；`*` 组件内所有元素（这两个所有组件都有）
 * - 其余是语义部位，由渲染器用 `data-swx-slot` 标记
 *
 * 未登记的组件只支持 `root` 与 `*`。该表由 `components.test.ts` 逐项自校验：
 * 声明的每个部位都必须能被覆盖真实命中，防止登记表与实现漂移。
 */
export const COMPONENT_SLOTS: Record<string, string[]> = {
  card: ['root', '*', 'title', 'titleIcon', 'body', 'footer'],
  callout: ['root', '*', 'title', 'body'],
  quote: ['root', '*', 'text', 'author'],
  'section-title': ['root', '*', 'index', 'title', 'underline', 'subtitle'],
  image: ['root', '*', 'img', 'caption'],
  'end-card': ['root', '*', 'title', 'text', 'footer'],
  follow: ['root', '*', 'title', 'text', 'footer'],
}

/** 取某组件支持的寻址键；未登记则返回通用的 root / *。 */
export function slotsForComponent(name: string): string[] {
  return COMPONENT_SLOTS[name] ?? ['root', '*']
}

// 把槽位挂到目录条目上（list_components 直接返回，agent 不用猜）
for (const spec of COMPONENT_CATALOG) {
  spec.slots = slotsForComponent(spec.name)
}
