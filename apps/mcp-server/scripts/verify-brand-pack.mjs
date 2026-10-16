#!/usr/bin/env node
/**
 * 验证一个 `.brand` 包是否**自包含**：装进干净环境（空品牌目录 + 空全局组件库），
 * 再把它该有的组件逐个渲染一遍。任何组件退化成普通 Markdown → 退出码 1。
 *
 * 为什么必须这么验（实测教训，见 .agents/skills/stylewx-article/SKILL.md）：
 * 组件的正确落地顺序是 `save_component` 建好 → **`brand_save` 把完整清单再写一遍档案**。
 * 只做第一步时，组件躺在全局库 `~/.stylewx/components.json` 里、却没进 `profile.components`，
 * 于是**本地渲染永远正常**（全局库里有），**只有装进干净环境才报「未知组件」**。
 * 踩过一次：`hip-quote` 三篇文章都在用、品牌宪法的组件清单里也写着，包却不带它。
 *
 * 两条判据（缺一不可）：
 *   A **缺件检测**：包里的组件清单必须覆盖**外部真源**里的组件。真源按可用性取：
 *       ① `--expect a,b` 显式清单（永远可用）
 *       ② 本机同品牌档案 `~/.stylewx/brands/<name>/profile.json`（默认自动比）
 *          —— 能抓到「档案后来加了组件、包没跟上」，也就是 hip-quote 那次
 *       ③ `--articles <目录>` 里的文章（最强证据：实际在用的组件）
 *          ⚠️ 必须指向**该品牌自己**的文章目录（如 `articles/<品牌相关子目录>`）；
 *          指向整个 articles/ 会把别品牌的组件当成缺件（实测：hippie 包报出 wx-quote/ripple-cover）
 *     ⚠️ **不能拿包内的 brand.md 当参照**：它是从同一份 profile 生成的，
 *     缺件时两边一起缺 —— 那等于自己证明自己（本脚本第一版就这么错过，旧包被放行）。
 *   B **可渲染**：包里声明的每个组件渲染一遍，不得出现「未知组件」诊断
 *
 * 用法：
 *   node apps/mcp-server/scripts/verify-brand-pack.mjs <包.brand|目录>
 *   node apps/mcp-server/scripts/verify-brand-pack.mjs <包> --expect hip-quote,hip-letter
 *   node apps/mcp-server/scripts/verify-brand-pack.mjs <包> --articles B:/stylewx-workspace/articles/hippie
 *   node apps/mcp-server/scripts/verify-brand-pack.mjs <包> --keep     # 保留临时环境，排查用
 *
 * 退出码：0 通过；1 有缺件/渲染失败；2 用法或包本身不合法。
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { installBrand, validateBundle, brandApply, renderPreview } from '@stylewx/service'
import { COMPONENT_CATALOG } from '@stylewx/components'

const argv = process.argv.slice(2)
const argOf = (n) => {
  const i = argv.indexOf(n)
  return i >= 0 ? argv[i + 1] : undefined
}
const expectIdx = argv.indexOf('--expect')
const EXPECT = (argOf('--expect') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const ARTICLES = argOf('--articles')
const KEEP = argv.includes('--keep')
const PACK = argv.find((a, i) => !a.startsWith('--') && !(expectIdx >= 0 && i === expectIdx + 1))

// 干净环境会把 STYLEWX_* 指到临时目录，所以**先把本机真源的位置记下来**
const LOCAL_BRANDS = process.env.STYLEWX_BRANDS_PATH ?? join(homedir(), '.stylewx', 'brands')

if (!PACK) {
  console.error('用法：node apps/mcp-server/scripts/verify-brand-pack.mjs <包.brand|目录> [--expect a,b] [--keep]')
  process.exit(2)
}
if (!existsSync(resolve(PACK))) {
  console.error(`✖ 找不到包：${resolve(PACK)}`)
  process.exit(2)
}

/** 干净环境：空品牌目录 + 空组件库。必须在任何 store 调用之前设好环境变量。 */
const env = mkdtempSync(join(tmpdir(), 'stylewx-brandcheck-'))
process.env.STYLEWX_BRANDS_PATH = join(env, 'brands')
process.env.STYLEWX_COMPONENTS_PATH = join(env, 'components.json')
console.log(`[env] 干净环境 ${env}（空品牌目录 + 空组件库）`)

// ---- 0. 包本身合法吗 ----
let bundle
try {
  bundle = validateBundle(resolve(PACK))
} catch (e) {
  console.error(`✖ 包不合法：${e.message}`)
  cleanup(2)
}
const manifest = bundle.manifest ?? bundle
console.log(`[pkg] ${manifest.name} ${manifest.version} · engine ${manifest.engine ?? '(未声明)'} · ${bundle.files?.length ?? '?'} 个文件`)

// 装进干净环境（同时会把包里的组件写进这个干净组件库）
let applied
try {
  const installed = installBrand(resolve(PACK), { as: 'brandcheck' })
  applied = brandApply(typeof installed === 'string' ? 'brandcheck' : (installed?.name ?? 'brandcheck'))
} catch (e) {
  console.error(`✖ 装入干净环境失败：${e.message}`)
  cleanup(2)
}

