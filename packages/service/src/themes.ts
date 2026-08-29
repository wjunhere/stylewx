import { PRESET_THEMES, getPresetTheme, validateTheme } from '@mp-style/theme'
import type { Theme } from '@mp-style/theme'
import { serviceError } from './errors.js'
import { listSavedThemes } from './theme-store.js'

/**
 * 预置主题摘要。返回完整的主题对象（含 blocks），这样 Agent 可直接把它传给
 * render_preview / publish_draft 复用，无需二次构造。
 * 还会合并「本地已保存的自定义 / AI 主题」（同名去重，预置优先），方便复用。
 */
export function listThemes(): { themes: Theme[] } {
  const presets = PRESET_THEMES.map((theme) => structuredClone(theme))
  const presetNames = new Set(presets.map((t) => t.name))
  const saved = listSavedThemes().themes.filter((t) => !presetNames.has(t.name))
  return { themes: [...presets, ...saved] }
}

/**
 * 把输入解析为可用主题：支持预置主题名（字符串）或完整主题对象。
 * 对象会经 zod + 微信白名单校验；非法时抛出统一错误。
 */
export function resolveTheme(input: unknown): Theme {
  if (typeof input === 'string') {
    const name = input.trim()
    const theme = getPresetTheme(name) ?? listSavedThemes().themes.find((t) => t.name === name)
    if (!theme) {
      const names = PRESET_THEMES.map((t) => t.name).join('、')
      throw serviceError(
        'invalid_theme',
        `未知主题「${input}」。`,
        `请使用 list_themes 返回的主题名（可用：${names}，或你已保存的自定义主题名），或传入完整主题对象。`,
      )
    }
    return theme
  }
  if (input && typeof input === 'object') {
    const result = validateTheme(input)
    if (result.ok && result.theme) return result.theme
    const detail = result.issues.map((i) => `${i.path}: ${i.message}`).join('；')
    throw serviceError(
      'invalid_theme',
      `主题不合法：${detail}`,
      '请用符合主题 Schema 的 JSON 传入，或先用 generate_theme 生成主题；也可传预置主题名。',
    )
  }
  throw serviceError('invalid_theme', 'theme 必须是主题对象或预置主题名。', '请提供主题对象或字符串名称。')
}
