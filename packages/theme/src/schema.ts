import { z } from 'zod'
import { isCssPropertyAllowed } from './css-whitelist.js'
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

/** 1~4 个值组成的盒模型简写，例如 `24px 28px`。 */
export const boxShorthandSchema = z
  .string()
  .regex(
    /^\d+(\.\d+)?(px|em|rem|pt|%)(\s+\d+(\.\d+)?(px|em|rem|pt|%)){0,3}$/,
    '必须是 1~4 个带单位的尺寸，例如 24px 28px。',
  )

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
  // ---- 根节点级排版（此前只有 font-family/size/color/line-height 能落到根节点） ----
  /** 全局字距（根节点 letter-spacing），例如 0.045em。 */
  letterSpacing: lengthSchema.optional().describe('全局字距（根节点 letter-spacing），例如 0.045em。'),
  /** 正文页边距（根节点 padding），例如 24px 28px。用了 :::canvas 时不要再叠加。 */
  pagePadding: boxShorthandSchema
    .optional()
    .describe('正文页边距（根节点 padding），例如 24px 28px。注意不要与 :::canvas 组件的 padding 叠加。'),
  /** 长英文 / URL 断行策略（根节点 word-break）。 */
  wordBreak: z
    .enum(['normal', 'break-word', 'break-all', 'keep-all'])
    .optional()
    .describe('长英文 / URL 断行策略（根节点 word-break），推荐 break-word。'),
  // ---- 以下为富组件扩展 token，全部可选（老主题不受影响） ----
  /** 强调色（卡片浅底、标签底色等），缺省由 primaryColor 派生。 */
  accentColor: colorSchema.optional().describe('强调色：卡片浅底、标签底色等，缺省由 primaryColor 派生。'),
  /** 次要文字色，缺省由 textColor 向白色混合派生。 */
  mutedColor: colorSchema.optional().describe('次要文字色，缺省由 textColor 向白色混合派生。'),
  /** 卡片底色。 */
  cardBg: colorSchema.optional().describe('卡片 / 图注条底色。'),
  /** 卡片描边色。 */
  cardBorderColor: colorSchema.optional().describe('卡片描边色。'),
  /** 分割线颜色。 */
  dividerColor: colorSchema.optional().describe('分割线 / 虚线分隔颜色。'),
  /** 画布背景色（canvas 组件）。 */
  canvasBg: colorSchema.optional().describe('canvas 画布组件的背景底色。'),
  /**
   * 正文页底色（根节点 background-color）。可选，缺省不输出。
   *
   * 为什么要有它：微信深色模式会把页面背景变暗，而正文 inline 样式不会被改写 ——
   * 根节点没有显式底色时，深色文字就贴在暗底上看不见。设了它，正文自带底色，
   * 深色模式下依旧可读。
   * 代价要说清：background-color 在微信 CSS 白名单的 GRAY 档（草稿 API 实测保留、
   * 读者端需真机核对），所以校验会多一条灰档提示。
   */
  pageBackgroundColor: colorSchema
    .optional()
    .describe('正文页底色（根节点 background-color）。设了之后微信深色模式下文章不再透出暗底；代价是多一条白名单 GRAY 档提示。'),
  /** 全局圆角（卡片、图片、按钮等）。 */
  radius: lengthSchema.optional().describe('全局圆角（卡片、图片、按钮、进度条等），例如 12px。'),
})

/**
 * 主题 Schema。
 * blocks 内每个声明键（CSS 属性）必须落在微信白名单内；值可通过 `{{token}}` 引用 tokens。
 */
/**
 * 组件级样式覆盖：{ card: { root: {...}, title: {...}, "*": {...} } }。
 * 三种寻址：root（组件最外层）、*（组件内所有元素）、语义槽位（title / body / dot …）。
 * 具体可用槽位见 list_components；写错槽位会由 components 层给出诊断。
 */
export const componentStylesSchema = z.record(
  z.string(),
  z.record(z.string(), z.record(z.string(), z.string())),
)

/** decorations 可作用的元素。 */
export const DECORATION_TARGETS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li'] as const

/**
 * 伪元素装饰的「真实元素」等价物。
 *
 * 微信正文会剥离 class 选择器与 `::before` / `::after`，所以 WeMD 一类主题靠伪元素做的
 * 装饰（标题前的 ◆、带序号的章节标记、引用块的引号、清单的 [*]）在微信里全部失效。
 * 主题用 decorations 声明它们，渲染时会注入**真实的内联元素**，效果等价。
 */
export const decorationRuleSchema = z.object({
  /** 作用在哪个元素上。 */
  target: z.enum(DECORATION_TARGETS),
  /** 插到元素内容之前还是之后。 */
  position: z.enum(['before', 'after']).default('before'),
  /** 固定字符，如 "◆"、"「"、"[*]"。与 counter 二选一；两者都不给则得到一个纯装饰块。 */
  text: z.string().max(24).optional(),
  /** 自增序号（按文档中出现顺序）。与 text 二选一。 */
  counter: z.enum(['decimal', 'decimal-leading-zero', 'lower-alpha', 'upper-alpha']).optional(),
  /** 注入元素的内联样式；键必须落在微信白名单内。 */
  style: z.record(z.string(), z.string()).optional(),
})

export const themeDecorationsSchema = z.array(decorationRuleSchema).max(16)

export type DecorationRule = z.infer<typeof decorationRuleSchema>

export const themeSchema = z
  .object({
    name: z.string().min(1).max(60),
    description: z.string().min(1).max(500),
    tokens: themeTokensSchema,
    blocks: themeBlocksSchema,
    /** 组件级样式覆盖（可选）。 */
    components: componentStylesSchema.optional(),
    /** 伪元素装饰的真实元素等价物（可选）。 */
    decorations: themeDecorationsSchema.optional(),
  })
  .superRefine((theme, ctx) => {
    // 装饰注入的元素样式：同样要过微信白名单
    ;(theme.decorations ?? []).forEach((rule, i) => {
      for (const property of Object.keys(rule.style ?? {})) {
        if (!isCssPropertyAllowed(property)) {
          ctx.addIssue({
            code: 'custom',
            path: [`decorations.${i}.style.${property}`],
            message: `CSS 属性「${property}」已被真实微信实测会过滤（如 position / filter 等），请移除或改用微信保留的属性。`,
          })
        }
      }
    })
    // 组件级覆盖：逐个声明检查微信白名单（硬禁止属性直接报错）
    for (const [componentName, slots] of Object.entries(theme.components ?? {})) {
      for (const [slotName, declarations] of Object.entries(slots)) {
        for (const property of Object.keys(declarations)) {
          if (!isCssPropertyAllowed(property)) {
            ctx.addIssue({
              code: 'custom',
              path: [`components.${componentName}.${slotName}.${property}`],
              message: `CSS 属性「${property}」已被真实微信实测会过滤（如 position / filter 等），请移除或改用微信保留的属性。`,
            })
          }
        }
      }
    }

    for (const blockName of BLOCK_NAMES) {
      const block = theme.blocks[blockName]
      for (const [property, rawValue] of Object.entries(block)) {
        const propPath = `blocks.${blockName}.${property}`

        // 仅对「微信真实会过滤」的属性硬禁止（position/filter 等）；transform/animation/float
        // 等为灰色属性（微信草稿 API 实测保留），不在主题层面判非法，交由 validator 提示。
        if (!isCssPropertyAllowed(property)) {
          ctx.addIssue({
            code: 'custom',
            path: [propPath],
            message: `CSS 属性「${property}」已被真实微信实测会过滤（如 position / filter 等），请移除或改用微信保留的属性。`,
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
