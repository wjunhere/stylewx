/**
 * 浏览器侧属性生效验证（Playwright / 390px iPhone 视口）：
 * 渲染「属性压力样张」，用 page.evaluate + getComputedStyle 程序化判断每个属性是否真正生效，
 * 并输出一张 390x844 的截图，作为「Chromium 移动端能画出这些效果」的可视证据。
 *
 * 运行： cd packages/preview && node scripts/_browser-proof.mjs
 */
import { chromium } from 'playwright'

// op: 'eq' 精确等于 expect；'ne' 不等于 expect（用于 none 类比较）
const CASES = [
  { name: 'position', css: 'position: absolute; top:0; left:0; width:120px; height:40px;', prop: 'position', op: 'eq', expect: 'absolute' },
  { name: 'float', css: 'float: left; width: 120px; height: 40px;', prop: 'float', op: 'eq', expect: 'left' },
  { name: 'transform', css: 'transform: rotate(10deg); width:120px; height:40px;', prop: 'transform', op: 'ne', expect: 'none' },
  { name: 'animation', css: 'animation: spin 1s infinite; width:120px; height:40px;', prop: 'animationName', op: 'eq', expect: 'spin' },
  { name: 'transition', css: 'transition: all .2s; width:120px; height:40px;', prop: 'transitionProperty', op: 'ne', expect: 'none' },
  { name: 'box-shadow', css: 'box-shadow: 0 0 10px red; width:120px; height:40px;', prop: 'boxShadow', op: 'ne', expect: 'none' },
  { name: 'display:flex', css: 'display:flex; flex-direction:row; width:120px; height:40px;', prop: 'display', op: 'eq', expect: 'flex' },
  { name: 'flex-direction', css: 'display:flex; flex-direction:column; width:120px; height:60px;', prop: 'flexDirection', op: 'eq', expect: 'column' },
  { name: 'gap', css: 'display:flex; gap:20px; width:160px; height:40px;', prop: 'gap', op: 'ne', expect: 'normal' },
  { name: 'opacity', css: 'opacity: 0.5; width:120px; height:40px;', prop: 'opacity', op: 'eq', expect: '0.5' },
  { name: 'top/left/z-index', css: 'position:relative; top:10px; left:5px; z-index:9; width:120px; height:40px;', prop: 'top', op: 'eq', expect: '10px' },
  { name: 'filter', css: 'filter: blur(1px); width:120px; height:40px;', prop: 'filter', op: 'ne', expect: 'none' },
  { name: 'background-image(gradient)', css: 'background-image: linear-gradient(red, blue); width:120px; height:40px;', prop: 'backgroundImage', op: 'ne', expect: 'none' },
  { name: '!important', css: 'color: red !important; width:120px; height:40px;', prop: 'color', op: 'eq', expect: 'rgb(255, 0, 0)' },
  { name: 'letter-spacing', css: 'letter-spacing: 5px; width:120px; height:40px;', prop: 'letterSpacing', op: 'eq', expect: '5px' },
  { name: 'color', css: 'color: #047857; width:120px; height:40px;', prop: 'color', op: 'eq', expect: 'rgb(4, 120, 87)' },
  { name: 'border-left', css: 'border-left: 4px solid #0b6bff; width:120px; height:40px;', prop: 'borderLeftWidth', op: 'eq', expect: '4px' },
  { name: 'max-width:100%', css: 'max-width: 100%; width:200px; height:40px;', prop: 'maxWidth', op: 'eq', expect: '100%' },
]

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@keyframes spin { to { transform: rotate(360deg) } }
body { margin:0; font-family: sans-serif; font-size: 12px; color:#333; padding:8px; }
.row { display:flex; align-items:center; gap:8px; margin:6px 0; }
.row .label { width:170px; color:#666; }
.row .ctrl { width:120px; height:40px; background:#eee; }
.row .test { width:120px; height:40px; background:#cfe3ff; color:#000; }
</style></head><body>
${CASES.map((c) => `<div class="row"><span class="label">${c.name}</span><span class="ctrl"></span><span class="test" style="${c.css}">A</span></div>`).join('')}
</body></html>`

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  await page.setContent(html, { waitUntil: 'networkidle' })

  const results = await page.evaluate((cases) => {
    const tests = document.querySelectorAll('.test')
    return Array.from(tests).map((el, i) => {
      const c = cases[i]
      const v = getComputedStyle(el)[c.prop]
      const effective = c.op === 'eq' ? v === c.expect : v !== c.expect
      return { name: c.name, effective, value: String(v) }
    })
  }, CASES)

  const png = await page.screenshot({ fullPage: true, type: 'png' })
  const fs = await import('node:fs')
  fs.writeFileSync('browser-proof.png', png)
  await browser.close()

  console.log('=== 属性在 Chromium(移动端 390px) 是否生效 ===')
  for (const r of results) console.log('  ' + r.name.padEnd(26) + (r.effective ? '✅ 生效' : '⚠️ 未生效') + '   (' + r.value + ')')
  console.log('\n截图已保存到 packages/preview/browser-proof.png')
  const eff = results.filter((r) => r.effective).length
  console.log(`\n结论：${eff}/${results.length} 个属性在 Chromium 移动端确实生效 → 「只要微信不裁，就能画出来」。`)
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1) })
