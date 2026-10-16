/**
 * 微信后台自动化的**唯一客户端**：Playwright over CDP，驱动「自动化 Chrome」。
 *
 * 2026-10-16 把 kimi-webbridge（闭源 daemon + 浏览器扩展）换成了这条路，原因与实测见
 * docs/design/publishing.md §20：能力面等价或更强（上传本地文件不再需要扩展权限，
 * 原生文件选择器能用 filechooser 事件接住，点击按 role/name 精确匹配），
 * 而且它是**可审计、可替换**的 —— Playwright 本来就在仓库依赖里。
 *
 * 边界（别越过）：
 *   - ✅ 本模块管：会话（用哪个标签页）、导航、页面内 evaluate、精确点击、文件上传、
 *      CDP 透传、ALLOW/DENY 双名单
 *   - ❌ 不管：具体页面流程（找编辑器、注入正文、传封面…）、微信 API、登录态判断
 *   - ⛔ 不许被 `packages` 或 `apps` 的 `src` 引用：那是发布产物，浏览器通道不进产品
 *
 * 两条安全规矩（沿用旧通道的教训）：
 *   - 点击**只走精确匹配**（role+name 或文本全等），绝不模糊匹配、绝不点坐标猜位置
 *   - `clickByLabel` 内置 ALLOW / DENY 双名单：命中危险名单立即抛错
 *
 * 用法：`useSession('wx-publish')` 设会话 → `wb('navigate', {...})` / `evalJson(code)` /
 * `clickByLabel('保存为草稿', { required: true })`。
 */
import { chromium } from 'playwright'
import { cdpBase, ensureBrowser, chromeVersion, browserUseHint, browserUseEnv, profileDir, CDP_PORT } from './chrome.mjs'
import { attachCdp } from './cdp-socket.mjs'

export { ensureBrowser, chromeVersion, browserUseHint, browserUseEnv, profileDir, CDP_PORT, cdpBase }

let browser = null
let context = null
let session = process.env.WB_SESSION ?? 'stylewx'
/** session → Playwright Page（会话就是「这一批操作用哪个标签页」） */
const sessionPages = new Map()
/** Page → CDP session（evaluate / cdp 透传用） */
const cdpSessions = new WeakMap()

/** 设定本进程的会话名（每个脚本一次进程只用一个会话）。 */
export function useSession(name) {
  if (!name) throw new Error('useSession 需要会话名')
  session = name
  return session
}

export const currentSession = () => session
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 连上自动化浏览器（需要时先把浏览器起来）。 */
async function connect() {
  if (browser?.isConnected()) return context
  await ensureBrowser()
  browser = await chromium.connectOverCDP(cdpBase())
  context = browser.contexts()[0]
  if (!context) throw new Error('连上了 Chrome 但拿不到 context —— 浏览器可能刚被关掉')
  sessionPages.clear()
  return context
}

/** 当前会话的标签页；没有就挑一个已登录后台的，再不行新建。 */
async function pageFor({ create = true } = {}) {
  const ctx = await connect()
  const cached = sessionPages.get(session)
  if (cached && !cached.isClosed()) return cached
  const pages = ctx.pages().filter((p) => !p.isClosed())
  const mp = pages.find((p) => p.url().includes('mp.weixin.qq.com'))
  const picked = mp ?? pages[0] ?? (create ? await ctx.newPage() : null)
  if (!picked) throw new Error('没有可用的标签页')
  sessionPages.set(session, picked)
  return picked
}

/**
 * 拿当前会话的 Playwright Page —— 做本模块没封装的细活时用
 *（如 `page.waitForEvent('filechooser')`、截图、看 iframe 内部）。
 */
export async function currentPage() {
  return pageFor()
}

/**
 * 拿当前页面的**页面级 CDP session**（Playwright 的 CDPSession，可 `.send` 也可 `.on` 听事件）。
 * 用在 `wb()` 没覆盖的地方：截图、`Browser.*`、以及**文件选择器拦截**——
 * 注意 `connectOverCDP` 接上的页面**不会**被 Playwright 自动启用选择器拦截，
 * 要自己发 `Page.setInterceptFileChooserDialog {enabled:true}` 再听 `Page.fileChooserOpened`。
 */
export async function currentCdp() {
  return cdpFor(await pageFor())
}

/** 页面级 CDP 会话（evaluate / 透传用）。 */
async function cdpFor(page) {
  let s = cdpSessions.get(page)
  if (!s) {
    const ctx = await connect()
    s = await ctx.newCDPSession(page)
    cdpSessions.set(page, s)
  }
  return s
}

/**
 * 桥动作。动作名与旧通道（kimi-webbridge）保持一致，便于脚本平滑迁移：
 *   navigate {url,newTab,group_title} · evaluate {code} · snapshot {}
 *   click {selector} · upload {selector,files} · list_tabs {} · close_tab {} · cdp {method,params}
 * `retries` 参数保留但已无意义（Playwright 自带等待与重试策略）。
 */
