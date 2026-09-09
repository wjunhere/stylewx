/**
 * 微信草稿 API 能力探针：实测「哪些 HTML/CSS/交互特性在 draft/add → draft/get 之后被保留」。
 *
 * 用途：为 stylewx 的组件库设计提供证据，而不是依赖社区传闻。
 * 运行：node --env-file=.env apps/mcp-server/scripts/probe-wechat-capabilities.mjs
 *
 * 注意：会真实写入一条测试草稿到公众号草稿箱（标题带 [probe] 前缀，可手动删除）。
 */
import { loadConfigFromEnv, WeChatClient, publishDraft } from '@stylewx/publisher'

const SVG_SAMPLE = `
<section style="margin:0 0 24px">
  <h3 style="font-size:16px;margin:0 0 10px">A. SVG + SMIL</h3>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120" style="width:100%;display:block">
    <rect width="320" height="120" rx="14" fill="#eef6ff"/>
    <circle cx="64" cy="60" r="24" fill="#409eff">
      <animate attributeName="r" values="24;34;24" dur="2s" repeatCount="indefinite"/>
    </circle>
    <text x="180" y="66" text-anchor="middle" font-size="16" fill="#337ecc">SVG + SMIL 动画</text>
  </svg>
</section>`

const CSS_SAMPLE = `
<section style="margin:0 0 24px">
  <h3 style="font-size:16px;margin:0 0 10px">B. 灰档 CSS</h3>
  <div style="display:flex;gap:10px;align-items:center">
    <div style="flex:1;background-image:linear-gradient(135deg,#eef6ff,#d9e8ff);border-radius:12px;padding:14px;box-shadow:0 6px 18px rgba(64,158,255,.18);transform:translateY(0);transition:transform .3s">
      <p style="margin:0;font-size:14px;color:#337ecc">flex + gap + 渐变背景 + box-shadow + transform + transition</p>
    </div>
  </div>
</section>`

const SVG_INTERACTIVE = `
<section style="margin:0 0 24px">
  <h3 style="font-size:16px;margin:0 0 10px">C. SVG 点击交互</h3>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 160" style="width:100%;display:block">
    <rect width="320" height="160" rx="14" fill="#f7f9fc"/>
    <rect x="20" y="20" width="280" height="44" rx="10" fill="#409eff">
      <animate attributeName="opacity" from="1" to="0.25" begin="click" dur="0.6s" fill="freeze"/>
    </rect>
    <text x="160" y="48" text-anchor="middle" font-size="15" fill="#ffffff">点我（点击后变淡）</text>
    <rect x="20" y="84" width="280" height="44" rx="10" fill="#67c23a">
      <animate attributeName="width" from="280" to="120" begin="click" dur="0.8s" fill="freeze"/>
    </rect>
    <text x="160" y="112" text-anchor="middle" font-size="15" fill="#ffffff">点我（点击后缩短）</text>
  </svg>
</section>`

const BASE_SAMPLE = `
<section style="margin:0 0 24px">
  <h3 style="font-size:16px;margin:0 0 10px">D. 基础结构</h3>
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="border:1px solid #ddd;padding:8px">table</td><td style="border:1px solid #ddd;padding:8px">可用性</td></tr>
  </table>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:14px 0"/>
  <blockquote style="margin:0;border-left:4px solid #409eff;padding:8px 14px;background:#f7f9fc">blockquote</blockquote>
</section>`

const CONTENT = `<section style="padding:16px;font-size:15px;line-height:1.75;color:#333">${SVG_SAMPLE}${CSS_SAMPLE}${SVG_INTERACTIVE}${BASE_SAMPLE}</section>`

const FEATURES = [
  ['svg 标签', '<svg'],
  ['animate 标签', '<animate'],
  ['circle 标签', '<circle'],
  ['rect 标签', '<rect'],
  ['text 标签', '<text'],
  ['viewBox 属性', 'viewBox'],
  ['repeatCount 属性', 'repeatCount'],
  ['begin="click" 属性', 'begin="click"'],
  ['display:flex', 'display:flex'],
  ['gap', 'gap:'],
  ['linear-gradient', 'linear-gradient'],
  ['box-shadow', 'box-shadow'],
  ['transform', 'transform'],
  ['transition', 'transition'],
  ['background-image', 'background-image'],
  ['table 标签', '<table'],
  ['blockquote 标签', '<blockquote'],
]

async function fetchDraft(token, baseUrl, mediaId) {
  const res = await fetch(`${baseUrl}/cgi-bin/draft/get?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ media_id: mediaId }),
  })
  return res.json()
}

async function main() {
  const config = loadConfigFromEnv()
  const client = new WeChatClient(config)
  console.log('[probe] 目标公众号 appId =', config.appId)

  const result = await publishDraft(client, {
    title: `[probe] 微信 HTML/CSS 能力实测 ${new Date().toISOString().slice(0, 16)}`,
    content: CONTENT,
    relocate: false,
  })
  console.log('[probe] 草稿已写入，media_id =', result.media_id)

  const token = await client.getAccessToken()
  const draft = await fetchDraft(token, config.apiBase ?? 'https://api.weixin.qq.com', result.media_id)
  if (draft.errcode) {
    console.error('[probe] draft/get 失败：', draft.errcode, draft.errmsg)
    process.exitCode = 1
    return
  }
  const stored = draft.news_item?.[0]?.content ?? ''
  console.log(`[probe] 取回正文长度 = ${stored.length}（发送前 ${CONTENT.length}）\n`)
  console.log('[probe] 特性存活情况：')
  let survived = 0
  for (const [label, needle] of FEATURES) {
    const ok = stored.includes(needle)
    if (ok) survived += 1
    console.log(`  ${ok ? '✅ 保留' : '❌ 被过滤'}  ${label}`)
  }
  console.log(`\n[probe] ${survived}/${FEATURES.length} 项保留`)
  console.log('[probe] 取回的 SVG 片段（截取）：')
  const i = stored.indexOf('<svg')
  console.log(i === -1 ? '  （未找到 <svg>）' : '  ' + stored.slice(i, i + 700))
}

main().catch((error) => {
  console.error('[probe] 失败：', error)
  process.exitCode = 1
})
