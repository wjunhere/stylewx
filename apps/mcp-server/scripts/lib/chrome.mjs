/**
 * 「自动化浏览器」的生命周期：**专用 profile 的 Chrome + CDP 端口**。
 *
 * 为什么是专用 profile（不能是日常那个）：
 * Chrome 136+ 起**拒绝在默认 user-data-dir 上开调试端口**，实测报错原文就是
 *   DevTools remote debugging requires a non-default data directory. Specify this using --user-data-dir.
 * 所以自动化必须有自己的 profile 目录。副作用是好的：爆炸半径只剩这个 profile，
 * 碰不到你日常浏览的 cookie。
 *
 * 为什么不再用 kimi-webbridge（闭源 daemon + 扩展）：
 * 它唯一不可替代的能力是「复用已登录浏览器」，而 CDP 同样能做到，且**上传本地文件**、
 * **原生文件选择器**、**按 role/name 精确点击**都不需要扩展权限。残留差异只有一条：
 * 得用 `--user-data-dir` 起浏览器（多一个前置），换来的是一条可审计、可替换的通道。
 * 设计取舍与实测记录见 docs/design/publishing.md §20。
 *
 * 本模块只管「浏览器在不在、窗口可不可见」；怎么驱动它由 bridge.mjs 负责。
 */
import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { outDir } from '../../../../assets-src/paths.mjs'
import { attachCdp } from './cdp-socket.mjs'

/** CDP 端口。换端口用 STYLEWX_CDP_PORT。 */
export const CDP_PORT = Number(process.env.STYLEWX_CDP_PORT ?? 9222)

/** CDP 的 HTTP 端点（/json/version 等）。 */
export const cdpBase = () => `http://127.0.0.1:${CDP_PORT}`

/** 自动化 profile 目录。可用 STYLEWX_CHROME_PROFILE 指到别处。 */
export function profileDir() {
  if (process.env.STYLEWX_CHROME_PROFILE) return process.env.STYLEWX_CHROME_PROFILE
  try {
    // 与其它本机产物同处工作区 out/（路径规则见 assets-src/paths.mjs）
    return outDir('chrome-profile')
  } catch {
    return join(homedir(), '.stylewx', 'chrome-profile')
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 找 Chrome。CHROME_BIN 可覆盖；找不到就报清楚该装什么。 */
export function findChrome() {
  const cands = [
    process.env.CHROME_BIN,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
  ].filter(Boolean)
  const hit = cands.find((p) => existsSync(p))
  if (!hit) {
    throw new Error(
      `找不到 Chrome（试过：\n   ${cands.join('\n   ')}\n）\n` +
        '   自动化通道要求 Chrome（Edge 的 remote debugging 开关会被自己回滚，见 §20.8）；用 CHROME_BIN 指路。',
    )
  }
  return hit
}

/** 从版本目录名读 Chrome 版本（拿不到返回 null）——通道行为随版本变，日志里值得记一笔。 */
export function chromeVersion() {
  try {
    const dir = join(findChrome(), '..')
    const v = readdirSync(dir).find((f) => /^\d+\.\d+\.\d+\.\d+$/.test(f))
    return v ?? null
  } catch {
    return null
  }
}

/** CDP 端口在不在应答。 */
export async function isBrowserUp() {
  try {
    const r = await fetch(`${cdpBase()}/json/version`, { signal: AbortSignal.timeout(1500) })
    return r.ok
  } catch {
    return false
  }
}

/** 起浏览器的命令行（也用于文档/报错里给用户看）。 */
export function launchArgs() {
  return [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profileDir()}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
  ]
}

/**
 * 确保自动化浏览器在跑：探不到端口就带专用 profile 起一个，轮询到应答为止。
 *
 * ⚠️ 起完还要**把窗口从最小化恢复**：Chrome 对最小化/被其它窗口遮挡的窗口会把标签页判成
 * `visibilityState: 'hidden'` 并节流，症状是「点击命中正确元素却什么都不发生」——
 * 2026-10-16 实测（当时误以为是页面坏了，查了很久）。`onWarn` 用来把这类情况喊出来。
 */
export async function ensureBrowser({ attempts = 15, waitMs = 2000, onStart, onWarn } = {}) {
  if (await isBrowserUp()) {
    await restoreWindow({ onWarn })
    return { started: false }
  }

  const bin = findChrome()
  onStart?.(bin)
  spawn(bin, launchArgs(), { detached: true, stdio: 'ignore', windowsHide: false }).unref()

  for (let i = 0; i < attempts; i += 1) {
    await sleep(waitMs)
    if (await isBrowserUp()) {
      await restoreWindow({ onWarn })
      return { started: true }
    }
  }
  throw new Error(
    `${(attempts * waitMs) / 1000}s 内起不来 CDP 端口 ${cdpBase()}。\n` +
      `   请手动起一次看报错：\n   "${bin}" ${launchArgs().join(' ')}`,
  )
}

/**
 * 窗口若是最小化就恢复。CDP 的窗口状态是「按 target 查窗口」，所以先拿一个 page target。
 * 失败不致命（只是可靠性变差），所以只告警。
 */
export async function restoreWindow({ onWarn } = {}) {
  try {
    const list = await (await fetch(`${cdpBase()}/json/list`, { signal: AbortSignal.timeout(2000) })).json()
    const target = list.find((t) => t.type === 'page')
    if (!target) return
    const ver = await (await fetch(`${cdpBase()}/json/version`)).json()
    const cdp = await attachCdp(ver.webSocketDebuggerUrl)
    const { windowId, bounds } = await cdp.send('Browser.getWindowForTarget', { targetId: target.id })
    if (bounds.windowState === 'minimized') {
      onWarn?.(`窗口是最小化的，已恢复（最小化会让标签页被节流，编辑器会「点了没反应」）`)
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } })
    }
    cdp.close()
  } catch (e) {
    onWarn?.(`窗口状态没查成（不影响继续，但若出现「点了没反应」请先看窗口是否被遮挡）：${String(e.message).slice(0, 80)}`)
  }
}

