/** 三套方案：终态静帧 + 时间轴分帧（看中间态有没有露馅）。 */
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '../packages/preview/node_modules/playwright/index.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'motion', 'shots')
mkdirSync(OUT, { recursive: true })

const url = 'file:///' + join(HERE, 'motion', 'preview.html').replace(String.fromCharCode(92), '/')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1240, height: 1000 }, deviceScaleFactor: 2 })
await page.goto(url)
await page.waitForTimeout(300)

const seek = (t) =>
  page.evaluate((time) => {
    for (const s of document.querySelectorAll('svg')) {
      s.setCurrentTime?.(time)
      s.pauseAnimations?.()
    }
  }, t)

await seek(8)
const plans = await page.$$('.plan')
for (const [i, el] of plans.entries()) await el.screenshot({ path: join(OUT, `panel-${i}.final.png`) })

const FRAMES = [0.4, 1.0, 1.5, 2.2]
const heads = await page.$$('.plan .panel svg')
for (let p = 0; p < 3; p++) {
  for (const t of FRAMES) {
    await seek(t)
    await heads[p * 2].screenshot({ path: join(OUT, `plan-${'abc'[p]}.t${String(t).replace('.', '_')}.png`) })
  }
}
await browser.close()
process.exit(0)
