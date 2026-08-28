/**
 * stdio 端到端冒烟脚本：
 * 1) 以 stdio 模式启动 mp-style MCP Server 真实进程；
 * 2) 用官方 Client 连接，列出 tools；
 * 3) 调用 analyze_article / render_preview / validate_article / publish_draft，输出关键结果。
 *
 * 运行：`pnpm --filter @mp-style/mcp-server exec node scripts/smoke-stdio.mjs`
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serverEntry = resolve(__dirname, '../dist/index.js')

function assert(cond, msg) {
  if (!cond) throw new Error('断言失败：' + msg)
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry, '--transport', 'stdio'],
  })
  const client = new Client({ name: 'smoke', version: '0.0.0' })
  await client.connect(transport)

  const { tools } = await client.listTools()
  console.log('[smoke] 已列出 tools:', tools.map((t) => t.name).join(', '))
  assert(tools.length === 6, `期望 6 个 tools，实际 ${tools.length}`)

  const expected = ['list_themes', 'analyze_article', 'generate_theme', 'render_preview', 'validate_article', 'publish_draft']
  for (const name of expected) assert(tools.some((t) => t.name === name), `缺少 tool: ${name}`)

  // analyze
  const analyze = await client.callTool({ name: 'analyze_article', arguments: { markdown: '讲前端框架与性能优化。' } })
  const analyzeData = JSON.parse(analyze.content[0].text)
  console.log('[smoke] analyze_article.type =', analyzeData.content.type)
  assert(analyzeData.content.type === 'tech', 'analyze 应识别为 tech')

  // generate_theme (无 LLM 凭据 → 返回清晰错误，证明不静默失败；配置 LLM 后返回合法主题)
  const gen = await client.callTool({ name: 'generate_theme', arguments: { prompt: '科技风' } })
  assert(gen.isError === true, '无 LLM 配置时 generate_theme 应返回 error')
  const genData = JSON.parse(gen.content[0].text)
  assert(genData.error.code === 'missing_llm_config', '错误码应为 missing_llm_config')
  console.log('[smoke] generate_theme (无 LLM) =', genData.error.code)

  // render_preview
  const themeList = JSON.parse((await client.callTool({ name: 'list_themes', arguments: {} })).content[0].text)
  const tech = themeList.themes.find((t) => t.name === 'tech-minimal')
  const render = await client.callTool({
    name: 'render_preview',
    arguments: { markdown: '# 标题\n\n正文段落。\n\n- 项一\n- 项二\n', theme: tech },
  })
  const renderData = JSON.parse(render.content.find((c) => c.type === 'text').text)
  console.log('[smoke] render_preview: html 长度=', renderData.html.length, 'pass=', renderData.validation.pass, 'image=', render.content.some((c) => c.type === 'image'))
  assert(!renderData.html.includes('<style'), 'render 输出不应含 <style>')
  assert(!renderData.html.includes('class='), 'render 输出不应含 class=')
  assert(renderData.validation.pass === true, '校验应通过')

  // validate with error case
  const val = await client.callTool({ name: 'validate_article', arguments: { html: '<section><script>x</script></section>' } })
  const valData = JSON.parse(val.content[0].text)
  assert(valData.report.pass === false, '含 script 应校验失败')
  console.log('[smoke] validate_article 违规规则 =', valData.report.issues.map((i) => i.rule).join(', '))

  // publish without creds -> error
  const pub = await client.callTool({ name: 'publish_draft', arguments: { title: 'x', html: '<p>a</p>' } })
  assert(pub.isError === true, '无微信凭据发布应返回 error')
  const pubData = JSON.parse(pub.content[0].text)
  assert(pubData.error.code === 'missing_wechat_credential', '错误码应为 missing_wechat_credential')
  console.log('[smoke] publish_draft (无凭据) =', pubData.error.code)

  await client.close()
  console.log('\n[smoke] 全部通过 ✔  stdio MCP Server 可按预期工作。')
}

main().catch((error) => {
  console.error('[smoke] 失败:', error.message)
  process.exit(1)
})
