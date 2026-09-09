/** 内联样式 / 属性拼装小工具（同构，无依赖）。 */

export type StyleMap = Record<string, string | number | undefined | null>

/** 把对象拼成 `prop: value;` 形式的内联样式串（跳过空值）。 */
export function css(style: StyleMap): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined || value === null || value === '') continue
    parts.push(`${key}:${typeof value === 'number' ? String(value) : value}`)
  }
  return parts.join(';')
}

/** 生成 `style="…"` 属性（空样式返回空串）。 */
export function styleAttr(style: StyleMap): string {
  const value = css(style)
  return value ? ` style="${escapeAttr(value)}"` : ''
}

/** HTML 文本转义。 */
export function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** HTML 属性值转义。 */
export function escapeAttr(input: string): string {
  return String(input).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** 取 props 中的值，不存在时返回默认值。 */
export function prop(props: Record<string, string>, key: string, fallback = ''): string {
  const v = props[key]
  return v === undefined || v === '' ? fallback : v
}

/** 取布尔型 props（true/1/yes/on）。 */
export function boolProp(props: Record<string, string>, key: string, fallback = false): boolean {
  const v = props[key]
  if (v === undefined || v === '') return fallback
  return ['true', '1', 'yes', 'on', ''].includes(v.toLowerCase())
}

/** 取数字型 props。 */
export function numProp(props: Record<string, string>, key: string, fallback: number): number {
  const v = props[key]
  if (v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** 转义正则元字符（用于按用户输入切分文本）。 */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
