import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const html = readFileSync('examples/showcase-out/component-showcase.html', 'utf8')
const b = await chromium.launch({ headless: true })
const p = await b.newPage({ viewport: { width: 390, height: 844 } })
await p.setContent(`<html><head><meta charset="utf-8"></head><body style="margin:0">${html}</body></html>`)
const r = await p.evaluate(() => {
  const root = document.body.firstElementChild
  const cs = getComputedStyle(root)
  return {
    fontFamily: cs.fontFamily.slice(0, 80),
    fontSize: cs.fontSize,
    color: cs.color,
    lineHeight: cs.lineHeight,
    attrs: [...root.attributes].map((a) => a.name),
    styleAttrRaw: root.getAttribute('style')?.slice(0, 120),
  }
})
console.log(JSON.stringify(r, null, 2))
await b.close()
