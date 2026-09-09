/**
 * 装饰类组件：divider / section-title / badge / callout / canvas / background。
 * 背景一律使用 CSS 渐变（`background-image` 实测在微信草稿 API 保留），不依赖外部图片。
 */
import { css, escapeHtml, boolProp, prop } from '../style.js'
import { resolveTone } from '../palette.js'
import { svgAnimate, svgPath, svgRoot } from '../svg.js'
import type { ComponentNode, RenderContext } from '../types.js'

/** 纯 CSS 纹理（repeat-linear-gradient，无需外部资源）。 */
function texture(name: string, tone: string): string | undefined {
  switch (name) {
    case 'grid':
      return `repeating-linear-gradient(0deg, ${tone} 0 1px, transparent 1px 22px), repeating-linear-gradient(90deg, ${tone} 0 1px, transparent 1px 22px)`
    case 'dots':
      return `radial-gradient(${tone} 1.2px, transparent 1.2px)`
    case 'lines':
      return `repeating-linear-gradient(0deg, ${tone} 0 1px, transparent 1px 8px)`
    case 'diagonal':
      return `repeating-linear-gradient(45deg, ${tone} 0 1px, transparent 1px 10px)`
    case 'paper':
      return `repeating-linear-gradient(0deg, ${tone} 0 1px, transparent 1px 28px)`
    default:
      return undefined
  }
}

/** 分割线。 */
function renderDivider(node: ComponentNode, ctx: RenderContext): string {
  const palette = ctx.palette
  const p = node.props
  const tone = resolveTone(prop(p, 'tone', 'primary'), palette)
  const style = prop(p, 'style', 'line')
  const text = prop(p, 'text')
  const margin = `18px 0`

  if (style === 'wave') {
    const svg = svgRoot({
      viewBox: '0 0 320 16',
      children: svgPath({
        d: 'M0 8 Q20 0 40 8 T80 8 T120 8 T160 8 T200 8 T240 8 T280 8 T320 8',
        stroke: tone.base,
        strokeWidth: 2,
        fill: 'none',
        strokeLinecap: 'round',
      }),
      style: { height: '16px' },
    })
    return `<div style="${css({ margin })}">${svg}</div>`
  }

  if (style === 'gradient') {
    return `<div style="${css({
      margin,
      height: '3px',
      'border-radius': '2px',
      'background-image': `linear-gradient(90deg, transparent, ${tone.base}, transparent)`,
    })}"></div>`
  }

  if (style === 'dot') {
    const dots = Array.from({ length: 3 }, () =>
      `<span style="${css({
        width: '5px',
        height: '5px',
        'border-radius': '50%',
        'background-color': tone.base,
        display: 'inline-block',
        margin: '0 4px',
        opacity: '0.7',
      })}"></span>`,
    ).join('')
    return `<div style="${css({ margin, 'text-align': 'center' })}">${dots}</div>`
  }

  if (text) {
    return `<div style="${css({
      margin,
      display: 'flex',
      'align-items': 'center',
      gap: '12px',
    })}">` +
      `<div style="${css({ flex: 1, height: '1px', 'background-color': palette.divider })}"></div>` +
      `<span style="${css({
        'font-size': '12.5px',
        color: tone.strong,
        'letter-spacing': '2px',
        'flex-shrink': 0,
      })}">${escapeHtml(text)}</span>` +
      `<div style="${css({ flex: 1, height: '1px', 'background-color': palette.divider })}"></div></div>`
  }

  return `<div style="${css({
    margin,
    height: '1px',
    'background-color': palette.divider,
  })}"></div>`
}

/** 带序号 / 副标题的章节标题。 */
function renderSectionTitle(node: ComponentNode, ctx: RenderContext): string {
  const palette = ctx.palette
  const p = node.props
  const tone = resolveTone(prop(p, 'tone', 'primary'), palette)
  const index = prop(p, 'index')
  const title = prop(p, 'title') || node.body.trim().split(/\r?\n/)[0] || ''
  const subtitle = prop(p, 'subtitle')
  const center = prop(p, 'align', 'left') === 'center'

  const indexHtml = index
    ? `<div style="${css({
        'font-size': '30px',
        'font-weight': '800',
        color: tone.base,
        'line-height': '1',
        opacity: '0.28',
        'font-family': 'Georgia, "Times New Roman", serif',
        'margin-bottom': '-6px',
      })}">${escapeHtml(index)}</div>`
    : ''

  const titleHtml = `<div style="${css({
    'font-size': '19px',
    'font-weight': '700',
    color: palette.text,
    'line-height': '1.4',
    'letter-spacing': '0.5px',
  })}">${escapeHtml(title)}</div>`

  const underline = `<div style="${css({
    width: '36px',
    height: '3px',
    'border-radius': '2px',
    'background-image': `linear-gradient(90deg, ${tone.base}, ${tone.soft})`,
    margin: center ? '9px auto 0' : '9px 0 0',
  })}"></div>`

  const subtitleHtml = subtitle
    ? `<div style="${css({
        'font-size': '12.5px',
        color: palette.weak,
        'letter-spacing': '1.5px',
        'margin-top': '8px',
      })}">${escapeHtml(subtitle)}</div>`
    : ''

  return `<div style="${css({
    margin: `26px 0 14px`,
    'text-align': center ? 'center' : 'left',
  })}">${indexHtml}${titleHtml}${underline}${subtitleHtml}</div>`
}

