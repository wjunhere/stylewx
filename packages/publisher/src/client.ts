import { toHttpConfig } from './config.js'
import type { PublisherConfig } from './config.js'

interface TokenCache {
  token: string
  expiresAt: number
}

export interface UploadResult {
  media_id: string
  url?: string
}

export interface DraftArticle {
  title: string
  content: string
  author?: string
  digest?: string
  thumb_media_id: string
  content_source_url?: string
  need_open_comment?: boolean
  only_fans_can_comment?: boolean
}

export interface DraftResult {
  media_id: string
}

const TOKEN_REFRESH_EARLY_MS = 5 * 60 * 1000 // 提前 5 分钟刷新

/**
 * 微信公众号 API 客户端。
 *
 * ⚠️ 安全边界（有意为之）：本客户端只实现「发布到草稿箱」draft/add，
 * 绝不实现群发接口（freepublish/submit）。所有内容在进入草稿箱后仍需人工在
 * 公众号后台确认，不提供任何绕过人工确认的自动化群发能力。
 */
export class WeChatClient {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly appId: string
  private readonly appSecret: string
  private tokenCache: TokenCache | null = null

  constructor(config: PublisherConfig) {
    const http = toHttpConfig(config)
    this.baseUrl = http.baseUrl
    this.fetchImpl = http.fetchImpl
    this.appId = config.appId
    this.appSecret = config.appSecret
  }

  /**
   * 获取 access_token。
   * 使用内存缓存；当剩余有效期不足 5 分钟时提前刷新，避免 token 在请求中途失效。
   */
  async getAccessToken(): Promise<string> {
    const now = Date.now()
    if (this.tokenCache && this.tokenCache.expiresAt - TOKEN_REFRESH_EARLY_MS > now) {
      return this.tokenCache.token
    }
    const url =
      `${this.baseUrl}/cgi-bin/token?grant_type=client_credential` +
      `&appid=${encodeURIComponent(this.appId)}&secret=${encodeURIComponent(this.appSecret)}`
    const response = await this.fetchImpl(url, { method: 'GET' })
    const data = await parseJson(await response.text())
    if (!data.access_token || !data.expires_in) {
      throw apiError('获取 access_token 失败', data)
    }
    const expiresIn = Number(data.expires_in)
    this.tokenCache = {
      token: String(data.access_token),
      expiresAt: now + expiresIn * 1000,
    }
    return this.tokenCache.token
  }

  /** 强制清空 token 缓存（测试用 / 手动刷新）。 */
  clearTokenCache(): void {
    this.tokenCache = null
  }

  /**
   * 上传图片到微信公众号「永久素材库」。返回 { media_id, url }。
   * url 即 mmbiz.qpic.cn 图床地址，可安全内联到文章 content 中。
   */
  async uploadImage(
    buffer: ArrayBuffer | Uint8Array,
    filename: string,
    mimeType?: string,
  ): Promise<UploadResult> {
    return this.uploadMaterial('image', buffer, filename, mimeType)
  }

  /** 上传封面缩略图（type=thumb），返回 media_id。 */
  async uploadThumb(
    buffer: ArrayBuffer | Uint8Array,
    filename: string,
    mimeType?: string,
  ): Promise<UploadResult> {
    return this.uploadMaterial('thumb', buffer, filename, mimeType)
  }

  private async uploadMaterial(
    type: 'image' | 'thumb',
    buffer: ArrayBuffer | Uint8Array,
    filename: string,
    mimeType?: string,
  ): Promise<UploadResult> {
    const token = await this.getAccessToken()
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    const blob = new Blob([bytes], { type: mimeType ?? 'application/octet-stream' })
    const form = new FormData()
    form.append('media', blob, filename)

    const url = `${this.baseUrl}/cgi-bin/material/add_material?access_token=${encodeURIComponent(token)}&type=${type}`
    const response = await this.fetchImpl(url, { method: 'POST', body: form })
    const data = await parseJson(await response.text())
    if (!data.media_id) {
      throw apiError(`上传素材失败（type=${type}）`, data)
    }
    return {
      media_id: String(data.media_id),
      url: typeof data.url === 'string' ? data.url : undefined,
    }
  }

  /** 下载任意图片为字节（用于搬运外链图到素材库）。 */
  async downloadImage(url: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const response = await this.fetchImpl(url)
    if (!response.ok) {
      throw new Error(`下载图片失败（HTTP ${response.status}）：${url}`)
    }
    const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? 'image/jpeg'
    const arrayBuffer = await response.arrayBuffer()
    return { bytes: new Uint8Array(arrayBuffer), mimeType }
  }

  /**
   * 新增文章到「草稿箱」。
   * ⚠️ 仅 draft/add；不含任何群发（freepublish/submit）逻辑。
   */
  async addDraft(article: DraftArticle): Promise<DraftResult> {
    const token = await this.getAccessToken()
    const url = `${this.baseUrl}/cgi-bin/draft/add?access_token=${encodeURIComponent(token)}`
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ articles: [article] }),
    })
    const data = await parseJson(await response.text())
    if (!data.media_id) {
      throw apiError('发布草稿失败（draft/add）', data)
    }
    return { media_id: String(data.media_id) }
  }
}

async function parseJson(text: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { raw: text }
  }
}

function apiError(prefix: string, data: Record<string, unknown>): Error {
  const code = data.errcode
  const message = data.errmsg ? String(data.errmsg) : JSON.stringify(data)
  return new Error(`${prefix}：errcode=${String(code)}，errmsg=${message}`)
}
