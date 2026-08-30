/**
 * stylewx REST API —— 与 MCP tools 一一对应，复用同一套 service 层。
 * 端点：GET /themes、POST /themes/generate、POST /render、POST /validate、POST /drafts。
 * 所有错误返回统一格式 { error: { code, message, hint } }。
 */
import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import {
  analyzeArticle,
  generateTheme,
  listThemes,
  publishDraft,
  renderPreview,
  resolveTheme,
  validateArticle,
  serviceError,
  asServiceError,
} from '@stylewx/service'
import type { ServiceError } from '@stylewx/service'
import type { LlmClient } from '@stylewx/service'
import type { WeChatClient } from '@stylewx/publisher'

export interface ApiDeps {
  llm?: LlmClient
  wechat?: WeChatClient
}

const themeParamSchema = z.union([z.string(), z.record(z.string(), z.unknown())])

const generateBody = z.object({
  prompt: z.string().optional(),
  article: z.string().optional(),
  baseTheme: z.string().optional(),
})

const renderBody = z.object({
  markdown: z.string(),
  theme: themeParamSchema,
  includeScreenshot: z.boolean().optional(),
})

const validateBody = z.object({ html: z.string() })

const draftsBody = z.object({
  markdown: z.string().optional(),
  html: z.string().optional(),
  theme: themeParamSchema.optional(),
  title: z.string(),
  author: z.string().optional(),
  digest: z.string().optional(),
  coverImage: z.string().optional(),
  contentSourceUrl: z.string().optional(),
  needOpenComment: z.boolean().optional(),
})

function statusForError(code: string): number {
  switch (code) {
    case 'missing_llm_config':
    case 'missing_wechat_credential':
    case 'missing_config':
      return 503
    case 'invalid_theme':
    case 'invalid_input':
    case 'missing_content':
    case 'missing_title':
    case 'missing_cover':
      return 400
    case 'wechat_api_error':
    case 'publish_failed':
    case 'browser_not_installed':
      return 502
    default:
      return 500
  }
}

function respondError(c: Context, error: ServiceError): Response {
  return c.json(error, statusForError(error.error.code) as 400 | 500 | 502 | 503)
}

function errorObjectFrom(error: unknown, fallbackCode = 'internal_error'): ServiceError {
  if (error && typeof error === 'object' && 'error' in error) {
    const e = (error as ServiceError).error
    if (e && typeof e.code === 'string') return { error: e }
  }
  return asServiceError(error, fallbackCode)
}

export function createApp(deps: ApiDeps = {}): Hono {
  const app = new Hono()

  app.get('/themes', (c) => c.json(listThemes()))

  app.get('/health', (c) => c.json({ ok: true }))

  app.post('/themes/generate', async (c) => {
    if (!deps.llm) {
      return respondError(c, serviceError('missing_llm_config', 'generate_theme 需要 LLM 配置。', '请配置 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL 后重试；或先用 /themes 选择预置主题。'))
    }
    const body = generateBody.safeParse(await c.req.json().catch(() => ({})))
    if (!body.success) {
      return respondError(c, serviceError('invalid_input', '请求体不符合要求。', `请检查字段：${body.error.issues.map((i) => i.path.join('.')).join('、')}`))
    }
    try {
      const result = await generateTheme(body.data, deps.llm)
      return c.json({
        theme: result.theme,
        fallback: result.fallback,
        repairAttempts: result.repairAttempts,
        errorDetail: result.errorDetail,
        analysis: result.analysis,
        previewPngB64: result.previewPng ? result.previewPng.toString('base64') : undefined,
      })
    } catch (error) {
      return respondError(c, errorObjectFrom(error))
    }
  })

  app.post('/render', async (c) => {
    const body = renderBody.safeParse(await c.req.json().catch(() => ({})))
    if (!body.success) {
      return respondError(c, serviceError('invalid_input', '请求体不符合要求。', `请检查字段：${body.error.issues.map((i) => i.path.join('.')).join('、')}`))
    }
    try {
      const theme = resolveTheme(body.data.theme)
      const result = await renderPreview(body.data.markdown, theme, { includeScreenshot: body.data.includeScreenshot })
      return c.json({
        html: result.html,
        theme: result.theme,
        validation: result.validation,
        screenshotPngB64: result.screenshotPng ? result.screenshotPng.toString('base64') : undefined,
      })
    } catch (error) {
      return respondError(c, errorObjectFrom(error))
    }
  })

  app.post('/validate', async (c) => {
    const body = validateBody.safeParse(await c.req.json().catch(() => ({})))
    if (!body.success) {
      return respondError(c, serviceError('invalid_input', '请求体不符合要求。', '请提供 html 字符串字段。'))
    }
    return c.json(validateArticle(body.data.html))
  })

  app.post('/drafts', async (c) => {
    if (!deps.wechat) {
      return respondError(c, serviceError('missing_wechat_credential', 'publish_draft 需要微信凭据。', '请配置 WECHAT_APP_ID / WECHAT_APP_SECRET 后重试。'))
    }
    const body = draftsBody.safeParse(await c.req.json().catch(() => ({})))
    if (!body.success) {
      return respondError(c, serviceError('invalid_input', '请求体不符合要求。', `请检查字段：${body.error.issues.map((i) => i.path.join('.')).join('、')}`))
    }
    try {
      let content: string
      if (body.data.html) {
        content = body.data.html
      } else if (body.data.markdown) {
        if (!body.data.theme) throw serviceError('invalid_theme', '缺少 theme。', '使用 markdown 发布时需提供 theme，或改用 html。')
        const preview = await renderPreview(body.data.markdown, resolveTheme(body.data.theme))
        content = preview.html
      } else {
        throw serviceError('missing_content', '缺少正文。', '请提供 markdown 或 html 至少其一。')
      }
      const result = await publishDraft(deps.wechat, {
        content,
        title: body.data.title,
        author: body.data.author,
        digest: body.data.digest,
        coverImage: body.data.coverImage,
        contentSourceUrl: body.data.contentSourceUrl,
        needOpenComment: body.data.needOpenComment,
      })
      if (result && typeof result === 'object' && 'error' in result) {
        const err = (result as ServiceError).error
        return respondError(c, { error: err })
      }
      return c.json(result, 201)
    } catch (error) {
      return respondError(c, errorObjectFrom(error))
    }
  })

  return app
}
