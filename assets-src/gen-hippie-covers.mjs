/** 为文章生成封面 + 品牌尾卡位图（微信封面只收位图）。
 *  版式沿用工作区 brand/motion-shipped/cover.svg（2026-09-25 定稿），只换标题/副题/作者。
 *
 *  文案与品牌字标属于**私人内容**，不在仓库里：读工作区 `brand/covers.json`（§34）。
 *  字段：`wordmark{top,bottom}` / `brandLine` / `signature` / `covers[{title,subtitle,author}]`。
 *  用法：node assets-src/gen-hippie-covers.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '../packages/preview/node_modules/playwright/index.mjs'
import { outDir, workspaceDir } from './paths.mjs'

const OUT = outDir('hippie-articles')
mkdirSync(OUT, { recursive: true })

const CFG_PATH = join(workspaceDir(), 'brand', 'covers.json')
let CFG
try {
  CFG = JSON.parse(readFileSync(CFG_PATH, 'utf8'))
} catch (e) {
  console.error(`✖ 读不到封面配置 ${CFG_PATH}：${e.message}`)
  console.error('  请在工作区建 brand/covers.json：')
  console.error('  { "wordmark": {"top":"…","bottom":"…"}, "brandLine": "…", "signature": "…", "covers": [{"title":"…","subtitle":"…","author":"…"}] }')
  process.exit(2)
}
if (!CFG.covers?.length) {
  console.error(`✖ ${CFG_PATH} 里没有 covers 数组（至少一条 {title,subtitle,author}）`)
  process.exit(2)
}

const SERIF = "Georgia, 'Times New Roman', 'Songti SC', serif"
const P = '#0A2A6B' // 夜蓝
const PS = '#16408F' // 灯柱
const A = '#F5A623' // 路灯暖橘
const M = '#5C6675'
const D = '#D7DDE7'
const BG = '#FBF9F4'

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 封面 940×400（2.35:1）—— 灯与地平线是品牌构图，标题压在地平线上。 */
function cover({ title, subtitle, author }) {
  const size = title.length >= 8 ? 30 : 34
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 940 400" preserveAspectRatio="xMidYMid meet" style="width:100%;display:block">
<rect width="940" height="400" fill="${BG}"/>
<rect x="0" y="0" width="0" height="7" fill="${P}"><animate attributeName="width" values="0;940" keyTimes="0;1" calcMode="spline" keySplines="0.35 0 0.15 1" dur="1.2s" begin="0s" fill="freeze"/></rect>
<path d="M812 320 L812 144 Q812 118 868 118" fill="none" stroke="${PS}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="290" stroke-dashoffset="290"><animate attributeName="stroke-dashoffset" from="290" to="0" calcMode="spline" keySplines="0.35 0 0.15 1" dur="1.2s" begin="0.4s" fill="freeze"/></path>
<g transform="translate(868 118) scale(1.5)" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="1.2s" fill="freeze"/><path d="M-26 0 Q0 -30 26 0 Z" fill="#E8B44F" opacity="0.9"/><path d="M-26 0 Q0 -30 26 0 Z" fill="none" stroke="${A}" stroke-width="1.6"/><ellipse cx="0" cy="5" rx="5" ry="4" fill="${A}"/><ellipse cx="0" cy="16" rx="34" ry="26" fill="${A}" opacity="0.13"><animate attributeName="opacity" values="0.08;0.19;0.08" dur="4.5s" begin="0s" repeatCount="indefinite"/></ellipse><ellipse cx="0" cy="12" rx="18" ry="14" fill="#E8B44F" opacity="0.2"><animate attributeName="opacity" values="0.14;0.28;0.14" dur="3.2s" begin="0.4s" repeatCount="indefinite"/></ellipse></g>
<text x="64" y="96" font-size="15" fill="${M}" letter-spacing="5" font-family="${SERIF}" opacity="0">${esc(CFG.brandLine)}<animate attributeName="opacity" from="0" to="1" dur="0.7s" begin="0.5s" fill="freeze"/></text>
<rect x="64" y="118" width="0" height="1" fill="${D}"><animate attributeName="width" values="0;812" keyTimes="0;1" calcMode="spline" keySplines="0.35 0 0.15 1" dur="1s" begin="0.7s" fill="freeze"/></rect>
<g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.8s" begin="1.0s" fill="freeze"/><text x="64" y="188" font-size="62" font-weight="700" fill="${P}" font-family="${SERIF}" letter-spacing="2">${esc(CFG.wordmark.top)}</text></g>
<g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.8s" begin="1.2s" fill="freeze"/><text x="66" y="228" font-size="30" fill="${M}" font-family="${SERIF}" letter-spacing="12">${esc(CFG.wordmark.bottom)}</text></g>
<text x="64" y="300" font-size="${size}" fill="${P}" font-family="${SERIF}" opacity="0">${esc(title)}<animate attributeName="opacity" from="0" to="1" dur="0.8s" begin="1.5s" fill="freeze"/></text>
<text x="64" y="340" font-size="20" fill="${A}" font-family="${SERIF}" opacity="0">${esc(subtitle)}<animate attributeName="opacity" from="0" to="1" dur="0.8s" begin="1.75s" fill="freeze"/></text>
<text x="876" y="372" font-size="13" fill="${M}" text-anchor="end" font-family="${SERIF}" opacity="0">${esc(author)}<animate attributeName="opacity" from="0" to="1" dur="0.7s" begin="2.0s" fill="freeze"/></text>
</svg>`
}

/** 品牌尾卡位图 900×383 —— 供公众号「关注引导 / 文末配图」之类需要位图的场景复用。 */
function endCard() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 383" preserveAspectRatio="xMidYMid meet" style="width:100%;display:block">
<rect width="900" height="383" fill="${BG}"/>
<rect x="0" y="0" width="0" height="6" fill="${P}"><animate attributeName="width" values="0;900" keyTimes="0;1" calcMode="spline" keySplines="0.35 0 0.15 1" dur="1s" begin="0s" fill="freeze"/></rect>
<path d="M786 306 L786 158 Q786 132 836 132" fill="none" stroke="${PS}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="280" stroke-dashoffset="280"><animate attributeName="stroke-dashoffset" from="280" to="0" calcMode="spline" keySplines="0.35 0 0.15 1" dur="1.1s" begin="0.35s" fill="freeze"/></path>
<g transform="translate(836 132) scale(1.4)" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="1.1s" fill="freeze"/><path d="M-26 0 Q0 -30 26 0 Z" fill="#E8B44F" opacity="0.9"/><path d="M-26 0 Q0 -30 26 0 Z" fill="none" stroke="${A}" stroke-width="1.6"/><ellipse cx="0" cy="5" rx="5" ry="4" fill="${A}"/><ellipse cx="0" cy="16" rx="34" ry="26" fill="${A}" opacity="0.13"/></g>
<text x="64" y="150" font-size="17" fill="${P}" font-family="${SERIF}" opacity="0">${esc(CFG.signature)}<animate attributeName="opacity" from="0" to="1" dur="0.9s" begin="0.2s" fill="freeze"/></text>
<rect x="64" y="176" width="0" height="1.2" fill="${A}"><animate attributeName="width" values="0;64" keyTimes="0;1" calcMode="spline" keySplines="0.35 0 0.15 1" dur="0.7s" begin="0.9s" fill="freeze"/></rect>
<text x="64" y="212" font-size="11" fill="${M}" letter-spacing="3" font-family="${SERIF}" opacity="0">${esc(CFG.brandLine)}<animate attributeName="opacity" from="0" to="1" dur="0.7s" begin="1.2s" fill="freeze"/></text>
</svg>`
}

const shots = [
  ...CFG.covers.map((c) => ({ html: cover(c), w: 940, h: 400, out: `cover-${c.title}.png` })),
  { html: endCard(), w: 900, h: 383, out: 'end-card.png' },
]

const browser = await chromium.launch()
for (const s of shots) {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2 })
  await page.setContent(
    `<html><body style="margin:0"><div id="box" style="width:${s.w}px;height:${s.h}px">${s.html}</div>
     <script>for (const g of document.querySelectorAll('svg')) { g.setCurrentTime(6); g.pauseAnimations(); }</script></body></html>`,
  )
  await page.waitForTimeout(250)
  await page.locator('#box').screenshot({ path: join(OUT, s.out) })
  await page.close()
  console.log('✓', s.out)
}
await browser.close()
writeFileSync(join(OUT, 'README.md'), `# 文章位图资产\n\n由 \`assets-src/gen-hippie-covers.mjs\` 生成（文案读工作区 brand/covers.json），版式沿用工作区 \`brand/motion-shipped/cover.svg\`。\n改文案后重跑：\`node assets-src/gen-hippie-covers.mjs\`\n`)
