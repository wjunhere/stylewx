import { existsSync, readFileSync } from 'node:fs'
import { validateHtml } from '@stylewx/validator'
import type { ValidationReport } from '@stylewx/validator'
import { publishDraft as publisherPublishDraft } from '@stylewx/publisher'
import type { PublishParams, PublishResult } from '@stylewx/publisher'
import type { WeChatClient } from '@stylewx/publisher'
import { asServiceError, serviceError } from './errors.js'
import type { ServiceError } from './errors.js'

export function validateArticle(html: string): { report: ValidationReport } {
  return { report: validateHtml(html) }
}

/**
 * 发布草稿（包装 publisher）。微信客户端由调用方注入。
 * 任何异常都会被包装为统一错误格式。
 */
export async function publishDraft(
  wechat: WeChatClient,
  params: PublishParams,
): Promise<PublishResult | ServiceError> {
  try {
    return await publisherPublishDraft(wechat, params)
  } catch (error) {
    return asServiceError(error, 'publish_failed')
  }
}

/** 视频上传参数。 */
export interface UploadVideoParams {
  /** 本地视频文件绝对路径（MP4）。 */
  path: string
  /** 视频标题（素材库列表显示，必填——微信要求 description，否则报 40007）。 */
  title: string
  /** 视频简介，可省略。 */
  description?: string
}

/** 视频上传结果。 */
export interface UploadVideoResult {
  media_id: string
  vid: string
  /** 接口侧的体积限制说明，便于调用方自查。 */
  maxBytes: number
}

/** 微信素材接口对视频的硬限制：MP4、10MB。 */
export const VIDEO_MAX_BYTES = 10 * 1024 * 1024

/**
 * 上传本地视频到微信永久素材库，返回 `video` 占位组件需要的 `vid`。
 *
 * ⚠️ 实测边界（docs/DESIGN.md §20.10）：
 *   - 上传成功 ≠ 立刻可用，微信要**过审**；未过审时取不到 vid，本函数会明确报错而不是返回空串。
 *   - 拿到 vid 也**塞不进正文**——正文里的视频只能人在编辑器点「视频」组件插入。
 *     所以这个工具的用途是「先把视频备好，再手动插入」，不是「一步发布」。
 */
export async function uploadVideo(
  wechat: WeChatClient,
  params: UploadVideoParams,
): Promise<UploadVideoResult | ServiceError> {
  try {
    if (!existsSync(params.path)) {
      throw serviceError('video_not_found', `视频文件不存在：${params.path}`, '请检查路径是否正确。')
    }
    const bytes = new Uint8Array(readFileSync(params.path))
    if (bytes.length > VIDEO_MAX_BYTES) {
      throw serviceError(
        'video_too_large',
        `视频 ${(bytes.length / 1024 / 1024).toFixed(1)}MB 超过素材接口上限 10MB。`,
        '请压缩后重试。后台 UI 上传的限制更宽松，但接口就是 10MB。',
      )
    }
    const filename = params.path.split(/[\/]/).pop() ?? 'video.mp4'
    const r = await wechat.uploadVideo(bytes, filename, {
      title: params.title,
      introduction: params.description ?? '',
    })
    return { media_id: r.media_id, vid: r.vid, maxBytes: VIDEO_MAX_BYTES }
  } catch (error) {
    return asServiceError(error, 'video_upload_failed')
  }
}
