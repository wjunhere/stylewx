/**
 * 统一的服务/工具错误格式：{ error: { code, message, hint } }。
 * hint 面向 Agent，明确告诉下一步该怎么办。
 */
import { z } from 'zod'

export const serviceErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    hint: z.string(),
  }),
})

export type ServiceError = z.infer<typeof serviceErrorSchema>

/** 构建一个符合统一格式的错误对象。 */
export function serviceError(code: string, message: string, hint: string): ServiceError {
  return {
    error: {
      code,
      message,
      hint,
    },
  }
}

/** 把任意异常包装成统一错误（尽量保留中文可读提示）。 */
export function asServiceError(error: unknown, fallbackCode = 'internal_error'): ServiceError {
  if (error instanceof Error) {
    return serviceError(
      codeFromMessage(error.message) ?? fallbackCode,
      error.message,
      '请根据错误信息修正输入后重试；如无法解决，请检查配置或联系管理员。',
    )
  }
  return serviceError(
    fallbackCode,
    String(error),
    '未预期的错误，请重试或检查输入。',
  )
}

const CODE_PATTERNS: Array<[RegExp, string]> = [
  [/缺少|missing/i, 'missing_config'],
  [/主题.*不合法|无法渲染|白名单/i, 'invalid_theme'],
  [/标题|title/i, 'missing_title'],
  [/封面|coverimage/i, 'missing_cover'],
  [/凭证|凭据|app_id|app_secret/i, 'missing_wechat_credential'],
  [/errcode/i, 'wechat_api_error'],
  [/external|外链/i, 'external_image'],
  [/playwright install|chromium/i, 'browser_not_installed'],
]

function codeFromMessage(message: string): string | undefined {
  for (const [regex, code] of CODE_PATTERNS) {
    if (regex.test(message)) return code
  }
  return undefined
}
