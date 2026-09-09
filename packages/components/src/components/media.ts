/**
 * 图片类组件：image / gallery / image-card / carousel。
 * 图片 URL 保持原样输出，发布时由 publisher 统一搬运到微信素材库。
 */
import { escapeAttr, escapeHtml, css, prop, boolProp, numProp } from '../style.js'
import { scrim } from '../palette.js'
import { svgAnimate, svgRoot } from '../svg.js'
import { truncateEm } from '../text.js'
import type { ComponentNode, RenderContext } from '../types.js'

export interface ImageItem {
  src: string
  alt: string
  caption: string
}

const IMAGE_RE = /!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+["']([^"']*)["'])?\s*\)/g

/** 从 Markdown 文本中提取图片列表。 */
export function parseImages(markdown: string): ImageItem[] {
  const items: ImageItem[] = []
  IMAGE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = IMAGE_RE.exec(markdown)) !== null) {
    items.push({
      src: m[2] as string,
      alt: m[1] ?? '',
      caption: m[3] ?? '',
    })
  }
  return items
}

/** 正文里没有图片时，把组件正文按 Markdown 渲染，避免内容丢失。 */
function fallback(node: ComponentNode, ctx: RenderContext): string {
  return ctx.renderChildren(node)
}

/** 单图 + 图注。 */
function renderImage(node: ComponentNode, ctx: RenderContext): string {
  const p = node.props
  const src = prop(p, 'src') || parseImages(node.body)[0]?.src || ''
  if (!src) return fallback(node, ctx)

  const palette = ctx.palette
  const caption = prop(p, 'caption') || parseImages(node.body)[0]?.caption || ''
  const alt = prop(p, 'alt', caption)
  const rounded = boolProp(p, 'rounded', true)
  const shadow = boolProp(p, 'shadow', false)
  const href = prop(p, 'href')
  const barTone = prop(p, 'tone', 'primary')
  const width = prop(p, 'width', 'full')
  const overlay = prop(p, 'caption-position', prop(p, 'position', 'bar')) === 'overlay'

  const imgStyle = css({
    width: '100%',
    display: 'block',
    'border-radius': rounded ? palette.radius : '0',
    'box-shadow': shadow ? `0 8px 24px ${scrim(palette.primary, 0.18)}` : undefined,
    'object-fit': prop(p, 'fit', 'cover') || undefined,
  })

  const img = `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" style="${imgStyle}"/>`
  const linked = href ? `<a href="${escapeAttr(href)}">${img}</a>` : img

  const captionHtml = caption
    ? overlay
      ? `<div style="${css({
          'background-color': barTone === 'dark' ? '#22262b' : palette.cardBg,
          color: barTone === 'dark' ? '#ffffff' : palette.muted,
          'font-size': '12.5px',
          'line-height': '1.6',
          padding: '7px 12px',
          'border-radius': `0 0 ${palette.radius} ${palette.radius}`,
        })}">${escapeHtml(caption)}</div>`
      : `<div style="${css({
          'font-size': '12.5px',
          color: palette.weak,
          'text-align': 'center',
          'line-height': '1.6',
          'margin-top': '7px',
        })}">${escapeHtml(caption)}</div>`
    : ''

  const outerStyle = css({
    margin: `0 0 ${palette.blockGap}`,
    width: width === 'full' ? undefined : width === 'inset' ? '86%' : width,
    'margin-left': width === 'inset' ? 'auto' : undefined,
    'margin-right': width === 'inset' ? 'auto' : undefined,
    overflow: overlay ? 'hidden' : undefined,
    'border-radius': overlay && rounded ? palette.radius : undefined,
  })

  return `<div style="${outerStyle}">${linked}${captionHtml}</div>`
}

