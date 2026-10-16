#!/usr/bin/env node
/**
 * 探针：某个上传入口能不能被自动化塞进本地文件。
 *
 * 判据（2026-10-16 实测得出，见 docs/design/publishing.md §20.10）：
 *   ① 页面上**已有** `input[type=file]`（常见于「样式化的按钮 + 压在上面的 file input」）
 *      → 直接 `setInputFiles`，**最省事也最稳**（微信「上传视频」就是这个形态：
 *        可见的 file input 压在按钮上，点按钮反而会超时，因为 input 拦截了 pointer 事件）
 *   ② 点了才动态创建 → 靠 `Page.fileChooserOpened` 事件，看带不带 `backendNodeId`：
 *        带 → 能塞；不带 → File System Access（`showOpenFilePicker`），拦得住但塞不进 → 只能人工
 *   ③ 两者都没有 → 这个入口不是文件选择器型，别指望自动化
 *
 * ⚠️ `connectOverCDP` 接上的页面不会被 Playwright 自动接管选择器，②那条要**自己开拦截**。
 * **只探查**：默认不塞文件、不保存、不发表；`--deliver <文件>` 才真塞（会触发上传）。
 *
 * 用法：
 *   node apps/mcp-server/scripts/probe-file-chooser.mjs --url "<页面>" --text "上传视频"
 *   node apps/mcp-server/scripts/probe-file-chooser.mjs --url "<页面>" --text "上传视频" --deliver ./test.mp4
 *   node apps/mcp-server/scripts/probe-file-chooser.mjs --sel "#someBtn" --accept "video/*"
 */
import { findClickable, currentPage, currentCdp, evalJson, sleep, wb, chromeVersion } from './lib/bridge.mjs'

const argv = process.argv.slice(2)
const argOf = (n) => {
  const i = argv.indexOf(n)
  return i >= 0 ? argv[i + 1] : undefined
}
const TEXT = argOf('--text')
const SEL = argOf('--sel')
const DELIVER = argOf('--deliver')
const URL = argOf('--url')
const ACCEPT = argOf('--accept') ?? 'file'
if (!TEXT && !SEL) {
  console.error('用法：node probe-file-chooser.mjs [--url <先导航到>] --text "上传视频" | --sel "#btn" [--accept "video/*"] [--deliver <文件>]')
  process.exit(2)
}

if (URL) await wb('navigate', { url: URL })
const page = await currentPage()
const cdp = await currentCdp()
console.log(`[page] ${page.url().slice(0, 100)}`)
console.log(`[chrome] ${chromeVersion() ?? '(版本未知)'}`)

const dumpInputs = () =>
  evalJson(
    `JSON.stringify([...document.querySelectorAll('input[type=file]')].map(i => ({
       accept: i.accept || '(empty)', name: i.name || '', visible: i.getBoundingClientRect().width > 0,
       files: i.files ? i.files.length : null,
     })))`,
  )

const before = await dumpInputs()
console.log('[inputs] 点击前:', JSON.stringify(before))

/** 判定①②③并（可选）真塞文件。 */
async function deliver(locatorOrNull) {
  const inputs = await dumpInputs()
  const target = inputs.find((i) => i.accept !== '(empty)' && ACCEPT.split(',').some((a) => i.accept.includes(a.trim()))) ?? inputs[0]

  if (target) {
    console.log(`\n判定：✅ 页面已有 input[type=file]（accept=${target.accept}）→ 直接 setInputFiles 即可，路径①`)
    if (DELIVER) {
      console.log(`[deliver] 塞入 ${DELIVER}（走 setInputFiles，不依赖按钮点击）`)
      await page.locator('input[type=file]').first().setInputFiles(DELIVER)
      await sleep(4000)
      console.log('[deliver] 页面状态:', await evalJson('JSON.stringify(document.body.innerText.replace(/\\s+/g, " ").slice(0, 180))'))
      console.log('[deliver] input.files:', JSON.stringify(await dumpInputs()))
    }
    return
  }

  if (!locatorOrNull) {
    console.log('\n判定：❌ 页面没有 file input（也没给可点的入口）—— 这个入口不是文件选择器型')
    return
  }

  // ② 动态创建：开拦截、点、听事件
  await cdp.send('Page.setInterceptFileChooserDialog', { enabled: true })
  const opened = []
  cdp.on('Page.fileChooserOpened', (e) => opened.push(e))
  try {
    await locatorOrNull.click({ timeout: 6000 })
  } catch (e) {
    const msg = String(e.message).split('\n').find((l) => /intercepts pointer events|Timeout/.test(l)) ?? ''
    console.log(`[click] 点击没成功：${msg.trim().slice(0, 160)}`)
  }
  await sleep(2500)
  const after = await dumpInputs()
  console.log('[inputs] 点击后:', JSON.stringify(after))
  console.log(`[events] fileChooserOpened × ${opened.length}: ${JSON.stringify(opened.slice(0, 2))}`)

  const evt = opened[0]
  const hasNode = typeof evt?.backendNodeId === 'number' && evt.backendNodeId > 0
  if (evt && hasNode) {
    console.log(`\n判定：✅ 点击后动态创建 input（backendNodeId=${evt.backendNodeId}）→ 可自动化，路径②`)
    if (DELIVER) {
      await cdp.send('DOM.setFileInputFiles', { files: [DELIVER], backendNodeId: evt.backendNodeId })
      await sleep(4000)
      console.log('[deliver] 页面状态:', await evalJson('JSON.stringify(document.body.innerText.replace(/\\s+/g, " ").slice(0, 180))'))
    }
  } else if (evt) {
    console.log(`\n判定：⚠️ 事件不带 backendNodeId（mode=${evt.mode}）→ File System Access，塞不进文件，只能人工`)
  } else if (after.length) {
    console.log('\n判定：✅ 点击后页面上出现了 input[type=file] → 用 setInputFiles 即可（路径①）')
  } else {
    console.log('\n判定：❌ 没有 fileChooserOpened、也没出现 file input —— 不是 input 型上传，别指望自动化')
  }
  await cdp.send('Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => {})
}

const preExisting = before.some((i) => i.visible || i.accept !== '(empty)')
if (preExisting && !SEL && !TEXT) {
  await deliver(null)
} else {
  let locator = null
  if (SEL) locator = page.locator(SEL)
  else {
    const hit = await findClickable(page, TEXT)
    if (!hit) {
      console.error(`✖ 找不到文本为「${TEXT}」的可点元素`)
      await deliver(null)
      process.exit(3)
    }
    locator = hit.locator
    console.log(`[target] ${hit.ref}`)
  }
  // 页面本来就有 file input 时不必点按钮（点了会被 input 拦；微信就是这个形态）
  await deliver(preExisting ? null : locator)
}
process.exit(0)
