/**
 * 往返验证：Markdown → HTML → Markdown → HTML，检查组件指令是否被完整还原。
 * 运行：node --env-file=.env apps/mcp-server/scripts/verify-html-roundtrip.mjs [markdown路径] [主题名]
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderMarkdownToHtml } from '@stylewx/core'
import { getPresetTheme } from '@stylewx/theme'
import { htmlToMarkdown } from '@stylewx/components'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../../..')
const mdPath = resolve(process.argv[2] ?? resolve(repoRoot, 'examples/component-showcase.md'))
const themeName = process.argv[3] ?? 'magazine'
const theme = getPresetTheme(themeName)
if (!theme) throw new Error(`找不到主题 ${themeName}`)

const source = readFileSync(mdPath, 'utf8')
const first = renderMarkdownToHtml(source, theme)
const imported = htmlToMarkdown(first.html)
const second = renderMarkdownToHtml(imported.markdown, theme)

/** 提取组件标记序列。 */
function markers(html) {
  const out = []
  const re = /<[a-zA-Z][^>]*\sdata-swx="([^"]+)"[^>]*>/g
  let m
  while ((m = re.exec(html)) !== null) {
    const tag = m[0]
    const props = /data-swx-props="([^"]*)"/.exec(tag)?.[1] ?? ''
    const src = /data-swx-src="([^"]*)"/.exec(tag)?.[1] ?? ''
    out.push(`${m[1]}?${props}${src ? '&__src=' + src : ''}`)
  }
  return out
}

const a = markers(first.html)
const b = markers(second.html)

console.log('[roundtrip] 原文组件数 =', a.length, '| 回导后组件数 =', b.length)
let ok = 0
const max = Math.max(a.length, b.length)
for (let i = 0; i < max; i += 1) {
  const same = a[i] === b[i]
  if (same) ok += 1
  else console.log(`  ❌ #${i}\n     原: ${a[i]}\n     回: ${b[i]}`)
}
console.log(`[roundtrip] 组件标记一致 = ${ok}/${max}`)

// 文本内容对比（去掉标签后）
const strip = (h) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, '')
console.log('[roundtrip] 纯文本一致 =', strip(first.html) === strip(second.html))
console.log('[roundtrip] 标题 =', JSON.stringify(imported.title))
console.log('[roundtrip] 警告 =', imported.warnings.length ? imported.warnings : '（无）')
console.log('[roundtrip] 回导 Markdown 长度 =', imported.markdown.length)

process.exit(ok === max && strip(first.html) === strip(second.html) ? 0 : 1)
