/**
 * 对比实验执行器：按 design.mjs 的设计，渲染各组并输出指标 + 截图。
 * 用法：node scripts/comparison/run.mjs
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { completeThemeBlocks, validateTheme, getPresetTheme } from '@stylewx/theme'
import {
  renderPreview, reviewArticle, brandSave, brandApply, brandLearn, brandDelete,
  listThemes,
} from '@stylewx/service'
import { closePreviewBrowser } from '@stylewx/preview'
import { DESIGN } from './design.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'scripts', 'comparison', 'output')
mkdirSync(join(OUT, 'shots'), { recursive: true })

const full = (t) => ({ ...t, blocks: completeThemeBlocks(t.blocks) })

const articles = {}
for (const [k, f] of Object.entries(DESIGN.articles)) {
  articles[k] = readFileSync(join(ROOT, f), 'utf8')
}

/** 需要时用 canvas 包裹全文（暗色整页主题必须如此，否则 canvasBg 不生效） */
function articleFor(key, variantKey) {
  const wrap = DESIGN.canvasWrap?.[key]?.includes(variantKey)
  const raw = articles[key]
  return wrap ? `::::canvas\n${raw}\n::::` : raw
}

const results = []

async function renderGroup(groupId, articleKey, label, markdown, themeInput) {
  const theme = full(themeInput)
  const check = validateTheme(theme)
  if (!check.ok) throw new Error(`${groupId}/${articleKey} 主题不合法: ${check.issues.map((i) => i.message).join('; ')}`)
  const preview = await renderPreview(markdown, theme)
  const review = reviewArticle(markdown, theme, { presetThemes: listThemes().themes })
  const shot = join(OUT, 'shots', `${groupId}-${articleKey}.png`)
  if (preview.screenshotPng) writeFileSync(shot, preview.screenshotPng)
  const entry = {
    group: groupId, article: articleKey, label,
    theme: theme.name,
    validation: { pass: preview.validation.pass, errors: preview.validation.issues.filter((i) => i.severity === 'error').length },
    hierarchy: review.hierarchy,
    componentTypes: review.componentTypeCount,
    componentsPerKiloChar: review.componentsPerKiloChar,
    componentUsage: review.componentUsage,
    issues: review.issues,
    diagnostics: preview.diagnostics?.length ?? 0,
    screenshot: preview.screenshotPng ? shot : null,
    htmlChars: preview.html.length,
  }
  results.push(entry)
  console.log(`[${groupId}] ${articleKey} → ${theme.name} · pass=${entry.validation.pass} · h1=${entry.hierarchy.h1Ratio} h2=${entry.hierarchy.h2Ratio} · 组件${entry.componentTypes}类 · 诊断${entry.diagnostics}`)
  return preview
}

// ---------------------------------------------------------------------------
// 组1 基线：预置主题直排（典型「现状」用法）
// ---------------------------------------------------------------------------
for (const [key, themeName] of Object.entries(DESIGN.baseline)) {
  await renderGroup('G1-baseline', key, `${key} · 预置主题直排`, articles[key], getPresetTheme(themeName))
}

// ---------------------------------------------------------------------------
// 组2 三方向全景：每篇文章 3 个方向全部渲染（人眼对比「选择权」的价值）
// ---------------------------------------------------------------------------
for (const [key, cfg] of Object.entries(DESIGN.directions)) {
  for (const [vk, vt] of Object.entries(cfg.variants)) {
    await renderGroup('G2-panorama', `${key}-${vk}`, `${cfg.label} · 方向${vk}`, articleFor(key, vk), vt)
  }
  // 选定方向单独留档
  await renderGroup('G2-chosen', key, `${cfg.label} · 选定方向${cfg.chosen}`, articleFor(key, cfg.chosen), cfg.variants[cfg.chosen])
}

// ---------------------------------------------------------------------------
// 组3 品牌记忆：ink-ledger 品牌档案 + 品牌专属组件 + 语气规则（coffee 文章）
// ---------------------------------------------------------------------------
try { brandDelete(DESIGN.brand.name); console.log('[brand] 旧档案已清') } catch {}
let brandTheme
try {
  const saved = brandSave({
    name: DESIGN.brand.name,
    displayName: DESIGN.brand.displayName,
    description: DESIGN.brand.description,
    rationale: DESIGN.brand.rationale,
    theme: DESIGN.brand.theme,
    components: DESIGN.brand.components,
    voice: DESIGN.brand.voice,
    taboos: DESIGN.brand.taboos,
  })
  console.log(`[brand] 档案已建立 → ${saved.docPath}`)
} catch (e) {
  console.log('[brand] 已存在，直接 apply')
}
// brand_apply：同步品牌组件进全局组件库 + 取回编译后的主题（与 MCP 工作流一致）
const applied = brandApply(DESIGN.brand.name)
brandTheme = applied.theme
console.log(`[brand] 已应用 · 同步组件: ${applied.syncedComponents.join(', ')}`)
await renderGroup('G3-brand', 'coffee', '商业分析《咖啡 costing》· 品牌记忆', DESIGN.brandMarkdown(articles.coffee), brandTheme)

// ---------------------------------------------------------------------------
// 组4 品牌迭代：brand_learn 后 v2 主题 + vite 文章（验证跨文章复用与一致性）
// ---------------------------------------------------------------------------
brandLearn(DESIGN.brand.name, DESIGN.brand.learnNote)
const tweak = DESIGN.brand.v2Patch
const v2Theme = {
  ...brandTheme,
  tokens: { ...brandTheme.tokens, ...(tweak.tokens ?? {}) },
  blocks: completeThemeBlocks({ ...brandTheme.blocks, ...tweak.blocks }),
  description: brandTheme.description + '（v2：层级拉大、数据条加强）',
}
await renderGroup('G4-brand-v2', 'vite', '技术评测《Vite》· 品牌迭代 v2', DESIGN.viteMarkdownV2(articles.vite), v2Theme)

// ---------------------------------------------------------------------------
// G2 三方向选择记录（模拟用户视角的决策依据，写入报告）
// ---------------------------------------------------------------------------
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2))
writeFileSync(join(OUT, 'directions-report.json'), JSON.stringify(
  Object.fromEntries(Object.entries(DESIGN.directions).map(([k, c]) => [k, { label: c.label, chosen: c.chosen, reason: c.reason }])),
  null, 2,
))
await closePreviewBrowser().catch(() => undefined)
console.log(`\n完成：${results.length} 个渲染结果 → ${OUT}`)
process.exit(0)
