/**
 * theme → CSS 编译器。
 * 把主题对象编译成一段仅含「微信兼容属性、无 class 依赖」的 CSS 字符串，
 * 供 core 的 juice 内联管线使用。纯函数、无 DOM / Node 依赖。
 */

import { BLOCK_NAMES } from './schema.js'
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
  for (const blockName of BLOCK_NAMES) {
    const declarations = theme.blocks[blockName]
    const entries = Object.entries(declarations)
    if (entries.length === 0) continue
    const css = entries
      .map(([prop, value]) => `${prop}: ${resolveDeclValue(value, theme.tokens)};`)
      .join(' ')
    rules.push(`${blockName} { ${css} }`)
  }
  return rules
}

/**
 * 编译主题为 CSS 字符串。
 * @param theme 已通过 themeSchema 校验的主题
 * @returns 可直接交给 juice 的 CSS（不含 <style> 包裹）
 */
export function compileThemeToCss(theme: Theme): string {
  const blockRules = buildBlockRules(theme)
  return blockRules.join('\n')
}

/**
 * 生成「根容器」的基础内联样式，作为后代元素的继承默认值。
 * 这些值直接内联到渲染的根节点上（不依赖 class / <style>）。
 */
export function compileRootBaseStyle(theme: Theme): string {
  const t = theme.tokens
  const parts: string[] = []
  parts.push(`font-family: ${t.fontFamily};`)
  parts.push(`font-size: ${t.fontSize};`)
  parts.push(`color: ${t.textColor};`)
  parts.push(`line-height: ${t.lineHeight};`)
  // 注意：不要添加 -webkit-text-size-adjust 等不在微信白名单内的属性，否则会被 validator 拦截。
  return parts.join(' ')
}
