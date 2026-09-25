/**
 * ui-shots.mjs —— 编辑器全部界面面（主界面 + 每个弹层）的批量截图。
 *
 * 为什么要有它：编辑器皮肤改动是「全元素级」的工作（侧栏、顶栏、工具条、
 * 校验条、7 个弹窗、面板、空态），改一处很容易把另一处改坏，而单测只覆盖行为、
 * 不覆盖外观。这个脚本把每个面都拍下来，改前改后各跑一次就能逐面对比。
 *
 * 用法（需编辑器已在 3777 运行：pnpm stylewx:editor）：
 *   node packages/preview/scripts/ui-shots.mjs [输出目录]
 * 默认输出到 .ui-shots/（不入库，见 .gitignore）。
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.EDITOR_BASE || 'http://localhost:3777'
const OUT = resolve(process.argv[2] || '.ui-shots')
mkdirSync(OUT, { recursive: true })

const MD = `# 一篇文章的标题在这里

开头一段正文，用来说明排版效果。支持 **加粗**、*斜体*、==高亮== 与 \`行内代码\`。

## 小节一

> 引用一条，看看左边的竖线。

- 要点一
- 要点二

:::callout{type="tip" title="提示"}
这是一个提示框，用来占位。
:::

| 列A | 列B |
| --- | --- |
| 1 | 2 |
`

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

const shot = async (name, opts = {}) => {
  await page.screenshot({ path: resolve(OUT, `${name}.png`), ...opts })
  console.log('  ·', name)
}
/** 拍单个元素（元素被裁切/超出视口时也能拍全）。 */
const shotEl = async (name, sel) => {
  try {
    await page.locator(sel).first().screenshot({ path: resolve(OUT, `${name}.png`) })
    console.log('  ·', name)
  } catch (e) {
    console.log('  ! 跳过', name, e.message.split('\n')[0])
  }
}
const closeFloat = async () => {
  await page.keyboard.press('Escape')
  // 顶栏浮层是 <details>，点空白处不一定收起（面板会盖住工具条）——直接关掉最稳
  await page.evaluate(() => {
    document.querySelectorAll('details[open]').forEach((d) => { d.open = false })
    document.querySelectorAll('#tablePicker, #tmPicker').forEach((p) => { p.style.display = 'none' })
  })
  await page.waitForTimeout(150)
}

await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle' })
await page.fill('#md', MD)
await page.fill('#title', '一篇文章的标题在这里')
await page.waitForTimeout(1800)

console.log('主界面')
await shot('01-main')
await page.locator('#darkToggle').click()
await page.waitForTimeout(900)
await shot('01b-main-dark')
await page.locator('#darkToggle').click()
await page.waitForTimeout(600)

console.log('顶栏浮层')
await page.locator('#themePickerBtn').click()
await page.waitForTimeout(350)
await shotEl('02a-theme-picker', '#themePickerPop')
await page.keyboard.press('Escape')
await page.locator('body').click({ position: { x: 860, y: 640 } })
await page.waitForTimeout(150)
await page.locator('#themePanel summary').click()
await page.waitForTimeout(300)
await shot('02-theme-panel')
await shotEl('03-theme-panel-zoom', '#themePanel .theme-box')
await closeFloat()

await page.locator('#savePanel summary').click()
await page.waitForTimeout(250)
await shotEl('04-save-panel', '.save-box')
await closeFloat()

await page.locator('#coverPanel summary').click()
await page.waitForTimeout(250)
await shotEl('05-cover-panel', '.cover-box')
await closeFloat()

console.log('工具条浮层')
await page.locator('.tb-btn[data-a="table"]').click()
await page.waitForTimeout(250)
await shotEl('06-table-picker', '#tablePicker')
await closeFloat()

await page.locator('.tb-btn[data-a="component"]').click()
await page.waitForTimeout(800)
await shotEl('07-tm-picker', '#tmPicker')
await closeFloat()

console.log('弹窗')
const modals = [
  ['#navImgHost', '08-modal-imghost', '#imgHostOverlay'],
  ['#navAi', '09-modal-ai', '#aiOverlay'],
  ['#navKeys', '10-modal-keys', '#keyOverlay'],
  ['#importHtmlBtn', '11-modal-import', '#impOverlay'],
]
for (const [nav, name, overlay] of modals) {
  await page.locator(nav).click()
  await page.waitForTimeout(600)
  if (!(await page.locator(overlay).isVisible())) { console.log('  ! 未打开', overlay); continue }
  await shotEl(name, `${overlay} .modal`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
}

// 插入视频弹窗（工具栏触发）
await page.locator('.tb-btn[data-a="video"]').click()
await page.waitForTimeout(500)
await shotEl('12-modal-video', '#videoOverlay .modal')
// videoOverlay 不在 Esc 的 MODALS 名单里，得点关闭按钮
await page.locator('#videoOverlay [data-close-video]').first().click()
await page.waitForTimeout(250)

console.log('大弹层')
await page.locator('#navComp').click()
await page.waitForTimeout(3000)
await shot('13-modal-component-library')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

await page.locator('#themePanel summary').click()
await page.waitForTimeout(250)
await page.locator('#thPreviewBtn').click()
await page.waitForTimeout(3200)
await shot('14-modal-theme-library')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

console.log('空态与窄屏')
await page.fill('#md', '')
await page.waitForTimeout(900)
await shot('15-empty')
await page.fill('#md', MD)
await page.waitForTimeout(1400)
await page.setViewportSize({ width: 1100, height: 900 })
await page.waitForTimeout(600)
await shot('16-narrow-1100')
await page.setViewportSize({ width: 760, height: 900 })
await page.waitForTimeout(600)
await shot('17-narrow-760')
await page.setViewportSize({ width: 1600, height: 1000 })

// toast
await page.locator('#copyHtmlBtn').click()
await page.waitForTimeout(350)
await shot('18-toast', { clip: { x: 500, y: 860, width: 600, height: 140 } })

await browser.close()
console.log('\n输出目录:', OUT)
console.log('控制台错误数:', errors.length)
if (errors.length) console.log(errors.slice(0, 8).join('\n'))
process.exit(errors.length ? 1 : 0)
