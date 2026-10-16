/**
 * 极小的 CDP 客户端（Node 原生 WebSocket，无依赖）。
 *
 * 为什么在 Playwright 之外还要它：
 *   - 脚本里大量 `evalJson` 片段是**语句式**代码（`location.assign(...)`、`document.execCommand(...)`），
 *     Playwright 的 `page.evaluate('<字符串>')` 按**表达式**求值，遇到这些会语法错误；
 *     走 `Runtime.evaluate` 语义与旧通道（kimi-webbridge）**完全一致**，迁移时脚本不用改一行。
 *   - `Browser.*`（窗口状态）与 `Page.captureScreenshot` 这类命令直接透传更省事。
 *
 * 用法：`const cdp = await attachCdp(wsUrl)` → `cdp.send('Runtime.evaluate', {...})`。
 * 注意：连的是**哪个** ws 决定了你能发哪些命令（page 级 / browser 级）。
 */
export async function attachCdp(wsUrl, { timeoutMs = 15000 } = {}) {
  const ws = new WebSocket(wsUrl)
  let seq = 0
  const pending = new Map()
  const handlers = new Map()

  ws.onmessage = (e) => {
    const m = JSON.parse(typeof e.data === 'string' ? e.data : String(e.data))
    if (m.id) {
      const p = pending.get(m.id)
      if (!p) return
      pending.delete(m.id)
      if (m.error) p.rej(new Error(`${m.error.message}（code ${m.error.code}）`))
      else p.res(m.result)
    } else {
      for (const h of handlers.get(m.method) ?? []) h(m.params)
    }
  }

  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`连 CDP 超时：${wsUrl}`)), timeoutMs)
    ws.onopen = () => {
      clearTimeout(t)
      res()
    }
    ws.onerror = () => {
      clearTimeout(t)
      rej(new Error(`CDP 连不上：${wsUrl}`))
    }
  })

  return {
    send(method, params = {}) {
      const id = ++seq
      return new Promise((res, rej) => {
        pending.set(id, { res, rej })
        ws.send(JSON.stringify({ id, method, params }))
      })
    },
    on(method, fn) {
      handlers.set(method, [...(handlers.get(method) ?? []), fn])
    },
    close() {
      try {
        ws.close()
      } catch {}
    },
  }
}
