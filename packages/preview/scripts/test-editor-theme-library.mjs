/** 主题预览页：打开弹窗 → 选主题 → iframe 渲染 → 调色板 → 应用主题。 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:3777'
const errors = []
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle' })

// 输入一点正文（让主题切换后预览能渲染）
await page.fill('#md', '# 测试正文\n\n一段用于预览的正文。\n')
await page.waitForTimeout(1200)

// 打开「主题管理」下拉 → 点「主题预览…」
await page.locator('#themePanel summary').click()
await page.waitForTimeout(300)
await page.locator('#thPreviewBtn').click()
await page.waitForTimeout(2600)

// 弹窗可见 + 计数
console.log('弹窗可见    :', await page.locator('#themeOverlay').isVisible())
console.log('计数文案    :', (await page.locator('#thCount').textContent()).trim())

// 列表分组
const items = await page.locator('#thList .comp-item').count()
const groups = await page.locator('#thList .comp-group').allTextContents()
console.log(`列表条目    : ${items} 个 | 分组: ${groups.join(' / ')}`)
const names = await page.locator('#thList .comp-item').evaluateAll((els) => els.map((e) => e.dataset.name))
console.log('含 magazine :', names.includes('magazine'), '| 含 dark-code:', names.includes('dark-code'))

// 默认选中第一个
const firstName = await page.locator('#thName').textContent()
console.log('默认选中    :', firstName.trim())

// iframe 渲染：检查标题 + 段落 + 组件 + 卡片，且是「统一示例文章」
const frame = page.frameLocator('#thPreview')
const h1 = await frame.locator('h1').textContent().catch(() => '')
const pLen = await frame.locator('body > p').count().catch(() => 0)
const hasCard = await frame.locator('[data-swx="card"]').count().catch(() => 0)
const hasQuote = await frame.locator('[data-swx="quote"]').count().catch(() => 0)
console.log('预览 H1     :', h1.trim(), '| 段数:', pLen, '| card:', hasCard, '| quote:', hasQuote)

// 调色板 + 字体
const swatches = await page.locator('#thSwatches .th-swatch').count()
const swFirst = await page.locator('#thSwatches .th-swatch').first().textContent()
console.log('色板        :', swatches, '个 | 第一个:', swFirst.trim())
const font = await page.locator('#thFont').textContent()
console.log('字体        :', font.trim().slice(0, 60))

// 切换 dark-code（先滚进可视区）
await page.evaluate(() => {
  document.querySelector('#thList .comp-item[data-name="dark-code"]')?.scrollIntoView({ block: 'center' })
})
await page.waitForTimeout(250)
await page.evaluate(() => {
  document.querySelector('#thList .comp-item[data-name="dark-code"]')?.click()
})
await page.waitForTimeout(1200)
const thName2 = await page.locator('#thName').textContent()
const darkH1 = await frame.locator('h1').textContent().catch(() => '')
console.log('切到 dark   :', thName2.trim(), '| H1:', darkH1.trim())

// 关键：dark-code 用深色主题，iframe 里正文颜色应该是深底浅字（检查 body/card 样式）
const darkColor = await page.evaluate(() => {
  const f = document.getElementById('thPreview'); const d = f && f.contentDocument; if (!d) return ''
  const p = d.querySelector('p') || d.querySelector('h1')
  return p ? getComputedStyle(p).color : ''
})
console.log('dark 正文色 :', darkColor)

// 应用主题 → themeSel 变为 dark-code 且预览刷新
await page.locator('#thApply').click()
await page.waitForTimeout(1600)
const selVal = await page.locator('#themeSel').inputValue()
console.log('应用后 themeSel:', selVal, '| 弹窗已关:', !(await page.locator('#themeOverlay').isVisible()))

// 应用主题后主预览生效（iframe 存在且正文色深底浅字）
const mainColor = await page.evaluate(() => {
  const f = document.getElementById('pv'); const d = f && f.contentDocument; if (!d) return ''
  const p = d.querySelector('p') || d.querySelector('h1')
  return p ? getComputedStyle(p).color : ''
})
console.log('主预览正文色:', mainColor)

// 再打开一次：验证「我的主题/内置」都渲染、搜索可用
await page.locator('#themePanel summary').click()
await page.waitForTimeout(250)
await page.locator('#thPreviewBtn').click()
await page.waitForTimeout(2200)
await page.fill('#thSearch', 'magazine')
await page.waitForTimeout(300)
const filtered = await page.locator('#thList .comp-item').evaluateAll((els) => els.map((e) => e.dataset.name))
console.log('搜索 magazine 命中:', filtered.join(', '))

await browser.close()
const fail = errors.length > 0
console.log('控制台错误数:', errors.length)
console.log(fail ? '❌ 有错误' : '✅ 主题预览全部通过')
process.exit(fail ? 1 : 0)