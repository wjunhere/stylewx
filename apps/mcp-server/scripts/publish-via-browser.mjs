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
 *   --video <名称关键词>    在正文占位块处插入已过审的视频号/素材库视频（见下方「视频」节）
 *   --video-max <N>         单篇最多插几个视频（缺省 1）
 *
 * 前置：
 *   1. kimi-webbridge 守护进程运行中（未运行则本脚本会自动启动）
 *   2. 浏览器已登录公众号后台，且 Kimi 扩展已开启「允许访问文件网址」
 *      （edge://extensions → Kimi → 详细信息 → 允许访问文件网址）
 *
 * ⚠️ 安全设计：本脚本**只用 snapshot 返回的元素 ref 点击**，绝不用文本模糊匹配
 * （曾因 `--text "下一步"` 退化匹配误点「退出登录」，导致账号登出）。
 * 并且维护 ALLOW/DENY 双名单，命中 DENY 立即中止。
 *
 * ── 视频（--video）──
 * 微信正文**无法用 API 写入可播放的视频**（实测：`<mpvideo>` 存活但读者端渲染成 0×0，
 * `<iframe class="video_iframe">` 直接被删；见 docs/DESIGN.md §20.10）。唯一可行的是
 * 在本编辑器里点官方「视频」组件。本脚本做的就是这一步：
 *   正文里的 `:::video` 占位块（带 data-swx-video 标记）→ 定位 → 开弹窗 →
 *   在「素材库」里按名称选中 → 确定 → 删掉占位块。
 * 前置硬条件：**该视频必须已过审**。未过审的条目在弹窗里是 disabled
 * （class 带 `more-video__item_disabled`、底部「确定」也是 disabled），此时脚本会明确报错并跳过，
 * 不会硬点。文本匹配只用**精确相等**（`===`），不做包含匹配，避免误选同名视频。
 *
 * ── 音乐（自动，无 flag）──
 * 与视频相反，**音乐能全自动插入**，所以没有 `--music`：脚本见到 `data-swx-music` 占位块就处理。
 * 两条路径，按占位块带的是哪个标记二选一：
 *   ① 有 `data-swx-music-source`（从旧草稿 `draft/get` 抄来的 `<mp-common-clmusic>` 标签）
 *      → 直接 `insertHTML` 复刻。零交互、最稳，**优先用这条**。
 *   ② 只有 `data-swx-music-clue`（歌手 + 歌名）→ 开「音频 → 音乐」弹窗，
 *      填搜索框后**必须显式点放大镜按钮**（只 input 不触发查询，实测等 9s 也不发请求），
 *      再按歌名精确选中 → 「插入」。新曲目用这条。
 * 实测依据与存活验证：`apps/mcp-server/scripts/probe-wechat-music.mjs`
 * （标签经保存后 `draft/get` 读回仍完整，编辑器另补 `mp-style-type data-value=3`）。
 *
 * ── 推荐搜索（自动，无 flag）──
 * 与音乐同族（数据自包含），落地 `<mp-common-search>`；同样见到 `data-swx-search` 就处理。
 * **但昵称与头像必须发布时调 API 现取**（`getaccountbasicinfo`），不能从 Markdown 里读：
 * ① 昵称不一致就是导流到别人的号；② `qlogo.cn` 头像直链会随换头像失效。
 * 实测写朴素昵称即可，微信保存时自己规范化成 `示例&nbsp;青年`。
 * 它是读者端**唯一带点击交互**的组件（外层 `custom_select_card`），应放文末。
 * **实现上是「注入前预替换」（见 substituteSearch）：** 占位块后面紧邻 `hip-end-a`（含内联 svg），
 * 实测所有二次插入策略都会把它塞进 svg 内部，尾图会被破坏。
 * 验证：`probe-wechat-search-widget.mjs --stage synth`、`probe-search-presubstitute.mjs`。
 */
import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { getPresetTheme, validateTheme, completeThemeBlocks } from '@stylewx/theme'
import { renderPreview } from '@stylewx/service'
import { envFilePath, readEnvFile } from '../../../assets-src/paths.mjs'

