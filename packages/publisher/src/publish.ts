/**
 * 发布编排：搬运图片 → 确定封面 media_id → 调 draft/add 写入草稿箱。
 * ⚠️ 只发布到「草稿箱」，不含任何群发（freepublish/submit）能力。
 */
import { isAbsolute } from 'node:path'
import { WeChatClient } from './client.js'
import type { DraftArticle } from './client.js'
import { relocateExternalImages } from './relocate.js'
import { generateDefaultCover } from './cover.js'

export interface PublishParams {
  /** 已渲染（内联样式）的 HTML 正文。 */
  content: string
  /** 文章标题。 */
  title: string
  /** 作者名（可选）。 */
  author?: string
  /** 摘要（可选，缺省会自动从正文截取）。 */
  digest?: string
  /** 封面图 URL（可选；若缺少会用文章第一张图作为封面）。 */
  coverImage?: string
  /** 封面原始字节（本地上传用，优先生效；不需要 URL）。 */
  coverData?: { bytes: Uint8Array; mimeType: string }
  /** 原文链接（可选）。 */
  contentSourceUrl?: string
  needOpenComment?: boolean
  onlyFansCanComment?: boolean
  /** 发布时是否把外链图自动搬运到微信素材库。默认 true；false 则保留外链 URL。 */
  relocate?: boolean
  /** 无封面图时，自动生成封面用的主题色（top=深色端，bottom=浅色端）。 */
  coverPalette?: { top?: string; bottom?: string }
  /** 把非 http(s) 图片引用解析回字节（编辑器资产库 / 本地路径）。 */
  resolveLocal?: (src: string) => { bytes: Uint8Array; mimeType: string } | undefined
}

export interface PublishResult {
  /** draft/add 返回的草稿 media_id。 */
  media_id: string
  /** 被搬运到素材库的图片。 */
  uploadedImages: { original: string; url: string; media_id: string }[]
  /** 用作封面的素材 media_id。 */
  coverMediaId?: string
  /** 搬运失败的图片。 */
  failedImages: { src: string; reason: string }[]
}

/** 由封面图/正文首图解析出 thumb_media_id。 */
async function resolveThumbMediaId(
  client: WeChatClient,
  params: PublishParams,
  uploaded: { original: string; url: string; media_id: string }[],
): Promise<string> {
  // 0. 本地上传的封面原始字节（最高优先，直接上传素材库，无需 URL）
  if (params.coverData && params.coverData.bytes.length > 0) {
    const ext = params.coverData.mimeType.includes('png') ? 'png' : 'jpg'
    const thumb = await client.uploadThumb(params.coverData.bytes, `cover.${ext}`, params.coverData.mimeType)
    return thumb.media_id
  }
  // 1. 优先使用显式封面图
  if (params.coverImage) {
    const thumb = await loadCover(params.coverImage, client, params.resolveLocal)
    return thumb.media_id
  }
  // 2. 回退到正文第一张已上传的图（素材库 media_id 通用）
  if (uploaded[0]) return uploaded[0].media_id
  // 3. 都没有 → 自动生成一张主题色渐变封面（纯文字文章也能发布成功）
  const cover = generateDefaultCover(params.coverPalette)
  const thumb = await client.uploadThumb(cover.bytes, cover.filename, cover.mimeType)
  return thumb.media_id
}

/**
 * 把封面引用变成素材库 media_id。
 *
 * 非 http(s) 的封面（品牌包的 `assets/cover.png`、编辑器资产库 URL、绝对路径）
 * 先过 `resolveLocal` 解析成字节，**不能拿去 HTTP 请求** —— 相对路径必然拿不到基准，
 * 报出的却是一个看起来像「网络坏了」的下载失败。正文图片早就走这条路（见 relocate.ts），
 * 封面这里曾经漏了：品牌包把 coverImage 改成包内相对路径后，发布会在封面这一步炸。
 */
