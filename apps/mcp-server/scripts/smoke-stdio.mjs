/**
 * stdio 端到端冒烟脚本：
 * 1) 以 stdio 模式启动 stylewx MCP Server 真实进程；
 * 2) 用官方 Client 连接，列出 tools；
 * 3) 调用 analyze_article / render_preview / validate_article / publish_draft，输出关键结果。
 *
 * 运行：`pnpm --filter @stylewx/mcp-server exec node scripts/smoke-stdio.mjs`
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { readFileSync } from 'node:fs'
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

  // 握手元数据：每次 push 都跑的真实进程 + 真实 Client，所以这里顺手守住版本号。
  // 曾经 SERVER_VERSION 硬编码成 '0.1.0'，连发三个版本没人发现 —— 就是因为
  // 单测用 in-memory 传输、从不读握手返回值，而本脚本虽然起了真进程却没断言版本。
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'))
  const info = client.getServerVersion()
  assert(info?.name === 'stylewx', `serverInfo.name 应为 stylewx，实际 ${info?.name}`)
  assert(
    info?.version === pkg.version,
    `握手版本 ${info?.version} 与 package.json 的 ${pkg.version} 不一致`,
  )
  console.log('[smoke] serverInfo =', info.name, info.version)

  // 只断言核心工具存在，不锁死总数：工具会随版本增加，锁总数只会让冒烟脚本变成噪音。
  const expected = ['list_themes', 'analyze_article', 'generate_theme', 'render_preview', 'validate_article', 'publish_draft', 'list_saved_themes', 'save_theme', 'export_theme']
  for (const name of expected) assert(tools.some((t) => t.name === name), `缺少 tool: ${name}`)
  assert(tools.length >= expected.length, `工具数应不少于核心工具数，实际 ${tools.length}`)

  // analyze
  const analyze = await client.callTool({ name: 'analyze_article', arguments: { markdown: '讲前端框架与性能优化。' } })
  const analyzeData = JSON.parse(analyze.content[0].text)
  console.log('[smoke] analyze_article.type =', analyzeData.content.type)
  assert(analyzeData.content.type === 'tech', 'analyze 应识别为 tech')

  // generate_theme：无 LLM 凭据 → 必须返回清晰错误（不静默失败）；
  // 若环境里配了 LLM（如本地 `--env-file=.env` 运行），则只要求返回合法主题。
  const gen = await client.callTool({ name: 'generate_theme', arguments: { prompt: '科技风' } })
  const genData = JSON.parse(gen.content[0].text)
  if (gen.isError === true) {
    assert(genData.error.code === 'missing_llm_config', '错误码应为 missing_llm_config')
    console.log('[smoke] generate_theme (无 LLM) =', genData.error.code)
  } else {
    assert(genData.theme, 'generate_theme 成功时应返回 theme')
    console.log('[smoke] generate_theme (有 LLM) =', genData.theme.name ?? 'ok')
  }

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