/** 标签 / 徽章。 */
function renderBadge(node: ComponentNode, ctx: RenderContext): string {
  const palette = ctx.palette
  const p = node.props
  const tone = resolveTone(prop(p, 'tone', 'primary'), palette)
  const text = prop(p, 'text') || node.body.trim()
  const outline = boolProp(p, 'outline', false)
  const block = boolProp(p, 'block', false)

  const style = css({
    display: block ? 'block' : 'inline-block',
    'font-size': prop(p, 'size', '12.5px'),
    'font-weight': '600',
    'line-height': '1.5',
    padding: '3px 10px',
    'border-radius': '999px',
    'background-color': outline ? 'transparent' : tone.base,
    color: outline ? tone.strong : tone.onBase,
    border: outline ? `1px solid ${tone.base}` : undefined,
    margin: block ? `0 0 ${palette.blockGap}` : '0 4px 4px 0',
    'text-align': 'center',
  })

  return `<span style="${style}">${escapeHtml(text)}</span>`
}

const CALLOUT_ICONS: Record<string, string> = {
  info: 'i',
  tip: '✓',
  important: '!',
  warning: '!',
  danger: '×',
  success: '✓',
  note: '✎',
  primary: '★',
  neutral: '·',
}

/** 提示框（兼容旧 `:::warning 标题` 写法）。 */
function renderCallout(node: ComponentNode, ctx: RenderContext): string {
  const palette = ctx.palette
  const p = node.props
  const type = prop(p, 'type', node.name === 'callout' ? 'info' : node.name)
  const tone = resolveTone(type, palette)
  const title = prop(p, 'title', type)
  const icon = prop(p, 'icon', CALLOUT_ICONS[type] ?? 'i')

  return `<div style="${css({
    margin: `0 0 ${palette.blockGap}`,
    'background-color': tone.soft,
    'border-left': `4px solid ${tone.base}`,
    'border-radius': palette.radiusSm,
    padding: '12px 16px',
  })}">` +
    `<div style="${css({
      display: 'flex',
      'align-items': 'center',
      gap: '7px',
      'font-weight': '600',
      'font-size': '14px',
      color: tone.strong,
      'margin-bottom': '6px',
    })}">` +
    `<span style="${css({
      width: '16px',
      height: '16px',
      'border-radius': '50%',
      'background-color': tone.base,
      color: tone.onBase,
      'font-size': '11px',
      'line-height': '16px',
      'text-align': 'center',
      'flex-shrink': 0,
    })}">${escapeHtml(icon)}</span>` +
    `<span>${escapeHtml(title)}</span></div>` +
    `<div style="${css({ 'font-size': '13.5px', color: palette.text, 'line-height': '1.75' })}">${ctx.renderChildren(
      node,
    )}</div></div>`
}

/** 整篇画布：给全文一个统一的背景与内边距。 */
function renderCanvas(node: ComponentNode, ctx: RenderContext): string {
  const palette = ctx.palette
  const p = node.props
  const kind = prop(p, 'tone', 'paper')
  const padding = prop(p, 'padding', '16px')
  const radius = prop(p, 'radius', palette.radiusLg)
  const bg = prop(p, 'bg')

  let backgroundImage: string | undefined
  let backgroundColor = bg ?? palette.canvasBg

  if (!bg) {
    if (kind === 'gradient') {
      backgroundImage = `linear-gradient(160deg, ${palette.primarySoft}, #ffffff 55%, ${palette.primarySoft})`
      backgroundColor = '#ffffff'
    } else if (kind === 'night') {
      backgroundColor = '#22262b'
      backgroundImage = texture('grid', 'rgba(255,255,255,0.05)')
    } else {
      backgroundImage = texture(kind, kind === 'night' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)')
    }
  }

  const dark = kind === 'night'
  const inner = ctx.renderChildren(node)

  return `<div style="${css({
    'background-color': backgroundColor,
    'background-image': backgroundImage,
    'background-size': kind === 'dots' ? '14px 14px' : undefined,
    'border-radius': radius,
    padding,
    border: dark ? undefined : `1px solid ${palette.divider}`,
    color: dark ? '#e8eaed' : palette.text,
  })}">${inner}</div>`
}

