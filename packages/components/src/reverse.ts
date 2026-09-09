/**
 * HTML → Markdown 反向转换（导入用）。
 *
 * 为什么能做「精确往返」：组件渲染时会在根元素上写入机器可读标记
 * `data-swx="card"` 与 `data-swx-props="title=…&tone=…"`。
 * 实测微信 draft/add → draft/get 会**完整保留 data-* 属性**（含 SVG 元素），
 * 因此从本地 HTML 或从公众号取回的 HTML 都能还原成 `:::card{…}` 指令。
 *
 * 正文处理分三类：
 * - markdown：正文是 Markdown 渲染出来的 HTML，按 DOM 结构还原（容器类组件）
 * - raw：正文是结构化文本（如 `- 2023 | 启动`、表格、图片行），原样存在 `data-swx-src` 里
 * - none：不使用正文（仅 props）
 *
 * 没有标记的 HTML（其它工具生成 / 老版本）会退化成普通 HTML→Markdown，组件参数无法还原。
 */
import { unified } from 'unified'
import rehypeParse from 'rehype-parse'

interface HastNode {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

export interface ImportedComponent {
  name: string
  props: Record<string, string>
  /** 正文来源：markdown=从 DOM 还原；raw=取自 data-swx-src；none=无正文。 */
  bodyFrom: 'markdown' | 'raw' | 'none'
}

export interface HtmlImportResult {
  /** 还原出的 Markdown（含 `:::` 组件指令）。 */
  markdown: string
  /** 从文档中还原的标题（优先 h1，其次 <title>）。 */
  title: string
  /** 识别到的组件（按出现顺序）。 */
  components: ImportedComponent[]
  /** 未能识别的原始 HTML 片段数量等提示。 */
  warnings: string[]
}

const INLINE_ESCAPE = /([\\`*_[\]])/g

function escapeInline(text: string): string {
  return text.replace(INLINE_ESCAPE, '\\$1')
}

function collapse(text: string): string {
  return text.replace(/[\t\r\n ]+/g, ' ')
}

function propValue(node: HastNode, key: string): string | undefined {
  const v = node.properties?.[key]
  return typeof v === 'string' ? v : undefined
}

function decodeProps(encoded: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!encoded) return out
  for (const [k, v] of new URLSearchParams(encoded)) out[k] = v
  return out
}

/** props → `{k="v" k2=v2}`（只给需要引号的值加引号）。 */
export function formatProps(props: Record<string, string>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(props)) {
    if (v === '') continue
    if (v === 'true') parts.push(k)
    else if (/^[A-Za-z0-9._-]+$/.test(v)) parts.push(`${k}=${v}`)
    else parts.push(`${k}="${v.replace(/"/g, '&quot;')}"`)
  }
  return parts.length ? `{${parts.join(' ')}}` : ''
}

// ---------------------------------------------------------------- Markdown 序列化

interface Ctx {
  components: ImportedComponent[]
  warnings: string[]
  /** 当前组件嵌套层级（0 = 最外层）。 */
  depth: number
  /** 整篇文档里组件的最大嵌套层数（用于分配冒号数量）。 */
  maxDepth: number
}

function textOf(node: HastNode): string {
  if (node.type === 'text') return node.value ?? ''
  let out = ''
  for (const c of node.children ?? []) out += textOf(c)
  return out
}

