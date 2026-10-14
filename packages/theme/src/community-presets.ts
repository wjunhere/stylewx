/**
 * 社区流行的 Markdown 样式（10 套）。
 *
 * 都是「大家见过的那种样子」：GitHub 的文档、Tailwind 的 prose、Water.css、new.css、
 * Sakura、Pico、LaTeX 论文、Tufte 长文、以及 doocs/md 的「优雅」。
 * 目标是把它们**搬进编辑器让人挑**，所以按各自的原值来，不掺我们的审美。
 *
 * 来源与许可（全部允许再分发）：
 *
 * | 主题 | 来源 | 许可 |
 * | --- | --- | --- |
 * | github-markdown / github-markdown-dark | sindresorhus/github-markdown-css | MIT |
 * | tailwind-prose | tailwindlabs/tailwindcss-typography（`prose` 默认值） | MIT |
 * | water-css | kognise/water.css | MIT |
 * | new-css | xz/new.css | MIT |
 * | sakura | oxalorg/sakura | MIT |
 * | pico | picocss/pico | MIT |
 * | latex-paper | vincentdoerig/latex-css | MIT |
 * | tufte-notes | edwardtufte/tufte-css | MIT |
 * | doocs-grace | doocs/md `theme-css/grace.css`（@brzhang） | WTFPL |
 *
 * ── 三处刻意的偏离（都记在这里，免得后来者以为是抄漏了）──────────────────
 *
 * 1. **正文字距统一 0.04em**（`theme-builder.ts` 的默认值）。这些样式原本都没有字距，
 *    但它们是给西文网页写的；中文多这一点点更耐读。想完全贴原样可以单独覆盖 `p`。
 * 2. **不用 `box-shadow` / 渐变 / `background: linear-gradient`**：
 *    box-shadow 在白名单的 GRAY 档（草稿 API 实测保留、读者端不确定，用它会带来提示），
 *    渐变里的 `background` 属性根本不在白名单。所以 doocs「优雅」原有的投影与渐隐分隔线
 *    换成了边框与纯色底 —— 结构和排版照旧，只把「光源」去掉。
 * 3. **纯黑 `#000` 一律换成近黑**（#111 一档）。实测微信编辑器会把 `color: #000000` 整条吞掉
 *    （mdnice 的默认主题里专门留了 `rgb(1,1,1)` 这个写法绕开它），所以别把正文设成纯黑。
 *
 * 另外两处「搬不过来」的，这里说明原因而不是硬凑：
 *
 * - **Tailwind 的行内代码靠 `code::before/::after` 打反引号**，微信不支持伪元素 ——
 *   退回浅底 + 等宽，不再假装有反引号。
 * - **water.css 的斑马纹**（`tbody tr:nth-child(even)`）与 **LaTeX 的旁注/脚注**需要
 *   `tr` / 旁注定位，主题的 block 只到 `table`/`th`/`td` 一层，表达不了。
 */

import type { Theme } from './schema.js'
import { build } from './theme-builder.js'

/** 与各来源一致的等宽栈（微信只能用它）。 */
const mono = 'Menlo, Consolas, "Courier New", monospace'
const systemSans =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'

