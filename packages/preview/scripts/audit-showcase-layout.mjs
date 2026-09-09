import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const html = readFileSync('examples/showcase-out/component-showcase.html', 'utf8')
const b = await chromium.launch({ headless: true })
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await p.setContent(`<html><head><meta charset="utf-8"></head><body style="margin:0">${html}</body></html>`, { waitUntil: 'networkidle' })
const audit = await p.evaluate(() => {
  const root = document.body.firstElementChild
  const docW = document.documentElement.clientWidth
  const overflow = []
  const zeroHeight = []
  const svgs = []
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.right > docW + 1 || r.left < -1) overflow.push({ tag: el.tagName, left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), text: (el.textContent||'').slice(0,24) })
    if (el.tagName.toLowerCase() === 'svg') svgs.push({ h: Math.round(r.height), w: Math.round(r.width), vb: el.getAttribute('viewBox'), text: (el.textContent||'').slice(0,18) })
    if ((el.tagName === 'IMG' || el.tagName.toLowerCase() === 'svg') && r.height < 2 && r.width > 10) zeroHeight.push({ tag: el.tagName, w: Math.round(r.width) })
  }
  return {
    docWidth: docW,
    bodyScrollWidth: document.body.scrollWidth,
    fullHeight: Math.round(root.getBoundingClientRect().height),
    overflowCount: overflow.length,
    overflow: overflow.slice(0, 8),
    zeroHeight,
    svgs,
    imgCount: document.querySelectorAll('img').length,
    imgLoaded: [...document.querySelectorAll('img')].filter(i => i.naturalWidth > 0).length,
    imgBroken: [...document.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src.slice(0, 60)),
  }
})
console.log(JSON.stringify(audit, null, 2))
await b.close()