async function loadCover(
  src: string,
  client: WeChatClient,
  resolveLocal: PublishParams['resolveLocal'],
): Promise<{ media_id: string }> {
  const isHttp = /^https?:\/\//i.test(src)
  if (isHttp) {
    const { bytes, mimeType } = await client.downloadImage(src)
    return client.uploadThumb(bytes, guessThumbFilename(src), mimeType)
  }
  const local = resolveLocal?.(src)
  if (!local) {
    // 没命中本地解析器 → 不是「读不到」，而是根本没给解析能力。
    // 相对路径必属此类（http(s) 已在上面分流），报「缺基准」才是可行动的提示。
    // 不在本包写一份「品牌相对路径」正则去分类：service 已有一份，两处必然锈。
    const isRelative = !isAbsolute(src) && !/^[a-zA-Z]:[\\/]/.test(src) && !src.startsWith('\\')
    throw new Error(
      isRelative
        ? `封面图是相对路径（${src}），但发布时没有提供解析基准。\n` +
            '相对路径在不同工作目录下指向不同文件，所以必须显式给基准 —— ' +
            '发布时传 `brand`（品牌档案名）由它定位品牌目录，或改用绝对路径 / http(s) 链接。'
        : `封面图无法解析：${src}\n` +
            '它不是 http(s) 链接，也没能按本地文件读出字节（不存在 / 不是图片 / 空文件 / 超过 20MB）。',
    )
  }
  return client.uploadThumb(local.bytes, guessThumbFilename(src), local.mimeType)
}

function guessThumbFilename(url: string): string {
  const last = url.split('?')[0]?.split('/').filter(Boolean).pop()
  return last && /\.[a-z0-9]{2,5}$/i.test(last) ? last : 'cover.jpg'
}

/**
 * 剥离标签取纯文本。
 *
 * 不用 `/<[^>]+>/g`：属性值里可能出现裸 `>`（`escapeAttr` 刻意不转义它，
 * 例如 `data-swx-music-source` 存的就是一整段 `<mp-common-clmusic …>` 标签），
 * 那种正则会被属性里的 `>` 骗到，把一段标签文本当作正文留在摘要里。
 * 这里是启发式流程（不是解析器），用引号感知的扫描就够：找到开标签后跳过带引号的属性值。
 */
export function stripHtmlTags(html: string): string {
  let out = ''
  for (let i = 0; i < html.length; i += 1) {
    if (html[i] !== '<') { out += html[i]; continue }
    let quote = ''
    let j = i + 1
    for (; j < html.length; j += 1) {
      const ch = html[j]
      if (quote) {
        if (ch === quote) quote = ''
      } else if (ch === '"' || ch === "'") {
        quote = ch
      } else if (ch === '>') {
        break
      }
    }
    i = j
    out += ' '
  }
  return out
}

function computeDigest(content: string, title: string, explicit?: string): string | undefined {
  if (explicit) return explicit
  const text = stripHtmlTags(content)
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return title || undefined
  const digest = text.slice(0, 120)
  return digest.length > 0 ? digest : title || undefined
}

/**
 * 把一篇文章发布到微信公众号「草稿箱」。
 * @returns 草稿 media_id 与确认信息。
 */
export async function publishDraft(
  client: WeChatClient,
  params: PublishParams,
): Promise<PublishResult> {
  if (!params.title || !params.title.trim()) {
    throw new Error('缺少文章标题 title。草稿发布必须提供标题。')
  }
  if (!params.content || !params.content.trim()) {
    throw new Error('缺少文章正文 content（渲染后的 HTML）。请先调用 render_preview 或渲染步骤。')
  }

  const relocated =
    params.relocate === false
      ? { html: params.content, uploaded: [], failed: [] }
      : await relocateExternalImages(params.content, client, { resolveLocal: params.resolveLocal })
  const coverMediaId = await resolveThumbMediaId(client, params, relocated.uploaded)

  const article: DraftArticle = {
    title: params.title.trim(),
    content: relocated.html,
    thumb_media_id: coverMediaId,
    author: params.author,
    digest: computeDigest(relocated.html, params.title, params.digest),
    content_source_url: params.contentSourceUrl,
    need_open_comment: params.needOpenComment,
    only_fans_can_comment: params.onlyFansCanComment,
  }

  const { media_id } = await client.addDraft(article)

  return {
    media_id,
    uploadedImages: relocated.uploaded,
    coverMediaId,
    failedImages: relocated.failed,
  }
}
