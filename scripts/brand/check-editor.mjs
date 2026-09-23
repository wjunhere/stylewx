/**
 * check-editor.mjs —— 编辑器品牌体系的回归检查。
 *
 * 三件事，都是「肉眼容易看漏、但一定会出问题」的：
 *   1. CSS 花括号配平，且没有引用未定义的 CSS 变量（这个项目里真的有过：--blue 从未定义）；
 *   2. 按钮层级不塌：`.btn.ink` 与 `.btn:disabled` 同权重，少了禁用态覆盖就会出现
 *      「禁用但看起来能点」；发布草稿箱必须是唯一的实底蓝；
 *   3. 没有任何硬编码颜色越过六令牌（--shadow 必须是 none）。
 *
 * 用法：node scripts/brand/check-editor.mjs [--check]
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..', '..')
const FILE = resolve(REPO, 'apps/mcp-server/editor.html')
const html = readFileSync(FILE, 'utf8')
const css = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''

const fails = []
const warn = []
const ok = (m) => console.log('  ✓ ' + m)
const bad = (m) => { fails.push(m); console.log('  ✗ ' + m) }

/* ── 1. 结构 ──────────────────────────────────────────────────────── */
console.log('结构')
if (!css) bad('找不到 <style> 块')
const open = (css.match(/{/g) ?? []).length
const close = (css.match(/}/g) ?? []).length
open === close ? ok(`CSS 花括号配平 (${open})`) : bad(`CSS 花括号不配平：{ ${open} vs } ${close}`)

/* ── 2. 变量定义与引用 ────────────────────────────────────────────── */
console.log('\nCSS 变量')
const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))
// 画布里的 --pc-accent 由运行时按主题注入，不在 CSS 里声明
const RUNTIME = new Set(['--pc-accent'])
const missing = [...used].filter((v) => !defined.has(v) && !RUNTIME.has(v))
missing.length === 0
  ? ok(`全部 ${used.size} 个引用变量都有定义`)
  : bad(`引用了未定义的变量：${missing.join(', ')}（这个项目里真的发生过：--blue）`)

const unused = [...defined].filter((v) => !used.has(v))
if (unused.length) {
  // 这些是刻意保留的：兼容别名（模板/JS 里还引用旧名）+ 暗色材质令牌（待用）
  const alias = unused.filter((v) => /^--(brand|blue|shadow|serif|panel|line|ink|bg|muted|fg|border|accent|ok|warn|err)/.test(v))
  const rest = unused.filter((v) => !alias.includes(v))
  warn.push(`保留但当前未直接引用的变量（兼容别名/预留）：${unused.join(', ')}`)
  if (rest.length) warn.push(`其中需要确认是否可删的：${rest.join(', ')}`)
}

/* ── 3. 令牌存在且是 oklch ───────────────────────────────────────── */
console.log('\n品牌令牌')
const TOKENS = ['--bg', '--surface', '--fg', '--muted', '--border', '--accent']
for (const t of TOKENS) {
  const m = css.match(new RegExp(`${t}\\s*:\\s*([^;]+);`))
  if (!m) { bad(`缺少令牌 ${t}`); continue }
  /oklch\(/.test(m[1])
    ? ok(`${t} = ${m[1].trim()}`)
    : bad(`${t} 不是 oklch：${m[1].trim()}`)
}

/* ── 4. 投影必须为 none ──────────────────────────────────────────── */
console.log('\n分层方式')
for (const v of ['--shadow', '--shadow-lg']) {
  const m = css.match(new RegExp(`${v}\\s*:\\s*([^;]+);`))
  m && m[1].trim() === 'none' ? ok(`${v} = none（改由 1px 描边分层）`) : bad(`${v} 不是 none：${m?.[1]?.trim() ?? '缺失'}`)
}

/* ── 5. 按钮层级 ─────────────────────────────────────────────────── */
console.log('\n按钮层级')
const hasInk = /\.btn\.ink\s*{/.test(css)
const hasInkDisabled = /\.btn\.ink:disabled\s*{/.test(css)
if (!hasInk) bad('缺少 .btn.ink —— 编辑动作需要墨色实底')
else ok('.btn.ink 存在（编辑动作交墨色）')
if (hasInk && !hasInkDisabled) {
  bad('.btn.ink 与 .btn:disabled 同权重，缺 .btn.ink:disabled 会让禁用态仍像实底可点')
} else if (hasInkDisabled) {
  ok('.btn.ink:disabled 已单独声明（禁用态不会被 ink 盖掉）')
}

/* 实底蓝只能出现在发布草稿箱 */
const primaryInHtml = [...html.matchAll(/class="btn primary"[^>]*id="([^"]+)"/g)].map((m) => m[1])
primaryInHtml.length === 1 && primaryInHtml[0] === 'pubBtn'
  ? ok('实底蓝只有一处：发布草稿箱（pubBtn）')
  : bad(`实底蓝按钮应为且仅为 pubBtn，实际：${primaryInHtml.join(', ') || '无'}`)

/* ── 6. 没有硬编码颜色 ───────────────────────────────────────────── */
console.log('\n颜色来源')
const hardcoded = []
for (const m of css.matchAll(/(?:^|[;{\s])(?:background|color|border-color|background-color)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/g)) {
  hardcoded.push(m[0].trim())
}
hardcoded.length === 0
  ? ok('样式块内没有硬编码 hex / rgba 颜色')
  : bad(`样式块内还有硬编码颜色：${hardcoded.slice(0, 6).join(' | ')}`)

/* ── 7. 无障碍与细节 ─────────────────────────────────────────────── */
console.log('\n细节')
const extras = [
  ['滚动条声明', /scrollbar-width|::-webkit-scrollbar/],
  ['选中文字色', /::selection/],
  ['color-scheme', /color-scheme/],
  ['减少动画偏好', /prefers-reduced-motion/],
  ['焦点可见', /:focus-visible/],
]
for (const [name, re] of extras) {
  re.test(css) ? ok(name) : bad(`缺少${name}`)
}

/* ── 8. 编辑器页自包含 ───────────────────────────────────────────── */
console.log('\n自包含')
const externals = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1])
externals.length === 0
  ? ok('没有外部 CDN 依赖（离线可用）')
  : bad(`存在外部依赖：${externals.join(', ')}`)

if (/rel="icon" href="data:image\/svg\+xml/.test(html)) ok('favicon 内联（/editor 是独立页面，不能靠相对路径）')
else bad('favicon 不是内联 data URI')

/* ── 报告 ─────────────────────────────────────────────────────────── */
if (warn.length) {
  console.log('\n提示')
  for (const w of warn) console.log('  · ' + w)
}
console.log(`\n${fails.length === 0 ? '✓ 全部通过' : `✗ ${fails.length} 项未通过`}`)
if (fails.length && process.argv.includes('--check')) process.exit(1)
