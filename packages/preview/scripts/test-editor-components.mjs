import { chromium } from 'playwright'

const BASE = process.env.EDITOR_URL ?? 'http://localhost:3777'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle' })
console.log('title =', await page.title())

// 组件按钮存在
const compBtn = page.locator('[data-a="component"]')
console.log('组件按钮存在 =', (await compBtn.count()) === 1)

// 清空编辑器，点击组件按钮，选择「卡片」
await page.fill('#md', '')
await compBtn.click()
await page.waitForTimeout(200)
const pickerVisible = await page.locator('#tmPicker').isVisible()
const optCount = await page.locator('#tmPicker .tm-opt').count()
console.log('组件面板可见 =', pickerVisible, '| 选项数 =', optCount)

const cardOpt = page.locator('#tmPicker .tm-opt', { hasText: '卡片' }).first()
await cardOpt.click()
await page.waitForTimeout(400)
const md = await page.inputValue('#md')
console.log('插入内容 =', JSON.stringify(md.slice(0, 60)))

// 再插入图库
await compBtn.click()
await page.waitForTimeout(150)
await page.locator('#tmPicker .tm-opt', { hasText: '图库' }).first().click()
await page.waitForTimeout(400)
const md2 = await page.inputValue('#md')
console.log('含 gallery =', md2.includes(':::gallery'))

// 等待预览渲染
await page.waitForTimeout(1200)
const previewHtml = await page.frameLocator('#pv').locator('body').innerHTML().catch(() => '')
console.log('预览含卡片标题 =', previewHtml.includes('卡片标题'))
console.log('预览含 svg =', previewHtml.includes('<svg'))

// 点击展开组件也能插入并渲染出 begin="click"
await page.fill('#md', ':::reveal{label="点我"}\n答案在这里\n:::')
await page.waitForTimeout(1200)
const preview2 = await page.frameLocator('#pv').locator('body').innerHTML().catch(() => '')
console.log('预览含 begin=click =', preview2.includes('begin="click"'))

console.log('控制台错误数 =', errors.length)
for (const e of errors.slice(0, 5)) console.log('  [err]', e.slice(0, 160))

await browser.close()
process.exit(errors.length === 0 && pickerVisible && optCount >= 20 && md2.includes(':::gallery') ? 0 : 1)
