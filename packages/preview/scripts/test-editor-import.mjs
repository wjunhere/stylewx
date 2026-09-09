import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = process.env.EDITOR_URL ?? 'http://localhost:3777'
const html = readFileSync('examples/showcase-out/component-showcase.html', 'utf8')

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle' })

// 按钮存在
for (const id of ['#importHtmlBtn', '#importMdBtn', '#exportMdBtn']) {
  console.log(id, '存在 =', (await page.locator(id).count()) === 1)
}

// 打开导入弹窗并粘贴 HTML
await page.click('#importHtmlBtn')
await page.waitForTimeout(200)
console.log('弹窗可见 =', await page.locator('#impOverlay').isVisible())
await page.fill('#impText', html)
await page.click('#impRun')
await page.waitForTimeout(1500)

const md = await page.inputValue('#md')
const title = await page.inputValue('#title')
console.log('回导 Markdown 长度 =', md.length)
console.log('标题 =', JSON.stringify(title))
for (const token of [':::cover', ':::card', ':::gallery', ':::carousel', ':::reveal', '::::canvas']) {
  console.log('  含', token, '=', md.includes(token))
}

// 预览渲染
await page.waitForTimeout(1500)
const preview = await page.frameLocator('#pv').locator('body').innerHTML().catch(() => '')
console.log('预览含 svg =', preview.includes('<svg'), '| 含 begin=click =', preview.includes('begin="click"'))
console.log('预览含封面标题 =', preview.includes('把公众号排版做成一门手艺'))

// 导出 MD
const dl = page.waitForEvent('download', { timeout: 8000 })
await page.click('#exportMdBtn')
const download = await dl
console.log('导出文件名 =', download.suggestedFilename())

console.log('控制台错误数 =', errors.length)
for (const e of errors.slice(0, 5)) console.log('  [err]', e.slice(0, 160))

await browser.close()
process.exit(
  errors.length === 0 && md.includes(':::cover') && md.includes('::::canvas') && preview.includes('<svg') ? 0 : 1,
)