/** GitHub Markdown（浅色）—— 蓝色链接、灰底代码、1px 细线标题。 */
const githubMarkdown = build(
  'github-markdown',
  'GitHub 文档风：蓝色链接、灰底行内代码、标题下 1px 细线、表格全框。技术文档、README、代码说明类内容最稳的一套，读者一眼认得。',
  {
    primaryColor: '#0969da',
    textColor: '#1f2328',
    codeBg: '#eff1f3',
    codeColor: '#1f2328',
    blockquoteBg: 'transparent',
    blockquoteColor: '#59636e',
    weakText: '#59636e',
    borderColor: '#d1d9e0',
    tableHeadBg: '#f6f8fa',
  },
  {
    primaryColor: '#0969da',
    textColor: '#1f2328',
    fontSize: '16px',
    lineHeight: 1.55,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
    spacing: { block: '16px' },
    mutedColor: '#59636e',
    cardBg: '#f6f8fa',
    cardBorderColor: '#d1d9e0',
    dividerColor: '#d1d9e0',
    canvasBg: '#ffffff',
    radius: '6px',
  },
  {
    h1: { 'font-size': '1.8em', 'font-weight': '600', display: 'block', 'border-bottom': '1px solid #d1d9e0', 'padding-bottom': '0.3em', margin: '0 0 0.8em' },
    h2: { 'font-size': '1.45em', 'font-weight': '600', display: 'block', 'border-bottom': '1px solid #d1d9e0', 'padding-bottom': '0.3em', margin: '1.5em 0 0.8em' },
    h3: { 'font-size': '1.2em', 'font-weight': '600', 'border-left': 'none', 'padding-left': '0', margin: '1.4em 0 0.6em' },
    p: { margin: '0 0 1em' },
    blockquote: { 'border-left': '4px solid #d1d9e0', 'background-color': 'transparent', color: '#59636e', padding: '0 1em' },
    code: { color: '#1f2328', 'background-color': '#eff1f3', border: 'none', padding: '0.2em 0.4em' },
    pre: { 'background-color': '#f6f8fa', border: 'none', color: '#1f2328', padding: '16px' },
    a: { color: '#0969da', 'border-bottom': '1px solid #0969da' },
    strong: { color: '#1f2328', 'font-weight': '600' },
    hr: { 'border-top': '1px solid #d1d9e0', margin: '1.5em 0' },
    table: { 'font-size': '0.94em' },
    th: { 'background-color': '#f6f8fa', color: '#1f2328', 'font-weight': '600', padding: '0.4em 0.8em', border: '1px solid #d1d9e0' },
    td: { color: '#1f2328', padding: '0.4em 0.8em', border: '1px solid #d1d9e0' },
    figcaption: { color: '#59636e', 'font-size': '0.85em' },
  },
)

/** GitHub Markdown（深色）—— 与浅色同构，色值用它的 dark 版。 */
const githubMarkdownDark = build(
  'github-markdown-dark',
  'GitHub 文档风（深色）：正文深底 #0d1117、亮蓝链接。适合代码、终端、技术长文；注意深底主题必须用 ::::canvas 包整篇，否则读者端可能是白底黑字。',
  {
    primaryColor: '#4493f8',
    textColor: '#f0f6fc',
    codeBg: '#151b23',
    codeColor: '#f0f6fc',
    blockquoteBg: 'transparent',
    blockquoteColor: '#9198a1',
    weakText: '#9198a1',
    borderColor: '#3d444d',
    tableHeadBg: '#151b23',
  },
  {
    primaryColor: '#4493f8',
    textColor: '#f0f6fc',
    fontSize: '16px',
    lineHeight: 1.6,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
    spacing: { block: '16px' },
    mutedColor: '#9198a1',
    cardBg: '#151b23',
    cardBorderColor: '#3d444d',
    dividerColor: '#3d444d',
    canvasBg: '#0d1117',
    pageBackgroundColor: '#0d1117',
    radius: '6px',
  },
  {
    h1: { color: '#f0f6fc', 'font-size': '1.8em', 'font-weight': '600', display: 'block', 'border-bottom': '1px solid #3d444d', 'padding-bottom': '0.3em', margin: '0 0 0.8em' },
    h2: { color: '#f0f6fc', 'font-size': '1.45em', 'font-weight': '600', display: 'block', 'border-bottom': '1px solid #3d444d', 'padding-bottom': '0.3em', margin: '1.5em 0 0.8em' },
    h3: { color: '#f0f6fc', 'font-size': '1.2em', 'font-weight': '600', 'border-left': 'none', 'padding-left': '0', margin: '1.4em 0 0.6em' },
    p: { color: '#f0f6fc', margin: '0 0 1em' },
    blockquote: { 'border-left': '4px solid #3d444d', 'background-color': 'transparent', color: '#9198a1', padding: '0 1em' },
    code: { color: '#f0f6fc', 'background-color': '#151b23', border: 'none', padding: '0.2em 0.4em' },
    pre: { 'background-color': '#151b23', border: 'none', color: '#f0f6fc', padding: '16px' },
    a: { color: '#4493f8', 'border-bottom': '1px solid #4493f8' },
    strong: { color: '#f0f6fc', 'font-weight': '600' },
    hr: { 'border-top': '1px solid #3d444d', margin: '1.5em 0' },
    table: { 'font-size': '0.94em' },
    th: { 'background-color': '#151b23', color: '#f0f6fc', 'font-weight': '600', padding: '0.4em 0.8em', border: '1px solid #3d444d' },
    td: { color: '#f0f6fc', padding: '0.4em 0.8em', border: '1px solid #3d444d' },
    figcaption: { color: '#9198a1', 'font-size': '0.85em' },
  },
)

