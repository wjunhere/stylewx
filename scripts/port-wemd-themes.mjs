#!/usr/bin/env node
/**
 * WeMD 主题移植器 —— 从 tenngoxars/WeMD（MIT）的上游 CSS 生成 stylewx 的 wemd-presets.ts。
 *
 * 背景：此前的 wemd-presets.ts 只搬运了 tokens + 元素的样式声明，而 WeMD 写在 `#wemd {…}`
 * 根选择器上的声明（padding / letter-spacing / word-break）无处安放，被整批丢掉了 ——
 * 23 个上游主题里有 17 个设了根级 padding、18 个设了 word-break、7 个设了 letter-spacing。
 * 本脚本把这些值补进 tokens.pagePadding / tokens.letterSpacing / tokens.wordBreak，
 * 由 compileRootBaseStyle 输出到根 <section> 上。
 *
 * 用法：
 *   node scripts/port-wemd-themes.mjs            # 拉取上游并重写 wemd-presets.ts
 *   node scripts/port-wemd-themes.mjs --check    # 只报告差异，不写文件
 *   node scripts/port-wemd-themes.mjs --refresh  # 忽略本地缓存，重新拉取上游
 *
 * 上游按 commit 锁定，保证可复现。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT = join(ROOT, 'packages/theme/src/wemd-presets.ts')
const CACHE = join(ROOT, '.cache/wemd-upstream')

/** 锁定的上游版本（tenngoxars/WeMD）。 */
const WEMD_SHA = 'cfde33cbd2fdde3c797835d0cb37b143816ea019'
const UPSTREAM_DIR = 'packages/core/src/themes'

/** stylewx 主题名 → 上游文件名（不含 .ts）。未列出时同名。 */
const UPSTREAM_SOURCE = {
  'modern-editorial': 'modern-editorial-foundation',
}

/** 上游存在、但不作为独立 stylewx 主题导出的文件。 */
const SKIP_FILES = new Set(['index'])

const checkOnly = process.argv.includes('--check')

const refresh = process.argv.includes('--refresh')

async function fetchUpstream(name) {
  mkdirSync(CACHE, { recursive: true })
  const cached = join(CACHE, `${name}.ts`)
  // 默认优先用缓存，避免每次重跑都打 GitHub；--refresh 强制重新拉取。
  if (!refresh && existsSync(cached)) return readFileSync(cached, 'utf8')
  const url = `https://raw.githubusercontent.com/tenngoxars/WeMD/${WEMD_SHA}/${UPSTREAM_DIR}/${name}.ts`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`拉取失败 ${url} → HTTP ${res.status}`)
  const text = await res.text()
  writeFileSync(cached, text)
  return text
}

/** 取出模板字符串里的 CSS。 */
function cssOf(src) {
  const m = src.match(/`([\s\S]*?)`/)
  return m ? m[1] : src
}

/** 去掉 CSS 注释（上游习惯把中文注释写在声明中间，会污染键名解析）。 */
function stripCssComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** 解析 `a: b; c: d` 为对象。 */
function parseDecls(body) {
  const out = {}
  for (const part of stripCssComments(body).split(';')) {
    const s = part.trim()
    if (!s) continue
    const i = s.indexOf(':')
    if (i < 0) continue
    out[s.slice(0, i).trim()] = s.slice(i + 1).trim()
  }
  return out
}

