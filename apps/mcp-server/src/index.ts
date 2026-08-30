/**
 * stylewx MCP Server 入口。
 * 双传输模式：--transport stdio（默认） | --transport http。
 * 依赖注入：从环境变量构造 LLM / 微信客户端；缺少时对应 tool 会返回明确错误，而非崩溃。
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMcpServer } from './server.js'
import {
  loadLlmConfigFromEnv,
  LlmClient,
  listThemes,
  listSavedThemes,
  renderPreview,
  generateTheme,
  saveTheme,
  exportTheme,
  validateArticle,
  resolveTheme,
  optimizeArticle,
  asServiceError,
} from '@stylewx/service'
import { loadConfigFromEnv, WeChatClient, publishDraft as publisherPublishDraft } from '@stylewx/publisher'
import type { ToolDeps } from './tools.js'

interface CliOptions {
  transport: 'stdio' | 'http'
  port: number
}

function parseArgs(argv: string[]): CliOptions {
  let transport: 'stdio' | 'http' = 'stdio'
  let port = 3000
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--transport') {
      const next = argv[i + 1]
      if (next === 'http' || next === 'stdio') transport = next
    } else if (arg === '--port') {
      const next = Number(argv[i + 1])
      if (Number.isFinite(next)) port = next
    }
  }
  return { transport, port }
}

/** 从环境构造依赖；LLM / 微信客户端缺失时不抛错，对应的 tool 会返回明确错误。 */
function buildDeps(): ToolDeps {
  const deps: ToolDeps = {}
  try {
    const llmConfig = loadLlmConfigFromEnv()
    deps.llm = new LlmClient(llmConfig)
  } catch {
    // 缺 LLM 配置：generate_theme 可用 list_themes 兜底
    deps.llm = undefined
  }
  try {
    const wxConfig = loadConfigFromEnv()
    deps.wechat = new WeChatClient(wxConfig)
  } catch {
    // 缺微信凭据：publish_draft 会返回清晰错误
    deps.wechat = undefined
  }
  return deps
}

// ---------- 本地 Web 编辑器（/editor + /editor/api/*） ----------

async function readJsonBody(req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
  let body = ''
  for await (const chunk of req) body += chunk
  if (!body) return {}
  try {
    return JSON.parse(body) as Record<string, unknown>
  } catch {
    return {}
  }
}

