/**
 * 主题库：把「自定义 / AI 生成」的主题持久化到本地，方便以后复用。
 * 默认存到用户级 `~/.stylewx/themes.json`（可用环境变量 STYLEWX_THEMES_PATH 覆盖）。
 * 注意：本模块使用 Node fs —— 只允许出现在 service 层（core/theme/validator 保持同构，不得引用）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { validateTheme, getPresetTheme } from '@stylewx/theme'
import type { Theme } from '@stylewx/theme'
import { serviceError } from './errors.js'

const DEFAULT_DIR = join(homedir(), '.stylewx')
const DEFAULT_FILE = join(DEFAULT_DIR, 'themes.json')

export interface ThemeStoreOptions {
  /** 覆盖存储文件路径（测试用）。 */
  file?: string
}

function storeFile(opts?: ThemeStoreOptions): string {
  return opts?.file ?? process.env.STYLEWX_THEMES_PATH ?? DEFAULT_FILE
}

interface StoreShape {
  themes: Theme[]
}

/** 读取已保存的主题（文件缺失或损坏时返回空，不抛错）。 */
function readSavedThemes(file: string): Theme[] {
  try {
    if (!existsSync(file)) return []
    const raw = readFileSync(file, 'utf8')
    const data = JSON.parse(raw) as StoreShape | Theme[]
    const arr = Array.isArray(data) ? data : (data.themes ?? [])
    return arr.filter((t): t is Theme => !!t && typeof t === 'object' && typeof (t as Theme).name === 'string')
  } catch {
    return []
  }
}

function writeSavedThemes(file: string, themes: Theme[]): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ themes }, null, 2), 'utf8')
}

/** 列出所有已保存的自定义主题。 */
export function listSavedThemes(opts?: ThemeStoreOptions): { themes: Theme[] } {
  return { themes: readSavedThemes(storeFile(opts)).map((t) => structuredClone(t)) }
}

/**
 * 保存一个主题（校验通过后写入本地库）。同名会覆盖。
 * @returns 保存后的主题（已通过 schema + 白名单校验）。
 */
export function saveTheme(input: unknown, opts?: ThemeStoreOptions): { theme: Theme } {
  const result = validateTheme(input)
  if (!result.ok || !result.theme) {
    const detail = result.issues.map((i) => `${i.path}: ${i.message}`).join('；')
    throw serviceError(
      'invalid_theme',
      `主题不合法，无法保存：${detail}`,
      '请用符合主题 Schema 的 JSON 传入，或先用 generate_theme 生成后保存。',
    )
  }
  const theme = result.theme
  const file = storeFile(opts)
  const all = readSavedThemes(file)
  const idx = all.findIndex((t) => t.name === theme.name)
  if (idx >= 0) all[idx] = structuredClone(theme)
  else all.push(structuredClone(theme))
  writeSavedThemes(file, all)
  return { theme }
}

/**
 * 导出主题为完整 JSON（供复用/分享）。支持：已保存的自定义主题名、预置主题名、或完整主题对象。
 * @returns 可直接传给 render_preview / publish_draft 复用的完整主题对象。
 */
export function exportTheme(input: unknown, opts?: ThemeStoreOptions): { theme: Theme } {
  if (input && typeof input === 'object') {
    const result = validateTheme(input)
    if (result.ok && result.theme) return { theme: result.theme }
    const detail = result.issues.map((i) => `${i.path}: ${i.message}`).join('；')
    throw serviceError('invalid_theme', `主题不合法：${detail}`, '请传入符合 Schema 的主题对象或已存在的主题名。')
  }
  if (typeof input === 'string' && input.trim()) {
    const name = input.trim()
    const saved = readSavedThemes(storeFile(opts)).find((t) => t.name === name)
    if (saved) return { theme: structuredClone(saved) }
    const preset = getPresetTheme(name)
    if (preset) return { theme: structuredClone(preset) }
    throw serviceError('invalid_theme', `找不到主题「${name}」。`, '可先 list_saved_themes / list_themes 查看可用主题名。')
  }
  throw serviceError('invalid_theme', 'export_theme 需要主题对象或主题名。', '请传入主题 JSON 或已存在的主题名称字符串。')
}

/** 删除一个已保存的主题。 */
export function deleteTheme(name: string, opts?: ThemeStoreOptions): { deleted: string } {
  const file = storeFile(opts)
  const all = readSavedThemes(file)
  const next = all.filter((t) => t.name !== name)
  if (next.length === all.length) throw serviceError('invalid_theme', `没有已保存的主题「${name}」。`, '请用 list_saved_themes 查看已存主题。')
  writeSavedThemes(file, next)
  return { deleted: name }
}
