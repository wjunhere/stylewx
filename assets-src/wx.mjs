/**
 * Kimi WebBridge 的小客户端 + 微信后台操作助手。
 *
 * 为什么不用现成的 publish-via-browser.mjs：那个脚本是"从零新建图文"的完整流程，
 * 而这里的任务是「打开已有草稿 → 改 → 保存」，判断分支不一样。
 * 但它那条通路（浏览器自己的保存接口，写进去的内容编辑器认领）正是我们要的，
 * 所以复用同一个守护进程协议，并且沿用它的安全规矩：
 *   - 只用 evaluate 在页面里精确找元素，不点坐标
 *   - 只点白名单按钮，命中危险词立即中止（历史上模糊匹配点过「退出登录」）
 */
const URL = process.env.WEBBRIDGE_URL ?? 'http://127.0.0.1:10086/command'
const SESSION = process.env.WB_SESSION ?? 'wjpublish'

export async function wb(action, args = {}, opts = {}) {
  const retries = opts.retries ?? 2
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, args, session: opts.session ?? SESSION }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(`${json.error?.code}: ${json.error?.message}`)
      return json.data
    } catch (e) {
      lastErr = e
      if (attempt === retries) throw e
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
  throw lastErr
}

/** 在页面里跑 JS，返回解析后的值。 */
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

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function gotoTab(url, { newTab = false, group = 'stylewx 发布' } = {}) {
  return wb('navigate', { url, newTab, group_title: group })
}
