/**
 * 图片搬运管线：把 HTML 中的外链图片下载后上传到微信素材库，
 * 并把 img src 替换为微信图床（mmbiz.qpic.cn）URL。
 * 这是「发布到草稿」前让内容真正可显示的关键一步。
 */
import { unified } from 'unified'
import rehypeParse from 'rehype-parse'
import rehypeStringify from 'rehype-stringify'
import { WeChatClient } from './client.js'

const ALLOWED_IMAGE_HOSTS = ['mmbiz.qpic.cn', 'wx.qlogo.cn', 'mp.weixin.qq.com']

export interface UploadedImage {
  original: string
  url: string
  media_id: string
}

export interface RelocateResult {
  html: string
  /** 成功搬运到素材库的图片。 */
  uploaded: UploadedImage[]
  /** 被忽略（本就是微信/内联 data uri）的图片。 */
  skipped: string[]
  /** 搬运失败的图片（含原因）。 */
  failed: { src: string; reason: string }[]
}

function isWechatImage(src: string): boolean {
  const s = src.trim()
  if (s.startsWith('data:image/')) return true
  try {
    const url = new URL(s)
    const host = url.hostname.toLowerCase()
    return host === 'mmbiz.qpic.cn' || host.endsWith('.qpic.cn') || ALLOWED_IMAGE_HOSTS.includes(host)
  } catch {
    return false
  }
}

interface HastNode {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

function isElement(node: HastNode): node is HastNode & { tagName: string; properties: Record<string, unknown> } {
  return node.type === 'element' && typeof node.tagName === 'string'
}

/** 递归处理所有 img，返回搬运结果。 */
async function processImages(
  node: HastNode,
  client: WeChatClient,
  result: RelocateResult,
  resolveLocal?: RelocateOptions['resolveLocal'],
): Promise<void> {
  if (!isElement(node)) return

  const tag = node.tagName.toLowerCase()
  // 普通 <img> 与 SVG <image>（轮播/封面用的就是它）都要搬运。
  const srcKey = tag === 'img' ? 'src' : tag === 'image' ? (node.properties.href ? 'href' : 'xlinkHref') : null
  if (srcKey) {
    const src = node.properties[srcKey]
    if (typeof src !== 'string' || !src.trim()) {
      result.skipped.push(String(src ?? '(no src)'))
    } else if (isWechatImage(src)) {
      result.skipped.push(src)
    } else {
      try {
        // 先问本地（编辑器资产库 / 文件路径），拿不到再走 HTTP 下载
        const local = resolveLocal?.(src)
        const { bytes, mimeType } = local ?? (await client.downloadImage(src))
        const filename = guessFilename(src)
        const uploaded = await client.uploadImage(bytes, filename, mimeType)
        const finalUrl = uploaded.url ?? uploaded.media_id
        node.properties[srcKey] = finalUrl
        // SVG <image> 统一用 href（SVG2），避免微信剥离 xlink:href
        if (tag === 'image' && srcKey === 'xlinkHref') {
          delete node.properties.xlinkHref
          node.properties.href = finalUrl
        }
        result.uploaded.push({ original: src, url: finalUrl, media_id: uploaded.media_id })
      } catch (error) {
        result.failed.push({
          src,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  if (node.children) {
    for (const child of node.children) await processImages(child, client, result)
  }
}

function guessFilename(src: string): string {
  const clean = src.split('?')[0] ?? ''
  const last = clean.split('/').filter(Boolean).pop() ?? 'image'
  if (/\.[a-z0-9]{2,5}$/i.test(last)) return last
  return `image_${Math.random().toString(36).slice(2, 8)}.jpg`
}

/**
 * 搬运 HTML 中所有外链图片到微信素材库。
 * @param html 已渲染的内联样式 HTML
 * @param client 已配置的微信客户端
 * @param options.resolveLocal 可选：把非 http(s) 引用（本地路径 / 本地资产 URL）解析回字节。
 *   返回 undefined 表示调用方不认识这个源，交回默认的 HTTP 下载。
 *   为什么做成钩子：publisher 只负责微信协议，不该知道本地文件系统长什么样。
 */
export interface RelocateOptions {
  /** 把非 http(s) 引用解析回字节；返回 undefined 则交回默认 HTTP 下载。 */
  resolveLocal?: (src: string) => { bytes: Uint8Array; mimeType: string } | undefined
}

export async function relocateExternalImages(
  html: string,
  client: WeChatClient,
  options: RelocateOptions = {},
): Promise<RelocateResult> {
  const processor = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeStringify)
  const tree = processor.parse(html) as unknown as HastNode

  const result: RelocateResult = { html: '', uploaded: [], skipped: [], failed: [] }
  if (tree.children) {
    for (const child of tree.children) await processImages(child, client, result, options.resolveLocal)
  }
  result.html = String(processor.stringify(tree as never))
  return result
}
