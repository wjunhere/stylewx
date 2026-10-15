/** 确定性评审：层级比 / 组件堆砌 / 主题独特性。输出到 stdout，不吞成图。 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { reviewArticle, listThemes } from '../packages/service/dist/index.js'
import { articlesDir, brandsDir } from './paths.mjs'

const md = readFileSync(process.argv[2] ?? join(articlesDir(), '关于部分高校寄成绩单的思考-嬉皮青年.md'), 'utf8')
const theme = JSON.parse(readFileSync(join(brandsDir(), 'hippie-youth', 'profile.json'), 'utf8')).theme
const r = reviewArticle(md, theme, { presetThemes: listThemes().themes })
console.log(JSON.stringify(r, null, 1))
process.exit(0)
