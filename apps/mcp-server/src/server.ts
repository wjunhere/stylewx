import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerMcpTools } from './tools.js'
import type { ToolDeps } from './tools.js'

export const SERVER_NAME = 'mp-style'
export const SERVER_VERSION = '0.1.0'

/** 创建已注册全部 6 个 tools 的 MCP Server。 */
export function createMcpServer(deps: ToolDeps = {}): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  })
  registerMcpTools(server, deps)
  return server
}
