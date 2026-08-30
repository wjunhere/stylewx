import { validateHtml } from '@stylewx/validator'
import type { ValidationReport } from '@stylewx/validator'
import { publishDraft as publisherPublishDraft } from '@stylewx/publisher'
import type { PublishParams, PublishResult } from '@stylewx/publisher'
import type { WeChatClient } from '@stylewx/publisher'
import { asServiceError } from './errors.js'
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
