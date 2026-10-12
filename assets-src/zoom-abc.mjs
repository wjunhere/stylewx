import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '../packages/preview/node_modules/playwright/index.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(HERE)
const BS = String.fromCharCode(92)

mkdirSync('.ui-shots/zoom', { recursive: true })
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 4 })
await p.goto('file://' + ROOT.split(BS).join('/') + '/.ui-shots/abc/A-%E5%BD%92%E9%80%94.png')
await p.waitForTimeout(1200)
// 只截头图部分（canvas 顶部 ~340px）
await p.screenshot({ path: '.ui-shots/zoom/abcA-head.png', clip: { x: 36, y: 36, width: 680, height: 300 } })
await p.goto('file://' + ROOT.split(BS).join('/') + '/.ui-shots/abc/C-%E8%A1%8C%E5%9B%8A.png')
await p.waitForTimeout(1200)
await p.screenshot({ path: '.ui-shots/zoom/abcC-head.png', clip: { x: 36, y: 36, width: 680, height: 300 } })
await p.goto('file://' + ROOT.split(BS).join('/') + '/.ui-shots/abc/B-%E7%81%AF%E4%B8%8B.png')
await p.waitForTimeout(1200)
await p.screenshot({ path: '.ui-shots/zoom/abcB-head.png', clip: { x: 36, y: 36, width: 680, height: 300 } })
await b.close()
console.log('✓ 3 张头图放大')
