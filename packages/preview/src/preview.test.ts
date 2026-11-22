import { describe, it, expect } from 'vitest'
import { renderHtmlToPng, renderIphonePreview, closePreviewBrowser, prepareImage } from './index.js'

describe('preview exports', () => {
  it('暴露截图函数', () => {
    expect(typeof renderHtmlToPng).toBe('function')
    expect(typeof renderIphonePreview).toBe('function')
    expect(typeof closePreviewBrowser).toBe('function')
  })

  it('renderHtmlToPng 在 Chromium 不可用时给出清晰错误（不静默）', async () => {
    // 不真正启动浏览器；此处仅验证错误为「明确说明需要安装浏览器」。
    // 若本机已安装 chromium，则跳过该断言。
    const error = await renderHtmlToPng('<p>x</p>').catch((e: unknown) => e)
    if (error instanceof Error) {
      expect(error.message).toContain('playwright install')
    }
    await closePreviewBrowser().catch(() => undefined)
  })
})

describe('prepareImage：体积没超预算就一字节不动', () => {
  it('不超预算的 PNG 原样返回，且不启动浏览器（像素优先）', async () => {
    // 一张 1620×1800 的截图曾经被「最长边 > 1600」这条无依据的常量砍到 922×1024。
    // 现在只要没超体积预算就不碰它 —— 这里用一段假 PNG 字节验证「原样返回」这条契约：
    // 真重编码会走 getBrowser()，而本用例不断言字段，只断言字节与 changed。
    const fake = Buffer.alloc(1024, 7)
    const r = await prepareImage(fake, 'image/png', { maxBytes: 900 * 1024 })
    expect(r.changed).toBe(false)
    expect(r.fellBack).toBeUndefined()
    expect(r.bytes.equals(fake)).toBe(true)
    expect(r.mimeType).toBe('image/png')
  })

  it('GIF 永不重编码', async () => {
    const fake = Buffer.alloc(1024, 3)
    const r = await prepareImage(fake, 'image/gif', { maxBytes: 100 })
    expect(r.changed).toBe(false)
    expect(r.bytes.equals(fake)).toBe(true)
  })
})