/** Tailwind Typography 的 `prose` —— 层级靠字号字重，正文灰、标题墨，代码块深灰底。 */
const tailwindProse = build(
  'tailwind-prose',
  'Tailwind prose 风：标题墨黑、正文灰、引用斜体细线，代码块深灰底（浅色正文里最经典的反差）。层级清楚、不加装饰，适合长文与产品博客。',
  {
    primaryColor: '#111827',
    textColor: '#374151',
    codeBg: '#f3f4f6',
    codeColor: '#111827',
    blockquoteBg: 'transparent',
    blockquoteColor: '#374151',
    weakText: '#6b7280',
    borderColor: '#e5e7eb',
  },
  {
    primaryColor: '#111827',
    textColor: '#374151',
    fontSize: '16px',
    lineHeight: 1.75,
    fontFamily: systemSans,
    spacing: { block: '16px' },
    mutedColor: '#6b7280',
    cardBg: '#f9fafb',
    cardBorderColor: '#e5e7eb',
    dividerColor: '#e5e7eb',
    canvasBg: '#ffffff',
    radius: '6px',
  },
  {
    h1: { color: '#111827', 'font-size': '1.7em', 'font-weight': '800', display: 'block', 'border-bottom': 'none', 'padding-bottom': '0', margin: '0 0 0.9em' },
    h2: { color: '#111827', 'font-size': '1.4em', 'font-weight': '700', display: 'block', 'border-bottom': 'none', 'padding-bottom': '0', margin: '2em 0 1em' },
    h3: { color: '#111827', 'font-size': '1.2em', 'font-weight': '600', 'border-left': 'none', 'padding-left': '0', margin: '1.6em 0 0.6em' },
    p: { margin: '1.25em 0' },
    blockquote: { 'font-style': 'italic', 'border-left': '4px solid #e5e7eb', 'background-color': 'transparent', color: '#374151', margin: '1.6em 0' },
    code: { color: '#111827', 'background-color': '#f3f4f6', border: 'none', 'font-weight': '600', padding: '0.15em 0.35em' },
    pre: { 'background-color': '#1f2937', border: 'none', color: '#e5e7eb', 'border-radius': '6px', padding: '0.86em 1.14em' },
    a: { color: '#111827', 'font-weight': '500', 'border-bottom': '1px solid #111827' },
    strong: { color: '#111827', 'font-weight': '600' },
    hr: { 'border-top': '1px solid #e5e7eb', margin: '3em 0' },
    ul: { 'padding-left': '1.625em' },
    ol: { 'padding-left': '1.625em' },
    li: { margin: '0.5em 0' },
    table: { 'font-size': '0.94em' },
    th: { color: '#111827', 'font-weight': '600', 'border': 'none', 'border-bottom': '1px solid #d1d5db', padding: '0.57em' },
    td: { color: '#374151', 'border': 'none', 'border-bottom': '1px solid #d1d5db', padding: '0.57em' },
    figcaption: { color: '#6b7280', 'font-size': '0.88em' },
  },
)

