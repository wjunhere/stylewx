/** 三篇 Hippie 文章的渲染 + 评审 + 390px 截图（写文档前的人工检查用）。
 *  用法：node assets-src/review-hippie.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { renderPreview, reviewArticle } from '@stylewx/service'
import { articlesDir, brandsDir, outDir } from './paths.mjs'

const OUT = outDir('hippie-articles')
mkdirSync(OUT, { recursive: true })

// 品牌主题：品牌档案里的 theme
const profile = JSON.parse(readFileSync(join(brandsDir(), 'hippie-youth', 'profile.json'), 'utf8'))
const theme = profile.theme

const articles = ['好好吃饭', '焦虑抑制剂', '我的所有还有意义吗']
let bad = 0
for (const name of articles) {
  const mdPath = join(articlesDir(), 'hippie', `${name}.md`)
  const md = readFileSync(mdPath, 'utf8')
  const preview = await renderPreview(md, theme, { includeScreenshot: false })
  const errs = preview.validation.issues.filter((i) => i.severity === 'error')
  const review = reviewArticle(md, theme)
  console.log('='.repeat(64))
  console.log(name)
  console.log('  validate pass:', preview.validation.pass, '| errors:', errs.length)
  errs.forEach((e) => console.log('   ✖', e.message))
  console.log('  components:', review.componentUsage.map((c) => `${c.name}×${c.count}`).join(' '))
  console.log('  typeCount:', review.componentTypeCount, '| perKiloChar:', review.componentsPerKiloChar)
  console.log('  hierarchy:', JSON.stringify(review.hierarchy))
  review.issues.forEach((i) => console.log(`   [${i.severity}] ${i.dimension}: ${i.message}`))
  if (errs.length || review.issues.some((i) => i.severity === 'error')) bad++
  // 390px 截图
  const shot = await renderPreview(md, theme, { includeScreenshot: true })
  if (shot.screenshotPng) {
    writeFileSync(join(OUT, `preview-${name}.png`), shot.screenshotPng)
    console.log('  screenshot ✓')
  } else {
    console.log('  screenshot: 失败')
  }
  writeFileSync(join(OUT, `rendered-${name}.html`), preview.html)
}
console.log(bad ? `\n有 ${bad} 篇存在 error` : '\n三篇全部通过校验')

process.exit(bad ? 1 : 0)