/** 多图网格。 */
function renderGallery(node: ComponentNode, ctx: RenderContext): string {
  const images = parseImages(node.body)
  if (images.length === 0) return fallback(node, ctx)

  const palette = ctx.palette
  const p = node.props
  const cols = Math.max(1, Math.min(4, numProp(p, 'cols', images.length >= 3 ? 3 : 2)))
  const gap = prop(p, 'gap', '2%')
  const caption = prop(p, 'caption')
  const showCaption = boolProp(p, 'show-caption', true)
  const itemWidth = `${(100 - 2 * (cols - 1)) / cols}%`

  const items = images
    .map((img) => {
      const cap = showCaption && (img.caption || img.alt)
        ? `<div style="${css({
            'font-size': '11.5px',
            color: palette.weak,
            'text-align': 'center',
            'line-height': '1.5',
            'margin-top': '4px',
          })}">${escapeHtml(truncateEm(img.caption || img.alt, cols >= 3 ? 8 : 14))}</div>`
        : ''
      return (
        `<div style="${css({ width: itemWidth })}">` +
        `<img src="${escapeAttr(img.src)}" alt="${escapeAttr(img.alt)}" style="${css({
          width: '100%',
          display: 'block',
          'border-radius': palette.radiusSm,
          'object-fit': 'cover',
        })}"/>${cap}</div>`
      )
    })
    .join('')

  const wrapper = `<div style="${css({ display: 'flex', 'flex-wrap': 'wrap', gap })}">${items}</div>`
  const captionHtml = caption
    ? `<div style="${css({
        'font-size': '12.5px',
        color: palette.weak,
        'text-align': 'center',
        'margin-top': '8px',
      })}">${escapeHtml(caption)}</div>`
    : ''

  return `<div style="${css({ margin: `0 0 ${palette.blockGap}` })}">${wrapper}${captionHtml}</div>`
}

/** 图文卡片（左图右文 / 上图下文）。 */
function renderImageCard(node: ComponentNode, ctx: RenderContext): string {
  const p = node.props
  const image = parseImages(node.body)[0]
  const src = prop(p, 'src') || image?.src || ''
  if (!src) return fallback(node, ctx)

  const palette = ctx.palette
  const layout = prop(p, 'layout', 'left')
  const title = prop(p, 'title')
  const desc = prop(p, 'desc') || prop(p, 'description')
  const href = prop(p, 'href')
  const isLeft = layout !== 'top'

  const imgStyle = css({
    width: isLeft ? '38%' : '100%',
    height: isLeft ? '100%' : 'auto',
    'min-height': isLeft ? '92px' : undefined,
    display: 'block',
    'object-fit': 'cover',
    'border-radius': isLeft ? `${palette.radius} 0 0 ${palette.radius}` : `${palette.radius} ${palette.radius} 0 0`,
    'flex-shrink': 0,
  })

  const textStyle = css({
    flex: 1,
    padding: isLeft ? '12px 14px' : '12px 14px 14px',
    'min-width': 0,
  })

  const body = [
    title
      ? `<div style="${css({
          'font-size': '15px',
          'font-weight': '600',
          color: palette.text,
          'line-height': '1.4',
          'margin-bottom': desc ? '6px' : '0',
        })}">${escapeHtml(title)}</div>`
      : '',
    desc
      ? `<div style="${css({
          'font-size': '13px',
          color: palette.muted,
          'line-height': '1.65',
        })}">${escapeHtml(desc)}</div>`
      : '',
  ].join('')

  const inner =
    `<div style="${css({
      display: 'flex',
      'flex-direction': isLeft ? 'row' : 'column',
      'align-items': isLeft ? 'stretch' : undefined,
      'background-color': palette.cardBg,
      'border': `1px solid ${palette.cardBorder}`,
      'border-radius': palette.radius,
      overflow: 'hidden',
    })}">` +
    `<img src="${escapeAttr(src)}" alt="${escapeAttr(image?.alt ?? title)}" style="${imgStyle}"/>` +
    `<div style="${textStyle}">${body}</div></div>`

  const content = href ? `<a href="${escapeAttr(href)}" style="text-decoration:none">${inner}</a>` : inner
  return `<div style="${css({ margin: `0 0 ${palette.blockGap}` })}">${content}</div>`
}

