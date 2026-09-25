/**
 * Mermaid → PNG 渲染。
 *
 * 为什么是「渲染成 PNG」而不是「把 SVG 原样放进正文」：
 *  - Mermaid 的 SVG 里全是 `url(#…)` 标记、`<marker>`、`<clipPath>` 引用，依赖大量 id；
 *  - 真实微信 draft/add → draft/get 实测会**剥离所有 id**（见 @stylewx/validator 的
 *    `svg-url-ref-broken` 规则），SVG 原样发布到读者端必然裂图；
 *  - `<img>` 是微信最稳的通道（上传截图 / 生成图表都走它），发布时 relocate 会把本地
 *    资产 URL 搬到微信素材库（见 packages/publisher/src/relocate.ts）。
 *
 * 为什么用 Chromium 里跑真 mermaid：
 *  - Mermaid 官方布局依赖 DOM（d3 / DOMPurify），Node 侧没有官方无 DOM 渲染器；
 *  - @stylewx/preview 本来就维护着惰性启动的 Chromium（截图 / 封面都在用），
 *    复用同一个实例，把 node_modules 里的 mermaid.min.js（3.5MB UMD）以脚本内容注入，
 *    **不引用任何 CDN**，离线可用；
 *  - 用官方实现而不是自写子集解析器：图类型覆盖完整（flowchart / sequence / class /
 *    state / ER / gantt / pie / mindmap / timeline / journey），语法行为与用户在其他
 *    工具里的经验一致。
 *
 * 性能：mermaid.min.js 每页注入一次（页面级缓存），渲染结果按源码 hash 落资产库，
 * 同一篇反复渲染（编辑器防抖 300ms 一发）不会重复出图。
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
declare const window: {
  mermaid?: {
    initialize: (cfg: Record<string, unknown>) => void
    render: (id: string, text: string) => Promise<{ svg: string }>
  }
}
declare const document: {
  createElement(tag: string): {
    style: { cssText: string }
    set innerHTML(html: string)
    querySelector(sel: string): { viewBox?: { baseVal?: { width?: number; height?: number } }; clientWidth: number; clientHeight: number } | null
    remove(): void
    width: number
    height: number
    getContext(kind: '2d'): { fillStyle: string; fillRect(x: number, y: number, w: number, h: number): void; drawImage(img: unknown, dx: number, dy: number, dw: number, dh: number): void }
    toDataURL(type: string): string
  }
  body: { appendChild(el: unknown): void }
}
declare const Image: {
  new (): {
    src: string
    onload: (() => void) | null
    onerror: (() => void) | null
  }
}
declare class XMLSerializer {
  serializeToString(node: unknown): string
}

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { getBrowser } from './index.js'
import type { Browser, Page } from 'playwright'

/** mermaid UMD 包内容（进程内只读一次）。 */
let mermaidScript: string | null = null
function mermaidBundle(): string {
  if (mermaidScript === null) {
    // 依赖是 pnpm 平铺的：从本包向上找 node_modules/mermaid
    let dir = dirname(fileURLToPath(import.meta.url))
    for (let i = 0; i < 6; i++) {
      try {
        mermaidScript = readFileSync(join(dir, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'), 'utf8')
        return mermaidScript
      } catch {
        dir = dirname(dir)
      }
    }
    throw new Error(
      '找不到 mermaid 的浏览器构建（node_modules/mermaid/dist/mermaid.min.js）。请先 pnpm install。',
    )
  }
  return mermaidScript
}

export interface MermaidRenderResult {
  /** PNG 字节。 */
  png: Buffer
  /** 图的像素宽高（2x 输出）。 */
  width: number
  height: number
  /** 同一源码的稳定指纹（调用方用于缓存 / 资产命名）。 */
  hash: string
}

/** 每次渲染开一个新页面、用完即关：常驻页会把进程的事件循环拖住，
 *  CLI 调用（MCP 工具、编辑器 API）会因此永不退出。脚本注入 3.5MB 约 100–300ms，
 *  相比 mermaid 布局本身可忽略，换来的是「进程一定退得出去」。 */
async function withMermaidPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(
      '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
      { waitUntil: 'load' },
    )
    await page.addScriptTag({ content: mermaidBundle() })
    await page.evaluate(() => {
      const m = window.mermaid
      if (!m) throw new Error('mermaid 注入失败：window.mermaid 不存在')
      m.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        // 字体用系统栈：微信端最终是位图，这里保证本机渲染一致
        theme: 'default',
        fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif',
        flowchart: { curve: 'basis', padding: 8 },
        sequence: { actorMargin: 40 },
      })
    })
    return await fn(page)
  } finally {
    await page.close().catch(() => {})
  }
}

