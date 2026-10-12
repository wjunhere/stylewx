#!/usr/bin/env node
/**
 * 音乐组件（`:::music`）链路探针 —— 真实微信编辑器，通过 kimi-webbridge 驱动已登录浏览器。
 *
 * 为什么要有这个探针：音乐能不能「全自动插入」是实测出来的结论，不是查文档查到的。
 * 早先按视频的经验以为音频也得人工点（视频确实只能人工，见 docs/DESIGN.md §20.10），
 * 实测发现**音乐不一样**：播放器是自定义元素，标签即数据，属性在播放器就在。
 *
 * 分阶段跑，每阶段只验证一件事，结论见 docs/DESIGN.md §26：
 *
 *   --stage picker   探「音频」入口与弹窗结构（只探查，不保存）
 *   --stage inject   把 clmusic 标签直接 insertHTML，看 ProseMirror 保不保留（不保存）
 *   --stage survive  注入 → 保存草稿 → draft/get 读回，验证真的活下来（**会写一条草稿**）
 *   --stage search   走「搜索 → 点选」路径，验证新曲目也能插（不保存）
 *
 * 用法：
 *   node apps/mcp-server/scripts/probe-wechat-music.mjs --stage picker
 *   node apps/mcp-server/scripts/probe-wechat-music.mjs --stage survive
 *   node apps/mcp-server/scripts/probe-wechat-music.mjs --stage search "惘闻 焦虑抑制剂"
 *
 * 前置：kimi-webbridge 守护进程 + 浏览器已登录公众号后台。
 * `--stage survive` 会创建一条标题含「[探针]音乐组件存活验证」的草稿并在读回后**自动删除**。
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DAEMON = process.env.WEBBRIDGE_URL ?? 'http://127.0.0.1:10086/command'
const SESSION = 'wx-music-probe'

// 原稿里原样拿到的音乐节点（来自旧草稿的 draft/get）。标签即数据，属性在播放器就在。
const CLMUSIC =
  `<mp-common-clmusic class="res_iframe clmusic_iframe js_uneditable custom_select_card mp_common_widget" ` +
  `data-pluginname="insertaudio" ` +
  `username="v2_060000231003b20faec8c7e3801fc5d6cd06ee3db077a88162d5015d767f26e3f233a3926794@finder" ` +
  `type="1" music_name="焦虑抑制剂" ` +
  `albumurl="http://wx.y.gtimg.cn/music/photo_new/T002R500x500M000001QOKKW2qnaFA_1.jpg" ` +
  `singer="惘闻" count="0" is_vip="0" duration="530000" music_source="1" ` +
  `listenid="78221540362775072"></mp-common-clmusic>`

const argv = process.argv.slice(2)
const stageIdx = argv.indexOf('--stage')
const STAGE = stageIdx >= 0 ? argv[stageIdx + 1] : 'picker'
const QUERY = argv.filter((a, i) => !a.startsWith('--') && i !== stageIdx + 1)[0] ?? '惘闻 焦虑抑制剂'
if (!['picker', 'inject', 'survive', 'search'].includes(STAGE)) {
  console.error(`✖  未知阶段「${STAGE}」。可选：picker / inject / survive / search`)
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (t, m) => console.log(`[${t}] ${m}`)

async function wb(action, args = {}) {
  const res = await fetch(DAEMON, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args, session: SESSION }),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(`${json.error?.code}: ${json.error?.message}`)
  return json.data
}
async function evalJson(code) {
  const r = await wb('evaluate', { code })
  const v = r?.value
  if (typeof v !== 'string') return v
  try { return JSON.parse(v) } catch { return v }
}

// 环境变量（survive 阶段回查用）
const env = {}
const envFile = join(ROOT, '.env')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

/** 打开后台 + 新建图文，返回 token。 */
async function openEditor() {
  await wb('navigate', { url: 'https://mp.weixin.qq.com/', newTab: true, group_title: 'stylewx 探针' })
  await sleep(4000)
  const home = await evalJson(`(() => { const m = location.href.match(/token=(\\d+)/); return JSON.stringify({ token: m ? m[1] : null, loggedIn: /cgi-bin\\/home/.test(location.href) }); })()`)
  if (!home?.token) throw new Error('未获取到登录态，请先在浏览器登录公众号后台')
  log('bridge', `token=${home.token}`)
  await wb('navigate', {
    url: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&createType=0&token=${home.token}&lang=zh_CN`,
  })
  await sleep(7000)
  await evalJson(`(() => { document.querySelectorAll('a,button,div').forEach(b => { if (/^(我知道了|知道了)$/.test((b.innerText||'').trim())) b.click(); }); return JSON.stringify({ok:1}); })()`)
  return home.token
}

/** 展开「音频」下拉并点「音乐」。返回错误字符串或 null。 */
async function openMusicDialog() {
  const expanded = await evalJson(`(() => {
    const el = document.querySelector('#audio_music_plugin_btn');
    if (!el) return JSON.stringify({ err: '找不到「音频」入口 #audio_music_plugin_btn' });
    // 它是 dropdown：要先展开才会露出「音频 / 音乐」两项
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    el.click();
    return JSON.stringify({ ok: true });
  })()`)
  if (!expanded?.ok) return expanded?.err ?? '展开音频下拉失败'
  await sleep(2000)
  const clicked = await evalJson(`(() => {
    const it = [...document.querySelectorAll('.js_insertmusic')].find(e => e.getBoundingClientRect().width > 0);
    if (!it) return JSON.stringify({ err: '下拉里没有「音乐」项 .js_insertmusic' });
    it.click();
    return JSON.stringify({ ok: true });
  })()`)
  if (!clicked?.ok) return clicked?.err ?? '点「音乐」失败'
  await sleep(4500)
  return null
}

const DUMP_DIALOG = `(() => {
  const dlg = [...document.querySelectorAll('.weui-desktop-dialog')].filter(d => d.getBoundingClientRect().width > 200).pop();
  if (!dlg) return JSON.stringify({ err: 'no visible dialog' });
  const bd = dlg.querySelector('.weui-desktop-dialog__bd') || dlg;
  const counter = new Map();
  bd.querySelectorAll('*').forEach(e => { const c = e.className; if (typeof c === 'string' && c) counter.set(c, (counter.get(c)||0)+1); });
  return JSON.stringify({
    dlgCls: dlg.className,
    inputs: [...bd.querySelectorAll('input')].map(i => ({ cls: i.className, ph: i.placeholder, type: i.type })),
    topRepeated: [...counter.entries()].filter(([,n]) => n >= 2).sort((a,b) => b[1]-a[1]).slice(0, 8),
    text: (bd.innerText || '').replace(/\\n+/g, ' | ').slice(0, 400),
  });
})()`

// ── 主流程 ──
await openEditor()

if (STAGE === 'picker') {
  // 先列出编辑器的全部插入项，确认「音频」的 id 与类型（dropdown 不是直接弹窗）
  const tools = await evalJson(`(() => {
    const out = [];
    document.querySelectorAll('li.tpl_item, [class*=jsInsertIcon]').forEach(el => {
      out.push({ id: el.id || '', cls: el.className, text: (el.innerText || '').trim().slice(0, 12) });
    });
    return JSON.stringify({ count: out.length, items: out });
  })()`)
  log('tools', `${tools?.count ?? 0} 个插入项`)
  for (const t of tools?.items ?? []) console.log('   ', JSON.stringify(t))

  const err = await openMusicDialog()
  if (err) { console.error(`✖  ${err}`); process.exit(1) }
  log('dialog', JSON.stringify(await evalJson(DUMP_DIALOG), null, 1))
  console.log('\n（picker 阶段结束，未保存）')
}

if (STAGE === 'inject' || STAGE === 'survive') {
  const title = STAGE === 'survive' ? '【探针】音乐组件存活验证' : ''
  const body =
    `<section><span leaf="">【探针】音乐组件存活验证 —— 请忽略。</span></section>` +
    `<section>${CLMUSIC}</section>` +
    `<section><span leaf="">探针结束。</span></section>`

  const injected = await evalJson(`(() => {
    const body = document.querySelector('.rich_media_content .ProseMirror') || document.querySelector('.rich_media_content [contenteditable=true]');
    if (!body) return JSON.stringify({ ok: false, err: '找不到正文编辑器' });
    const titleEl = document.querySelector('#title');
    if (titleEl && ${JSON.stringify(title)}) {
      titleEl.value = ${JSON.stringify(title)};
      titleEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    body.focus();
    const sel = window.getSelection(); sel.removeAllRanges();
    const r = document.createRange(); r.selectNodeContents(body); sel.addRange(r);
    document.execCommand('delete');
    document.execCommand('insertHTML', false, ${JSON.stringify(body)});
    return JSON.stringify({ ok: true, clmusic: body.querySelectorAll('mp-common-clmusic').length });
  })()`)
  if (!injected?.ok) { console.error(`✖  ${injected?.err}`); process.exit(1) }
  log('inject', `注入后 DOM 里 mp-common-clmusic = ${injected.clmusic}`)

  // 等编辑器稳定（照 publish-via-browser 的做法：保存前读回 DOM 核对）
  await sleep(STAGE === 'survive' ? 20000 : 12000)
  const dom = await evalJson(`(() => {
    const ed = document.querySelector('.rich_media_content .ProseMirror');
    return JSON.stringify({ clmusic: ed.querySelectorAll('mp-common-clmusic').length, iframes: ed.querySelectorAll('iframe').length });
  })()`)
  log('dom', `稳定后 mp-common-clmusic = ${dom?.clmusic} · iframe = ${dom?.iframes}`)

  if (STAGE === 'inject') {
    console.log(`\n结论：ProseMirror ${dom?.clmusic >= 1 ? '**保留**' : '**剥离**'}了 clmusic 标签。`)
    console.log('（inject 阶段结束，未保存 —— 要验证保存后是否存活请跑 --stage survive）')
  } else {
    const saved = await evalJson(`(() => {
      const btns = [...document.querySelectorAll('button,a,div,span')].filter(e => {
        const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (e.innerText||'').trim() === '保存为草稿';
      });
      if (!btns.length) return JSON.stringify({ err: '找不到「保存为草稿」' });
      btns[0].click();
      return JSON.stringify({ ok: true });
    })()`)
    if (!saved?.ok) { console.error(`✖  ${saved?.err}`); process.exit(1) }
    log('save', '已点「保存为草稿」')
    await sleep(9000)

    const tok = (await (await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.WECHAT_APP_ID}&secret=${env.WECHAT_APP_SECRET}`)).json()).access_token
    const list = await (await fetch(`https://api.weixin.qq.com/cgi-bin/draft/batchget?access_token=${tok}`, { method: 'POST', body: JSON.stringify({ offset: 0, count: 5, no_content: 0 }) })).json()
    const hit = (list.item ?? []).find((i) => i.content.news_item[0].title.includes('音乐组件存活验证'))
    if (!hit) {
      console.error('✖  没在草稿箱找到探针草稿')
    } else {
      const a = hit.content.news_item[0]
      const n = (a.content.match(/mp-common-clmusic/g) || []).length
      log('verify', `读回：mp-common-clmusic 出现 ${n} 次（开+闭 = 1 个元素）· content ${a.content.length} 字符`)
      console.log('\n读回的完整 content：')
      console.log(a.content)
      console.log(`\n结论：${n >= 2 ? '✅ 存活 —— 音乐可由脚本全自动插入' : '❌ 未存活'}`)
      // 清理探针草稿
      await fetch(`https://api.weixin.qq.com/cgi-bin/draft/delete?access_token=${tok}`, { method: 'POST', body: JSON.stringify({ media_id: hit.media_id }) })
      log('cleanup', '探针草稿已删除')
    }
  }
}

