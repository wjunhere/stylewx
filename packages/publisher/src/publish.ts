/**
 * 发布编排：搬运图片 → 确定封面 media_id → 调 draft/add 写入草稿箱。
 * ⚠️ 只发布到「草稿箱」，不含任何群发（freepublish/submit）能力。
 */
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
  /** 原文链接（可选）。 */
  contentSourceUrl?: string
  needOpenComment?: boolean
  onlyFansCanComment?: boolean
  /** 发布时是否把外链图自动搬运到微信素材库。默认 true；false 则保留外链 URL。 */
  relocate?: boolean
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
  // 1. 优先使用显式封面图
  if (params.coverImage) {
    const { bytes, mimeType } = await client.downloadImage(params.coverImage)
    const thumb = await client.uploadThumb(bytes, guessThumbFilename(params.coverImage), mimeType)
    return thumb.media_id
  }
  // 2. 回退到正文第一张已上传的图（素材库 media_id 通用）
  if (uploaded[0]) return uploaded[0].media_id
  // 3. 都没有 → 自动生成一张主题色渐变封面（纯文字文章也能发布成功）
  const cover = generateDefaultCover()
  const thumb = await client.uploadThumb(cover.bytes, cover.filename, cover.mimeType)
  return thumb.media_id
}

function guessThumbFilename(url: string): string {
  const last = url.split('?')[0]?.split('/').filter(Boolean).pop()
  return last && /\.[a-z0-9]{2,5}$/i.test(last) ? last : 'cover.jpg'
}

function computeDigest(content: string, title: string, explicit?: string): string | undefined {
  if (explicit) return explicit
  const text = content
    .replace(/<[^>]+>/g, ' ')
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
      : await relocateExternalImages(params.content, client)
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