/** Water.css —— 系统字体、青链接、斜体引用配半透明青线，表格只有横线。 */
const waterCss = build(
  'water-css',
  'Water.css 风：系统字体、青色链接、引用是斜体配一道半透明青线、表格只有横线。安静、通用，几乎任何内容都不出错。',
  {
    primaryColor: '#0076d1',
    textColor: '#363636',
    codeBg: '#efefef',
    codeColor: '#111111',
    blockquoteBg: 'transparent',
    blockquoteColor: '#363636',
    weakText: '#767676',
    borderColor: '#dbdbdb',
  },
  {
    primaryColor: '#0076d1',
    textColor: '#363636',
    fontSize: '16px',
    lineHeight: 1.7,
    fontFamily: systemSans,
    spacing: { block: '16px' },
    mutedColor: '#767676',
    cardBg: '#efefef',
    cardBorderColor: '#dbdbdb',
    dividerColor: '#dbdbdb',
    canvasBg: '#fafafa',
    radius: '6px',
  },
  {
    h1: { color: '#111111', 'font-size': '1.6em', 'font-weight': '600', display: 'block', 'border-bottom': 'none', 'padding-bottom': '0', margin: '0 0 0.9em' },
    h2: { color: '#111111', 'font-size': '1.35em', 'font-weight': '600', display: 'block', 'border-bottom': 'none', 'padding-bottom': '0', margin: '1.6em 0 0.9em' },
    h3: { color: '#111111', 'font-size': '1.15em', 'font-weight': '600', 'border-left': 'none', 'padding-left': '0', margin: '1.4em 0 0.6em' },
    blockquote: {
      'border-left': '4px solid rgba(0, 150, 191, 0.67)',
      'background-color': 'transparent',
      'font-style': 'italic',
      padding: '0.5em 1em',
      margin: '1.5em 0',
    },
    code: { color: '#111111', 'background-color': '#efefef', border: 'none', padding: '0.15em 0.4em' },
    pre: { 'background-color': '#efefef', border: 'none', color: '#111111', padding: '14px 16px' },
    a: { color: '#0076d1', 'border-bottom': '1px solid #0076d1' },
    strong: { color: '#111111', 'font-weight': '600' },
    hr: { 'border-top': '1px solid #dbdbdb', margin: '1.5em 0' },
    th: { color: '#111111', 'font-weight': '600', 'border': 'none', 'border-bottom': '1px solid #dbdbdb', padding: '6px' },
    td: { color: '#363636', 'border': 'none', padding: '6px' },
  },
)

/** new.css（Vercel 味）—— Inter、Vercel 蓝、极浅的标题下划线、灰底引用。 */
const newCss = build(
  'new-css',
  'new.css 风（Vercel 味）：Inter 字体、Vercel 蓝链接、标题下一道极浅的横线、引用是灰底灰线。干净利落的现代产品文档感。',
  {
    primaryColor: '#0070f3',
    textColor: '#1a1a1a',
    codeBg: '#f6f8fa',
    codeColor: '#1a1a1a',
    blockquoteBg: '#f6f8fa',
    blockquoteColor: '#1a1a1a',
    weakText: '#666666',
    borderColor: '#e5e7eb',
    tableHeadBg: '#f6f8fa',
  },
  {
    primaryColor: '#0070f3',
    textColor: '#1a1a1a',
    fontSize: '16px',
    lineHeight: 1.7,
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    spacing: { block: '16px' },
    mutedColor: '#666666',
    cardBg: '#f6f8fa',
    cardBorderColor: '#e5e7eb',
    dividerColor: '#e5e7eb',
    canvasBg: '#ffffff',
    radius: '6px',
  },
  {
    h1: { color: '#111111', 'font-size': '1.75em', 'font-weight': '700', display: 'block', 'border-bottom': '1px solid #f6f8fa', 'padding-bottom': '2px', margin: '0 0 0.7em' },
    h2: { color: '#111111', 'font-size': '1.45em', 'font-weight': '700', display: 'block', 'border-bottom': '1px solid #f6f8fa', 'padding-bottom': '2px', margin: '1.5em 0 0.7em' },
    h3: { color: '#111111', 'font-size': '1.2em', 'font-weight': '700', 'border-left': 'none', 'padding-left': '0', margin: '1.3em 0 0.5em' },
    p: { 'line-height': '1.7', margin: '0 0 1em' },
    blockquote: { 'border-left': '5px solid #e5e7eb', 'background-color': '#f6f8fa', padding: '1em 1.2em', margin: '1.5em 0' },
    code: { color: '#1a1a1a', 'background-color': '#f6f8fa', border: '1px solid #e5e7eb', 'border-radius': '4px', padding: '3px 6px' },
    pre: { 'background-color': '#f6f8fa', border: '1px solid #e5e7eb', 'border-radius': '4px', color: '#1a1a1a', padding: '1rem 1.4rem' },
    a: { color: '#0070f3', 'border-bottom': '1px solid #0070f3' },
    strong: { color: '#111111', 'font-weight': '700' },
    hr: { 'border-top': '1px solid #e5e7eb', margin: '2em 0' },
    figcaption: { color: '#666666' },
    th: { 'background-color': '#f6f8fa', color: '#111111', 'font-weight': '600', border: '1px solid #e5e7eb', padding: '0.4em 0.7em' },
    td: { color: '#1a1a1a', border: '1px solid #e5e7eb', padding: '0.4em 0.7em' },
  },
)