if (STAGE === 'search') {
  await evalJson(`(() => {
    const b = document.querySelector('.rich_media_content .ProseMirror');
    b.focus();
    const sel = window.getSelection(); sel.removeAllRanges();
    const r = document.createRange(); r.selectNodeContents(b); sel.addRange(r);
    document.execCommand('insertHTML', false, '<section><span leaf="">【探针】搜索路径。</span></section>');
    return JSON.stringify({ ok: 1 });
  })()`)
  await sleep(1500)

  const err = await openMusicDialog()
  if (err) { console.error(`✖  ${err}`); process.exit(1) }
  log('dialog', JSON.stringify(await evalJson(DUMP_DIALOG)))

  // 搜索：填输入框 + **必须显式点搜索按钮**
  // ⚠️ 只 input 不触发查询：实测等 9 秒也不发请求（不是防抖慢，是没绑 input 事件）。
  const searched = await evalJson(`(() => {
    const dlg = [...document.querySelectorAll('.weui-desktop-dialog')].filter(d => d.getBoundingClientRect().width > 200).pop();
    if (!dlg) return JSON.stringify({ err: 'no dialog' });
    const input = dlg.querySelector('input.weui-desktop-form__input');
    if (!input) return JSON.stringify({ err: 'no search input' });
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(QUERY)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    const btn = dlg.querySelector('.weui-desktop-search__btn');
    if (!btn) return JSON.stringify({ err: 'no search button' });
    btn.click();
    return JSON.stringify({ ok: true });
  })()`)
  if (!searched?.ok) { console.error(`✖  ${searched?.err}`); process.exit(1) }
  await sleep(8000)
  log('results', JSON.stringify(await evalJson(DUMP_DIALOG), null, 1))
  console.log('\n（search 阶段结束，未保存 —— 说明「填输入框 + 点搜索按钮」能拿到结果）')
}

process.exit(0)
