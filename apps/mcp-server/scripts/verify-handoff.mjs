/**
 * 交接闭环验证：save_article 落盘 → 用返回的 editorUrl 从编辑器端点读回。
 * 运行：node --env-file=.env apps/mcp-server/scripts/verify-handoff.mjs
 *
 * 需要本地编辑器服务已在跑（node apps/mcp-server/scripts/editor.mjs .env 3777）。
 */
import { saveArticle } from '@stylewx/service'

const markdown = [
  '# 交接闭环验证',
  '',
  ':::cover{title="交接闭环验证" subtitle="HANDOFF"}',
  ':::',
  '',
  ':::card{title="在编辑器里接着改"}',
  '正文一段。',
  ':::',
  '',
].join('\n')

const saved = saveArticle({ markdown, title: '交接闭环验证', path: 'examples/handoff-out/verify-handoff.md' })
console.log('[handoff] 落盘 =', saved.path, `(${saved.bytes} 字节)`)
console.log('[handoff] editorUrl =', saved.editorUrl)

const url = new URL(saved.editorUrl)
const file = url.searchParams.get('file') ?? ''
const res = await fetch(`${url.origin}/editor/api/load-file?file=${encodeURIComponent(file)}`)
const data = await res.json()
if (data.error) {
  console.error('[handoff] 读回失败：', data.error)
  process.exit(1)
}
console.log('[handoff] 读回标题 =', JSON.stringify(data.title))
console.log('[handoff] 读回长度 =', data.markdown.length)
console.log('[handoff] 内容一致 =', data.markdown === markdown)
process.exit(data.markdown === markdown ? 0 : 1)
