/**
 * 预置主题（原创 6 套）。
 *
 * 默认 block 与调色板类型在 `theme-builder.ts`（三批主题共用同一份基线）；
 * 社区风格的 10 套在 `community-presets.ts`，WeMD 移植的 20 套在 `wemd-presets.ts`。
 * 每个主题通过 tokens 定义配色/字体/间距，blocks 尽量使用 `{{token}}` 引用以保持一致性。
 * description 面向「选主题的 Agent」，务必写清楚风格与适用场景。
 */

import type { Theme } from './schema.js'
import { build, safeFont } from './theme-builder.js'
import { COMMUNITY_THEMES } from './community-presets.js'
import { WEMD_THEMES } from './wemd-presets.js'

/**
 * 科技极简 —— 石板灰墨 + 工程绿，代码块深色底，适合技术、效率、产品类文章。
 *
 * 这次改版换掉了原来的 `#0b6bff`：那个蓝正是 SKILL 里「被用烂清单」点名的那一支
 * （默认科技蓝 #0066FF 系），一个仓库不应该一边教 agent 别用、一边把它当默认主题。
 * 新配色取自 ui-ux-pro-max 给「developer tool 文档站」的推荐（Slate 墨 + Emerald 强调），
 * 但把强调色的明度压到 700 档：推荐里的 `#22C55E` 在白底上对比度只有约 2.2:1，当文字色不合格；
 * `#047857` 在白底上约 5.3:1。
 *
 * 两个刻意的选择：
 * - **代码块用深色底**（`pre` 石板 800 + 亮灰字）：这是「工程感」最省成本的一处签名，
 *   和正文的浅底形成对比；行内代码仍留在浅底上（`pre code` 会继承 pre 的颜色，见 compiler.ts）。
 * - **标题不再各加一条绿竖线**：默认那套已经有 h2 贴字下划线 + h3 左竖线，
 *   主题的身份由调色板承担，不靠重复装饰。
 */
const techMinimal = build(
  'tech-minimal',
  '科技极简：石板灰墨 + 工程绿强调，代码块走深色底。留白多、线条细、克制，适合技术博客、效率工具、SaaS 产品介绍、工程与测试类文章。',
  {
    primaryColor: '#047857',
    textColor: '#1e293b',
    codeBg: '#f1f5f9',
    codeColor: '#047857',
    blockquoteBg: '#f8fafc',
    blockquoteColor: '#334155',
    weakText: '#64748b',
    borderColor: '#e2e8f0',
    tableHeadBg: '#f1f5f9',
  },
  {
    primaryColor: '#047857',
    textColor: '#1e293b',
    fontSize: '15px',
    lineHeight: 1.75,
    // Plex 优先：装了它的机器会拿到开发者味的拉丁字形，没装就落到系统栈（中文仍是苹方/雅黑）
    fontFamily: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
    spacing: { block: '16px' },
    mutedColor: '#64748b',
    cardBg: '#f1f5f9',
    cardBorderColor: '#e2e8f0',
    dividerColor: '#e2e8f0',
    canvasBg: '#f8fafc',
    radius: '8px',
  },
  {
    pre: {
      'background-color': '#1e293b',
      border: '1px solid #1e293b',
      color: '#e2e8f0',
      'border-radius': '10px',
    },
  },
)

/** 商务 —— 稳重藏蓝 + 金色点缀，适合企业、财经、公司动态。 */
const business = build(
  'business',
  '商务稳重：以藏蓝为主色、金色作点缀，字重稍高、行距适中，传达专业与信任感。适合企业宣传、行业报告、财经分析、公司动态类内容。',
  {
    primaryColor: '#1f3864',
    textColor: '#2b2b2b',
    codeBg: '#f2f4f8',
    codeColor: '#3f4a63',
    blockquoteBg: '#f4f6fa',
    blockquoteColor: '#59627a',
    weakText: '#8a8f99',
    borderColor: '#d9dee8',
    tableHeadBg: '#f2f4f8',
  },
  {
    primaryColor: '#1f3864',
    textColor: '#2b2b2b',
    fontSize: '15px',
    lineHeight: 1.8,
    fontFamily: safeFont,
    spacing: { block: '16px' },
    accentColor: '#b8860b',
    mutedColor: '#59627a',
    cardBg: '#f4f6fa',
    cardBorderColor: '#d9dee8',
    dividerColor: '#d9dee8',
    radius: '6px',
  },
  {
    h1: { 'background-color': '#1f3864', color: '#ffffff', padding: '10px 14px', 'border-radius': '4px' },
    h2: { 'border-bottom': '2px solid #1f3864', 'padding-bottom': '8px', display: 'table' },
  },
)

