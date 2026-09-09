import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 把 PNG 读进浏览器 canvas，统计颜色数与亮度方差，确认不是空白/纯色图
const png = readFileSync(resolve('docs/assets/editor-preview.png'))
const dataUrl = 'data:image/png;base64,' + png.toString('base64')

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const stats = await page.evaluate(async (url) => {
  const img = new Image()
  img.src = url
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  const colors = new Set()
  let sum = 0
  let sumSq = 0
  let n = 0
  for (let i = 0; i < data.length; i += 4 * 7) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    sum += lum
    sumSq += lum * lum
    n += 1
    if (colors.size < 5000) colors.add((data[i] >> 4) + ',' + (data[i + 1] >> 4) + ',' + (data[i + 2] >> 4))
  }
  const mean = sum / n
  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    distinctColors: colors.size,
    luminanceStdDev: +Math.sqrt(sumSq / n - mean * mean).toFixed(1),
    meanLuminance: +mean.toFixed(1),
  }
}, dataUrl)
console.log(JSON.stringify(stats, null, 2))
console.log('非空白图:', stats.distinctColors > 50 && stats.luminanceStdDev > 15)
await browser.close()