const DAEMON = process.env.WEBBRIDGE_URL ?? 'http://127.0.0.1:10086/command'
const WEBBRIDGE_BIN = join(homedir(), '.kimi-webbridge', 'bin', 'kimi-webbridge.exe')

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2)
const opts = { session: 'wx-publish', dryRun: false, keepOpen: false, cover: undefined, noCover: false, video: undefined, videoMax: 1 }
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
  else if (a === '--video') opts.video = next()
  else if (a === '--video-max') opts.videoMax = Number(next()) || 1
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
  // 组件级 error 诊断（如搜索词超平台限制）也要在这里拦 —— 不拦就会走到保存才神秘失败。
  // 实测：超长搜索词在保存时才被平台拦下，错误只以浮层出现，URL 里没有 appmsgid，
  // 很容易当成「保存坏了」。所以验证必须发生在不可逆动作之前（铁律⑤）。
  const diagErrors = (preview.diagnostics ?? []).filter((d) => d.level === 'error')
  if (diagErrors.length) {
    fail(
      `组件诊断存在 ${diagErrors.length} 个 error：\n` +
        diagErrors.map((d) => `   · [${d.component}] ${d.message}`).join('\n'),
    )
  }
  const warns = preview.validation.issues.filter((i) => i.severity === 'warning')
  if (warns.length) log('warn', `${warns.length} 个警告（不阻断）：${warns.slice(0, 2).map((w) => w.message).join('；')}`)
  return { html: preview.html, title }
}

// ---------------------------------------------------------------------------
// 2. 主流程
// ---------------------------------------------------------------------------
const built = await buildHtml()
let html = built.html
const title = built.title
log('html', `正文 ${html.length} 字符 · 标题「${title}」`)

// 2.0 推荐搜索：**注入前**预替换（见 substituteSearch 上方注释 —— 二次插入会落进 svg）
// 注：真正的替换在 2.1 取到登录态、后台页面已打开之后做（账号昵称/头像优先从页面读）。
const needsSearch = html.includes('data-swx-search=')

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

// 2.15 推荐搜索预替换 —— 放在这里是因为账号信息优先从**刚打开的后台页面**读，
// 仍早于注入（2.2），所以落点依然由源码决定。
if (needsSearch) {
  log('search', '正文含推荐搜索占位块，取账号信息…')
  // 这里**不 catch**：占位块留在稿子里 = 读者端搜索组件是坏的，而保存又会「成功」。
  // 宁可发布失败让人发现，也不要把坏稿子静默送进草稿箱（铁律⑤）。
  const account = await fetchAccountInfo()
  if (!account?.nickname || !account?.headimg) {
    fail('取不到公众号昵称/头像（页面与 API 都失败），推荐搜索无法替换。\n   留给草稿箱的会是个坏组件，已中止发布。')
  }
  log('search', `账号：${account.nickname}（来源：${account.source}）`)
  const sub = substituteSearch(html, account)
  if (!sub.count) {
    fail('正文有推荐搜索占位块但没解析出关键词，已中止发布（否则草稿里会留个死占位块）。')
  }
  html = sub.html
  log('search', `✅ 已预替换（关键词：${sub.keywords.join(' / ')}）`)
}

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

// 2.3.1 稳定等待：注入后立刻保存会被编辑器清洗掉 SVG（实测 2026-09，正式稿 svg=0 而探针稿存活）。
// 等 ProseMirror 稳定，并【保存前读回 DOM 核对】SVG 数量，不对就重试等一轮。
const expectSvg = (html.match(/<svg/g) || []).length
if (expectSvg > 0) {
  log('stable', `注入内容含 ${expectSvg} 个 SVG，等待编辑器内部处理稳定…`)
  await sleep(30000)
  let svgOk = false
  for (let attempt = 1; attempt <= 3 && !svgOk; attempt++) {
    const dom = await evalJson(`(() => {
      const ed = document.querySelector('.rich_media_content .ProseMirror');
      if (!ed) return JSON.stringify({ err: 'no editor' });
      return JSON.stringify({ svg: ed.querySelectorAll('svg').length, animate: ed.querySelectorAll('animate').length });
    })()`) ?? {}
    if (dom.err) fail('保存前校验失败：' + dom.err)
    if (dom.svg >= expectSvg) {
      svgOk = true
      log('stable', `✅ DOM 稳定：svg=${dom.svg} animate=${dom.animate}`)
    } else {
      log('stable', `⚠️ 第 ${attempt} 次校验 svg=${dom.svg}/${expectSvg}，等 10s 再查…`)
      await sleep(10000)
    }
  }
  if (!svgOk) fail(`SVG 注入后丢失（DOM 中不足 ${expectSvg} 个）。不保存，避免产出缺动画的草稿。`)
}

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

