import { z } from 'zod'

export const VALIDATION_SEVERITY = ['error', 'warning', 'info'] as const
export type ValidationSeverity = (typeof VALIDATION_SEVERITY)[number]

export const validationIssueSchema = z.object({
  /** 规则标识，例如 no-forbidden-tag、css-property-not-whitelisted。 */
  rule: z.string(),
  /** 严重程度：error 必须修复；warning 建议处理；info 仅供参考。 */
  severity: z.enum(VALIDATION_SEVERITY),
  /** 面向 Agent 的中文说明：发生了什么、为什么。 */
  message: z.string(),
  /** 可直接执行的修复建议（面向 LLM 优化措辞）。 */
  suggestion: z.string(),
  /** 问题位置，形如 `img#2` 或 `body > p:nth-of-type(3)` 或属性名。 */
  location: z.string(),
})

export const validationReportSchema = z.object({
  /** 是否全部通过（无 error 级别问题）。 */
  pass: z.boolean(),
  issues: z.array(validationIssueSchema),
})

export type ValidationIssue = z.infer<typeof validationIssueSchema>
export type ValidationReport = z.infer<typeof validationReportSchema>
