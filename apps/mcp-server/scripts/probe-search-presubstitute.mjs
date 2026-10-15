#!/usr/bin/env node
/**
 * 验证「预替换」方案：注入**之前**就把 `:::search` 的占位块替换成真组件标签，
 * 整篇一次性注入 —— 绕开「二次插入落点被吸进 SVG」的问题。
 *
 * 与「注入后再插」相比的优势：落点由初次解析决定（源码里就在尾图之前），不依赖光标位置。
 *
 * 同时验证往返回导：替换后仍保留 `data-swx="search"` 包装标记，发布后的文章仍能导回 markdown。
 *
 * ⚠️ 会写一条 [探针] 草稿，读回后自动删除。只做这一步验证。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderPreview } from '@stylewx/service'
import { articlesDir, brandsDir, readEnvFile } from '../../../assets-src/paths.mjs'
const DAEMON = 'http://127.0.0.1:10086/command'
const S = 'wx-presub'
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

const md = readFileSync(join(articlesDir(), 'hippie', '好好吃饭.md'), 'utf8')
const theme = JSON.parse(readFileSync(join(brandsDir(), 'hippie-youth', 'profile.json'), 'utf8')).theme
const preview = await renderPreview(md, theme, { includeScreenshot: false })

// ── 预替换：把占位块的开标签内联样式 + 内容换成真组件，但**保留 data-swx 包装** ──
// 占位块形如：<section data-swx-search="1" data-swx-search-keywords="a|b" style="…" data-swx="search" …>…</section>
// 保留 data-swx="search" 与 data-swx-src（往返回导要用），去掉 data-swx-search 定位标记。
function substituteSearch(html, { nickname, headimg }) {
  const re = /<section\b[^>]*\bdata-swx-search="1"[^>]*>[\s\S]*?<\/section>/
  const m = html.match(re)
  if (!m) return { html, replaced: 0 }
  const open = (m[0].match(/^<section\b[^>]*>/) || [''])[0]
  const kwsAttr = (open.match(/data-swx-search-keywords="([^"]*)"/) || [])[1] || ''
  const keywords = kwsAttr.split('|').map((s) => s.trim()).filter(Boolean).slice(0, 4)
  if (!keywords.length) return { html, replaced: 0 }

  // 从原开标签里保住 swx 标记（往返回导用）
  const keep = {}
  for (const k of ['data-swx', 'data-swx-props', 'data-swx-src']) {
    const v = open.match(new RegExp(`${k}="([^"]*)"`))
    if (v) keep[k] = v[1]
  }
  const swxAttrs = Object.entries(keep).map(([k, v]) => ` ${k}="${v}"`).join('')

  const kwJson = JSON.stringify(keywords.map((label) => ({ label })))
  const real =
    `<section${swxAttrs}>` +
    `<section class="mp_search_iframe_wrp custom_select_card_wrp" nodeleaf="">` +
    `<mp-common-search class="js_mpsearch appmsg_search_iframe js_uneditable custom_select_card mp_common_widget"` +
    ` data-pluginname="insertsearch"` +
    ` data-nickname="${nickname}"` +
    ` data-headimg="${headimg}"` +
    ` data-keywords="${encodeURIComponent(kwJson)}"` +
    ` contenteditable="false"></mp-common-search></section></section>`

  return { html: html.replace(re, real), replaced: 1, keywords }
}

const sub = substituteSearch(preview.html, { nickname: acct.nickname, headimg: acct.head_image_info.head_image_url })
log('substitute', { replaced: sub.replaced, keywords: sub.keywords, lenBefore: preview.html.length, lenAfter: sub.html.length })
if (!sub.replaced) { console.error('✖ 没找到占位块'); process.exit(1) }

await wb('navigate', { url: 'https://mp.weixin.qq.com/', newTab: true, group_title: 'presub' })
await sleep(4000)
const h = await ev(`(()=>{const m=location.href.match(/token=(\\d+)/);return JSON.stringify({t:m?m[1]:null})})()`)
await wb('navigate', { url: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media_appmsg_edit_v2&action=edit&isNew=1&type=10&createType=0&token=${h.t}&lang=zh_CN`.replace('media_appmsg', 'media/appmsg') })
await sleep(8000)
await ev(`(()=>{document.querySelectorAll('a,button,div').forEach(b=>{if(/^(我知道了|知道了)$/.test((b.innerText||'').trim()))b.click()});return JSON.stringify({k:1})})()`)
let ready = null
for (let i = 0; i < 20; i++) { ready = await ev(`(()=>JSON.stringify({e:!!document.querySelector('.rich_media_content .ProseMirror'),t:document.querySelectorAll('li.tpl_item').length}))()`); if (ready?.e && ready?.t > 5) break; await sleep(2000) }
log('ready', ready)
await sleep(3000)

const inj = await ev(`(()=>{
  const b=document.querySelector('.rich_media_content .ProseMirror');b.focus();
  const t=document.querySelector('#title');if(t){t.value='【探针】预替换落点验证';t.dispatchEvent(new Event('input',{bubbles:true}))}
  const s=window.getSelection();s.removeAllRanges();const r=document.createRange();r.selectNodeContents(b);s.addRange(r);
  document.execCommand('delete');
  document.execCommand('insertHTML',false,${JSON.stringify(sub.html)});
  const el=b.querySelector('mp-common-search');
  return JSON.stringify({
    search: b.querySelectorAll('mp-common-search').length,
    insideSvg: el ? !!el.closest('svg') : null,
    insideEndCard: el ? (b.querySelector('[data-swx="hip-end-a"]')||{contains:()=>null}).contains(el) : null,
    swxKept: !!b.querySelector('[data-swx="search"]'),
  })})()`)
log('inject(DOM 立即)', inj)
await sleep(20000)
const after = await ev(`(()=>{
  const b=document.querySelector('.rich_media_content .ProseMirror');
  const el=b.querySelector('mp-common-search');
  return JSON.stringify({
    search: b.querySelectorAll('mp-common-search').length,
    insideSvg: el ? !!el.closest('svg') : null,
    insideEndCard: el ? (b.querySelector('[data-swx="hip-end-a"]')||{contains:()=>null}).contains(el) : null,
    swxKept: !!b.querySelector('[data-swx="search"]'),
    svgCount: b.querySelectorAll('svg').length,
  })})()`)
log('after-20s', after)

// 保存 → 读回
const saved = await ev(`(()=>{const a=[...document.querySelectorAll('button,a,div,span')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(e.innerText||'').trim()==='保存为草稿'});a[0]?.click();return JSON.stringify({k:1})})()`)
void saved
await sleep(9000)
const list = await (await fetch(`https://api.weixin.qq.com/cgi-bin/draft/batchget?access_token=${tok}`, { method: 'POST', body: JSON.stringify({ offset: 0, count: 5, no_content: 0 }) })).json()
const hit = (list.item ?? []).find((i) => i.content.news_item[0].title.includes('预替换落点验证'))
if (!hit) { console.error('✖ 没找到探针草稿'); process.exit(1) }
const c = hit.content.news_item[0].content
const elTag = c.match(/<mp-common-search[^>]*>/) || ['']
const posSearch = c.indexOf('mp-common-search')
const posEnd = c.indexOf('data-swx="hip-end-a"')
const posSvgTag = c.indexOf('<svg')
console.log('\n' + '='.repeat(72))
log('读回', {
  搜索元素数: (c.match(/<mp-common-search/g) || []).length,
  包装标记保留: c.includes('data-swx="search"'),
  svg数: (c.match(/<svg/g) || []).length,
  搜索位置: posSearch,
  尾图位置: posEnd,
  首个svg位置: posSvgTag,
  在尾图之前: posSearch > 0 && posEnd > 0 && posSearch < posEnd,
  在首个svg之前: posSearch > 0 && posSvgTag > 0 && posSearch < posSvgTag,
})
console.log('\n搜索元素:', elTag[0])
console.log('\n尾部 900 字符:')
console.log(c.slice(-900))
await fetch(`https://api.weixin.qq.com/cgi-bin/draft/delete?access_token=${tok}`, { method: 'POST', body: JSON.stringify({ media_id: hit.media_id }) })
log('cleanup', '探针草稿已删除')
process.exit(0)