export async function wb(action, args = {}, _opts = {}) {
  switch (action) {
    case 'navigate': {
      const { url, newTab = false } = args
      if (!url) throw new Error('navigate 需要 url')
      const ctx = await connect()
      const page = newTab ? await ctx.newPage() : await pageFor()
      sessionPages.set(session, page)
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await warnIfThrottled(page)
      return { ok: true, url: page.url() }
    }
    case 'evaluate': {
      const page = await pageFor()
      const cdp = await cdpFor(page)
      const r = await cdp.send('Runtime.evaluate', {
        expression: args.code,
        returnByValue: true,
        awaitPromise: true,
      })
      if (r.exceptionDetails) {
        const msg = r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? '页面内 eval 抛错'
        throw new Error(String(msg).split('\n')[0])
      }
      return { value: r.result?.value }
    }
    case 'snapshot': {
      return { buttons: await snapshotButtons() }
    }
    case 'click': {
      const page = await pageFor()
      const ref = String(args.selector ?? '')
      const loc = locatorFromRef(page, ref)
      await loc.click({ timeout: 8000 })
      return { ok: true, ref }
    }
    case 'upload': {
      const page = await pageFor()
      const files = Array.isArray(args.files) ? args.files : [args.files]
      await page.locator(args.selector).setInputFiles(files)
      return { ok: true, files }
    }
    case 'list_tabs': {
      const ctx = await connect()
      return { tabs: ctx.pages().map((p) => p.url()) }
    }
    case 'close_tab': {
      const page = sessionPages.get(session) ?? (await pageFor({ create: false }))
      sessionPages.delete(session)
      if (page && !page.isClosed()) await page.close()
      return { ok: true }
    }
    case 'cdp': {
      const page = await pageFor()
      const cdp = await cdpFor(page)
      return cdp.send(args.method, args.params ?? {})
    }
    default:
      throw new Error(`未知动作「${action}」（旧通道的动作名见文件头注释）`)
  }
}

/** 命中阈值：窗口被遮挡/最小化时标签页会被节流，编辑器会「点了没反应」，这时必须喊出来。 */
async function warnIfThrottled(page) {
  try {
    const v = await page.evaluate(() => document.visibilityState)
    if (v === 'hidden') {
      console.error(
        '[bridge] ⚠️ 标签页 visibilityState=hidden（窗口被遮挡或最小化）——' +
          '微信编辑器此时会「点击命中却无反应」，请把自动化窗口放到可见处（或稍后重试）',
      )
    }
  } catch {}
}

/**
 * 页面内跑一段 JS 并解析它返回的 JSON 串。
 * 页面里的 eval 一律 `JSON.stringify(...)`；拿到裸串就原样返回（说明这次 evaluate 没按约定返回）。
 */
export async function evalJson(code, opts) {
  const r = await wb('evaluate', { code }, opts)
  const v = r?.value
  if (typeof v !== 'string') return v
  try {
    return JSON.parse(v)
  } catch {
    return v
  }
}

/** **允许**点击的按钮：不在名单里的一律拒绝 —— 宁可脚本停下来，也不乱点。 */
export const ALLOW_LABELS = ['保存为草稿', '保存', '下一步', '确认', '确定', '完成']

/** **危险**按钮：命中立即抛错。相邻位置往往就是退出 / 删除 / 群发。 */
export const DENY_LABELS = ['退出登录', '删除', '取消', '关闭', '群发', '发表', '发送', '重置', '清空']

/** 页面上可点的文本（给 clickByLabel 报错时列候选，也用于人工排查）。 */
export async function snapshotButtons() {
  const page = await pageFor()
  const labels = await page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('a,button,[role="button"],label,li,span,i')) {
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) continue
      const t = (el.innerText || '').trim()
      if (!t || t.length > 24) continue
      out.push(t)
    }
    return [...new Set(out)]
  })
  return labels.map((l) => ({ ref: `text=${l}`, label: l }))
}

/** 按「精确身份」找可点元素：先 role+name，退到文本全等。只用可见元素。 */
export async function findClickable(page, label) {
  for (const role of ['button', 'link', 'tab', 'menuitem', 'checkbox', 'radio', 'option']) {
    const loc = page.getByRole(role, { name: label, exact: true }).filter({ visible: true })
    if ((await loc.count()) > 0) return { ref: `role=${role}[name="${label}"]`, label, locator: loc.first() }
  }
  const byText = page.getByText(label, { exact: true }).filter({ visible: true })
  if ((await byText.count()) > 0) return { ref: `text="${label}"`, label, locator: byText.last() }
  return null
}

/** 把 `wb('click', {selector})` 里的 ref 还原成 locator（只支持本模块生成的两种形态）。 */
function locatorFromRef(page, ref) {
  const role = ref.match(/^role=(\w+)\[name="(.*)"\]$/)
  if (role) return page.getByRole(role[1], { name: role[2], exact: true }).first()
  const text = ref.match(/^text="(.*)"$/)
  if (text) return page.getByText(text[1], { exact: true }).last()
  return page.locator(ref)
}

/**
 * 按标签**精确**点击。返回是否点中；`required` 为真时点不到就抛错。
 * `onLog(hit)` 在点击前调一次（`hit = {ref, label}`），让调用方用自己的日志格式记一笔。
 */
export async function clickByLabel(label, { required = false, onLog, allow = ALLOW_LABELS, deny = DENY_LABELS } = {}) {
  if (deny.includes(label)) throw new Error(`安全中止：拒绝点击「${label}」（危险操作黑名单）`)
  if (!allow.includes(label)) throw new Error(`安全中止：只允许点击 ${allow.join(' / ')}，收到「${label}」`)
  const page = await pageFor()
  const hit = await findClickable(page, label)
  if (!hit) {
    if (required) {
      const labels = (await snapshotButtons()).map((b) => b.label)
      throw new Error(`找不到「${label}」按钮（页面上可点的：${labels.slice(0, 25).join(' / ')}）`)
    }
    return false
  }
  onLog?.(hit)
  await hit.locator.click({ timeout: 10000 })
  return true
}
