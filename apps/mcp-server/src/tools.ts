/**
 * MCP tools 定义与处理逻辑。
 * 每个 tool 的 description 与每个参数的描述都面向「调用它的 Agent」撰写：
 * 说明使用场景、参数含义、典型错误及处理。
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  analyzeArticle,
  generateTheme,
  listThemes,
  listSavedThemes,
  saveTheme,
  exportTheme,
  deleteTheme,
  publishDraft,
  renderPreview,
  resolveTheme,
  validateArticle,
  serviceError,
  asServiceError,
} from '@mp-style/service'
import type { ServiceError } from '@mp-style/service'
import type { LlmClient } from '@mp-style/service'
import type { WeChatClient } from '@mp-style/publisher'

export interface ToolDeps {
  llm?: LlmClient
  wechat?: WeChatClient
}

type ToolResult = { content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>; isError?: boolean }

function errorResult(code: string, message: string, hint: string): ToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(serviceError(code, message, hint)) }],
  }
}

function errorResultFrom(error: unknown): ToolResult {
  if (error && typeof error === 'object' && 'error' in error) {
    const e = (error as ServiceError).error
    if (e && typeof e.code === 'string') return errorResult(e.code, e.message, e.hint)
  }
  const e = asServiceError(error)
  return errorResult(e.error.code, e.error.message, e.error.hint)
}

function textResult(text: unknown): ToolResult {
  return { content: [{ type: 'text', text: typeof text === 'string' ? text : JSON.stringify(text) }] }
}

function jsonText(value: unknown): string {
  return JSON.stringify(value)
}

/** 兜底包装：把 handler 抛出的任何错误转成统一错误结果，并透传参数。 */
function wrap<A>(fn: (args: A) => Promise<ToolResult>) {
  return async (args: A): Promise<ToolResult> => {
    try {
      return await fn(args)
    } catch (error) {
      return errorResultFrom(error)
    }
  }
}

const themeObjSchema = z.record(z.string(), z.unknown())

