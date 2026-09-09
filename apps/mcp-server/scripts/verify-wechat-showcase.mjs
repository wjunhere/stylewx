/**
 * 真实微信端验证：把 examples/component-showcase.md 渲染后发布到草稿箱，
 * 再通过 draft/get 取回，逐项核对「富组件是否在微信侧存活」。
 *
 * 运行：node --env-file=.env apps/mcp-server/scripts/verify-wechat-showcase.mjs [markdown路径] [主题名]
 *
 * 会真实写入一条草稿（标题带 [verify] 前缀，可在公众号后台手动删除）。
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderPreview } from '@stylewx/service'
import { getPresetTheme } from '@stylewx/theme'
import { loadConfigFromEnv, WeChatClient, publishDraft } from '@stylewx/publisher'
import { htmlToMarkdown } from '@stylewx/components'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../../..')
const mdPath = resolve(process.argv[2] ?? resolve(repoRoot, 'examples/component-showcase.md'))
const themeName = process.argv[3] ?? 'magazine'

const markdown = readFileSync(mdPath, 'utf8')
const theme = getPresetTheme(themeName)
if (!theme) throw new Error(`找不到主题 ${themeName}`)

const rendered = await renderPreview(markdown, theme, { includeScreenshot: false })
console.log('[verify] 渲染完成，HTML', rendered.html.length, '字符 | 校验 pass =', rendered.validation.pass)

const config = loadConfigFromEnv()
const client = new WeChatClient(config)
const published = await publishDraft(client, {
  title: `[verify] 富组件端到端验证 ${new Date().toISOString().slice(0, 16)}`,
  content: rendered.html,
})
console.log('[verify] 草稿 media_id =', published.media_id)
console.log('[verify] 图片搬运：成功', published.uploadedImages.length, '失败', published.failedImages.length)
for (const f of published.failedImages) console.log('   [搬运失败]', f.src.slice(0, 70), '-', f.reason.slice(0, 80))

const token = await client.getAccessToken()
const res = await fetch(`${config.apiBase ?? 'https://api.weixin.qq.com'}/cgi-bin/draft/get?access_token=${token}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ media_id: published.media_id }),
})
const draft = await res.json()
if (draft.errcode) throw new Error(`draft/get 失败：${draft.errcode} ${draft.errmsg}`)
const stored = draft.news_item?.[0]?.content ?? ''

const checks = [
  ['SVG 标签', '<svg'],
  ['SMIL animate', '<animate'],
  ['点击交互 begin="click"', 'begin="click"'],
  ['自动循环 repeatcount', 'repeatcount'],
  ['轮播 SVG <image>', '<image'],
  ['描边动画 stroke-dashoffset', 'stroke-dashoffset'],
  ['CSS 渐变', 'linear-gradient'],
  ['纹理背景 repeating-linear-gradient', 'repeating-linear-gradient'],
  ['flex 布局', 'display:flex'],
  ['圆角 border-radius', 'border-radius'],
  ['阴影 box-shadow', 'box-shadow'],
  ['封面标题', '把公众号排版做成一门手艺'],
  ['目录', '本文目录'],
  ['卡片', '三个可复用的原则'],
  ['时间线', '我们踩过的坑'],
  ['步骤条', '先定层级'],
  ['对比', '只做加粗'],
  ['引用卡片', '读者不会记得'],
  ['点击展开', '点击查看'],
  ['进度条', '组件库完成度'],
  ['标签徽章', '新功能'],
  ['结尾卡片', '感谢阅读'],
  ['图注', '一张有呼吸感的配图'],
]

console.log('\n[verify] 微信侧存活核对：')
let ok = 0
for (const [label, needle] of checks) {
  const pass = stored.includes(needle)
  if (pass) ok += 1
  console.log(`  ${pass ? '✅' : '❌'} ${label}`)
}
console.log(`\n[verify] ${ok}/${checks.length} 项存活`)

// 明确不该出现的东西
const forbidden = [
  ['<script', 'script 标签'],
  ['class=', 'class 属性'],
  ['href="#', '页内锚点'],
]
for (const [needle, label] of forbidden) {
  console.log(`  ${stored.includes(needle) ? '⚠️ 仍存在' : '✅ 已无'} ${label}`)
}
console.log(`\n[verify] 取回正文长度 = ${stored.length}（发送前 ${rendered.html.length}）`)

// ---- 从微信取回的 HTML 反向导入，验证组件可还原 ----
const back = htmlToMarkdown(stored)
const expectedNames = ['cover', 'toc', 'card', 'gallery', 'carousel', 'timeline', 'steps', 'compare', 'quote', 'reveal', 'progress', 'pulse', 'divider', 'badge', 'end-card', 'canvas']
const backNames = back.components.map((c) => c.name)
console.log(`\n[verify] 从微信 HTML 回导：识别到 ${back.components.length} 个组件，标题 = ${JSON.stringify(back.title)}`)
let recovered = 0
for (const name of expectedNames) {
  const hit = backNames.includes(name)
  if (hit) recovered += 1
  console.log(`  ${hit ? "✅" : "❌"} :::${name}`)
}
const cover = back.components.find((c) => c.name === "cover")
const canvasFence = back.markdown.includes("::::canvas")
console.log(`\n[verify] 组件还原 ${recovered}/${expectedNames.length} | cover.title=${JSON.stringify(cover?.props.title)} | 嵌套冒号=${canvasFence}`)
console.log(`[verify] 回导 Markdown 长度 = ${back.markdown.length}，警告 ${back.warnings.length} 条`)

process.exit(ok === checks.length && recovered === expectedNames.length && canvasFence ? 0 : 1)
