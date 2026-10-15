/**
 * 几何碰撞校验：品牌头/尾图里，装饰元素不许压到文字上。
 *
 * 为什么需要这个脚本：B / C 两套图返工多次，每次都是同一个错类 ——
 * 「山脊线穿过副标题」「云带压住字标」「鸟叠在灯罩上」。而这类错误
 * **缩略图看不出来、放大 4 倍才看得见**，靠肉眼评审必然漏（本项目已漏 4 次）。
 *
 * 做法（精确，不靠猜）：
 *   把组件渲染进真实浏览器 → 在每个 <text> 的 bbox 内**取样点**（内缩 12%，避开 bbox 边缘的
 *   字体留白）→ 对每个图形元素用 `isPointInFill` / `isPointInStroke` 判断该点是否真的被
 *   几何图形覆盖。
 *
 * 为什么不能用「bbox 相交」：填充山体的 bbox 是一个大矩形，文字位于山**上方**（视觉无冲突）
 * 也会被判成交叉 —— 那样这个闸门会一直红着，最后被无视。必须判「点是否在真实几何内」。
 *
 * 为什么不能用 getBBox()：lampHead 这类元素在 `transform="translate() scale()"` 组里，
 * getBBox() 返回**局部坐标**（未应用 transform），结论会错。必须走 getScreenCTM 反变换。
 *
 * 排除项：
 *   - 覆盖全画布 ≥ 90% 的矩形 = 底色本身，不是装饰；
 *   - `data-ok-overlap` 标记的元素（有意叠加，如灯罩与灯柱）。
 *
 * 跑法：
 *   node assets-src/check-collisions.mjs                  # 校验品牌档案里全部 hip-* 组件
 *   node assets-src/check-collisions.mjs hip-head-c       # 只校验一个
 * 退出码：有碰撞 → 1（可直接当发布前闸门）
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderPreview } from '../packages/service/dist/index.js'
import { chromium } from '../packages/preview/node_modules/playwright/index.mjs'
import { brandsDir } from './paths.mjs'

const brandPath = join(brandsDir(), 'hippie-youth', 'profile.json')
const brand = JSON.parse(readFileSync(brandPath, 'utf8'))
const uc = {}
for (const c of brand.components) uc[c.name] = { template: c.template, defaults: c.defaults ?? {} }

const only = process.argv[2]
const names = brand.components.map((c) => c.name).filter((n) => n.startsWith('hip-') && (!only || n === only))
if (!names.length) {
  console.error(only ? `找不到组件 ${only}` : '品牌档案里没有 hip-* 组件')
  process.exit(2)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 1 })

let failed = 0
const report = []

for (const name of names) {
  const md = `::::canvas{tone="paper" padding="16px"}\n\n:::${name}\n:::\n\n::::`
  const r = await renderPreview(md, brand.theme, { includeScreenshot: false, userComponents: uc })
  await page.setContent(`<html><body style="margin:0">${r.html}</body></html>`)
  await page.waitForTimeout(150)

  const found = await page.evaluate(() => {
    const root = document.querySelector('svg')
    if (!root) return { err: 'no svg' }

    /** 把屏幕坐标转成元素局部坐标。 */
    const toLocal = (el, sx, sy) => {
      const m = el.getScreenCTM()
      if (!m) return null
      return new DOMPoint(sx, sy).matrixTransform(m.inverse())
    }
    /** 该点是否被这个元素的填充或描边覆盖。 */
    const covers = (el, sx, sy) => {
      const p = toLocal(el, sx, sy)
      if (!p) return false
      try {
        if (el.isPointInFill?.(p)) return true
        if (el.isPointInStroke?.(p)) return true
      } catch {
        return false
      }
      return false
    }

    const rootRect = root.getBoundingClientRect()
    const rootArea = rootRect.width * rootRect.height
    const rectArea = (r) => r.width * r.height

    const shapes = [...root.querySelectorAll('path,ellipse,rect,circle,line,polygon')]
      .map((el, i) => ({ el, tag: el.tagName.toLowerCase() + '#' + i }))
      // 排除底色：覆盖 ≥90% 画布的矩形/路径不是「压在文字上」的装饰
      .filter(({ el }) => rectArea(el.getBoundingClientRect()) < rootArea * 0.9)
      .filter(({ el }) => !el.hasAttribute('data-ok-overlap'))

    const hits = []
    for (const t of root.querySelectorAll('text')) {
      const tr = t.getBoundingClientRect()
      if (!tr.width || !tr.height) continue
      // 内缩 12%：避开 bbox 边缘的字体留白，减少边界误报
      const insetX = tr.width * 0.12
      const insetY = tr.height * 0.12
      const x0 = tr.left + insetX, x1 = tr.right - insetX
      const y0 = tr.top + insetY, y1 = tr.bottom - insetY
      const NX = 14, NY = 6
      for (const { el, tag } of shapes) {
        let n = 0
        for (let i = 0; i <= NX; i += 1) {
          for (let j = 0; j <= NY; j += 1) {
            const sx = x0 + ((x1 - x0) * i) / NX
            const sy = y0 + ((y1 - y0) * j) / NY
            if (covers(el, sx, sy)) n += 1
          }
        }
        if (n > 0) {
          const ratio = n / ((NX + 1) * (NY + 1))
          hits.push({
            text: (t.textContent || '').slice(0, 20),
            shape: tag,
            hits: n,
            ratio: +(ratio * 100).toFixed(0),
            hint:
              (el.getAttribute('d') || '').slice(0, 44) ||
              el.getAttribute('stroke') ||
              el.getAttribute('fill') ||
              '',
          })
        }
      }
    }
    return { textCount: root.querySelectorAll('text').length, hits }
  })

  if (found.err) {
    report.push(`✗ ${name}  ${found.err}`)
    failed += 1
  } else if (found.hits.length) {
    failed += 1
    report.push(`✗ ${name}  ${found.hits.length} 处装饰压文字`)
    for (const h of found.hits.sort((a, b) => b.ratio - a.ratio).slice(0, 6)) {
      report.push(`    「${h.text}」 × ${h.shape}  命中 ${h.ratio}%  ${h.hint}`)
    }
  } else {
    report.push(`✓ ${name}  无碰撞（文字 ${found.textCount} 处）`)
  }
}

await browser.close()
console.log('\n几何碰撞校验 · 头/尾图装饰不得压文字（精确点内判定，非 bbox 相交）\n')
console.log(report.join('\n'))
console.log(`\n${failed ? `✗ ${failed} / ${names.length} 个组件有碰撞` : `✓ 全部 ${names.length} 个组件通过`}`)
process.exit(failed ? 1 : 0)
