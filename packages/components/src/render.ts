/**
 * 组件分发与渲染。
 */
import { mediaComponents } from './components/media.js'
import { structureComponents } from './components/structure.js'
import { decorComponents } from './components/decor.js'
import { interactiveComponents } from './components/interactive.js'
import { articleComponents } from './components/article.js'
import { parseComponents } from './parse.js'
import { escapeAttr } from './style.js'
import { ALL_SLOT, ROOT_SLOT, applyComponentStyles } from './overrides.js'
import { renderUserComponent } from './user-component.js'
import type { ComponentNode, ComponentRenderer, HeadingInfo, RenderContext, RenderNode } from './types.js'

/** 全部已注册组件。 */
export const COMPONENT_RENDERERS: Record<string, ComponentRenderer> = {
  ...mediaComponents,
  ...structureComponents,
  ...decorComponents,
  ...interactiveComponents,
  ...articleComponents,
}

/** 已注册的组件名（不含别名）。 */
export const COMPONENT_NAMES: string[] = [
  ...Object.keys(mediaComponents),
  ...Object.keys(structureComponents),
  ...Object.keys(decorComponents).filter(
    (n) => !['info', 'tip', 'important', 'warning', 'danger', 'success', 'note'].includes(n),
  ),
  ...Object.keys(interactiveComponents),
  ...Object.keys(articleComponents).filter((n) => n !== 'follow'),
]

/** 正文按原始文本保存的组件：结构化正文（`- 时间 | 内容`、表格、图片行）从 DOM 还原会失真。 */
const RAW_BODY = new Set(['image', 'gallery', 'image-card', 'carousel', 'timeline', 'steps', 'compare', 'reveal'])
/** 不使用正文、仅靠 props 的组件。 */
const PROPS_ONLY = new Set(['divider', 'section-title', 'toc', 'progress', 'pulse', 'cover', 'badge'])

/** props → URL 编码串（写进 data-swx-props，导入时精确还原）。 */
function encodeProps(props: Record<string, string>): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(props)) if (v !== "") params.set(k, v)
  return params.toString()
}

/**
 * 给组件根元素写入机器可读标记，供 HTML 导入时精确还原为 ::: 指令。
 * 实测微信 draft/add → draft/get 会完整保留 data-* 属性（含 SVG 元素），因此发布后的文章同样可回导。
 */
function markerAttrs(node: ComponentNode, isUserComponent = false): string {
  const useSrc = isUserComponent || RAW_BODY.has(node.name) || PROPS_ONLY.has(node.name)
  let attrs = ` data-swx="${escapeAttr(node.name)}"`
  const propsEnc = encodeProps(node.props)
  if (propsEnc) attrs += ` data-swx-props="${escapeAttr(propsEnc)}"`
  const body = node.body.trim()
  if (useSrc && body) attrs += ` data-swx-src="${escapeAttr(body)}"`
  return attrs
}

/** 把标记注入到渲染结果的第一个元素开标签里。 */
function injectMarker(html: string, node: ComponentNode, isUserComponent = false): string {
  const leading = html.length - html.trimStart().length
  const body = html.slice(leading)
  if (!body.startsWith("<") || body.startsWith("<!")) return html
  const end = body.indexOf(">")
  if (end === -1) return html
  const open = body.slice(0, end)
  const rest = body.slice(end)
  const attrs = markerAttrs(node, isUserComponent)
  const patched = open.endsWith("/") ? `${open.slice(0, -1)}${attrs} /${rest}` : `${open}${attrs}${rest}`
  return html.slice(0, leading) + patched
}

/** 不消费正文的自包含组件：若被写入正文，多半是漏写闭合 `:::`，给出诊断。 */
const SELF_CONTAINED = new Set(['toc', 'divider', 'section-title', 'badge', 'progress', 'pulse', 'cover'])

/** 渲染单个组件节点。 */
export function renderComponent(node: ComponentNode, ctx: RenderContext): string {
  const builtin = COMPONENT_RENDERERS[node.name]
  const userDef = builtin ? undefined : ctx.userComponents?.[node.name]
  const renderer = builtin
  if (renderer && SELF_CONTAINED.has(node.name) && node.body.trim()) {
    ctx.diagnostics.push({
      level: 'warning',
      component: node.name,
      message: `组件 :::${node.name} 不接受正文，已忽略其正文。请检查是否漏写闭合的 ::: ，或改用 props 传参。`,
      line: node.line,
    })
  }
  if (!renderer && !userDef) {
    ctx.diagnostics.push({
      level: 'warning',
      component: node.name,
      message: `未知组件「${node.name}」，已按普通 Markdown 渲染其正文。可用组件见 list_components（含你的自定义组件）。`,
      line: node.line,
    })
    return ctx.renderMarkdown(node.body)
  }
  const overrides = ctx.componentStyles?.[node.name]
  // 只有存在覆盖时才开启部位标记，未使用时输出与之前完全一致
  const prevSlotEnabled = ctx.slotEnabled
  ctx.slotEnabled = Boolean(overrides) && Boolean(renderer)
  let raw: string
  try {
    raw = renderer
      ? renderer(node, ctx)
      : renderUserComponent(userDef as never, node, ctx, ctx.renderChildren(node)).html
  } finally {
    ctx.slotEnabled = prevSlotEnabled
  }

  const { html, appliedSlots } = applyComponentStyles(raw, overrides, node.props.style)

  // 诊断：主题里写了某个部位，但组件没有这个部位 → 明确告知，避免静默失效
  if (overrides) {
    for (const key of Object.keys(overrides)) {
      if (key === ROOT_SLOT || key === ALL_SLOT) continue
      if (appliedSlots.includes(key)) continue
      ctx.diagnostics.push({
        level: 'warning',
        component: node.name,
        message: `主题里为 :::${node.name} 配置了「${key}」部位，但该组件没有这个部位，覆盖未生效。可用部位见 list_components。`,
        line: node.line,
      })
    }
  }

  return injectMarker(html, node, Boolean(userDef))
}

/** 渲染节点序列。 */
export function renderNodes(nodes: RenderNode[], ctx: RenderContext): string {
  return nodes
    .map((node) => (node.type === 'markdown' ? ctx.renderMarkdown(node.value) : renderComponent(node, ctx)))
    .join('\n')
}

/**
 * 渲染整篇文档：解析组件指令 → 逐节点渲染。
 * @param markdown 原始 Markdown
 * @param ctx 渲染上下文（由 core 注入 Markdown 渲染器与主题配色）
 */
export function renderDocument(markdown: string, ctx: RenderContext): string {
  const nodes = parseComponents(markdown)
  return renderNodes(nodes, ctx)
}

/** 从 Markdown 中提取标题（供 toc 组件使用），跳过代码围栏。 */
export function extractHeadings(markdown: string): HeadingInfo[] {
  const out: HeadingInfo[] = []
  let inFence = false
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (m) {
      out.push({ level: (m[1] as string).length, text: (m[2] as string).trim() })
    }
  }
  return out
}
