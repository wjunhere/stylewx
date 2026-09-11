import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.EDITOR_URL ?? 'http://localhost:3777'
const dir = resolve('examples/handoff-out')
mkdirSync(dir, { recursive: true })
const mdPath = resolve(dir, 'handoff-demo.md')
const md = [
  '# 交接验证文章',
  '',
  ':::cover{title="交接验证文章" subtitle="HANDOFF"}',
  ':::',
  '',
  ':::card{title="这一节是在编辑器里接着改的"}',
  '正文一段，含 **加粗**。',
  ':::',
  '',
].join('\n')
writeFileSync(mdPath, md, 'utf8')

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

// 1) 带 ?file= 打开
const url = `${BASE}/editor?file=${encodeURIComponent(mdPath)}`
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
const loaded = await page.inputValue('#md')
const title = await page.inputValue('#title')
console.log('载入长度 =', loaded.length, '| 含 cover =', loaded.includes(':::cover'), '| 标题 =', JSON.stringify(title))

const preview = await page.frameLocator('#pv').locator('body').innerHTML().catch(() => '')
console.log('预览含封面标题 =', preview.includes('交接验证文章'))

// 2) 越权路径应被拒绝
const denied = await page.evaluate(async () => {
  const r = await fetch('/editor/api/load-file?file=' + encodeURIComponent('C:\\Windows\\win.ini'))
  return r.json()
})
console.log('越权读取 =', JSON.stringify(denied).slice(0, 120))

const realErrors = errors.filter((e) => !e.includes('400 (Bad Request)'));
console.log('控制台错误数（已排除故意触发的 400）=', realErrors.length)
for (const e of realErrors.slice(0, 5)) console.log('  [err]', e.slice(0, 160))

await browser.close()
rmSync(dir, { recursive: true, force: true })

const ok = loaded.includes(':::cover') && title === '交接验证文章' && denied?.error?.code === 'path_not_allowed' && realErrors.length === 0
console.log('\n断言：载入成功=' + loaded.includes(':::cover') + ' 标题正确=' + (title === '交接验证文章') + ' 越权被拒=' + (denied?.error?.code === 'path_not_allowed') + ' 无报错=' + (realErrors.length === 0))
process.exit(ok ? 0 : 1)
