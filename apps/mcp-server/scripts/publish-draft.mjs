/**
 * MCP 客户端示例：把已渲染的 HTML 发布到微信公众号「草稿箱」（publish_draft）。
 *
 * 用法：node scripts/publish-draft.mjs <html路径> [标题] [封面URL]
 *  - 缺封面 URL：自动生成一张主题色渐变封面（900×383）并本地托管，publisher 会下载后上传微信素材库。
 *  - 缺标题：从 HTML 首个 <h1>/<h2> 提取。
 *
 * 说明：仅写草稿箱（draft/add），不含任何群发。需按文档配置 WECHAT_APP_ID / WECHAT_APP_SECRET。
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import zlib from 'node:zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serverEntry = resolve(__dirname, '../dist/index.js')

const htmlPath = process.argv[2]
if (!htmlPath) {
  console.error('用法: node publish-draft.mjs <html路径> [标题] [封面URL]')
  process.exit(1)
}
const html = readFileSync(htmlPath, 'utf8')
const title = process.argv[3] || ((html.match(/<h[12][^>]*>([^<]+)<\/h[12]>/) || [])[1] || '未命名')

// ---------- 纯 JS 生成渐变封面 PNG（900×383）----------
const CRC_T = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
const crc = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = CRC_T[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }
const chunk = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length, 0); const t = Buffer.from(ty); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, d])), 0); return Buffer.concat([l, t, d, c]) }
function gradientPng(w, h, top, bottom) {
  const s = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6
  const raw = Buffer.alloc(h * (1 + w * 4))
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1)
    const r = Math.round(top[0] + (bottom[0] - top[0]) * t)
    const g = Math.round(top[1] + (bottom[1] - top[1]) * t)
    const b = Math.round(top[2] + (bottom[2] - top[2]) * t)
    const row = y * (1 + w * 4); raw[row] = 0
    for (let x = 0; x < w; x++) { const o = row + 1 + x * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255 }
  }
  return Buffer.concat([s, chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const cover = gradientPng(900, 383, [0x6B, 0x55, 0x45], [0xC9, 0xB4, 0x9E]) // 主题暖棕灰渐变

// 提供封面 URL：优先用外部传入；否则本地起一个 tiny HTTP 服务供 publisher 下载
let coverUrl = process.argv[4]
let server = null
if (!coverUrl) {
  server = createServer((req, res) => {
    if (req.url === '/cover.png') { res.writeHead(200, { 'content-type': 'image/png' }); res.end(cover) }
    else { res.writeHead(404); res.end() }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  coverUrl = `http://127.0.0.1:${server.address().port}/cover.png`
  console.log('[publish] 已生成本地封面:', coverUrl)
}

async function main() {
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverEntry, '--transport', 'stdio'], env: { ...process.env } })
  const client = new Client({ name: 'mp-style-publish', version: '1.0.0' })
  await client.connect(transport)

  const resp = await client.callTool(
    { name: 'publish_draft', arguments: { html, title, coverImage: coverUrl } },
    undefined,
    { timeout: 240000, maxTotalTimeout: 300000 },
  )
  const data = JSON.parse(resp.content[0].text)
  if (data.error) {
    console.log('[publish] 失败:', data.error.code, data.error.message, '|', data.error.hint)
    process.exit(1)
  }
  console.log('\n[发布到草稿箱] 成功')
  console.log('  标题:', title)
  console.log('  media_id:', data.media_id)
  console.log('  封面 thumb_media_id:', data.coverMediaId || data.thumb_media_id || '(未知)')
  console.log('  搬运图片数:', (data.uploadedImages || []).length)
  await client.close()
}
main()
  .catch((e) => { console.error('[publish] 失败:', e.message); process.exit(1) })
  .finally(() => { if (server) server.close() })
