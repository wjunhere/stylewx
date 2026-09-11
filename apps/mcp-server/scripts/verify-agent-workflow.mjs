/**
 * 模拟 agent 的完整排版工作流（真实 MCP stdio 调用）：
 *   list_components → tweak_theme → render_fragment ×2 → render_preview
 *   → validate_article → save_article → 用 editorUrl 从编辑器端点读回
 *
 * 运行：node apps/mcp-server/scripts/verify-agent-workflow.mjs
 * 需要：已 build；本地编辑器在 3777 跑着（用于最后的交接读回）。
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serverEntry = resolve(__dirname, '../dist/index.js')

const section1 = [
  ':::cover{title="分步排版演示" subtitle="INCREMENTAL"}',
  ':::',
  '',
  ':::pulse{text="全文约 800 字，阅读 3 分钟"}',
  ':::',
  '',
  '## 一、为什么要分步',
  '',
  '一次性生成整篇，改一处就要全部重来。',
  '',
].join('\n')

const section2 = [
  ':::section-title{index="02" title="逐段验证"}',
  ':::',
  '',
  ':::timeline{title="流程"}',
  '- 写一节 | 先用 render_fragment 验证',
  '- 再写下一节 | 有问题就地改',
  ':::',
  '',
  ':::card{title="关键"}',
  '组件按语义选，一篇文章 3~6 个就够。',
  ':::',
  '',
  ':::end-card{title="感谢阅读"}',
  ':::',
  '',
].join('\n')

function assert(cond, msg) {
  if (!cond) throw new Error('断言失败: ' + msg)
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntry, '--transport', 'stdio'],
  env: { ...process.env },
})
const client = new Client({ name: 'stylewx-workflow', version: '1.0.0' })
await client.connect(transport)

const call = async (name, args) => {
  const res = await client.callTool({ name, arguments: args })
  const text = res.content.find((c) => c.type === 'text')?.text ?? '{}'
  return JSON.parse(text)
}

// 0) 工具面
const tools = (await client.listTools()).tools.map((t) => t.name).sort()
console.log('[0] 工具数 =', tools.length)
assert(tools.length === 15, '应有 15 个工具')
assert(tools.includes('tweak_theme') && tools.includes('render_fragment') && tools.includes('save_article'), '缺新工具')

// 1) 查组件
const comps = await call('list_components', { category: 'structure' })
console.log('[1] structure 组件 =', comps.components.map((c) => c.name).join(', '))
assert(comps.components.length >= 6, 'structure 组件应 ≥6')

// 2) 微调主题（确定性，秒回）
const tweaked = await call('tweak_theme', {
  theme: 'tech-minimal',
  tokens: { primaryColor: '#7c3aed', radius: '14px', fontSize: '15.5px' },
})
console.log('[2] tweak_theme changed =', tweaked.changed.join(', '))
assert(tweaked.ok === true, '微调应成功')
assert(tweaked.theme.tokens.primaryColor === '#7c3aed', '主色应已改')
const theme = tweaked.theme

// 3) 逐段渲染（默认不回 HTML）
const f1 = await call('render_fragment', { markdown: section1, theme, includeScreenshot: false })
console.log('[3a] 第一段组件 =', f1.components.map((c) => c.name).join(', '), '| pass =', f1.validation.pass)
assert(f1.html === undefined, '默认不应返回 HTML')
assert(f1.components.some((c) => c.name === 'cover'), '第一段应识别 cover')

const f2 = await call('render_fragment', { markdown: section2, theme, includeScreenshot: false })
console.log('[3b] 第二段组件 =', f2.components.map((c) => c.name).join(', '), '| pass =', f2.validation.pass)
assert(f2.components.some((c) => c.name === 'timeline'), '第二段应识别 timeline')

// 4) 整篇渲染 + 校验
const full = [section1, section2].join('\n')
const preview = await call('render_preview', { markdown: full, theme })
console.log('[4] render_preview html =', preview.html.length, '| pass =', preview.validation.pass)
assert(preview.validation.pass === true, '整篇校验应通过')
const errors = preview.validation.issues.filter((i) => i.severity === 'error')
assert(errors.length === 0, '不应有 error 级问题')

// 5) 落盘交接
const saved = await call('save_article', {
  markdown: full,
  title: '分步排版演示',
  path: 'examples/handoff-out/agent-workflow.md',
})
console.log('[5] save_article =', saved.path, '|', saved.editorUrl)

// 6) 用 editorUrl 读回，确认交接闭环
const url = new URL(saved.editorUrl)
const file = url.searchParams.get('file') ?? ''
const res = await fetch(`${url.origin}/editor/api/load-file?file=${encodeURIComponent(file)}`)
const back = await res.json()
console.log('[6] 读回长度 =', (back.markdown ?? '').length, '| 一致 =', back.markdown === full)
assert(back.markdown === full, '读回内容应与落盘一致')

await client.close()
console.log('\n✅ 分步工作流端到端通过（15 工具 / 微调 / 逐段 / 整篇 / 交接读回）')
