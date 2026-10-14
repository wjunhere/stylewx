/**
 * 主题样张：把多套主题用同一篇文章并排渲染成一张对比图（人工看图用，不进 CI）。
 *
 * 用法：
 *   node packages/service/scripts/theme-sheet.mjs --group community --out /c/tmp/sheet.png
 *   node packages/service/scripts/theme-sheet.mjs --all --cols 6 --out docs/assets/theme-sheet.png
 *   node packages/service/scripts/theme-sheet.mjs --themes tech-minimal,github-markdown --out ...
 *
 * 选项：
 *   --themes a,b,c   只渲染这些主题（名字同 list_themes）
 *   --group <名字>   preset（原创 6）/ community（社区 10）/ wemd（移植 20）/ all（缺省）
 *   --md <文件>      换一篇 Markdown（缺省用编辑器「主题预览」那篇统一示例）
 *   --cols <n>       每行几列（缺省 6；列宽固定 390px，与微信阅读宽度一致）
 *   --scale <n>      截图缩放（缺省 1；2 会得到 4 倍大的图）
 *   --out <png>      输出路径（缺省 theme-sheet.png）
 *
 * 为什么放 service 而不是 preview：它同时要 core（渲染）与 preview（截图），
 * 只有 service 同时声明了这两个依赖（preview 不依赖 core）。
 *
 * 为什么要它：主题多了之后编辑器一次只能看一套，而挑主题要的是**并排看** ——
 * 并且每套都必须在真实 390px 宽度下渲染，缩放过的样张不是它真实的排版。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { renderMarkdownToHtml } from '@stylewx/core'
import {
  COMMUNITY_THEMES,
  PRESET_THEMES,
  WEMD_THEMES,
  compileRootBaseStyle,
  getPresetTheme,
} from '@stylewx/theme'
import { closePreviewBrowser, getBrowser } from '@stylewx/preview'
import { THEME_SAMPLE_MARKDOWN } from '../dist/index.js'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const cols = Number(flag('cols', '6'))
const scale = Number(flag('scale', '1'))
const outPath = resolve(flag('out', 'theme-sheet.png'))
const mdPath = flag('md', '')
const markdown = mdPath ? readFileSync(resolve(mdPath), 'utf8') : THEME_SAMPLE_MARKDOWN

const groups = { preset: PRESET_THEMES.slice(0, 6), community: COMMUNITY_THEMES, wemd: WEMD_THEMES }
let themes
if (flag('themes', '')) {
  themes = flag('themes', '')
    .split(',')
    .map((n) => getPresetTheme(n.trim()))
    .filter(Boolean)
} else {
  const group = flag('group', 'all')
  themes = group === 'all' ? PRESET_THEMES : (groups[group] ?? PRESET_THEMES)
}
if (!themes.length) {
  console.error('没有匹配到主题（用 --themes a,b 或 --group preset|community|wemd|all）')
  process.exit(2)
}

const cells = themes
  .map((theme) => {
    const { html } = renderMarkdownToHtml(markdown, theme)
    // 与渲染管线同一份根节点样式（编译器产出 CSS 给 juice，这里直接内联到根 section）
    const rootStyle = compileRootBaseStyle(theme)
    return (
      `<section class="cell">` +
      `<section class="lab">${theme.name}</section>` +
      `<section style="${rootStyle}">${html}</section></section>`
    )
  })
  .join('')

const page = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; background: #e9e9e9; }
  .grid { display: grid; grid-template-columns: repeat(${cols}, 390px); gap: 18px; padding: 18px; align-items: start; }
  .cell { background: #fff; width: 390px; overflow: hidden; }
  .lab { font: 11px/20px system-ui, sans-serif; color: #666; background: #dcdcdc; padding: 0 8px; letter-spacing: .3px; }
</style></head><body><section class="grid">${cells}</section></body></html>`

const browser = await getBrowser()
const sheet = await browser.newPage({ viewport: { width: 400 * cols, height: 900 }, deviceScaleFactor: scale })
try {
  await sheet.setContent(page, { waitUntil: 'networkidle', timeout: 20000 })
  mkdirSync(dirname(outPath), { recursive: true })
  const png = await sheet.screenshot({ fullPage: true, type: 'png' })
  writeFileSync(outPath, png)
  console.log(`主题样张（${themes.length} 套 · ${cols} 列）：${outPath}（${Math.round(png.length / 1024)}KB）`)
} finally {
  await sheet.close()
  await closePreviewBrowser()
}
