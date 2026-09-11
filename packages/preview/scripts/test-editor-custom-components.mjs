import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const BASE = process.env.EDITOR_URL ?? 'http://localhost:3777'
const storePath = join(homedir(), '.stylewx', 'components.json')
const hadStore = existsSync(storePath)
const storeBefore = hadStore ? readFileSync(storePath, 'utf8') : null

const CUSTOM = [
  {
    name: 'brand-quote',
    description: '品牌引言卡',
    template:
      '<div style="background:{{theme.primarySoft}};border-left:4px solid {{theme.primary}};border-radius:{{theme.radius}};padding:14px 16px">{{body}}{{#if author}}<div style="text-align:right;color:{{theme.muted}};font-size:12.5px">— {{author}}</div>{{/if}}</div>',
  },
  {
    name: 'stat-list',
    description: '数据条',
    template:
      '<div style="background:{{theme.cardBg}};border-radius:{{theme.radius}};padding:12px 16px">{{#each body}}<div style="display:flex;justify-content:space-between"><span style="color:{{theme.muted}}">{{this.0}}</span><span style="font-weight:600;color:{{theme.primary}}">{{this.1}}</span></div>{{/each}}</div>',
  },
]

mkdirSync(dirname(storePath), { recursive: true })
writeFileSync(storePath, JSON.stringify({ components: CUSTOM }, null, 2), 'utf8')
console.log('已写入测试用组件库:', CUSTOM.map((c) => c.name).join(', '))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle' })
await page.fill('#md', '')
await page.waitForTimeout(300)

// 1) 面板是否列出自定义组件
await page.click('[data-a="component"]')
await page.waitForTimeout(700)
const heads = await page.locator('#tmPicker .tm-head').allTextContents()
const opts = await page.locator('#tmPicker .tm-opt').allTextContents()
console.log('分组标题      :', JSON.stringify(heads))
console.log('面板项数      :', opts.length, '(内置 22 + 自定义 2)')
console.log('含 brand-quote:', opts.some((t) => t.includes('brand-quote')))
console.log('含 stat-list  :', opts.some((t) => t.includes('stat-list')))
console.log('有删除按钮    :', (await page.locator('#tmPicker .tm-del').count()) >= 2)

// 2) 插入片段
await page.locator('#tmPicker .tm-opt', { hasText: 'brand-quote' }).first().click()
await page.waitForTimeout(800)
const md1 = await page.inputValue('#md')
console.log('插入片段      :', JSON.stringify(md1.slice(0, 50)))

// 3) 渲染：自定义组件 + 主题色 + 条件 + 循环
await page.fill(
  '#md',
  ':::brand-quote{author="编辑"}\n读者不记得字体，只记得累不累。\n:::\n\n:::stat-list\n2024 | 1200 万\n2025 | 3800 万\n:::\n',
)
await page.waitForTimeout(2200)
const preview = await page.frameLocator('#pv').locator('body').innerHTML().catch(() => '')
console.log('预览含引言内容:', preview.includes('累不累'))
console.log('预览含作者    :', preview.includes('编辑'))
console.log('预览含数据行  :', preview.includes('1200 万') && preview.includes('3800 万'))
console.log('预览用主题色  :', preview.includes('border-left:4px solid'))
console.log('预览无 slot 残留:', !preview.includes('data-swx-slot'))

// 4) 面板里删除 stat-list
await page.click('[data-a="component"]')
await page.waitForTimeout(600)
await page.locator('#tmPicker .tm-opt', { hasText: 'stat-list' }).first().locator('.tm-del').click()
await page.waitForTimeout(1000)
await page.click('[data-a="component"]')
await page.waitForTimeout(600)
const after = await page.locator('#tmPicker .tm-opt').allTextContents()
console.log('删除后含 stat-list:', after.some((t) => t.includes('stat-list')))
console.log('删除后含 brand-quote:', after.some((t) => t.includes('brand-quote')))

console.log('控制台错误数  :', errors.length)
for (const e of errors.slice(0, 3)) console.log('  [err]', e.slice(0, 140))

await browser.close()

// 还原组件库
if (hadStore && storeBefore !== null) writeFileSync(storePath, storeBefore, 'utf8')
else rmSync(storePath, { force: true })
console.log('组件库已还原')
