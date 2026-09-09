/**
 * 组件库展示：渲染 examples/component-showcase.md → HTML + 390px 截图 + 校验报告。
 *
 * 用法：
 *   node --env-file=.env apps/mcp-server/scripts/render-showcase.mjs [markdown路径] [主题名] [输出目录]
 *
 * 不依赖 MCP Server / LLM，直接调用 @stylewx/service，便于快速验证组件渲染效果。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderPreview } from '@stylewx/service'
import { getPresetTheme } from '@stylewx/theme'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../../..')

const mdPath = resolve(process.argv[2] ?? resolve(repoRoot, 'examples/component-showcase.md'))
const themeName = process.argv[3] ?? 'magazine'
const outDir = resolve(process.argv[4] ?? resolve(repoRoot, 'examples/showcase-out'))

const theme = getPresetTheme(themeName)
if (!theme) {
  console.error(`找不到预置主题：${themeName}`)
  process.exit(1)
}

const markdown = readFileSync(mdPath, 'utf8')
const result = await renderPreview(markdown, theme)

mkdirSync(outDir, { recursive: true })
const name = basename(mdPath, '.md')
const htmlFile = resolve(outDir, `${name}.html`)
writeFileSync(htmlFile, result.html, 'utf8')

let pngFile = null
if (result.screenshotPng) {
  pngFile = resolve(outDir, `${name}.png`)
  writeFileSync(pngFile, result.screenshotPng)
}

writeFileSync(
  resolve(outDir, `${name}.report.json`),
  JSON.stringify(
    {
      theme: themeName,
      diagnostics: result.diagnostics ?? [],
      validation: result.validation,
    },
    null,
    2,
  ),
  'utf8',
)

console.log('[showcase] 主题 =', themeName)
console.log('[showcase] HTML =', htmlFile, `(${result.html.length} 字符)`)
if (pngFile) console.log('[showcase] 截图 =', pngFile)
console.log('[showcase] 校验 pass =', result.validation.pass)
const errors = result.validation.issues.filter((i) => i.severity === 'error')
const warnings = result.validation.issues.filter((i) => i.severity === 'warning')
console.log(`[showcase] issues: error=${errors.length} warning=${warnings.length}`)
for (const e of errors.slice(0, 10)) console.log('  [error]', e.rule, '-', e.location)
for (const w of warnings.slice(0, 8)) console.log('  [warn ]', w.rule, '-', w.location)
if (result.diagnostics?.length) {
  console.log('[showcase] 组件诊断:')
  for (const d of result.diagnostics) console.log('  ', d.level, d.component, '-', d.message)
}
