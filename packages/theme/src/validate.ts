import { themeSchema } from './schema.js'
import type { Theme } from './schema.js'

export interface ThemeIssue {
  path: string
  message: string
}

export interface ThemeValidationResult {
  ok: boolean
  theme?: Theme
  issues: ThemeIssue[]
}

/**
 * 校验一个未知输入是否为合法、微信兼容的主题。
 * 返回结构化结果：ok 为 true 时给出通过校验后的 theme。
 */
export function validateTheme(input: unknown): ThemeValidationResult {
  const result = themeSchema.safeParse(input)
  if (result.success) {
    return { ok: true, theme: result.data, issues: [] }
  }
  const issues: ThemeIssue[] = result.error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }))
  return { ok: false, issues }
}
