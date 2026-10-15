#!/usr/bin/env node
/**
 * 策略矩阵：找出「把搜索块插到 tail-SVG 之前」的正确做法。
 *
 * 背景：占位块后面紧邻 `hip-end-a`（含内联 <svg>）时，用 setStartAfter + execCommand('insertHTML')
 * 会把搜索块**插进 svg 内部**（实测 insideSvg=true），尾图因此被破坏。
 * 判据：`mp-common-search`.closest('svg') 必须为 null，且它不在任何 [data-swx=hip-end-a] 内。
 *
 * 只诊断，不保存。用法：node apps/mcp-server/scripts/probe-search-position.mjs
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderPreview } from '@stylewx/service'
import { brandsDir, readEnvFile } from '../../../assets-src/paths.mjs'
const DAEMON = 'http://127.0.0.1:10086/command'
const S = 'wx-searchpos'
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
const tok = (await (await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.WECHAT_APP_ID}&secret=${env.WECHAT_APP_SECRET}`)).json()).access_token
const acct = await (await fetch(`https://api.weixin.qq.com/cgi-bin/account/getaccountbasicinfo?access_token=${tok}`)).json()
const NICK = acct.nickname
const HEAD = acct.head_image_info.head_image_url

// 文章由调用方指定：仓库里不留具体文章名（§34）
const mdPath = process.argv[2]
if (!mdPath) {
  console.error('用法：node <本脚本> <markdown 文章路径>（文章放在工作区 articles/ 里）')
  process.exit(2)
}
const md = readFileSync(mdPath, 'utf8')
const theme = JSON.parse(readFileSync(join(brandsDir(), 'hippie-youth', 'profile.json'), 'utf8')).theme
const preview = await renderPreview(md, theme, { includeScreenshot: false })

const TAG_FN = `(kws) => '<section class="mp_search_iframe_wrp custom_select_card_wrp" nodeleaf="">'
  + '<mp-common-search class="js_mpsearch appmsg_search_iframe js_uneditable custom_select_card mp_common_widget"'
  + ' data-pluginname="insertsearch"'
  + ' data-nickname="' + ${JSON.stringify(NICK)} + '"'
  + ' data-headimg="' + ${JSON.stringify(HEAD)} + '"'
  + ' data-keywords="' + encodeURIComponent(JSON.stringify(kws.map(label => ({ label })))) + '"'
  + ' contenteditable="false"></mp-common-search></section>'`

const DIAG = `(() => {
  const ed = document.querySelector('.rich_media_content .ProseMirror');
  const el = ed.querySelector('mp-common-search');
  if (!el) return JSON.stringify({ ok: false, err: '元素不在 DOM 里' });
  const sig = ed.querySelector('[data-swx="hip-end-a"]');
  const insideSvg = !!el.closest('svg');
  const insideEnd = sig ? sig.contains(el) : null;
  return JSON.stringify({
    ok: !insideSvg && insideEnd !== true,
    insideSvg, insideEndCard: insideEnd,
    chain: (() => { const a = []; let n = el.parentElement, d = 0; while (n && d < 4) { a.push((n.getAttribute && n.getAttribute('data-swx')) || n.tagName.toLowerCase()); n = n.parentElement; d++ } return a })(),
    textAround: (el.previousElementSibling?.innerText || '').slice(0, 20) + ' || ' + (el.nextElementSibling?.innerText || '').slice(0, 20),
  });
})()`

/** 策略表：每个都是 (hit, tag) => void，只做插入（删占位块统一在外面）。 */
const STRATEGIES = {
  'A 现状: setStartAfter + insertHTML': `
    const r=document.createRange(); r.setStartAfter(hit); r.collapse(true);
    const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand('insertHTML', false, tag);`,

  'B 先插空段落再插 tag': `
    const r=document.createRange(); r.setStartAfter(hit); r.collapse(true);
    const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand('insertHTML', false, '<section><span leaf=""><br></span></section>');
    // 再把 tag 插到新空段落之后
    const anchor=[...hit.parentElement.children].find(e=>e!==hit && e.compareDocumentPosition(hit)===2);
    const r2=document.createRange(); r2.setStartAfter(hit); r2.collapse(true);
    const s2=window.getSelection(); s2.removeAllRanges(); s2.addRange(r2);
    document.execCommand('insertHTML', false, tag);`,

  'C 插到文档末尾(body 最后)': `
    const last=document.querySelector('.rich_media_content .ProseMirror');
    const r=document.createRange(); r.selectNodeContents(last); r.collapse(false);
    const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand('insertHTML', false, tag);`,

  'D 直接 DOM 插入到占位块之前(不走 execCommand)': `
    hit.parentElement.insertBefore((() => { const d=document.createElement('div'); d.innerHTML=tag; return d.firstElementChild })(), hit);`,

  'E 插到 end-card 之前(SVG 块的 startBefore)': `
    const sig=document.querySelector('[data-swx="hip-end-a"]');
    const target=sig || hit;
    const r=document.createRange(); r.setStartBefore(target); r.collapse(true);
    const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand('insertHTML', false, tag);`,

  'F 选中占位块整体替换(selectNode + insertHTML)': `
    const r=document.createRange(); r.selectNode(hit);
    const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand('insertHTML', false, tag);`,
}

