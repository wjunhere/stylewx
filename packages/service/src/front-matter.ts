/**
 * 极简 YAML front-matter：只支持一层 `key: value`，只认 title / theme 两个键。
 *
 * 用途：让落盘的 `.md` 自带「标题 + 主题」，这样直接在编辑器里打开或导入这个 md，
 * 就能还原出 agent 排版时用的主题，不用再手选。
 *
 * 故意不引入 yaml 依赖，也不追求 YAML 完备性：只解析我们自己写出去的那两个字段，
 * 越简单越不容易出意外。识别条件也更严格——块内必须至少有一个已知键，
 * 否则视为普通 Markdown 的分割线（`---`），原样返回，避免误伤正文。
 */
import type { Theme } from '@stylewx/theme'

export interface ArticleFrontMatter {
  title?: string
  theme?: string
}

/** 只认这两个键；其余字段原样忽略（不算 front-matter 的证据）。 */
const KNOWN_KEYS = ['title', 'theme'] as const

/** `---` 起始、`---` 结束（允许行尾空格）。开头容忍 BOM。 */
const FRONT_MATTER_RE = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/** 去掉首尾成对的引号。 */
function unquote(value: string): string {
  if (value.length < 2) return value
  // 用 charAt 而非下标：开启 noUncheckedIndexedAccess 时下标取值是 string | undefined
  const first = value.charAt(0)
  const last = value.charAt(value.length - 1)
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1)
  }
  return value
}

/** 值里含冒号/井号或首尾空格时用双引号包起来（JSON 字符串即合法 YAML）。 */
function quoteValue(value: string): string {
  return /^[^\s:#][^:#]*$/.test(value) ? value : JSON.stringify(value)
}

/**
 * 分离 front-matter 与正文。
 * 块内没有已知键时会**整段原样返回**，把开头的 `---` 当作普通分割线。
 */
export function parseFrontMatter(text: string): { meta: ArticleFrontMatter; body: string } {
  const m = FRONT_MATTER_RE.exec(text)
  if (!m) return { meta: {}, body: text }

  const meta: ArticleFrontMatter = {}
  const block = m[1] ?? ''
  for (const line of block.split(/\r?\n/)) {
    const s = line.trim()
    if (!s || s.startsWith('#')) continue
    const i = s.indexOf(':')
    if (i < 0) continue
    const key = s.slice(0, i).trim()
    const value = unquote(s.slice(i + 1).trim())
    if ((KNOWN_KEYS as readonly string[]).includes(key) && value) {
      meta[key as (typeof KNOWN_KEYS)[number]] = value
    }
  }

  if (Object.keys(meta).length === 0) return { meta: {}, body: text }
  return { meta, body: text.slice((m[0] ?? '').length).replace(/^\s*\n+/, '') }
}

/** 把 front-matter 拼回正文前面。没有任何字段时原样返回正文。 */
export function stringifyFrontMatter(meta: ArticleFrontMatter, body: string): string {
  const lines: string[] = []
  if (meta.title) lines.push(`title: ${quoteValue(meta.title)}`)
  if (meta.theme) lines.push(`theme: ${quoteValue(meta.theme)}`)
  if (lines.length === 0) return body
  return `---\n${lines.join('\n')}\n---\n\n${body.replace(/^\s*\n+/, '')}`
}

/**
 * 主题名归一：只有确实存在的预置/已保存主题才认，避免 md 里写错名字后
 * 编辑器选了个不存在的 option（select 会变成空值）。
 */
export function normalizeThemeName(name: string | undefined, known: string[]): string | undefined {
  if (!name) return undefined
  return known.includes(name) ? name : undefined
}

/** 供类型提示：save_article 接受的主题参数就是主题名。 */
export type ThemeName = Theme['name']
