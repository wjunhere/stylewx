/**
 * 富组件演示：品牌头图 + 图形装饰 + 动效 + 图片编排
 * 证明 stylewx 能排出「图文并茂」的公众号文章，而非 md 换肤。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { completeThemeBlocks, validateTheme } from '@stylewx/theme'
import { renderPreview, reviewArticle, brandDelete, brandSave, brandApply, listThemes } from '@stylewx/service'
import { closePreviewBrowser } from '@stylewx/preview'
import { DESIGN } from './design.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'scripts', 'comparison', 'output')
mkdirSync(join(OUT, 'shots'), { recursive: true })

// ---------------------------------------------------------------------------
// 品牌头图组件：纯内联 SVG 报头（logo 位 + 报名 + 期号 + 装饰横线），微信原生渲染
// ---------------------------------------------------------------------------
const INK_HEADER = {
  name: 'ink-header',
  description: '墨账品牌头图：SVG 报头（品牌名 + 期号 + 装饰线），每篇文章开头必调',
  template:
    '<section style="margin:0 0 18px">' +
    '<svg xmlns="http://www.w3.org/2000/svg" viewbox="0 0 320 96" style="width:100%;display:block">' +
    '<rect x="0" y="0" width="320" height="96" fill="{{theme.canvasBg}}"/>' +
    '<rect x="0" y="0" width="320" height="4" fill="{{theme.primary}}"/>' +
    '<rect x="0" y="92" width="320" height="1" fill="{{theme.divider}}"/>' +
    '{{#if logo}}<image href="{{logo}}" x="16" y="28" width="40" height="40"/>{{/if}}' +
    '<text x="{{#if logo}}68{{else}}16{{/if}}" y="56" font-size="26" font-weight="bold" fill="{{theme.primary}}" font-family="Georgia,serif">{{brandName}}</text>' +
    '<text x="{{#if logo}}68{{else}}16{{/if}}" y="74" font-size="10" fill="{{theme.muted}}" letter-spacing="2">{{slogan}}</text>' +
    '<text x="304" y="56" font-size="11" fill="{{theme.accent}}" text-anchor="end" font-family="Georgia,serif">{{issue}}</text>' +
    '</svg>' +
    '</section>',
  defaults: { brandName: '墨账', slogan: 'LEDGER OF TOOLS & BUSINESS', issue: 'Vol.01' },
  slots: [],
}

// 品牌重建（带 logo 配置与头图组件）
try { brandDelete('ink-ledger') } catch {}
brandSave({
  ...DESIGN.brand,
  components: [...DESIGN.brand.components, INK_HEADER],
  headerComponent: 'ink-header',
  // logo 用 SVG data URI 演示（实际使用时换成用户上传的图片 URL）
  logo: 'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"%3E%3Crect width="40" height="40" rx="8" fill="%231F3A5F"/%3E%3Ctext x="20" y="27" font-size="18" fill="%23F5F0E6" text-anchor="middle" font-family="Georgia"%3E墨%3C/text%3E%3C/svg%3E',
})
brandApply('ink-ledger')

// ---------------------------------------------------------------------------
// G5：coffee 文章的「图文并茂」完整形态
// ---------------------------------------------------------------------------
const theme = { ...DESIGN.brand.theme, blocks: completeThemeBlocks(DESIGN.brand.theme.blocks) }
// 给主题加 decorations：h2 前的账本方块装饰 + blockquote 引号
theme.decorations = [
  { target: 'h2', position: 'before', text: '§', style: { color: '{{accentColor}}', 'font-weight': 'bold', 'margin-right': '2px' } },
]

const coffee = readFileSync(join(ROOT, 'articles/test-coffee-costing.md'), 'utf8')
const rich = `:::ink-header{issue="Vol.12 · 成本篇"}
:::

:::cover{title="一杯拿铁的 28 元" subtitle="COFFEE COSTING · 拆解一家独立店的账本" author="墨账" tone="primary" height="180"}
:::

${DESIGN.brandMarkdown(coffee)
  .replace('## 先看一道简单的算术题', '## 先看一道简单的算术题\n\n:::draw{shape="underline" tone="primary" text="毛利 1.5 元 / 杯"}\n:::')
  .replace('### 换更便宜的豆子', '### 换更便宜的豆子\n\n:::image{src="https://picsum.photos/seed/coffeebean/800/420" caption="豆子成本占每杯 18%，但降价是最危险的省钱方式" width="inset"}\n:::')
  .replace('### 砍掉低销 SKU', '### 砍掉低销 SKU\n\n:::image-card{src="https://picsum.photos/seed/pourover/400/300" title="手冲线去留" desc="每月省豆子钱 900 元，但损失 40% 的咖啡爱好者客群——他们恰恰是发朋友圈最勤的人" layout="left"}\n:::')
  .replace(/每天睁眼就背着的固定账单：\n\n:::ink-stat/, '每天睁眼就背着的固定账单（开门即计费）：\n\n:::ink-stat')
  .replace('**每天睁眼就背着 880 元**。按毛利 14 元一杯算，卖 63 杯才开始为利润干活。', '**每天睁眼就背着 880 元**。按毛利 14 元一杯算：\n\n:::progress{value="63" label="日销 200 杯时的回本进度" tone="primary" height="12"}\n:::\n\n卖到第 63 杯，才开始为利润干活。')
  .replace('## 结论', ':::pulse{text="下期预告：把 880 元日固定成本拆成四个杠杆" tone="primary"}\n:::\n\n## 结论')
}
:::ink-quote
情怀负责让客人走进来，账本负责让你能开到第二年。
:::

:::end-card{title="墨账 · 用账本思维看生意" footer="扫码或点击头像关注 · 每周三更新" tone="primary"}
这篇拆解来自「墨账」成本系列。前一期的**房租谈判清单**在公众号菜单可回看。
:::`

const preview = await renderPreview(rich, theme)
const review = reviewArticle(rich, theme, { presetThemes: listThemes().themes })
writeFileSync(join(OUT, 'shots', 'G5-rich-coffee.png'), preview.screenshotPng ?? Buffer.alloc(0))
console.log('[G5-rich] coffee · pass=' + preview.validation.pass, '· 诊断', preview.diagnostics?.length ?? 0, '· 层级', JSON.stringify(review.hierarchy), '· 组件', review.componentTypeCount, '类')
if (preview.diagnostics?.length) console.log(JSON.stringify(preview.diagnostics, null, 1))
if (preview.validation.issues.filter((i) => i.severity === 'error').length) console.log(JSON.stringify(preview.validation.issues, null, 1))

await closePreviewBrowser().catch(() => undefined)
process.exit(0)
