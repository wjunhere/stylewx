/**
 * 把 G5 富组件版 coffee 文章发布到微信公众号草稿箱。
 * 用法：node scripts/comparison/publish-rich.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { completeThemeBlocks } from '@stylewx/theme'
import { brandApply, renderPreview, publishDraft } from '@stylewx/service'
import { WeChatClient } from '@stylewx/publisher'
import { closePreviewBrowser } from '@stylewx/preview'
import { DESIGN } from './design.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// 品牌资源（含 ink-header 头图组件）
brandApply('ink-ledger')

const theme = { ...DESIGN.brand.theme, blocks: completeThemeBlocks(DESIGN.brand.theme.blocks) }
theme.decorations = [
  { target: 'h2', position: 'before', text: '§', style: { color: '{{accentColor}}', 'font-weight': 'bold', 'margin-right': '2px' } },
]

const coffee = readFileSync(join(ROOT, 'articles/test-coffee-costing.md'), 'utf8')
const rich = `:::ink-header{issue="Vol.12 · 成本篇"}
:::

:::cover{title="一杯拿铁的 28 元" subtitle="COFFEE COSTING · 拆解一家独立店的账本" author="墨账" tone="primary" height="180"}
:::

${DESIGN.brandMarkdown(coffee)
  .replace('## 先看一道简单的算术题', '## 先看一道简单的算术题\n\n:::draw{shape="underline" tone="primary" text="毛利 1.5 元 / 杯"}\n:::')
  .replace('### 换更便宜的豆子', '### 换更便宜的豆子\n\n:::image{src="https://picsum.photos/seed/coffeebean/800/420" caption="豆子成本占每杯 18%，但降价是最危险的省钱方式" width="inset"}\n:::')
  .replace('### 砍掉低销 SKU', '### 砍掉低销 SKU\n\n:::image-card{src="https://picsum.photos/seed/pourover/400/300" title="手冲线去留" desc="每月省豆子钱 900 元，但损失 40% 的咖啡爱好者客群——他们恰恰是发朋友圈最勤的人" layout="left"}\n:::')
  .replace(/每天睁眼就背着的固定账单：\n\n:::ink-stat/, '每天睁眼就背着的固定账单（开门即计费）：\n\n:::ink-stat')
  .replace('**每天睁眼就背着 880 元**。按毛利 14 元一杯算，卖 63 杯才开始为利润干活。', '**每天睁眼就背着 880 元**。按毛利 14 元一杯算：\n\n:::progress{value="63" label="日销 200 杯时的回本进度" tone="primary" height="12"}\n:::\n\n卖到第 63 杯，才开始为利润干活。')
  .replace('## 结论', ':::pulse{text="下期预告：把 880 元日固定成本拆成四个杠杆" tone="primary"}\n:::\n\n## 结论')
}
:::end-card{title="墨账 · 用账本思维看生意" footer="扫码或点击头像关注 · 每周三更新" tone="primary"}
这篇拆解来自「墨账」成本系列。前一期的**房租谈判清单**在公众号菜单可回看。
:::`

// 渲染（发布链路会自动把外链图片搬运到微信素材库）
const preview = await renderPreview(rich, theme)
if (!preview.validation.pass) {
  console.error('校验未通过：', JSON.stringify(preview.validation.issues, null, 1))
  process.exit(1)
}

// 微信客户端（凭据从环境变量读取）
const env = {}
for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
  if (m) env[m[1]] = m[2]
}
// 校园网多出口 NAT 会漂移 IP，微信白名单追不上。
// 方案：发布期间把 Clash 切到 global + 固定节点，微信 API 流量走节点固定出口，发布后切回 rule。
const CLASH_API = process.env.CLASH_API ?? 'http://127.0.0.1:9097'
const CLASH_SECRET = process.env.CLASH_SECRET ?? 'set-your-secret'
const CLASH_PROXY = process.env.CLASH_PROXY ?? 'http://127.0.0.1:7897'
const WX_NODE = process.env.WX_CLASH_NODE ?? '🇭🇰 香港A[BGP]'
const clashHeaders = { Authorization: `Bearer ${CLASH_SECRET}`, 'Content-Type': 'application/json' }

let prevMode = 'rule'
try {
  const cfg = await fetch(`${CLASH_API}/configs`, { headers: clashHeaders }).then((r) => r.json())
  prevMode = cfg.mode ?? 'rule'
} catch {}

async function setClashMode(mode) {
  await fetch(`${CLASH_API}/configs`, { method: 'PATCH', headers: clashHeaders, body: JSON.stringify({ mode }) })
}

const { ProxyAgent, fetch: undiciFetch } = await import('undici')
const agent = new ProxyAgent(CLASH_PROXY)
const fetchImpl = (url, init) => undiciFetch(url, { ...init, dispatcher: agent })

// 切 global + 固定节点
await setClashMode('global')
await fetch(`${CLASH_API}/proxies/GLOBAL`, { method: 'PUT', headers: clashHeaders, body: JSON.stringify({ name: WX_NODE }) })
await new Promise((r) => setTimeout(r, 1500))
console.log(`[clash] global 模式 · 节点 ${WX_NODE} · 代理 ${CLASH_PROXY}`)

const client = new WeChatClient({
  appId: env.WECHAT_APP_ID,
  appSecret: env.WECHAT_APP_SECRET,
  baseUrl: env.WECHAT_API_BASE ?? 'https://api.weixin.qq.com',
  fetchImpl,
})

const result = await publishDraft(client, {
  content: preview.html,
  title: '一杯好咖啡的 costing 账本：为什么你的独立咖啡馆不赚钱',
  author: '墨账',
  digest: '28 元的拿铁，毛利只剩 1.5 元。把一家三线城市独立咖啡馆的账本拆开看：每天睁眼背着 880 元，卖到第 63 杯才开始为利润干活。',
  // coverImage 缺省取正文第一张图（picsum 咖啡豆图会先被搬运到素材库）
})
console.log('发布结果:', JSON.stringify(result, null, 1))
writeFileSync(join(ROOT, 'scripts/comparison/output/publish-result.json'), JSON.stringify(result, null, 2))

// 无论成败，恢复 Clash 模式
await setClashMode(prevMode)
console.log(`[clash] 已恢复 ${prevMode} 模式`)

await closePreviewBrowser().catch(() => undefined)
process.exit(result?.error ? 1 : 0)
