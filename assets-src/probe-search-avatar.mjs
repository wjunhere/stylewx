/**
 * 探针：草稿页里推荐搜索组件的**实际渲染**（重点看头像有没有加载出来）。
 *
 * 背景：发布脚本原先从 API（getaccountbasicinfo）取昵称/头像，API 需要 IP 白名单，
 * 白名单掉了之后静默失败。现改为优先从登录后台页面取，头像 URL 形式随之从
 * `wx.qlogo.cn/n/<hash>/64`（API）变成 `wx.qlogo.cn/mmopen/<hash>`（页面）。
 * 本探针确认后者在编辑器里能正常显示。
 *
 * 用法：node assets-src/probe-search-avatar.mjs <appmsgid>
 */
import { writeFileSync } from 'node:fs'

const DAEMON = 'http://127.0.0.1:10086/command'
const SESSION = 'wx-verify'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function wb(action, args = {}, { retries = 1 } = {}) {
  for (let i = 0; i <= retries; i += 1) {
    try {
      const res = await fetch(DAEMON, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, args, session: SESSION }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(`${j.error?.code}: ${j.error?.message}`)
      return j.data
    } catch (e) {
      if (i === retries) throw e
      await sleep(1500)
    }
  }
}

async function ev(code) {
  const r = await wb('evaluate', { code })
  return typeof r?.value === 'string' ? JSON.parse(r.value) : r?.value
}

const id = process.argv[2]
if (!id) {
  console.error('用法：node assets-src/probe-search-avatar.mjs <appmsgid>')
  process.exit(2)
}

await wb('navigate', { url: 'https://mp.weixin.qq.com/' })
await sleep(5000)
const home = await ev(`(() => { const i = location.href.indexOf('token='); return JSON.stringify({ token: i >= 0 ? location.href.slice(i + 6).split('&')[0] : null }) })()`)
if (!home?.token) throw new Error('未取到 token')

await wb('navigate', { url: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&type=10&appmsgid=${id}&token=${home.token}&lang=zh_CN` })

// 轮询等编辑器就绪（页面有时会先闪一下「请重新登录」再跳回来）
let ready = null
for (let i = 0; i < 12; i += 1) {
  await sleep(2500)
  ready = await ev(`(() => {
    var ed = document.querySelector('.rich_media_content .ProseMirror')
    return JSON.stringify({ ok: !!ed, hasTag: !!(ed && ed.innerHTML.indexOf('mp-common-search') >= 0), href: location.href.slice(0, 60) })
  })()`)
  if (ready?.ok && ready.hasTag) break
}
console.log('编辑器：', JSON.stringify(ready))

const info = await ev(`(() => {
  var ed = document.querySelector('.rich_media_content .ProseMirror')
  if (!ed) return JSON.stringify({ found: false })
  var tag = ed.querySelector('mp-common-search')
  var out = { tagFound: !!tag }
  if (tag) {
    var r = tag.getBoundingClientRect()
    out.rect = { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }
    out.headimg = tag.getAttribute('data-headimg')
    out.nickname = tag.getAttribute('data-nickname')
    out.innerHtml = tag.innerHTML.slice(0, 400)
    out.renderedImgs = [...tag.querySelectorAll('img')].map(i => ({ src: i.src.slice(0, 80), nat: i.naturalWidth }))
    out.hasShadow = !!tag.shadowRoot
    if (tag.shadowRoot) out.shadowImgs = [...tag.shadowRoot.querySelectorAll('img')].map(i => ({ src: i.src.slice(0, 80), nat: i.naturalWidth }))
    out.bg = getComputedStyle(tag).backgroundImage.slice(0, 90)
  }
  // 页面上任何 qlogo 图片的加载状态
  out.qlogoAnywhere = [...document.images].filter(i => i.src.indexOf('qlogo') >= 0).map(i => ({ src: i.src.slice(0, 80), nat: i.naturalWidth }))
  return JSON.stringify(out)
})()`)
console.log(JSON.stringify(info, null, 2))

const shot = await wb('cdp', { method: 'Page.captureScreenshot', params: { format: 'png' } })
const b64 = shot?.data || shot?.result?.data
if (b64) {
  writeFileSync('.ui-shots/search-avatar.png', Buffer.from(b64, 'base64'))
  console.log('✓ .ui-shots/search-avatar.png')
}