/** 文艺杂志 —— 衬线感字体、暖棕/玫红，适合文学、生活、人文。 */
const magazine = build(
  'magazine',
  '文艺杂志：暖棕与玫红调、衬线字体、宽松行距，如同杂志内页。适合文学、散文、生活感悟、文化评论、旅行笔记类内容。',
  {
    primaryColor: '#b4546a',
    textColor: '#3a3232',
    codeBg: '#f6f0ee',
    codeColor: '#7a5a5f',
    blockquoteBg: '#faf3f1',
    blockquoteColor: '#7d6a6a',
    weakText: '#a89a9a',
    borderColor: '#e8dbd7',
    tableHeadBg: '#faf3f1',
  },
  {
    primaryColor: '#b4546a',
    textColor: '#3a3232',
    fontSize: '16px',
    lineHeight: 2,
    fontFamily: 'Georgia, "STZhongsong", "Songti SC", "SimSun", serif',
    spacing: { block: '18px' },
    mutedColor: '#7d6a6a',
    cardBg: '#faf3f1',
    cardBorderColor: '#e8dbd7',
    dividerColor: '#e8dbd7',
    radius: '4px',
  },
  {
    h1: { 'text-align': 'center', 'letter-spacing': '2px' },
    // h2 是 display:table（下划线贴字），居中得靠 margin auto —— text-align 只对齐盒子里的字
    h2: { 'text-align': 'center', 'font-style': 'normal', 'margin': '1.9em auto 0.95em' },
    p: { 'text-align': 'justify', 'text-indent': '2em' },
    blockquote: { 'font-style': 'italic' },
  },
)

/** 政务红 —— 正式、庄重的中国红，适合政务、党建、官方通知。 */
const govRed = build(
  'gov-red',
  '政务庄重：以中国红为主色，字重较重、结构清晰，传递正式与权威感。适合政务发布、党建文章、官方通知、政策解读。',
  {
    primaryColor: '#c8142c',
    textColor: '#2e2e2e',
    codeBg: '#f7f0f0',
    codeColor: '#8a3a3a',
    blockquoteBg: '#fdf2f3',
    blockquoteColor: '#8a4a4a',
    weakText: '#9a8a8a',
    borderColor: '#e7d2d4',
    tableHeadBg: '#fdf2f3',
  },
  {
    primaryColor: '#c8142c',
    textColor: '#2e2e2e',
    fontSize: '16px',
    lineHeight: 1.9,
    fontFamily: safeFont,
    spacing: { block: '16px' },
    mutedColor: '#8a4a4a',
    cardBg: '#fdf2f3',
    cardBorderColor: '#e7d2d4',
    dividerColor: '#e7d2d4',
    radius: '4px',
  },
  {
    h1: { 'text-align': 'center', 'font-weight': '700' },
    h2: { 'border-left': '5px solid #c8142c', 'padding-left': '12px', 'border-bottom': 'none' },
    p: { 'text-indent': '2em' },
  },
)

