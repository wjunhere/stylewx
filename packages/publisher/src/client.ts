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

/** 视频素材上传结果。`vid` 是正片嵌入所需（形如 `apiv_4709954571878367233`）。 */
export interface VideoUploadResult extends UploadResult {
  /** 视频 ID。用 `getMaterial` 取回。 */
  vid: string
}

export interface VideoDescription {
  /** 视频标题（后台素材列表显示）。 */
  title: string
  /** 视频描述，可为空串。 */
  introduction: string
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

  /**
   * 上传视频到永久素材库（type=video）。
   *
   * 三个实测得到的硬约束（见 docs/DESIGN.md §20.10）：
   *   1. **必须带 description**（title + introduction），否则微信报 40007；
   *   2. 接口限制 **MP4 且 ≤10MB**（后台 UI 上传更宽松，但接口就是这条线）；
   *   3. **上传后要过审才能用**，且本方法返回的 media_id 拿不到 vid——
   *      vid 必须另调 `getMaterial()` 取（微信只在 get_material 里回 vid）。
   *
   * @returns media_id 与 vid（已自动调 getMaterial 回填）。
   */
  async uploadVideo(
    buffer: ArrayBuffer | Uint8Array,
    filename: string,
    description: VideoDescription,
    mimeType = 'video/mp4',
  ): Promise<VideoUploadResult> {
    const uploaded = await this.uploadMaterial('video', buffer, filename, mimeType, description)
    const detail = await this.getMaterial(uploaded.media_id)
    const vid = typeof detail.vid === 'string' ? detail.vid : ''
    if (!vid) {
      throw new Error(
        `视频已上传（media_id=${uploaded.media_id}）但未能取到 vid，可能仍在审核中。请稍后重试或到素材库核对。`,
      )
    }
    return { ...uploaded, vid }
  }

  /** 读取一个永久素材的详情。视频会返回 `vid` 与 `down_url`。 */
  async getMaterial(mediaId: string): Promise<Record<string, unknown>> {
    const token = await this.getAccessToken()
    const url = `${this.baseUrl}/cgi-bin/material/get_material?access_token=${encodeURIComponent(token)}`
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ media_id: mediaId }),
    })
    return parseJson(await response.text())
  }

  private async uploadMaterial(
    type: 'image' | 'thumb' | 'video',
    buffer: ArrayBuffer | Uint8Array,
    filename: string,
    mimeType?: string,
    description?: VideoDescription,
  ): Promise<UploadResult> {
    const token = await this.getAccessToken()
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)

    // 手动构造 multipart/form-data 字节体，不用原生 FormData/Blob。
    // 原因（真实验证）：Node 原生 FormData + Blob 在 undici fetch（尤其挂 ProxyAgent dispatcher）
    // 下 body 会被吞掉，微信返回 41005 media data missing；手写 multipart 在所有 fetch 实现下都稳定。
    const boundary = `----stylewx${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
    const ctype = mimeType && mimeType.includes('/') ? mimeType : (type === 'video' ? 'video/mp4' : 'image/jpeg')
    const enc = new TextEncoder()
    const parts: Uint8Array[] = [
      enc.encode(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="media"; filename="${filename.replace(/"/g, '')}"\r\n` +
          `Content-Type: ${ctype}\r\n\r\n`,
      ),
      bytes,
    ]
    // 视频必须带 description 字段，否则 40007 invalid media_id。
    if (type === 'video') {
      parts.push(
        enc.encode(
          `\r\n--${boundary}\r\nContent-Disposition: form-data; name="description"\r\n\r\n` +
            JSON.stringify({ title: description?.title ?? filename, introduction: description?.introduction ?? '' }) +
            `\r\n`,
        ),
      )
    }
    // 结束 boundary 前必须有 CRLF（multipart 规范）：上一个 part 的数据与 boundary 之间
    // 没有换行，严格解析器会把数据尾当成 boundary 的一部分，文件尾就不是合法文件尾 ——
    // 真实微信对 add_material 的文件嗅探会报 40113 unsupported file type（实测，
    // 同一字节直连同构造加 \r\n 即成功）。视频分支的 description part 自带前置 \r\n，
    // 图片分支此前漏了它 —— 这就是「上传图片偶发 40113」的根源。
    parts.push(enc.encode(`\r\n--${boundary}--\r\n`))

    const total = parts.reduce((n, p) => n + p.length, 0)
    const body = new Uint8Array(total)
    let off = 0
    for (const p of parts) {
      body.set(p, off)
      off += p.length
    }

    const url = `${this.baseUrl}/cgi-bin/material/add_material?access_token=${encodeURIComponent(token)}&type=${type}`
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body,
    })
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
