/** 恢复三篇文章的「最初版本」草稿（排版前那一版）。
 *
 * 背景：这三篇各有一份用户最初的版本，曾被误删（当时按 brand.md 里一条已被推翻的规矩
 * 「同名草稿只留最新一份」执行）。原始 HTML 在删除前已从 draft/get 抓取落盘到
 * articles/hippie/originals/，本脚本用**浏览器通道**把它们重新写回草稿箱。
 *
 * 为什么不能用 cgi-bin/draft/add：写进去的草稿 leaf=0，后台编辑器不认领、人无法修改。
 * 浏览器通道保存的 leaf>0，整篇可编辑。判据见 docs/DESIGN.md §20.7。
 *
 * ⚠️ 纪律：本脚本只「新建」草稿，绝不删除任何已有条目。
 * 用法：node assets-src/restore-originals.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const ORIG_DIR = join(ROOT, 'articles', 'hippie', 'originals')
const COVER_DIR = join(ROOT, 'articles', 'hippie', 'original-covers')
const OUT = join(ROOT, 'docs', 'assets', 'hippie-articles', 'originals')
mkdirSync(OUT, { recursive: true })

const DAEMON = process.env.WEBBRIDGE_URL ?? 'http://127.0.0.1:10086/command'
const SESSION = 'wx-restore'
const DRY = process.argv.includes('--dry-run')
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
async function clickByLabel(label, { required = false } = {}) {
  const snap = await wb('snapshot', {})
  const tree = JSON.stringify(snap ?? {})
  const re = /"(@e\d+)"([\s\S]{0,400}?)"(?:name|text)"\s*:\s*"([^"]{0,24})"/g
  const btns = []
  let m
  while ((m = re.exec(tree))) btns.push({ ref: m[1], label: m[3].trim() })
  const hit = btns.find((b) => b.label === label)
  if (!hit) {
    if (required) throw new Error(`找不到「${label}」（可选：${[...new Set(btns.map((b) => b.label))].join(' / ')}）`)
    return false
  }
  log('click', `「${label}」ref=${hit.ref}`)
  await wb('click', { selector: hit.ref })
  return true
}

// 环境变量（发布后回查用）
const env = {}
const envFile = join(ROOT, '.env')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const items = []
for (const f of readFileSync(join(ORIG_DIR, 'README.txt'), 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) items.push(f)

await wb('navigate', { url: 'https://mp.weixin.qq.com/', newTab: true, group_title: 'stylewx 恢复' })
await sleep(4000)
const home = await evalJson(`(() => { const m = location.href.match(/token=(\\d+)/); return JSON.stringify({ token: m ? m[1] : null, loggedIn: /cgi-bin\\/home/.test(location.href) }); })()`)
if (!home?.token) { console.error('✖  未获取到登录态，请先在浏览器登录公众号后台'); process.exit(1) }
log('bridge', `token=${home.token}`)

const created = []
for (const title of items) {
  const html = readFileSync(join(ORIG_DIR, `${title}.html`), 'utf8')
  const meta = JSON.parse(readFileSync(join(ORIG_DIR, `${title}.meta.json`), 'utf8'))
  const cover = ['jpg', 'png'].map((e) => join(COVER_DIR, `${title}.${e}`)).find(existsSync)

  log('open', `新建图文：${title}`)
  await wb('navigate', {
    url: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&createType=0&token=${home.token}&lang=zh_CN`,
  })
  await sleep(7000)
  await evalJson(`(() => { document.querySelectorAll('a,button,div').forEach(b => { if (/^(我知道了|知道了)$/.test((b.innerText||'').trim())) b.click(); }); return JSON.stringify({ok:1}); })()`)

  const injected = await evalJson(`(() => {
    const body = document.querySelector('.rich_media_content .ProseMirror') || document.querySelector('.rich_media_content [contenteditable=true]');
    if (!body) return JSON.stringify({ ok: false, err: '找不到正文编辑器' });
    const titleEl = document.querySelector('#title');
    if (titleEl) { titleEl.value = ${JSON.stringify(meta.title)}; titleEl.dispatchEvent(new Event('input', { bubbles: true })); titleEl.dispatchEvent(new Event('change', { bubbles: true })); }
    const authorEl = document.querySelector('#author');
    if (authorEl && ${JSON.stringify(meta.author || '')}) { authorEl.value = ${JSON.stringify(meta.author || '')}; authorEl.dispatchEvent(new Event('input', { bubbles: true })); }
    body.focus();
    const sel = window.getSelection(); sel.removeAllRanges();
    const r = document.createRange(); r.selectNodeContents(body); sel.addRange(r);
    document.execCommand('delete');
    document.execCommand('insertHTML', false, ${JSON.stringify(html)});
    return JSON.stringify({ ok: true, sections: body.querySelectorAll('section').length });
  })()`)
  if (!injected?.ok) { log('write', `✖  注入失败：${injected?.err}`); continue }
  log('write', `标题已填 · ${injected.sections} section`)

  if (DRY) { log('dry-run', `${title} 已填写未保存`); continue }

  // 封面（原图）
  if (cover) {
    await evalJson(`(() => {
      document.querySelectorAll('.js_cover_opr, .pop-opr__group').forEach(el => { el.style.setProperty('display','block','important'); el.style.setProperty('visibility','visible','important'); el.style.setProperty('opacity','1','important'); });
      const a = document.querySelector('.js_imagedialog'); if (a) a.click();
      return JSON.stringify({ ok: 1 });
    })()`)
    await sleep(9000)
    await evalJson(`(() => {
      const dlgs = [...document.querySelectorAll('.weui-desktop-dialog')].filter(d => d.getBoundingClientRect().width > 200);
      const dlg = dlgs[dlgs.length - 1];
      if (!dlg) return JSON.stringify({ err: 'no dialog' });
      const btn = [...dlg.querySelectorAll('a,button,div,span')].filter(e => e.getBoundingClientRect().width > 0 && (e.innerText||'').trim() === '上传文件')[0];
      if (btn) btn.click();
      return JSON.stringify({ ok: !!btn });
    })()`)
    await sleep(2500)
    const inputId = await evalJson(`(() => {
      const dlgs = [...document.querySelectorAll('.weui-desktop-dialog')].filter(d => d.getBoundingClientRect().width > 200);
      const dlg = dlgs[dlgs.length - 1];
      if (!dlg) return JSON.stringify({ err: 'no dialog' });
      const inputs = [...dlg.querySelectorAll('input[type=file]')];
      if (!inputs.length) return JSON.stringify({ err: 'no input' });
      inputs[0].id = 'swx_restore_cover';
      return JSON.stringify({ ok: true });
    })()`)
    if (inputId?.ok) {
      const up = await wb('upload', { selector: '#swx_restore_cover', files: [cover.replace(/\\/g, '/')] })
      if (up?.success) {
        await sleep(9000)
        await clickByLabel('下一步')
        await sleep(6000)
        await clickByLabel('确认', { required: true })
        await sleep(7000)
        log('cover', `✅ 封面已设置（${title}）`)
      } else log('cover', `⚠️ 封面上传失败（${title}），跳过`)
    } else log('cover', `⚠️ 找不到封面输入框（${title}），跳过`)
  }

  log('save', `保存 ${title}…`)
  await clickByLabel('保存为草稿', { required: true })
  await sleep(8000)
  const saved = await evalJson(`(() => { const m = location.href.match(/appmsgid=(\\d+)/); return JSON.stringify({ appmsgid: m ? m[1] : null }); })()`)
  if (saved?.appmsgid) { log('save', `✅ ${title} · appmsgid=${saved.appmsgid}`); created.push({ title, appmsgid: saved.appmsgid }) }
  else log('save', `⚠️ ${title} 未读到 appmsgid，请到后台确认`)
}

// 回查：判据是 leaf>0（后台可编辑）
if (created.length && env.WECHAT_APP_ID) {
  const tok = (await (await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.WECHAT_APP_ID}&secret=${env.WECHAT_APP_SECRET}`)).json()).access_token
  const list = await (await fetch(`https://api.weixin.qq.com/cgi-bin/draft/batchget?access_token=${tok}`, { method: 'POST', body: JSON.stringify({ offset: 0, count: 12, no_content: 0 }) })).json()
  console.log('\n恢复后回查（leaf>0 = 后台可编辑）：')
  for (const it of list.item) {
    const a = it.content.news_item[0]
    if (!items.includes(a.title)) continue
    const leaf = (a.content.match(/leaf=/g) || []).length
    console.log(`  ${a.title} | leaf=${leaf} | 作者=${a.author || '(空)'} | thumb=${a.thumb_url ? 'YES' : 'NO'} | ${it.media_id}`)
  }
}
if (!DRY) await wb('close_tab', {}).catch(() => {})
console.log('\n完成。（本脚本只新建草稿，未删除任何条目）')
writeFileSync(join(OUT, 'restore-log.json'), JSON.stringify({ at: new Date().toISOString(), created }, null, 2))
process.exit(0)
