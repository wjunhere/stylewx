/**
 * 把评审过的 HTML 原样写进公众号草稿箱。
 *
 * 为什么不用 MCP 的 publish_draft：它按「markdown + theme」渲染，
 * 而墨账的主题对象要通过 2.5KB 的 JSON 参数传进去，很容易在这一步跑偏。
 * 这里直接发已经截图评审过的那份 HTML（工作区 out/review/article.html），
 * 「评审的就是发布的」，少一次渲染就少一次偏差。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WeChatClient, publishDraft } from '../packages/publisher/dist/index.js'
import { resolveLocalImage } from '../packages/service/dist/index.js'
import { brandsDir, outDir } from './paths.mjs'

const cfg = JSON.parse(readFileSync(process.env.USERPROFILE + '/.pi/agent/mcp.json', 'utf8')).mcpServers.stylewx.env

// 字段名是 baseUrl（不是 apiBase）—— 传错不会报错，只会拼出 `undefined/cgi-bin/...`
const client = new WeChatClient({
  appId: cfg.WECHAT_APP_ID,
  appSecret: cfg.WECHAT_APP_SECRET,
  baseUrl: cfg.WECHAT_API_BASE || 'https://api.weixin.qq.com',
})

const content = readFileSync(join(outDir('review'), 'article.html'), 'utf8')

// 封面从品牌档案读。品牌包把 coverImage 改成**包内相对路径**（assets/cover.png），
// 所以必须带 resolveLocal 把相对路径读成字节 —— 否则会被当成 URL 去 HTTP 请求。
const BRAND = 'hippie-youth'
const brand = JSON.parse(readFileSync(join(brandsDir(), BRAND, 'profile.json'), 'utf8'))
const coverUrl = brand.coverImage
if (!coverUrl) throw new Error('品牌档案里没有 coverImage，先跑 `stylewx brand attach`')

// 标题/作者/摘要由调用方给：仓库里不留具体文章内容（§34）
const [title, author, digest] = process.argv.slice(2)
if (!title || !author || !digest) {
  console.error('用法：node assets-src/publish.mjs <标题> <作者> <摘要>')
  process.exit(2)
}

const result = await publishDraft(client, {
  content,
  title,
  author,
  coverImage: coverUrl,
  digest,
  relocate: true,
  resolveLocal: (src) => resolveLocalImage(src, { brand: BRAND }),
})

console.log(JSON.stringify(result, null, 1))
process.exit(0)
