/**
 * 渲染整篇 → 落 html → 截图终态。
 * 走仓库自己的 service/renderPreview（dist），不用 MCP：MCP 会回一张 base64 大图，白吃上下文。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderPreview } from '../packages/service/dist/index.js'
import { chromium } from '../packages/preview/node_modules/playwright/index.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REVIEW = join(HERE, 'review')
mkdirSync(REVIEW, { recursive: true })

const md = readFileSync(process.argv[2] ?? join(HERE, '..', 'articles', '关于部分高校寄成绩单的思考-嬉皮青年.md'), 'utf8')
const theme = JSON.parse(readFileSync(join(process.env.USERPROFILE, '.stylewx/brands/hippie-youth/profile.json'), 'utf8')).theme

const preview = await renderPreview(md, theme, {})
writeFileSync(join(REVIEW, 'article.json'), JSON.stringify({ html: preview.html, validation: preview.validation ?? null }, null, 1))

const page_html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#e9e5dd;display:flex;justify-content:center;padding:24px">
<div id="phone" style="width:390px;background:#fff">${preview.html}</div></body></html>`
writeFileSync(join(REVIEW, 'phone.html'), page_html, 'utf8')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 470, height: 1200 }, deviceScaleFactor: 2 })
await page.setContent(page_html)
// 把所有 SMIL 钉到终态：截图必须是「读者最终看到的样子」
await page.evaluate(() => { for (const s of document.querySelectorAll('svg')) { s.setCurrentTime?.(8); s.pauseAnimations?.() } })
await page.waitForTimeout(250)
await page.locator('#phone').screenshot({ path: join(REVIEW, 'final.png') })
const h = await page.locator('#phone').evaluate((el) => el.scrollHeight)
console.log('页面高度(px@2x):', h)
await browser.close()
process.exit(0)
