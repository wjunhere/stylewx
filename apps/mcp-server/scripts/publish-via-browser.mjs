#!/usr/bin/env node
/**
 * 浏览器登录态发布：把一篇文章写进微信公众号草稿箱，**不需要 API IP 白名单**。
 *
 * 原理：复用你已登录的 Chrome（opencli 桥接），在公众号编辑器页里
 * 用 `execCommand('insertHTML')` 写入富文本正文，再点「保存为草稿」。
 * 走的是后台自己的保存接口，因此不受 `draft/add` 的 IP 白名单限制。
 *
 * 用法：
 *   node apps/mcp-server/scripts/publish-via-browser.mjs <文章.md> [选项]
 *   node apps/mcp-server/scripts/publish-via-browser.mjs --html <out.html> --title "标题" [选项]
 *
 * 选项：
 *   --theme <名|JSON文件>  主题（markdown 模式必填；可用已保存主题名/预置主题名）
 *   --title <标题>         文章标题（缺省取 markdown 首个 H1）
 *   --author <作者>        作者（写入编辑器作者框，缺省不改）
 *   --cover <图片路径>     封面图（用浏览器上传）
 *   --profile <名>         opencli Chrome profile（缺省用默认 profile）
 *   --session <名>         opencli 会话名（缺省 wechat-draft）
 *   --dry-run              只填写不保存（用于检查效果）
 *   --keep-open            结束后不关闭标签页
 *
 * 前置：Chrome 已装 OpenCLI 扩展并登录公众号（opencli doctor 显示 connected）。
 */
import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { getPresetTheme, validateTheme, completeThemeBlocks } from '@stylewx/theme'
import { renderPreview } from '@stylewx/service'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2)
const opts = { session: 'wechat-draft', dryRun: false, keepOpen: false }
const positional = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  const next = () => argv[++i]
  if (a === '--theme') opts.theme = next()
  else if (a === '--html') opts.html = next()
  else if (a === '--title') opts.title = next()
  else if (a === '--author') opts.author = next()
  else if (a === '--cover') opts.cover = next()
  else if (a === '--profile') opts.profile = next()
  else if (a === '--session') opts.session = next()
  else if (a === '--dry-run') opts.dryRun = true
  else if (a === '--keep-open') opts.keepOpen = true
  else if (a.startsWith('--')) fail(`未知参数：${a}`)
  else positional.push(a)
}

function fail(msg, code = 1) {
  console.error(`\n✖  ${msg}\n`)
  process.exit(code)
}

function log(step, msg) {
  console.log(`[${step}] ${msg}`)
}

// ---------------------------------------------------------------------------
// opencli 调用（走 node + args 数组，绕开 shell 转义）
// ---------------------------------------------------------------------------
const OPENCLI_MAIN = [
  join('D:', 'Nodejs', 'node_global', 'node_modules', '@jackwener', 'opencli', 'dist', 'src', 'main.js'),
  join(homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@jackwener', 'opencli', 'dist', 'src', 'main.js'),
  '/usr/local/lib/node_modules/@jackwener/opencli/dist/src/main.js',
].find((p) => existsSync(p))

if (!OPENCLI_MAIN) {
  fail('找不到 opencli。请先 `npm i -g @jackwener/opencli`（本脚本需要它的浏览器桥接能力）。')
}

function opencli(args, { json = true } = {}) {
  return new Promise((resolvePromise, reject) => {
    const full = [...(opts.profile ? ['--profile', opts.profile] : []), ...args]
    const p = spawn(process.execPath, [OPENCLI_MAIN, ...full], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`opencli 退出码 ${code}：${(err || out).trim().slice(0, 400)}`))
      if (!json) return resolvePromise(out)
      // opencli 会混入 "Update available" 之类的噪音，提取其中第一个 JSON 值
      const clean = out.replace(/Update available[\s\S]*$/, '').trim()
      const start = clean.search(/[[{]/)
      if (start < 0) return resolvePromise(clean)
      try {
        return resolvePromise(JSON.parse(clean.slice(start)))
      } catch {
        return resolvePromise(clean)
      }
    })
  })
}

const B = (...args) => ['browser', opts.session, ...args]

