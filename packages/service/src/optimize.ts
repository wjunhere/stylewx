/**
 * AI 优化文章正文（供本地编辑器「AI 优化」按钮使用）。
 * 用 LLM 在不改变事实与主旨的前提下改进标题、结构与文风，返回优化后的 Markdown。
 * 需要配置 LLM 环境变量；缺 LLM 时抛出清晰错误。
 */
import type { LlmClient, LlmMessage } from './llm.js'
import { serviceError } from './errors.js'

export interface OptimizeResult {
  /** 优化后的完整 Markdown 正文。 */
  markdown: string
}

const SYSTEM_PROMPT = [
  '你是公众号文章优化助手。请在不改变事实与主旨的前提下，优化下面这篇 Markdown 文章：',
  '1. 改进第一行的标题（通常以 # 开头），让它更有吸引力；',
  '2. 优化小标题的层级与结构，让逻辑更清晰；',
  '3. 让语句更通顺、段落衔接更自然；',
  '4. 保留所有 Markdown 语法（列表、引用、表格、代码块、加粗、斜体、高亮等）与结构。',
  '只输出优化后的完整 Markdown 正文本身，不要任何解释、前言，也不要额外用三反引号把整篇包起来。',
].join('\n')

export async function optimizeArticle(markdown: string, llm: LlmClient): Promise<OptimizeResult> {
  if (!markdown.trim()) {
    throw serviceError('missing_content', '缺少文章正文。', '请先在编辑器里输入 Markdown 内容，再点「AI 优化」。')
  }
  const messages: LlmMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: markdown },
  ]
  const out = await llm.completeText(messages, { temperature: 0.7 })
  return { markdown: out.trim() }
}
