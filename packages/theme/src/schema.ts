import { z } from 'zod'
import {
  findUnsafeCssValue,
  isCssPropertyAllowed,
} from './css-whitelist.js'
import { resolveTokenReferences } from './tokens.js'

/** 主题 block 允许出现的元素名（Markdown/rehype 输出中对应的标签）。 */
export const BLOCK_NAMES = [
  'h1',
  'h2',
  'h3',
  'p',
  'blockquote',
  'ul',
  'ol',
  'li',
  'code',
  'pre',
  'img',
  'figcaption',
  'hr',
  'a',
  'strong',
] as const
export type BlockName = (typeof BLOCK_NAMES)[number]

export const colorSchema = z
  .string()
  .refine(
    (v) =>
      /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v) ||
      /^rgba?\([^)]+\)$/.test(v) ||
      /^hsla?\([^)]+\)$/.test(v) ||
      /^oklch\([^)]+\)$/.test(v),
    { message: '颜色值必须是十六进制、rgb/rgba、hsl/hsla 或 oklch 格式。' },
  )

export const lengthSchema = z
  .string()
  .regex(/^\d+(\.\d+)?(px|em|rem|pt|%)$/, '尺寸必须带合法单位，例如 16px、1.5em。')

/** 各 block 的「声明值」必须是字符串字面量，或 `{{token}}` 引用。 */
const declarationValueSchema = z.string().min(1)
const blockSchema = z.record(declarationValueSchema, declarationValueSchema)

function buildBlockObjectSchema() {
  const record: Record<string, typeof blockSchema> = {}
  for (const name of BLOCK_NAMES) record[name] = blockSchema
  return z.object(record as Record<BlockName, typeof blockSchema>)
}

export const themeBlocksSchema = buildBlockObjectSchema()

/** 主题 tokens —— 全局可复用的「设计变量」，block 声明里可用 `{{tokenName}}` 引用。 */
export const themeTokensSchema = z.object({
  primaryColor: colorSchema,
  textColor: colorSchema,
  fontSize: lengthSchema,
  lineHeight: z.number().min(0.8).max(4),
  fontFamily: z.string().min(1).max(200),
  spacing: z.object({
    block: lengthSchema,
  }),
})

/**
 * 主题 Schema。
 * blocks 内每个声明键（CSS 属性）必须落在微信白名单内；值可通过 `{{token}}` 引用 tokens。
 */
export const themeSchema = z
  .object({
    name: z.string().min(1).max(60),
    description: z.string().min(1).max(500),
    tokens: themeTokensSchema,
    blocks: themeBlocksSchema,
  })
  .superRefine((theme, ctx) => {
    for (const blockName of BLOCK_NAMES) {
      const block = theme.blocks[blockName]
      for (const [property, rawValue] of Object.entries(block)) {
        const propPath = `blocks.${blockName}.${property}`

        if (!isCssPropertyAllowed(property)) {
          ctx.addIssue({
            code: 'custom',
            path: [propPath],
            message: `CSS 属性「${property}」不在微信兼容白名单内（可能被微信编辑器过滤：position / transform / animation / float 等）。请改用白名单属性。`,
          })
          continue
        }

        const resolved = resolveTokenReferences(rawValue, theme.tokens)
        if (resolved.trim() === '') {
          ctx.addIssue({
            code: 'custom',
            path: [propPath],
            message: `属性「${property}」的值经过 token 引用解析后为空，请检查是否引用了非法 token。`,
          })
          continue
        }

        const unsafe = findUnsafeCssValue(resolved)
        if (unsafe) {
          ctx.addIssue({
            code: 'custom',
            path: [propPath],
            message: unsafe,
          })
        }
      }
    }
  })

export type Theme = z.infer<typeof themeSchema>
export type ThemeTokens = z.infer<typeof themeTokensSchema>
export type ThemeBlock = Record<string, string>

/** 导出 JSON Schema（供 LLM 结构化输出约束 / MCP tool 描述使用）。 */
export function themeToJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(themeSchema) as Record<string, unknown>
}
