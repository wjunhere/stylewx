/**
 * check-contrast.mjs —— 核对品牌令牌的实测对比度。
 *
 * 为什么要有这个脚本：品牌色一改，对比度就可能跌破正文线（4.5:1）。
 * 靠肉眼在浅蓝/深蓝之间判断"够不够黑"是不可靠的，所以把 WCAG 相对亮度
 * 计算固化成可复跑的检查，改色后跑一次就知道能不能上。
 *
 * 也顺手输出 sRGB hex，因为文档与设计稿里要写 hex，
 * 手算 oklch→sRGB 极易出错。
 *
 * 用法：
 *   node scripts/brand/check-contrast.mjs          # 核对并打印报告
 *   node scripts/brand/check-contrast.mjs --check  # 有不达标项时退出码 1（CI 用）
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..', '..')

/* ── oklch → sRGB（与 docs 里记录的是同一条公式） ─────────────────── */
function oklchToRgb(L, C, H) {
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  const f = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)
  return [f(r), f(g), f(bl)]
}

const clamp = (v) => Math.min(1, Math.max(0, v))

function luminance(L, C, H) {
  const [r, g, b] = oklchToRgb(L, C, H).map(clamp)
  const lin = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function ratio(a, b) {
  const l1 = luminance(...a)
  const l2 = luminance(...b)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

const hex = (L, C, H) =>
  '#' +
  oklchToRgb(L, C, H)
    .map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0'))
    .join('')

/* ── 令牌：与 editor.html / 品牌定稿保持同值 ───────────────────────── */
const T = {
  bg: [0.984, 0.002, 250],
  surface: [1, 0, 0],
  fg: [0.17, 0.012, 255],
  muted: [0.45, 0.01, 255],
  border: [0.9, 0.005, 255],
  accent: [0.46, 0.19, 262],
  /** 派生：hover / active（L 下压，白字对比只会变高） */
  accentHover: [0.42, 0.19, 262],
  accentActive: [0.395, 0.19, 262],
  /** 派生：10% 混白面后的选中态底色 */
  accentSoftBG: [0.93, 0.045, 262],
  /** 暗底上的提亮版 */
  darkAccent: [0.72, 0.15, 262],
  dark: [0.17, 0.012, 255],
  darkFg: [0.98, 0.002, 250],
  darkMuted: [0.72, 0.008, 255],
  /** 状态三色 · 浅色场合 */
  ok: [0.44, 0.16, 152],
  warn: [0.45, 0.13, 68],
  err: [0.5, 0.19, 25],
  /** 状态三色 · 暗底提亮 */
  okDark: [0.7, 0.15, 152],
  warnDark: [0.72, 0.13, 68],
  errDark: [0.7, 0.18, 25],
}

/* 每条：[用途, 前景, 背景, 门槛] —— 正文线 4.5，大字线 3.0 */
const CHECKS = [
  ['正文 / 标题', 'fg', 'bg', 4.5],
  ['标题压白面', 'fg', 'surface', 4.5],
  ['说明文字 / 图注', 'muted', 'bg', 4.5],
  ['说明文字压白面', 'muted', 'surface', 4.5],
  ['校验蓝文字 / 链接', 'accent', 'bg', 4.5],
  ['校验蓝压白面', 'accent', 'surface', 4.5],
  ['白字 / 校验蓝实底（主按钮）', 'surface', 'accent', 4.5],
  ['白字 / 校验蓝悬停', 'surface', 'accentHover', 4.5],
  ['白字 / 校验蓝按下', 'surface', 'accentActive', 4.5],
  ['校验蓝 / 10% 选中底', 'accent', 'accentSoftBG', 4.5],
  ['墨 / 10% 选中底', 'fg', 'accentSoftBG', 4.5],
  ['校验通过 / 白面', 'ok', 'surface', 4.5],
  ['警告 / 白面', 'warn', 'surface', 4.5],
  ['硬禁止 / 白面', 'err', 'surface', 4.5],
  ['暗底正文', 'darkFg', 'dark', 4.5],
  ['暗底次级文字', 'darkMuted', 'dark', 4.5],
  ['暗底校验蓝（必须提亮）', 'darkAccent', 'dark', 4.5],
  ['暗底成功', 'okDark', 'dark', 4.5],
  ['暗底警告', 'warnDark', 'dark', 4.5],
  ['暗底失败', 'errDark', 'dark', 4.5],
  ['发丝线 / 冷纸（非文字，≥1.2 即算可见）', 'border', 'bg', 1.2],
]

/* ── 顺带核对 editor.html 里的令牌没有被手改 ──────────────────────── */
function tokensFromEditorHtml() {
  const html = readFileSync(resolve(REPO, 'apps/mcp-server/editor.html'), 'utf8')
  const out = {}
  for (const m of html.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*oklch\(([\d.]+)%?\s+([\d.]+)\s+([\d.]+)\)/gm)) {
    out[m[1]] = [Number(m[2]) / 100, Number(m[3]), Number(m[4])]
  }
  return out
}

const editorTokens = tokensFromEditorHtml()
const DRIFT = []
for (const [name, key] of [
  ['--bg', 'bg'],
  ['--surface', 'surface'],
  ['--fg', 'fg'],
  ['--muted', 'muted'],
  ['--border', 'border'],
  ['--accent', 'accent'],
]) {
  const found = editorTokens[name]
  if (!found) {
    DRIFT.push(`${name} 在 editor.html 里没有以 oklch() 形式声明`)
    continue
  }
  const expected = T[key]
  if (found.some((v, i) => Math.abs(v - expected[i]) > 1e-6)) {
    DRIFT.push(`${name}: editor.html=${found.join(' ')} ≠ 品牌定稿=${expected.join(' ')}`)
  }
}

/* ── 报告 ─────────────────────────────────────────────────────────── */
const strict = process.argv.includes('--check')
let fails = 0

console.log('stylewx 品牌令牌 · 对比度实测\n')
console.log('令牌色值（oklch → sRGB）')
for (const [key, v] of Object.entries(T)) {
  const label = key.padEnd(14)
  console.log(`  ${label} oklch(${(v[0] * 100).toFixed(1)}% ${v[1]} ${v[2]})  ${hex(...v)}`)
}

console.log('\n对比度核对（正文线 4.5:1）')
for (const [usage, fgKey, bgKey, min] of CHECKS) {
  const r = ratio(T[fgKey], T[bgKey])
  const ok = r >= min
  if (!ok) fails++
  console.log(`  ${ok ? '✓' : '✗'} ${r.toFixed(2).padStart(5)} : 1  (需 ≥${min})  ${usage}`)
}

if (DRIFT.length) {
  console.log('\n✗ editor.html 令牌漂移：')
  for (const d of DRIFT) console.log('   ' + d)
  fails += DRIFT.length
} else {
  console.log('\n✓ editor.html 的六令牌与品牌定稿一致')
}

console.log(`\n共 ${CHECKS.length} 项检查，${fails} 项未通过`)
if (fails && strict) process.exit(1)
