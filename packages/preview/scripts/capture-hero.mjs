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

await browser.close()
