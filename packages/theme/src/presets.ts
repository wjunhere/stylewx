/**
 * 预置主题。
 * 每个主题通过 tokens 定义配色/字体/间距，blocks 尽量使用 `{{token}}` 引用以保持一致性。
 * description 面向「选主题的 Agent」，务必写清楚风格与适用场景。
 */

import type { Theme, ThemeBlock } from './schema.js'
import { WEMD_THEMES } from './wemd-presets.js'

interface Palette {
  primaryColor: string
  textColor: string
  backgroundColor?: string
  codeBg: string
  codeColor: string
  blockquoteBg: string
  blockquoteColor: string
  weakText: string
  borderColor: string
}

/**
 * 生成一组默认 block，可传入覆盖项做定制。
 *
 * ── 这套默认值为什么长这样 ─────────────────────────────────────────
 * 它是「默认的 Markdown 样式」：6 套原创主题、agent 直出的主题、品牌档案里没写的
 * block 全部继承它。所以它必须成立，而不只是能看。
 *
 * 旧版的三个毛病（都是「模板感」的来源，不是审美偏好问题）：
 *
 * 1. **三级标题全用强调色、字重一样** —— 一屏里到处是同一种颜色，层级只能靠字号，
 *    结果既分不出主次、又把强调色用尽（链接/加粗再想强调就没有手段了）。
 *    改：标题用正文墨色，层级交给字号 + 字重 + 空气；强调色只留给链接、行内代码、组件。
 *    依据：Tailwind Typography 的 prose 默认值就是这么分层的（h1 800 / h2 700 / h3 600，
 *    颜色基本不参与）；mdnice 的「默认最佳实践」也是黑字标题。
 * 2. **每个元素的下边距都是同一个 `spacing.block`** —— 标题和段落一样挤，一页读下来没有呼吸。
 *    改：标题的上边距用 em（随字号缩放）而不是 token，h2 给到 1.9em；段落间距仍归 token。
 * 3. **引用块是「圆角灰药丸」、行内代码是「灰块」** —— 这两样加在一起就是文档模板的脸。
 *    改：引用块去掉圆角，左线 3px + 浅底（mdnice：`border-left: 3px solid rgba(0,0,0,.4)`
 *    + 5% 底，无圆角）；行内代码用浅底 + 1px 描边（doocs/md：`color: primary` +
 *    `background: primary 8%` + `border: 1px solid primary 20%`，我们只能用字面色值）。
 *
 * 另外两处中文排版的调整：正文字距 0.04em（doocs 用 0.1em、mdnice 用 0，取中间：
 * 看得出节奏感但不吃栏宽）；**加粗不再染色**（染色加粗是「满屏主色」的另一半来源）。
 *
 * 代价：h2 用 `display: table` 让下划线**贴字**（doocs 的 H1 就是这么做的），
 * 所以自带下划线的主题要显式写 `border-bottom: none` 才能换成别的装饰 ——
 * 这是「一个装饰各写一次」换来的，比三级标题全同款划算。
 */
