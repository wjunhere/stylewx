/** 逐个组件的真实尺寸截图（1x），审细节用。 */
import { readFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '../packages/preview/node_modules/playwright/index.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'review')
mkdirSync(OUT, { recursive: true })
const html = readFileSync(join(OUT, 'phone.html'), 'utf8')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 470, height: 1200 }, deviceScaleFactor: 3 })
await page.setContent(html)
await page.evaluate(() => { for (const s of document.querySelectorAll('svg')) { s.setCurrentTime?.(8); s.pauseAnimations?.() } })
await page.waitForTimeout(200)
for (const name of ['hip-head-a', 'hip-letter', 'hip-quote', 'hip-end-a']) {
  const el = await page.$(`[data-swx="${name}"]`)
  if (!el) { console.log('缺', name); continue }
  await el.screenshot({ path: join(OUT, `part-${name}.png`) })
  console.log('✓', name)
}
await browser.close()
process.exit(0)
