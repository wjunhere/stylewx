/**
 * 生成文章封面（默认 900×383，微信推荐 2.35:1），输出 JPEG。
 *
 * 配色与字体全部从主题读取 —— 让封面和正文是一套的，别再写死颜色。
 * 主题来源：内置预置主题（@stylewx/theme）→ 用户主题库 ~/.stylewx/themes.json。
 *
 * 用法（从 packages/preview 目录运行，这样 playwright 能解析到）：
 *   node scripts/make-cover.mjs --theme tidal-blue --title 收敛水
 *   node scripts/make-cover.mjs --theme tidal-blue --title 收敛水 --subtitle "一首歌 · 一个朋友" --out cover.jpg
 *
 * 选项：
 *   --theme <name>     主题名（默认 magazine）
 *   --title <text>     封面主标题（必填）
 *   --subtitle <text>  副标题（可选，省略则不渲染）
 *   --out <path>       输出路径（默认 cover.jpg）
 *   --list             列出可用主题名后退出
 */
import { chromium } from 'playwright'
import { writeFileSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getPresetTheme, unquoteFontFamily } from '@stylewx/theme'
import { buildPalette } from '@stylewx/components'

const THEMES_FILE = process.env.STYLEWX_THEMES_PATH ?? join(homedir(), '.stylewx', 'themes.json')

/** 读取用户主题库；文件缺失/损坏时返回空数组，不影响预置主题。 */
function listSavedThemes() {
  try {
    const raw = JSON.parse(readFileSync(THEMES_FILE, 'utf8'))
    return Array.isArray(raw?.themes) ? raw.themes : []
  } catch {
    return []
  }
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) out[key] = true
    else {
      out[key] = next
      i++
    }
  }
  return out
}

/** `#rgb` / `#rrggbb` → `rgba(r,g,b,a)`；解析失败返回原值（宁可颜色不变也别报错）。 */
function withAlpha(hex, alpha) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim())
  if (!m) return hex
  let h = m[1]
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = Number.parseInt(h, 16)
  return `rgba(${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff},${alpha})`
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const args = parseArgs(process.argv.slice(2))

if (args.list) {
  const names = listSavedThemes().map((t) => t.name)
  console.log('用户主题库（%s）：%s', THEMES_FILE, names.length ? names.join(', ') : '(空)')
  process.exit(0)
}

const themeName = typeof args.theme === 'string' ? args.theme : 'magazine'
const theme = getPresetTheme(themeName) ?? listSavedThemes().find((t) => t.name === themeName)
if (!theme) {
  const saved = listSavedThemes().map((t) => t.name)
  console.error(`找不到主题「${themeName}」。`)
  console.error(`用户主题库：${saved.length ? saved.join(', ') : '(空)'}`)
  console.error('预置主题可用 --list 之外的名字请查 packages/theme/src/presets.ts。')
  process.exit(1)
}

if (typeof args.title !== 'string' || !args.title.trim()) {
  console.error('缺少 --title。例：node scripts/make-cover.mjs --theme tidal-blue --title 收敛水')
  process.exit(1)
}

const palette = buildPalette(theme.tokens)
const title = args.title.trim()
const subtitle = typeof args.subtitle === 'string' ? args.subtitle.trim() : ''

// 深色端 → 主色：两端都在 primary 附近，onPrimary 作为文字色在两端都可读。
const bg = `linear-gradient(160deg, ${palette.primaryStrong} 0%, ${palette.primary} 100%)`
// 装饰条与副标题用 onPrimary 加透明度 —— 亮主题/暗主题都自动有对比度。
const accent = withAlpha(palette.onPrimary, 0.55)
const subtitleColor = withAlpha(palette.onPrimary, 0.78)

// 字体名必须去引号：magazine 等主题写的是 Georgia, "STZhongsong", ...，
// 带双引号直接插进 style="…" 会提前闭合属性，后面的 padding / 居中全部丢失。
// （跟微信端那个 font-family 引号 bug 是同一类问题，只是换了个载体。）
const fontFamily = unquoteFontFamily(theme.tokens.fontFamily)

const cover = `<div style="width:900px;height:383px;box-sizing:border-box;background:${bg};color:${palette.onPrimary};font-family:${fontFamily};padding:58px 76px;display:flex;flex-direction:column;justify-content:center">
  <div style="width:46px;height:4px;background:${accent};margin-bottom:28px"></div>
  <div style="font-size:68px;font-weight:700;letter-spacing:0.16em;line-height:1.2">${esc(title)}</div>
  ${subtitle ? `<div style="font-size:22px;letter-spacing:0.26em;margin-top:20px;color:${subtitleColor}">${esc(subtitle)}</div>` : ''}
</div>`

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 900, height: 383 }, deviceScaleFactor: 1 })
await page.setContent(`<html><head><meta charset="utf-8"></head><body style="margin:0">${cover}</body></html>`, {
  waitUntil: 'networkidle',
})
const jpg = await page.screenshot({ type: 'jpeg', quality: 90 })
await browser.close()

const out = typeof args.out === 'string' ? args.out : 'cover.jpg'
writeFileSync(out, jpg)
console.log(`封面已生成: ${out} (${jpg.length} 字节)`)
console.log(`  主题 ${themeName} → primary ${palette.primary} / Strong ${palette.primaryStrong} / Soft ${palette.primarySoft} / onPrimary ${palette.onPrimary}`)
process.exit(0)
