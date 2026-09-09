/**
 * `:::name{props}` 指令解析器。
 *
 * 语法：
 *   :::card{title="核心结论" tone=primary}
 *   正文（Markdown）
 *   :::
 *
 * 嵌套：外层用更多冒号，闭合冒号数量必须与开启一致。
 *   ::::card{title="外层"}
 *   :::divider
 *   ::::
 *
 * 兼容旧的 `:::info 标题` 写法（等价于 callout 组件 + title 参数）。
 * 代码围栏（``` / ~~~）内的 `:::` 不会被解析。
 */
import type { ComponentNode, RenderNode } from './types.js'

/** 开启行：至少 3 个冒号 + 组件名 + 可选 {props} + 可选尾随标题。 */
const OPEN_RE = /^[ \t]{0,3}(:{3,})\s*([a-zA-Z][a-zA-Z0-9-]*)(?:\s*\{([^}]*)\})?\s*(.*)$/
/** 闭合行：只有冒号。 */
const CLOSE_RE = /^[ \t]{0,3}(:{3,})\s*$/
/** 代码围栏。 */
const FENCE_RE = /^\s{0,3}(```|~~~)/
/** 允许「:::type 标题」尾随写法的旧式提示框别名。 */
const CALLOUT_ALIASES = new Set(['callout', 'info', 'tip', 'important', 'warning', 'danger', 'success', 'note'])

interface Frame {
  name: string
  props: Record<string, string>
  colons: number
  nodes: RenderNode[]
  /** 尚未转成 MarkdownNode 的文本行。 */
  buf: string[]
  /** 本层全部直接文本行（用于组件自行解析结构化内容）。 */
  raw: string[]
  line: number
}

function makeFrame(name: string, props: Record<string, string>, colons: number, line: number): Frame {
  return { name, props, colons, nodes: [], buf: [], raw: [], line }
}

/** 解析 `{key="value" key2=value3 flag}` 形式的参数。 */
export function parseProps(input: string | undefined): Record<string, string> {
  const props: Record<string, string> = {}
  if (!input) return props
  const re = /([a-zA-Z][a-zA-Z0-9-]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"']+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(input)) !== null) {
    const key = (m[1] ?? '').toLowerCase()
    if (!key) continue
    const value = m[3] ?? m[4] ?? m[5]
    props[key] = value === undefined ? 'true' : value
  }
  return props
}

/** 把一段 Markdown 解析为节点序列。 */
export function parseComponents(markdown: string): RenderNode[] {
  const lines = markdown.split(/\r?\n/)
  const root: Frame = makeFrame('', {}, 0, 1)
  const stack: Frame[] = [root]
  let inFence = false

  const current = (): Frame => stack[stack.length - 1] as Frame

  const flushBuf = (frame: Frame): void => {
    if (frame.buf.length === 0) return
    const value = frame.buf.join('\n')
    if (value.trim()) frame.nodes.push({ type: 'markdown', value })
    frame.buf = []
  }

  const closeFrame = (): void => {
    const frame = stack.pop() as Frame
    flushBuf(frame)
    const parent = current()
    const node: ComponentNode = {
      type: 'component',
      name: frame.name,
      props: frame.props,
      body: frame.raw.join('\n'),
      children: frame.nodes,
      line: frame.line,
    }
    parent.nodes.push(node)
  }

  lines.forEach((line, index) => {
    const lineNo = index + 1
    if (inFence) {
      current().buf.push(line)
      current().raw.push(line)
      if (FENCE_RE.test(line)) inFence = false
      return
    }
    if (FENCE_RE.test(line)) {
      inFence = true
      current().buf.push(line)
      current().raw.push(line)
      return
    }

    const closeMatch = CLOSE_RE.exec(line)
    if (closeMatch) {
      const colons = (closeMatch[1] ?? '').length
      // 找到最内层、冒号数量匹配的开启帧
      let idx = -1
      for (let i = stack.length - 1; i >= 1; i -= 1) {
        if ((stack[i] as Frame).colons === colons) {
          idx = i
          break
        }
      }
      if (idx === -1) {
        // 没有匹配的开启帧 → 当作普通文本
        current().buf.push(line)
        current().raw.push(line)
        return
      }
      // 先自动闭合更深的未闭合帧（容错）
      while (stack.length - 1 > idx) closeFrame()
      closeFrame()
      return
    }

    const openMatch = OPEN_RE.exec(line)
    if (openMatch) {
      const colons = (openMatch[1] ?? '').length
      const name = (openMatch[2] ?? '').toLowerCase()
      const props = parseProps(openMatch[3])
      const trailing = (openMatch[4] ?? '').trim()
      // 只有 callout 系列允许「:::warning 标题」这种尾随标题写法。
      // 其它组件带尾随文本说明这多半是行内误写（例如一行写了多个 :::badge），
      // 此时不当作组件开启，避免把后续整段内容吞进组件里。
      if (trailing && !CALLOUT_ALIASES.has(name)) {
        current().buf.push(line)
        current().raw.push(line)
        return
      }
      if (trailing && !props.title) props.title = trailing
      flushBuf(current())
      stack.push(makeFrame(name, props, colons, lineNo))
      return
    }

    current().buf.push(line)
    current().raw.push(line)
  })

  // 收尾：自动闭合所有未闭合的组件（对 LLM 输出容错）
  while (stack.length > 1) closeFrame()
  flushBuf(root)
  return root.nodes
}
