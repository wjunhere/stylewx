/**
 * Mermaid 微信端实测（三档证据链的 API 层，AGENTS.md §6）：
 *   mermaid 源码 → 服务端 Chromium 出 PNG → 发布时搬微信素材库 → draft/get 回读核对。
 *
 * 运行：node apps/mcp-server/scripts/probe-mermaid-wechat.mjs
 * 注意：会真实写入一条测试草稿（标题带 [probe] 前缀，可在后台删除）。
 */
import { renderPreview } from '@stylewx/service'
import { publishDraft, loadConfigFromEnv, WeChatClient } from '@stylewx/publisher'
import { readImageAssetByUrl } from '@stylewx/service'
import { buildPalette } from '@stylewx/components'
import { getPresetTheme } from '@stylewx/theme'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const envPath = resolve('B:/wechat_editer', '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const NL = String.fromCharCode(10)
const md = [
  '# Mermaid 微信兼容性探针',
  '',
  ':::mermaid{caption="发布流程图"}',
  'graph TD',
  '  A[写文章] --> B{AI 排版}',
  '  B -->|通过| C[渲染预览]',
  '  B -->|不通过| A',
  '  C --> D[发布草稿箱]',
  ':::',
].join(NL) + NL

console.log('1) 渲染（含 mermaid 出图）…')
const theme = getPresetTheme('tech-minimal')
const { html } = await renderPreview(md, theme, { includeScreenshot: false })
if (!html.includes('/editor/api/asset/')) {
  console.log('   ✗ 未生成图片资产，中止。')
  process.exit(1)
}
console.log('   ✓ 图片已落本地资产库')

console.log('2) 发布测试草稿（draft/add + relocate）…')
const config = loadConfigFromEnv()
const client = new WeChatClient(config)
const result = await publishDraft(client, {
  content: html,
  title: '[probe] mermaid 兼容性测试 · 可删除',
  relocate: true,
  resolveLocal: (src) => readImageAssetByUrl(src) || undefined,
  coverPalette: (() => {
    const p = buildPalette(theme.tokens)
    return { top: p.primaryStrong, bottom: p.primarySoft }
  })(),
})
console.log('   media_id:', result.media_id)
console.log('   搬运图片:', result.uploadedImages.length, '张')
for (const u of result.uploadedImages) console.log('    ', (u.url || '').slice(0, 60))

console.log('3) 回读草稿（draft/get）…')
const token = await client.getAccessToken()
const res = await fetch(`${config.baseUrl}/cgi-bin/draft/get?access_token=${encodeURIComponent(token)}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ media_id: result.media_id }),
})
const draft = await res.json()
if (draft.errcode) {
  console.error('   draft/get 失败:', draft.errcode, draft.errmsg)
  process.exit(1)
}
const stored = draft.news_item?.[0]?.content ?? ''
const hasImgTag = /<img[^>]+src=/.test(stored)
const hasMmbiz = stored.includes('mmbiz.qpic.cn')
const svgBroken = stored.includes('url(#')
console.log('   回读正文', stored.length, '字符 | 含 <img>:', hasImgTag, '| src 指向 mmbiz:', hasMmbiz, '| 含 url(#id):', svgBroken)

console.log('\n结论:', hasImgTag && hasMmbiz && !svgBroken
  ? '✓ mermaid 渲染图在微信草稿中存活（图片走 mmbiz 图床，读者端可显示）'
  : '✗ 需人工核对')
process.exit(0)
