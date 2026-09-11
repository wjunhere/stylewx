/** 截取「主题预览」页配图 docs/assets/theme-library.png */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = 'http://localhost:3777'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle' })
await page.fill('#md', '# 主题预览页\n')
await page.waitForTimeout(600)

await page.locator('#themePanel summary').click()
await page.waitForTimeout(300)
await page.locator('#thPreviewBtn').click()
await page.waitForTimeout(2800)

// 切到 dark-code：深色主题的视觉差异最直观
await page.evaluate(() => {
  document.querySelector('#thList .comp-item[data-name="dark-code"]')?.scrollIntoView({ block: 'center' })
})
await page.waitForTimeout(250)
await page.evaluate(() => {
  document.querySelector('#thList .comp-item[data-name="dark-code"]')?.click()
})
await page.waitForTimeout(1500)

// 展开调色板
const sum = page.locator('#themeOverlay details.comp-src summary')
if (await sum.count()) await sum.click()
await page.waitForTimeout(400)

mkdirSync('docs/assets', { recursive: true })
const shot = await page.locator('#themeOverlay').screenshot({ path: 'docs/assets/theme-library.png' })
console.log('docs/assets/theme-library.png', Math.round(shot.length / 1024), 'KB')
await browser.close()