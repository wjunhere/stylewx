#!/usr/bin/env node
/**
 * 截取「主题预览」页配图 docs/assets/theme-library.png（人工用，不进 CI）。
 *
 * 需要先在 3777 起编辑器：`pnpm stylewx:editor`（换端口就改下面的 BASE）。
 *
 * ── 这次修了什么（2026-10）────────────────────────────────────────────
 * 原来用「固定等 2800ms + 只截 #themeOverlay 元素」，两个问题：
 *
 * 1. **固定等待不可靠**：机器一忙就截到「正在渲染…」的半成品。现在等到预览正文
 *    真的出现（等文本里出现示例标题），超时才报错。
 * 2. **只截弹层会把取景裁掉**：弹层本身不含应用页脚（版本号那行），而版本号正是
 *    这张图要给人看的「现在是什么版本」。改成截整个视口，于是弹层、暗下去的编辑器
 *    和页脚一起入镜 —— 与仓库里那张旧配图的取景一致。
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

/** 编辑器地址；默认 3777，另有实例时用 `EDITOR_URL=http://localhost:3799 node …` 覆盖。 */
const BASE = process.env.EDITOR_URL ?? 'http://localhost:3777'
/** 要展示的主题：深色主题的视觉差异最直观，也能顺带看出代码块。 */
const SHOWCASE = 'dark-code'
/** 示例正文里的标题 —— 等它出现就说明预览真的渲染完了。 */
const PREVIEW_READY_TEXT = '一片秋叶的时间'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
try {
  await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle' })
  await page.fill('#md', '# 主题预览页\n')
  await page.waitForTimeout(400)

  await page.locator('#themePanel summary').click()
  await page.locator('#thPreviewBtn').click()

  // 主题库是**一次性渲染全部主题**的：先把「正在渲染…」这段真正等完，
  // 而不是猜一个毫秒数（原版固定等 2800ms，机器一忙就截到半成品）。
  await page.locator('#thList .comp-item').first().waitFor({ timeout: 90000 })

  await page.locator(`#thList .comp-item[data-name="${SHOWCASE}"]`).click()
  await page.waitForFunction(
    (name) => document.querySelector('#thName')?.textContent?.includes(name),
    SHOWCASE,
    { timeout: 15000 },
  )
  // 预览在 iframe 里（sandbox allow-same-origin，可以直接读它的 contentDocument）：
  // 等到示例正文真的画出来，才算可以截图。
  await page.waitForFunction(
    (text) => {
      const frame = document.querySelector('#thPreview')
      return !!frame && frame.style.display !== 'none' && (frame.contentDocument?.body?.innerText ?? '').includes(text)
    },
    PREVIEW_READY_TEXT,
    { timeout: 20000 },
  )
  // 列表滚回顶部：分组标题（我的主题 / 内置主题）要留在取景里
  await page.locator('#thList').evaluate((el) => el.scrollTo(0, 0))
  await page.waitForTimeout(800)

  // 展开调色板与字体
  const summary = page.locator('#themeOverlay details.comp-src summary')
  if (await summary.count()) await summary.click()
  await page.waitForTimeout(400)

  mkdirSync('docs/assets', { recursive: true })
  await page.screenshot({
    path: 'docs/assets/theme-library.png',
    clip: { x: 0, y: 0, width: 1440, height: 900 },
  })
  console.log(`docs/assets/theme-library.png 已更新（${SHOWCASE}，含页脚取景）`)
} finally {
  await browser.close()
}