// 2.5 插入视频（可选）
//
// 微信正文不能靠 API 写入可播放视频（docs/DESIGN.md §20.10），只能点这个编辑器自己的
// 「视频」组件。这里复用上面写正文时留下的 `data-swx-video` 占位标记定位插入点。
//
// 安全约束（比封面更严）：
//   - 只在 `.video-select-dialog` 这个具体容器里找东西，不用全页文本匹配
//   - 条目名用**精确相等**比对；找不到就报错，不做模糊匹配（防误选同名视频）
//   - 只点「确定」；「取消」只在出错回滚时点
//   - 条目 disabled（未过审）时**不硬点**，直接报错跳过
async function insertVideos(keyword) {
  const targets = await evalJson(`(() => {
    const ed = document.querySelector('.rich_media_content .ProseMirror');
    if (!ed) return JSON.stringify({ err: '找不到正文编辑器' });
    const hits = Array.from(ed.querySelectorAll('[data-swx-video]'));
    return JSON.stringify({ count: hits.length });
  })()`)
  if (!targets || targets.err) {
    log('video', `⚠️ ${targets?.err ?? '定位失败'}，跳过视频插入`)
    return
  }
  if (!targets.count) {
    log('video', '⚠️ 正文里没有 :::video 占位块，跳过视频插入')
    return
  }

  const limit = Math.min(targets.count, opts.videoMax)
  log('video', `发现 ${targets.count} 个占位块，最多插 ${limit} 个`)

  for (let i = 0; i < limit; i++) {
    // 每次重新定位：插入一个之后 DOM 变了，旧下标不再可靠
    const placed = await evalJson(`(() => {
      const ed = document.querySelector('.rich_media_content .ProseMirror');
      if (!ed) return JSON.stringify({ err: 'no editor' });
      const hit = ed.querySelector('[data-swx-video]');
      if (!hit) return JSON.stringify({ done: true });
      // 把光标放到占位块之后，让视频插在它下面
      const r = document.createRange();
      r.setStartAfter(hit); r.collapse(true);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      hit.scrollIntoView({ block: 'center' });
      return JSON.stringify({ ok: true, title: hit.getAttribute('data-swx-video-title') || '' });
    })()`)
    if (placed?.done) break
    if (!placed?.ok) {
      log('video', `⚠️ 定位占位块失败：${placed?.err ?? '未知'}，跳过`)
      return
    }

    // 打开「视频」选择弹窗（精确选择器，不用文本）
    const opened = await evalJson(`(() => {
      const el = document.querySelector('li.tpl_item.jsInsertIcon.video');
      if (!el) return JSON.stringify({ err: '找不到「视频」工具栏入口' });
      el.click();
      return JSON.stringify({ ok: true });
    })()`)
    if (!opened?.ok) {
      log('video', `⚠️ ${opened?.err}，跳过`)
      return
    }
    await sleep(2500)

    // 在弹窗的素材库列表里按精确名称选中
    const picked = await evalJson(`(() => {
      const dlg = document.querySelector('.video-select-dialog');
      if (!dlg) return JSON.stringify({ err: '视频弹窗没出现' });
      const kw = ${JSON.stringify(keyword)};
      const items = Array.from(dlg.querySelectorAll('.more-video__item'));
      if (!items.length) return JSON.stringify({ err: '素材库里没有视频（先用 upload_video 上传）' });
      // 精确等价比对：取条目第一行文本
      const pick = items.find((el) => (el.innerText || '').split(String.fromCharCode(10))[0].trim() === kw)
        || items.find((el) => (el.innerText || '').split(String.fromCharCode(10))[0].trim().indexOf(kw) === 0);
      if (!pick) {
        return JSON.stringify({ err: '素材库里没有名为「' + kw + '」的视频', names: items.map((e) => (e.innerText || '').split(String.fromCharCode(10))[0].trim()) });
      }
      if (pick.className.indexOf('disabled') >= 0) {
        return JSON.stringify({ err: '视频「' + kw + '」未过审（条目为 disabled），过审后再试', needReview: true });
      }
      pick.click();
      return JSON.stringify({ ok: true, name: (pick.innerText || '').split(String.fromCharCode(10))[0].trim() });
    })()`)
    if (!picked?.ok) {
      if (picked?.names) log('video', `  可选项：${picked.names.join(' / ')}`)
      log('video', `⚠️ ${picked?.err}${picked?.needReview ? '（未过审，跳过）' : '，跳过'}`)
      // 回滚：关掉弹窗，避免半开状态影响保存
      await evalJson(`(() => {
        const dlg = document.querySelector('.video-select-dialog');
        if (!dlg) return JSON.stringify({ ok: true });
        const c = Array.from(dlg.querySelectorAll('button')).find((b) => (b.innerText || '').trim() === '取消');
        if (c) c.click();
        return JSON.stringify({ closed: !!c });
      })()`)
      return
    }
    await sleep(1200)
    log('video', `已选中「${picked.name}」，确认插入…`)

    // 点「确定」并核对计数
    const confirmed = await evalJson(`(() => {
      const dlg = document.querySelector('.video-select-dialog');
      if (!dlg) return JSON.stringify({ err: '弹窗已消失' });
      const ok = Array.from(dlg.querySelectorAll('button')).find((b) => (b.innerText || '').trim() === '确定');
      if (!ok) return JSON.stringify({ err: '找不到「确定」' });
      if (ok.disabled === true || ok.className.indexOf('disabled') >= 0) {
        return JSON.stringify({ err: '「确定」是禁用态（通常因为视频未过审）' });
      }
      ok.click();
      return JSON.stringify({ ok: true });
    })()`)
    if (!confirmed?.ok) {
      log('video', `⚠️ ${confirmed?.err}，跳过`)
      return
    }
    await sleep(2500)

    // 删掉占位块本身（视频已经插进去了，占位块留着会露出假封面）
    const cleaned = await evalJson(`(() => {
      const ed = document.querySelector('.rich_media_content .ProseMirror');
      const hit = ed ? ed.querySelector('[data-swx-video]') : null;
      if (!hit) return JSON.stringify({ removed: false });
      hit.remove();
      return JSON.stringify({ removed: true });
    })()`)
    log('video', `✅ 已插入视频${cleaned?.removed ? '，并移除占位块' : '（占位块未找到，请手动删）'}`)
  }
}