export function registerMcpTools(server: McpServer, deps: ToolDeps): void {
  // ---- list_themes ----
  server.registerTool(
    'list_themes',
    {
      title: '列出预置主题',
      description:
        '列出全部预置排版主题（含名称、描述、tokens 摘要）。主题描述说明了每套风格的适用场景，可直接用于选择。' +
        '调用后请阅读 description，结合文章内容挑选最契合的主题；需要自定义时再用 generate_theme。',
      inputSchema: {},
    },
    wrap(async () => {
      return textResult(listThemes())
    }),
  )

  // ---- list_saved_themes ----
  server.registerTool(
    'list_saved_themes',
    {
      title: '列出已保存主题',
      description:
        '列出你本地已保存的自定义 / AI 生成主题（持久化在 ~/.mp-style/themes.json）。' +
        '这些主题来自 generate_theme(save=true) 或 save_theme，可直接按名称传给 render_preview / publish_draft 复用。',
      inputSchema: {},
    },
    wrap(async () => textResult(listSavedThemes())),
  )

  // ---- save_theme ----
  server.registerTool(
    'save_theme',
    {
      title: '保存主题',
      description:
        '把一个主题对象保存到本地主题库（~/.mp-style/themes.json），方便以后复用。同名会覆盖。' +
        '主题会先过 Schema + 微信白名单校验，非法会返回明确错误。通常把 generate_theme 返回的 theme 直接存进来。',
      inputSchema: {
        theme: themeObjSchema.describe('要保存的完整主题对象（含 name/description/tokens/blocks），来自 generate_theme 的返回。'),
        name: z.string().optional().describe('可选：覆盖主题名；缺省用 theme.name。'),
      },
    },
    wrap(async ({ theme, name }) => {
      const t = name && typeof theme === 'object' ? { ...(theme as Record<string, unknown>), name } : theme
      return textResult(saveTheme(t))
    }),
  )

  // ---- export_theme ----
  server.registerTool(
    'export_theme',
    {
      title: '导出主题',
      description:
        '把一个主题导出为完整 JSON（含 name/description/tokens/blocks），可直接传给 render_preview / publish_draft 复用，' +
        '或保存下来分享。支持：已保存主题名、预置主题名、或完整主题对象。',
      inputSchema: {
        theme: z.union([z.string(), themeObjSchema]).describe('主题名（已保存或预置）或完整主题对象。'),
      },
    },
    wrap(async ({ theme }) => textResult(exportTheme(theme))),
  )

  // ---- analyze_article ----
  server.registerTool(
    'analyze_article',
    {
      title: '分析文章',
      description:
        '分析一篇 Markdown 文章：推断内容类型、情绪基调、建议主题方向、字数与预计阅读时长。' +
        '在正式开始排版前先调用它，能帮你选定方向；generate_theme 与 render_preview 会参考这里的结论。',
      inputSchema: {
        markdown: z
          .string()
          .describe('文章正文（Markdown，无需渲染）。内容越长，分析越准确。'),
      },
    },
    wrap(async ({ markdown }) => textResult(analyzeArticle(markdown))),
  )

  // ---- generate_theme ----
  server.registerTool(
    'generate_theme',
    {
      title: '生成主题',
      description:
        '通过 LLM 生成一版符合 Schema 的排版主题 JSON。可传入风格描述 prompt，或整篇 article（此时会先分析内容再生成）。' +
        '内置自检修复循环：生成结果会经过 zod 与微信白名单校验，失败会自动回传错误要求模型修复（最多重试 2 次），仍失败则降级返回最接近的预置主题并在 fallback=true 标记。' +
        '成功后会自动渲染一篇内置示例文章并附预览截图。需要配置 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL 环境变量。',
      inputSchema: {
        prompt: z
          .string()
          .optional()
          .describe('风格/设计需求描述，例如「科技感、深色底、青绿色点缀」。可与 article 二选一或同时提供。'),
        article: z
          .string()
          .optional()
          .describe('文章全文（Markdown）。提供时会先做一次内容分析，再据此生成主题；分析结论会随结果返回。'),
        baseTheme: z
          .string()
          .optional()
          .describe('预置主题名（可选）。以此为基础微调，例如 tech-minimal / business / magazine / gov-red / academic / dark-code。'),
        save: z
          .boolean()
          .optional()
          .describe('是否把生成的主题保存到本地主题库（~/.mp-style/themes.json），便于以后按名复用。默认 false。'),
      },
    },
    async (args) => {
      try {
        if (!deps.llm) {
          return errorResult(
            'missing_llm_config',
            'generate_theme 需要 LLM 配置，但当前未提供 LLM 客户端。',
            '请配置环境变量 LLM_BASE_URL、LLM_API_KEY、LLM_MODEL 后重启服务；或先用 list_themes 选择一个预置主题。',
          )
        }
        const result = await generateTheme(
          { prompt: args.prompt, article: args.article, baseTheme: args.baseTheme },
          deps.llm,
        )
        let saved = false
        if (args.save && result.theme) {
          saveTheme(result.theme)
          saved = true
        }
        const payload = {
          theme: result.theme,
          fallback: result.fallback,
          repairAttempts: result.repairAttempts,
          errorDetail: result.errorDetail,
          analysis: result.analysis,
          saved,
          savedLocation: saved ? '~/.mp-style/themes.json' : undefined,
        }
        const content: ToolResult['content'] = [{ type: 'text', text: jsonText(payload) }]
        if (result.previewPng) {
          content.push({ type: 'image', data: result.previewPng.toString('base64'), mimeType: 'image/png' })
        }
        return { content }
      } catch (error) {
        return errorResultFrom(error)
      }
    },
  )

  // ---- render_preview ----
  server.registerTool(
    'render_preview',
    {
      title: '渲染预览',
      description:
        '把 Markdown + 主题渲染成微信兼容的内联样式 HTML，并返回 iPhone 视口（390px 宽）的预览截图（PNG）与校验报告。' +
        '这是排版的核心链路：输出 HTML 不含 <style>/<link>/class 依赖，全部样式已内联。' +
        '若校验报告 pass=false，请先按 issues 中的建议修正后再发布。',
      inputSchema: {
        markdown: z.string().describe('文章正文（Markdown）。'),
        theme: z
          .union([z.string(), themeObjSchema])
          .describe(
            '主题：可为预置主题名（如 tech-minimal），或完整主题 JSON 对象（必须含 name/description/tokens/blocks 且 CSS 属性在微信白名单内）。可用 generate_theme 生成，或从 list_themes 的预置主题中选取。',
          ),
      },
    },
    wrap(async ({ markdown, theme }) => {
      const resolved = resolveTheme(theme)
      const result = await renderPreview(markdown, resolved)
      const content: ToolResult['content'] = [
        { type: 'text', text: jsonText({ html: result.html, validation: result.validation, theme: result.theme }) },
      ]
      if (result.screenshotPng) {
        content.push({ type: 'image', data: result.screenshotPng.toString('base64'), mimeType: 'image/png' })
      }
      return { content }
    }),
  )

  // ---- validate_article ----
  server.registerTool(
    'validate_article',
    {
      title: '校验文章',
      description:
        '校验一段 HTML 是否可发布到微信公众号。检查：微信白名单外的 CSS 属性、被过滤的标签（script/style/iframe 等）、' +
        '事件属性（on*）、javascript: 链接、外链图片、图片数量与正文长度。返回结构化报告 { pass, issues: [{ rule, severity, message, suggestion, location }] }，' +
        'suggestion 为可直接执行的修复建议。建议 publish 前必调。',
      inputSchema: {
        html: z.string().describe('待校验的 HTML（通常为 render_preview 的输出）。'),
      },
    },
    wrap(async ({ html }) => textResult(validateArticle(html))),
  )

  // ---- publish_draft ----
  server.registerTool(
    'publish_draft',
    {
      title: '发布草稿',
      description:
        '把文章发布到微信公众号「草稿箱」（draft/add）。支持：把外链图片自动搬运到微信素材库并替换为 mmbiz.qpic.cn 链接、' +
        '上传封面图得到 thumb_media_id、生成摘要。发布完成后仍需人工在公众号后台确认，本工具不会自动群发。' +
        '需要配置 WECHAT_APP_ID / WECHAT_APP_SECRET 环境变量。缺凭据时不会静默失败，会返回明确错误。',
      inputSchema: {
        markdown: z.string().optional().describe('文章正文（Markdown）。与 html 二选一；若提供则先用传入的 theme 渲染成 HTML。'),
        html: z.string().optional().describe('已渲染的内联样式 HTML。与 markdown 二选一。'),
        theme: z
          .union([z.string(), themeObjSchema])
          .optional()
          .describe('对 markdown 做渲染时使用的主题（预置主题名或主题 JSON；html 已提供时可省略）。'),
        title: z.string().describe('文章标题（必填）。'),
        author: z.string().optional().describe('作者名（可选）。'),
        digest: z.string().optional().describe('摘要（可选）。缺省会自动从正文截取前 120 字。'),
        coverImage: z.string().optional().describe('封面图 URL（建议 900×383 / 2.35:1）。缺省会用正文第一张图作为封面；若正文无图则必须提供。'),
        contentSourceUrl: z.string().optional().describe('原文链接（可选）。'),
        needOpenComment: z.boolean().optional().describe('是否允许用户评论，默认按公众号设置。'),
      },
    },
    async (args) => {
      try {
        if (!deps.wechat) {
          return errorResult(
            'missing_wechat_credential',
            'publish_draft 需要微信公众号凭据，但当前未配置微信客户端。',
            '请配置环境变量 WECHAT_APP_ID 与 WECHAT_APP_SECRET 后重启服务。',
          )
        }
        let content: string
        if (args.html) {
          content = args.html
        } else if (args.markdown) {
          if (!args.theme) throw serviceError('invalid_theme', '缺少 theme：使用 markdown 发布时需提供主题。', '请提供 theme 对象，或改用 html 参数。')
          const preview = await renderPreview(args.markdown, resolveTheme(args.theme))
          content = preview.html
        } else {
          throw serviceError('missing_content', '缺少正文内容。', '请提供 markdown 或 html 至少其一。')
        }
        const result = await publishDraft(deps.wechat, {
          content,
          title: args.title,
          author: args.author,
          digest: args.digest,
          coverImage: args.coverImage,
          contentSourceUrl: args.contentSourceUrl,
          needOpenComment: args.needOpenComment,
        })
        return textResult(result)
      } catch (error) {
        return errorResultFrom(error)
      }
    },
  )
}
