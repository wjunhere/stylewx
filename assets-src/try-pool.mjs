/**
 * 深色底上的「发光」到底能不能用暖色填充？—— 多方案实拍对照。
 *
 * 背景：重做方案 C（夜蓝底）时，「灯下地面受光」先后试过椭圆光斑 / 双层光池 /
 * 小面积高不透明实心椭圆，每种都在夜蓝上变成灰褐或土棕，读者眼里是一块「煎饼」
 * 或「陨石坑」。跑这个脚本把候选全部拍出来，结论才可信（见 docs/DESIGN.md §22.8 ⑧）。
 *
 * 跑法：node assets-src/try-pool.mjs   → .ui-shots/pool/*.png
 * 结论：只有**纯色描边**干净；所有 `fill` 类都会与夜蓝混色（fill 参与混色，stroke 不参与）。
 */
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderPreview } from '../packages/service/dist/index.js'
import { chromium } from '../packages/preview/node_modules/playwright/index.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const NIGHT = '#0A2A6B'
const LAMP = '#F5A623'
const PAPER = '#FBF9F4'

// 每个方案只替换「地面光斑」那一段，其余（暮色 / 山脊 / 灯）保持一致
const variants = {
  '0-无光斑(基准)': '',
  '1-白宽+白窄': `<ellipse cx="244" cy="109" rx="44" ry="7" fill="${PAPER}" opacity="0.10"/><ellipse cx="244" cy="109" rx="24" ry="4" fill="${PAPER}" opacity="0.16"/>`,
  '2-白窄+橘极小': `<ellipse cx="244" cy="109" rx="40" ry="6" fill="${PAPER}" opacity="0.12"/><ellipse cx="244" cy="109" rx="14" ry="3" fill="${LAMP}" opacity="0.55"/>`,
  '3-仅橘小(不透明度.35)': `<ellipse cx="244" cy="109" rx="26" ry="4.5" fill="${LAMP}" opacity="0.35"/>`,
  '4-双层橘(小面积高不透明)': `<ellipse cx="244" cy="109" rx="30" ry="5" fill="${LAMP}" opacity="0.3"/><ellipse cx="244" cy="109" rx="16" ry="3" fill="${LAMP}" opacity="0.55"/>`,
  '5-纯色描边弧(✓ 采用)': `<path d="M206 112 Q244 103 282 112" fill="none" stroke="${LAMP}" stroke-width="1.8" stroke-linecap="round" opacity="0.72"/>`,
  '6-白宽底+橘描边': `<ellipse cx="244" cy="109" rx="42" ry="6.5" fill="${PAPER}" opacity="0.11"/><path d="M208 111 Q244 103 280 111" fill="none" stroke="${LAMP}" stroke-width="1.5" opacity="0.65"/>`,
}

const brand = JSON.parse(readFileSync('C:/Users/wjun/.stylewx/brands/hippie-youth/profile.json', 'utf8'))
const base = brand.components.find((c) => c.name === 'hip-end-c').template

mkdirSync('.ui-shots/pool', { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 240 }, deviceScaleFactor: 3 })

for (const [label, patch] of Object.entries(variants)) {
  // 先移除模板里原有的地面光斑，再把候选插到灯柱之前
  const ellStart = base.indexOf('<ellipse cx="244"')
  const ellEnd = base.indexOf('</ellipse>', ellStart) + '</ellipse>'.length
  const stripped = ellStart === -1 ? base : base.slice(0, ellStart) + base.slice(ellEnd)
  const anchor = '<path d="M274 112'
  const i = stripped.indexOf(anchor)
  const tpl = i === -1 ? stripped : stripped.slice(0, i) + patch + stripped.slice(i)

  const r = await renderPreview(`::::canvas{tone="paper" padding="16px"}\n\n:::testend\n:::\n\n::::`, brand.theme, {
    includeScreenshot: false,
    userComponents: { testend: { template: tpl, defaults: {} } },
  })
  await page.setContent(`<html><body style="margin:0;background:${NIGHT}">${r.html}</body></html>`)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `.ui-shots/pool/${label}.png`, fullPage: true })
  console.log('✓', label)
}
await browser.close()
console.log('\n看图选：只有 5（纯色描边）在夜蓝底上是干净的暖色，其余 fill 类都变灰/土棕。')