/**
 * 自动轮播：SVG `<image>` 叠加 + 错峰 opacity 动画。
 * 微信会剥离 id/position，因此这里完全依赖 SVG 的绘制顺序与 SMIL。
 */
function renderCarousel(node: ComponentNode, ctx: RenderContext): string {
  const images = parseImages(node.body)
  if (images.length === 0) return fallback(node, ctx)

  const palette = ctx.palette
  const p = node.props
  const height = Math.max(80, numProp(p, 'height', 200))
  const interval = Math.max(1.5, numProp(p, 'interval', 3))
  const count = images.length
  const dur = `${(interval * count).toFixed(2)}s`
  const step = 1 / count
  const fade = Math.min(0.08, step / 4)

  const frames = images
    .map((img, i) => {
      const start = i * step
      const end = (i + 1) * step
      const values: number[] = []
      const times: number[] = []
      // 每帧在 [start, end) 内可见，其余时间淡出
      times.push(0, Math.max(0, start - fade), start, Math.max(start, end - fade), Math.min(1, end), 1)
      values.push(i === 0 ? 1 : 0, i === 0 ? 1 : 0, 1, 1, 0, 0)
      // 简化：第一帧在开头可见，其余帧只在自己时段可见
      const keyTimes = [0, start > 0 ? start - fade : 0, start, Math.max(start, end - fade), end, 1]
      const normalized = keyTimes.map((t) => Number(Math.max(0, Math.min(1, t)).toFixed(4)))
      // 保证严格递增
      for (let k = 1; k < normalized.length; k += 1) {
        if ((normalized[k] as number) <= (normalized[k - 1] as number)) {
          normalized[k] = Math.min(1, (normalized[k - 1] as number) + 0.0001)
        }
      }
      return (
        `<image href="${escapeAttr(img.src)}" x="0" y="0" width="320" height="${height}"` +
        ` preserveAspectRatio="xMidYMid slice">` +
        svgAnimate({
          attributeName: 'opacity',
          values: values.join(';'),
          keyTimes: normalized.join(';'),
          dur,
          repeatCount: 'indefinite',
        }) +
        `</image>`
      )
    })
    .join('')

  // 底部指示点：依次高亮
  const dots = images
    .map((_, i) => {
      const start = i * step
      const end = (i + 1) * step
      const times = [0, start, Math.max(start, end - 0.001), Math.min(1, end), 1]
        .map((t) => Number(Math.max(0, Math.min(1, t)).toFixed(4)))
      for (let k = 1; k < times.length; k += 1) {
        if ((times[k] as number) <= (times[k - 1] as number)) times[k] = Math.min(1, (times[k - 1] as number) + 0.0001)
      }
      return (
        `<circle cx="${160 - (count - 1) * 7 + i * 14}" cy="${height - 14}" r="3.5" fill="#ffffff" opacity="0.5">` +
        svgAnimate({
          attributeName: 'opacity',
          values: '0.5;0.5;1;1;0.5',
          keyTimes: times.join(';'),
          dur,
          repeatCount: 'indefinite',
        }) +
        `</circle>`
      )
    })
    .join('')

  const overlay = `<rect x="0" y="${height - 34}" width="320" height="34" fill="${scrim('#000000', 0.28)}"/>`
  const caption = prop(p, 'caption')
  const captionHtml = caption
    ? `<div style="${css({
        'font-size': '12.5px',
        color: palette.weak,
        'text-align': 'center',
        'margin-top': '7px',
      })}">${escapeHtml(caption)}</div>`
    : ''

  const svg = svgRoot({
    viewBox: `0 0 320 ${height}`,
    children: frames + overlay + dots,
    style: { 'border-radius': palette.radius, overflow: 'hidden' },
  })

  return `<div style="${css({ margin: `0 0 ${palette.blockGap}` })}">${svg}${captionHtml}</div>`
}

export const mediaComponents: Record<string, (node: ComponentNode, ctx: RenderContext) => string> = {
  image: renderImage,
  gallery: renderGallery,
  'image-card': renderImageCard,
  carousel: renderCarousel,
}
