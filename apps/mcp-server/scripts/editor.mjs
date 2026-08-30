/**
 * 一键启动「本地 Web 编辑器」：自动加载 .env，然后以 HTTP 模式启动 MCP Server，
 * 在浏览器打开 http://localhost:<port>/editor（同时提供 /mcp）。
 *
 * 用法：
 *   node editor.mjs                     # 默认读取仓库根 .env，端口 3777
 *   node editor.mjs [.env路径] [端口]
 *
 * 说明：编辑器只在 --transport http 模式提供；pi 里配的 stylewx 走 stdio（无编辑器），
 * 所以要用本地编辑器请单独跑这个脚本（可与 pi 的 stdio MCP 共存）。
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = process.argv[2] ? resolve(process.argv[2]) : resolve(__dirname, '../../../.env')
const port = process.argv[3] ? Number(process.argv[3]) : 3777

// 读取 .env 并注入 process.env（不覆盖已存在的环境变量）
try {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch (e) {
  console.error('[editor] 读取 .env 失败：' + (e && e.message) + '（用 ' + envPath + '）')
  console.error('[editor] 将按无凭据模式启动（AI 生成主题 / 发布草稿箱会不可用，其余可正常使用）。')
}

// 以 HTTP 模式启动 server
process.argv = ['node', basename(import.meta.url), '--transport', 'http', '--port', String(port)]
await import(pathToFileURL(resolve(__dirname, '../dist/index.js')).href)

console.log('\n[editor] 打开编辑器：http://localhost:' + port + '/editor')
console.log('[editor] MCP(HTTP)：http://localhost:' + port + '/mcp   （Ctrl+C 停止）')