if (opts.video) {
  await insertVideos(opts.video)
} else if (html.includes('data-swx-video')) {
  log('video', '正文含 :::video 占位块但未传 --video，跳过插入（发布后可在编辑器手动插入）')
}

// 2.5b 插入音乐（可选，但**不需要传参**——占位块自带歌名/关键词，见到就插）
//
// 与视频相反，音乐是**能全自动**的，两条路径按占位块上的标记二选一：
//   ① data-swx-music-source 有值（从旧草稿 draft/get 抄来的 <mp-common-clmusic> 标签）→ 直接复刻，零交互
//   ② 只有 data-swx-music-clue → 走「音频→音乐」弹窗搜索并精确点选（需显式点搜索按钮）
// 实测依据：apps/mcp-server/scripts/probe-wechat-music*.mjs（标签保存后 draft/get 读回仍完整）。
async function insertMusic() {
  const targets = await evalJson(`(() => {
    const ed = document.querySelector('.rich_media_content .ProseMirror');
    if (!ed) return JSON.stringify({ err: '找不到正文编辑器' });
    return JSON.stringify({ count: ed.querySelectorAll('[data-swx-music]').length });
  })()`)
  if (!targets || targets.err) {
    log('music', `⚠️ ${targets?.err ?? '定位失败'}，跳过音乐插入`)
    return
  }
  if (!targets.count) return
  log('music', `发现 ${targets.count} 个音乐占位块`)

  const inserted = []
  for (let i = 0; i < targets.count; i++) {
    // 每次重新取第一个占位块。
    // ⚠️ 不能「先 setAttribute 打标记、下一次调用再查」——ProseMirror 会按自己的文档模型重渲染 DOM，
    // 手加的属性会被抹掉（实测：标记设上了，下一次调用就再也查不到）。所以下面的
    // 「定位 → 插入 → 删占位块」必须在**同一次 evaluate 里原子完成**。
    const info = await evalJson(`(() => {
      const ed = document.querySelector('.rich_media_content .ProseMirror');
      const hit = ed ? ed.querySelector('[data-swx-music]') : null;
      if (!hit) return JSON.stringify({ done: true });
      return JSON.stringify({
        song: hit.getAttribute('data-swx-music-song') || '',
        singer: hit.getAttribute('data-swx-music-singer') || '',
        clue: hit.getAttribute('data-swx-music-clue') || '',
        hasSource: !!hit.getAttribute('data-swx-music-source'),
      });
    })()`)
    if (info?.done) break
    if (!info) { log('music', '⚠️ 读取占位块失败，跳过'); break }

    const clue = (info.clue || [info.singer, info.song].filter(Boolean).join(' ')).trim()
    const label = [info.singer, info.song].filter(Boolean).join(' · ') || clue || '(未命名)'

    // ── 路径 ①：有原样标签 → 直接复刻（原子：同一次 evaluate 里取标签 + 插入 + 删占位块）──
    if (info.hasSource) {
      const ok = await evalJson(`(() => {
        const ed = document.querySelector('.rich_media_content .ProseMirror');
        const hit = ed ? ed.querySelector('[data-swx-music]') : null;
        if (!hit) return JSON.stringify({ err: '占位块不见了' });
        const tag = hit.getAttribute('data-swx-music-source') || '';
        if (!tag) return JSON.stringify({ err: 'source 属性为空' });
        const r = document.createRange();
        r.setStartAfter(hit); r.collapse(true);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        document.execCommand('insertHTML', false, '<section>' + tag + '</section>');
        hit.remove();
        return JSON.stringify({ ok: true });
      })()`)
      if (ok?.ok) {
        inserted.push(label)
        log('music', `✅ 已复刻「${label}」（原样标签）`)
      } else {
        log('music', `⚠️ 复刻「${label}」失败：${ok?.err ?? '未知'}`)
      }
      await sleep(1500)
      continue
    }

    // ── 路径 ②：只有关键词 → 走弹窗搜索 ──
    if (!clue) {
      log('music', `⚠️ 占位块既无 source 也无 clue，跳过（${label}）`)
      continue
    }
    // 光标放到占位块之后（音乐插在光标处）。这里也留不住标记，后面靠「第一个未处理的占位块」定位。
    const placed = await evalJson(`(() => {
      const ed = document.querySelector('.rich_media_content .ProseMirror');
      const hit = ed ? ed.querySelector('[data-swx-music]') : null;
      if (!hit) return JSON.stringify({ err: 'no placeholder' });
      const r = document.createRange();
      r.setStartAfter(hit); r.collapse(true);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      return JSON.stringify({ ok: true });
    })()`)
    if (!placed?.ok) { log('music', `⚠️ 定位占位块失败，跳过（${label}）`); continue }

    // 展开「音频」下拉 → 点「音乐」（精确选择器，不用文本模糊匹配）
    const opened = await evalJson(`(() => {
      const btn = document.querySelector('#audio_music_plugin_btn');
      if (!btn) return JSON.stringify({ err: '找不到「音频」入口' });
      btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      btn.click();
      return JSON.stringify({ ok: true });
    })()`)
    if (!opened?.ok) { log('music', `⚠️ ${opened?.err}，跳过（${label}）`); continue }
    await sleep(1800)
    const openedMusic = await evalJson(`(() => {
      const it = [...document.querySelectorAll('.js_insertmusic')].find((e) => e.getBoundingClientRect().width > 0);
      if (!it) return JSON.stringify({ err: '下拉里没有「音乐」项' });
      it.click();
      return JSON.stringify({ ok: true });
    })()`)
    if (!openedMusic?.ok) { log('music', `⚠️ ${openedMusic?.err}，跳过（${label}）`); continue }
    await sleep(4500)

    // 搜索：填输入框 + **必须显式点搜索按钮**（只 input 不触发查询，实测等 9s 也不发请求）
    const searched = await evalJson(`(() => {
      const dlg = [...document.querySelectorAll('.weui-desktop-dialog')].filter((d) => d.getBoundingClientRect().width > 200).pop();
      if (!dlg) return JSON.stringify({ err: '音乐弹窗没出现' });
      const input = dlg.querySelector('input.weui-desktop-form__input');
      if (!input) return JSON.stringify({ err: '找不到搜索框' });
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(clue)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
      const btn = dlg.querySelector('.weui-desktop-search__btn');
      if (!btn) return JSON.stringify({ err: '找不到搜索按钮' });
      btn.click();
      return JSON.stringify({ ok: true });
    })()`)
    if (!searched?.ok) { log('music', `⚠️ 搜索失败：${searched?.err}（${label}）`); continue }
    await sleep(6000)

    // 从结果里按歌名精确选中
    const picked = await evalJson(`(() => {
      const dlg = [...document.querySelectorAll('.weui-desktop-dialog')].filter((d) => d.getBoundingClientRect().width > 200).pop();
      if (!dlg) return JSON.stringify({ err: '弹窗已关闭' });
      const bd = dlg.querySelector('.weui-desktop-dialog__bd') || dlg;
      const song = ${JSON.stringify(info.song)};
      const singer = ${JSON.stringify(info.singer)};
      // 结果项是最内层、宽度足够、文本恰好含「歌名」的可点块；用「没有同类兄弟」挑最内层
      const cands = [...bd.querySelectorAll('div,li,a')].filter((e) => {
        const r = e.getBoundingClientRect();
        if (r.width < 150 || r.height < 20) return false;
        const t = (e.innerText || '').trim();
        return song ? t.includes(song) : t.includes(${JSON.stringify(clue)});
      });
      if (!cands.length) return JSON.stringify({ err: '搜索结果里没有「' + (song || ${JSON.stringify(clue)}) + '」', sample: (bd.innerText || '').replace(/\\n+/g, ' | ').slice(0, 200) });
      // 优先同时含歌名与歌手的；再取最内层（子元素最少）的
      const withSinger = singer ? cands.filter((e) => (e.innerText || '').includes(singer)) : cands;
      const pool = withSinger.length ? withSinger : cands;
      const pick = pool.reduce((a, b) => (a.querySelectorAll('*').length <= b.querySelectorAll('*').length ? a : b));
      pick.click();
      return JSON.stringify({ ok: true, text: (pick.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 60) });
    })()`)
    if (!picked?.ok) {
      log('music', `⚠️ ${picked?.err}`)
      if (picked?.sample) log('music', `  结果样例：${picked.sample}`)
      // 回滚：关掉弹窗，避免半开状态影响保存
      await evalJson(`(() => {
        const dlg = [...document.querySelectorAll('.weui-desktop-dialog')].filter((d) => d.getBoundingClientRect().width > 200).pop();
        if (!dlg) return JSON.stringify({ ok: true });
        const c = [...dlg.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === '取消');
        if (c) c.click();
        return JSON.stringify({ closed: !!c });
      })()`)
      continue
    }
    await sleep(1500)

    // 点「插入」（禁用态说明还没真正选中）
    const confirmed = await evalJson(`(() => {
      const dlg = [...document.querySelectorAll('.weui-desktop-dialog')].filter((d) => d.getBoundingClientRect().width > 200).pop();
      if (!dlg) return JSON.stringify({ err: '弹窗已消失' });
      const ft = dlg.querySelector('.weui-desktop-dialog__ft') || dlg;
      const btn = [...ft.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === '插入');
      if (!btn) return JSON.stringify({ err: '找不到「插入」' });
      if (btn.disabled === true || btn.className.indexOf('disabled') >= 0) return JSON.stringify({ err: '「插入」是禁用态（未选中曲目）' });
      btn.click();
      return JSON.stringify({ ok: true });
    })()`)
    if (!confirmed?.ok) { log('music', `⚠️ ${confirmed?.err}（${label}）`); continue }
    await sleep(3000)

    // 删掉占位块本身（音乐已插进去，占位块留着会露出假提示）
    const cleaned = await evalJson(`(() => {
      const ed = document.querySelector('.rich_media_content .ProseMirror');
      const hit = ed ? ed.querySelector('[data-swx-music]') : null;
      if (!hit) return JSON.stringify({ removed: false });
      hit.remove();
      return JSON.stringify({ removed: true });
    })()`)
    inserted.push(label)
    log('music', `✅ 已插入「${label}」${cleaned?.removed ? '，并移除占位块' : '（占位块未找到，请手动删）'}`)
  }

  if (inserted.length) {
    // 插入后必须核对真的落进 DOM 了（铁律：验证发生在保存之前）
    const verify = await evalJson(`(() => {
      const ed = document.querySelector('.rich_media_content .ProseMirror');
      return JSON.stringify({ clmusic: ed ? ed.querySelectorAll('mp-common-clmusic').length : -1 });
    })()`)
    log('music', `插入后核对：DOM 中 mp-common-clmusic = ${verify?.clmusic}`)
    if (verify?.clmusic !== inserted.length) {
      log('music', `⚠️ 期望 ${inserted.length} 个，实际 ${verify?.clmusic} 个——请保存后在后台核对`)
    }
  }
}

