import { chromium } from 'playwright'
import { mkdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.EDITOR_URL ?? 'http://localhost:3777'
const outDir = resolve('docs/assets')
mkdirSync(outDir, { recursive: true })

const mdPath = resolve('examples/component-showcase.md')
const url = `${BASE}/editor?file=${encodeURIComponent(mdPath)}`

const browser = await chromium.launch({ headless: true })

async function shot({ file, dsf, viewport, type, quality }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dsf })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3500) // 等预览渲染 + 远程配图加载
  // 关掉可能弹出的 toast，保持画面干净
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()))
  await page.screenshot({ path: file, type, quality })
  const size = statSync(file).size
  console.log(`${file}  ${(size / 1024).toFixed(0)} KB  ${viewport.width}x${viewport.height} @${dsf}x`)
  await page.close()
  return size
}

await shot({
  file: resolve(outDir, 'editor-preview.png'),
  dsf: 1,
  viewport: { width: 1440, height: 900 },
  type: 'png',
})

// 组件库预览页
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  await page.click('#navComp')
  await page.waitForTimeout(3000)
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()))
  // 断言弹窗真的打开了，避免截到一张没有内容的图
  const box = await page.evaluate(() => {
    const el = document.querySelector('#compOverlay .modal')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height), items: document.querySelectorAll('#compList .comp-item').length }
  })
  if (!box || box.w < 1000 || box.items < 10) {
    throw new Error('组件库弹窗未正常打开：' + JSON.stringify(box))
  }
  console.log(`[capture] 组件库弹窗 ${box.w}x${box.h}，列出 ${box.items} 个组件`)
  const file = resolve(outDir, 'component-library.png')
  await page.screenshot({ path: file, type: 'png' })
  console.log(`${file}  ${(statSync(file).size / 1024).toFixed(0)} KB`)
  await page.close()
}

await browser.close()
