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
 * 容错：把「#后直接跟非空格」的行规范成合法 ATX 标题。
 * CommonMark 要求 `## 标题`（# 后要有空格）才算标题；但中文公众号写作常写 `##标题`（无空格），
 * 未规范时会被当成普通段落。这里在解析前把 `#{1,6}` 后紧跟非空格的字符前补一个空格，
 * 使其成为合法标题。跳过 ``` / ~~~ 代码围栏与缩进代码，避免误伤代码。
 */
export function normalizeNoSpaceAtxHeadings(markdown: string): string {
  const lines = markdown.split(/\r?\n/)
  let inFence = false
  return lines
    .map((line) => {
      // 代码围栏（``` 或 ~~~，最多 3 空格缩进）：围栏行切换状态，围栏内原样保留
      if (/^\s{0,3}(```|~~~)/.test(line)) {
        inFence = !inFence
        return line
      }
      if (inFence) return line
      // 有前置空格的缩进代码 / 其它块不处理（ATX 标题不能缩进）
      if (/^(\s|\t)/.test(line)) return line
      // 在 `#` 与首个非空格、非#字符之间补空格 -> 合法 ATX 标题；已有空格 / 纯# / 超长#串不受影响
      return line.replace(/^(#{1,6})([^\s#])/, '$1 $2')
    })
    .join('\n')
}

/**
 * 把 `^x^` 转成 <sup>x</sup>（上标）、`~x~` 转成 <sub>x</sub>（下标）。
 * 跳过代码围栏与行内代码，避免破坏代码；`~~` 删除线用单臂负断言保护，不与下标冲突。
 */
export function preprocessSuperSub(markdown: string): string {
  const lines = markdown.split('\n')
  let inFence = false
  return lines
    .map((line) => {
      if (/^\s{0,3}(```|~~~)/.test(line)) {
        inFence = !inFence
        return line
      }
      if (inFence) return line
      // 保护行内代码 `...`，避免把代码里的 ^ / ~ 误判
      const codes: string[] = []
      const guarded = line.replace(/`[^`]+`/g, (m) => {
        codes.push(m)
        return '\u0000' + (codes.length - 1) + '\u0000'
      })
      const conv = guarded
        .replace(/\^([^\^\u0000]+)\^/g, (_m, t) => `<sup>${t}</sup>`)
        .replace(/(?<!~)~([^\n~\u0000]+)~(?!~)/g, (_m, t) => `<sub>${t}</sub>`)
      return conv.replace(/\u0000(\d+)\u0000/g, (_m, i) => codes[+i] ?? '')
    })
    .join('\n')
}

/** 警告框类型 → 颜色（背景 / 左边框 / 标题色）。 */
export const CALLOUT_TYPES: Record<string, { bg: string; border: string; title: string }> = {
  info: { bg: '#eef6ff', border: '#409eff', title: '#337ecc' },
  tip: { bg: '#f2fbef', border: '#67c23a', title: '#529b2e' },
  important: { bg: '#fdf6ec', border: '#e6a23c', title: '#b88230' },
  warning: { bg: '#fef0f0', border: '#f56c6c', title: '#c45656' },
  note: { bg: '#f4f0fe', border: '#9b6df2', title: '#8250df' },
}

/**
 * 把 `:::类型 标题\n内容\n:::` 转成带内联样式的彩色警告框（提醒/建议/重要/警告/注意）。
 * 内容仍按 Markdown 递归渲染；内联样式会被保留下游（validator 仅裁危险结构）。
 */
export function preprocessCallouts(markdown: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return markdown.replace(/:::\s*(info|tip|important|warning|note)\b[ \t]*([^\n]*)\n([\s\S]*?)\n:::/g, (_m, type, title, inner) => {
    const s = CALLOUT_TYPES[type] || { bg: '#eef6ff', border: '#409eff', title: '#337ecc' }
    const t = (title.trim() || type)
    const innerHtml = markdownToHtml(inner.trim())
    return (
      `<div style="background:${s.bg};border-left:4px solid ${s.border};padding:12px 16px;border-radius:8px;margin:14px 0">` +
      `<div style="font-weight:600;font-size:14px;color:${s.title};margin-bottom:6px">${esc(t)}</div>` +
      `<div style="font-size:13.5px;color:#333;line-height:1.7">${innerHtml}</div>` +
      '</div>'
    )
  })
}

/**
 * 把 Markdown 字符串转换为嵌套的 HTML 片段（不含根容器）。
 * @param markdown 文章 Markdown
 * @returns HTML 字符串，例如 `<h1>…</h1><p>…</p>`
 */
export function markdownToHtml(markdown: string): string {
  const normalized = preprocessCallouts(preprocessSuperSub(normalizeNoSpaceAtxHeadings(markdown)))
  const file = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeRemoveClassPlugin)
    .use(rehypeStringify)
    .processSync(normalized)
  return String(file)
}