await insertMusic()

// 2.5c 推荐搜索（自动，无需 flag）——**预替换**，不是"注入后再插"
//
// 为什么不是"注入后再插"：占位块后面紧邻 hip-end-a（含内联 <svg>），
// 实测**所有**走 execCommand('insertHTML') 的落点策略都会把搜索块塞进 svg 内部
// （setStartAfter / setStartBefore / selectNode / 插到文档末尾，六种全中），尾图因此被破坏。
// 判据 `mp-common-search`.closest('svg') !== null 即中招。策略矩阵见
// apps/mcp-server/scripts/probe-search-position.mjs。
//
// 正确做法：**注入前**就把占位块替换成真组件标签，整篇一次性注入 ——
// 落点由初次解析决定（源码里本来就在尾图之前），不依赖光标位置。
// 验证：apps/mcp-server/scripts/probe-search-presubstitute.mjs（落点正确 + 读回仍在尾图之前）。
//
// 昵称与头像必须发布时现取：
//   ① 昵称不一致就是导流到别人的号；② qlogo.cn 头像直链会随换头像失效。
// 实测写朴素昵称即可，微信保存时自己规范化成 示例&nbsp;青年。
//
// ⚠️ 取值的**首选来源是已登录的后台页面**，不是 API。
// API（getaccountbasicinfo）要 access_token，而 client_credential 取 token 要求调用方 IP
// 在白名单内 —— 与本模块开头对 `draft/add` 的说明同一条理由，出口 IP 会漂。
// 实测（2026-10-12）：IP 被移出白名单后，`fetchAccountInfo()` 抛错被 catch 静默吞掉，
// 占位块原样进了草稿箱 —— **稿子看着发成功，搜索是坏的**。
// 现在：页面优先 → API 兜底 → 两者都拿不到就**硬失败**（宁可不发，不发坏的）。
//
// 替换时**保留** `data-swx="search"` / `data-swx-props` / `data-swx-src` 包装标记，
// 这样发布后的文章仍能导回 `:::search{...}`（往返回导）。
/** 找一个标签的结尾 `>`（**跳过引号内的 `>`**）。
 *  铁律⑨：`escapeAttr` 不转义 `>`，属性值里会出现裸 `>`，`[^>]*>` 会被提前截断。
 */