/** Sakura —— 深青强调、直角、行高 1.618，标题上留大量空白。 */
const sakura = build(
  'sakura',
  'Sakura 风：深青强调色、通篇直角（无圆角）、行高 1.618、标题上方留大量空白。日系简单，安静耐读；引用是青竖线配浅灰底。',
  {
    primaryColor: '#1d7484',
    textColor: '#4a4a4a',
    codeBg: '#f1f1f1',
    codeColor: '#444444',
    blockquoteBg: '#f1f1f1',
    blockquoteColor: '#4a4a4a',
    weakText: '#888888',
    borderColor: '#e0e0e0',
  },
  {
    primaryColor: '#1d7484',
    textColor: '#4a4a4a',
    fontSize: '16px',
    lineHeight: 1.75,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "PingFang SC", "Microsoft YaHei", sans-serif',
    spacing: { block: '18px' },
    mutedColor: '#7a7a7a',
    cardBg: '#f1f1f1',
    cardBorderColor: '#e0e0e0',
    dividerColor: '#e0e0e0',
    canvasBg: '#fdfdfd',
    // 直角是 sakura 的签名，但 radius token 必须带单位（`0` 过不了 schema）
    radius: '0px',
  },
  {
    h1: { 'font-size': '1.65em', 'font-weight': '700', display: 'block', 'border-bottom': 'none', 'padding-bottom': '0', margin: '0 0 1em' },
    h2: { 'font-size': '1.4em', 'font-weight': '700', display: 'block', 'border-bottom': 'none', 'padding-bottom': '0', margin: '2.2em 0 1em' },
    h3: { 'font-size': '1.2em', 'font-weight': '700', 'border-left': 'none', 'padding-left': '0', margin: '2em 0 0.8em' },
    blockquote: { 'border-left': '5px solid #1d7484', 'background-color': '#f1f1f1', padding: '0.8em 1em', margin: '0 0 2em' },
    code: { color: '#444444', 'background-color': '#f1f1f1', border: 'none', 'border-radius': '0', padding: '0 0.4em' },
    pre: { 'background-color': '#f1f1f1', border: 'none', 'border-radius': '0', color: '#444444', padding: '1em' },
    a: { color: '#1d7484', 'border-bottom': '1px solid #1d7484' },
    strong: { color: '#3a3a3a', 'font-weight': '700' },
    hr: { 'border-top': '1px solid #1d7484', margin: '2.5em 0' },
    li: { margin: '0 0 0.4em' },
    img: { 'border-radius': '0' },
    th: { color: '#3a3a3a', 'font-weight': '700', 'border': 'none', 'border-bottom': '1px solid #e0e0e0', padding: '8px' },
    td: { color: '#4a4a4a', 'border': 'none', padding: '8px' },
  },
)