/** 解析 `#wemd { … }` 根块。 */
function rootDecls(css) {
  const m = css.match(/#wemd\s*\{([^}]*)\}/)
  if (!m) return {}
  return parseDecls(m[1])
}

/** 从上游根块提取可以落到根节点的值。 */function rootTokens(decls) {
  const tokens = {}
  const pad = decls['padding']
  // 只接受 1~4 个带单位的尺寸（schema 的 boxShorthandSchema），`0` 之类直接跳过。
  if (pad && /^\d+(\.\d+)?(px|em|rem|pt|%)(\s+\d+(\.\d+)?(px|em|rem|pt|%)){0,3}$/.test(pad)) {
    tokens.pagePadding = pad
  }
  const ls = decls['letter-spacing']
  if (ls && /^\d+(\.\d+)?(px|em|rem|pt|%)$/.test(ls) && parseFloat(ls) !== 0) {
    tokens.letterSpacing = ls
  }
  const wb = decls['word-break']
  if (wb && wb !== 'normal') tokens.wordBreak = wb
  return tokens
}

/** decorations 里允许保留的 CSS 属性（均在微信白名单内）。 */
const DECOR_KEEP = new Set([
  'display',
  'width',
  'height',
  'min-width',
  'max-width',
  'margin',
  'margin-top',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'padding',
  'color',
  'background',
  'background-color',
  'border-radius',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'line-height',
  'text-align',
  'vertical-align',
  'opacity',
])

/** 上游的伪元素选择器 → stylewx 的装饰目标元素。不认识的返回 null（跳过）。 */
function decorTarget(selector) {
  const s = selector.replace(/^#wemd/, '').trim()
  if (!s) return null
  const parts = s.split(/\s+/)
  const head = parts[0]
  if (/^h[1-6]$/.test(head)) return head
  if (head === 'blockquote' || head.startsWith('.multiquote')) return 'blockquote'
  if (head === 'li') return 'li'
  // `ul li` / `ol li` 算列表项；`ul ul li` 这类嵌套不上（模型里区分不了层级，宁可不做）
  if ((head === 'ul' || head === 'ol') && parts.length === 2 && parts[1] === 'li') return 'li'
  return null
}

/**
 * 从上游 CSS 提取 `::before` / `::after` 装饰，转成 decorations 规则。
 *
 * 微信正文不支持伪元素，这些规则会被渲染成真实的内联 span，效果等价。
 */
function extractDecorations(css) {
  const out = []
  const seen = new Set()
  const re = /(#wemd[^{]*?)::(before|after)\s*\{([^}]*)\}/g
  let m
  while ((m = re.exec(css))) {
    const target = decorTarget(m[1].trim())
    if (!target) continue
    const position = m[2]

    const decls = parseDecls(m[3])

    const rule = { target, position }
    const content = (decls.content || '').replace(/!important/g, '').trim()
    const counter = content.match(/^counter\(\s*[^,]+,\s*([a-z-]+)\s*\)$/i)
    if (counter && ['decimal', 'decimal-leading-zero', 'lower-alpha', 'upper-alpha'].includes(counter[1])) {
      rule.counter = counter[1]
    } else {
      const str = content.match(/^["']([\s\S]*)["']$/)
      if (str && str[1]) rule.text = str[1]
    }

    const style = {}
    for (const [k, v] of Object.entries(decls)) {
      if (k === 'content' || k.startsWith('counter')) continue
      if (!DECOR_KEEP.has(k)) continue
      const val = v.replace(/!important/g, '').trim()
      if (val) style[k] = val
    }

    // 既没有文字/序号，也没有可见块（宽高或底色）—— 比如 `content:""; display:none`，跳过
    const visual = !!(style.background || style['background-color'] || style.width || style.height || style['border-radius'])
    if (!rule.text && !rule.counter && !visual) continue
    if (Object.keys(style).length) rule.style = style

    const key = `${target}|${position}|${rule.text ?? rule.counter ?? 'block'}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(rule)
  }
  return out.slice(0, 16)
}

function parseThemes(fileText) {  const start = fileText.indexOf('= [') + 2
  return JSON.parse(fileText.slice(start, fileText.lastIndexOf(']') + 1))
}

function render(themes) {
  return `/**
 * WeMD 主题移植（自动生成自 tenngoxars/WeMD 的 CSS 主题，MIT）。
 *
 * 生成器：\`node scripts/port-wemd-themes.mjs\`（上游 commit 锁定，见脚本内 WEMD_SHA）。
 * 已转换为 stylewx 的结构化 Theme（tokens + blocks），只保留微信白名单内属性。
 * 样式为近似的「视觉迁移」：无法 1:1 还原 WeMD 的 class / ::before/::after 伪元素 /
 * 依赖 class 的 flex 布局 —— 这些微信正文都不支持。可内联表达的部分（含根节点的
 * padding / letter-spacing / word-break）尽量保留。
 *
 * 请勿手工编辑本文件，改上游或改生成器后重新运行脚本。
 */
import type { Theme } from './schema.js'

export const WEMD_THEMES: Theme[] = [
${themes.map((t) => JSON.stringify(t, null, 2)).join(',\n')}
]
`
}

const current = readFileSync(OUT, 'utf8')
const themes = parseThemes(current)

const report = []
for (const theme of themes) {
  const file = UPSTREAM_SOURCE[theme.name] || theme.name
  if (SKIP_FILES.has(file)) continue
  let src
  try {
    src = await fetchUpstream(file)
  } catch (e) {
    report.push({ name: theme.name, error: String(e.message) })
    continue
  }
  const tokens = rootTokens(rootDecls(cssOf(src)))
  const added = []
  for (const [k, v] of Object.entries(tokens)) {
    if (theme.tokens[k] !== v) {
      added.push(`${k}=${v}`)
      theme.tokens[k] = v
    }
  }

  const decos = extractDecorations(cssOf(src))
  if (decos.length) {
    if (JSON.stringify(theme.decorations ?? null) !== JSON.stringify(decos)) {
      theme.decorations = decos
      added.push(`decorations×${decos.length}`)
    }
  } else if (theme.decorations) {
    delete theme.decorations
    added.push('decorations 清空')
  }

  report.push({ name: theme.name, added })
}

console.log('WeMD 根级 token 补齐情况：')
for (const r of report) {
  if (r.error) console.log(`  ✗ ${r.name.padEnd(22)} ${r.error}`)
  else if (r.added.length) console.log(`  + ${r.name.padEnd(22)} ${r.added.join('  ')}`)
  else console.log(`    ${r.name.padEnd(22)} (无变化)`)
}

if (checkOnly) {
  console.log('\n--check 模式，未写入。')
} else {
  writeFileSync(OUT, render(themes))
  console.log(`\n已写入 ${OUT}`)
}
