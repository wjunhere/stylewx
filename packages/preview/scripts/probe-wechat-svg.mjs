import { chromium } from 'playwright'
import { loadConfigFromEnv, WeChatClient, publishDraft } from '../../publisher/dist/index.js'

// 覆盖组件库计划用到的全部 SVG 特性
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet" style="width:100%;display:block">
  <defs>
    <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0" stop-color="#409eff"/><stop offset="1" stop-color="#67c23a"/>
    </linearGradient>
    <clipPath id="clip1"><circle cx="60" cy="60" r="40"/></clipPath>
  </defs>
  <rect width="320" height="200" rx="14" fill="#f7f9fc"/>
  <rect x="16" y="16" width="120" height="60" rx="10" fill="url(#g1)"/>
  <circle cx="60" cy="120" r="30" fill="#409eff" clip-path="url(#clip1)">
    <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite"/>
  </circle>
  <path d="M180 40 L300 40 L240 90 Z" fill="#f56c6c" stroke="#c45656" stroke-width="2"/>
  <g transform="translate(180,110)">
    <rect width="60" height="40" rx="6" fill="#e6a23c"/>
    <text x="30" y="26" text-anchor="middle" font-size="13" fill="#fff">g</text>
  </g>
  <polygon points="250,120 300,120 275,170" fill="#9b6df2"/>
  <line x1="16" y1="180" x2="300" y2="180" stroke="#ddd" stroke-width="2" stroke-dasharray="6 4"/>
  <rect x="16" y="150" width="120" height="20" rx="10" fill="#eef6ff">
    <animate attributeName="width" from="0" to="120" dur="1.5s" fill="freeze" keyTimes="0;1" calcMode="linear"/>
  </rect>
</svg>`

const TAGS = ['<svg','<defs','<linearGradient','<stop','<clipPath','<circle','<rect','<path','<polygon','<line','<g','<text','<animate']
const ATTRS = ['viewBox','preserveAspectRatio','gradientUnits','stop-color','clip-path','xlink:href','keyTimes','calcMode','stroke-dasharray','stroke-width','fill="url(','transform','repeatCount','attributeName','from=','to=','dur=','begin=']

const config = loadConfigFromEnv()
const client = new WeChatClient(config)
const { media_id } = await publishDraft(client, {
  title: `[probe-svg] SVG 全特性 ${new Date().toISOString().slice(0,16)}`,
  content: `<section style="padding:12px">${SVG}</section>`,
  relocate: false,
})
const token = await client.getAccessToken()
const res = await fetch(`${config.apiBase ?? 'https://api.weixin.qq.com'}/cgi-bin/draft/get?access_token=${token}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ media_id }),
})
const draft = await res.json()
const stored = draft.news_item?.[0]?.content ?? ''
console.log(`[wechat] 取回长度=${stored.length} 原始=${SVG.length}\n[wechat] 标签存活:`)
for (const t of TAGS) console.log(`  ${stored.includes(t) ? '✅' : '❌'} ${t}`)
console.log('[wechat] 属性存活:')
for (const a of ATTRS) console.log(`  ${stored.includes(a) ? '✅' : '❌'} ${a}`)

// 用取回内容在 Chromium 验证渲染
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await page.setContent(`<html><head><meta charset="utf-8"></head><body style="margin:0">${stored}</body></html>`)
const r = await page.evaluate(() => {
  const svg = document.querySelector('svg')
  const anims = [...document.querySelectorAll('animate')]
  const path = document.querySelector('path')
  const grad = document.querySelector('linearGradient')
  const clipped = document.querySelector('circle')
  return {
    viewBox: svg?.getAttribute('viewBox'),
    preserveAspectRatio: svg?.getAttribute('preserveAspectRatio'),
    gradUnits: grad?.getAttribute('gradientUnits'),
    animCount: anims.length,
    animAttrNames: anims.map(a => a.getAttribute('attributeName')),
    animKeyTimes: anims.map(a => a.getAttribute('keyTimes')),
    pathD: path?.getAttribute('d')?.slice(0, 30),
    clipPath: clipped?.getAttribute('clip-path'),
    bboxWidth: Math.round(svg?.getBoundingClientRect().width ?? 0),
  }
})
console.log('\n[browser] 解析后:', JSON.stringify(r, null, 2))
const before = await page.evaluate(() => getComputedStyle(document.querySelector('circle')).opacity)
await page.waitForTimeout(1100)
const after = await page.evaluate(() => getComputedStyle(document.querySelector('circle')).opacity)
console.log(`[browser] 自动动画 opacity: ${before} -> ${after}`)
await page.screenshot({ path: 'packages/preview/probe-svg-full.png' })
await browser.close()
console.log('[browser] 截图: packages/preview/probe-svg-full.png')
