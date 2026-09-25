/** 让 logo 在真实使用尺寸（48 / 120 / 240px）下受审 —— 放大看会骗人。 */
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '../packages/preview/node_modules/playwright/index.mjs'
const files = ['a-homeward', 'b-lamplight', 'c-traveler']
const sheets = files.map((f) => {
  const svg = readFileSync(`B:/wechat_editer/assets-src/motion/${f}.logo.svg`, 'utf8')
  return `<div style="display:flex;align-items:flex-end;gap:22px;margin:0 0 18px">
    ${[240, 120, 48].map((w) => `<div><div style="width:${w}px;overflow:hidden;border-radius:${w > 100 ? 14 : 6}px">${svg}</div><div style="font:10px monospace;color:#666;margin-top:4px">${f} ${w}px</div></div>`).join('')}
  </div>`
}).join('')
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 700, height: 760 }, deviceScaleFactor: 3 })
await p.setContent(`<body style="margin:0;background:#F2F1ED;padding:18px">${sheets}</body>`)
await p.evaluate(() => { for (const s of document.querySelectorAll('svg')) { s.setCurrentTime(8); s.pauseAnimations?.() } })
await p.waitForTimeout(200)
writeFileSync('B:/wechat_editer/assets-src/motion/shots/logos-real.png', await p.screenshot({ fullPage: true }))
await b.close(); process.exit(0)