const declared = applied.profile.components.map((c) => c.name)
const builtin = new Set(COMPONENT_CATALOG.map((s) => s.name))

/** 从一坨 markdown 里抽 `:::组件名`（减掉引擎内置的）。 */
const componentsIn = (text) =>
  [...new Set([...String(text).matchAll(/:::\s*([a-z][a-z0-9-]*)/g)].map((m) => m[1]))].filter((n) => !builtin.has(n))

/** 扫目录里的 .md（递归一层子目录，如 articles/hippie/*.md）。 */
function componentsInDir(dir) {
  const out = new Set()
  const walk = (d, depth) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory() && depth > 0) walk(p, depth - 1)
      else if (e.isFile() && /\.md$/i.test(e.name)) for (const n of componentsIn(readFileSync(p, 'utf8'))) out.add(n)
    }
  }
  walk(dir, 2)
  return [...out]
}

// 外部真源：本机同品牌档案（包外！）
const localProfilePath = join(LOCAL_BRANDS, manifest.name, 'profile.json')
let localComponents = []
if (existsSync(localProfilePath)) {
  localComponents = (JSON.parse(readFileSync(localProfilePath, 'utf8')).components ?? []).map((c) => c.name)
}
const fromArticles = ARTICLES ? componentsInDir(resolve(ARTICLES)) : []

console.log(`[brand] ${applied.profile.displayName ?? applied.profile.name} · 主题 ${applied.theme.name}`)
console.log(`[brand] 包里声明 ${declared.length} 个：${declared.join(', ') || '(无)'}`)
console.log(
  `[ref] 外部真源：本机档案 ${existsSync(localProfilePath) ? `${localComponents.length} 个` : '(无)'}` +
    ` · --expect ${EXPECT.length} 个 · --articles ${ARTICLES ? `${fromArticles.length} 个` : '(未给)'}`,
)
if (ARTICLES && fromArticles.length) console.log(`[ref] 文章里用到的品牌组件：${fromArticles.join(', ')}`)
if (localComponents.length) console.log(`[ref] 本机档案里的组件：${localComponents.join(', ')}`)

let bad = 0

// ---- A. 缺件检测（参照物一律在包外）----
const required = [...new Set([...EXPECT, ...localComponents, ...fromArticles])]
const missing = required.filter((n) => !declared.includes(n))
if (missing.length) {
  bad += 1
  const where = (n) =>
    [localComponents.includes(n) && '本机档案', EXPECT.includes(n) && '--expect', fromArticles.includes(n) && '文章'].filter(Boolean).join('+')
  console.log(`\n✖ A 缺件：这些组件没随包走（${missing.length} 个）`)
  for (const n of missing) console.log(`   · ${n}   ← 来自：${where(n)}`)
  console.log('   装到别的环境会退化成普通 Markdown（本机看不出来，因为全局组件库里有）。')
  console.log('   修法：`save_component` 建好后**再 `brand_save` 一遍完整组件清单**，然后重新打包。')
  if (!localComponents.length && !ARTICLES) {
    console.log('   （提示：没给本机档案也没给 --articles，本次只能靠 --expect 断言；三者都不给等于没验缺件。）')
  }
} else {
  const surplus = declared.filter((n) => !required.includes(n))
  console.log(`\n✓ A 缺件检测通过（外部真源 ${required.length} 个组件都在包里）`)
  if (surplus.length) console.log(`   （包里另有 ${surplus.length} 个外部真源没提到的：${surplus.join(', ')} —— 不算错，只是信息）`)
}

// ---- B. 逐个渲染 ----
const failed = []
for (const name of declared) {
  let html = ''
  let diags = []
  try {
    const md = `:::${name}\n验证用正文。\n:::\n`
    const preview = await renderPreview(md, applied.theme, { includeScreenshot: false })
    html = preview.html ?? ''
    diags = (preview.diagnostics ?? []).map((d) => `${d.level}:${d.message}`)
  } catch (e) {
    failed.push(`${name} → 渲染抛错：${e.message}`)
    continue
  }
  const unknown = diags.filter((d) => /未知组件/.test(d))
  if (unknown.length) failed.push(`${name} → ${unknown[0]}`)
  else if (!/<section|<svg|<img/.test(html)) failed.push(`${name} → 渲染结果不像组件（没有 section/svg/img）`)
}
if (failed.length) {
  bad += 1
  console.log(`\n✖ B 可渲染：${failed.length}/${declared.length} 个组件有问题`)
  for (const f of failed) console.log(`   · ${f}`)
} else {
  console.log(`✓ B 可渲染：${declared.length} 个组件在干净环境里都渲染成功`)
}

console.log(bad ? `\n✖ 这个包不自包含（${bad} 项失败）` : '\n✓ 包自包含：可以发给别人 / 换机器用')
cleanup(bad ? 1 : 0)

function cleanup(code) {
  if (KEEP) console.log(`[env] 已保留临时环境：${env}`)
  else rmSync(env, { recursive: true, force: true })
  process.exit(code)
}
