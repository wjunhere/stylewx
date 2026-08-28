/**
 * Markdown → HTML 转换管线（unified / remark / rehype）。
 * 纯函数、无 DOM / Node 依赖，可同构。
 * 保留 GFM 表格/删除线/任务列表；允许内嵌 HTML（由下游 validator 负责安全校验）。
 * 渲染时会移除所有 `class` 属性 —— 输出完全依赖内联样式，不依赖任何 class 选择器。
 */
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeStringify from 'rehype-stringify'

interface HastLike {
  type?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastLike[]
}

/** 递归移除所有节点上的 className（去除 language-* 等，避免任何 class 依赖）。 */
function stripClassNames(node: HastLike): void {
  if (node.properties && 'className' in node.properties) {
    delete node.properties.className
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) stripClassNames(child)
  }
}

function rehypeRemoveClassPlugin() {
  return (tree: HastLike): void => {
    stripClassNames(tree)
  }
}

/**
 * 把 Markdown 字符串转换为嵌套的 HTML 片段（不含根容器）。
 * @param markdown 文章 Markdown
 * @returns HTML 字符串，例如 `<h1>…</h1><p>…</p>`
 */
export function markdownToHtml(markdown: string): string {
  const file = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeRemoveClassPlugin)
    .use(rehypeStringify)
    .processSync(markdown)
  return String(file)
}