/** 块级元素转换，返回不带首尾多余空行的 Markdown。 */
function convertNode(node: HastNode, ctx: Ctx, listDepth: number): string {
  if (node.type === 'text') return escapeInline(collapse(node.value ?? ''))
  if (node.type === 'comment' || node.type === 'doctype') return ''
  if (node.type !== 'element') return convertChildren(node, ctx, listDepth)

  const tag = (node.tagName ?? '').toLowerCase()
  const swx = propValue(node, 'dataSwx')

  // ---- 组件节点：还原成 ::: 指令 ----
  if (swx) {
    const props = decodeProps(propValue(node, 'dataSwxProps'))
    const src = propValue(node, 'dataSwxSrc')
    let bodyFrom: ImportedComponent['bodyFrom'] = 'none'
    let bodyEl: HastNode | undefined
    if (src !== undefined) {
      bodyFrom = 'raw'
    } else {
      bodyEl = findBody(node)
      if (bodyEl) bodyFrom = 'markdown'
    }
    // 先登记本组件，保证 components 顺序与文档顺序一致（外层在前）
    ctx.components.push({ name: swx, props, bodyFrom })
    let body = ''
    if (bodyFrom === 'raw') body = src ?? ''
    else if (bodyEl) {
      ctx.depth += 1
      body = convertChildren(bodyEl, ctx, 0).trim()
      ctx.depth -= 1
    }
    // 外层用更多冒号：colons = 3 + (maxDepth - depth - 1)
    const fence = ':'.repeat(3 + Math.max(0, ctx.maxDepth - ctx.depth - 1))
    const directive = `${fence}${swx}${formatProps(props)}`
    return body ? `${directive}\n${body}\n${fence}\n\n` : `${directive}\n${fence}\n\n`
  }

  switch (tag) {
    case 'section':
    case 'div':
    case 'span':
    case 'figure':
    case 'figcaption':
    case 'article':
    case 'main':
    case 'header':
    case 'footer':
    case 'tbody':
    case 'thead':
      return convertChildren(node, ctx, listDepth)
    case 'p': {
      const inner = convertChildren(node, ctx, listDepth).trim()
      return inner ? `${inner}\n\n` : ''
    }
    case 'br':
      return '  \n'
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = Number(tag[1])
      return `${'#'.repeat(level)} ${convertChildren(node, ctx, listDepth).trim()}\n\n`
    }
    case 'strong':
    case 'b': {
      const inner = convertChildren(node, ctx, listDepth).trim()
      return inner ? `**${inner}**` : ''
    }
    case 'em':
    case 'i': {
      const inner = convertChildren(node, ctx, listDepth).trim()
      return inner ? `*${inner}*` : ''
    }
    case 'del':
    case 's':
    case 'strike': {
      const inner = convertChildren(node, ctx, listDepth).trim()
      return inner ? `~~${inner}~~` : ''
    }
    case 'sup':
      return `^${convertChildren(node, ctx, listDepth).trim()}^`
    case 'sub':
      return `~${convertChildren(node, ctx, listDepth).trim()}~`
    case 'code': {
      // pre 内部由 pre 处理，这里只处理行内
      return `\`${textOf(node)}\``
    }
    case 'pre': {
      const code = textOf(node).replace(/\n$/, '')
      const lang = ''
      return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`
    }
    case 'blockquote': {
      const inner = convertChildren(node, ctx, listDepth).trim()
      return inner
        .split('\n')
        .map((l) => `> ${l}`.trimEnd())
        .join('\n') + '\n\n'
    }
    case 'hr':
      return '---\n\n'
    case 'a': {
      const href = propValue(node, 'href') ?? ''
      const inner = convertChildren(node, ctx, listDepth).trim()
      if (!href) return inner
      return `[${inner}](${href})`
    }
    case 'img': {
      const src = propValue(node, 'src') ?? ''
      const alt = propValue(node, 'alt') ?? ''
      const title = propValue(node, 'title')
      return `![${alt}](${src}${title ? ` "${title}"` : ''})`
    }
    case 'ul':
    case 'ol': {
      const ordered = tag === 'ol'
      const items = (node.children ?? []).filter(
        (c) => c.type === 'element' && (c.tagName ?? '').toLowerCase() === 'li',
      )
      const indent = '  '.repeat(listDepth)
      const lines = items.map((li, i) => {
        const inner = convertChildren(li, ctx, listDepth + 1).trim()
        const marker = ordered ? `${i + 1}. ` : '- '
        const [first, ...rest] = inner.split('\n')
        const pad = ' '.repeat(marker.length)
        return (
          indent +
          marker +
          (first ?? '') +
          rest.map((l) => `\n${indent}${pad}${l}`).join('')
        )
      })
      return lines.join('\n') + '\n\n'
    }
    case 'li':
      return convertChildren(node, ctx, listDepth)
    case 'table':
      return convertTable(node, ctx) + '\n\n'
    case 'svg': {
      // 未标记的裸 SVG：原样保留为 HTML，避免丢内容
      ctx.warnings.push('保留了 1 段未标记的原始 <svg>（无法还原为组件）')
      return `${serializeHtml(node)}\n\n`
    }
    default: {
      // 其它标签（含未识别元素）：保留为原始 HTML
      return `${serializeHtml(node)}\n\n`
    }
  }
}

/** 行内元素（不产生块级换行）。 */
const INLINE_TAGS = new Set([
  'a', 'abbr', 'b', 'br', 'cite', 'code', 'del', 'em', 'i', 'img', 'kbd', 'mark',
  'q', 's', 'small', 'span', 'strong', 'sub', 'sup', 'u', 'var',
])

function isInline(node: HastNode | undefined): boolean {
  if (!node || node.type !== 'element') return false
  // 组件在 Markdown 里是块级指令，不能在它两侧补空格
  if (node.properties && 'dataSwx' in node.properties) return false
  return INLINE_TAGS.has((node.tagName ?? "").toLowerCase())
}

function convertChildren(node: HastNode, ctx: Ctx, listDepth: number): string {
  let out = ''
  const kids = node.children ?? []
  for (let i = 0; i < kids.length; i += 1) {
    const child = kids[i] as HastNode
    // 纯空白文本节点：只在两个行内元素之间补一个空格，其余丢弃（块级间距由块元素负责）
    if (child.type === 'text' && (child.value ?? '').trim() === '') {
      if (isInline(kids[i - 1]) && isInline(kids[i + 1])) out += " "
      continue
    }
    out += convertNode(child, ctx, listDepth)
  }
  return out
}

/** 计算组件最大嵌套层数（含自身）。 */
function maxComponentDepth(node: HastNode): number {
  let max = 0
  const walk = (n: HastNode, depth: number) => {
    const isComponent = n.type === 'element' && n.properties && 'dataSwx' in n.properties
    const next = isComponent ? depth + 1 : depth
    if (next > max) max = next
    for (const c of n.children ?? []) walk(c, next)
  }
  walk(node, 0)
  return max
}

/** 在组件内部找标记了 data-swx-body 的正文容器。 */
function findBody(node: HastNode): HastNode | undefined {
  for (const child of node.children ?? []) {
    if (child.type !== 'element') continue
    if (propValue(child, 'dataSwxBody') !== undefined) return child
    const nested = findBody(child)
    if (nested) return nested
  }
  return undefined
}

function convertTable(node: HastNode, ctx: Ctx): string {
  const rows: string[][] = []
  let header: string[] = []
  const visit = (n: HastNode) => {
    const tag = (n.tagName ?? '').toLowerCase()
    if (tag === 'tr') {
      const cells = (n.children ?? [])
        .filter((c) => ['th', 'td'].includes((c.tagName ?? '').toLowerCase()))
        .map((c) => convertChildren(c, ctx, 0).trim().replace(/\n+/g, ' '))
      if (cells.length) {
        if (n.children?.some((c) => (c.tagName ?? '').toLowerCase() === 'th') && header.length === 0) {
          header = cells
        } else {
          rows.push(cells)
        }
      }
      return
    }
    for (const c of n.children ?? []) if (c.type === 'element') visit(c)
  }
  visit(node)
  if (header.length === 0) header = rows.shift() ?? []
  if (header.length === 0) return ''
  const line = (cells: string[]) => `| ${header.map((_, i) => cells[i] ?? '').join(' | ')} |`
  const sep = `| ${header.map(() => '---').join(' | ')} |`
  return [line(header), sep, ...rows.map(line)].join('\n')
}

/** SVG 里必须保持驼峰的属性名（连字符化会变成非法属性）。 */
const SVG_CAMEL_ATTRS = new Set([
  'viewBox', 'preserveAspectRatio', 'gradientUnits', 'gradientTransform', 'patternUnits',
  'patternContentUnits', 'patternTransform', 'clipPathUnits', 'maskUnits', 'maskContentUnits',
  'markerWidth', 'markerHeight', 'markerUnits', 'refX', 'refY', 'textLength', 'lengthAdjust',
  'stdDeviation', 'baseFrequency', 'numOctaves', 'specularConstant', 'specularExponent',
  'surfaceScale', 'diffuseConstant', 'kernelMatrix', 'keyPoints', 'keySplines', 'keyTimes',
  'calcMode', 'repeatCount', 'repeatDur', 'attributeName', 'pathLength', 'startOffset',
  'stopColor', 'stopOpacity', 'fillOpacity', 'strokeWidth', 'strokeDasharray', 'strokeDashoffset',
])

/** hast 属性名 → HTML 属性名。 */
function attrName(key: string): string {
  if (SVG_CAMEL_ATTRS.has(key)) return key
  return key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
}

/** 极简 HTML 序列化（只用于保留无法转 Markdown 的片段）。 */
function serializeHtml(node: HastNode): string {
  if (node.type === 'text') return (node.value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  if (node.type !== 'element') return (node.children ?? []).map(serializeHtml).join('')
  const tag = node.tagName ?? 'div'
  const attrs = Object.entries(node.properties ?? {})
    .filter(([k]) => k !== 'className')
    .map(([k, v]) => {
      const name = attrName(k)
      if (v === true) return ` ${name}`
      if (v === false || v === undefined || v === null) return ''
      return ` ${name}="${String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`
    })
    .join('')
  const children = (node.children ?? []).map(serializeHtml).join('')
  return `<${tag}${attrs}>${children}</${tag}>`
}

