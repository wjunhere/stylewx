#!/usr/bin/env node
/** 诊断：插入 mp-common-search 后保存失败的原因。
 *  重点看：保存点击后有没有报错弹窗 / toast、编辑器是否进入了不可保存状态。
 *  只诊断，不保存、不发布（除非能保存成功，那时也只为观察）。
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getPresetTheme, validateTheme, completeThemeBlocks } from '@stylewx/theme'
import { renderPreview } from '@stylewx/service'
import { brandsDir, readEnvFile } from '../../../assets-src/paths.mjs'
import { useSession, wb, evalJson as ev, sleep } from './lib/bridge.mjs'

useSession('wx-savedbg')
const log = (t, m) => console.log(`[${t}]`, typeof m === 'string' ? m : JSON.stringify(m, null, 1))

const env = readEnvFile()
const tok = (await (await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.WECHAT_APP_ID}&secret=${env.WECHAT_APP_SECRET}`)).json()).access_token
const acct = await (await fetch(`https://api.weixin.qq.com/cgi-bin/account/getaccountbasicinfo?access_token=${tok}`)).json()

// 文章由调用方指定：仓库里不留具体文章名（§34）
const mdPath = process.argv[2]
if (!mdPath) {
  console.error('用法：node <本脚本> <markdown 文章路径>（文章放在工作区 articles/ 里）')
  process.exit(2)
}
const md = readFileSync(mdPath, 'utf8')
const theme = JSON.parse(readFileSync(join(brandsDir(), 'hippie-youth', 'profile.json'), 'utf8')).theme
const preview = await renderPreview(md, theme, { includeScreenshot: false })

await wb('navigate', { url: 'https://mp.weixin.qq.com/', newTab: true, group_title: 'savedbg' })
await sleep(4000)
const h = await ev(`(()=>{const m=location.href.match(/token=(\\d+)/);return JSON.stringify({t:m?m[1]:null})})()`)
await wb('navigate', { url: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&createType=0&token=${h.t}&lang=zh_CN` })
await sleep(8000)
await ev(`(()=>{document.querySelectorAll('a,button,div').forEach(b=>{if(/^(我知道了|知道了)$/.test((b.innerText||'').trim()))b.click()});return JSON.stringify({k:1})})()`)
let ready = null
for (let i = 0; i < 20; i++) { ready = await ev(`(()=>JSON.stringify({e:!!document.querySelector('.rich_media_content .ProseMirror'),t:document.querySelectorAll('li.tpl_item').length}))()`); if (ready?.e && ready?.t > 5) break; await sleep(2000) }
log('ready', ready)
await sleep(3000)

// 注入正文（只到 search 占位块之前的部分 + 后续正文，即完整文章）
const injected = await ev(`(()=>{
  const b=document.querySelector('.rich_media_content .ProseMirror');b.focus();
  const t=document.querySelector('#title');if(t){t.value='【诊断】搜索保存失败';t.dispatchEvent(new Event('input',{bubbles:true}))}
  const s=window.getSelection();s.removeAllRanges();const r=document.createRange();r.selectNodeContents(b);s.addRange(r);
  document.execCommand('delete');
  document.execCommand('insertHTML',false,${JSON.stringify(preview.html)});
  return JSON.stringify({svg:b.querySelectorAll('svg').length,searchPlaceholder:b.querySelectorAll('[data-swx-search]').length})})()`)
log('inject-article', injected)
await sleep(30000)

// 插入搜索（与 publish 脚本同样的原子操作）
const sr = await ev(`(()=>{
  const ed=document.querySelector('.rich_media_content .ProseMirror');
  const hit=ed.querySelector('[data-swx-search]');
  if(!hit)return JSON.stringify({err:'no placeholder'});
  const kws=(hit.getAttribute('data-swx-search-keywords')||'').split('|').filter(Boolean);
  const tag='<section class="mp_search_iframe_wrp custom_select_card_wrp" nodeleaf="">'
    +'<mp-common-search class="js_mpsearch appmsg_search_iframe js_uneditable custom_select_card mp_common_widget"'
    +' data-pluginname="insertsearch"'
    +' data-nickname="'+${JSON.stringify(acct.nickname)}+'"'
    +' data-headimg="'+${JSON.stringify(acct.head_image_info.head_image_url)}+'"'
    +' data-keywords="'+encodeURIComponent(JSON.stringify(kws.map(l=>({label:l}))))+'"'
    +' contenteditable="false"></mp-common-search></section>';
  const rg=document.createRange();rg.setStartAfter(hit);rg.collapse(true);
  const s=window.getSelection();s.removeAllRanges();s.addRange(rg);
  document.execCommand('insertHTML',false,tag);
  hit.remove();
  return JSON.stringify({ok:true,kws,search:ed.querySelectorAll('mp-common-search').length})})()`)
log('insert-search', sr)

// 观察编辑器状态随时间的变化（看它是否在做异步校验）
for (const w of [5000, 10000, 15000]) {
  await sleep(w)
  const st = await ev(`(()=>{
    const ed=document.querySelector('.rich_media_content .ProseMirror');
    const el=ed.querySelector('mp-common-search');
    return JSON.stringify({
      search: ed.querySelectorAll('mp-common-search').length,
      attrsKept: el ? (el.getAttribute('data-nickname')||'')+' | '+(el.getAttribute('data-keywords')||'').slice(0,40) : null,
      iframeWrp: ed.querySelectorAll('.mp_search_iframe_wrp').length,
      toast: [...document.querySelectorAll('[class*=toast],[class*=Toast],[class*=tips]')].filter(e=>e.getBoundingClientRect().height>0).map(e=>(e.innerText||'').trim().slice(0,60)).filter(Boolean),
    })})()`)
  log(`after+${w}ms`, st)
}

// 点保存并密切观察
const save = await ev(`(()=>{
  const all=[...document.querySelectorAll('button,a,div,span')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(e.innerText||'').trim()==='保存为草稿'});
  return JSON.stringify({found:all.length, texts:all.slice(0,2).map(e=>e.tagName+'.'+String(e.className).slice(0,50))})})()`)
log('save-button', save)
const clicked = await ev(`(()=>{
  const all=[...document.querySelectorAll('button,a,div,span')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(e.innerText||'').trim()==='保存为草稿'});
  if(!all.length)return JSON.stringify({err:'no button'});
  all[0].click();return JSON.stringify({ok:true})})()`)
log('clicked', clicked)

for (const w of [3000, 7000, 12000]) {
  await sleep(w)
  const st = await ev(`(()=>{
    const m=location.href.match(/appmsgid=(\\d+)/);
    return JSON.stringify({
      appmsgid: m?m[1]:null,
      dialogs: [...document.querySelectorAll('.weui-desktop-dialog')].filter(d=>d.getBoundingClientRect().width>200).map(d=>(d.innerText||'').replace(/\\n+/g,' | ').slice(0,150)),
      toasts: [...document.querySelectorAll('[class*=toast],[class*=Toast]')].filter(e=>e.getBoundingClientRect().height>0).map(e=>(e.innerText||'').trim().slice(0,80)).filter(Boolean),
      errors: [...document.querySelectorAll('[class*=error],[class*=Error],[class*=warn]')].filter(e=>e.getBoundingClientRect().height>0).map(e=>(e.innerText||'').trim().slice(0,80)).filter(Boolean).slice(0,5),
      url: location.href.slice(0,90),
    })})()`)
  log(`save+${w}ms`, st)
}

console.log('\n（诊断结束）')
process.exit(0)
