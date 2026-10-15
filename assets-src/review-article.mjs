/** 确定性评审：层级比 / 组件堆砌 / 主题独特性。输出到 stdout，不吞成图。 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { reviewArticle, listThemes } from '../packages/service/dist/index.js'
import { brandsDir } from './paths.mjs'

// 文章路径由调用方给：仓库里不留具体文章名（§34）
const mdPath = process.argv[2]
if (!mdPath) {
  console.error('用法：node assets-src/review-article.mjs <markdown 文章路径>')
  process.exit(2)
}
const md = readFileSync(mdPath, 'utf8')
const theme = JSON.parse(readFileSync(join(brandsDir(), 'hippie-youth', 'profile.json'), 'utf8')).theme
const r = reviewArticle(md, theme, { presetThemes: listThemes().themes })
console.log(JSON.stringify(r, null, 1))
process.exit(0)
