import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '../packages/preview/node_modules/playwright/index.mjs'
import { outDir } from './paths.mjs'

const ABC = outDir('shots', 'abc')
const ZOOM = outDir('shots', 'zoom')
mkdirSync(ZOOM, { recursive: true })
const fileUrl = (p) => 'file:///' + p.split(String.fromCharCode(92)).join('/')
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 4 })
await p.goto(fileUrl(join(ABC, 'A-归途.png')))
await p.waitForTimeout(1200)
// 只截头图部分（canvas 顶部 ~340px）
await p.screenshot({ path: join(ZOOM, 'abcA-head.png'), clip: { x: 36, y: 36, width: 680, height: 300 } })
await p.goto(fileUrl(join(ABC, 'C-行囊.png')))
await p.waitForTimeout(1200)
await p.screenshot({ path: join(ZOOM, 'abcC-head.png'), clip: { x: 36, y: 36, width: 680, height: 300 } })
await p.goto(fileUrl(join(ABC, 'B-灯下.png')))
await p.waitForTimeout(1200)
await p.screenshot({ path: join(ZOOM, 'abcB-head.png'), clip: { x: 36, y: 36, width: 680, height: 300 } })
await b.close()
console.log('✓ 3 张头图放大')