function sendJson(res: import('node:http').ServerResponse, obj: unknown, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

function sendErr(res: import('node:http').ServerResponse, error: { code: string; message: string; hint: string }, status = 400): void {
  sendJson(res, { error }, status)
}

async function handleEditorApi(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  path: string,
  url: URL,
  deps: ToolDeps,
): Promise<void> {
  try {
    if (path === '/editor/api/themes' && req.method === 'GET') {
      const savedNames = new Set(listSavedThemes().themes.map((t) => t.name))
      const themes = listThemes().themes.map((t) => ({ ...t, origin: savedNames.has(t.name) ? 'saved' : 'preset' }))
      return sendJson(res, { themes })
    }

    if (path === '/editor/api/render' && req.method === 'POST') {
      const b = await readJsonBody(req)
      const markdown = typeof b.markdown === 'string' ? b.markdown : ''
      if (!markdown) return sendErr(res, { code: 'missing_content', message: '缺少 markdown 正文。', hint: '请提供 markdown 字段。' })
      const theme = resolveTheme(b.theme ?? 'magazine')
      // 编辑器用轻量渲染：跳过 Chromium 截图（每次键入都截会很贵），仅返回 HTML + 校验
      const r = await renderPreview(markdown, theme, { includeScreenshot: false })
      return sendJson(res, {
        html: r.html,
        validation: r.validation,
        theme: r.theme,
      })
    }

    if (path === '/editor/api/validate' && req.method === 'POST') {
      const b = await readJsonBody(req)
      return sendJson(res, validateArticle(typeof b.html === 'string' ? b.html : ''))
    }

    if (path === '/editor/api/generate' && req.method === 'POST') {
      if (!deps.llm) return sendErr(res, { code: 'missing_llm_config', message: '需要 LLM 配置。', hint: '请配置 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL 后重启服务。' })
      const b = await readJsonBody(req)
      const result = await generateTheme(
        {
          prompt: typeof b.prompt === 'string' ? b.prompt : undefined,
          article: typeof b.article === 'string' ? b.article : undefined,
          baseTheme: typeof b.baseTheme === 'string' ? b.baseTheme : undefined,
        },
        deps.llm,
      )
      let saved = false
      if (b.save && result.theme) {
        saveTheme(result.theme)
        saved = true
      }
      return sendJson(res, {
        theme: result.theme ? { ...result.theme, origin: 'saved' } : undefined,
        fallback: result.fallback,
        repairAttempts: result.repairAttempts,
        saved,
        analysis: result.analysis,
        previewPng: result.previewPng ? result.previewPng.toString('base64') : undefined,
      })
    }

    if (path === '/editor/api/savetheme' && req.method === 'POST') {
      const b = await readJsonBody(req)
      if (!b.theme) return sendErr(res, { code: 'invalid_theme', message: '缺少 theme。', hint: '请提供主题 JSON 对象。' })
      const t = saveTheme(b.theme)
      return sendJson(res, { theme: t.theme })
    }

    if (path === '/editor/api/export' && req.method === 'GET') {
      const name = url.searchParams.get('theme') || ''
      const r = exportTheme(name)
      return sendJson(res, { theme: r.theme })
    }

    if (path === '/editor/api/publish' && req.method === 'POST') {
      if (!deps.wechat) return sendErr(res, { code: 'missing_wechat_credential', message: '需要微信凭据。', hint: '请配置 WECHAT_APP_ID / WECHAT_APP_SECRET 后重启服务。' })
      const b = await readJsonBody(req)
      const title = typeof b.title === 'string' && b.title.trim() ? b.title.trim() : ''
      const markdown = typeof b.markdown === 'string' ? b.markdown : ''
      if (!title) return sendErr(res, { code: 'missing_title', message: '缺少标题。', hint: '请提供 title。' })
      const theme = resolveTheme(typeof b.theme === 'string' ? b.theme : 'magazine')
      const { html } = await renderPreview(markdown, theme)
      // 封面：优先本地上传的原始字节（base64），否则用 URL
      const coverData =
        typeof b.coverData === 'string' && b.coverData
          ? { bytes: new Uint8Array(Buffer.from(b.coverData, 'base64')), mimeType: typeof b.coverMime === 'string' ? b.coverMime : 'image/jpeg' }
          : undefined
      const result = await publisherPublishDraft(deps.wechat, {
        content: html,
        title,
        coverImage: typeof b.coverImage === 'string' ? b.coverImage : undefined,
        coverData,
        author: typeof b.author === 'string' ? b.author : undefined,
        relocate: b.relocate !== false,
      })
      return sendJson(res, { media_id: result.media_id, uploadedImages: result.uploadedImages, coverMediaId: result.coverMediaId })
    }

    if (path === '/editor/api/optimize' && req.method === 'POST') {
      if (!deps.llm) return sendErr(res, { code: 'missing_llm_config', message: '需要 LLM 配置。', hint: '请配置 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL 后重启服务。' })
      const b = await readJsonBody(req)
      const markdown = typeof b.markdown === 'string' ? b.markdown : ''
      const prompt = typeof b.prompt === 'string' && b.prompt.trim() ? b.prompt.trim() : undefined
      const sel = b.selection as { start?: number; end?: number } | undefined
      const selection =
        sel && typeof sel.start === 'number' && typeof sel.end === 'number' ? { start: sel.start, end: sel.end } : undefined
      const r = await optimizeArticle(markdown, deps.llm, { prompt, selection })
      return sendJson(res, { markdown: r.markdown })
    }

    return sendErr(res, { code: 'not_found', message: '未知 /editor/api 端点：' + path, hint: '请检查路径。' }, 404)
  } catch (error) {
    const e = asServiceError(error)
    return sendErr(res, e.error)
  }
}

async function runStdio(): Promise<void> {
  const server = createMcpServer(buildDeps())
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[stylewx] MCP server (stdio) started.')
}

async function runHttp(port: number): Promise<void> {
  const transports = new Map<string, StreamableHTTPServerTransport>()
  const deps = buildDeps()
  const editorHtmlPath = resolve(dirname(fileURLToPath(import.meta.url)), '../editor.html')

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    // 本地 Web 编辑器（WeMD 风格）；每次读取，改 editor.html 后即时生效
    if (path === '/editor') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(readFileSync(editorHtmlPath, 'utf8'))
      return
    }
    if (path.startsWith('/editor/api/')) {
      await handleEditorApi(req, res, path, url, deps)
      return
    }
    if (path !== '/mcp') {
      res.writeHead(404)
      res.end('Not Found')
      return
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined
    let transport = sessionId ? transports.get(sessionId) : undefined
    const isNew = !transport

    if (req.method === 'GET') {
      // SSE 拉起：必须有既有会话，否则按规范 404
      if (!transport) {
        res.writeHead(404)
        res.end('Not Found')
        return
      }
      await transport.handleRequest(req, res)
      return
    }

    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      })
      const mcp = createMcpServer(buildDeps())
      transport.onclose = () => {
        if (transport && transport.sessionId) transports.delete(transport.sessionId)
      }
      await mcp.connect(transport)
    }

    await transport.handleRequest(req, res)

    // 会话 ID 在处理 initialize 之后才会生成，这里再登记到会话表
    if (isNew && transport.sessionId) {
      transports.set(transport.sessionId, transport)
    }
  })

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.error(`[stylewx] MCP server (Streamable HTTP) listening on http://localhost:${port}/mcp`)
  })

  const shutdown = (): void => {
    server.close()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (options.transport === 'http') {
    await runHttp(options.port)
  } else {
    await runStdio()
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[stylewx] fatal:', error instanceof Error ? error.message : error)
  process.exit(1)
})
