import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerMcpTools } from './tools.js'
import type { ToolDeps } from './tools.js'

export const SERVER_NAME = 'stylewx'

/**
 * 版本号只在 package.json 维护一处。
 *
 * 这里曾经写成常量 '0.1.0'，结果连发三个版本都没人发现：
 * MCP 客户端的 initialize 握手会把 serverInfo.version 显示给用户，
 * 而它一直停在 0.1.0，和 npm 上的包版本对不上。
 * 现在从包元数据读，并有 server.test.ts 守着两者一致。
 *
 * 两种运行形态下 '../package.json' 都解析到 apps/mcp-server/package.json：
 *   源码（vitest）  src/server.ts   → ../package.json
 *   构建产物        dist/server.js  → ../package.json
 */
function readPackageVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  // 源码目录多一层（src/），产物目录是 dist/，两者都在包根下一层，先探一层即可；
  // 万一将来产物结构变了，向上再探两层做兜底，避免直接抛错。
  for (let i = 0; i < 3; i++) {
    try {
      const pkg = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')) as {
        name?: string
        version?: string
      }
      if (pkg.name === '@stylewx/mcp-server' && pkg.version) return pkg.version
    } catch {
      // 继续向上找
    }
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return 'dev'
}

export const SERVER_VERSION = readPackageVersion()

/** 创建已注册全部 MCP tools 的 MCP Server（当前 22 个，见 README「MCP 工具」）。 */
export function createMcpServer(deps: ToolDeps = {}): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  })
  registerMcpTools(server, deps)
  return server
}