await wb('navigate', { url: 'https://mp.weixin.qq.com/', newTab: true, group_title: 'searchpos' })
await sleep(4000)
const h = await ev(`(()=>{const m=location.href.match(/token=(\\d+)/);return JSON.stringify({t:m?m[1]:null})})()`)
const EDITOR = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&createType=0&token=${h.t}&lang=zh_CN`.replace('media_appmsg', 'media/appmsg')

for (const [name, body] of Object.entries(STRATEGIES)) {
  console.log('\n' + '='.repeat(72))
  log('strategy', name)
  await wb('navigate', { url: EDITOR })
  await sleep(8000)
  await ev(`(()=>{document.querySelectorAll('a,button,div').forEach(b=>{if(/^(我知道了|知道了)$/.test((b.innerText||'').trim()))b.click()});return JSON.stringify({k:1})})()`)
  let ready = null
  for (let i = 0; i < 20; i++) { ready = await ev(`(()=>JSON.stringify({e:!!document.querySelector('.rich_media_content .ProseMirror'),t:document.querySelectorAll('li.tpl_item').length}))()`); if (ready?.e && ready?.t > 5) break; await sleep(2000) }
  if (!ready?.e) { log('strategy', '编辑器未就绪，跳过'); continue }
  await sleep(3000)

  const inj = await ev(`(()=>{
    const b=document.querySelector('.rich_media_content .ProseMirror');b.focus();
    const t=document.querySelector('#title');if(t){t.value='【策略】';t.dispatchEvent(new Event('input',{bubbles:true}))}
    const s=window.getSelection();s.removeAllRanges();const r=document.createRange();r.selectNodeContents(b);s.addRange(r);
    document.execCommand('delete');
    document.execCommand('insertHTML',false,${JSON.stringify(preview.html)});
    return JSON.stringify({ph:b.querySelectorAll('[data-swx-search]').length})})()`)
  if (!inj?.ph) { log('strategy', `注入失败 ${JSON.stringify(inj)}`); continue }
  log('inject', `占位块 ${inj.ph} 个`)
  await sleep(25000)

  const r = await ev(`(()=>{
    const ed = document.querySelector('.rich_media_content .ProseMirror');
    const hit = ed.querySelector('[data-swx-search]');
    if (!hit) return JSON.stringify({ err: 'no placeholder' });
    const kws = (hit.getAttribute('data-swx-search-keywords') || '').split('|').filter(Boolean);
    const tag = (${TAG_FN})(kws);
    try { ${body} } catch (e) { return JSON.stringify({ err: String(e) }) }
    // 删占位块（D 策略下它还在）
    const still = ed.querySelector('[data-swx-search]');
    if (still) still.remove();
    return JSON.stringify({ ok: true });
  })()`)
  log('apply', r)
  await sleep(8000)
  const d = await ev(DIAG)
  log('diag', d)
  log('结论', d?.ok ? '✅ 落点正确' : (d?.insideSvg ? '❌ 又进了 SVG' : '⚠️ ' + JSON.stringify(d)))
}

console.log('\n（矩阵结束，未保存）')
process.exit(0)
