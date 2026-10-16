#!/usr/bin/env node
/**
 * 用 browser-use（交互式 / 探查式驱动）接上**同一个**自动化浏览器。
 *
 * 分工（这是刻意的，见 docs/design/publishing.md §20.11）：
 *   - **确定性流程**（发布、读回体检、探针）走 `lib/bridge.mjs`：Node + Playwright，动作可复现、能进测试。
 *   - **交互式 / 探查**（页面长什么样、按钮在哪、要边看边试）用 browser-use：它是 Python CLI，
 *     每步一次进程往返，塞进几十步的发布流程只会变脆；但「人/agent 在旁边看着点」它更顺手。
 * 两者接的是**同一个浏览器实例**（靠 CDP），所以看得见同一份登录态与同一批标签页。
 *
 * 用法：
 *   node apps/mcp-server/scripts/browser-use.mjs 'print(page_info())'
 *   node apps/mcp-server/scripts/browser-use.mjs <<'PY'
 *   new_tab("https://mp.weixin.qq.com/")
 *   print(page_info())
 *   PY
 *
 * 前置：`uv tool install browser-harness`（或 pipx）。找不到时本脚本会告诉你。
 * 环境变量：BROWSER_HARNESS_BIN / BROWSER_USE_BIN 可指定可执行文件。
 *
 * ⚠️ 上游改过名：2026-10 起安装的是 `browser-harness`（`browser-harness --update -y` 自升），
 * 旧的 `browser-use` shim 会停在老版本不动 —— 所以这里**优先找 browser-harness**。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { cdpBase, chromeVersion, ensureBrowser } from './lib/chrome.mjs'

function findBrowserUse() {
  const home = join(homedir(), '.local', 'bin')
  const cands = [
    process.env.BROWSER_HARNESS_BIN,
    process.env.BROWSER_USE_BIN,
    // 新名优先：旧 browser-use shim 不会跟着升级（实测停在 0.1.9，新名已是 0.1.13）
    join(home, 'browser-harness.exe'),
    join(home, 'browser-harness'),
    join(home, 'browser-use.exe'),
    join(home, 'browser-use'),
  ].filter(Boolean)
  const hit = cands.find((p) => existsSync(p))
  if (!hit) {
    console.error(
      '✖ 找不到 browser-harness。安装：uv tool install browser-harness\n' +
        `   或用 BROWSER_HARNESS_BIN 指到可执行文件（试过：${cands.join(' / ')}）`,
    )
    process.exit(2)
  }
  return hit
}

const bin = findBrowserUse()
try {
  await ensureBrowser({ onStart: (c) => console.error(`[chrome] 启动 ${c}（自动化 profile）`) })
} catch (e) {
  console.error(`✖ ${e.message}`)
  process.exit(2)
}
console.error(`[chrome] ${chromeVersion() ?? '(版本未知)'} · CDP ${cdpBase()} · browser-harness 接上中…`)

const snippet = process.argv.slice(2).join(' ')
const child = spawn(bin, [], {
  env: { ...process.env, BU_CDP_URL: cdpBase() },
  stdio: [snippet ? 'pipe' : 'inherit', 'inherit', 'inherit'],
})
if (snippet) {
  child.stdin.write(snippet)
  child.stdin.end()
}
child.on('close', (code) => process.exit(code ?? 0))
