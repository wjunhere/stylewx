/** 文本度量与折行（用于 SVG 内无法自动换行的文本）。 */

/** 估算一段文本的视觉宽度（以 em 为单位）：CJK 记 1，其余记 0.55。 */
export function measureEm(text: string): number {
  let width = 0
  for (const ch of text) {
    if (/[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch)) width += 1
    else if (/\s/.test(ch)) width += 0.3
    else width += 0.55
  }
  return width
}

/**
 * 按可用宽度折行。不会拆开连续的拉丁单词（超长时强制拆）。
 * @param text 原始文本（可含换行，换行视为强制断行）
 * @param maxEm 每行最大宽度（em）
 */
export function wrapText(text: string, maxEm: number): string[] {
  const out: string[] = []
  for (const paragraph of String(text).split(/\r?\n/)) {
    if (paragraph === '') {
      out.push('')
      continue
    }
    let line = ''
    let width = 0
    const flush = () => {
      if (line) out.push(line)
      line = ''
      width = 0
    }
    // 以「拉丁词 / 单个 CJK 字符」为单位推进
    const tokens = paragraph.match(/[A-Za-z0-9@._%+\-/]+|\s+|[^\sA-Za-z0-9@._%+\-/]/g) ?? []
    for (const token of tokens) {
      const w = measureEm(token)
      if (width + w > maxEm && line.trim()) {
        flush()
        if (/^\s+$/.test(token)) continue
      }
      if (w > maxEm) {
        // 单个超长 token 强制拆
        for (const ch of token) {
          const cw = measureEm(ch)
          if (width + cw > maxEm && line) flush()
          line += ch
          width += cw
        }
        continue
      }
      line += token
      width += w
    }
    flush()
  }
  return out.length ? out : ['']
}

/** 截断文本到指定视觉宽度，超出加省略号。 */
export function truncateEm(text: string, maxEm: number): string {
  if (measureEm(text) <= maxEm) return text
  let out = ''
  let width = 0
  for (const ch of text) {
    const w = measureEm(ch)
    if (width + w > maxEm - 1) break
    out += ch
    width += w
  }
  return out + '…'
}
