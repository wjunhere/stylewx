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
  renderFragment,
  resolveTheme,
  validateArticle,
  serviceError,
  asServiceError,
  tweakTheme,
  saveArticle,
  saveUserComponent,
  deleteUserComponent,
  listSavedComponents,
  brandInterview,
  brandSave,
  brandList,
  brandApply,
  brandLearn,
  brandDelete,
  readBrandDoc,
  reviewArticle,
} from '@stylewx/service'
import type { ServiceError } from '@stylewx/service'
import type { LlmClient } from '@stylewx/service'
import type { WeChatClient } from '@stylewx/publisher'
import type { Theme } from '@stylewx/theme'
import { COMPONENT_CATALOG, CATEGORY_LABELS, catalogToMarkdown, slotsForComponent } from '@stylewx/components'
import type { ComponentCategory } from '@stylewx/components'

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
        '列出你本地已保存的自定义 / AI 生成主题（持久化在 ~/.stylewx/themes.json）。' +
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
        '把一个主题对象保存到本地主题库（~/.stylewx/themes.json），方便以后复用。同名会覆盖。' +
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

  // ---- tweak_theme ----
  server.registerTool(
    'tweak_theme',
    {
      title: '微调主题',
      description:
        '在现有主题上做确定性微调：改主色/文字色/字号/行距/字体/圆角/卡片底等 token，或直接覆盖某个元素的 CSS 声明。' +
        '秒级返回、不调用 LLM，适合「改一点再试一下」的迭代；要从零生成新主题请用 generate_theme。' +
        '也可以传 components 做组件级样式覆盖（root / * / 语义部位）。' +
        '改动后会再过一次 Schema + 微信白名单校验，非法值返回明确错误。',
      inputSchema: {
        theme: z.union([z.string(), themeObjSchema]).describe('基础主题：预置主题名 / 已保存主题名 / 完整主题对象。'),
        tokens: z
          .record(z.string(), z.union([z.string(), z.number()]))
          .optional()
          .describe(
            '要改的 token，例如 { primaryColor: "#0b6bff", fontSize: "16px", lineHeight: 1.8, radius: "14px", cardBg: "#f8fafc" }。',
          ),
        blocks: z
          .record(z.string(), z.record(z.string(), z.string()))
          .optional()
          .describe(
            '直接覆盖元素 CSS 声明，例如 { p: { "font-size": "16px" }, h2: { "border-left": "4px solid #0b6bff" } }；属性必须在微信白名单内。',
          ),
        name: z.string().optional().describe('改主题名（保存不同版本时用）。'),
        description: z.string().optional().describe('改主题描述。'),
        components: z
          .record(z.string(), z.record(z.string(), z.record(z.string(), z.string())))
          .optional()
          .describe(
            '组件级样式覆盖，寻址键为 root（组件最外层）/ *（组件内所有元素）/ 语义部位（title、body…）。' +
              '例如 { card: { root: { padding: "20px" }, title: { "font-size": "19px" } } }。' +
              '可用部位见 list_components 返回的 slots 字段；写错部位会收到诊断。',
          ),
        preview: z.boolean().optional().describe('是否返回示例文章截图（默认 false，秒回）。'),
      },
    },
    wrap(async ({ theme, tokens, blocks, name, description, components, preview }) => {
      const result = await tweakTheme({
        theme: theme as string | Theme,
        patch: { tokens, blocks, name, description, components },
        preview,
      })
      const content: ToolResult['content'] = [
        { type: 'text', text: jsonText({ theme: result.theme, changed: result.changed, ok: result.ok }) },
      ]
      if (result.previewPng) {
        content.push({ type: 'image', data: result.previewPng.toString('base64'), mimeType: 'image/png' })
      }
      return { content }
    }),
  )
  // ---- list_components ----
  server.registerTool(
    'list_components',
    {
      title: '列出富组件',
      description:
        '列出 stylewx 支持的富组件（图片/图库/轮播/卡片/时间线/步骤/对比/引用/目录/分割线/章节标题/标签/提示框/背景/画布/点击展开/进度条/呼吸强调/封面/结尾卡片）及其语法与参数。' +
        '写法：`:::组件名{参数="值"}` 换行写正文 换行 `:::`；组件可嵌套，外层用更多冒号（如 ::::canvas 包裹 :::card）。' +
        '在 render_preview / publish_draft 之前调用它，可以避免写出不存在的组件或参数。',
      inputSchema: {
        category: z
          .enum(['image', 'structure', 'decor', 'interactive', 'article', 'custom'])
          .optional()
          .describe('只返回某一类组件；缺省返回全部。'),
        format: z
          .enum(['json', 'markdown'])
          .optional()
          .describe('json（默认）返回含完整参数表的结构化数据；markdown 返回速查表，适合直接拼进提示词。'),
      },
    },
    wrap(async ({ category, format }) => {
      const categories = category ? ([category] as ComponentCategory[]) : undefined
      if (format === 'markdown') {
        return textResult(
          `# stylewx 富组件速查

语法：

\`\`\`
:::组件名{参数="值"}
正文（Markdown）
:::
\`\`\`

` +
            `嵌套时外层用更多冒号：

\`\`\`
::::canvas{tone="paper"}
:::card{title="标题"}
正文
:::
::::
\`\`\`

` +
            catalogToMarkdown(categories),
        )
      }
      const builtin = COMPONENT_CATALOG.map((c) => ({
        ...c,
        origin: 'builtin' as const,
        slots: c.slots ?? slotsForComponent(c.name),
      }))
      // 本地自定义组件也一并返回，agent 才知道自己定义过什么
      const user = listSavedComponents().components.map((c) => ({
        name: c.name,
        category: 'custom' as const,
        summary: c.description || '自定义组件',
        example: `:::${c.name}\n正文\n:::`,
        template: c.template,
        defaults: c.defaults,
        origin: 'user' as const,
        slots: c.slots ?? ['root', '*'],
      }))
      const all = [...builtin, ...user]
      const components = categories ? all.filter((c) => categories.includes(c.category)) : all
      return textResult({
        syntax: {
          single: ':::card{title="标题"}\n正文\n:::',
          nested: '::::canvas{tone="paper"}\n:::card{title="标题"}\n正文\n:::\n::::',
          note: '组件可嵌套，外层用更多冒号；每个组件都必须用相同冒号数闭合。',
        },
        categories: CATEGORY_LABELS,
        components,
      })
    }),
  )

  // ---- analyze_article ----
  server.registerTool(
    'analyze_article',
    {
      title: '分析文章',
      description:
        '分析一篇 Markdown 文章：推断内容类型、情绪基调、建议主题方向、字数与预计阅读时长。' +
        '在正式开始排版前先调用它，能帮你选定方向；generate_theme 与 render_preview 会参考这里的结论。' +
        '若文章会用富组件，可同时调用 list_components 了解可用组件。',
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
          .describe('是否把生成的主题保存到本地主题库（~/.stylewx/themes.json），便于以后按名复用。默认 false。'),
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
          savedLocation: saved ? '~/.stylewx/themes.json' : undefined,
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
        '正文支持富组件语法（:::card / :::gallery / :::carousel / :::reveal 等），可用 list_components 查询全部组件与参数。' +
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
        {
          type: 'text',
          text: jsonText({
            html: result.html,
            validation: result.validation,
            theme: result.theme,
            diagnostics: result.diagnostics ?? [],
          }),
        },
      ]
      if (result.screenshotPng) {
        content.push({ type: 'image', data: result.screenshotPng.toString('base64'), mimeType: 'image/png' })
      }
      return { content }
    }),
  )

  // ---- render_fragment ----
  server.registerTool(
    'render_fragment',
    {
      title: '渲染片段',
      description:
        '只渲染一小段 Markdown（一个组件或一节），返回识别到的组件清单、组件诊断、校验报告与截图。' +
        '默认不返回 HTML（省上下文），需要时传 includeHtml=true。' +
        '这是逐段迭代的主工具：写完一段就渲染一次确认没问题，再写下一段；整篇定稿后再用 render_preview 做总检查。',
      inputSchema: {
        markdown: z.string().describe('片段 Markdown（可以只含一个 ::: 组件）。'),
        theme: z.union([z.string(), themeObjSchema]).describe('主题名或完整主题对象。'),
        includeHtml: z.boolean().optional().describe('是否返回 HTML（默认 false）。'),
        includeScreenshot: z.boolean().optional().describe('是否返回截图（默认 true）。'),
      },
    },
    wrap(async ({ markdown, theme, includeHtml, includeScreenshot }) => {
      const resolved = resolveTheme(theme)
      const result = await renderFragment(markdown, resolved, { includeHtml, includeScreenshot })
      const content: ToolResult['content'] = [
        {
          type: 'text',
          text: jsonText({
            components: result.components,
            diagnostics: result.diagnostics ?? [],
            validation: result.validation,
            ...(result.html ? { html: result.html } : {}),
          }),
        },
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

  // ---- save_article ----
  server.registerTool(
    'save_article',
    {
      title: '保存文章到本地',
      description:
        '把最终 Markdown 落盘到本地，并返回可直接打开的编辑器地址（带 ?file=，若传了 theme 则一并带上 &theme=）。' +
        '用于「agent 生成 → 人在本地编辑器微调」的交接：保存后把 editorUrl 交给用户，打开就能直接看到排版效果，不用再手选主题。' +
        '传了 theme 时会写入 .md 的 front-matter（---\ntitle: …\ntheme: …\n---），这样用户日后手动导入这个 md 也能还原主题。' +
        '写入范围限制在 STYLEWX_ARTICLES_DIR（默认当前工作目录）内，防止越权写文件。',
      inputSchema: {
        markdown: z.string().describe('文章 Markdown 全文。'),
        path: z.string().optional().describe('目标路径（相对文章根目录，或根目录内的绝对路径）；缺省按标题生成 <slug>.md。'),
        title: z.string().optional().describe('标题，用于生成默认文件名。'),
        theme: z
          .string()
          .optional()
          .describe(
            '排版使用的主题名（如 dusk-convergence）。会写进 .md 的 front-matter，并附在 editorUrl 上，' +
              '让用户打开编辑器时自动选中该主题。',
          ),
        force: z
          .boolean()
          .optional()
          .describe(
            '允许把已有文章覆盖成「明显更短」的内容。默认拒绝（原文件 ≥ 1KB 且新内容不足 25% 时报 content_shrunk），' +
              '因为这种覆写几乎都是误操作；确认无误时传 true。',
          ),
      },
    },
    wrap(async ({ markdown, path, title, theme, force }) =>
      textResult(saveArticle({ markdown, path, title, theme, force })),
    ),
  )

  // ---- save_component ----
  server.registerTool(
    'save_component',
    {
      title: '定义自定义组件',
      description:
        '用 HTML 模板定义一个新的富组件，存到本地组件库（~/.stylewx/components.json），之后用 `:::名字` 调用。' +
        '模板语法：`{{prop}}` 参数（默认转义，`{{prop|raw}}` 不转义）、`{{body}}` 正文、`{{theme.primary}}` 等主题配色、' +
        '`{{#if prop}}…{{/if}}` 条件、`{{#each body}}…{{/each}}` 按正文行迭代（块内 `{{this}}` / `{{this.0}}` / `{{@index}}`）。' +
        '模板里写 `data-swx-slot="title"` 可声明可被主题样式覆盖的部位。' +
        '保存前会用一个样例输入渲染并跑微信校验：script/style/iframe 等标签、on* 事件、position/filter 等属性会被直接拒绝。',
      inputSchema: {
        name: z.string().describe('组件名：小写字母开头，只能含小写字母/数字/连字符，例如 brand-quote。不能与内置组件重名。'),
        template: z.string().describe('HTML 模板，必须至少产出一个元素。'),
        description: z.string().optional().describe('组件说明（面向后续调用它的 agent）。'),
        defaults: z.record(z.string(), z.string()).optional().describe('参数默认值，例如 { tone: "primary" }。'),
        slots: z.array(z.string()).optional().describe('声明可定制部位（与模板里的 data-swx-slot 对应）。'),
      },
    },
    wrap(async ({ name, template, description, defaults, slots }) =>
      textResult(saveUserComponent({ name, template, description, defaults, slots })),
    ),
  )

  // ---- delete_component ----
  server.registerTool(
    'delete_component',
    {
      title: '删除自定义组件',
      description: '从本地组件库删除一个自定义组件。内置组件不受影响。',
      inputSchema: {
        name: z.string().describe('要删除的自定义组件名。'),
      },
    },
    wrap(async ({ name }) => textResult(deleteUserComponent(name))),
  )

  // ---- brand_interview ----
  server.registerTool(
    'brand_interview',
    {
      title: '品牌访谈问卷',
      description:
        '开始排版前若无品牌档案，先调用它获取结构化访谈问卷（定位/气质/色彩来源/资产/组件偏好五节）。' +
        '把问题一次性批量问用户（不要逐个来回问），然后由你提炼答案：推导色板（采样→收敛→论证）、产出完整主题 JSON 与品牌专属组件，' +
        '最后调 brand_save 固化。本工具只返回问卷数据，不调用 LLM——设计由你完成。',
      inputSchema: {},
    },
    wrap(async () => textResult(brandInterview())),
  )

  // ---- brand_save ----
  server.registerTool(
    'brand_save',
    {
      title: '保存品牌档案',
      description:
        '把访谈提炼出的品牌档案固化到 ~/.stylewx/brands/<name>/（profile.json 结构化真相源 + brand.md 人可读品牌宪法）。' +
        '主题与组件会先过 Schema + 微信白名单校验。rationale（色彩论证）必填且不可太短——写不出「为什么是这个色」就说明还在抄配方。' +
        '同名覆盖时 voice/taboos/learnings 会保留旧值，不会丢失迭代记录。',
      inputSchema: {
        name: z.string().describe('品牌档案 ID：小写字母开头的小写字母/数字/连字符，例如 tide-notes。'),
        displayName: z.string().optional().describe('展示名（通常是公众号名称）。'),
        description: z.string().describe('一句话品牌定位 + 气质关键词，例如「AI 工具评测号，气质：克制、专业、冷静」。'),
        rationale: z.string().describe('色彩论证：色值采样自哪里、为什么是这个色（≥10 字，这是防 AI slop 的自检门）。'),
        theme: themeObjSchema.describe('完整主题 JSON（name/description/tokens/blocks，CSS 在微信白名单内）。主题名会被强制对齐为品牌名。'),
        components: z
          .array(z.record(z.string(), z.unknown()))
          .optional()
          .describe('品牌专属组件定义数组（{ name, template, description?, defaults?, slots? }），逐个过微信校验。建议以品牌名为前缀，如 tide-quote。'),
        voice: z.array(z.string()).optional().describe('语气/编排规则，例如「每节末尾一句金句」「不用感叹号」。'),
        taboos: z.array(z.string()).optional().describe('禁忌清单，例如「不要目录」「正文不要居中」。'),
        doc: z.string().optional().describe('人可读的品牌宪法正文（Markdown）。缺省由档案自动生成骨架。'),
        logo: z.string().optional().describe('品牌 logo 图片 URL：用于文章开头品牌头图、封面、end-card 签名位，不进正文每节。'),
        coverImage: z.string().optional().describe('品牌默认封面图 URL（无特定封面时使用）。'),
        headerComponent: z.string().optional().describe('品牌头图组件名：每篇文章开头先调 :::该组件（通常含 logo + 品牌名 + 期号）。'),
      },
    },
    wrap(async (args) => textResult(brandSave(args))),
  )

  // ---- brand_list ----
  server.registerTool(
    'brand_list',
    {
      title: '列出品牌档案',
      description: '列出所有已保存的品牌档案（~/.stylewx/brands/）。排版新文章前先看这里：有档案就直接 brand_apply 复用，没有才走品牌访谈。',
      inputSchema: {},
    },
    wrap(async () => textResult(brandList())),
  )

  // ---- brand_apply ----
  server.registerTool(
    'brand_apply',
    {
      title: '加载品牌档案',
      description:
        '加载一个品牌档案并编译为可直接使用的排版资源：返回完整主题（直接传给 render_preview / publish_draft）、品牌宪法正文（作为设计上下文仔细阅读）、品牌专属组件清单。' +
        '品牌组件会自动同步进全局组件库，正文中直接用 :::组件名 调用即可。排版时严格遵循 brand.md 里的语气规则与禁忌。',
      inputSchema: {
        name: z.string().describe('品牌档案 ID（brand_list 里查）。'),
      },
    },
    wrap(async ({ name }) => textResult(brandApply(name))),
  )

  // ---- brand_learn ----
  server.registerTool(
    'brand_learn',
    {
      title: '品牌迭代记录',
      description:
        '在品牌档案追加一条迭代记录（写进 profile.learnings 与 brand.md 迭代记录节）。' +
        '每次排版发布后调用：记录用户反馈（「嫌卡片太花」）、修正决策（「h2 加左边框更好」）、踩过的坑。' +
        '这些记录会在下次 brand_apply 时随品牌宪法一起读到，让品牌档案越用越准。',
      inputSchema: {
        name: z.string().describe('品牌档案 ID。'),
        note: z.string().describe('这条经验的内容，一句话说清楚「学到什么/改了什么/为什么」。'),
      },
    },
    wrap(async ({ name, note }) => textResult(brandLearn(name, note))),
  )

  // ---- brand_delete ----
  server.registerTool(
    'brand_delete',
    {
      title: '删除品牌档案',
      description: '删除整个品牌档案目录（含 profile.json 与 brand.md）。谨慎操作。',
      inputSchema: { name: z.string().describe('要删除的品牌档案 ID。') },
    },
    wrap(async ({ name }) => textResult(brandDelete(name))),
  )

  // ---- review_article ----
  server.registerTool(
    'review_article',
    {
      title: '发布前评审',
      description:
        '发布前的确定性品味检查：标题/正文层级比（h1≥2.0、h2≥1.5）、组件堆砌检测（类型>6 种警告、密度>4/千字警告）、' +
        '主题独特性（与预置主题完全一致提示缺品牌感）。返回结构化 issues + 定性评审框架。' +
        '发布前调用：结合 render_preview 的 390px 截图做眯眼测试与 AI 感自查，输出 Keep/Fix/Quick Wins，确认无 error 再 publish_draft。',
      inputSchema: {
        markdown: z.string().describe('文章 Markdown 全文（统计组件使用）。'),
        theme: themeObjSchema.describe('排版使用的完整主题对象。'),
      },
    },
    wrap(async ({ markdown, theme }) =>
      textResult(reviewArticle(markdown, theme as Theme, { presetThemes: listThemes().themes })),
    ),
  )
}

