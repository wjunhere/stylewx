/**
 * 主题 token 系统。
 * block 声明里的值可用 `{{tokenPath}}` 引用 tokens 中的设计变量，例如 `{{primaryColor}}`、
 * `{{spacing.block}}`。编译 / 校验时统一解析。
 */

import type { ThemeTokens } from './schema.js'
/** 允许被 `{{...}}` 引用的 token 路径。 */
export const TOKEN_PATHS = [
  'primaryColor',
  'textColor',
  'fontSize',
  'lineHeight',
  'fontFamily',
  'spacing.block',
] as const

export type TokenPath = (typeof TOKEN_PATHS)[number]

/** 从 tokens 中取一个路径的值，返回字符串或 undefined（不存在 / 非字符串）。 */
export function getTokenValue(path: string, tokens: ThemeTokens): string | undefined {
  const parts = path.split('.')
  let cur: unknown = tokens
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  if (typeof cur === 'string') return cur
  if (typeof cur === 'number') return String(cur)
  return undefined
}

/**
 * 把字符串中的 `{{tokenPath}}` 引用替换为对应的 token 值。
 * 未匹配到的 token 替换为空字符串（便于上游校验发现非法引用）。
 * 无法被识别的非 token 文本原样保留。
 */
export function resolveTokenReferences(
  value: string,
  tokens: ThemeTokens,
): string {
  const tokenRegex = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g
  return value.replace(tokenRegex, (full, path: string) => {
    const resolved = getTokenValue(path, tokens)
    return resolved ?? ''
  })
}

/** 判断一个字符串中是否包含 token 引用。 */
export function hasTokenReferences(value: string): boolean {
  return /\{\{\s*[a-zA-Z0-9_.]+\s*\}\}/.test(value)
}
