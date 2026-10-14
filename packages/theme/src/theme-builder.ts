/**
 * 主题构造器：默认 block + `build()`。
 *
 * 为什么单独一个模块：默认 block 是**所有主题的基线**（预置主题、agent 直出主题、
 * 品牌档案里没写的 block 都继承它），而主题分了三批写（`presets.ts` 原创 6 套、
 * `community-presets.ts` 社区 10 套、`wemd-presets.ts` 移植 20 套）。
 * 三批都要能拿到同一份基线，所以构造器不能住在其中任何一批里。
 *
 * 默认值的取法与代价见 `docs/design/theme-system.md` §32。
 */

import type { Theme, ThemeBlock } from './schema.js'

/** 主题调色板：默认 block 里那些**不该由单个主题重复写**的中性色。 */
export interface Palette {
  primaryColor: string
  textColor: string
  backgroundColor?: string
  codeBg: string
  codeColor: string
  blockquoteBg: string
  blockquoteColor: string
  weakText: string
  borderColor: string
  /**
   * 表头底色。**不填 = 表头不填底色**（靠边框区分行），这是刻意的：
   * GitHub / Tailwind 这类样式表头本来就没有底色，给它们塞一个灰底就变味了。
   */
  tableHeadBg?: string
}

export const safeFont =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'

/**
 * 生成一组默认 block，可传入覆盖项做定制。
 *
 * ── 这套默认值为什么长这样 ─────────────────────────────────────────
 * 它是「默认的 Markdown 样式」：预置主题、agent 直出的主题、品牌档案里没写的
 * block 全部继承它。所以它必须成立，而不只是能看。
 *
 * 旧版的三个毛病（都是「模板感」的来源，不是审美偏好问题）：
 *
 * 1. **三级标题全用强调色、字重一样** —— 一屏里到处是同一种颜色，层级只能靠字号，
 *    结果既分不出主次、又把强调色用尽（链接/加粗再想强调就没有手段了）。
 *    改：标题用正文墨色，层级交给字号 + 字重 + 空气；强调色只留给链接、行内代码、组件。
 * 2. **每个元素的下边距都是同一个 `spacing.block`** —— 标题和段落一样挤，一页读下来没有呼吸。
 *    改：标题的上边距用 em（随字号缩放），h2 给到 1.9em；段落间距仍归 token。
 * 3. **引用块是「圆角灰药丸」、行内代码是「灰块」** —— 这两样加在一起就是文档模板的脸。
 *    改：引用块去掉圆角（左线 3px + 浅底）；行内代码浅底 + 1px 描边。
 *
 * 代价：h2 用 `display: table` 让下划线**贴字**，所以自带下划线的主题要显式写
 * `border-bottom: none` 才能换成别的装饰；居中的主题还要给 `margin: auto`
 * （`text-align: center` 只对齐盒子里的字，盒子本身仍是收缩宽度）。
 */
export function defaultBlocks(p: Palette, overrides?: Partial<Record<string, ThemeBlock>>): Theme['blocks'] {
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
    table: {
      width: '100%',
      'border-collapse': 'collapse',
      'font-size': '0.94em',
      'line-height': '1.6',
      margin: `0 0 {{spacing.block}}`,
    },
    th: {
      // 不填 tableHeadBg 就不输出底色：表头靠边框与字重和表体区分
      ...(p.tableHeadBg ? { 'background-color': p.tableHeadBg } : {}),
      color: '{{textColor}}',
      'font-weight': '600',
      'text-align': 'left',
      padding: '0.45em 0.6em',
      border: `1px solid ${p.borderColor}`,
    },
    td: {
      color: '{{textColor}}',
      'vertical-align': 'top',
      padding: '0.45em 0.6em',
      border: `1px solid ${p.borderColor}`,
    },
  }
  return mergeBlocks(base, overrides)
}

export function mergeBlocks(
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

/** 用一组调色板 + token 组装一个主题（6 套原创、10 套社区、任何新主题都走它）。 */
export function build(
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

/** 中性调色板（用于补全 agent 直出的部分 block 集，不引入额外色彩倾向）。 */
export const NEUTRAL_PALETTE: Palette = {
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
 * 把 agent 直出的部分 block 集补全为完整 block 集（缺省用中性样式）。
 * brand_save / 任何「agent 只写关键 block」的场景都应用它，降低产出门槛。
 */
export function completeThemeBlocks(overrides?: Partial<Record<string, ThemeBlock>>): Theme['blocks'] {
  return defaultBlocks(NEUTRAL_PALETTE, overrides)
}
