// 三篇最终稿渲染成整页截图，供整体评审（含新的 A/B/C 头尾图 + 160 标题图）
import { readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderPreview } from '../packages/service/dist/index.js'
import { chromium } from '../packages/preview/node_modules/playwright/index.mjs'
import { articlesDir, brandsDir, outDir } from './paths.mjs'

const brand = JSON.parse(readFileSync(join(brandsDir(), 'hippie-youth', 'profile.json'), 'utf8'))
const uc = {}
for (const c of brand.components) uc[c.name] = { template: c.template, defaults: c.defaults ?? {} }

const OUT = outDir('hippie-articles')
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 1200 }, deviceScaleFactor: 2 })

// 文章名由调用方给：仓库里不留具体文章名（§34）
const names = process.argv.slice(2)
if (names.length === 0) {
  console.error('用法：node assets-src/final-shots.mjs <文章名…>（相对工作区 articles/hippie/）')
  process.exit(2)
}

for (const n of names) {
  const md = readFileSync(join(articlesDir(), 'hippie', `${n}.md`), 'utf8')
  const r = await renderPreview(md, brand.theme, { includeScreenshot: false, userComponents: uc })
  await page.setContent(`<html><body style="margin:0">${r.html}</body></html>`)
  await page.waitForTimeout(8000) // 等 SMIL 播完（拍终态）
  await page.screenshot({ path: join(OUT, `final-${n}.png`), fullPage: true })
  // 顺便量高度占比
  const m = await page.evaluate(() => {
    const all = [...document.querySelectorAll('*')]
    const canvas = all.find((e) => e.getAttribute('data-swx') === 'canvas')
    const pick = (pred) => {
      const el = all.find(pred)
      return el ? Math.round(el.getBoundingClientRect().height) : 0
    }
    return {
      total: Math.round(canvas.getBoundingClientRect().height),
      head: pick((e) => (e.getAttribute('data-swx') || '').startsWith('hip-head')),
      cov: pick((e) => e.getAttribute('data-swx') === 'cover'),
      end: pick((e) => (e.getAttribute('data-swx') || '').startsWith('hip-end')),
    }
  })
  const head = m.head, cov = m.cov, end = m.end
  const pct = (v) => ((v / m.total) * 100).toFixed(1)
  console.log(`【${n}】总高 ${m.total}px | 头图 ${head}(${pct(head)}%) 标题图 ${cov}(${pct(cov)}%) 尾图 ${end}(${pct(end)}%)`)
}
await browser.close()
