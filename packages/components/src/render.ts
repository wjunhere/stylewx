/**
 * 组件分发与渲染。
 */
import { mediaComponents } from './components/media.js'
import { structureComponents } from './components/structure.js'
import { decorComponents } from './components/decor.js'
import { interactiveComponents } from './components/interactive.js'
import { articleComponents } from './components/article.js'
import { parseComponents } from './parse.js'
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

/** 不消费正文的自包含组件：若被写入正文，多半是漏写闭合 `:::`，给出诊断。 */
const SELF_CONTAINED = new Set(['toc', 'divider', 'section-title', 'badge', 'progress', 'pulse', 'cover'])

/** 渲染单个组件节点。 */
export function renderComponent(node: ComponentNode, ctx: RenderContext): string {
  const renderer = COMPONENT_RENDERERS[node.name]
  if (renderer && SELF_CONTAINED.has(node.name) && node.body.trim()) {
    ctx.diagnostics.push({
      level: 'warning',
      component: node.name,
      message: `组件 :::${node.name} 不接受正文，已忽略其正文。请检查是否漏写闭合的 ::: ，或改用 props 传参。`,
      line: node.line,
    })
  }
  if (!renderer) {
    ctx.diagnostics.push({
      level: 'warning',
      component: node.name,
      message: `未知组件「${node.name}」，已按普通 Markdown 渲染其正文。可用组件见 list_components。`,
      line: node.line,
    })
    return ctx.renderMarkdown(node.body)
  }
  return renderer(node, ctx)
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
