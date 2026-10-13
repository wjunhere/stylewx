#!/usr/bin/env node
/**
 * 草稿核验（浏览器通道）：把已保存的草稿重新打开，读回正文 DOM 做体检。
 *
 * 为什么不用 API：`draft/get` 同样要求 IP 白名单，本机出口 IP 不在名单内
 * （errcode 40164）。浏览器后台带着自己的登录态，不受此限制。
 *
 * 用法：
 *   node apps/mcp-server/scripts/verify-drafts.mjs 100001205 100001209
 *
 * 检查项：头尾同字母、SVG/animate 存活、推荐搜索已预替换（关键词在、占位块已消失）、
 *         音乐标签存活、封面已设。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const DAEMON = process.env.WEBBRIDGE_URL ?? 'http://127.0.0.1:10086/command'
const WEBBRIDGE_BIN = join(homedir(), '.kimi-webbridge', 'bin', 'kimi-webbridge.exe')
const SESSION = 'wx-verify'
const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a))
if (!ids.length) {
  console.error('用法：node apps/mcp-server/scripts/verify-drafts.mjs <appmsgid> [appmsgid...]')
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function wb(action, args = {}, { retries = 1 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(DAEMON, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, args, session: SESSION }),
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

const evalJson = async (code) => {
  const r = await wb('evaluate', { code })
  return typeof r?.value === 'string' ? JSON.parse(r.value) : r?.value
}

try {
  await wb('list_tabs', {}, { retries: 0 })
} catch {
  if (!existsSync(WEBBRIDGE_BIN)) {
    console.error(`找不到 kimi-webbridge：${WEBBRIDGE_BIN}`)
    process.exit(2)
  }
  spawn(WEBBRIDGE_BIN, ['start'], { detached: true, stdio: 'ignore' }).unref()
  await sleep(3000)
}

// 取 token（草稿页 URL 必须带 token，否则跳登录）
await wb('navigate', { url: 'https://mp.weixin.qq.com/' })
await sleep(4000)
const home = await evalJson(`(() => {
  const m = location.href.match(/token=(\\d+)/)
  return JSON.stringify({ token: m ? m[1] : null, loggedIn: /cgi-bin\\/home/.test(location.href), url: location.href.slice(0, 80) })
})()`)
if (!home?.token || !home.loggedIn) {
  console.error(`未获取到登录态（${home?.url ?? '未知'}），请先在浏览器登录公众号后台。`)
  process.exit(2)
}

let bad = 0
for (const id of ids) {
  const url = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&type=10&appmsgid=${id}&token=${home.token}&lang=zh_CN`
  await wb('navigate', { url })
  await sleep(6000)

  const r = await evalJson(`(() => {
    const ed = document.querySelector('.rich_media_content .ProseMirror')
    const html = ed ? ed.innerHTML : ''
    const title = (document.querySelector('#title') || {}).value || ''
    const heads = [...html.matchAll(/data-swx="(hip-head-[abc])"/g)].map(m => m[1])
    const ends = [...html.matchAll(/data-swx="(hip-end-[abc])"/g)].map(m => m[1])
    const bgs = []
    document.querySelectorAll('[class*=cover_preview], .js_cover_preview, [class*=select-cover]').forEach(e => {
      const bg = getComputedStyle(e).backgroundImage
      if (bg && bg.includes('mmbiz')) bgs.push(bg.slice(0, 60))
    })
    return JSON.stringify({
      href: location.href,
      foundEditor: !!ed,
      title,
      len: html.length,
      leaf: (html.match(/leaf=/g) || []).length,
      svg: (html.match(/<svg/g) || []).length,
      animate: (html.match(/<animate/g) || []).length,
      heads, ends,
      search: (html.match(/<mp-common-search/g) || []).length,
      searchTag: (html.match(/<mp-common-search[^>]*>/) || [])[0] || null,
      searchBeforeEnd: (() => {
        const i = html.indexOf('<mp-common-search')
        const j = html.indexOf('data-swx="hip-end-')
        return i >= 0 && j >= 0 ? i < j : null
      })(),
      placeholderLeft: (html.match(/data-swx-search=/g) || []).length,
      music: (html.match(/<mp-common-clmusic/g) || []).length,
      cover: bgs[0] || null,
    })
  })()`)

  // 真标签的属性：data-nickname / data-headimg / data-keywords（占位块那套属性已被替掉）
  const tagAttrs = {}
  if (r.searchTag) {
    for (const m of r.searchTag.matchAll(/data-([a-z]+)="([^"]*)"/g)) tagAttrs[m[1]] = m[2]
  }
  let kwList = []
  try {
    kwList = JSON.parse(decodeURIComponent(tagAttrs.keywords || '%5B%5D')).map((x) => x.label)
  } catch { kwList = [] }
  const searchOk = r.search === 1 && r.placeholderLeft === 0 && !!tagAttrs.nickname && !!tagAttrs.headimg && kwList.length > 0 && r.searchBeforeEnd === true
  const same = r.heads.length && r.ends.length && r.heads[0].slice(-1) === r.ends[0].slice(-1)
  const ok = same && r.svg > 0 && r.animate > 0 && searchOk && r.cover
  if (!ok) bad += 1
  console.log(`\n${ok ? '✓' : '✗'} appmsgid=${id}  《${r.title}》${r.foundEditor ? '' : '  ✗ 未找到编辑器（页面未加载？）'}`)
  console.log(`   正文 ${r.len} 字节 · leaf=${r.leaf} · svg=${r.svg} · animate=${r.animate}`)
  console.log(`   头尾 = ${r.heads.join(',') || '-'} + ${r.ends.join(',') || '-'}  ${same ? '✓ 同字母' : '✗ 不同字母'}`)
  console.log(`   推荐搜索：真标签 ${r.search} 个 · 残留占位块 ${r.placeholderLeft} · 在尾图之前 ${r.searchBeforeEnd === true ? '✓' : '✗'}`)
  console.log(`     昵称 "${tagAttrs.nickname || '-'}" · 头像 ${tagAttrs.headimg ? tagAttrs.headimg.slice(0, 46) + '…' : '✗缺'}`)
  console.log(`     关键词 ${kwList.length ? kwList.join(' / ') : '✗空'}  ${searchOk ? '✓' : '✗'}`)
  console.log(`   音乐标签 ${r.music} 个 · 封面 ${r.cover ? '✓ ' + r.cover : '✗ 未设'}`)
}

console.log(`\n${bad === 0 ? `✓ ${ids.length} 篇全部通过` : `✗ ${bad} / ${ids.length} 篇有问题`}`)
process.exit(bad === 0 ? 0 : 1)
