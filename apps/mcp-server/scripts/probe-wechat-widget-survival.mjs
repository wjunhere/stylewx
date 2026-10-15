#!/usr/bin/env node
/**
 * 存活验证：把各平台组件的落地标签直接 insertHTML → 保存草稿 → draft/get 读回。
 *
 * 判据（从音乐推广而来）：保存后**仍存在**才说明插件不带服务端状态，能纳入自动化。
 * 与 docs/DESIGN.md §26 的音乐验证同一套方法。
 *
 * ⚠️ 会创建一条标题含「[探针]平台组件存活验证」的草稿，读回后自动删除。
 * 用法：node apps/mcp-server/scripts/probe-wechat-widget-survival.mjs
 */
import { readEnvFile } from '../../../assets-src/paths.mjs'
const DAEMON = 'http://127.0.0.1:10086/command'
const S = 'wx-widgetsurv'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (t, m) => console.log(`[${t}] ${m}`)
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

// 待验证：各平台组件的落地标签（原样，含真实快照里拿到的属性）
const CANDIDATES = [
  {
    name: 'mp-common-search（推荐搜索）',
    html: `<section class="mp_search_iframe_wrp custom_select_card_wrp" nodeleaf=""><mp-common-search class="js_mpsearch appmsg_search_iframe js_uneditable custom_select_card mp_common_widget" data-pluginname="insertsearch" data-nickname="Hippie&amp;nbsp;青年" data-headimg="https://wx.qlogo.cn/mmopen/KydxAIB52xmoQBQSueToo250Blp9q9htMicreTbicuJfLQTSZic200ym3xlJm2r4SECa4TibTMUXyNBsZkExkmncDQnIyvDJLMLxDZsjJTvicSSNXYWC107DMqFOLDhxYIzLM/64" data-keywords="%5B%7B%22label%22%3A%22HIPPIE%20%E9%9D%92%E5%B9%B4%22%7D%5D" contenteditable="false"></mp-common-search></section>`,
    marker: 'mp-common-search',
    sourceMarker: 'data-nickname',
  },
  {
    name: 'mp-common-clmusic（音乐，对照组）',
    html: `<section><mp-common-clmusic class="res_iframe clmusic_iframe js_uneditable custom_select_card mp_common_widget" data-pluginname="insertaudio" username="v2_060000231003b20faec8c7e3801fc5d6cd06ee3db077a88162d5015d767f26e3f233a3926794@finder" type="1" music_name="焦虑抑制剂" albumurl="http://wx.y.gtimg.cn/music/photo_new/T002R500x500M000001QOKKW2qnaFA_1.jpg" singer="惘闻" count="0" is_vip="0" duration="530000" music_source="1" listenid="78221540362775072"></mp-common-clmusic></section>`,
    marker: 'mp-common-clmusic',
    sourceMarker: 'music_name',
  },
]

await wb('navigate', { url: 'https://mp.weixin.qq.com/', newTab: true, group_title: 'widgetsurv' })
await sleep(4000)
const h = await ev(`(()=>{const m=location.href.match(/token=(\\d+)/);return JSON.stringify({t:m?m[1]:null})})()`)
if (!h?.t) { console.error('✖ 未登录'); process.exit(1) }
await wb('navigate', { url: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&createType=0&token=${h.t}&lang=zh_CN` })
await sleep(9000)
await ev(`(()=>{document.querySelectorAll('a,button,div').forEach(b=>{if(/^(我知道了|知道了)$/.test((b.innerText||'').trim()))b.click()});return JSON.stringify({k:1})})()`)
for (let i = 0; i < 10; i++) {
  const ok = await ev(`(()=>JSON.stringify({e:!!document.querySelector('.rich_media_content .ProseMirror')}))()`)
  if (ok?.e) break
  await sleep(2000)
}

// 全部候选一次注入（各自带一行说明，便于读回时区分）
const body = CANDIDATES.map((c) => `<section><span leaf="">【探针】${c.name}</span></section>${c.html}`).join('')
const inj = await ev(`(()=>{
  const titleEl=document.querySelector('#title');
  if(titleEl){titleEl.value='【探针】平台组件存活验证';titleEl.dispatchEvent(new Event('input',{bubbles:true}));}
  const b=document.querySelector('.rich_media_content .ProseMirror');b.focus();
  const s=window.getSelection();s.removeAllRanges();const r=document.createRange();r.selectNodeContents(b);s.addRange(r);
  document.execCommand('delete');
  document.execCommand('insertHTML',false,${JSON.stringify(body)});
  return JSON.stringify({custom:b.querySelectorAll('[class*=mp_common_widget], mp-common-search, mp-common-clmusic').length})})()`)
log('inject', JSON.stringify(inj))
await sleep(20000)
const dom = await ev(`(()=>{const ed=document.querySelector('.rich_media_content .ProseMirror');
  return JSON.stringify({search:ed.querySelectorAll('mp-common-search').length,music:ed.querySelectorAll('mp-common-clmusic').length})})()`)
log('dom', JSON.stringify(dom))

// 保存
const saved = await ev(`(()=>{
  const b=[...document.querySelectorAll('button,a,div,span')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(e.innerText||'').trim()==='保存为草稿'});
  if(!b.length)return JSON.stringify({err:'no save btn'});
  b[0].click();return JSON.stringify({ok:1})})()`)
if (!saved?.ok) { console.error('✖', saved.err); process.exit(1) }
log('save', '已点保存')
await sleep(9000)

const tok = (await (await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.WECHAT_APP_ID}&secret=${env.WECHAT_APP_SECRET}`)).json()).access_token
const list = await (await fetch(`https://api.weixin.qq.com/cgi-bin/draft/batchget?access_token=${tok}`, { method: 'POST', body: JSON.stringify({ offset: 0, count: 5, no_content: 0 }) })).json()
const hit = (list.item ?? []).find((i) => i.content.news_item[0].title.includes('平台组件存活验证'))
if (!hit) { console.error('✖ 没找到探针草稿'); process.exit(1) }
const c = hit.content.news_item[0].content

console.log('\n' + '='.repeat(72))
console.log('读回结果（判据：保存后仍存在 = 可自动化）\n')
for (const cand of CANDIDATES) {
  const n = (c.match(new RegExp(cand.marker, 'g')) || []).length
  const hasSrc = c.includes(cand.sourceMarker)
  const alive = n >= 2 && hasSrc
  console.log(`${alive ? '✅' : '❌'}  ${cand.name}`)
  console.log(`    出现 ${n} 次（开+闭 = 1 个元素）| 关键属性 ${cand.sourceMarker} ${hasSrc ? '在' : '已丢'}`)
}
console.log('\n落地片段：')
console.log((c.match(/<mp-common-search[\s\S]*?<\/mp-common-search>/) || ['（无）'])[0].slice(0, 700))
console.log('\n完整 content：')
console.log(c)

await fetch(`https://api.weixin.qq.com/cgi-bin/draft/delete?access_token=${tok}`, { method: 'POST', body: JSON.stringify({ media_id: hit.media_id }) })
log('cleanup', '探针草稿已删除')
process.exit(0)