function findTagEnd(html, from) {
  let quote = ''
  for (let i = from; i < html.length; i += 1) {
    const ch = html[i]
    if (quote) {
      if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '>') {
      return i
    }
  }
  return -1
}

/**
 * 从 `<section` 的起始下标往后找**配平**的 `</section>` 结束位置。
 *
 * 为什么不能用非贪婪 `[\s\S]*?</section>`：占位块内部有多个嵌套 section，
 * 非贪婪会在**第一个** `</section>` 就停 —— 只替换一半，而且关键词会读不到（静默漏替换）。
 * 用「同深度计数」自己走一遍。
 */
function findMatchingSectionEnd(html, from) {
  let depth = 0
  let i = from
  while (i < html.length) {
    const open = html.indexOf('<section', i)
    const close = html.indexOf('</section>', i)
    if (close !== -1 && (open === -1 || close < open)) {
      depth -= 1
      i = close + '</section>'.length
      if (depth === 0) return i
      continue
    }
    if (open === -1) return -1
    const end = findTagEnd(html, open)
    if (end === -1) return -1
    if (html[end - 1] !== '/') depth += 1
    i = end + 1
  }
  return -1
}

/**
 * 把 `:::search` 占位块替换成真 `<mp-common-search>`（**注入前**做，见上方说明）。
 *
 * ⚠️ 两个坑，都源于「属性值里可能出现 `>`」（铁律⑨）：
 *   1. 用 `[^>]*>` 找开标签会被属性值里的 `>` 截断；
 *   2. 用 `[\s\S]*?</section>` 找结束会被嵌套 section 骗到，提前停下。
 *   两个坑叠加的表现是**静默漏替换**（日志只说「占位块没有关键词」），很难查。
 *   所以这里一律用 findTagEnd / findMatchingSectionEnd 的显式扫描。
 */