/** 局部背景块。 */
function renderBackground(node: ComponentNode, ctx: RenderContext): string {
  const palette = ctx.palette
  const p = node.props
  const tone = resolveTone(prop(p, 'tone', 'primary'), palette)
  const kind = prop(p, 'variant', 'soft')
  const padding = prop(p, 'padding', '14px 16px')

  let style
  if (kind === 'gradient') {
    style = css({
      'background-image': `linear-gradient(135deg, ${tone.soft}, #ffffff)`,
      'background-color': '#ffffff',
    })
  } else if (kind === 'solid') {
    style = css({ 'background-color': tone.base, color: tone.onBase })
  } else if (kind === 'outline') {
    style = css({ 'background-color': 'transparent', border: `1px solid ${tone.base}` })
  } else {
    style = css({ 'background-color': tone.soft })
  }

  return `<div style="${css({
    margin: `0 0 ${palette.blockGap}`,
    'border-radius': palette.radius,
    padding,
  })};${style}">${ctx.renderChildren(node)}</div>`
}

/** 自动描边动画（下划线 / 对勾 / 波浪），用于强调。 */
function renderDraw(node: ComponentNode, ctx: RenderContext): string {
  const palette = ctx.palette
  const p = node.props
  const tone = resolveTone(prop(p, 'tone', 'primary'), palette)
  const kind = prop(p, 'shape', 'underline')
  const duration = prop(p, 'duration', '1.6s')
  const loop = boolProp(p, 'loop', false)
  const text = prop(p, 'text') || node.body.trim()

  const paths: Record<string, string> = {
    underline: 'M4 18 C 60 8, 140 26, 216 12',
    wave: 'M4 14 Q28 2 52 14 T100 14 T148 14 T196 14 T244 14 T292 14',
    check: 'M12 26 L26 40 L56 8',
    circle: 'M60 8 A 34 34 0 1 1 59.9 8',
  }
  const d = paths[kind] ?? paths['underline'] ?? 'M4 18 C 60 8, 140 26, 216 12'
  const length = Math.round(measurePath(d))

  const svg = svgRoot({
    viewBox: kind === 'check' ? '0 0 68 48' : kind === 'circle' ? '0 0 120 120' : '0 0 320 36',
    children:
      svgPath({
        d,
        stroke: tone.base,
        strokeWidth: kind === 'circle' ? 6 : 4,
        fill: 'none',
        strokeLinecap: 'round',
        strokeDasharray: `${length}`,
        strokeDashoffset: loop ? undefined : 0,
        children: svgAnimate({
          attributeName: 'stroke-dashoffset',
          from: String(length),
          to: '0',
          dur: duration,
          repeatCount: loop ? 'indefinite' : '1',
          fill: loop ? undefined : 'freeze',
        }),
      }),
    style: { height: kind === 'check' ? '48px' : kind === 'circle' ? '120px' : '36px' },
  })

  const caption = text
    ? `<div style="${css({
        'font-size': '13px',
        color: palette.muted,
        'text-align': 'center',
        'margin-top': '2px',
      })}">${escapeHtml(text)}</div>`
    : ''

  return `<div style="${css({ margin: `0 0 ${palette.blockGap}` })}">${svg}${caption}</div>`
}

/** 粗略估算路径长度，用于描边动画的 dasharray。 */
function measurePath(d: string): number {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  let len = 0
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const dx = (nums[i + 2] ?? nums[i] ?? 0) - (nums[i] ?? 0)
    const dy = (nums[i + 3] ?? nums[i + 1] ?? 0) - (nums[i + 1] ?? 0)
    len += Math.hypot(dx, dy)
  }
  return Math.max(40, len)
}

export const decorComponents: Record<string, (node: ComponentNode, ctx: RenderContext) => string> = {
  divider: renderDivider,
  'section-title': renderSectionTitle,
  badge: renderBadge,
  callout: renderCallout,
  canvas: renderCanvas,
  background: renderBackground,
  draw: renderDraw,
  // 旧语法别名：:::info / :::tip / :::warning …
  info: renderCallout,
  tip: renderCallout,
  important: renderCallout,
  warning: renderCallout,
  danger: renderCallout,
  success: renderCallout,
  note: renderCallout,
}
