/** 截「已从草稿箱取回的那份 HTML」——验证线上内容，不是本地渲染结果。 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '../packages/preview/node_modules/playwright/index.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(join(HERE, 'review/published.html'), 'utf8')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 470, height: 1200 }, deviceScaleFactor: 2 })
await page.setContent(`<!doctype html><html lang="zh"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#e9e5dd;display:flex;justify-content:center;padding:24px">
<div id="phone" style="width:390px;background:#fff">${html}</div></body></html>`)
await page.evaluate(() => { for (const s of document.querySelectorAll('svg')) { s.setCurrentTime?.(8); s.pauseAnimations?.() } })
await page.waitForTimeout(250)
await page.locator('#phone').screenshot({ path: join(HERE, 'review/published-final.png') })
await browser.close()
process.exit(0)