function substituteSearch(html, account) {
  const start = html.search(/<section\b[^>]*\bdata-swx-search="1"/)
  if (start === -1) return { html, count: 0, keywords: [] }
  const openEnd = findTagEnd(html, start)
  if (openEnd === -1) return { html, count: 0, keywords: [] }
  const open = html.slice(start, openEnd + 1)
  const end = findMatchingSectionEnd(html, start)
  if (end === -1) return { html, count: 0, keywords: [] }

  const kwsAttr = (open.match(/data-swx-search-keywords="([^"]*)"/) || [])[1] || ''
  const keywords = kwsAttr.split('|').map((s) => s.trim()).filter(Boolean).slice(0, 4)
  if (!keywords.length) return { html, count: 0, keywords: [] }

  // 保住往返回导用的 swx 标记
  const keep = []
  for (const k of ['data-swx', 'data-swx-props', 'data-swx-src']) {
    const v = open.match(new RegExp(k + '="([^"]*)"'))
    if (v) keep.push(k + '="' + v[1] + '"')
  }
  const swxAttrs = keep.length ? ' ' + keep.join(' ') : ''

  const kwJson = JSON.stringify(keywords.map((label) => ({ label })))
  const real =
    '<section' + swxAttrs + '>' +
    '<section class="mp_search_iframe_wrp custom_select_card_wrp" nodeleaf="">' +
    '<mp-common-search class="js_mpsearch appmsg_search_iframe js_uneditable custom_select_card mp_common_widget"' +
    ' data-pluginname="insertsearch"' +
    ' data-nickname="' + account.nickname + '"' +
    ' data-headimg="' + account.headimg + '"' +
    ' data-keywords="' + encodeURIComponent(kwJson) + '"' +
    ' contenteditable="false"></mp-common-search></section></section>'

  // 切片拼接（不用 replace(re, ...)）：替换串里的 `$&` / `$1` 会被当成替换模式
  return { html: html.slice(0, start) + real + html.slice(end), count: 1, keywords }
}

