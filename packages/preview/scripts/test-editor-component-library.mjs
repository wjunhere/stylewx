import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const BASE = process.env.EDITOR_URL ?? 'http://localhost:3777'
const storePath = join(homedir(), '.stylewx', 'components.json')
const hadStore = existsSync(storePath)
const storeBefore = hadStore ? readFileSync(storePath, 'utf8') : null

// 放一个自定义组件，验证它也出现在预览页
mkdirSync(dirname(storePath), { recursive: true })
writeFileSync(
  storePath,
  JSON.stringify({
    components: [
      {
        name: 'brand-quote',
        description: '品牌引言卡',
        template:
          '<div style="background:{{theme.primarySoft}};border-left:4px solid {{theme.primary}};border-radius:{{theme.radius}};padding:14px 16px">{{body}}</div>',
      },
    ],
  }),
  'utf8',
)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle' })
await page.fill('#md', '# 测试\n\n正文\n')
await page.waitForTimeout(1200)

// 1) 侧栏入口打开组件库
await page.click('#navComp')
await page.waitForTimeout(2500)
console.log('弹窗可见   :', await page.locator('#compOverlay').isVisible())
console.log('计数文案   :', await page.locator('#compCount').textContent())

const items = await page.locator('#compList .comp-item').allTextContents()
const groups = await page.locator('#compList .comp-group').allTextContents()
console.log('分组       :', JSON.stringify(groups))
console.log('组件项数   :', items.length)
console.log('含 brand-quote:', items.some((t) => t.includes('brand-quote')))

// 2) 默认选中第一个并渲染
await page.waitForTimeout(1500)
const firstName = await page.locator('#compName').textContent()
const frame = page.frameLocator('#compPreview')
const firstHtml = await frame.locator('body').innerHTML().catch(() => '')
console.log('默认选中   :', firstName)
console.log('预览非空   :', firstHtml.length > 30, `(${firstHtml.length} 字符)`)
console.log('预览有内联样式:', firstHtml.includes('style='))

// 3) 切到 gallery 看不同效果
await page.locator('#compList .comp-item', { hasText: 'gallery' }).first().click()
await page.waitForTimeout(1200)
const gHtml = await page.frameLocator('#compPreview').locator('body').innerHTML().catch(() => '')
console.log('gallery 预览含 flex:', gHtml.includes('flex-wrap') || gHtml.includes('display:flex'))
console.log('示例源码        :', (await page.locator('#compSrc').textContent()).split('\n')[0])
console.log('部位提示        :', await page.locator('#compSlots').textContent())

// 4) 搜索过滤
await page.fill('#compSearch', 'quote')
await page.waitForTimeout(400)
const filtered = await page.locator('#compList .comp-item').allTextContents()
console.log('搜索 quote 命中 :', filtered.length, JSON.stringify(filtered.map((t) => t.split('\n')[0])))
await page.fill('#compSearch', '')
await page.waitForTimeout(300)

// 5) 插入到正文
await page.locator('#compList .comp-item', { hasText: 'brand-quote' }).first().click()
await page.waitForTimeout(800)
await page.click('#compInsert')
await page.waitForTimeout(1000)
const md = await page.inputValue('#md')
console.log('插入后正文含自定义组件:', md.includes(':::brand-quote'))
console.log('弹窗已关闭:', !(await page.locator('#compOverlay').isVisible()))

// 布局：弹窗必须是「大页面」而不是默认的 420px 小弹窗（曾经被 .modal 覆盖过）
// 注意：上面插入后弹窗已关闭，这里重新打开再量
await page.click('#navComp')
await page.waitForTimeout(2600)
const layout = await page.evaluate(() => {
  const r = (s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.bottom) }
  }
  const modal = document.querySelector('#compOverlay .modal')
  const body = document.querySelector('.comp-body')
  const wrap = document.querySelector('.comp-preview-wrap')
  return {
    modal: r('#compOverlay .modal'),
    body: r('.comp-body'),
    previewWrap: r('.comp-preview-wrap'),
    iframe: r('#compPreview'),
    bodyPadding: getComputedStyle(body).padding,
    bodyOverflow: getComputedStyle(body).overflow,
    modalOverflow: getComputedStyle(modal).overflow,
    clipped: wrap ? Math.max(0, wrap.scrollHeight - wrap.clientHeight) : 0,
    viewportH: window.innerHeight,
  }
})
console.log('弹窗尺寸   :', layout.modal.w + 'x' + layout.modal.h, '| 预览区高:', layout.previewWrap.h)
console.log('body 内边距:', layout.bodyPadding, '| overflow:', layout.bodyOverflow)
const layoutOk =
  layout.modal.w >= 1000 &&
  layout.previewWrap.h >= 400 &&
  layout.bodyPadding === '0px' &&
  layout.clipped === 0 &&
  layout.iframe.bottom <= layout.viewportH
console.log('布局断言   :', layoutOk)

console.log('控制台错误数:', errors.length)
for (const e of errors.slice(0, 3)) console.log('  [err]', e.slice(0, 140))

await browser.close()

if (hadStore && storeBefore !== null) writeFileSync(storePath, storeBefore, 'utf8')
else rmSync(storePath, { force: true })
console.log('组件库已还原')
