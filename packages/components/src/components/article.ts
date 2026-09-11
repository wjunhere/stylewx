/**
 * 文章级组件：cover（封面头图）/ end-card（结尾卡片）。
 */
import { css, escapeHtml, prop } from '../style.js'
import { resolveTone, scrim } from '../palette.js'
import { svgAnimate, svgRect, svgRoot, svgText } from '../svg.js'
import { truncateEm, wrapText } from '../text.js'
import type { ComponentNode, RenderContext } from '../types.js'

/** 封面：有图时用 SVG 图 + 文字叠层，无图时用主题渐变。 */
function renderCover(node: ComponentNode, ctx: RenderContext): string {
  const palette = ctx.palette
  const p = node.props
  const tone = resolveTone(prop(p, 'tone', 'primary'), palette)
  const title = prop(p, 'title') || node.body.trim().split(/\r?\n/)[0] || ''
  const subtitle = prop(p, 'subtitle')
  const author = prop(p, 'author')
  const date = prop(p, 'date')
  const image = prop(p, 'image') || prop(p, 'src')
  const height = Number(prop(p, 'height', '220')) || 220
  const width = 320

  const titleLines = wrapText(title, 13)
  const meta = [author, date].filter(Boolean).join('  ·  ')
  const titleSize = titleLines.length > 1 ? 20 : 23
  const lineHeight = Math.round(titleSize * 1.35)
  const blockH = titleLines.length * lineHeight + (subtitle ? 24 : 0) + (meta ? 24 : 0)
  const startY = Math.max(46, (height - blockH) / 2 + titleSize)

  const background = image
    ? `<image href="${escapeHtml(image)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"></image>` +
      svgRect({ x: 0, y: 0, width, height, fill: scrim('#000000', 0.42) })
    : svgRect({ x: 0, y: 0, width, height, fill: tone.base }) +
      svgRect({ x: 0, y: 0, width, height: 4, fill: tone.strong }) +
      svgRect({
        x: 0,
        y: 0,
        width,
        height,
        fill: 'none',
      })

  const textColor = image ? '#ffffff' : tone.onBase

  const titleNodes = titleLines
    .map((line, i) =>
      svgText({
        x: width / 2,
        y: startY + i * lineHeight,
        text: escapeHtml(truncateEm(line, 15)),
        size: titleSize,
        fill: textColor,
        anchor: 'middle',
        weight: 700,
        family: palette.fontFamily,
        children: svgAnimate({
          attributeName: 'opacity',
          from: '0',
          to: '1',
          dur: '0.8s',
          begin: '0s',
          fill: 'freeze',
        }),
      }),
    )
    .join('')

  const afterTitle = startY + titleLines.length * lineHeight
  const subtitleNode = subtitle
    ? svgText({
        x: width / 2,
        y: afterTitle - 2,
        text: escapeHtml(truncateEm(subtitle, 22)),
        size: 13,
        fill: textColor,
        anchor: 'middle',
        opacity: 0.85,
        family: palette.fontFamily,
      })
    : ''
  const metaNode = meta
    ? svgText({
        x: width / 2,
        y: afterTitle + (subtitle ? 22 : 0),
        text: escapeHtml(meta),
        size: 11.5,
        fill: textColor,
        anchor: 'middle',
        opacity: 0.72,
        family: palette.fontFamily,
      })
    : ''

  const svg = svgRoot({
    viewBox: `0 0 ${width} ${height}`,
    children: background + titleNodes + subtitleNode + metaNode,
    style: { 'border-radius': palette.radiusLg, overflow: 'hidden' },
  })

  return `<div style="${css({ margin: `0 0 ${palette.blockGap}` })}">${svg}</div>`
}

/** 结尾卡片：署名 / 关注引导 / 下期预告。 */
function renderEndCard(node: ComponentNode, ctx: RenderContext): string {
  const palette = ctx.palette
  const p = node.props
  const tone = resolveTone(prop(p, 'tone', 'primary'), palette)
  const title = prop(p, 'title', node.name === 'follow' ? '关注我们' : '感谢阅读')
  const text = prop(p, 'text')
  const hasText = Boolean(text) || Boolean(node.body.trim())
  const footer = prop(p, 'footer')

  const dots = ['', '', '']
    .map(
      () =>
        `<span style="${css({
          width: '5px',
          height: '5px',
          'border-radius': '50%',
          'background-color': tone.base,
          display: 'inline-block',
          margin: '0 3px',
          opacity: '0.55',
        })}"></span>`,
    )
    .join('')

  return `<div style="${css({
    margin: `26px 0 0`,
    'background-image': `linear-gradient(160deg, ${tone.soft}, #ffffff)`,
    'background-color': '#ffffff',
    border: `1px solid ${tone.soft}`,
    'border-radius': palette.radiusLg,
    padding: '22px 18px',
    'text-align': 'center',
  })}">` +
    `<div style="${css({ 'margin-bottom': '12px' })}">${dots}</div>` +
    `<div${ctx.slot('title')} style="${css({
      'font-size': '17px',
      'font-weight': '700',
      color: tone.strong,
      'letter-spacing': '1px',
      'margin-bottom': hasText ? '10px' : '0',
    })}">${escapeHtml(title)}</div>` +
    (hasText
      ? `<div style="${css({
          'font-size': '13.5px',
          color: palette.muted,
          'line-height': '1.85',
        })}"><span data-swx-body="1"${ctx.slot('text')}>${text ? ctx.renderMarkdown(text) : ctx.renderChildren(node)}</span></div>`
      : '') +
    (footer
      ? `<div${ctx.slot('footer')} style="${css({
          'font-size': '12px',
          color: palette.weak,
          'margin-top': '14px',
          'letter-spacing': '1px',
        })}">${escapeHtml(footer)}</div>`
      : '') +
    `</div>`
}

export const articleComponents: Record<string, (node: ComponentNode, ctx: RenderContext) => string> = {
  cover: renderCover,
  'end-card': renderEndCard,
  follow: renderEndCard,
}
