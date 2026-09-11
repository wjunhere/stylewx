/**
 * 结构类组件：card / timeline / steps / compare / quote / toc。
 */
import { css, escapeAttr, escapeHtml, boolProp, prop } from '../style.js'
import { resolveTone } from '../palette.js'
import type { ComponentNode, RenderContext } from '../types.js'

interface Row {
  label: string
  text: string
}

/** 从列表式正文里解析 `标签 | 内容` 行。 */
function parseRows(body: string): Row[] {
  const rows: Row[] = []
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = /^(?:[-*+]|\d+[.)])\s*(.+)$/.exec(line)
    const content = m ? (m[1] as string) : line
    const parts = content.split('|')
    if (parts.length >= 2) {
      rows.push({ label: (parts[0] ?? '').trim(), text: parts.slice(1).join('|').trim() })
    } else {
      rows.push({ label: '', text: content.trim() })
    }
  }
  return rows
}

/** 卡片容器：标题 + 内容。 */
function renderCard(node: ComponentNode, ctx: RenderContext): string {
  const palette = ctx.palette
  const p = node.props
  const tone = resolveTone(prop(p, 'tone', 'primary'), palette)
  const title = prop(p, 'title')
  const icon = prop(p, 'icon')
  const footer = prop(p, 'footer')
  const variant = prop(p, 'variant', 'soft')

  const header = title
    ? `<div${ctx.slot('title')} style="${css({
        display: 'flex',
        'align-items': 'center',
        gap: '7px',
        'font-size': '15px',
        'font-weight': '600',
        color: tone.strong,
        'padding-bottom': '9px',
        'border-bottom': `1px dashed ${tone.soft}`,
        'margin-bottom': '11px',
      })}">${
        icon
          ? `<span${ctx.slot('titleIcon')} style="${css({ 'font-size': '16px', 'line-height': '1' })}">${escapeHtml(icon)}</span>`
          : `<span style="${css({
              width: '4px',
              height: '15px',
              'border-radius': '2px',
              'background-color': tone.base,
              display: 'inline-block',
              'flex-shrink': 0,
            })}"></span>`
      }<span>${escapeHtml(title)}</span></div>`
    : ''

  const inner = ctx.renderChildren(node)
  const footerHtml = footer
    ? `<div${ctx.slot('footer')} style="${css({
        'font-size': '12.5px',
        color: palette.weak,
        'margin-top': '10px',
        'padding-top': '8px',
        'border-top': `1px dashed ${palette.divider}`,
      })}">${escapeHtml(footer)}</div>`
    : ''

  const outer = css({
    margin: `0 0 ${palette.blockGap}`,
    'background-color': variant === 'plain' ? '#ffffff' : tone.soft,
    border: variant === 'plain' ? `1px solid ${palette.cardBorder}` : `1px solid ${tone.soft}`,
    'border-left': `4px solid ${tone.base}`,
    'border-radius': palette.radius,
    padding: '14px 16px',
    'box-shadow': variant === 'raised' ? `0 6px 20px ${tone.soft}` : undefined,
  })

  return `<div style="${outer}">${header}<div data-swx-body="1"${ctx.slot('body')}>${inner}</div>${footerHtml}</div>`
}

/** 时间线。 */
function renderTimeline(node: ComponentNode, ctx: RenderContext): string {
  const palette = ctx.palette
  const p = node.props
  const tone = resolveTone(prop(p, 'tone', 'primary'), palette)
  const rows = parseRows(node.body)
  const title = prop(p, 'title')

  const items = rows
    .map((row, index) => {
      const isLast = index === rows.length - 1
      const dot = `<div style="${css({
        width: '11px',
        height: '11px',
        'border-radius': '50%',
        'background-color': tone.base,
        'box-shadow': `0 0 0 3px ${tone.soft}`,
        'flex-shrink': 0,
        'margin-top': '4px',
      })}"></div>`
      const rail = isLast
        ? ''
        : `<div style="${css({
            width: '2px',
            'background-color': tone.soft,
            flex: 1,
            'min-height': '14px',
            margin: '3px 0 0 0',
          })}"></div>`
      return (
        `<div style="${css({ display: 'flex', gap: '11px', 'align-items': 'flex-start' })}">` +
        `<div style="${css({ display: 'flex', 'flex-direction': 'column', 'align-items': 'center', width: '11px', 'flex-shrink': 0 })}">${dot}${rail}</div>` +
        `<div style="${css({ flex: 1, 'padding-bottom': isLast ? '0' : '14px', 'min-width': 0 })}">` +
        (row.label
          ? `<div style="${css({
              'font-size': '12.5px',
              'font-weight': '600',
              color: tone.strong,
              'margin-bottom': '3px',
            })}">${escapeHtml(row.label)}</div>`
          : '') +
        `<div style="${css({ 'font-size': '13.5px', color: palette.text, 'line-height': '1.7' })}">${ctx.renderMarkdown(row.text)}</div>` +
        `</div></div>`
      )
    })
    .join('')

  const header = title
    ? `<div style="${css({
        'font-size': '14px',
        'font-weight': '600',
        color: palette.text,
        'margin-bottom': '12px',
      })}">${escapeHtml(title)}</div>`
    : ''

  return `<div style="${css({
    margin: `0 0 ${palette.blockGap}`,
    'background-color': '#ffffff',
    border: `1px solid ${palette.cardBorder}`,
    'border-radius': palette.radius,
    padding: '16px',
  })}">${header}${items}</div>`
}

