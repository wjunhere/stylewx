#!/usr/bin/env node
/**
 * 「推荐搜索」组件探针（`<mp-common-search>`）。
 *
 * 它是平台组件里**唯二**「数据自包含」的（另一个是音乐，见 docs/DESIGN.md §26/§27）：
 * 落地标签的属性里带全了数据，不需要服务端对象引用。
 *
 * 两个阶段：
 *   --stage native   走编辑器原生流程（点占位文本 → 输入 → 确定），dump 落地标签。
 *                    用来确认「平台到底往属性里写什么」。
 *   --stage synth    **决定性验证**：用 API 权威数据（getaccountbasicinfo 的 nickname /
 *                    head_image_url）离线合成标签 → insertHTML → 保存 → draft/get 读回。
 *                    这是 `:::search` 能自动化的前提。
 *
 * ⚠️ synth 会写一条 [探针] 草稿，读回后自动删除。native 只探查不保存。
 * 用法：
 *   node apps/mcp-server/scripts/probe-wechat-search-widget.mjs --stage native
 *   node apps/mcp-server/scripts/probe-wechat-search-widget.mjs --stage synth
 */
import { readEnvFile } from '../../../assets-src/paths.mjs'
const DAEMON = process.env.WEBBRIDGE_URL ?? 'http://127.0.0.1:10086/command'
const S = 'wx-searchprobe'

const argv = process.argv.slice(2)
const si = argv.indexOf('--stage')
const STAGE = si >= 0 ? argv[si + 1] : 'native'
if (!['native', 'synth'].includes(STAGE)) {
  console.error(`✖  未知阶段「${STAGE}」。可选：native / synth`)
  process.exit(1)
}

// 关键词：与文章实际内容相关（推荐搜索的价值就在于把读者引到号内其他文章）
const KEYWORDS = ['焦虑抑制剂', '好好吃饭']

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (t, m) => console.log(`[${t}]`, typeof m === 'string' ? m : JSON.stringify(m, null, 1))
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
const apiToken = async () =>
  (await (await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.WECHAT_APP_ID}&secret=${env.WECHAT_APP_SECRET}`)).json()).access_token

/** 打开编辑器，返回 { token, ready }。 */
async function openEditor() {
  await wb('navigate', { url: 'https://mp.weixin.qq.com/', newTab: true, group_title: 'searchprobe' })
  await sleep(4000)
  const h = await ev(`(()=>{const m=location.href.match(/token=(\\d+)/);return JSON.stringify({t:m?m[1]:null})})()`)
  if (!h?.t) throw new Error('未登录公众号后台')
  await wb('navigate', { url: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&createType=0&token=${h.t}&lang=zh_CN` })
  await sleep(9000)
  await ev(`(()=>{document.querySelectorAll('a,button,div').forEach(b=>{if(/^(我知道了|知道了)$/.test((b.innerText||'').trim()))b.click()});return JSON.stringify({k:1})})()`)
  // 有竞态：正文编辑器与工具栏都要就绪，再等一拍防止注入瞬间被重建
  let ready = null
  for (let i = 0; i < 20; i++) {
    ready = await ev(`(()=>JSON.stringify({e:!!document.querySelector('.rich_media_content .ProseMirror'),t:document.querySelectorAll('li.tpl_item').length}))()`)
    if (ready?.e && ready?.t > 5) break
    await sleep(2000)
  }
  log('ready', ready)
  if (!ready?.e) throw new Error('正文编辑器未就绪')
  await sleep(3000)
  return { token: h.t }
}

/** 把光标放到正文末尾并写入锚点。 */
async function seedBody(extra = '') {
  await ev(`(()=>{
    const b=document.querySelector('.rich_media_content .ProseMirror');b.focus();
    const s=window.getSelection();s.removeAllRanges();const r=document.createRange();r.selectNodeContents(b);s.addRange(r);
    document.execCommand('delete');
    document.execCommand('insertHTML',false,'<section><span leaf="">【探针】锚点。</span></section>'+${JSON.stringify(extra)});
    return JSON.stringify({k:1})})()`)
  await sleep(1500)
}

const acct = async () => JSON.parse(await (await fetch(`https://api.weixin.qq.com/cgi-bin/account/getaccountbasicinfo?access_token=${await apiToken()}`)).text())

if (STAGE === 'native') {
  // ── 原生流程：点占位文本 → 输入 → 确定 → dump 落地标签 ──
  await openEditor()
  await seedBody()
  await ev(`(()=>{document.getElementById('js_editor_insertsearch').click();return JSON.stringify({k:1})})()`)
  await sleep(5000)

  for (let i = 0; i < KEYWORDS.length; i++) {
    const step = await ev(`(()=>{
      const d=[...document.querySelectorAll('.weui-desktop-dialog')].filter(x=>x.getBoundingClientRect().width>200).pop();
      if(!d)return JSON.stringify({err:'no dialog'});
      let input=[...d.querySelectorAll('input')].filter(x=>x.type!=='hidden'&&x.getBoundingClientRect().width>0)[0];
      if(!input){
        // 「输入搜索词N」是 <strong> 占位文本，要先点进编辑态才会出现 input
        const ph=[...d.querySelectorAll('.appmsg_search_keywords_default')].filter(e=>e.getBoundingClientRect().width>0)[0];
        if(!ph)return JSON.stringify({err:'no placeholder'});
        ph.click();return JSON.stringify({clickedPlaceholder:true});
      }
      const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      set.call(input, ${JSON.stringify(KEYWORDS[i])});
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
      input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true}));
      input.blur();
      return JSON.stringify({filled:input.value});
    })()`)
    log('kw' + i, JSON.stringify(step))
    await sleep(2000)
    if (step?.clickedPlaceholder) { i -= 1; continue }
  }

  const conf = await ev(`(()=>{
    const d=[...document.querySelectorAll('.weui-desktop-dialog')].filter(x=>x.getBoundingClientRect().width>200).pop();
    if(!d)return JSON.stringify({err:'no dialog'});
    const ok=[...d.querySelectorAll('button')].find(b=>(b.innerText||'').trim()==='确定');
    if(!ok)return JSON.stringify({err:'no 确定'});
    if(ok.disabled===true||ok.className.indexOf('disabled')>=0)return JSON.stringify({err:'确定 disabled'});
    ok.click();return JSON.stringify({ok:true})})()`)
  log('confirm', JSON.stringify(conf))
  await sleep(4500)
  const landed = await ev(`(()=>{const ed=document.querySelector('.rich_media_content .ProseMirror');
    const el=ed.querySelector('mp-common-search');
    return JSON.stringify({
      count:ed.querySelectorAll('mp-common-search').length,
      attrs: el ? [...el.attributes].map(a=>a.name+'='+String(a.value).slice(0,110)) : null,
      outerHtml: el ? el.outerHTML.slice(0,900) : null,
    })})()`)
  log('landed', landed)
  console.log('\n（native 阶段结束，未保存）')
}

