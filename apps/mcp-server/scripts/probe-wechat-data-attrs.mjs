import { loadConfigFromEnv, WeChatClient, publishDraft } from '@stylewx/publisher'

const C = `<section>
  <div data-swx="card" data-swx-props="title=%E6%A0%87%E9%A2%98&amp;tone=primary" data-plain="keepme" style="background:#eef6ff;padding:12px">data-* 测试</div>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20" style="width:100%"><rect data-swx="bar" width="100" height="20" fill="#409eff"/></svg>
  <span aria-label="a11y" role="note" style="color:#333">其他属性</span>
</section>`

const config = loadConfigFromEnv()
const client = new WeChatClient(config)
const { media_id } = await publishDraft(client, {
  title: `[probe-data] ${Date.now()}`,
  content: C,
  relocate: false,
})
const token = await client.getAccessToken()
const res = await fetch(`${config.apiBase ?? 'https://api.weixin.qq.com'}/cgi-bin/draft/get?access_token=${token}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ media_id }),
})
const d = await res.json()
const stored = d.news_item?.[0]?.content ?? ''
console.log('=== 取回 ===')
console.log(stored)
console.log('\n=== 存活 ===')
for (const [k, v] of [
  ['data-swx', 'data-swx'],
  ['data-swx-props', 'data-swx-props'],
  ['data-plain', 'data-plain'],
  ['svg 上的 data-swx', 'data-swx="bar"'],
  ['aria-label', 'aria-label'],
  ['role', 'role'],
]) {
  console.log(`  ${stored.includes(v) ? '✅' : '❌'} ${k}`)
}
