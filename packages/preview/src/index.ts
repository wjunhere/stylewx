/**
 * Playwright 截图预览。
 * 把渲染后的内联样式 HTML 在模拟 iPhone 视口（390px 宽）下截图，输出 PNG Buffer。
 * 该包 Node-only（依赖 Playwright / Chromium）。
 */
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { contrastText, darken, lighten, mix } from '@stylewx/components'
import { browserHasAlpha, browserProbeSize, browserReencode } from './browser-image.js'
import { readImageSize } from './image-size.js'
import { renderMermaidToPng, closeMermaidPage } from './mermaid.js'

export { readImageSize } from './image-size.js'
export type { ImageSize } from './image-size.js'

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
  /** 目标体积上限（字节），默认 900KB。**唯一**的动手条件：不超就一字节不动。 */
  maxBytes?: number
}

export interface PrepareImageResult {
  bytes: Buffer
  mimeType: string
  /** 像素宽高；免压通道用文件头解析（不开浏览器），解析不出来才为 0。 */
  width: number
  height: number
  /** 是否真的重编过（用于提示）。 */
  changed: boolean
  /** 实际用的 JPEG 质量（0–1）；没走 JPEG 编码则为空。 */
  jpegQuality?: number
  /** 超过 `maxBytes` 仍未达标（试到最底仍超）。永远显式布尔值，不让调用方去猜 `undefined`。 */
  overBudget: boolean
  /** 压缩无收益、已原样退回原图。 */
  fellBack: boolean
}

/** 在浏览器里重编图片：drawImage 缩放后 toDataURL。 */
async function reencode(page: Page, dataUrl: string, w: number, h: number, type: string, q: number): Promise<string> {
  return page.evaluate(browserReencode, { src: dataUrl, w, h, type, q })
}

/** 缩像素的底线：长边不小于这个值，再小就没必要了（宁可报 overBudget）。 */
const MIN_EDGE = 800
/** 保像素阶段的 JPEG 质量阶梯：从高往低试，进预算即停。
 *  注意 canvas 的 quality 是 **0–1**，不是 0–100 —— 传 82 会被钳到 1（等于最高质量）。
 *  实测踩过：把 0–100 的值直接交给 toDataURL，结果每一档都是最高质量，永远压不下来。 */
const JPEG_LADDER = [0.88, 0.84, 0.8, 0.76, 0.72, 0.68]

/**
 * 图片规范化：体积超预算时压到预算内；压不出收益就原样返回。
 *
 * 规则（按顺序执行，全部都有实测依据）：
 *  - GIF 永不碰 —— 重编码会丢动画；
 *  - **体积没超预算就一字节不动**，而且**不开浏览器**（宽高从文件头读）。
 *    原先还有一个「最长边 > 1600 就缩」的独立触发，那个常量在文档里找不到平台依据，
 *    实测只是把 707KB 的取证截图砍成 922×1024；
 *  - 超预算时**先保像素**：不透明的图先试原尺寸转 JPEG（质量阶梯 0.88→0.68，逐档往下且不重复编码原图），
 *    能进预算就停。实测 2400×2667 的截图在 q80 就能从 3.2MB 压到 858KB —— 比「缩到 786 宽」值太多，
 *    截图的价值就是像素（786 宽的表头在手机上就是认不出）。阶梯一路探到 0.68 才动像素：
 *    降 12KB 就把 2400 宽砍到 1920（丢 36% 像素）是本末倒置；
 *  - 透明的图**不能**转 JPEG（透明底会压成黑块），只能留在 PNG 里缩像素；
 *  - 保像素也进不了预算才逐档缩像素（长边不低于 `MIN_EDGE`）；
 *  - 压完反而比原图大（截图类 PNG 常见）就回退原图 —— 重编码不但没收益，还掉像素；
 *  - **压到底仍超预算是 `overBudget`，不是成功**。900KB 是本项目自定的软预算（微信素材库
 *    远大于此），所以不选择抛错中断上传，但必须把这个事实交回调用方，不能静默。
 */
