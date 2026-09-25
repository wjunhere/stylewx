/** 把封面 / logo 的 SVG 栅格化成 PNG（微信封面必须是位图，不接受 SVG）。 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '../packages/preview/node_modules/playwright/index.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'motion')
const shots = JSON.parse(readFileSync(join(OUT, 'rasterize.json'), 'utf8'))

const browser = await chromium.launch()
for (const s of shots) {
  const page = await browser.newPage({
    viewport: { width: s.w, height: s.h },
    deviceScaleFactor: s.out.startsWith('logo') ? 4 : 2,
  })
  await page.setContent(
    `<html><body style="margin:0"><div id="box" style="width:${s.w}px;height:${s.h}px">${s.html}</div>
     <script>for (const g of document.querySelectorAll('svg')) { g.setCurrentTime(6); g.pauseAnimations(); }</script></body></html>`,
  )
  await page.waitForTimeout(200)
  await page.locator('#box').screenshot({ path: join(OUT, s.out) })
  await page.close()
  console.log('✓', s.out)
}
await browser.close()