/** 步骤条（横向编号 + 说明）。 */
function renderSteps(node: ComponentNode, ctx: RenderContext): string {
  const palette = ctx.palette
  const p = node.props
  const tone = resolveTone(prop(p, 'tone', 'primary'), palette)
  const rows = parseRows(node.body)
  const vertical = prop(p, 'layout', 'vertical') !== 'horizontal'

  if (!vertical) {
    const width = `${(100 - (rows.length - 1)) / rows.length}%`
    const items = rows
      .map((row, i) => {
        const chip = `<div style="${css({
          width: '24px',
          height: '24px',
          'border-radius': '50%',
          'background-color': tone.base,
          color: tone.onBase,
          'font-size': '13px',
          'font-weight': '600',
          'line-height': '24px',
          'text-align': 'center',
          'margin-bottom': '8px',
        })}">${i + 1}</div>`
        return (
          `<div style="${css({ width })}">${chip}` +
          (row.label
            ? `<div style="${css({ 'font-size': '13px', 'font-weight': '600', color: palette.text, 'margin-bottom': '3px' })}">${escapeHtml(row.label)}</div>`
            : '') +
          `<div style="${css({ 'font-size': '12px', color: palette.muted, 'line-height': '1.6' })}">${escapeHtml(row.text)}</div></div>`
        )
      })
      .join('')
    return `<div style="${css({
      margin: `0 0 ${palette.blockGap}`,
      display: 'flex',
      gap: '1%',
      'align-items': 'flex-start',
    })}">${items}</div>`
  }

  const items = rows
    .map((row, i) => {
      const chip = `<div style="${css({
        width: '26px',
        height: '26px',
        'border-radius': '50%',
        'background-color': tone.base,
        color: tone.onBase,
        'font-size': '13px',
        'font-weight': '600',
        'line-height': '26px',
        'text-align': 'center',
        'flex-shrink': 0,
      })}">${i + 1}</div>`
      return (
        `<div style="${css({
          display: 'flex',
          gap: '11px',
          'align-items': 'flex-start',
          'margin-bottom': i === rows.length - 1 ? '0' : '13px',
        })}">${chip}` +
        `<div style="${css({ flex: 1, 'min-width': 0 })}">` +
        (row.label
          ? `<div style="${css({ 'font-size': '14px', 'font-weight': '600', color: palette.text, 'margin-bottom': '3px' })}">${escapeHtml(row.label)}</div>`
          : '') +
        `<div style="${css({ 'font-size': '13px', color: palette.muted, 'line-height': '1.7' })}">${ctx.renderMarkdown(row.text)}</div>` +
        `</div></div>`
      )
    })
    .join('')

  return `<div style="${css({
    margin: `0 0 ${palette.blockGap}`,
    'background-color': palette.cardBg,
    'border-radius': palette.radius,
    padding: '16px',
  })}">${items}</div>`
}

