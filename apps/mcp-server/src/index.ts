/**
 * mp-style MCP Server 入口。
 * 双传输模式：--transport stdio（默认） | --transport http。
 * 依赖注入：从环境变量构造 LLM / 微信客户端；缺少时对应 tool 会返回明确错误，而非崩溃。
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createMcpServer } from './server.js'
import { loadLlmConfigFromEnv, LlmClient } from '@mp-style/service'
import { loadConfigFromEnv, WeChatClient } from '@mp-style/publisher'
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

async function runStdio(): Promise<void> {
  const server = createMcpServer(buildDeps())
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[mp-style] MCP server (stdio) started.')
}

async function runHttp(port: number): Promise<void> {
  const transports = new Map<string, StreamableHTTPServerTransport>()

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/mcp') {
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
    console.error(`[mp-style] MCP server (Streamable HTTP) listening on http://localhost:${port}/mcp`)
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
  console.error('[mp-style] fatal:', error instanceof Error ? error.message : error)
  process.exit(1)
})