/** Pico.css —— 淡蓝主色、紧行高的标题阶、引用只有左线、表格只有下边框。 */
const pico = build(
  'pico',
  'Pico.css 风：淡蓝主色、标题行高紧、引用只有一道左线（无底色）、表格只有下边框。语义化 CSS 框架的默认观感，中性好用。',
  {
    primaryColor: '#0172ad',
    textColor: '#373c44',
    codeBg: '#eef1f3',
    codeColor: '#373c44',
    blockquoteBg: 'transparent',
    blockquoteColor: '#373c44',
    weakText: '#6b7280',
    borderColor: '#cfd6dd',
  },
  {
    primaryColor: '#0172ad',
    textColor: '#373c44',
    fontSize: '16px',
    lineHeight: 1.6,
    fontFamily: systemSans,
    spacing: { block: '16px' },
    mutedColor: '#6b7280',
    cardBg: '#eef1f3',
    cardBorderColor: '#cfd6dd',
    dividerColor: '#cfd6dd',
    canvasBg: '#ffffff',
    radius: '4px',
  },
  {
    h1: { color: '#1c1f23', 'font-size': '1.6em', 'font-weight': '700', 'line-height': '1.15', display: 'block', 'border-bottom': 'none', 'padding-bottom': '0', margin: '0 0 0.8em' },
    h2: { color: '#1c1f23', 'font-size': '1.4em', 'font-weight': '700', 'line-height': '1.2', display: 'block', 'border-bottom': 'none', 'padding-bottom': '0', margin: '1.8em 0 0.8em' },
    h3: { color: '#1c1f23', 'font-size': '1.2em', 'font-weight': '700', 'border-left': 'none', 'padding-left': '0', margin: '1.6em 0 0.6em' },
    p: { margin: '0 0 1em' },
    blockquote: { 'border-left': '4px solid #cfd6dd', 'background-color': 'transparent', padding: '1em 1.2em', margin: '1.5em 0' },
    code: { color: '#373c44', 'background-color': '#eef1f3', border: 'none', 'font-size': '0.875em', padding: '0.15em 0.35em' },
    pre: { 'background-color': '#eef1f3', border: 'none', color: '#373c44', padding: '1em' },
    a: { color: '#0172ad', 'border-bottom': '1px solid #0172ad' },
    strong: { color: '#1c1f23', 'font-weight': '700' },
    hr: { 'border-top': '1px solid #cfd6dd', margin: '2em 0' },
    table: { 'font-size': '0.95em' },
    th: { color: '#1c1f23', 'font-weight': '700', 'border': 'none', 'border-bottom': '1px solid #cfd6dd', padding: '0.5em 1em' },
    td: { color: '#373c44', 'border': 'none', 'border-bottom': '1px solid #cfd6dd', padding: '0.5em 1em' },
  },
)

