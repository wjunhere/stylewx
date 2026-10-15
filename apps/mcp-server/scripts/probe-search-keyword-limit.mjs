#!/usr/bin/env node
/** 矩阵测试：确认「每个搜索关键词最多16个字符」到底怎么算。
 *  对同一篇文章依次换关键词组合，每次只改关键词，看保存是否成功。
 *  ⚠️ 会创建多条草稿；每条读回后自动删除。
 */
import { readEnvFile } from '../../../assets-src/paths.mjs'

const DAEMON = 'http://127.0.0.1:10086/command'
const S = 'wx-kwmatrix'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (t, m) => console.log(`[${t}]`, typeof m === 'string' ? m : JSON.stringify(m))
async function wb(a, args = {}) {
  const r = await fetch(DAEMON, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: a, args, session: S }) })
  const j = await r.json()
  if (!j.ok) throw new Error(j.error?.message)
  return j.data
}
async function ev(c) {
  const r = await wb('evaluate', { code: c })
  const v = r?.value
  if (typeof v !== 'string') return v
  try { return JSON.parse(v) } catch { return v }
}

const env = readEnvFile()
const apiTok = async () => (await (await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.WECHAT_APP_ID}&secret=${env.WECHAT_APP_SECRET}`)).json()).access_token
const tok = await apiTok()
const acct = await (await fetch(`https://api.weixin.qq.com/cgi-bin/account/getaccountbasicinfo?access_token=${tok}`)).json()

// 测试矩阵：逐个变量定位限制
const CASES = [
  // 排除法结论方向：不是「字符数」也不是「UTF-8 字节数」，而像 **全角按 2 计**（16 单位）。
  // 决定性验证：7 字（14 单位）过 / 8 字（16）过 / 9 字（18）拦。
  { name: 'Q1 七字（14 单位，预期过）', kws: ['我的所有还有意'] },
  { name: 'Q2 八字（16 单位，预期过）', kws: ['我的所有还有意义'] },
  { name: 'Q3 九字（18 单位，预期拦）', kws: ['我的所有还有意义吗'] },
  { name: 'Q4 四字+四字（各 8 单位）', kws: ['我的所有', '还有意义'] },
  { name: 'Q5 八字英文+八字英文（各 8 单位）', kws: ['abcdefgh', 'ijklmnop'] },
  { name: 'Q6 中文 8 + 英文 8 混排', kws: ['我的所有还有意义', 'abcdefgh'] },
]

await wb('navigate', { url: 'https://mp.weixin.qq.com/', newTab: true, group_title: 'kwmatrix' })
await sleep(4000)
const h = await ev(`(()=>{const m=location.href.match(/token=(\\d+)/);return JSON.stringify({t:m?m[1]:null})})()`)
const EDITOR = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&createType=0&token=${h.t}&lang=zh_CN`

for (const cs of CASES) {
  console.log('\n' + '='.repeat(70))
  log('case', `${cs.name} | 词长 ${cs.kws.map((k) => k.length).join(',')}`)
  await wb('navigate', { url: EDITOR })
  await sleep(8000)
  await ev(`(()=>{document.querySelectorAll('a,button,div').forEach(b=>{if(/^(我知道了|知道了)$/.test((b.innerText||'').trim()))b.click()});return JSON.stringify({k:1})})()`)
  let ready = null
  for (let i = 0; i < 20; i++) { ready = await ev(`(()=>JSON.stringify({e:!!document.querySelector('.rich_media_content .ProseMirror'),t:document.querySelectorAll('li.tpl_item').length}))()`); if (ready?.e && ready?.t > 5) break; await sleep(2000) }
  if (!ready?.e) { log('case', '编辑器未就绪，跳过'); continue }
  await sleep(2500)

  const tag = `<section class="mp_search_iframe_wrp custom_select_card_wrp" nodeleaf="">`
    + `<mp-common-search class="js_mpsearch appmsg_search_iframe js_uneditable custom_select_card mp_common_widget"`
    + ` data-pluginname="insertsearch"`
    + ` data-nickname="${acct.nickname}"`
    + ` data-headimg="${acct.head_image_info.head_image_url}"`
    + ` data-keywords="${encodeURIComponent(JSON.stringify(cs.kws.map((label) => ({ label }))))}"`
    + ` contenteditable="false"></mp-common-search></section>`

  await ev(`(()=>{
    const b=document.querySelector('.rich_media_content .ProseMirror');b.focus();
    const t=document.querySelector('#title');if(t){t.value='【矩阵】${cs.name.replace(/'/g, '')}'.slice(0,40);t.dispatchEvent(new Event('input',{bubbles:true}))}
    const s=window.getSelection();s.removeAllRanges();const r=document.createRange();r.selectNodeContents(b);s.addRange(r);
    document.execCommand('delete');
    document.execCommand('insertHTML',false,'<section><span leaf="">矩阵测试正文。</span></section>'+${JSON.stringify(tag)});
    return JSON.stringify({k:1})})()`)
  await sleep(12000)

  await ev(`(()=>{const a=[...document.querySelectorAll('button,a,div,span')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(e.innerText||'').trim()==='保存为草稿'});a[0]?.click();return JSON.stringify({k:1})})()`)
  await sleep(6000)

  const res = await ev(`(()=>{
    const m=location.href.match(/appmsgid=(\\d+)/);
    return JSON.stringify({
      appmsgid: m?m[1]:null,
      err: [...document.querySelectorAll('[class*=error],[class*=Error]')].filter(e=>e.getBoundingClientRect().height>0).map(e=>(e.innerText||'').trim()).filter(Boolean).slice(0,3),
    })})()`)
  log('result', res)
}

// 清理本脚本产生的探针草稿
const list = await (await fetch(`https://api.weixin.qq.com/cgi-bin/draft/batchget?access_token=${tok}`, { method: 'POST', body: JSON.stringify({ offset: 0, count: 10, no_content: 1 }) })).json()
for (const it of (list.item ?? [])) {
  const t = it.content.news_item[0].title
  if (t.includes('【矩阵】') || t.includes('【诊断】')) {
    await fetch(`https://api.weixin.qq.com/cgi-bin/draft/delete?access_token=${tok}`, { method: 'POST', body: JSON.stringify({ media_id: it.media_id }) })
    log('cleanup', `已删草稿：${t}`)
  }
}
console.log('\n（矩阵测试结束）')
process.exit(0)