if (STAGE === 'synth') {
  // ── 决定性验证：用 API 权威数据离线合成 → 保存 → 读回 ──
  const info = await acct()
  log('api', { nickname: info.nickname, headimg: info.head_image_info?.head_image_url })
  if (!info.nickname || !info.head_image_info?.head_image_url) {
    console.error('✖  getaccountbasicinfo 未返回昵称/头像，无法合成')
    process.exit(1)
  }

  // 关键词 encodeURIComponent 后写进 data-keywords（与平台原生写法一致）
  const kwJson = JSON.stringify(KEYWORDS.map((label) => ({ label })))
  const tag =
    `<section class="mp_search_iframe_wrp custom_select_card_wrp" nodeleaf="">` +
    `<mp-common-search class="js_mpsearch appmsg_search_iframe js_uneditable custom_select_card mp_common_widget" ` +
    `data-pluginname="insertsearch" ` +
    `data-nickname="${info.nickname}" ` +
    `data-headimg="${info.head_image_info.head_image_url}" ` +
    `data-keywords="${encodeURIComponent(kwJson)}" ` +
    `contenteditable="false"></mp-common-search></section>`
  log('synthesized', tag)

  await openEditor()
  await ev(`(()=>{const t=document.querySelector('#title');if(t){t.value='【探针】搜索标签合成验证';t.dispatchEvent(new Event('input',{bubbles:true}))}return JSON.stringify({k:1})})()`)
  await seedBody(tag)

  const inj = await ev(`(()=>{const b=document.querySelector('.rich_media_content .ProseMirror');
    return JSON.stringify({count:b.querySelectorAll('mp-common-search').length})})()`)
  log('inject', inj)
  await sleep(18000)

  const dom = await ev(`(()=>{const ed=document.querySelector('.rich_media_content .ProseMirror');
    const el=ed.querySelector('mp-common-search');
    return JSON.stringify({
      count:ed.querySelectorAll('mp-common-search').length,
      attrs: el ? [...el.attributes].map(a=>a.name+'='+String(a.value).slice(0,90)) : null,
      box: el ? (({width,height})=>({width:Math.round(width),height:Math.round(height)}))(el.getBoundingClientRect()) : null,
    })})()`)
  log('dom', dom)

  const saved = await ev(`(()=>{
    const b=[...document.querySelectorAll('button,a,div,span')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(e.innerText||'').trim()==='保存为草稿'});
    if(!b.length)return JSON.stringify({err:'no save btn'});
    b[0].click();return JSON.stringify({ok:1})})()`)
  if (!saved?.ok) { console.error('✖', saved?.err); process.exit(1) }
  log('save', '已点保存')
  await sleep(9000)

  const tok = await apiToken()
  const list = await (await fetch(`https://api.weixin.qq.com/cgi-bin/draft/batchget?access_token=${tok}`, { method: 'POST', body: JSON.stringify({ offset: 0, count: 5, no_content: 0 }) })).json()
  const hit = (list.item ?? []).find((i) => i.content.news_item[0].title.includes('搜索标签合成验证'))
  if (!hit) { console.error('✖  没找到探针草稿'); process.exit(1) }
  const c = hit.content.news_item[0].content
  const n = (c.match(/mp-common-search/g) || []).length
  const back = (c.match(/data-nickname="([^"]*)"/) || [])[1]
  const backImg = (c.match(/data-headimg="([^"]*)"/) || [])[1]
  const backKw = (c.match(/data-keywords="([^"]*)"/) || [])[1]

  console.log('\n' + '='.repeat(72))
  console.log(n >= 2 ? '✅ 合成标签存活' : '❌ 合成标签未存活')
  console.log(`  出现 ${n} 次（开+闭 = 1 个元素）`)
  log('compare', {
    nicknameKept: back === info.nickname,
    headimgKept: backImg === info.head_image_info.head_image_url,
    keywordsKept: backKw === encodeURIComponent(kwJson),
    back: { nickname: back, headimg: (backImg || '').slice(0, 70), keywords: (backKw || '').slice(0, 90) },
  })
  console.log('\n读回片段：')
  console.log((c.match(/<mp-common-search[\s\S]*?<\/mp-common-search>/) || ['（无）'])[0])
  console.log('\n完整 content：')
  console.log(c)

  await fetch(`https://api.weixin.qq.com/cgi-bin/draft/delete?access_token=${tok}`, { method: 'POST', body: JSON.stringify({ media_id: hit.media_id }) })
  log('cleanup', '探针草稿已删除')
}

process.exit(0)
