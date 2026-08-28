/**
 * Playwright 截图预览。
 * 把渲染后的内联样式 HTML 在模拟 iPhone 视口（390px 宽）下截图，输出 PNG Buffer。
 * 该包 Node-only（依赖 Playwright / Chromium）。
 */
import { chromium } from 'playwright'
import type { Browser } from 'playwright'

export interface PreviewOptions {
  /** 视口宽度（默认 390，即常见 iPhone 逻辑宽度）。 */
  width?: number
  /** 视口高度（默认 844）。 */
  height?: number
  /** 设备像素比（默认 2，retina 更清晰）。 */
  deviceScaleFactor?: number
  /** 是否整页截图（默认 true）。 */
  fullPage?: boolean
}

export interface PreviewResult {
  /** PNG 字节。 */
  png: Buffer
  /** 实际使用的视口。 */
  viewport: { width: number; height: number; deviceScaleFactor: number }
}

let browserPromise: Promise<Browser> | null = null

/** 惰性启动浏览器实例（多进程共享，避免重复启动开销）。 */
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ headless: true })
      .catch((error: unknown) => {
        browserPromise = null
        throw new Error(
          `无法启动 Playwright Chromium：${error instanceof Error ? error.message : String(error)}。请先运行 pnpm --filter @mp-style/preview exec playwright install chromium 安装浏览器。`,
        )
      })
  }
  return browserPromise
}

/**
 * 把 HTML 渲染为 PNG 截图。
 * @param html 已内联样式的 HTML
 * @param opts 视口等选项
 */
export async function renderHtmlToPng(
  html: string,
  opts: PreviewOptions = {},
): Promise<PreviewResult> {
  const width = opts.width ?? 390
  const height = opts.height ?? 844
  const deviceScaleFactor = opts.deviceScaleFactor ?? 2
  const fullPage = opts.fullPage ?? true

  const browser = await getBrowser()
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor,
  })
  try {
    await page.setContent(`<html><head><meta charset="utf-8"></head><body style="margin:0">${html}</body></html>`, {
      waitUntil: 'networkidle',
      timeout: 10000,
    })
    const png = await page.screenshot({ fullPage, type: 'png' })
    return { png: Buffer.from(png), viewport: { width, height, deviceScaleFactor } }
  } finally {
    await page.close()
  }
}

/** 模拟 iPhone 视口（390px 宽）的微信预览截图。 */
export async function renderIphonePreview(html: string): Promise<PreviewResult> {
  return renderHtmlToPng(html, {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    fullPage: true,
  })
}

/** 关闭并释放浏览器实例（进程退出前调用，可选）。 */
export async function closePreviewBrowser(): Promise<void> {
  if (browserPromise) {
    try {
      const browser = await browserPromise
      await browser.close()
    } finally {
      browserPromise = null
    }
  }
}