/** 对比：把 Markdown 表格渲染成「旧 / 新」两栏卡片。 */
function renderCompare(node: ComponentNode, ctx: RenderContext): string {
  const palette = ctx.palette
  const p = node.props
  const lines = node.body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'))
  const cells = lines
    .filter((l) => !/^\|[\s:|-]+\|$/.test(l))
    .map((l) =>
      l
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim()),
    )
  if (cells.length < 2) return ctx.renderChildren(node)

  const header = cells[0] as string[]
  const body = cells.slice(1)
  const leftTone = resolveTone(prop(p, 'left-tone', 'neutral'), palette)
  const rightTone = resolveTone(prop(p, 'right-tone', 'primary'), palette)
  const side = prop(p, 'layout', 'stack') === 'side'
  const columnWidth = side ? '48%' : '100%'

  const column = (index: 0 | 1): string => {
    const tone = index === 0 ? leftTone : rightTone
    const title = header[index] ?? (index === 0 ? '旧' : '新')
    const rows = body
      .map((row) => {
        const text = row[index] ?? ''
        return `<div style="${css({
          'font-size': '13.5px',
          color: palette.text,
          'line-height': '1.7',
          padding: '7px 0',
          'border-top': `1px dashed ${palette.divider}`,
        })}">${ctx.renderMarkdown(text)}</div>`
      })
      .join('')
    return (
      `<div style="${css({
        width: side ? columnWidth : undefined,
        'box-sizing': 'border-box',
        'background-color': tone.soft,
        border: `1px solid ${tone.soft}`,
        'border-top': `3px solid ${tone.base}`,
        'border-radius': palette.radius,
        padding: '12px 14px',
      })}">` +
      `<div style="${css({
        'font-size': '13.5px',
        'font-weight': '600',
        color: tone.strong,
        'margin-bottom': '2px',
      })}">${escapeHtml(title)}</div>${rows}</div>`
    )
  }

  return `<div style="${css({
    margin: `0 0 ${palette.blockGap}`,
    display: 'flex',
    gap: side ? '4%' : '10px',
    'flex-direction': side ? 'row' : 'column',
    'align-items': 'stretch',
  })}">${column(0)}${column(1)}</div>`
}

/** 引用卡片：比原生 blockquote 更完整（引号、作者、出处）。 */
function renderQuote(node: ComponentNode, ctx: RenderContext): string {
  const palette = ctx.palette
  const p = node.props
  const tone = resolveTone(prop(p, 'tone', 'primary'), palette)
  const author = prop(p, 'author')
  const source = prop(p, 'source')

  const inner = ctx.renderChildren(node)
  const attribution = author || source
    ? `<div${ctx.slot('author')} style="${css({
        'font-size': '12.5px',
        color: palette.muted,
        'margin-top': '10px',
        'text-align': 'right',
      })}">${author ? escapeHtml(author) : ''}${
        author && source ? ' · ' : ''
      }${source ? escapeHtml(source) : ''}</div>`
    : ''

  return `<div style="${css({
    margin: `0 0 ${palette.blockGap}`,
    'background-color': tone.soft,
    'border-radius': palette.radius,
    padding: '16px 16px 12px',
    position: undefined,
  })}">` +
    `<div style="${css({
      'font-size': '26px',
      'line-height': '0.8',
      color: tone.base,
      'margin-bottom': '6px',
    })}">“</div>` +
    `<div data-swx-body="1"${ctx.slot('text')} style="${css({ 'font-size': '14px', color: palette.text, 'line-height': '1.8' })}">${inner}</div>` +
    attribution +
    `</div>`
}

/** 目录：微信会拒绝 `href="#…"`，因此渲染为纯视觉编号目录。 */
function renderToc(node: ComponentNode, ctx: RenderContext): string {
  const palette = ctx.palette
  const p = node.props
  const tone = resolveTone(prop(p, 'tone', 'primary'), palette)
  const title = prop(p, 'title', '目录')
  const maxLevel = Number(prop(p, 'max-level', '2')) || 2
  const headings = ctx.headings.filter((h) => h.level >= 2 && h.level <= maxLevel)
  if (headings.length === 0) return ''

  const items = headings
    .map((h, i) => {
      const indent = h.level > 2 ? 'padding-left:16px;' : ''
      return (
        `<div style="${css({
          display: 'flex',
          gap: '8px',
          'align-items': 'baseline',
          padding: '5px 0',
          'border-bottom': i === headings.length - 1 ? undefined : `1px dashed ${palette.divider}`,
        })}">` +
        `<span style="${css({
          'font-size': '12px',
          color: tone.base,
          'font-weight': '600',
          'flex-shrink': 0,
          'min-width': '18px',
        })}">${String(i + 1).padStart(2, '0')}</span>` +
        `<span style="${indent}${css({ 'font-size': '13.5px', color: palette.text })}">${escapeHtml(h.text)}</span></div>`
      )
    })
    .join('')

  return `<div style="${css({
    margin: `0 0 ${palette.blockGap}`,
    'background-color': palette.cardBg,
    'border-radius': palette.radius,
    padding: '14px 16px',
  })}">` +
    `<div style="${css({
      'font-size': '13.5px',
      'font-weight': '600',
      color: tone.strong,
      'margin-bottom': '8px',
      'letter-spacing': '1px',
    })}">${escapeHtml(title)}</div>${items}</div>`
}

export const structureComponents: Record<string, (node: ComponentNode, ctx: RenderContext) => string> = {
  card: renderCard,
  timeline: renderTimeline,
  steps: renderSteps,
  compare: renderCompare,
  quote: renderQuote,
  toc: renderToc,
}

export { parseRows }
