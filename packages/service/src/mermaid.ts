/**
 * Mermaid 图的落地：把 :::mermaid 占位符替换成 <img> 本地资产。
 *
 * 管线位置：renderMarkdownToHtml（同步、组件占位）→ 这里（异步、Chromium 出图）
 * → validateHtml（校验的是替换后的最终 HTML，所以不会对图占位误报）。
 *
 * 为什么是 <img>：微信实测剥 id，Mermaid SVG 的 url(#…) 引用到读者端必裂；
 * <img> 与用户上传的截图走同一条已验证通道，发布时 relocate 统一搬微信素材库。
 *
 * 缓存：以图源码（base64url 编码串）为键做内存缓存；资产文件名也由源码 hash 派生
 * —— 编辑器防抖 300ms 一发渲染，同一张图反复出会拖垮 Chromium，磁盘命中后是纯拼接。
 */
import { renderMermaidToPng, closeMermaidPage } from '@stylewx/preview'
import { saveImageAsset } from './image-store.js'
import { decodeMermaidSource, MERMAID_DATA_ATTR } from '@stylewx/components'

/** 内存缓存：源码编码串 → 最终 <img> HTML。进程内，重启即失（资产在磁盘上，重建很快）。 */
const imgCache = new Map<string, string>()

/**
 * 占位符匹配：mermaid 组件渲染出的叶子 section（无子节点，整段替换安全）。
 *
 * 开标签不能写成 [^>]*：data-swx-src 里会原样保留 mermaid 源码，其中的箭头 -->
 * 含未转义的 >（escapeAttr 刻意不转义它，带引号的属性值里 > 本就合法），
 * 会把天真写法的"标签结束"提前截断。所以属性段用「带引号串或非引号字符」的循环：
 * (?:(?!\sdata-swx-mermaid)[^\"]"?...) 太绕，直接用 (?:"[^"]*"|[^>"])*——
 * 引号内的内容整段吞掉（含 >），引号外最多到 > 为止。
 */
const PLACEHOLDER_RE = new RegExp(
  '<section[^>]*\\s' + MERMAID_DATA_ATTR + '="([A-Za-z0-9_-]+)"(?:(?:"[^"]*")|[^>"])*>.*?</section>',
  'g',
)

export interface InlineMermaidResult {
  /** 替换后的 HTML。 */
  html: string
  /** 成功渲染的图数。 */
  rendered: number
  /** 渲染失败的图（含原因）；失败处替换为带源码的报错卡，不静默吞掉。 */
  failed: { reason: string }[]
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  )
}

/** 从占位符整段里抽图注（组件写在 data-swx-mermaid-caption）。 */
function captionOf(segment: string): string | undefined {
  const m = / data-swx-mermaid-caption="([^"]*)"/.exec(segment)
  const cap = m?.[1]?.trim()
  return cap ? cap : undefined
}

/** 渲染一张图并落资产库，返回最终 <img> 片段。 */
async function mermaidToImgHtml(encoded: string, caption: string | undefined): Promise<string> {
  const source = decodeMermaidSource(encoded)
  const { png } = await renderMermaidToPng(source)
  const saved = saveImageAsset(new Uint8Array(png), 'image/png')
  const cap = caption
    ? `<section style="font-size:12px;text-align:center;color:#797b7f;margin:8px 0 0;">${escapeHtml(caption)}</section>`
    : ''
  return (
    `<section style="margin:0 0 16px;text-align:center;">` +
    `<img src="${saved.urlPath}" alt="Mermaid 图" style="max-width:100%;height:auto;display:block;margin:0 auto;border-radius:6px;" />` +
    cap +
    `</section>`
  )
}

/** 渲染失败时的报错卡：把原因和源码都摆出来，作者一眼知道哪里写错了。 */
function failureCard(reason: string, source: string): string {
  return (
    `<section style="margin:0 0 16px;padding:14px 16px;border:1px solid #e8b4b0;border-radius:8px;">` +
    `<section style="font-size:13px;font-weight:600;color:#b42318;margin-bottom:6px;">Mermaid 图渲染失败</section>` +
    `<section style="font-size:12.5px;color:#8a4a45;line-height:1.6;">${escapeHtml(reason)}</section>` +
    (source
      ? `<pre style="font-size:11px;color:#8a4a45;white-space:pre-wrap;background-color:#faf1f0;border-radius:6px;padding:10px;margin:8px 0 0;">${escapeHtml(source)}</pre>`
      : '') +
    `</section>`
  )
}

/**
 * 把 HTML 里的 :::mermaid 占位符全部渲染并替换。
 * 没有占位符时零开销（一次正则探测即返回）。
 */
export async function inlineMermaidDiagrams(html: string): Promise<InlineMermaidResult> {
  const matches = [...html.matchAll(PLACEHOLDER_RE)]
  if (matches.length === 0) return { html, rendered: 0, failed: [] }

  let rendered = 0
  const failed: { reason: string }[] = []
  let out = html

  for (const match of matches) {
    const full = match[0] ?? ''
    const encoded = match[1] ?? ''
    const caption = captionOf(full)

    let replacement: string
    try {
      const cached = imgCache.get(encoded)
      replacement = cached ?? (await mermaidToImgHtml(encoded, caption))
      if (!cached) imgCache.set(encoded, replacement)
      rendered++
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      failed.push({ reason })
      let source = ''
      try { source = decodeMermaidSource(encoded) } catch { /* 源损坏就只报原因 */ }
      replacement = failureCard(reason, source)
    }
    out = out.replace(full, replacement)
  }

  return { html: out, rendered, failed }
}

/** 进程退出前释放常驻渲染页（透传 preview 的清理函数）。 */
export async function closeMermaidResources(): Promise<void> {
  await closeMermaidPage()
}
