#!/usr/bin/env node
/**
 * 公众号草稿发布（浏览器登录态）+ 封面上传 —— 通过 kimi-webbridge 操控你已登录的浏览器。
 *
 * 为什么不用微信 API：`draft/add` 要求调用方 IP 在白名单内，而校园网/多出口 NAT 的出口 IP
 * 会漂移，逐个加白名单追不上。走浏览器后台自己的保存接口则完全不受此限制。
 *
 * 用法：
 *   node apps/mcp-server/scripts/publish-via-browser.mjs <文章.md> --theme <主题名> [选项]
 *   node apps/mcp-server/scripts/publish-via-browser.mjs --html <out.html> --title "标题" [选项]
 *
 * 选项：
 *   --theme <名|JSON文件>   主题（markdown 模式必填；预置名/已保存名/JSON 文件）
 *   --title <标题>          文章标题（缺省取 markdown 首个 H1）
 *   --author <作者>         作者（缺省不改）
 *   --cover <图片路径>      封面图（自动上传到素材库并设为封面）
 *   --session <名>          webbridge 会话名（缺省 wx-publish）
 *   --dry-run               只填写不保存（便于先看效果）
 *   --keep-open             结束后不关闭标签页
 *   --no-cover              跳过封面处理
 *
 * 前置：
 *   1. kimi-webbridge 守护进程运行中（未运行则本脚本会自动启动）
 *   2. 浏览器已登录公众号后台，且 Kimi 扩展已开启「允许访问文件网址」
 *      （edge://extensions → Kimi → 详细信息 → 允许访问文件网址）
 *
 * ⚠️ 安全设计：本脚本**只用 snapshot 返回的元素 ref 点击**，绝不用文本模糊匹配
 * （曾因 `--text "下一步"` 退化匹配误点「退出登录」，导致账号登出）。
 * 并且维护 ALLOW/DENY 双名单，命中 DENY 立即中止。
 */
import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { getPresetTheme, validateTheme, completeThemeBlocks } from '@stylewx/theme'
import { renderPreview } from '@stylewx/service'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DAEMON = process.env.WEBBRIDGE_URL ?? 'http://127.0.0.1:10086/command'
const WEBBRIDGE_BIN = join(homedir(), '.kimi-webbridge', 'bin', 'kimi-webbridge.exe')

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2)
const opts = { session: 'wx-publish', dryRun: false, keepOpen: false, cover: undefined, noCover: false }
const positional = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  const next = () => argv[++i]
  if (a === '--theme') opts.theme = next()
  else if (a === '--html') opts.html = next()
  else if (a === '--title') opts.title = next()
  else if (a === '--author') opts.author = next()
  else if (a === '--cover') opts.cover = next()
  else if (a === '--session') opts.session = next()
  else if (a === '--dry-run') opts.dryRun = true
  else if (a === '--keep-open') opts.keepOpen = true
  else if (a === '--no-cover') opts.noCover = true
  else if (a.startsWith('--')) fail(`未知参数：${a}`)
  else positional.push(a)
}