export async function prepareImage(input: Uint8Array, mime: string, options: PrepareImageOptions = {}): Promise<PrepareImageResult> {
  const maxBytes = options.maxBytes ?? 900 * 1024
  const sourceMime = (mime || 'image/jpeg').toLowerCase()
  const buf = Buffer.from(input)

  // 不超预算（或 GIF）就不开浏览器，宽高从文件头读。
  if (sourceMime === 'image/gif' || buf.length <= maxBytes) {
    const size = readImageSize(buf)
    return {
      bytes: buf,
      mimeType: sourceMime,
      width: size?.width ?? 0,
      height: size?.height ?? 0,
      changed: false,
      overBudget: false,
      fellBack: false,
    }
  }

  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    const dataUrl = `data:${sourceMime};base64,${buf.toString('base64')}`
    // 文件头解析不出来（少见格式/损坏）才交给浏览器量
    const size = readImageSize(buf)
    const probe = size ? { w: size.width, h: size.height } : await page.evaluate(browserProbeSize, dataUrl)
    const fullW = Math.max(1, probe.w)
    const fullH = Math.max(1, probe.h)

    const encode = async (w: number, h: number, type: string, q: number) => {
      const out = await reencode(page, dataUrl, w, h, type, q)
      return {
        bytes: Buffer.from(String(out).split(',')[1] ?? '', 'base64'),
        width: w,
        height: h,
        mimeType: type,
        jpegQuality: type === 'image/jpeg' ? q : undefined,
      }
    }

    // JPEG 无 alpha；其余（PNG/WebP）问浏览器。宁可误判成「有透明」也不能把透明压成黑底。
    const opaque = sourceMime === 'image/jpeg' || !(await page.evaluate(browserHasAlpha, dataUrl))

    type Candidate = { bytes: Buffer; width: number; height: number; mimeType: string; jpegQuality?: number }
    let best: Candidate | undefined
    const consider = (c: Candidate) => {
      if (!best || c.bytes.length < best.bytes.length) best = c
      return c.bytes.length <= maxBytes
    }

    // ① 保像素：原尺寸换编码（不透明 → JPEG 质量阶梯）
    if (opaque) {
      for (const q of JPEG_LADDER) {
        const cand = await encode(fullW, fullH, 'image/jpeg', q)
        if (consider(cand)) return { ...cand, changed: true, overBudget: false, fellBack: false }
      }
    }

    // ② 保像素进不了预算，才缩像素（透明的留在 PNG，不透明的继续用 JPEG 最低档）
    let w = fullW
    let h = fullH
    while (Math.max(w, h) > MIN_EDGE) {
      w = Math.max(1, Math.round(w * 0.8))
      h = Math.max(1, Math.round(h * 0.8))
      if (Math.max(w, h) < MIN_EDGE) break
      // 透明图必须保 PNG；不透明图已试过 JPEG 阶梯，这里继续 JPEG 但降到最低档
      const cand = opaque ? await encode(w, h, 'image/jpeg', JPEG_LADDER[JPEG_LADDER.length - 1] as number) : await encode(w, h, 'image/png', 1)
      if (consider(cand)) return { ...cand, changed: true, overBudget: false, fellBack: false }
    }

    if (!best) throw new Error('图片压缩失败：没有任何可用候选（原尺寸与缩像素都没产出结果）。')

    // 压不出收益就回退：掉像素换更大文件是纯亏
    if (best.bytes.length >= buf.length) {
      return { bytes: buf, mimeType: sourceMime, width: fullW, height: fullH, changed: false, fellBack: true, overBudget: true }
    }

    // 到这里说明「能压到的最小」仍超预算：把结果交出去，但标清楚（不得静默）
    return { ...best, changed: true, overBudget: best.bytes.length > maxBytes, fellBack: false }
  } finally {
    await page.close()
  }
}
export { renderMermaidToPng, closeMermaidPage }