function defaultBlocks(p: Palette, overrides?: Partial<Record<string, ThemeBlock>>): Theme['blocks'] {
  const base: Theme['blocks'] = {
    h1: {
      color: '{{textColor}}',
      'font-size': '1.5em',
      'font-weight': '700',
      'line-height': '1.32',
      'letter-spacing': '0.01em',
      'margin': '0 0 0.85em',
    },
    h2: {
      color: '{{textColor}}',
      'font-size': '1.25em',
      'font-weight': '700',
      'line-height': '1.35',
      'letter-spacing': '0.01em',
      // display:table 让盒子缩到文字宽，下划线才会「只贴在字下面」而不是整行一条
      display: 'table',
      'border-bottom': `2px solid {{primaryColor}}`,
      'padding-bottom': '0.3em',
      'margin': '1.9em 0 0.95em',
    },
    h3: {
      color: '{{textColor}}',
      'font-size': '1.1em',
      'font-weight': '600',
      'line-height': '1.4',
      'border-left': `3px solid {{primaryColor}}`,
      'padding-left': '0.5em',
      'margin': '1.5em 0 0.6em',
    },
    p: {
      color: '{{textColor}}',
      'font-size': '{{fontSize}}',
      'line-height': '{{lineHeight}}',
      'letter-spacing': '0.04em',
      'margin': `0 0 {{spacing.block}}`,
    },
    blockquote: {
      'border-left': `3px solid {{primaryColor}}`,
      'background-color': p.blockquoteBg,
      color: p.blockquoteColor,
      padding: '0.85em 1.1em',
      margin: `0 0 {{spacing.block}}`,
    },
    ul: {
      'padding-left': '1.35em',
      margin: `0 0 {{spacing.block}}`,
      'list-style': 'disc',
    },
    ol: {
      'padding-left': '1.45em',
      margin: `0 0 {{spacing.block}}`,
    },
    li: {
      'line-height': '{{lineHeight}}',
      margin: '0 0 0.35em',
    },
    code: {
      'font-family': 'Menlo, Consolas, "Courier New", monospace',
      'font-size': '0.88em',
      'background-color': p.codeBg,
      color: p.codeColor,
      border: `1px solid ${p.borderColor}`,
      padding: '1px 5px',
      'border-radius': '4px',
    },
    pre: {
      'background-color': p.codeBg,
      border: `1px solid ${p.borderColor}`,
      padding: '14px 16px',
      'border-radius': '8px',
      'overflow-x': 'auto',
      'font-size': '0.86em',
      'line-height': '1.65',
      'font-family': 'Menlo, Consolas, "Courier New", monospace',
      color: p.codeColor,
      margin: `0 0 {{spacing.block}}`,
    },
    img: {
      'max-width': '100%',
      height: 'auto',
      display: 'block',
      'border-radius': '6px',
      margin: `0 auto {{spacing.block}}`,
    },
    figcaption: {
      'font-size': '0.82em',
      color: p.weakText,
      'text-align': 'center',
      'letter-spacing': '0.02em',
      'margin-top': '0.5em',
    },
    hr: {
      border: 'none',
      'border-top': `1px solid ${p.borderColor}`,
      margin: '2.2em 0',
    },
    a: {
      color: '{{primaryColor}}',
      'text-decoration': 'none',
      'border-bottom': `1px solid {{primaryColor}}`,
    },
    strong: {
      // 不染色：加粗靠字重，强调色留给链接与行内代码（否则整屏都是主色）
      color: '{{textColor}}',
      'font-weight': '700',
    },
  }
  return mergeBlocks(base, overrides)
}

function mergeBlocks(
  base: Theme['blocks'],
  overrides?: Partial<Record<string, ThemeBlock>>,
): Theme['blocks'] {
  const result: Theme['blocks'] = { ...base }
  if (!overrides) return result
  for (const [key, value] of Object.entries(overrides)) {
    if (!value) continue
    const k = key as keyof Theme['blocks']
    result[k] = { ...(result[k] ?? {}), ...value }
  }
  return result
}

function build(
  name: string,
  description: string,
  p: Palette,
  tokens: Theme['tokens'],
  blockOverrides?: Partial<Record<string, ThemeBlock>>,
): Theme {
  return {
    name,
    description,
    tokens,
    blocks: defaultBlocks(p, blockOverrides),
  }
}

const safeFont =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'