// ---------------------------------------------------------------- 入口

function normalizeMarkdown(md: string): string {
  return md
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
    .concat('\n')
}

function firstHeading(node: HastNode, level = 1): string {
  const tag = `h${level}`
  let found = ''
  const walk = (n: HastNode) => {
    if (found) return
    if (n.type === 'element' && (n.tagName ?? '').toLowerCase() === tag) {
      found = collapse(textOf(n)).trim()
      return
    }
    for (const c of n.children ?? []) walk(c)
  }
  walk(node)
  return found
}

/**
 * 把一段 HTML（完整文档或片段）还原为 Markdown。
 * @param html 待导入的 HTML
 */
export function htmlToMarkdown(html: string): HtmlImportResult {
  const processor = unified().use(rehypeParse, { fragment: true })
  const tree = processor.parse(html) as unknown as HastNode
  const ctx: Ctx = { components: [], warnings: [], depth: 0, maxDepth: maxComponentDepth(tree) }
  const body = convertChildren(tree, ctx, 0)
  const markdown = normalizeMarkdown(body)

  let title = firstHeading(tree, 1)
  if (!title) {
    // <title> 在 fragment 解析下仍是元素
    const find = (n: HastNode): string => {
      if (n.type === 'element' && (n.tagName ?? '').toLowerCase() === 'title') return collapse(textOf(n)).trim()
      for (const c of n.children ?? []) {
        const t = find(c)
        if (t) return t
      }
      return ''
    }
    title = find(tree)
  }

  if (!title) {
    const cover = ctx.components.find((c) => c.name === 'cover' && c.props.title)
    if (cover) title = cover.props.title ?? ''
  }

  return { markdown, title, components: ctx.components, warnings: ctx.warnings }
}
