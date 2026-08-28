/**
 * 预置主题。
 * 每个主题通过 tokens 定义配色/字体/间距，blocks 尽量使用 `{{token}}` 引用以保持一致性。
 * description 面向「选主题的 Agent」，务必写清楚风格与适用场景。
 */

import type { Theme, ThemeBlock } from './schema.js'

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

/** 生成一组默认 block，可传入覆盖项做定制。 */
function defaultBlocks(p: Palette, overrides?: Partial<Record<string, ThemeBlock>>): Theme['blocks'] {
  const base: Theme['blocks'] = {
    h1: {
      color: '{{primaryColor}}',
      'font-size': '1.6em',
      'font-weight': '600',
      'line-height': '1.35',
      'margin': `0 0 {{spacing.block}}`,
    },
    h2: {
      color: '{{primaryColor}}',
      'font-size': '1.35em',
      'font-weight': '600',
      'line-height': '1.4',
      'margin': `0 0 {{spacing.block}}`,
    },
    h3: {
      color: '{{primaryColor}}',
      'font-size': '1.15em',
      'font-weight': '600',
      'line-height': '1.4',
      'margin': `0 0 {{spacing.block}}`,
    },
    p: {
      color: '{{textColor}}',
      'font-size': '{{fontSize}}',
      'line-height': '{{lineHeight}}',
      'margin': `0 0 {{spacing.block}}`,
    },
    blockquote: {
      'border-left': `4px solid {{primaryColor}}`,
      'background-color': p.blockquoteBg,
      color: p.blockquoteColor,
      padding: '12px 16px',
      margin: `0 0 {{spacing.block}}`,
      'border-radius': '4px',
    },
    ul: {
      'padding-left': '1.4em',
      margin: `0 0 {{spacing.block}}`,
      'list-style': 'disc',
    },
    ol: {
      'padding-left': '1.4em',
      margin: `0 0 {{spacing.block}}`,
    },
    li: {
      'line-height': '{{lineHeight}}',
      margin: '0 0 6px',
    },
    code: {
      'font-family': 'Menlo, Consolas, "Courier New", monospace',
      'font-size': '0.9em',
      'background-color': p.codeBg,
      color: p.codeColor,
      padding: '2px 5px',
      'border-radius': '4px',
    },
    pre: {
      'background-color': p.codeBg,
      padding: '16px',
      'border-radius': '6px',
      'overflow-x': 'auto',
      'font-size': '0.88em',
      'line-height': '1.6',
      'font-family': 'Menlo, Consolas, "Courier New", monospace',
      color: p.codeColor,
      margin: `0 0 {{spacing.block}}`,
    },
    img: {
      'max-width': '100%',
      height: 'auto',
      display: 'block',
      'border-radius': '4px',
      margin: `0 auto {{spacing.block}}`,
    },
    figcaption: {
      'font-size': '0.85em',
      color: p.weakText,
      'text-align': 'center',
      'margin-top': '8px',
    },
    hr: {
      border: 'none',
      'border-top': `1px solid ${p.borderColor}`,
      margin: '24px 0',
    },
    a: {
      color: '{{primaryColor}}',
      'text-decoration': 'none',
      'border-bottom': `1px solid {{primaryColor}}`,
    },
    strong: {
      color: '{{primaryColor}}',
      'font-weight': '600',
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
  {
    h1: { 'border-left': '5px solid #0b6bff', 'padding-left': '12px' },
    h2: { 'border-left': '3px solid #0b6bff', 'padding-left': '10px' },
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
    h2: { 'text-align': 'center', 'font-style': 'normal' },
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
    h2: { 'border-left': '5px solid #c8142c', 'padding-left': '12px' },
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

export const PRESET_THEMES: Theme[] = [
  techMinimal,
  business,
  magazine,
  govRed,
  academic,
  darkCode,
]

/** 按名字查找预置主题。 */
export function getPresetTheme(name: string): Theme | undefined {
  return PRESET_THEMES.find((t) => t.name === name)
}
