/**
 * 交互类组件：reveal / progress / pulse。
 *
 * 微信正文禁止 JS，且实测 `<details>` 会被剥离、`position` 会被过滤，
 * 因此这里全部用内联 SVG + SMIL（真实 draft/add → draft/get 验证保留）实现。
 */
import { css, escapeHtml, boolProp, numProp, prop } from '../style.js'
import { resolveTone } from '../palette.js'
import { svgAnimate, svgCircle, svgRect, svgRoot, svgText } from '../svg.js'
import { wrapText } from '../text.js'
import type { ComponentNode, RenderContext } from '../types.js'

/** 点击展开：SVG 卡片，点击后答案淡入、按钮淡出（单向）。 */
function renderReveal(node: ComponentNode, ctx: RenderContext): string {
  const palette = ctx.palette
  const p = node.props
  const tone = resolveTone(prop(p, 'tone', 'primary'), palette)
  const label = prop(p, 'label', '点击查看答案')
  const answer = prop(p, 'answer') || node.body.trim()
  const width = 320
  const fontSize = numProp(p, 'font-size', 14)
  const lineHeight = Math.round(fontSize * 1.6)
  const padX = 16
  const btnH = 44
  const maxEm = (width - padX * 2) / fontSize
  const lines = wrapText(answer, maxEm)
  const answerH = lines.length * lineHeight
  const height = 12 + btnH + 10 + answerH + 14

  const btn = svgRect({
    x: padX,
    y: 12,
    width: width - padX * 2,
    height: btnH,
    rx: 10,
    fill: tone.base,
    children:
      svgAnimate({
        attributeName: 'opacity',
        from: '1',
        to: '0',
        begin: 'click',
        dur: '0.35s',
        fill: 'freeze',
      }),
  })

  const btnText = svgText({
    x: width / 2,
    y: 12 + btnH / 2 + 5,
    text: escapeHtml(label),
    size: 14,
    fill: tone.onBase,
    anchor: 'middle',
    weight: 600,
    children: svgAnimate({
      attributeName: 'opacity',
      from: '1',
      to: '0',
      begin: 'click',
      dur: '0.35s',
      fill: 'freeze',
    }),
  })

  const answerGroup =
    `<g opacity="0">` +
    svgAnimate({
      attributeName: 'opacity',
      from: '0',
      to: '1',
      begin: 'click',
      dur: '0.45s',
      fill: 'freeze',
    }) +
    svgRect({
      x: padX,
      y: 12 + btnH + 10,
      width: width - padX * 2,
      height: answerH + 8,
      rx: 10,
      fill: tone.soft,
    }) +
    lines
      .map((line, i) =>
        svgText({
          x: padX + 12,
          y: 12 + btnH + 10 + 12 + i * lineHeight + fontSize * 0.85,
          text: escapeHtml(line),
          size: fontSize,
          fill: palette.text,
          family: palette.fontFamily,
        }),
      )
      .join('') +
    `</g>`

  const svg = svgRoot({
    viewBox: `0 0 ${width} ${height}`,
    children: btn + btnText + answerGroup,
  })

  const caption = prop(p, 'caption')
  const captionHtml = caption
    ? `<div style="${css({
        'font-size': '12px',
        color: palette.weak,
        'text-align': 'center',
        'margin-top': '5px',
      })}">${escapeHtml(caption)}</div>`
    : ''

  return `<div style="${css({ margin: `0 0 ${palette.blockGap}` })}">${svg}${captionHtml}</div>`
}

/** 进度条：进入文章后自动从左向右生长。 */
function renderProgress(node: ComponentNode, ctx: RenderContext): string {
  const palette = ctx.palette
  const p = node.props
  const tone = resolveTone(prop(p, 'tone', 'primary'), palette)
  const value = Math.max(0, Math.min(100, numProp(p, 'value', 60)))
  const label = prop(p, 'label')
  const height = Math.max(6, numProp(p, 'height', 10))
  const showValue = boolProp(p, 'show-value', true)
  const width = 320
  const barWidth = (value / 100) * (width - 4)

  const svg = svgRoot({
    viewBox: `0 0 ${width} ${height + 4}`,
    children:
      svgRect({ x: 0, y: 2, width, height, rx: height / 2, fill: palette.divider }) +
      svgRect({
        x: 0,
        y: 2,
        width: 0,
        height,
        rx: height / 2,
        fill: tone.base,
        children: svgAnimate({
          attributeName: 'width',
          from: '0',
          to: String(barWidth),
          dur: prop(p, 'duration', '1.4s'),
          begin: '0s',
          fill: 'freeze',
        }),
      }),
  })

  const head = label || showValue
    ? `<div style="${css({
        display: 'flex',
        'justify-content': 'space-between',
        'align-items': 'baseline',
        'font-size': '13px',
        'margin-bottom': '7px',
      })}">` +
      `<span style="${css({ color: palette.text, 'font-weight': '600' })}">${escapeHtml(label)}</span>` +
      `<span style="${css({ color: tone.strong, 'font-weight': '700' })}">${value}%</span></div>`
    : ''

  return `<div style="${css({ margin: `0 0 ${palette.blockGap}` })}">${head}${svg}</div>`
}

/** 呼吸 / 脉冲强调。 */
function renderPulse(node: ComponentNode, ctx: RenderContext): string {
  const palette = ctx.palette
  const p = node.props
  const tone = resolveTone(prop(p, 'tone', 'danger'), palette)
  const text = prop(p, 'text') || node.body.trim()
  const dot = prop(p, 'dot', 'true') !== 'false'

  const svg = svgRoot({
    viewBox: '0 0 24 24',
    children: svgCircle({
      cx: 12,
      cy: 12,
      r: 6,
      fill: tone.base,
      children:
        svgAnimate({
          attributeName: 'r',
          values: '5;9;5',
          dur: '1.6s',
          repeatCount: 'indefinite',
        }) +
        svgAnimate({
          attributeName: 'opacity',
          values: '1;0.2;1',
          dur: '1.6s',
          repeatCount: 'indefinite',
        }),
    }),
    style: { width: '13px', height: '13px', 'flex-shrink': 0 },
  })

  return `<div style="${css({
    margin: `0 0 ${palette.blockGap}`,
    display: 'flex',
    'align-items': 'center',
    gap: '8px',
    'background-color': tone.soft,
    'border-radius': palette.radiusSm,
    padding: '9px 13px',
  })}">${dot ? svg : ''}<span style="${css({
    'font-size': '13.5px',
    'font-weight': '600',
    color: tone.strong,
  })}">${escapeHtml(text)}</span></div>`
}

export const interactiveComponents: Record<string, (node: ComponentNode, ctx: RenderContext) => string> = {
  reveal: renderReveal,
  progress: renderProgress,
  pulse: renderPulse,
}
