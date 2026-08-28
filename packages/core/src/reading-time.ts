/**
 * 把「标记的正文时间」估算出来 —— 中英文混合的阅读时长估算。
 * 纯函数，无 DOM / Node 依赖。
 */

/** 去掉所有空白与 Markdown 语法符号，返回纯文本字数。 */
export function countWords(markdown: string): number {
  const stripped = removeMarkdownSyntax(markdown)
  // 中文按字符计（大约 1 字 = 1 词），英文按单词计。
  const cjk = stripped.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length ?? 0
  const latin = stripped
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ')
    .match(/[a-zA-Z0-9]+/g)?.length ?? 0
  return cjk + latin
}

/** 估算阅读时长（分钟）。手机端中文约 350 字/分钟。 */
export function estimateReadingMinutes(markdown: string): number {
  const words = countWords(markdown)
  if (words <= 0) return 1
  return Math.max(1, Math.ceil(words / 350))
}

/**
 * 简单剥离 Markdown 语法（用于字数统计）。尽可能逼近纯文本。
 */
function removeMarkdownSyntax(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ') // 代码块
    .replace(/`[^`]*`/g, ' ') // 内联代码
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接
    .replace(/^\s{1,4}#{1,6}\s+/gm, ' ') // 标题
    .replace(/^\s*[-*+]\s+/gm, ' ') // 列表
    .replace(/^\s*>\s?/gm, ' ') // 引用
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1') // 强调 / 删除线
    .replace(/\|/g, ' ') // 表格分隔
    .replace(/\s+/g, ' ')
}
