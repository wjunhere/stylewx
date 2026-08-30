/**
 * AI 优化文章正文（供本地编辑器「AI 优化」使用）。
 * 用 LLM 在不改变事实与主旨的前提下改进标题、结构与文风，返回优化后的 Markdown。
 * 支持：
 *  - prompt：额外自定义优化要求（可选）；
 *  - selection：{ start, end } 只优化该片段（可选），其余部分原样返回（由调用方拼回）。
 * 需要配置 LLM 环境变量；缺 LLM 时抛出清晰错误。
 */
import type { LlmClient, LlmMessage } from './llm.js'
import { serviceError } from './errors.js'

export interface OptimizeResult {
  /** 优化后的 Markdown。若只优化片段，则是优化后的该片段本身。 */
  markdown: string
}

export interface OptimizeOptions {
  /** 用户自定义优化要求（可选）。 */
  prompt?: string
  /** 只优化 markdown 中 [start, end) 这段；缺省则优化整篇。 */
  selection?: { start: number; end: number }
}

const SYSTEM_PROMPT = [
  '你是公众号文章优化助手。请在不改变事实与主旨的前提下，优化下面这篇 Markdown 文章：',
  '1. 改进第一行的标题（通常以 # 开头），让它更有吸引力；',
  '2. 优化小标题的层级与结构，让逻辑更清晰；',
  '3. 让语句更通顺、段落衔接更自然；',
  '4. 保留所有 Markdown 语法（列表、引用、表格、代码块、加粗、斜体、高亮等）与结构。',
  '只输出优化后的完整 Markdown 正文本身，不要任何解释、前言，也不要额外用三反引号把整篇包起来。',
].join('\n')

const FRAGMENT_SYSTEM = [
  '你是公众号文章优化助手。请只优化下面这一小段文章片段：',
  '1. 保持原意与事实不变，只让语句更通顺、删掉啰嗦表达；',
  '2. 保留片段里所有的 Markdown 语法（加粗/斜体/列表/链接/引用等）与结构；',
  '3. 不要展开、不要新增与原文无关的内容，也不要在开头补标题。',
  '只输出优化后的这一小段本身，不要任何解释、前言，也不要用三反引号把它包起来。',
].join('\n')

export async function optimizeArticle(
  markdown: string,
  llm: LlmClient,
  options: OptimizeOptions = {},
): Promise<OptimizeResult> {
  const { prompt, selection } = options
  const sel =
    selection && Number.isInteger(selection.start) && Number.isInteger(selection.end) && selection.end > selection.start
      ? selection
      : undefined
  const target = sel ? markdown.slice(sel.start, sel.end) : markdown
  if (!target.trim()) {
    throw serviceError('missing_content', '缺少要优化的内容。', '请先输入 Markdown，或选中要优化的片段。')
  }

  const user: string[] = []
  if (prompt && prompt.trim()) user.push('【本次优化要求】\n' + prompt.trim())
  if (sel) user.push('【待优化的片段（只调优这一小段）】\n' + target)
  else user.push(target)

  const messages: LlmMessage[] = [
    { role: 'system', content: sel ? FRAGMENT_SYSTEM : SYSTEM_PROMPT },
    { role: 'user', content: user.join('\n\n') },
  ]
  const out = await llm.completeText(messages, { temperature: 0.7 })
  return { markdown: out.trim() }
}