/** 从已登录的后台页面读账号昵称 + 头像（首选来源：与保存同一信任边界，不受 IP 白名单影响）。
 *
 *  选择器依据：实测后台 `.mp_account_box` 里有 `.acount_box-nickname`（号名，朴素文本）
 *  与 `.weui-desktop-account__thumb`（头像，`wx.qlogo.cn` 直链）。多处同值时取第一个
 *  —— 多账号时那是当前激活账号（我们要发布的正是它的草稿）。
 */
async function fetchAccountInfoViaPage() {
  const r = await evalJson(`(() => {
    const pick = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim() : null }
    const nickname = pick('.acount_box-nickname') || pick('.weui-desktop-account__info .acount_box-nickname')
    const img = document.querySelector('.weui-desktop-account__thumb')
    const headimg = img && img.src ? img.src : null
    return JSON.stringify({ nickname, headimg })
  })()`)
  if (!r?.nickname || !r?.headimg) return null
  return { nickname: r.nickname, headimg: r.headimg, source: '页面' }
}

/** 取公众号自身昵称 + 头像（权威来源，用于推荐搜索）。
 *  页面优先，API 兜底；都不行返回 null（调用方必须硬失败，不能静默跳过）。
 */
async function fetchAccountInfo() {
  try {
    const viaPage = await fetchAccountInfoViaPage()
    if (viaPage) return viaPage
  } catch (e) {
    log('search', `⚠️ 页面取账号信息失败（${String(e.message).slice(0, 60)}），退回 API`)
  }
  // .env 在工作区里，不在仓库里（见 assets-src/paths.mjs）
  const envPath = envFilePath()
  if (!existsSync(envPath)) throw new Error(`找不到 .env（缺 WECHAT_APP_ID / WECHAT_APP_SECRET）：${envPath}`)
  const e = readEnvFile(envPath)
  if (!e.WECHAT_APP_ID || !e.WECHAT_APP_SECRET) throw new Error('.env 缺 WECHAT_APP_ID / WECHAT_APP_SECRET')
  const t = await (await fetch('https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' + e.WECHAT_APP_ID + '&secret=' + e.WECHAT_APP_SECRET)).json()
  if (!t.access_token) throw new Error('取 access_token 失败：' + (t.errmsg ?? t.errcode))
  const info = await (await fetch('https://api.weixin.qq.com/cgi-bin/account/getaccountbasicinfo?access_token=' + t.access_token)).json()
  if (!info.nickname || !info.head_image_info?.head_image_url) throw new Error('API 未返回昵称/头像：' + (info.errmsg ?? info.errcode))
  return { nickname: info.nickname, headimg: info.head_image_info.head_image_url, source: 'API' }
}


// 2.6 保存草稿
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
    // 保存失败必须报错退出，不能只说「请确认」就算了 —— 实测搜索词超限时保存会被平台拦下，
    // 错误只以浮层出现、URL 里没有 appmsgid；当成成功会让人以为稿子已进草稿箱。
    const seen = await evalJson(`(() => {
      return JSON.stringify({
        url: location.href.slice(0, 120),
        errors: [...document.querySelectorAll('[class*=error],[class*=Error]')]
          .filter(e => e.getBoundingClientRect().height > 0)
          .map(e => (e.innerText || '').trim()).filter(Boolean).slice(0, 3),
      });
    })()`) ?? {}
    fail(
      '保存未成功（URL 里没有 appmsgid）' +
        (seen.errors?.length ? `\n   平台返回：${seen.errors.join('；')}` : '') +
        `\n   当前地址：${seen.url}\n   草稿**没有**写入。请按上面的提示修正后重试。`,
    )
  }
}

if (!opts.keepOpen) await wb('close_tab', {}).catch(() => {})
console.log('完成。')
process.exit(0)
