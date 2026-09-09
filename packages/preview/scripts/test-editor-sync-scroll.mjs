import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const md = readFileSync('examples/component-showcase.md', 'utf8')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

await page.goto('http://localhost:3777/editor', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.removeItem('mp-sync-scroll'))
await page.reload({ waitUntil: 'networkidle' })
await page.fill('#md', md)
await page.waitForTimeout(2500)

const readState = () =>
  page.evaluate(() => {
    const ta = document.querySelector('#md')
    const w = document.querySelector('#pv').contentWindow
    const de = w.document.documentElement
    const mdMax = Math.max(0, ta.scrollHeight - ta.clientHeight)
    const pvMax = Math.max(0, de.scrollHeight - w.innerHeight)
    return {
      mdRatio: mdMax > 0 ? +(ta.scrollTop / mdMax).toFixed(3) : 0,
      pvRatio: pvMax > 0 ? +(w.scrollY / pvMax).toFixed(3) : 0,
      mdTop: Math.round(ta.scrollTop),
      pvTop: Math.round(w.scrollY),
      mdMax,
      pvMax,
      syncActive: document.querySelector('#syncToggle').classList.contains('active'),
    }
  })

console.log('初始:', JSON.stringify(await readState()))

// 1) 左 → 右
await page.evaluate(() => {
  const ta = document.querySelector('#md')
  ta.scrollTop = (ta.scrollHeight - ta.clientHeight) * 0.5
  ta.dispatchEvent(new Event('scroll'))
})
await page.waitForTimeout(400)
const a = await readState()
console.log('左滚到 50%:', JSON.stringify(a))
console.log('  → 左右比例差 =', Math.abs(a.mdRatio - a.pvRatio).toFixed(3))

// 2) 右 → 左
await page.evaluate(() => {
  const w = document.querySelector('#pv').contentWindow
  const max = w.document.documentElement.scrollHeight - w.innerHeight
  w.scrollTo(0, max * 0.85)
})
await page.waitForTimeout(500)
const b = await readState()
console.log('右滚到 85%:', JSON.stringify(b))
console.log('  → 左右比例差 =', Math.abs(b.mdRatio - b.pvRatio).toFixed(3))

// 3) 关闭同步后不再联动
await page.click('#syncToggle')
await page.waitForTimeout(200)
await page.evaluate(() => {
  const ta = document.querySelector('#md')
  ta.scrollTop = 0
  ta.dispatchEvent(new Event('scroll'))
})
await page.waitForTimeout(400)
const c = await readState()
console.log('关闭同步后左滚到 0:', JSON.stringify(c), '| 右栏是否仍留在 85% ≈', c.pvRatio > 0.8)

// 4) 重新开启
await page.click('#syncToggle')
await page.waitForTimeout(400)
const d = await readState()
console.log('重新开启后:', JSON.stringify(d))

// 5) 编辑触发重新渲染后，预览应恢复到左栏位置（而不是跳回顶部）
await page.evaluate(() => {
  const ta = document.querySelector('#md')
  ta.scrollTop = (ta.scrollHeight - ta.clientHeight) * 0.3
  ta.dispatchEvent(new Event('scroll'))
})
await page.waitForTimeout(300)
await page.focus('#md')
await page.evaluate(() => {
  const ta = document.querySelector('#md')
  ta.value += '\n\n补充一行。'
})
await page.keyboard.type('x')
await page.waitForTimeout(2000)
const e2 = await readState()
console.log('重新渲染后:', JSON.stringify(e2))
const okRerender = Math.abs(e2.mdRatio - e2.pvRatio) < 0.08 && e2.pvRatio > 0.1

console.log('控制台错误数 =', errors.length)
for (const e of errors.slice(0, 5)) console.log('  [err]', e.slice(0, 160))

const okLR = Math.abs(a.mdRatio - a.pvRatio) < 0.06
const okRL = Math.abs(b.mdRatio - b.pvRatio) < 0.06
const okOff = c.pvRatio > 0.8
console.log(`\n断言：左→右同步=${okLR} 右→左同步=${okRL} 关闭后不联动=${okOff} 重渲染后保持位置=${okRerender} 无报错=${errors.length === 0}`)

await browser.close()
process.exit(okLR && okRL && okOff && okRerender && errors.length === 0 ? 0 : 1)