/** 学术 —— 中性、克制、多注释的论文风。 */
const academic = build(
  'academic',
  '学术严谨：中性灰黑、极小装饰、高可读性，适合论文导读、研究报告、技术文档、方法论类内容。',
  {
    primaryColor: '#005a8c',
    textColor: '#1c1c1c',
    codeBg: '#f4f4f4',
    codeColor: '#333333',
    blockquoteBg: '#f2f5f7',
    blockquoteColor: '#4a5a63',
    weakText: '#888888',
    borderColor: '#d8d8d8',
    // 论文表格本来就不填底色（靠三线/全框区分），这里刻意留空
  },
  {
    primaryColor: '#005a8c',
    textColor: '#1c1c1c',
    fontSize: '14px',
    lineHeight: 1.85,
    fontFamily: 'Georgia, "Times New Roman", "Songti SC", serif',
    spacing: { block: '14px' },
    mutedColor: '#4a5a63',
    cardBg: '#f2f5f7',
    cardBorderColor: '#d8d8d8',
    dividerColor: '#d8d8d8',
    radius: '2px',
  },
  {
    h1: { 'font-weight': '700', 'border-bottom': '2px solid #005a8c', 'padding-bottom': '8px', display: 'block' },
    h2: {
      'font-weight': '700',
      'border-bottom': '1px solid #cccccc',
      'padding-bottom': '6px',
      'margin': '1.7em 0 0.8em',
    },
    h3: { 'border-left': 'none', 'padding-left': '0', 'font-weight': '700' },
    p: { 'text-align': 'justify' },
    blockquote: { 'font-style': 'italic' },
    hr: { 'border-top': '1px solid #1c1c1c', margin: '1.6em 0' },
  },
)

/** 深色代码风 —— 深色底 + 高亮语法色，适合代码示例、极客向内容。 */
const darkCode = build(
  'dark-code',
  '深色代码风：深色底、荧光高亮、等宽字体，沉浸感强，适合技术教程、代码赏析、极客与开发者向内容。注意：微信内不支持动态高亮，颜色为静态内联。',
  {
    primaryColor: '#3ee0a4',
    textColor: '#e7e7e7',
    codeBg: '#1e1e1e',
    codeColor: '#c9d1d9',
    blockquoteBg: '#26262a',
    blockquoteColor: '#b7b7c0',
    weakText: '#9a9aa3',
    borderColor: '#3a3a40',
    tableHeadBg: '#26262a',
  },
  {
    primaryColor: '#3ee0a4',
    textColor: '#e7e7e7',
    fontSize: '15px',
    lineHeight: 1.7,
    fontFamily: safeFont,
    spacing: { block: '16px' },
    accentColor: '#7cd1ff',
    mutedColor: '#9a9aa3',
    cardBg: '#26262a',
    cardBorderColor: '#3a3a40',
    dividerColor: '#3a3a40',
    canvasBg: '#16161a',
    // 深色整页主题必须自带页底：暗色文字落在白底上等于不可读，
    // 而 canvasBg 只有正文用 ::::canvas 包住时才生效（SKILL 里的那条硬约束）。
    pageBackgroundColor: '#16161a',
    radius: '8px',
  },
  {
    h1: { color: '#e7e7e7', 'border-bottom': '1px solid #2a2a30', 'padding-bottom': '8px', display: 'block' },
    h2: { color: '#e7e7e7', 'border-bottom': '1px solid #2a2a30', 'padding-bottom': '6px' },
    h3: { 'border-left': '3px solid #3ee0a4' },
    p: { color: '#e7e7e7' },
    blockquote: { color: '#b7b7c0', 'border-left': '4px solid #3ee0a4' },
    code: { color: '#7cd1ff', 'background-color': '#2d2d33', border: '1px solid #3a3a40' },
    pre: { color: '#c9d1d9', 'background-color': '#1e1e1e' },
    a: { color: '#7cd1ff', 'border-bottom': '1px solid #7cd1ff' },
    strong: { color: '#3ee0a4' },
    hr: { 'border-top': '1px solid #3a3a40' },
    table: { 'font-size': '0.92em' },
    th: { 'background-color': '#26262a', color: '#e7e7e7', border: '1px solid #3a3a40' },
    td: { color: '#e7e7e7', border: '1px solid #3a3a40' },
  },
)

export const PRESET_THEMES: Theme[] = [
  techMinimal,
  business,
  magazine,
  govRed,
  academic,
  darkCode,
  ...COMMUNITY_THEMES,
  ...WEMD_THEMES,
]

/** 按名字查找预置主题。 */
export function getPresetTheme(name: string): Theme | undefined {
  return PRESET_THEMES.find((t) => t.name === name)
}
