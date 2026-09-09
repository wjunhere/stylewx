/**
 * 由主题 tokens 派生出组件配色。
 * 所有组件颜色都来自主题，因此同一篇文章里 Markdown 排版与富组件视觉是一套系统。
 */
import type { ComponentPalette } from './types.js'
import { alpha, contrastText, darken, lighten, mix } from './color.js'

/** 主题 token 中与组件相关的字段（新增字段全部可选，保证老主题继续可用）。 */
export interface PaletteTokens {
  primaryColor: string
  textColor: string
  fontSize: string
  lineHeight: number | string
  fontFamily: string
  spacing: { block: string }
  /** 以下为可选扩展 token，不填则自动派生。 */
  accentColor?: string
  mutedColor?: string
  cardBg?: string
  cardBorderColor?: string
  dividerColor?: string
  canvasBg?: string
  radius?: string
}

/** 解析 `12px` → 12；失败返回 fallback。 */
function px(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const m = /^(-?\d+(?:\.\d+)?)(px|pt|em|rem)?$/.exec(value.trim())
  if (!m) return fallback
  const n = Number(m[1])
  return Number.isFinite(n) ? n : fallback
}

export function buildPalette(tokens: PaletteTokens): ComponentPalette {
  const primary = tokens.primaryColor
  const text = tokens.textColor
  const radius = px(tokens.radius, 12)

  return {
    primary,
    primarySoft: tokens.accentColor ? tokens.accentColor : lighten(primary, 0.88),
    primaryStrong: darken(primary, 0.18),
    onPrimary: contrastText(primary),
    text,
    muted: tokens.mutedColor ?? mix(text, '#ffffff', 0.4),
    weak: mix(text, '#ffffff', 0.62),
    cardBg: tokens.cardBg ?? lighten(primary, 0.95),
    cardBorder: tokens.cardBorderColor ?? lighten(primary, 0.78),
    divider: tokens.dividerColor ?? mix(text, '#ffffff', 0.86),
    canvasBg: tokens.canvasBg ?? '#f7f8fa',
    fontFamily: tokens.fontFamily,
    fontSize: tokens.fontSize,
    lineHeight: String(tokens.lineHeight),
    blockGap: tokens.spacing.block,
    radiusSm: `${Math.max(2, Math.round(radius * 0.5))}px`,
    radius: `${Math.round(radius)}px`,
    radiusLg: `${Math.round(radius * 1.6)}px`,
  }
}

/** 语义色板：tone 参数可选值 → 主色 / 浅底 / 深字。 */
export interface Tone {
  base: string
  soft: string
  strong: string
  onBase: string
}

export const TONES = ['primary', 'success', 'warning', 'danger', 'info', 'neutral', 'dark'] as const
export type ToneName = (typeof TONES)[number]

export function resolveTone(name: string | undefined, palette: ComponentPalette): Tone {
  const key = (name ?? 'primary').toLowerCase() as ToneName
  const map: Record<ToneName, string> = {
    primary: palette.primary,
    success: '#1f9d55',
    warning: '#d9820b',
    danger: '#e04b4b',
    info: '#2f7fd1',
    neutral: '#6b7280',
    dark: '#2b2f36',
  }
  const base = map[key] ?? palette.primary
  return {
    base,
    soft: lighten(base, 0.9),
    strong: darken(base, 0.22),
    onBase: contrastText(base),
  }
}

/** 半透明遮罩（用于图片上的文字层）。 */
export function scrim(color = '#000000', amount = 0.45): string {
  return alpha(color, amount)
}
