#!/usr/bin/env node
/**
 * 探针：专攻「推荐搜索」（#js_editor_insertsearch）—— 平台组件里最像排版组件的一个。
 *
 * 难点：弹窗里「输入搜索词1」是个 <strong> 占位文本，不是 input；
 * 需要先点进编辑态才能输入。本脚本试「点 → 输入 → 看确定是否可用 → 插入 → dump 落地标签」。
 *
 * 若落地的是自包含标记 → 可像 :::music 一样离线合成、零交互插入。
 * 只探查，不保存。用法：node apps/mcp-server/scripts/probe-wechat-search-widget.mjs
 */
const DAEMON = 'http://127.0.0.1:10086/command'
const S = 'wx-searchprobe'
const KWS = ['焦虑抑制剂', '好好吃饭', 'HIPPIE 青年']

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

await wb('navigate', { url: 'https://mp.weixin.qq.com/', newTab: true, group_title: 'searchprobe' })
await sleep(4000)
const h = await ev(`(()=>{const m=location.href.match(/token=(\\d+)/);return JSON.stringify({t:m?m[1]:null})})()`)
if (!h?.t) { console.error('✖ 未登录'); process.exit(1) }
await wb('navigate', { url: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&createType=0&token=${h.t}&lang=zh_CN` })
await sleep(9000)
await ev(`(()=>{document.querySelectorAll('a,button,div').forEach(b=>{if(/^(我知道了|知道了)$/.test((b.innerText||'').trim()))b.click()});return JSON.stringify({k:1})})()`)
for (let i = 0; i < 10; i++) {
  const ok = await ev(`(()=>JSON.stringify({e:!!document.querySelector('.rich_media_content .ProseMirror'),t:document.querySelectorAll('li.tpl_item').length}))()`)
  if (ok?.e && ok?.t > 5) break
  await sleep(2000)
}

// 锚点 + 光标
await ev(`(()=>{const b=document.querySelector('.rich_media_content .ProseMirror');b.focus();
  const s=window.getSelection();s.removeAllRanges();const r=document.createRange();r.selectNodeContents(b);s.addRange(r);
  document.execCommand('delete');document.execCommand('insertHTML',false,'<section><span leaf="">【探针】锚点。</span></section>');
  const last=b.querySelector('section');const r2=document.createRange();r2.setStartAfter(last);r2.collapse(true);
  s.removeAllRanges();s.addRange(r2);return JSON.stringify({k:1})})()`)
await sleep(1500)

// 打开推荐搜索弹窗
await ev(`(()=>{const el=document.getElementById('js_editor_insertsearch');el.click();return JSON.stringify({k:1})})()`)
await sleep(5000)

// 点「输入搜索词1」进入编辑态（它是 strong 占位，点一下通常出现 input）
for (let i = 0; i < KWS.length; i++) {
  const step = await ev(`(()=>{
    const d=[...document.querySelectorAll('.weui-desktop-dialog')].filter(x=>x.getBoundingClientRect().width>200).pop();
    if(!d)return JSON.stringify({err:'no dialog'});
    // 优先找可见 input；没有则点当前默认占位文本进入编辑态
    let input=[...d.querySelectorAll('input')].filter(x=>x.type!=='hidden'&&x.getBoundingClientRect().width>0)[0];
    if(!input){
      const ph=[...d.querySelectorAll('.appmsg_search_keywords_default')].filter(e=>e.getBoundingClientRect().width>0)[0];
      if(!ph)return JSON.stringify({err:'no placeholder to click'});
      ph.click();
      return JSON.stringify({clickedPlaceholder:true});
    }
    const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    setter.call(input, ${JSON.stringify(KWS[i])});
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

const state = await ev(`(()=>{
  const d=[...document.querySelectorAll('.weui-desktop-dialog')].filter(x=>x.getBoundingClientRect().width>200).pop();
  if(!d)return JSON.stringify({err:'no dialog'});
  const ok=[...d.querySelectorAll('button')].find(b=>(b.innerText||'').trim()==='确定');
  return JSON.stringify({
    okDisabled: ok ? (ok.disabled===true||ok.className.indexOf('disabled')>=0) : null,
    inputs:[...d.querySelectorAll('input')].map(i=>({cls:String(i.className),v:i.value,vis:i.getBoundingClientRect().width>0})),
    text:(d.innerText||'').replace(/\\n+/g,' | ').slice(0,300),
  })})()`)
log('state', JSON.stringify(state, null, 1))

// 尝试插入
const conf = await ev(`(()=>{
  const d=[...document.querySelectorAll('.weui-desktop-dialog')].filter(x=>x.getBoundingClientRect().width>200).pop();
  if(!d)return JSON.stringify({err:'no dialog'});
  const ok=[...d.querySelectorAll('button')].find(b=>(b.innerText||'').trim()==='确定');
  if(!ok)return JSON.stringify({err:'no 确定'});
  if(ok.disabled===true||ok.className.indexOf('disabled')>=0)return JSON.stringify({err:'确定 disabled'});
  ok.click();return JSON.stringify({ok:true})})()`)
log('confirm', JSON.stringify(conf))
await sleep(4500)

// dump 落地标记（这是本次最关键的一步）
const landed = await ev(`(()=>{
  const ed=document.querySelector('.rich_media_content .ProseMirror');
  return JSON.stringify({
    custom:[...ed.querySelectorAll('*')].filter(e=>/^mp-/.test(e.tagName.toLowerCase())).map(e=>({tag:e.tagName.toLowerCase(),attrs:[...e.attributes].map(a=>a.name+'='+String(a.value).slice(0,80))})),
    html:ed.innerHTML.slice(-1600),
  })})()`)
log('landed', JSON.stringify(landed, null, 1))
console.log('\n（探针结束，未保存）')
process.exit(0)
