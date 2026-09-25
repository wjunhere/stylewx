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
// 画布里的 --pc-accent 由运行时按主题注入，不在 CSS 里声明；
// 滑杆的 --fill（已填充段占比）由 JS 在 input 事件里写入同一元素。
const RUNTIME = new Set(['--pc-accent', '--fill'])
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
  // 注意用 (?!-)：--bg 不能匹配到 --bg-soft 这类派生变量
  /oklch\(/.test(m[1])
    ? ok(`${t} = ${m[1].trim()}`)
    : bad(`${t} 不是 oklch：${m[1].trim()}`)
}

/* ── 4. 分层：发丝线 + 柔影，两层都要在 ────────────────────────────
 * 这条检查的方向在「柔结构」改版时反了一次，所以把两边的理由都留在这里：
 *
 *  旧规则（`--shadow:none`）：原来有三层**蓝色**投影叠在浅灰底上互相污染，
 *  边界反而更糊，所以当时把投影全砍了，改由 1px 描边撑边界。
 *
 *  新规则（现在）：投影回来，但换了个性质 —— 不再当「蓝色的强调」用，
 *  而当「环境光」用：中性色相（从 --fg 混出）、极低透明、大半径扩散。
 *  这是柔结构视觉的签名，少了它整个界面就退回「加了描边的扁平」。
 *  发丝线同时保留：线管边界，影管纵深，两者不互相替代。
 *
 * 所以这条现在的意思是「柔影必须存在且必须是多层、且必须从令牌混出来」，
 * 而不是「必须为 none」。硬编码 rgba/hex 的投影仍旧一律拒绝。
 */
console.log('\n分层方式')
for (const v of ['--shadow', '--shadow-lg']) {
  const m = css.match(new RegExp(`${v}\\s*:\\s*([^;]+);`))
  if (!m) { bad(`缺少 ${v}`); continue }
  const val = m[1].trim()
  const layers = val === 'none' ? 0 : val.split(/,(?![^(]*\))/).filter((s) => s.trim()).length
  if (/rgba?\(|#[0-9a-fA-F]{3,8}/.test(val)) {
    bad(`${v} 里用了硬编码颜色（必须从令牌混出）：${val.slice(0, 60)}`)
  } else if (layers < 2) {
    bad(`${v} 只有 ${layers} 层，柔影必须「近影定边界 + 大半径定浮起」至少两层：${val.slice(0, 60)}`)
  } else {
    ok(`${v} = ${layers} 层中性柔影（从令牌混出，无硬编码色）`)
  }
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
// box-shadow 也算：改版后投影回来了，它同样必须是令牌混色，不能写 rgba(0,0,0,.3)
for (const m of css.matchAll(/(?:^|[;{\s])(?:background|color|border-color|background-color|box-shadow|fill|stroke|outline-color)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\()/g)) {
  hardcoded.push(m[0].trim())
}
hardcoded.length === 0
  ? ok('样式块内没有硬编码 hex / rgba 颜色（含投影）')
  : bad(`样式块内还有硬编码颜色：${hardcoded.slice(0, 6).join(' | ')}`)

/* 柔影/圆角/缓动：柔结构的三条签名，缺一条就不是这个视觉方向 */
const SIGNATURE = [
  ['面层级（凹槽）', /--plane-3\s*:/, '输入控件需要「陷进去」的一档底色'],
  ['内陷阴影', /--inset-shadow\s*:/, '凹槽的顶边内阴影，是内陷错觉的来源'],
  ['柔影分层', /--lift-[123]\s*:/, '卡片/面板/弹窗需要不同的纵深'],
  ['自定义缓动', /--ease\s*:\s*cubic-bezier/, '禁止 linear / ease-in-out'],
  ['字号阶', /--fs-(micro|cap|body|lead|title)\s*:/, '层级靠字重与颜色拉，不靠字号暴涨'],
]
for (const [name, re, why] of SIGNATURE) {
  re.test(css) ? ok(`${name}（${why}）`) : bad(`缺少${name}：${why}`)
}
// 默认缓动是 AI 味的来源之一：全站不该出现 ease-in-out / linear
const lazyEase = [...css.matchAll(/transition[^;]*\b(?:ease-in-out|linear)\b/g)].map((m) => m[0].trim())
if (lazyEase.length === 0) ok('没有任何 transition 用 linear / ease-in-out')
else warn.push(`有 ${lazyEase.length} 处 transition 还在用 ease-in-out / linear：${lazyEase.slice(0, 3).join(' | ')}`)

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
// 自包含指的是「资源加载」：script/style/img/iframe 不能指向网络，否则离线就裂。
// 导航链接（<a href>）不算 —— 页脚的 GitHub 链接离线点不开只是没跳转，不影响编辑器本身。
// 所以这里只抓资源标签（负向先行排除 a），放行 <a>。
const externals = [...html.matchAll(/<(?!a\b)[a-z][^>]*\b(?:src|href)="(https?:\/\/[^"#]+)"/g)].map((m) => m[1])
externals.length === 0
  ? ok('没有外部 CDN 依赖（离线可用；导航链接不算）')
  : bad(`存在外部资源依赖：${externals.join(', ')}`)

if (/rel="icon" href="data:image\/svg\+xml/.test(html)) ok('favicon 内联（/editor 是独立页面，不能靠相对路径）')
else bad('favicon 不是内联 data URI')

/* ── 报告 ─────────────────────────────────────────────────────────── */
if (warn.length) {
  console.log('\n提示')
  for (const w of warn) console.log('  · ' + w)
}
console.log(`\n${fails.length === 0 ? '✓ 全部通过' : `✗ ${fails.length} 项未通过`}`)
if (fails.length && process.argv.includes('--check')) process.exit(1)
