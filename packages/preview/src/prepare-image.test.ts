/**
 * 图片体积管道的回归合同（不变量，不是数值）。
 *
 * 动机（为什么要保像素）：同一张 2400×2667 文字截图，
 *  - 旧策略（超预算就只缩像素）：786×874 / 663KB —— 线性砍到 1/3，表头认不出；
 *  - 现策略（先原尺寸换编码）：2400×2667 / 869KB —— 进预算且不掉像素。
 * 这两个数是**动机说明**，不写进断言：编码器实现（libjpeg/mozjpeg）、Node 版本、
 * subsampling 默认值任何一个变化都会让精确字节数漂几百 KB，写死等于给自己埋假警报。
 *
 * 断言的是不变量：宽高不变、进预算、走的是 JPEG、质量在阶梯区间内、overBudget=false。
 *
 * 样本用**带种子的生成器**现场造（不提交二进制）：
 *  - 生成后先断言「确实超过 900KB」，否则用例根本没走到超预算分支
 *    （踩过：样本 920,090 字节 vs 阈值 921,600，差 1.5KB 就走了免压通道，白测一轮）。
 *  - 需要 Chromium；没装浏览器时整组跳过（CI 上常见），不假装通过。
 */
import { describe, expect, it } from 'vitest'
import { chromium } from 'playwright'
import { prepareImage } from './index.js'

// 本包的 tsconfig 不含 DOM lib（Node 包，铁律③），page.evaluate 里用到的浏览器标识符只能自己声明。
declare const document: {
  createElement(tag: 'canvas'): {
    width: number
    height: number
    getContext(kind: '2d'): {
      fillStyle: string
      font: string
      fillRect(x: number, y: number, w: number, h: number): void
      fillText(text: string, x: number, y: number): void
      getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray }
      putImageData(data: unknown, x: number, y: number): void
    }
    toDataURL(type: string): string
  }
}

const MAX_BYTES = 900 * 1024

/** mulberry32：小而稳的种子 PRNG，保证样本可重建。 */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Sample {
  png: Buffer
  width: number
  height: number
}

/**
 * 生成一张「文字 + 噪点带」的 PNG。
 * 噪点带是构造手段：真截图（大片平色 + 文字）压不进 900KB，而本用例需要触发超预算分支。
 */
async function makeSample(options: { width: number; height: number; transparent: boolean; noiseRows: number; seed: number }): Promise<Sample> {
  const { width, height, transparent, noiseRows, seed } = options
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const dataUrl = await page.evaluate(
      ({ width, height, transparent, noiseRows, seed }) => {
        // 同款 PRNG 在页面里重建（page.evaluate 不能闭包外部函数）
        let a = seed >>> 0
        const rand = () => {
          a = (a + 0x6d2b79f5) >>> 0
          let t = a
          t = Math.imul(t ^ (t >>> 15), t | 1)
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!transparent) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, width, height)
        }
        ctx.fillStyle = '#111111'
        ctx.font = '26px monospace'
        const lines = Math.floor(height / 34)
        for (let i = 0; i < lines; i++) {
          ctx.fillText(`[${i}] adb shell dumpsys activity cmd=value cmd=value`, 20, 60 + i * 34)
        }
        const band = ctx.getImageData(0, Math.floor(height * 0.5), width, noiseRows)
        for (let i = 0; i < band.data.length; i += 4) {
          const v = Math.floor(rand() * 256)
          band.data[i] = v
          band.data[i + 1] = v
          band.data[i + 2] = v
          if (transparent) band.data[i + 3] = Math.floor(rand() * 256)
        }
        ctx.putImageData(band, 0, Math.floor(height * 0.5))
        if (transparent) {
          // 整张图的 alpha 都随机：PNG 就再也压不出收益，判它「永远进不了预算」
          const all = ctx.getImageData(0, 0, width, height)
          for (let i = 3; i < all.data.length; i += 4) all.data[i] = Math.floor(rand() * 256)
          ctx.putImageData(all, 0, 0)
        }
        return canvas.toDataURL('image/png')
      },
      { width, height, transparent, noiseRows, seed },
    )
    const png = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64')
    return { png, width, height }
  } finally {
    await browser.close()
  }
}

async function chromiumAvailable(): Promise<boolean> {
  try {
    const b = await chromium.launch()
    await b.close()
    return true
  } catch {
    return false
  }
}

const available = await chromiumAvailable()

describe.skipIf(!available)('prepareImage 超预算分支：先保像素，再缩像素', () => {
  it(
    '不透明图：原尺寸进预算，走 JPEG，质量在阶梯区间内',
    async () => {
      const sample = await makeSample({ width: 2400, height: 2667, transparent: false, noiseRows: 300, seed: 42 })
      // 先确认样本真的超预算，否则用例等于没测
      expect(sample.png.length).toBeGreaterThan(MAX_BYTES)

      const r = await prepareImage(sample.png, 'image/png', { maxBytes: MAX_BYTES })

      // 本轮改动的全部价值：像素一点没丢
      expect(r.width).toBe(sample.width)
      expect(r.height).toBe(sample.height)
      expect(r.bytes.length).toBeLessThanOrEqual(MAX_BYTES)
      expect(r.mimeType).toBe('image/jpeg')
      expect(r.changed).toBe(true)
      expect(r.overBudget).toBe(false)
      expect(r.fellBack).toBe(false)
      expect(r.jpegQuality).toBeGreaterThanOrEqual(0.68)
      expect(r.jpegQuality).toBeLessThanOrEqual(0.88)
    },
    120000,
  )

  it(
    '透明图：保持 PNG（不压成黑底），进不了预算就标 overBudget',
    async () => {
      const sample = await makeSample({ width: 1200, height: 1400, transparent: true, noiseRows: 400, seed: 7 })
      expect(sample.png.length).toBeGreaterThan(MAX_BYTES)

      const r = await prepareImage(sample.png, 'image/png', { maxBytes: MAX_BYTES })

      expect(r.mimeType).toBe('image/png')
      expect(r.changed).toBe(true)
      expect(r.overBudget).toBe(true)
      expect(r.jpegQuality).toBeUndefined()
      // 只在像素维度退让，且长边不低于缩像素底线
      expect(Math.max(r.width, r.height)).toBeGreaterThanOrEqual(800)
      expect(r.width).toBeLessThanOrEqual(sample.width)
    },
    120000,
  )
})