/** 在页面里执行 JS 并取回结果（自动 JSON 编解码）。 */
async function evalInPage(fnOrCode) {
  const code = typeof fnOrCode === 'function' ? `(${fnOrCode.toString()})()` : fnOrCode
  const raw = await opencli(B('eval', code), { json: false })
  const s = String(raw).replace(/Update available[\s\S]*$/, '').trim()
  // eval 返回字符串时 opencli 会原样打印；尝试解析成 JSON
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

// ---------------------------------------------------------------------------
// 1. 准备正文 HTML
// ---------------------------------------------------------------------------
async function buildHtml() {
  if (opts.html) {
    const p = resolve(opts.html)
    if (!existsSync(p)) fail(`找不到 HTML 文件：${p}`)
    log('html', `读取 ${p}`)
    return { html: readFileSync(p, 'utf8'), title: opts.title }
  }

  const mdPath = positional[0]
  if (!mdPath) fail('用法：node publish-via-browser.mjs <文章.md> --theme <主题名>\n或   --html <out.html> --title "标题"')
  if (!existsSync(mdPath)) fail(`找不到文章文件：${mdPath}`)
  const markdown = readFileSync(resolve(mdPath), 'utf8')

  // 标题：优先 --title，否则取首个 H1
  const title = opts.title ?? markdown.match(/^#\s+(.+)$/m)?.[1]?.trim()
  if (!title) fail('无法确定标题：markdown 里没有 H1，请用 --title 指定。')

  // 主题：优先 --theme（名字或 JSON 文件），否则读 front-matter 的 theme 键
  let themeInput = opts.theme
  if (!themeInput) {
    const fm = markdown.match(/^---\n([\s\S]*?)\n---/)
    themeInput = fm?.[1]?.match(/^theme:\s*(.+)$/m)?.[1]?.trim()
  }
  if (!themeInput) fail('缺少主题：请用 --theme <已保存主题名|预置主题名|JSON文件>，或在 md 的 front-matter 里写 theme。')

  let theme
  if (themeInput.trim().startsWith('{')) theme = JSON.parse(themeInput)
  else if (existsSync(themeInput)) theme = JSON.parse(readFileSync(themeInput, 'utf8'))
  else {
    theme = getPresetTheme(themeInput)
    if (!theme) {
      // 尝试本地已保存主题库
      const savedPath = process.env.STYLEWX_THEMES_PATH ?? join(homedir(), '.stylewx', 'themes.json')
      if (existsSync(savedPath)) {
        const saved = JSON.parse(readFileSync(savedPath, 'utf8'))
        const arr = Array.isArray(saved) ? saved : (saved.themes ?? [])
        theme = arr.find((t) => t.name === themeInput)
      }
    }
    if (!theme) fail(`找不到主题「${themeInput}」。可用 list_themes / list_saved_themes 查看。`)
  }
  if (!theme.blocks || Object.keys(theme.blocks).length < 15) {
    theme = { ...theme, blocks: completeThemeBlocks(theme.blocks) }
  }
  const check = validateTheme(theme)
  if (!check.ok) fail(`主题不合法：${check.issues.map((i) => `${i.path}: ${i.message}`).join('；')}`)

  log('render', `渲染 ${mdPath} · 主题 ${theme.name}`)
  const preview = await renderPreview(markdown, check.theme, { includeScreenshot: false })
  if (!preview.validation.pass) {
    const errs = preview.validation.issues.filter((i) => i.severity === 'error')
    fail(`校验未通过（${errs.length} 个 error）：\n` + errs.map((i) => `   · ${i.message}`).join('\n'))
  }
  const warns = preview.validation.issues.filter((i) => i.severity === 'warning')
  if (warns.length) log('warn', `${warns.length} 个警告（不阻断发布）：${warns.slice(0, 3).map((w) => w.message).join('；')}`)
  return { html: preview.html, title }
}

// ---------------------------------------------------------------------------
// 2. 浏览器流程
// ---------------------------------------------------------------------------
const { html, title } = await buildHtml()
log('html', `正文 ${html.length} 字符 · 标题「${title}」`)

// 2.1 打开公众号首页取 token（同时确认登录态）
log('browser', '打开公众号后台…')
await opencli(B('open', 'https://mp.weixin.qq.com/', '--window', 'background'))
await new Promise((r) => setTimeout(r, 2500))

const home = await evalInPage(`(() => {
  const m = location.href.match(/token=(\\d+)/);
  return JSON.stringify({ url: location.href, token: m ? m[1] : null, loggedIn: /cgi-bin\\/home/.test(location.href) });
})()`)

if (!home?.token) {
  fail(
    `未能获取登录态（当前 URL: ${home?.url ?? '未知'}）。\n` +
      `   请确认 Chrome 已登录公众号后台，且 opencli 桥接正常：opencli doctor`,
  )
}
log('browser', `已登录 · token=${home.token}`)

// 2.2 打开新建图文编辑器
const editorUrl =
  `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&createType=0` +
  `&token=${home.token}&lang=zh_CN`
log('browser', '打开新建图文编辑器…')
await opencli(B('open', editorUrl, '--window', 'background'))
await new Promise((r) => setTimeout(r, 4000))

// 关掉可能弹出的「切换账号」提示
await evalInPage(`(() => {
  const btns = [...document.querySelectorAll('button, a, .weui-desktop-btn')];
  const b = btns.find(x => /我知道了|知道了/.test((x.innerText||'').trim()));
  if (b) { b.click(); return JSON.stringify({dismissed: true}); }
  return JSON.stringify({dismissed: false});
})()`)

// 2.3 写入标题 + 正文
const injected = await evalInPage(`(() => {
  // 正文编辑器：优先 rich_media_content 里的 ProseMirror（页面上还有一个标题用 ProseMirror）
  const pick = () => {
    const byClass = document.querySelector('.rich_media_content .ProseMirror')
      || document.querySelector('.rich_media_content [contenteditable=true]');
    if (byClass) return byClass;
    const all = [...document.querySelectorAll('.ProseMirror')];
    return all.sort((a, b) => (b.getBoundingClientRect().height || 0) - (a.getBoundingClientRect().height || 0))[0] || null;
  };
  const body = pick();
  if (!body) return JSON.stringify({ ok: false, err: '找不到正文编辑器（.rich_media_content .ProseMirror）' });

  // 标题
  const titleEl = document.querySelector('#title') || document.querySelector('textarea[placeholder*="标题"]');
  let titleSet = false;
  if (titleEl) {
    titleEl.value = ${JSON.stringify(title)};
    titleEl.dispatchEvent(new Event('input', { bubbles: true }));
    titleEl.dispatchEvent(new Event('change', { bubbles: true }));
    titleSet = true;
  }

  // 正文：全选清空后 insertHTML（ProseMirror 会解析进文档模型，内联样式保真）
  body.focus();
  const sel = window.getSelection();
  sel.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(body);
  sel.addRange(range);
  document.execCommand('delete');
  const inserted = document.execCommand('insertHTML', false, ${JSON.stringify(html)});

  return JSON.stringify({
    ok: true, titleSet, inserted,
    bodyText: (body.innerText || '').slice(0, 60),
    sections: body.querySelectorAll('section').length,
    styledNodes: body.querySelectorAll('[style]').length
  });
})()`)

if (!injected?.ok) fail(`注入失败：${injected?.err ?? JSON.stringify(injected)}`)
log('write', `标题${injected.titleSet ? '已填' : '未找到输入框'} · 正文 ${injected.sections} 个 section / ${injected.styledNodes} 个带样式节点`)
log('write', `正文开头：${injected.bodyText}`)

// 2.4 封面（可选）
if (opts.cover) {
  const coverPath = resolve(opts.cover)
  if (!existsSync(coverPath)) fail(`找不到封面图：${coverPath}`)
  log('cover', `上传 ${coverPath}`)

  // 编辑器的图片 input 是隐藏的，直接 upload 会报 fileChooserOpened 超时；
  // 先点封面区把它唤起来（鼠标点击合成事件能让 Chrome 打开原生文件选择器）。
  const opened = await evalInPage(`(() => {
    const zone = document.querySelector('.js_cover_btn_area, .js_cover_preview_new, .select-cover__preview, #js_cover_preview')
      || document.querySelector('[class*=cover][class*=btn]');
    if (zone) { zone.click(); return JSON.stringify({ clicked: true, cls: (zone.className||'').toString().slice(0,50) }); }
    return JSON.stringify({ clicked: false });
  })()`)
  log('cover', opened?.clicked ? `已点开封面区（${opened.cls}）` : '未找到封面区，直接尝试上传')
  await new Promise((r) => setTimeout(r, 1500))

  try {
    await opencli(B('upload', 'input[type=file][accept*="image"]', coverPath))
    await new Promise((r) => setTimeout(r, 6000))
    // 部分流程会弹出裁剪/确认框
    await evalInPage(`(() => {
      const b = [...document.querySelectorAll('button, a, .weui-desktop-btn')]
        .find(x => /^(确定|确认|完成|保存)$/.test((x.innerText||'').trim()) && x.offsetParent !== null);
      if (b) { b.click(); return JSON.stringify({ confirmed: true }); }
      return JSON.stringify({ confirmed: false });
    })()`)
    await new Promise((r) => setTimeout(r, 2500))
    log('cover', '✅ 封面已上传')
  } catch (e) {
    log('cover', `⚠️ 封面自动上传失败（不阻断发布，可在后台手动设置）：${String(e.message).slice(0, 120)}`)
  }
}

// 2.5 保存草稿
if (opts.dryRun) {
  log('dry-run', '已填写但未保存。浏览器里可以直接检查效果。')
} else {
  log('save', '点击「保存为草稿」…')
  const saved = await evalInPage(`(async () => {
    const find = () => [...document.querySelectorAll('button, a, div[role=button]')]
      .find(b => /^保存为草稿$/.test((b.innerText || '').trim()));
    let btn = find();
    if (!btn) return JSON.stringify({ ok: false, err: '找不到「保存为草稿」按钮' });
    btn.click();
    await new Promise(r => setTimeout(r, 5000));
    const m = location.href.match(/appmsgid=(\\d+)/);
    return JSON.stringify({ ok: true, appmsgid: m ? m[1] : null, url: location.href });
  })()`)

  if (!saved?.ok) fail(`保存失败：${saved?.err ?? JSON.stringify(saved)}`)
  if (!saved.appmsgid) {
    log('save', '⚠️ 未从 URL 读到 appmsgid —— 请在后台草稿箱确认这篇是否已保存')
  } else {
    log('save', `✅ 草稿已保存 · appmsgid=${saved.appmsgid}`)
    console.log(`\n   后台查看：https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&type=10&appmsgid=${saved.appmsgid}&token=${home.token}&lang=zh_CN\n`)
  }
}

if (!opts.keepOpen) {
  await opencli(B('close')).catch(() => {})
}
console.log('完成。')
process.exit(0)