/**
 * 给交互式工具用的环境变量：browser-use / Playwright / cua-driver 都接同一层。
 * 交互式（人在旁边看着、LLM 驱动）用 browser-use 更舒服；确定性流程用 bridge.mjs。
 */
export function browserUseEnv() {
  return { BU_CDP_URL: cdpBase() }
}

/** 生成「怎么让交互式工具接上这个浏览器」的一段提示（报错/文档里复用）。 */
export function browserUseHint() {
  return [
    `# 交互式驱动同一个浏览器（browser-use）：`,
    `#   BU_CDP_URL=${cdpBase()} browser-use <<'PY'`,
    `#   print(page_info())`,
    `#   PY`,
  ].join('\n')
}

/** 供 CLI 用：只确保浏览器在跑，然后退出。 */
export async function ensureBrowserCli() {
  const r = await ensureBrowser({ onStart: (bin) => console.error(`[chrome] 启动 ${bin}（profile ${profileDir()}）`) })
  console.error(`[chrome] ${chromeVersion() ?? '(版本未知)'} · CDP ${cdpBase()} · ${r.started ? '本次启动' : '已在运行'}`)
  // 顺手告警：当前页面若被节流，后面的自动化会「点了没反应」
  const list = await (await fetch(`${cdpBase()}/json/list`)).json()
  const page = list.find((t) => t.type === 'page')
  if (page?.url?.startsWith('http')) {
    const cdp = await attachCdp(page.webSocketDebuggerUrl)
    const r2 = await cdp.send('Runtime.evaluate', { expression: 'document.visibilityState', returnByValue: true })
    if (r2.result?.value === 'hidden') {
      console.error('[chrome] ⚠️ 当前标签页 visibilityState=hidden（窗口被遮挡或最小化）——微信编辑器此时会「点了没反应」，请把窗口放到可见处')
    }
    cdp.close()
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/lib/chrome.mjs')) {
  await ensureBrowserCli()
  console.error(`\n${browserUseHint()}`)
}

/** 环境自检（doctor）：把「装没装、在不在跑、登录没登录」一次说清。 */
export function diagnose() {
  const bin = (() => {
    try {
      return findChrome()
    } catch {
      return null
    }
  })()
  return {
    chrome: bin,
    chromeVersion: chromeVersion(),
    profile: profileDir(),
    profileExists: existsSync(profileDir()),
    cdpPort: CDP_PORT,
  }
}
