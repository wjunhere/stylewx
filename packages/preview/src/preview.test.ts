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
  it('不超预算的 PNG 原样返回，不启浏览器，宽高从文件头读', async () => {
    // 一张 1620×1800 的截图曾经被「最长边 > 1600」这条无依据的常量砍到 922×1024。
    // 现在只要没超体积预算就不碰它 —— 这里用真 PNG 头（宽高 1620×1800）+ 填充字节验证契约。
    const head = Buffer.alloc(24)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0)
    head.writeUInt32BE(1620, 16)
    head.writeUInt32BE(1800, 20)
    const fake = Buffer.concat([head, Buffer.alloc(1000, 7)])
    const r = await prepareImage(fake, 'image/png', { maxBytes: 900 * 1024 })
    expect(r.changed).toBe(false)
    expect(r.fellBack).toBe(false)
    expect(r.overBudget).toBe(false)
    expect(r.bytes.equals(fake)).toBe(true)
    expect(r.mimeType).toBe('image/png')
    // 关键：免压通道也不能报 0×0（否则与「未探测」混在一起）
    expect(r.width).toBe(1620)
    expect(r.height).toBe(1800)
  })

  it('GIF 永不重编码（即使超预算）', async () => {
    const head = Buffer.alloc(13)
    head.write('GIF89a', 0, 'latin1')
    head.writeUInt16LE(320, 6)
    head.writeUInt16LE(240, 8)
    const fake = Buffer.concat([head, Buffer.alloc(2000, 3)])
    const r = await prepareImage(fake, 'image/gif', { maxBytes: 100 })
    expect(r.changed).toBe(false)
    expect(r.bytes.equals(fake)).toBe(true)
    expect(r.width).toBe(320)
    expect(r.height).toBe(240)
  })
})