/** LaTeX 论文 —— 衬线、首行缩进、居中一级标题、三线表、红链接。 */
const latexPaper = build(
  'latex-paper',
  'LaTeX 论文风：衬线字体、段落首行缩进、一级标题居中、表格是三线表（只有上下粗线与表头线）。适合技术报告、方法论、读书笔记。',
  {
    primaryColor: '#b30000',
    textColor: '#1a1818',
    codeBg: '#e7ecf3',
    codeColor: '#1a1818',
    blockquoteBg: 'transparent',
    blockquoteColor: '#1a1818',
    weakText: '#6b7280',
    borderColor: '#111111',
  },
  {
    primaryColor: '#b30000',
    textColor: '#1a1818',
    fontSize: '16px',
    lineHeight: 1.8,
    fontFamily: 'Georgia, "Times New Roman", "Songti SC", "SimSun", serif',
    spacing: { block: '14px' },
    mutedColor: '#6b7280',
    cardBg: '#f2f5f7',
    cardBorderColor: '#ccd3da',
    dividerColor: '#ccd3da',
    canvasBg: '#f8f9fb',
    radius: '0px',
  },
  {
    h1: { 'font-size': '1.6em', 'font-weight': '700', display: 'block', 'text-align': 'center', 'border-bottom': 'none', 'padding-bottom': '0', margin: '0 0 1em' },
    h2: { 'font-size': '1.35em', 'font-weight': '700', display: 'block', 'border-bottom': 'none', 'padding-bottom': '0', margin: '1.6em 0 0.8em' },
    h3: { 'font-size': '1.15em', 'font-weight': '700', 'font-style': 'italic', 'border-left': 'none', 'padding-left': '0', margin: '1.5em 0 0.6em' },
    p: { 'text-align': 'justify', 'text-indent': '1.4em' },
    blockquote: { 'border-left': 'none', 'background-color': 'transparent', 'font-style': 'italic', 'padding': '0 1em', margin: '1.5em 0' },
    code: { color: '#1a1818', 'background-color': '#e7ecf3', border: 'none', 'border-radius': '0', padding: '0.1em 0.3em' },
    pre: { 'background-color': '#e7ecf3', border: 'none', 'border-radius': '0', color: '#1a1818', padding: '1em' },
    a: { color: '#b30000', 'text-decoration': 'underline', 'border-bottom': 'none' },
    strong: { color: '#1a1818', 'font-weight': '700' },
    hr: { 'border-top': '1px solid #1a1818', margin: '1.6em 0' },
    table: { width: 'auto', 'border-top': '2px solid #111111', 'border-bottom': '2px solid #111111' },
    th: { color: '#1a1818', 'font-weight': '700', 'border': 'none', 'border-bottom': '1px solid #111111', padding: '0.5em' },
    td: { color: '#1a1818', 'border': 'none', padding: '0.5em' },
  },
)

/** Tufte 长文 —— 象牙纸、衬线、不加重量的标题、斜体小标题、55% 宽分隔线。 */
const tufteNotes = build(
  'tufte-notes',
  'Tufte 长文风：象牙纸底、衬线字体、标题不加粗（一级正常体、二三级斜体）、分隔线只有 55% 宽。适合随笔、书评、需要慢慢读的长文。',
  {
    primaryColor: '#111111',
    textColor: '#111111',
    codeBg: '#f0f0e8',
    codeColor: '#111111',
    blockquoteBg: 'transparent',
    blockquoteColor: '#111111',
    weakText: '#666666',
    borderColor: '#cccccc',
  },
  {
    primaryColor: '#111111',
    textColor: '#111111',
    fontSize: '16px',
    lineHeight: 1.65,
    fontFamily: 'Palatino, "Palatino Linotype", "Book Antiqua", Georgia, "Songti SC", serif',
    spacing: { block: '16px' },
    mutedColor: '#666666',
    cardBg: '#f0f0e8',
    cardBorderColor: '#cccccc',
    dividerColor: '#cccccc',
    canvasBg: '#fffff8',
    radius: '0px',
  },
  {
    h1: { 'font-size': '1.7em', 'font-weight': '400', display: 'block', 'border-bottom': 'none', 'padding-bottom': '0', margin: '0 0 0.7em' },
    h2: { 'font-size': '1.3em', 'font-weight': '400', 'font-style': 'italic', display: 'block', 'border-bottom': 'none', 'padding-bottom': '0', margin: '1.6em 0 0.7em' },
    h3: { 'font-size': '1.1em', 'font-weight': '400', 'font-style': 'italic', 'border-left': 'none', 'padding-left': '0', margin: '1.5em 0 0.6em' },
    blockquote: { 'border-left': 'none', 'background-color': 'transparent', 'font-style': 'italic', padding: '0 1em', margin: '1.5em 0' },
    code: { color: '#111111', 'background-color': '#f0f0e8', border: 'none', 'border-radius': '0', padding: '0.1em 0.3em' },
    pre: { 'background-color': '#f0f0e8', border: 'none', 'border-radius': '0', color: '#111111', padding: '1em' },
    a: { color: '#111111', 'border-bottom': '1px solid #111111' },
    strong: { color: '#111111', 'font-weight': '700' },
    hr: { width: '55%', 'border-top': '1px solid #cccccc', margin: '2em 0' },
    th: { color: '#111111', 'font-weight': '700', 'border': 'none', 'border-bottom': '1px solid #cccccc', padding: '0.4em 0.6em' },
    td: { color: '#111111', 'border': 'none', 'border-bottom': '1px solid #cccccc', padding: '0.4em 0.6em' },
  },
)