/** 科技极简 —— 冷冽的蓝/青主色，留白多，适合技术、效率、产品类文章。 */
const techMinimal = build(
  'tech-minimal',
  '科技极简：以冷峻的青蓝色为主，大量留白、细线条与克制的高对比，强调「清晰易读」。适合技术博客、效率工具、SaaS 产品介绍、测试与工程类文章。',
  {
    primaryColor: '#0b6bff',
    textColor: '#1f2329',
    codeBg: '#f0f4ff',
    codeColor: '#3b5b9a',
    blockquoteBg: '#f5f9ff',
    blockquoteColor: '#3a4a5a',
    weakText: '#8a94a6',
    borderColor: '#e2e8f0',
  },
  {
    primaryColor: '#0b6bff',
    textColor: '#1f2329',
    fontSize: '15px',
    lineHeight: 1.75,
    fontFamily: safeFont,
    spacing: { block: '16px' },
  },
  // 故意不给标题加自己的竖线：默认那套已经有 h2 贴字下划线 + h3 左竖线，
  // 这里再给 h1/h2 各加一条蓝竖线，就是「三层同款装饰」（一屏里到处是同一根蓝条）。
  // 这个主题的身份由调色板承担：冷蓝强调 + 大量留白。
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
  },
  {
    primaryColor: '#1f3864',
    textColor: '#2b2b2b',
    fontSize: '15px',
    lineHeight: 1.8,
    fontFamily: safeFont,
    spacing: { block: '16px' },
  },
  {
    h1: { 'background-color': '#1f3864', color: '#ffffff', padding: '10px 14px', 'border-radius': '4px' },
    h2: { 'border-bottom': '2px solid #1f3864', 'padding-bottom': '8px' },
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
  },
  {
    primaryColor: '#b4546a',
    textColor: '#3a3232',
    fontSize: '16px',
    lineHeight: 2,
    fontFamily: 'Georgia, "STZhongsong", "Songti SC", "SimSun", serif',
    spacing: { block: '18px' },
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
  },
  {
    primaryColor: '#c8142c',
    textColor: '#2e2e2e',
    fontSize: '16px',
    lineHeight: 1.9,
    fontFamily: safeFont,
    spacing: { block: '16px' },
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
  },
  {
    primaryColor: '#005a8c',
    textColor: '#1c1c1c',
    fontSize: '14px',
    lineHeight: 1.85,
    fontFamily: 'Georgia, "Times New Roman", "Songti SC", serif',
    spacing: { block: '14px' },
  },
  {
    h1: { 'font-weight': '700', 'border-bottom': '2px solid #005a8c', 'padding-bottom': '8px' },
    h2: { 'font-weight': '700', 'border-bottom': '1px solid #cccccc', 'padding-bottom': '6px' },
    p: { 'text-align': 'justify' },
    blockquote: { 'font-style': 'italic' },
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
  },
  {
    primaryColor: '#3ee0a4',
    textColor: '#e7e7e7',
    fontSize: '15px',
    lineHeight: 1.7,
    fontFamily: safeFont,
    spacing: { block: '16px' },
  },
  {
    h1: { color: '#3ee0a4', 'border-bottom': '1px solid #2a2a30', 'padding-bottom': '8px' },
    h2: { color: '#7cd1ff', 'border-bottom': '1px solid #2a2a30', 'padding-bottom': '6px' },
    p: { color: '#e7e7e7' },
    blockquote: { color: '#b7b7c0', 'border-left': '4px solid #3ee0a4' },
    code: { color: '#f4b25b', 'background-color': '#2d2d33' },
    pre: { color: '#c9d1d9', 'background-color': '#1e1e1e' },
    a: { color: '#7cd1ff' },
    strong: { color: '#3ee0a4' },
    hr: { 'border-top': '1px solid #3a3a40' },
    img: { 'border-radius': '6px' },
  },
)

/** 中性调色板（用于补全 agent 直出的部分 block 集，不引入额外色彩倾向）。 */
const NEUTRAL_PALETTE: Palette = {
  primaryColor: '#333333',
  textColor: '#444444',
  codeBg: '#f5f5f5',
  codeColor: '#333333',
  blockquoteBg: '#f7f7f7',
  blockquoteColor: '#555555',
  weakText: '#999999',
  borderColor: '#dddddd',
}

/**
 * 把 agent 直出的部分 block 集补全为完整 15 block 集（缺省用中性样式）。
 * brand_save / 任何「agent 只写关键 block」的场景都应用它，降低产出门槛。
 */
export function completeThemeBlocks(overrides?: Partial<Record<string, ThemeBlock>>): Theme['blocks'] {
  return defaultBlocks(NEUTRAL_PALETTE, overrides)
}

export const PRESET_THEMES: Theme[] = [
  techMinimal,
  business,
  magazine,
  govRed,
  academic,
  darkCode,
  ...WEMD_THEMES,
]

/** 按名字查找预置主题。 */
export function getPresetTheme(name: string): Theme | undefined {
  return PRESET_THEMES.find((t) => t.name === name)
}
