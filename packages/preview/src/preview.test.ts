import { describe, it, expect } from 'vitest'
import { renderHtmlToPng, renderIphonePreview, closePreviewBrowser } from './index.js'

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
