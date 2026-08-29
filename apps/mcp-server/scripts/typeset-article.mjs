/**
 * MCP 客户端示例：用 mp-style MCP Server 排版一篇 Markdown 文章。
 * 链路：analyze_article → list_themes → generate_theme(LLM) → render_preview → validate_article。
 *
 * 用法：node scripts/typeset-article.mjs <markdown路径> [主题提示词] [输出目录]
 *  - 默认输出到 <markdown 同目录>/typeset-out/（可用第 3 参覆盖）。
 *  - 需先 `pnpm --filter @mp-style/mcp-server build`，并按文档配置 LLM 环境变量。
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, basename } from 'node:path'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serverEntry = resolve(__dirname, '../dist/index.js')

const mdPath = process.argv[2]
const THEME_PROMPT =
  process.argv[3] ||
  '文艺随笔、人文纪实风格：杂志质感，标题用主色+渐变下划线，引用块用装饰性左侧色带+浅底色，正文宽松行距、两端对齐，列表/代码/表格都有细腻分隔与点缀，整体克制而精致'
if (!mdPath) {
  console.error('用法: node typeset-article.mjs <markdown路径> [主题提示词] [输出目录]')
  process.exit(1)
}
const markdown = readFileSync(mdPath, 'utf8')
const title = basename(mdPath, '.md')
const outDir = process.argv[4] ? resolve(process.argv[4]) : resolve(dirname(mdPath), 'typeset-out')

// MCP 默认 60s 超时不够 LLM 重活（生成主题含修复循环 + 示例渲染），用更长超时
const LONG = { timeout: 240000, maxTotalTimeout: 300000 }
function call(client, name, args, long = false) {
  return client.callTool({ name, arguments: args }, undefined, long ? LONG : undefined)
}
const PRESET_BY_TYPE = { literary: 'magazine', essay: 'magazine', tech: 'tech-minimal', business: 'business', news: 'gov-red' }

async function main() {
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverEntry, '--transport', 'stdio'], env: { ...process.env } })
  const client = new Client({ name: 'mp-style-typeset', version: '1.0.0' })
  await client.connect(transport)
  console.log('[MCP] tools:', (await client.listTools()).tools.map((t) => t.name).join(', '))

  // 1) analyze
  const analyze = JSON.parse((await call(client, 'analyze_article', { markdown })).content[0].text)
  console.log('\n【文章分析】 类型:', analyze.content.type, '| 情绪:', analyze.content.tone, '| 字数:', analyze.content.wordCount)

  // 2) list_themes
  const themes = JSON.parse((await call(client, 'list_themes', {})).content[0].text)
  console.log('【预置主题】', themes.themes.length, '套')

  // 3) generate_theme（LLM 定制）——超时/失败回退到预置
  let theme = null
  let note = ''
  try {
    const genResp = await call(client, 'generate_theme', { article: markdown, prompt: THEME_PROMPT }, true)
    const gen = JSON.parse(genResp.content[0].text)
    if (gen.error) {
      theme = gen.error
      note = 'LLM不可用→' + gen.error.code
    } else {
      theme = gen.theme
      console.log('【LLM 生成主题】', gen.theme.name, '| fallback=', gen.fallback, '| 修复=', gen.repairAttempts)
    }
  } catch (e) {
    theme = null
    note = 'LLM异常→' + e.message
  }
  if (!theme || theme.error) {
    const fallbackName = PRESET_BY_TYPE[analyze.content.type] || 'basic'
    console.log('[theme]', note, '→ 改用预置主题:', fallbackName)
    theme = themes.themes.find((t) => t.name === fallbackName) || themes.themes[0]
  }

  // 4) render_preview
  const renderResp = await call(client, 'render_preview', { markdown, theme }, true)
  const render = JSON.parse(renderResp.content.find((c) => c.type === 'text').text)
  const img = renderResp.content.find((c) => c.type === 'image')

  // 5) validate_article
  const val = JSON.parse((await call(client, 'validate_article', { html: render.html })).content[0].text)
  console.log('【渲染】html', render.html.length, '字 | 校验 pass=', render.validation?.pass, '| issues=', (render.validation?.issues || []).length)

  // 保存输出
  mkdirSync(outDir, { recursive: true })
  const htmlFile = resolve(outDir, `${title}.html`)
  writeFileSync(htmlFile, render.html, 'utf8')
  let pngFile = null
  if (img?.data) {
    pngFile = resolve(outDir, `${title}.png`)
    writeFileSync(pngFile, Buffer.from(img.data, 'base64'))
  }
  const reportFile = resolve(outDir, 'report.json')
  writeFileSync(reportFile, JSON.stringify({ analyze: analyze.content, theme, validation: val.report }, null, 2), 'utf8')

  console.log('【已保存】')
  console.log('  HTML :', htmlFile)
  if (pngFile) console.log('  截图 :', pngFile)
  console.log('  报告 :', reportFile)
  await client.close()
}

main().catch((e) => {
  console.error('[typeset] 失败:', e.message)
  process.exit(1)
})
