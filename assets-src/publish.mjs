/**
 * 把评审过的 HTML 原样写进公众号草稿箱。
 *
 * 为什么不用 MCP 的 publish_draft：它按「markdown + theme」渲染，
 * 而墨账的主题对象要通过 2.5KB 的 JSON 参数传进去，很容易在这一步跑偏。
 * 这里直接发已经截图评审过的那份 HTML（assets-src/review/article.html），
 * 「评审的就是发布的」，少一次渲染就少一次偏差。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WeChatClient, publishDraft } from '../packages/publisher/dist/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const cfg = JSON.parse(readFileSync(process.env.USERPROFILE + '/.pi/agent/mcp.json', 'utf8')).mcpServers.stylewx.env

// 字段名是 baseUrl（不是 apiBase）—— 传错不会报错，只会拼出 `undefined/cgi-bin/...`
const client = new WeChatClient({
  appId: cfg.WECHAT_APP_ID,
  appSecret: cfg.WECHAT_APP_SECRET,
  baseUrl: cfg.WECHAT_API_BASE || 'https://api.weixin.qq.com',
})

const content = readFileSync(join(HERE, 'review', 'article.html'), 'utf8')

// 封面直链从品牌档案读，不依赖临时 .url 文件（那玩意儿老被清掉，害我重跑两次）
const brand = JSON.parse(readFileSync(join(process.env.USERPROFILE, '.stylewx/brands/hippie-youth/profile.json'), 'utf8'))
const coverUrl = brand.coverImage
if (!coverUrl) throw new Error('品牌档案里没有 coverImage，先跑 rasterize.mjs + 上传素材库')

const result = await publishDraft(client, {
  content,
  title: '关于部分高校寄成绩单的思考——知情权之外，问题还在原地',
  author: '独夫之心',
  coverImage: coverUrl,
  digest: '成绩单寄到家里，焦虑传到了父母手上，可问题并没有解决。',
  relocate: true,
})

console.log(JSON.stringify(result, null, 1))
process.exit(0)
