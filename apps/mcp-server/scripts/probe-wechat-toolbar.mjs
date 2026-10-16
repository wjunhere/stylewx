#!/usr/bin/env node
/**
 * 探针：枚举微信公众号图文编辑器的**全部插入项**（工具栏一级 + 全部下拉子项）。
 *
 * 目的：拿一份「平台有什么」的事实清单，跟 stylewx 现有组件做差集，
 * 判断哪些值得补（判断标准见 docs/DESIGN.md §28）。
 *
 * 只探查，不保存、不发布。
 * 用法：node apps/mcp-server/scripts/probe-wechat-toolbar.mjs
 */
import { useSession, wb, evalJson, sleep } from './lib/bridge.mjs'

useSession('wx-toolbar-probe')

const log = (t, m) => console.log(`[${t}] ${m}`)

await wb('navigate', { url: 'https://mp.weixin.qq.com/', newTab: true, group_title: 'stylewx 探针' })
await sleep(4000)
const home = await evalJson(`(() => { const m = location.href.match(/token=(\\d+)/); return JSON.stringify({ token: m ? m[1] : null }); })()`)
if (!home?.token) { console.error('✖  未登录'); process.exit(1) }
await wb('navigate', {
  url: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&createType=0&token=${home.token}&lang=zh_CN`,
})
await sleep(8000)
await evalJson(`(() => { document.querySelectorAll('a,button,div').forEach(b => { if (/^(我知道了|知道了)$/.test((b.innerText||'').trim())) b.click(); }); return JSON.stringify({ok:1}); })()`)

// 1. 工具栏一级项（id 是最可靠的机器标识）
const toolbar = await evalJson(`(() => {
  const out = [];
  document.querySelectorAll('li.tpl_item, [class*=jsInsertIcon]').forEach(el => {
    out.push({
      id: el.id || '',
      cls: el.className,
      text: (el.innerText || '').trim().slice(0, 14),
      dropdown: /dropdown/.test(el.className),
    });
  });
  return JSON.stringify({ count: out.length, items: out });
})()`)
log('toolbar', `${toolbar?.count} 个一级项`)
for (const t of toolbar?.items ?? []) console.log('   ', JSON.stringify(t))

// 2. 展开每个 dropdown，收集子项
//    （音乐入口就是这样发现的：一级项「音频」是 dropdown，子项才是「音频 / 音乐」）
log('expand', '逐个展开下拉，收集子项…')
const subs = await evalJson(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const seen = {};
  const drops = [...document.querySelectorAll('li.tpl_item.dropdown, li.tpl_item_dropdown')];
  for (const d of drops) {
    const label = (d.innerText || '').trim().slice(0, 14);
    d.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    d.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    d.click();
    await sleep(900);
    // 该下拉展开后，页面里可见的、带菜单项 class 的元素
    const menu = [...document.querySelectorAll('.tpl_dropdown_menu_item, [class*=dropdown_menu_item]')]
      .filter(e => e.getBoundingClientRect().width > 0)
      .map(e => ({ cls: e.className, text: (e.innerText || '').trim().slice(0, 14) }));
    if (menu.length) seen[label] = menu;
    // 点别处收起
    document.body.click();
    await sleep(400);
  }
  return JSON.stringify(seen);
})()`)
console.log('\n下拉子项：')
console.log(JSON.stringify(subs, null, 1))

// 3. 顺带记录「更多」/自定义工具栏里还有什么（往往藏着额外能力）
const more = await evalJson(`(() => {
  const el = document.querySelector('#editor_showmore');
  if (!el) return JSON.stringify({ err: 'no showmore' });
  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  el.click();
  return JSON.stringify({ ok: true });
})()`)
await sleep(2500)
const moreItems = await evalJson(`(() => {
  const out = [];
  document.querySelectorAll('.tpl_dropdown_menu_item, [class*=dropdown_menu_item]').forEach(e => {
    if (e.getBoundingClientRect().width > 0) out.push((e.innerText || '').trim().slice(0, 16));
  });
  return JSON.stringify({ items: [...new Set(out)] });
})()`)
log('showmore', JSON.stringify(moreItems))

console.log('\n（探针结束，未保存）')
process.exit(0)