function fail(msg, code = 1) {
  console.error(`\n✖  ${msg}\n`)
  process.exit(code)
}
const log = (step, msg) => console.log(`[${step}] ${msg}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// kimi-webbridge 客户端
// ---------------------------------------------------------------------------
async function wb(action, args = {}, { retries = 1 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(DAEMON, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, args, session: opts.session }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(`${json.error?.code}: ${json.error?.message}`)
      return json.data
    } catch (e) {
      if (attempt === retries) throw e
      await sleep(1500)
    }
  }
}

/** 在页面里执行 JS 并把 JSON 字符串解析回对象。 */
async function evalJson(code) {
  const r = await wb('evaluate', { code })
  const v = r?.value
  if (typeof v !== 'string') return v
  try {
    return JSON.parse(v)
  } catch {
    return v
  }
}

const cdp = (method, params = {}) => wb('cdp', { method, params })

/** 确保守护进程在跑（失败则尝试自启一次）。 */
async function ensureDaemon() {
  try {
    await wb('list_tabs', {}, { retries: 0 })
    return
  } catch (e) {
    log('bridge', `守护进程未响应（${String(e.message).slice(0, 60)}），尝试启动…`)
    if (!existsSync(WEBBRIDGE_BIN)) fail(`找不到 kimi-webbridge：${WEBBRIDGE_BIN}\n   请先安装 Kimi WebBridge 扩展与 CLI。`)
    spawn(WEBBRIDGE_BIN, ['start'], { detached: true, stdio: 'ignore' }).unref()
    for (let i = 0; i < 10; i++) {
      await sleep(2000)
      try {
        await wb('list_tabs', {}, { retries: 0 })
        log('bridge', '守护进程已启动')
        return
      } catch {}
    }
    fail('守护进程启动失败。请确认浏览器已装 Kimi WebBridge 扩展并处于启用状态。')
  }
}

// ---------------------------------------------------------------------------
// 安全点击：只用 snapshot 的 ref，且过 ALLOW/DENY 双名单
// ---------------------------------------------------------------------------
const ALLOW_LABELS = ['保存为草稿', '保存', '下一步', '确认', '确定', '完成']
const DENY_LABELS = ['退出登录', '删除', '取消', '关闭', '群发', '发表', '发送', '重置', '清空']

/** 从 snapshot 里提取可见按钮的 { ref, label }。 */
async function snapshotButtons() {
  const snap = await wb('snapshot', {})
  const tree = JSON.stringify(snap ?? {})
  const out = []
  // 形如 "@e25" ... "name"/"text": "下一步"
  const re = /"(@e\d+)"([\s\S]{0,400}?)"(?:name|text)"\s*:\s*"([^"]{0,24})"/g
  let m
  while ((m = re.exec(tree))) out.push({ ref: m[1], label: m[3].trim() })
  return out
}

/** 按标签精确点击（ref 定位）。返回是否点中。 */
async function clickByLabel(label, { required = false } = {}) {
  if (DENY_LABELS.includes(label)) fail(`安全中止：拒绝点击「${label}」（危险操作黑名单）`)
  if (!ALLOW_LABELS.includes(label)) fail(`安全中止：只允许点击 ${ALLOW_LABELS.join(' / ')}，收到「${label}」`)
  const btns = await snapshotButtons()
  const hit = btns.find((b) => b.label === label)
  if (!hit) {
    if (required) fail(`找不到「${label}」按钮（快照里的按钮：${[...new Set(btns.map((b) => b.label))].join(' / ')}）`)
    return false
  }
  log('click', `「${label}」ref=${hit.ref}`)
  await wb('click', { selector: hit.ref })
  return true
}

// ---------------------------------------------------------------------------
// 1. 准备正文 HTML
// ---------------------------------------------------------------------------
async function buildHtml() {
  if (opts.html) {
    const p = resolve(opts.html)
    if (!existsSync(p)) fail(`找不到 HTML：${p}`)
    log('html', `读取 ${p}`)
    return { html: readFileSync(p, 'utf8'), title: opts.title }
  }
  const mdPath = positional[0]
  if (!mdPath) fail('用法：node publish-via-browser.mjs <文章.md> --theme <主题名>\n或   --html <out.html> --title "标题"')
  if (!existsSync(mdPath)) fail(`找不到文章：${mdPath}`)
  const markdown = readFileSync(resolve(mdPath), 'utf8')

  const title = opts.title ?? markdown.match(/^#\s+(.+)$/m)?.[1]?.trim()
  if (!title) fail('无法确定标题：markdown 无 H1，请用 --title 指定。')

  let themeInput = opts.theme
  if (!themeInput) {
    const fm = markdown.match(/^---\n([\s\S]*?)\n---/)
    themeInput = fm?.[1]?.match(/^theme:\s*(.+)$/m)?.[1]?.trim()
  }
  if (!themeInput) fail('缺少主题：用 --theme，或在 md 的 front-matter 写 theme。')

  let theme
  if (themeInput.trim().startsWith('{')) theme = JSON.parse(themeInput)
  else if (existsSync(themeInput)) theme = JSON.parse(readFileSync(themeInput, 'utf8'))
  else {
    theme = getPresetTheme(themeInput)
    if (!theme) {
      const savedPath = process.env.STYLEWX_THEMES_PATH ?? join(homedir(), '.stylewx', 'themes.json')
      if (existsSync(savedPath)) {
        const saved = JSON.parse(readFileSync(savedPath, 'utf8'))
        const arr = Array.isArray(saved) ? saved : (saved.themes ?? [])
        theme = arr.find((t) => t.name === themeInput)
      }
    }
    if (!theme) fail(`找不到主题「${themeInput}」。可用 list_themes / list_saved_themes 查看。`)
  }
  if (!theme.blocks || Object.keys(theme.blocks).length < 15) theme = { ...theme, blocks: completeThemeBlocks(theme.blocks) }
  const check = validateTheme(theme)
  if (!check.ok) fail(`主题不合法：${check.issues.map((i) => `${i.path}: ${i.message}`).join('；')}`)

  log('render', `渲染 ${mdPath} · 主题 ${theme.name}`)
  const preview = await renderPreview(markdown, check.theme, { includeScreenshot: false })
  if (!preview.validation.pass) {
    const errs = preview.validation.issues.filter((i) => i.severity === 'error')
    fail(`校验未通过（${errs.length} 个 error）：\n` + errs.map((i) => `   · ${i.message}`).join('\n'))
  }
  const warns = preview.validation.issues.filter((i) => i.severity === 'warning')
  if (warns.length) log('warn', `${warns.length} 个警告（不阻断）：${warns.slice(0, 2).map((w) => w.message).join('；')}`)
  return { html: preview.html, title }
}

// ---------------------------------------------------------------------------
// 2. 主流程
// ---------------------------------------------------------------------------
const { html, title } = await buildHtml()
log('html', `正文 ${html.length} 字符 · 标题「${title}」`)

await ensureDaemon()

// 2.1 打开后台取 token
log('bridge', '打开公众号后台…')
await wb('navigate', { url: 'https://mp.weixin.qq.com/', newTab: true, group_title: 'stylewx 发布' })
await sleep(4000)
const home = await evalJson(`(() => {
  const m = location.href.match(/token=(\\d+)/);
  return JSON.stringify({ token: m ? m[1] : null, loggedIn: /cgi-bin\\/home/.test(location.href), url: location.href.slice(0, 80) });
})()`)
if (!home?.token || !home.loggedIn) {
  fail(`未获取到登录态（${home?.url ?? '未知'}）。\n   请先在浏览器登录公众号后台；若刚被登出，扫码即可。`)
}
log('bridge', `已登录 · token=${home.token}`)

// 2.2 打开新建图文
const editorUrl =
  `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&createType=0` +
  `&token=${home.token}&lang=zh_CN`
log('bridge', '打开编辑器…')
await wb('navigate', { url: editorUrl })
await sleep(6000)

// 关掉可能的提示弹窗（只点「我知道了」这类无副作用的按钮）
await evalJson(`(() => {
  let n = 0;
  document.querySelectorAll('a, button, div').forEach(b => {
    const t = (b.innerText || '').trim();
    if (/^(我知道了|知道了)$/.test(t)) { b.click(); n++; }
  });
  return JSON.stringify({ dismissed: n });
})()`)

// 2.3 写标题 + 正文
const injected = await evalJson(`(() => {
  const pick = () => document.querySelector('.rich_media_content .ProseMirror')
    || document.querySelector('.rich_media_content [contenteditable=true]');
  const body = pick();
  if (!body) return JSON.stringify({ ok: false, err: '找不到正文编辑器' });

  const titleEl = document.querySelector('#title');
  let titleSet = false;
  if (titleEl) {
    titleEl.value = ${JSON.stringify(title)};
    titleEl.dispatchEvent(new Event('input', { bubbles: true }));
    titleEl.dispatchEvent(new Event('change', { bubbles: true }));
    titleSet = true;
  }
  const authorEl = document.querySelector('#author');
  if (authorEl && ${JSON.stringify(opts.author ?? '')}) {
    authorEl.value = ${JSON.stringify(opts.author ?? '')};
    authorEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  body.focus();
  const sel = window.getSelection(); sel.removeAllRanges();
  const range = document.createRange(); range.selectNodeContents(body); sel.addRange(range);
  document.execCommand('delete');
  const inserted = document.execCommand('insertHTML', false, ${JSON.stringify(html)});

  return JSON.stringify({
    ok: true, titleSet, inserted,
    bodyText: (body.innerText || '').slice(0, 50),
    sections: body.querySelectorAll('section').length,
    styled: body.querySelectorAll('[style]').length,
    imgs: body.querySelectorAll('img').length
  });
})()`)
if (!injected?.ok) fail(`正文注入失败：${injected?.err ?? JSON.stringify(injected)}`)
log('write', `标题${injected.titleSet ? '已填' : '未找到'} · ${injected.sections} section / ${injected.styled} 带样式节点 / ${injected.imgs} 图片`)

// 2.4 封面：走「从图片库选择 → 上传文件 → 下一步 → 确认」
async function setCover(coverPath) {
  const abs = resolve(coverPath)
  if (!existsSync(abs)) { log('cover', `⚠️ 封面文件不存在，跳过：${abs}`); return false }

  log('cover', '打开封面选择…')
  // 显示 hover 才出现的封面操作组
  await evalJson(`(() => {
    document.querySelectorAll('.js_cover_opr, .pop-opr__group').forEach(el => {
      el.style.setProperty('display','block','important');
      el.style.setProperty('visibility','visible','important');
      el.style.setProperty('opacity','1','important');
    });
    const a = document.querySelector('.js_imagedialog');
    if (a) a.click();
    return JSON.stringify({ clicked: !!a });
  })()`)
  await sleep(9000)

  // 弹窗里点「上传文件」唤起封面专用 input
  await evalJson(`(() => {
    const dlgs = [...document.querySelectorAll('.weui-desktop-dialog')].filter(d => d.getBoundingClientRect().width > 200);
    const dlg = dlgs[dlgs.length - 1];
    if (!dlg) return JSON.stringify({ err: 'no dialog' });
    const btn = [...dlg.querySelectorAll('a, button, div, span')]
      .filter(e => e.getBoundingClientRect().width > 0 && (e.innerText || '').trim() === '上传文件')[0];
    if (btn) btn.click();
    return JSON.stringify({ clicked: !!btn });
  })()`)
  await sleep(2500)

  // 标记封面专用 input（在可见弹窗内、accept 含 bmp）
  const inputId = await evalJson(`(() => {
    const dlgs = [...document.querySelectorAll('.weui-desktop-dialog')].filter(d => d.getBoundingClientRect().width > 200);
    const dlg = dlgs[dlgs.length - 1];
    if (!dlg) return JSON.stringify({ err: 'no dialog' });
    const inputs = [...dlg.querySelectorAll('input[type=file]')];
    if (!inputs.length) return JSON.stringify({ err: 'no file input in dialog' });
    inputs[0].id = 'swx_cover_input';
    return JSON.stringify({ ok: true, count: inputs.length, accept: (inputs[0].accept || '').slice(0, 40) });
  })()`)
  if (!inputId?.ok) { log('cover', `⚠️ ${inputId?.err ?? '找不到封面输入框'}，跳过封面`); return false }

  // 上传（依赖扩展的「允许访问文件网址」权限）
  log('cover', `上传 ${abs}`)
  const up = await wb('upload', { selector: '#swx_cover_input', files: [abs.replace(/\\/g, '/')] })
  if (!up?.success) { log('cover', `⚠️ 上传失败：${JSON.stringify(up).slice(0, 120)}，跳过封面`); return false }
  await sleep(9000)

  const after = await evalJson(`(() => {
    const dlgs = [...document.querySelectorAll('.weui-desktop-dialog')].filter(d => d.getBoundingClientRect().width > 200);
    const dlg = dlgs[dlgs.length - 1];
    if (!dlg) return JSON.stringify({ dlgGone: true });
    return JSON.stringify({ selected: dlg.querySelectorAll('.weui-desktop-img-picker__item.selected').length, thumbs: dlg.querySelectorAll('.weui-desktop-img-picker__img-thumb').length });
  })()`)
  log('cover', `素材库已选：${after?.selected ?? 0} 张（共 ${after?.thumbs ?? 0}）`)

  // 下一步 → 编辑封面 → 确认（严格按标签）
  await clickByLabel('下一步')
  await sleep(6000)
  await clickByLabel('确认', { required: true })
  await sleep(7000)

  const st = await evalJson(`(() => {
    const bgs = [];
    document.querySelectorAll('[class*=cover_preview], .js_cover_preview, [class*=select-cover]').forEach(e => {
      const bg = getComputedStyle(e).backgroundImage;
      if (bg && bg.includes('mmbiz')) bgs.push(bg.slice(0, 60));
    });
    return JSON.stringify({ coverBg: bgs.slice(0, 2), dlgOpen: [...document.querySelectorAll('.weui-desktop-dialog')].some(d => d.getBoundingClientRect().width > 200) });
  })()`)
  if (st?.coverBg?.length) { log('cover', '✅ 封面已设置'); return true }
  log('cover', '⚠️ 未能确认封面状态，请在后台核对')
  return false
}

if (!opts.noCover && opts.cover) {
  await setCover(opts.cover)
} else if (!opts.noCover) {
  log('cover', '未传 --cover，跳过封面（正文首图不会自动成为封面，可在后台手动设置）')
}

// 2.5 保存草稿
if (opts.dryRun) {
  log('dry-run', '已填写未保存，可在浏览器里检查效果')
} else {
  log('save', '保存为草稿…')
  await clickByLabel('保存为草稿', { required: true })
  await sleep(7000)
  const saved = await evalJson(`(() => {
    const m = location.href.match(/appmsgid=(\\d+)/);
    return JSON.stringify({ appmsgid: m ? m[1] : null, url: location.href.slice(0, 110) });
  })()`)
  if (saved?.appmsgid) {
    log('save', `✅ 草稿已保存 · appmsgid=${saved.appmsgid}`)
    console.log(`\n   后台查看：https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&type=10&appmsgid=${saved.appmsgid}&token=${home.token}&lang=zh_CN\n`)
  } else {
    log('save', '⚠️ 未读到 appmsgid，请在草稿箱确认')
  }
}

if (!opts.keepOpen) await wb('close_tab', {}).catch(() => {})
console.log('完成。')
process.exit(0)
