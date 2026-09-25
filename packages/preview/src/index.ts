/**
 * Playwright 截图预览。
 * 把渲染后的内联样式 HTML 在模拟 iPhone 视口（390px 宽）下截图，输出 PNG Buffer。
 * 该包 Node-only（依赖 Playwright / Chromium）。
 */
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { contrastText, darken, lighten, mix } from '@stylewx/components'
import { browserProbeSize, browserReencode } from './browser-image.js'
import { renderMermaidToPng, closeMermaidPage } from './mermaid.js'

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
export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ headless: true })
      .catch((error: unknown) => {
        browserPromise = null
        throw new Error(
          `无法启动 Playwright Chromium：${error instanceof Error ? error.message : String(error)}。请先运行 pnpm --filter @stylewx/preview exec playwright install chromium 安装浏览器。`,
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

// ============================================================================
// 文章封面生成（带标题）与图片压缩 —— 都需要真实解码/渲染，所以放在有 Chromium 的包里
// ============================================================================

/** 去掉标题里的行内 Markdown 标记（**、*、`、[文字](链接)），封面只要纯文本。 */
export function plainTitle(raw: string): string {
  return String(raw ?? '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/[*_`~]/g, '')
    .replace(/^#+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface CoverOptions {
  /** 标题（可含行内 Markdown，会被剥成纯文本）。 */
  title: string
  /** 左下角小字（通常是公众号名 / 作者）。 */
  brand?: string
  /** 右下角小字（日期、期号等）。 */
  meta?: string
  /** 主题主色（任意 CSS 颜色），渐变会按它取深浅两端。 */
  primary?: string
  /** 文字色；缺省按底色自动选黑或白。 */
  fg?: string
  /** 宽高，默认 900×383（公众号首图 2.35:1）。 */
  width?: number
  height?: number
}

function coverFontSize(title: string): number {
  const n = [...title].length
  if (n <= 8) return 62
  if (n <= 14) return 54
  if (n <= 20) return 44
  if (n <= 28) return 36
  return 30
}

/**
 * 生成「主题色底 + 标题 + 品牌角标」的封面 PNG。
 *
 * 为什么在这里做：封面要有文字就得真渲染，纯 JS 画不了字（`generateDefaultCover`
 * 只能出纯渐变兜底）。Chromium 解码/排版/抗锯齿都是现成的，画布即视口。
 *
 * 设计上刻意克制：只有一条左侧强调线 + 标题 + 角标，不加装饰元素 ——
 * 封面要在信息流里小尺寸可辨，堆饰只会糊成一团。
 */
export async function renderCoverPng(options: CoverOptions): Promise<PreviewResult> {
  const width = options.width ?? 900
  const height = options.height ?? 383
  const primary = options.primary || '#b4546a'
  const title = plainTitle(options.title) || '未命名文章'
  // 深色端取主色压深，浅色端用主色提亮，避免和正文主色撞色
  const bgFrom = darken(primary, 0.42)
  const bgTo = lighten(primary, 0.1)
  const fg = options.fg || contrastText(mix(darken(primary, 0.42), lighten(primary, 0.1), 0.5))
  const fontSize = coverFontSize(title)
  const lines = title.length > 30 ? 3 : title.length > 14 ? 2 : 1

  const metaSafe = escapeHtml(String(options.meta ?? '').slice(0, 24))
  const brandHtml = options.brand
    ? `<div class="brand"><span>${escapeHtml(String(options.brand).slice(0, 24))}</span><span class="meta">${metaSafe}</span></div>`
    : ''

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${width}px;height:${height}px;overflow:hidden}
  .cover{position:relative;width:${width}px;height:${height}px;display:flex;align-items:center;
    background:linear-gradient(135deg,${bgFrom} 0%,${primary} 55%,${bgTo} 100%);
    font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
  .bar{position:absolute;left:64px;top:${Math.round(height / 2 - (lines * fontSize * 1.32) / 2 - 4)}px;
    width:6px;height:${lines * fontSize * 1.32}px;border-radius:3px;background:${fg};opacity:.85}
  .title{padding-left:86px;padding-right:64px;color:${fg};font-weight:700;
    font-size:${fontSize}px;line-height:1.32;letter-spacing:.02em;
    display:-webkit-box;-webkit-line-clamp:${lines};-webkit-box-orient:vertical;overflow:hidden;
    text-shadow:0 1px 2px rgba(0,0,0,.18)}
  .brand{position:absolute;left:86px;right:64px;bottom:30px;display:flex;justify-content:space-between;
    align-items:baseline;color:${fg};opacity:.72;font-size:15px;letter-spacing:.06em}
  .brand .meta{font-size:13px;letter-spacing:.1em}
  </style></head><body><div class="cover">
    <div class="bar"></div>
    <div class="title">${escapeHtml(title)}</div>
    ${brandHtml}
  </div></body></html>`

  const browser = await getBrowser()
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
  try {
    await page.setContent(html, { waitUntil: 'load', timeout: 10000 })
    const png = await page.screenshot({ clip: { x: 0, y: 0, width, height }, type: 'png' })
    return { png: Buffer.from(png), viewport: { width, height, deviceScaleFactor: 2 } }
  } finally {
    await page.close()
  }
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

export interface PrepareImageOptions {
  /** 最长边上限（px），默认 1600。超出则等比缩小。 */
  maxEdge?: number
  /** 目标体积上限（字节），默认 900KB；仍超则逐档降质量重编。 */
  maxBytes?: number
  /** JPEG 质量，默认 82。 */
  quality?: number
}

export interface PrepareImageResult {
  bytes: Buffer
  mimeType: string
  width: number
  height: number
  /** 是否真的重编过（用于提示）。 */
  changed: boolean
}

/**
 * 图片规范化：超过尺寸/体积上限的等比缩小并重编码。
 *
 * 规则（写在前面是因为它们都有理由）：
 *  - GIF 永不碰 —— 重编码会丢动画；
 *  - 尺寸和体积都在限内就原样返回，不做无损「洗一遍」（白白多一次有损压缩）；
 *  - PNG 缩小后仍是 PNG（保透明），其余转 JPEG（照片场景体积差一个量级）。
 */
/** 在浏览器里重编图片：drawImage 缩放后 toDataURL。 */
async function reencode(page: Page, dataUrl: string, w: number, h: number, type: string, q: number): Promise<string> {
  return page.evaluate(browserReencode, { src: dataUrl, w, h, type, q })
}

export async function prepareImage(input: Uint8Array, mime: string, options: PrepareImageOptions = {}): Promise<PrepareImageResult> {
  const maxEdge = options.maxEdge ?? 1600
  const maxBytes = options.maxBytes ?? 900 * 1024
  const quality = options.quality ?? 82
  const sourceMime = (mime || 'image/jpeg').toLowerCase()
  const buf = Buffer.from(input)

  if (sourceMime === 'image/gif') {
    return { bytes: buf, mimeType: sourceMime, width: 0, height: 0, changed: false }
  }

  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    const dataUrl = `data:${sourceMime};base64,${buf.toString('base64')}`
    const probe = await page.evaluate(browserProbeSize, dataUrl)

    const scale = Math.min(1, maxEdge / Math.max(probe.w, probe.h))
    const needsResize = scale < 1
    const oversize = buf.length > maxBytes
    if (!needsResize && !oversize) {
      return { bytes: buf, mimeType: sourceMime, width: probe.w, height: probe.h, changed: false }
    }

    const outW = Math.max(1, Math.round(probe.w * scale))
    const outH = Math.max(1, Math.round(probe.h * scale))
    const keepPng = sourceMime === 'image/png'
    let q = quality
    let outW2 = outW
    let outH2 = outH
    let out = await reencode(page, dataUrl, outW, outH, keepPng ? 'image/png' : 'image/jpeg', q)
    let bytes = Buffer.from(String(out).split(',')[1] ?? '', 'base64')

    // 还超就逐档处理：JPEG 降质量，PNG 只能继续缩尺寸（保透明没有更便宜的降法）
    for (let i = 0; bytes.length > maxBytes && i < 4; i++) {
      if (keepPng) {
        outW2 = Math.max(320, Math.round(outW2 * 0.8))
        outH2 = Math.max(240, Math.round(outH2 * 0.8))
        out = await reencode(page, dataUrl, outW2, outH2, 'image/png', q)
      } else {
        q = Math.max(45, q - 10)
        out = await reencode(page, dataUrl, outW2, outH2, 'image/jpeg', q)
      }
      bytes = Buffer.from(String(out).split(',')[1] ?? '', 'base64')
    }

    return { bytes, mimeType: keepPng ? 'image/png' : 'image/jpeg', width: outW2, height: outH2, changed: true }
  } finally {
    await page.close()
  }
}
export { renderMermaidToPng, closeMermaidPage }
