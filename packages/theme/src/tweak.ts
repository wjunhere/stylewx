/**
 * 主题微调：在现有主题上做**确定性**修改，不调用 LLM。
 *
 * 与 `generate_theme` 的区别：那个是「从零生成一版新主题」，这个只改指定字段，
 * 用于 agent 迭代中的「改一点再试一下」，秒级返回且结果可预期。
 */
import { themeSchema } from './schema.js'
import type { Theme } from './schema.js'

/** 可微调的 token 字段（与 schema 的可选扩展 token 对齐）。 */
export const TWEAKABLE_TOKENS = [
  'primaryColor',
  'textColor',
  'fontSize',
  'lineHeight',
  'fontFamily',
  'accentColor',
  'mutedColor',
  'cardBg',
  'cardBorderColor',
  'dividerColor',
  'canvasBg',
  'radius',
] as const

export type TweakableToken = (typeof TWEAKABLE_TOKENS)[number]

export interface ThemePatch {
  /** 改主题名（保存时用它区分不同版本）。 */
  name?: string
  /** 改主题描述。 */
  description?: string
  /** 改 tokens 里的具体字段。 */
  tokens?: Partial<Record<TweakableToken, string | number>>
  /** 直接覆盖某个 block 的 CSS 声明，例如 { p: { 'font-size': '16px' } }。 */
  blocks?: Record<string, Record<string, string>>
  /**
   * 组件级样式覆盖，例如 { card: { root: { padding: '20px' }, title: { 'font-size': '19px' } } }。
   * 寻址方式：root（组件最外层）/ *（组件内所有元素）/ 语义槽位（title、body…）。
   * 传 null 可清空该组件的覆盖。
   */
  components?: Record<string, Record<string, Record<string, string>> | null>
}

export interface TweakThemeResult {
  ok: boolean
  theme?: Theme
  /** 实际被修改的字段路径，例如 ['tokens.primaryColor', 'blocks.p.font-size']。 */
  changed: string[]
  issues: { path: string; message: string }[]
}

/**
 * 在 `base` 基础上应用 `patch`，返回新主题（不修改入参）。
 * 结果会过一遍主题 Schema（含微信 CSS 白名单），非法时 ok=false 并给出 issues。
 */
export function tweakTheme(base: Theme, patch: ThemePatch): TweakThemeResult {
  const theme = structuredClone(base) as unknown as {
    name: string
    description: string
    tokens: Record<string, unknown>
    blocks: Record<string, Record<string, string>>
    components?: Record<string, Record<string, Record<string, string>>>
  }
  const changed: string[] = []

  if (typeof patch.name === 'string' && patch.name.trim() && patch.name !== theme.name) {
    theme.name = patch.name.trim()
    changed.push('name')
  }
  if (typeof patch.description === 'string' && patch.description.trim() && patch.description !== theme.description) {
    theme.description = patch.description.trim()
    changed.push('description')
  }

  for (const key of TWEAKABLE_TOKENS) {
    const value = patch.tokens?.[key]
    if (value === undefined || value === '') continue
    if (theme.tokens[key] === value) continue
    theme.tokens[key] = value
    changed.push(`tokens.${key}`)
  }

  for (const [blockName, declarations] of Object.entries(patch.blocks ?? {})) {
    if (!declarations || typeof declarations !== 'object') continue
    const block = theme.blocks[blockName] ?? (theme.blocks[blockName] = {})
    for (const [property, value] of Object.entries(declarations)) {
      if (value === undefined || value === '') continue
      if (block[property] === value) continue
      block[property] = value
      changed.push(`blocks.${blockName}.${property}`)
    }
  }

  // 组件级覆盖：逐槽位合并，传 null 表示清空该组件
  if (patch.components) {
    const current = (theme.components ?? {}) as Record<string, Record<string, Record<string, string>>>
    for (const [componentName, slots] of Object.entries(patch.components)) {
      if (slots === null) {
        if (componentName in current) {
          delete current[componentName]
          changed.push(`components.${componentName}`)
        }
        continue
      }
      const target = current[componentName] ?? (current[componentName] = {})
      for (const [slotName, declarations] of Object.entries(slots)) {
        if (!declarations || typeof declarations !== "object") continue
        const slotTarget = target[slotName] ?? (target[slotName] = {})
        for (const [property, value] of Object.entries(declarations)) {
          if (value === undefined || value === "") continue
          if (slotTarget[property] === value) continue
          slotTarget[property] = value
          changed.push(`components.${componentName}.${slotName}.${property}`)
        }
      }
    }
    theme.components = current
  }

  const parsed = themeSchema.safeParse(theme)
  if (!parsed.success) {
    return {
      ok: false,
      changed,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    }
  }
  return { ok: true, theme: parsed.data, changed, issues: [] }
}
