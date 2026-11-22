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
  /**
   * 主题来源：`agent`（默认，agent 自己生成/手写的）、`brand:<品牌名>`（品牌档案派生）。
   * 记在 `origins` 旁挂表里而不是塞进主题对象 —— 主题会走 export/brand pack/`validateTheme`，
   * 多一个非 schema 字段就会在往返中被剥掉或被 schema 拒。
   */
  origin?: string
  /** 删除时允许对「没有来源标记」的存量主题动手（默认拒绝，见 deleteTheme）。 */
  allowUnknown?: boolean
}

function storeFile(opts?: ThemeStoreOptions): string {
  return opts?.file ?? process.env.STYLEWX_THEMES_PATH ?? DEFAULT_FILE
}

interface StoreShape {
  themes: Theme[]
  /** 主题名 → 来源。存量文件没有这个字段 → 视为「未知」（见 deleteTheme）。 */
  origins?: Record<string, string>
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

function writeSavedThemes(file: string, themes: Theme[], origins?: Record<string, string>): void {
  mkdirSync(dirname(file), { recursive: true })
  const shape: StoreShape = { themes }
  if (origins && Object.keys(origins).length) shape.origins = origins
  writeFileSync(file, JSON.stringify(shape, null, 2), 'utf8')
}

/** 读旁挂的来源表（文件缺失/损坏/老版本无此字段 → 空表）。 */
function readOrigins(file: string): Record<string, string> {
  try {
    if (!existsSync(file)) return {}
    const data = JSON.parse(readFileSync(file, 'utf8')) as StoreShape | Theme[]
    if (Array.isArray(data)) return {}
    const raw = data.origins
    if (!raw || typeof raw !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'string' && v) out[k] = v
    return out
  } catch {
    return {}
  }
}

/** 列出所有已保存的自定义主题（附来源表，供 delete_theme 与 agent 判断）。 */
export function listSavedThemes(opts?: ThemeStoreOptions): { themes: Theme[]; origins: Record<string, string> } {
  const file = storeFile(opts)
  return { themes: readSavedThemes(file).map((t) => structuredClone(t)), origins: readOrigins(file) }
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
  const origins = readOrigins(file)
  const idx = all.findIndex((t) => t.name === theme.name)
  if (idx >= 0) all[idx] = structuredClone(theme)
  else all.push(structuredClone(theme))
  origins[theme.name] = opts?.origin ?? 'agent'
  writeSavedThemes(file, all, origins)
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

/**
 * 删除一个已保存的主题。
 *
 * 两道门：品牌派生的主题删不得（`brand_apply` 会幂等地把它补回来，删了就变成「删了又复活」）；
 * 没有来源标记的存量主题默认也不删 —— 早期版本的 themes.json 没有 `origins`，无从判断是人的
 * 还是品牌的，误删代价比重来一次大（实测就有人靠人工比对名字才敢清试验主题）。
 */
export function deleteTheme(name: string, opts?: ThemeStoreOptions): { deleted: string } {
  const file = storeFile(opts)
  const all = readSavedThemes(file)
  const origins = readOrigins(file)
  const origin = origins[name]
  if (origin?.startsWith('brand:')) {
    throw serviceError(
      'theme_owned_by_brand',
      `主题「${name}」来自品牌档案（${origin}），不能在这里删。`,
      '要删就先删/改品牌档案里的主题（profile.json），再调 brand_apply 同步，否则 brand_apply 会把它补回来。',
    )
  }
  if (!origin && opts?.allowUnknown !== true) {
    throw serviceError(
      'theme_origin_unknown',
      `主题「${name}」没有来源标记（早期版本写入的），无法判断是人的还是品牌的。`,
      '确认要删就再调一次并传 allowUnknown（服务层）—— 或直接编辑 themes.json 并在删前备份。',
    )
  }
  const next = all.filter((t) => t.name !== name)
  if (next.length === all.length) throw serviceError('invalid_theme', `没有已保存的主题「${name}」。`, '请用 list_saved_themes 查看已存主题。')
  delete origins[name]
  writeSavedThemes(file, next, origins)
  return { deleted: name }
}
