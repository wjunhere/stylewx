/**
 * theme → CSS 编译器。
 * 把主题对象编译成一段仅含「微信兼容属性、无 class 依赖」的 CSS 字符串，
 * 供 core 的 juice 内联管线使用。纯函数、无 DOM / Node 依赖。
 */

import { BLOCK_NAMES, EXTRA_BLOCK_NAMES, STYLEABLE_ELEMENTS } from './schema.js'
import type { Theme } from './schema.js'
import { resolveTokenReferences } from './tokens.js'
import type { ThemeTokens } from './schema.js'

/** 把 token 值转为 CSS 片段（lineHeight 是数字，需追加单位；其余直接输出）。 */
function cssValueForToken(path: string, tokens: ThemeTokens): string {
  if (path === 'spacing.block' && tokens.spacing.block) return tokens.spacing.block
  const value = tokens[path as keyof ThemeTokens]
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  return ''
}

/**
 * 解析 block 声明值中的 token 引用。
 * 与 resolveTokenReferences 不同的是：此处内置了 lineHeight 数字→无单位、block 间距等特例，
 * 保证编译出的 CSS 值总是合法字符串。
 */
export function resolveDeclValue(value: string, tokens: ThemeTokens): string {
  return value.replace(
    /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g,
    (_full, path: string) => cssValueForToken(path, tokens),
  )
}

function buildBlockRules(theme: Theme): string[] {
  const rules: string[] = []
  for (const blockName of STYLEABLE_ELEMENTS) {
    const declarations = theme.blocks[blockName]
    if (!declarations) continue
    const entries = Object.entries(declarations)
    if (entries.length === 0) continue
    const css = entries
      .map(([prop, value]) => {
        // 字体名去引号：带引号的字体名会被微信当成 HTML 属性，整条 style 报废。
        const resolved = resolveDeclValue(value, theme.tokens)
        const finalValue = prop.toLowerCase() === 'font-family' ? unquoteFontFamily(resolved) : resolved
        return `${prop}: ${finalValue};`
      })
      .join(' ')
    rules.push(`${blockName} { ${css} }`)
  }
  rules.push(`pre code { ${PRE_CODE_RESET} }`)
  return rules
}

/**
 * `pre > code` 的重置：代码块里的 <code> 不能再套一层行内代码的盒子。
 *
 * 行内代码的样式是经 `code {}` 这条规则生效的，而代码块是 `<pre><code>` ——
 * 于是代码块里嵌着第二个盒子（自己的浅底 + 描边 + 内边距 + 圆角），
 * 字号还会叠两次（pre 的 0.86em × code 的 0.88em ≈ 0.76em）。
 * 表现就是「代码块里又套了一个小框，字还特别小」。
 *
 * 只重置盒模型、字号与颜色，**不动 font-family** —— 字体栈是主题的表达手段。
 * `color: inherit` 是必须的：`pre` 才是代码块文字颜色的主人。
 * 不重置它的话，行内代码的颜色会盖到代码块上 ——
 * 于是「深色代码块 + 亮色行内代码」这种（很常见的）配色根本写不出来（实测：
 * 深底上压一行 #047857 的字，基本看不清）。
 */
const PRE_CODE_RESET = [
  'background-color: transparent',
  'border: none',
  'padding: 0',
  'border-radius: 0',
  'font-size: inherit',
  'color: inherit',
].join('; ')

/**
 * 编译主题为 CSS 字符串。
 * @param theme 已通过 themeSchema 校验的主题
 * @returns 可直接交给 juice 的 CSS（不含 <style> 包裹）
 */
export function compileThemeToCss(theme: Theme): string {
  const blockRules = buildBlockRules(theme)
  return blockRules.join('\n')
}

export interface RootBaseStyleOptions {
  /**
   * 文档里是否用了 `:::canvas`。
   *
   * 页边距只能有一个归属：有画布时由画布负责（并接手主题的 pagePadding），
   * 根节点不再输出 padding，否则两者会叠加、正文被挤得太窄。
   */
  hasCanvas?: boolean
}

/**
 * 生成「根容器」的基础内联样式，作为后代元素的继承默认值。
 * 这些值直接内联到渲染的根节点上（不依赖 class / <style>）。
 */
/**
 * 字体名去引号。
 *
 * 微信的 style 解析器处理不了 font-family 里的引号：实测 draft/add → draft/get 时，
 * 带引号的字体名会被当成 HTML 属性，整个 style 被清成 `style=""`，
 * 并且把同一 style 里后续的 color / font-size / line-height / letter-spacing 一起污染掉
 * （只剩 `songti="songti" sc="sc"` 这种垃圾属性）。
 * 去掉引号后 `Georgia, Songti SC, SimSun, serif` 仍是合法 CSS（标识符序列），
 * 实测所有声明都能完整存活。
 */
export function unquoteFontFamily(fontFamily: string): string {
  return fontFamily
    .split(',')
    .map((name) => name.trim().replace(/^["']|[\"']$/g, '').trim())
    .filter(Boolean)
    .join(', ')
}

export function compileRootBaseStyle(theme: Theme, options: RootBaseStyleOptions = {}): string {
  const t = theme.tokens
  const parts: string[] = []
  // 必须去引号：带引号的字体名会让微信丢掉整条声明（并连带污染后面的声明）。
  parts.push(`font-family: ${unquoteFontFamily(t.fontFamily)};`)
  parts.push(`font-size: ${t.fontSize};`)
  parts.push(`color: ${t.textColor};`)
  parts.push(`line-height: ${t.lineHeight};`)
  // 以下三项此前无处可放，导致 WeMD 移植主题的根级 padding / letter-spacing / word-break 全部丢失。
  if (t.letterSpacing) parts.push(`letter-spacing: ${t.letterSpacing};`)
  // 有 :::canvas 时交给画布，避免与画布 padding 叠加。
  if (t.pagePadding && !options.hasCanvas) parts.push(`padding: ${t.pagePadding};`)
  if (t.wordBreak) parts.push(`word-break: ${t.wordBreak};`)
  // 页底色（可选）：不设就不输出。它是深色模式下正文可读性的关键，
  // 但 background-color 在白名单 GRAY 档，会带一条提示 —— 交由使用者权衡，不默认开启。
  if (t.pageBackgroundColor) parts.push(`background-color: ${t.pageBackgroundColor};`)
  // 注意：不要添加 -webkit-text-size-adjust 等不在微信白名单内的属性，否则会被 validator 拦截。
  return parts.join(' ')
}
