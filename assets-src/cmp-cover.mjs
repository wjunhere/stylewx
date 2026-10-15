// 标题图（:::cover）高度对照 —— 拍出来选，别拍脑袋定
import { readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderPreview } from '../packages/service/dist/index.js'
import { chromium } from '../packages/preview/node_modules/playwright/index.mjs'
import { brandsDir, outDir } from './paths.mjs'

const brand = JSON.parse(readFileSync(join(brandsDir(), 'hippie-youth', 'profile.json'), 'utf8'))
const uc = {}
for (const c of brand.components) uc[c.name] = { template: c.template, defaults: c.defaults ?? {} }

mkdirSync(outDir('shots', 'cover'), { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1700, height: 820 }, deviceScaleFactor: 2 })

const htmls = []
for (const h of [150, 165, 180, 220]) {
  const r = await renderPreview(
    `::::canvas{tone="paper" padding="16px"}\n\n:::hip-head-a\n:::\n\n:::cover{title="示例文章标题" subtitle="—— 示例副标题" author="示例作者" date="示例署名" height="${h}"}\n:::\n\n示例正文一段，用来量标题图在整篇里的高度占比。\n\n::::`,
    brand.theme,
    { includeScreenshot: false, userComponents: uc },
  )
  htmls.push({ h, html: r.html })
}

await page.setContent(`<html><body style="margin:0;padding:14px;background:#CFCFCF;font-family:sans-serif">
<div style="display:flex;gap:12px;align-items:flex-start">
${htmls.map((x) => `<div style="width:390px;background:#fff;border:1px solid #999;border-radius:8px;overflow:hidden">
  <div style="width:390px">${x.html}</div>
  <div style="font-size:12px;padding:6px 9px;border-top:1px solid #ddd">height=${x.h}</div></div>`).join('')}
</div></body></html>`)
await page.waitForTimeout(7000)
await page.screenshot({ path: join(outDir('shots', 'cover'), 'compare.png'), fullPage: true })
console.log('✓', join(outDir('shots', 'cover'), 'compare.png'))
await browser.close()