/**
 * doocs「优雅」（grace，@brzhang）—— 公众号圈子里常见的那一套：
 * 标题带底纹/圆角、三级标题虚线、引用圆角斜体、列表无项目符号。
 *
 * 主色：原主题的主色由使用者在编辑器里自选，仓库里没有默认值，这里取中性墨蓝灰。
 * 投影（`box-shadow`）与渐隐分隔线按文件头的说明去掉了。
 */
const doocsGrace = build(
  'doocs-grace',
  '优雅（doocs/md grace 移植）：二级标题浅底圆角、三级标题左线配虚线、引用圆角斜体、列表无项目符号。公众号里常见的「精致」观感；主色是中性墨色，可在编辑器里换。',
  {
    primaryColor: '#334155',
    textColor: '#333333',
    codeBg: '#f5f7fa',
    codeColor: '#334155',
    blockquoteBg: '#f7f9fb',
    blockquoteColor: 'rgba(0, 0, 0, 0.62)',
    weakText: '#888888',
    borderColor: '#e3e7ec',
    tableHeadBg: '#f5f7fa',
  },
  {
    primaryColor: '#334155',
    textColor: '#333333',
    fontSize: '16px',
    lineHeight: 1.8,
    fontFamily: systemSans,
    spacing: { block: '16px' },
    mutedColor: '#7a7a7a',
    cardBg: '#f5f7fa',
    cardBorderColor: '#e3e7ec',
    dividerColor: '#e3e7ec',
    canvasBg: '#fbfcfd',
    radius: '8px',
  },
  {
    h1: { 'font-size': '1.4em', display: 'block', 'border-bottom': '2px solid #334155', 'padding-bottom': '0.35em', margin: '0 0 0.9em' },
    h2: {
      'font-size': '1.3em',
      display: 'table',
      'border-bottom': 'none',
      'background-color': '#f5f7fa',
      'border-radius': '8px',
      padding: '0.35em 1em',
      margin: '1.8em 0 0.9em',
    },
    h3: { 'font-size': '1.2em', 'border-left': '4px solid #334155', 'border-bottom': '1px dashed #334155', 'padding-left': '12px', margin: '1.6em 0 0.6em' },
    blockquote: { 'font-style': 'italic', 'border-left': '4px solid #334155', 'border-radius': '6px', 'background-color': '#f7f9fb', color: 'rgba(0, 0, 0, 0.62)' },
    code: { 'font-family': mono, color: '#334155', 'background-color': '#f5f7fa', border: '1px solid #e3e7ec', padding: '0.1em 0.35em' },
    pre: { 'font-family': mono, 'background-color': '#f5f7fa', border: '1px solid #e3e7ec', color: '#334155', padding: '1em' },
    a: { color: '#334155', 'border-bottom': '1px solid #334155' },
    strong: { color: '#222222', 'font-weight': '700' },
    hr: { 'border-top': '1px solid #e3e7ec', margin: '2em 0' },
    ul: { 'list-style': 'none', 'padding-left': '1.5em' },
    ol: { 'padding-left': '1.5em' },
    li: { margin: '0 0 0.5em' },
    img: { 'border-radius': '8px' },
    figcaption: { color: '#888888' },
    table: { 'border-radius': '8px', 'font-size': '0.95em' },
    th: { 'background-color': '#f5f7fa', color: '#333333', 'font-weight': '600', border: '1px solid #e3e7ec', padding: '0.5em 1em' },
    td: { color: '#333333', border: '1px solid #e3e7ec', padding: '0.5em 1em' },
  },
)

export const COMMUNITY_THEMES: Theme[] = [
  githubMarkdown,
  githubMarkdownDark,
  tailwindProse,
  waterCss,
  newCss,
  sakura,
  pico,
  latexPaper,
  tufteNotes,
  doocsGrace,
]
