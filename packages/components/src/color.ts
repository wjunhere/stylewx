/**
 * 颜色工具：把主题 token 派生成组件需要的整套配色。
 * 同构实现，不依赖 DOM / Node。
 */

export interface Rgb {
  r: number
  g: number
  b: number
  a: number
}

const NAMED: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  transparent: '#00000000',
  red: '#f56c6c',
  green: '#67c23a',
  blue: '#409eff',
  orange: '#e6a23c',
  purple: '#9b6df2',
  gray: '#8a9099',
  grey: '#8a9099',
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

/** 解析 #rgb / #rgba / #rrggbb / #rrggbbaa / rgb() / rgba() / 具名色。失败返回 null。 */
export function parseColor(input: string): Rgb | null {
  const raw = (input ?? '').trim().toLowerCase()
  if (!raw) return null
  const named = NAMED[raw]
  const value = named ?? raw

  const hex = /^#([0-9a-f]{3,8})$/.exec(value)
  if (hex) {
    const h = hex[1] as string
    const expand = (c: string) => parseInt(c + c, 16)
    if (h.length === 3 || h.length === 4) {
      return {
        r: expand(h[0] as string),
        g: expand(h[1] as string),
        b: expand(h[2] as string),
        a: h.length === 4 ? expand(h[3] as string) / 255 : 1,
      }
    }
    if (h.length === 6 || h.length === 8) {
      const n = (i: number) => parseInt(h.slice(i, i + 2), 16)
      return {
        r: n(0),
        g: n(2),
        b: n(4),
        a: h.length === 8 ? n(6) / 255 : 1,
      }
    }
    return null
  }

  const rgb = /^rgba?\(([^)]+)\)$/.exec(value)
  if (rgb) {
    const parts = (rgb[1] as string).split(/[,/\s]+/).filter(Boolean)
    if (parts.length < 3) return null
    const num = (s: string | undefined) => {
      const v = (s ?? '').trim()
      return v.endsWith('%') ? (parseFloat(v) / 100) * 255 : parseFloat(v)
    }
    return {
      r: clamp255(num(parts[0])),
      g: clamp255(num(parts[1])),
      b: clamp255(num(parts[2])),
      a: parts[3] === undefined ? 1 : Math.max(0, Math.min(1, parseFloat(parts[3]))),
    }
  }
  return null
}

function toHex(c: Rgb): string {
  const h = (n: number) => clamp255(n).toString(16).padStart(2, '0')
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}

/** 输出 rgba()；alpha 为 1 时输出 hex（更短、兼容性更好）。 */
export function toCss(c: Rgb): string {
  if (c.a >= 0.999) return toHex(c)
  return `rgba(${clamp255(c.r)},${clamp255(c.g)},${clamp255(c.b)},${Number(c.a.toFixed(3))})`
}

/** 与另一种颜色混合：amount 是 other 的占比（0~1）。 */
export function mix(color: string, other: string, amount: number): string {
  const a = parseColor(color)
  const b = parseColor(other)
  if (!a || !b) return color
  const t = Math.max(0, Math.min(1, amount))
  return toCss({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t,
  })
}

/** 向白色靠拢（变浅）。 */
export function lighten(color: string, amount: number): string {
  return mix(color, '#ffffff', amount)
}

/** 向黑色靠拢（变深）。 */
export function darken(color: string, amount: number): string {
  return mix(color, '#000000', amount)
}

/** 设置透明度。 */
export function alpha(color: string, a: number): string {
  const c = parseColor(color)
  if (!c) return color
  return toCss({ ...c, a: Math.max(0, Math.min(1, a)) })
}

/** 相对亮度（0~1）。 */
export function luminance(color: string): number {
  const c = parseColor(color)
  if (!c) return 1
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
}

/** 在给定背景上应使用的文字色（黑或白）。 */
export function contrastText(background: string): string {
  return luminance(background) > 0.5 ? '#1a1a1a' : '#ffffff'
}

/** 是否偏深色。 */
export function isDark(color: string): boolean {
  return luminance(color) <= 0.5
}
