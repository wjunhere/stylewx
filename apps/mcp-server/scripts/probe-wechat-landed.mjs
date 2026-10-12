#!/usr/bin/env node
/**
 * 探针：重点验证平台组件的**落地标记**（决定能否像 :::music 一样自动插入）。
 *
 * 判据（从音乐组件推广而来）：插入后落地的是不是**自包含的自定义元素**（数据在属性上）。
 *   - 是 → 标签即数据，脚本可离线合成，零交互插入（音乐就属于这类）
 *   - 否（需服务端对象 / 人工选择）→ 只能占位 + 人工
 *
 * 每个目标：清空正文 → 点入口 → dump 弹窗结构 → 尽力填参数 → 插入 → dump 落地标签。
 * 只探查，**不保存**。用法：
 *   node apps/mcp-server/scripts/probe-wechat-landed.mjs [id1,id2,...]
 */
const DAEMON = process.env.WEBBRIDGE_URL ?? 'http://127.0.0.1:10086/command'
const SESSION = 'wx-landed-probe'
const TARGETS = (process.argv[2] ?? 'js_editor_insertsearch').split(',')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (t, m) => console.log(`[${t}] ${m}`)

async function wb(action, args = {}) {
  const res = await fetch(DAEMON, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
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

await wb('navigate', { url: 'https://mp.weixin.qq.com/', newTab: true, group_title: 'stylewx 探针' })
await sleep(4000)
const home = await evalJson(`(() => { const m = location.href.match(/token=(\\d+)/); return JSON.stringify({ token: m ? m[1] : null }); })()`)
if (!home?.token) { console.error('✖  未登录'); process.exit(1) }
await wb('navigate', { url: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media_appmsg_edit_v2&action=edit&isNew=1&type=10&createType=0&token=${home.token}&lang=zh_CN`.replace('media_appmsg', 'media/appmsg') })
await sleep(8000)
await evalJson(`(() => { document.querySelectorAll('a,button,div').forEach(b => { if (/^(我知道了|知道了)$/.test((b.innerText||'').trim())) b.click(); }); return JSON.stringify({ok:1}); })()`)
// 等工具栏与正文编辑器就绪（等不到就报错，别静默空跑）
{
  let ready = null
  for (let i = 0; i < 12; i++) {
    ready = await evalJson(`(() => {
      const ed = document.querySelector('.rich_media_content .ProseMirror');
      const tool = document.querySelector('li.tpl_item.jsInsertIcon, [class*=jsInsertIcon]');
      return JSON.stringify({ editor: !!ed, toolbar: !!tool, tools: document.querySelectorAll('li.tpl_item').length });
    })()`)
    if (ready?.editor && ready?.toolbar) break
    await sleep(2000)
  }
  log('ready', JSON.stringify(ready))
  if (!ready?.editor) { console.error('✖  正文编辑器未就绪'); process.exit(1) }
}

async function resetBody() {
  await evalJson(`(() => {
    const b = document.querySelector('.rich_media_content .ProseMirror');
    b.focus();
    const sel = window.getSelection(); sel.removeAllRanges();
    const r = document.createRange(); r.selectNodeContents(b); sel.addRange(r);
    document.execCommand('delete');
    document.execCommand('insertHTML', false, '<section><span leaf="">【探针】锚点。</span></section>');
    return JSON.stringify({ ok: 1 });
  })()`)
  await sleep(1200)
}

for (const id of TARGETS) {
  console.log('\n' + '='.repeat(72))
  log('target', id)
  await resetBody()
  await evalJson(`(() => {
    const b = document.querySelector('.rich_media_content .ProseMirror');
    const last = b.querySelector('section');
    const r = document.createRange(); r.setStartAfter(last); r.collapse(true);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    return JSON.stringify({ ok: 1 });
  })()`)

  const opened = await evalJson(`(() => {
    const el = document.getElementById(${JSON.stringify(id)});
    if (!el) return JSON.stringify({ err: 'id not found' });
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.click();
    return JSON.stringify({ ok: true });
  })()`)
  if (!opened?.ok) { log('open', JSON.stringify(opened)); continue }
  await sleep(4500)

  const dlg = await evalJson(`(() => {
    const d = [...document.querySelectorAll('.weui-desktop-dialog')].filter(x => x.getBoundingClientRect().width > 200).pop();
    if (!d) return JSON.stringify({ err: 'no dialog' });
    const bd = d.querySelector('.weui-desktop-dialog__bd') || d;
    return JSON.stringify({
      cls: d.className,
      inputs: [...bd.querySelectorAll('input,textarea')].map(i => ({ cls: i.className, ph: i.placeholder, type: i.type, maxlength: i.maxLength })),
      buttons: [...d.querySelectorAll('button')].map(b => ({ t: (b.innerText||'').trim(), dis: b.disabled === true || b.className.indexOf('disabled') >= 0 })),
      // 结构里有价值的 class 名（去重、去 weui 通用件）
      classes: [...new Set([...bd.querySelectorAll('*')].map(e => String(e.className)).filter(c => c && !/^weui-desktop-(btn|icon|dialog|form|search|popover|tooltip|tag|loading)/.test(c)))].slice(0, 25),
      text: (bd.innerText || '').replace(/\\n+/g, ' | ').slice(0, 400),
    });
  })()`)
  log('dialog', JSON.stringify(dlg, null, 1))

  // 专用：搜索组件的 4 个关键词输入框
  if (id === 'js_editor_insertsearch') {
    const filled = await evalJson(`(() => {
      const d = [...document.querySelectorAll('.weui-desktop-dialog')].filter(x => x.getBoundingClientRect().width > 200).pop();
      const inputs = [...d.querySelectorAll('input')].filter(i => i.type !== 'hidden' && i.getBoundingClientRect().width > 0);
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const kws = ['焦虑抑制剂', '我的所有还有意义吗', '好好吃饭', 'HIPPIE'];
      inputs.slice(0, kws.length).forEach((input, i) => {
        setter.call(input, kws[i]);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      return JSON.stringify({ ok: true, count: inputs.length });
    })()`)
    log('fill', JSON.stringify(filled))
    await sleep(2500)
    const conf = await evalJson(`(() => {
      const d = [...document.querySelectorAll('.weui-desktop-dialog')].filter(x => x.getBoundingClientRect().width > 200).pop();
      const btn = [...d.querySelectorAll('button')].find(b => (b.innerText||'').trim() === '确定');
      if (!btn) return JSON.stringify({ err: 'no 确定' });
      if (btn.disabled === true || btn.className.indexOf('disabled') >= 0) return JSON.stringify({ err: '确定 仍禁用（关键词没被 Vue 接收）' });
      btn.click();
      return JSON.stringify({ ok: true });
    })()`)
    log('confirm', JSON.stringify(conf))
    await sleep(4000)
  }

  // dump 落地标记
  const landed = await evalJson(`(() => {
    const ed = document.querySelector('.rich_media_content .ProseMirror');
    if (!ed) return JSON.stringify({ err: 'no editor' });
    const custom = [...ed.querySelectorAll('*')]
      .filter(e => /^mp-/.test(e.tagName.toLowerCase()))
      .map(e => ({ tag: e.tagName.toLowerCase(), attrs: [...e.attributes].map(a => a.name + '=' + String(a.value).slice(0, 60)) }));
    return JSON.stringify({
      landedCustomElements: custom,
      iframes: ed.querySelectorAll('iframe').length,
      pluginNodes: ed.querySelectorAll('[data-pluginname]').length,
      // 落地后正文的内联 HTML（看编辑器写出了什么）
      innerHtmlTail: ed.innerHTML.slice(-1200),
      plainText: (ed.innerText || '').replace(/\\s+/g, ' ').slice(0, 240),
    });
  })()`)
  log('landed', JSON.stringify(landed, null, 1))

  // 撤销 + 收尾
  await evalJson(`(() => { const ed = document.querySelector('.rich_media_content .ProseMirror'); ed.focus(); document.execCommand('undo'); return JSON.stringify({ ok: 1 }); })()`)
  await sleep(1200)
  await evalJson(`(() => {
    const d = [...document.querySelectorAll('.weui-desktop-dialog')].filter(x => x.getBoundingClientRect().width > 200).pop();
    if (!d) return JSON.stringify({ ok: true, none: true });
    const c = [...d.querySelectorAll('button')].find(b => /^(取消|关闭)$/.test((b.innerText||'').trim()));
    if (c) c.click();
    return JSON.stringify({ ok: !!c });
  })()`)
  await sleep(1500)
}

await resetBody()
console.log('\n（探针结束，未保存）')
process.exit(0)