/**
 * 把 Mermaid 源码渲染成 PNG。
 * @param code Mermaid 图源码（```mermaid 代码块内容）
 * @returns PNG 与尺寸；语法错误会抛出带行内提示的 Error（message 即 mermaid 的报错）
 */
/**
 * 把 Mermaid 源码渲染成 PNG。
 * @param code Mermaid 图源码（```mermaid 代码块或 :::mermaid 正文）
 * @returns PNG 与尺寸；语法错误会抛出 Error（message 即 mermaid 的报错）
 */
export async function renderMermaidToPng(code: string): Promise<MermaidRenderResult> {
  const source = String(code ?? '').trim()
  if (!source) throw new Error('Mermaid 源码为空。')
  const hash = createHash('sha1').update(source).digest('hex').slice(0, 16)

  // 两步在同一个临时页里完成：mermaid.render 出 SVG，然后 canvas 位图化（2x，白底）。
  // 用位图而不是 SVG 的原因见文件头：微信剥 id，SVG 引用到读者端必裂。
  return withMermaidPage(async (page) => {
    const result = (await page.evaluate(async (src: string) => {
      const m = window.mermaid
      if (!m) return { error: 'mermaid 未加载' }
      try {
        const { svg } = await m.render('m' + Math.random().toString(36).slice(2, 8), src)
        // 隐形挂载，确保尺寸计算正确（mermaid 官方推荐做法）
        const holder = document.createElement('div')
        holder.style.cssText = 'position:fixed;left:-99999px;top:0'
        holder.innerHTML = svg
        document.body.appendChild(holder)
        const el = holder.querySelector('svg')
        if (!el) return { error: 'mermaid 未返回 SVG' }
        const vb = el.viewBox?.baseVal
        const w = Math.max(1, Math.ceil(vb?.width || el.clientWidth || 600))
        const h = Math.max(1, Math.ceil(vb?.height || el.clientHeight || 400))
        const xml = new XMLSerializer().serializeToString(el)
        holder.remove()
        return { xml, w, h }
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
      }
    }, source)) as { error?: string; xml?: string; w?: number; h?: number }

    if (result.error || !result.xml) {
      throw new Error(result.error || 'Mermaid 渲染失败（无输出）。')
    }

    const scale = 2
    const dataUrl = (await page.evaluate(
      ({ xml, w, h, scale }: { xml: string; w: number; h: number; scale: number }) => {
        return new Promise<string>((resolve, reject) => {
          const img = new Image()
          img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = w * scale
            canvas.height = h * scale
            const ctx = canvas.getContext('2d')
            if (!ctx) return reject(new Error('canvas 不可用'))
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            resolve(canvas.toDataURL('image/png'))
          }
          img.onerror = () => reject(new Error('SVG 位图化失败'))
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
        })
      },
      { xml: result.xml, w: result.w ?? 600, h: result.h ?? 400, scale },
    )) as string

    const base64 = String(dataUrl).split(',')[1] ?? ''
    if (!base64) throw new Error('Mermaid 位图导出失败（空数据）。')
    return { png: Buffer.from(base64, 'base64'), width: (result.w ?? 600) * scale, height: (result.h ?? 400) * scale, hash }
  })
}
/** 兼容导出：渲染页已改为「每次一开一关」，没有常驻资源需要清理。 */
export async function closeMermaidPage(): Promise<void> {}
