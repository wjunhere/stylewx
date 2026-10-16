/** 一键把一篇 hippie 文章发进公众号**草稿箱**（浏览器登录态通道 + 发完读回体检）。
 *
 * 为什么要有它：通用的 `apps/mcp-server/scripts/publish-via-browser.mjs` 每次都要手填
 * 主题路径、作者、封面，还得记住「走浏览器通道、不要用 publish_draft」（后者 leaf=0，
 * 人在后台改不了，见 docs/design/publishing.md §20.7）。本脚本把这些固定项从**真源**读出来，
 * 只留一个文章名参数：
 *
 *   - 标题 / 作者 / 封面 ← 工作区 `brand/covers.json`（私人文案，不进仓库）
 *   - 主题              ← 品牌档案 `~/.stylewx/brands/<brand>/profile.json`（**唯一真源**，
 *                          不读 `articles/hippie/theme.json` 那种副本，免得两边漂移）
 *   - 正文              ← 工作区 `articles/hippie/<文章名>.md`
 *
 * 顺序是「渲染评审 → 发布 → 读回体检」，每一步都是前一步的闸门：
 *   ① 发布前先跑 `review-hippie.mjs`（校验 + 390px 截图，评审不过就不发）
 *   ② 发布后自动跑 `verify-drafts.mjs` —— 脚本报「已保存」不等于稿子是对的（§28 ④）
 * 另外先拦三类「正文与配置说两套话」的错：标题图与 covers.json 不一致、头尾图不同字母、
 * 封面文件不存在。
 *
 * 用法：
 *   node assets-src/publish-hippie.mjs <文章名> [选项]
 *
 * 选项：
 *   --brand <名>     品牌档案名（缺省 hippie-youth）
 *   --title <标题>   覆盖 covers.json 里的标题
 *   --author <作者>  覆盖 covers.json 里的作者
 *   --cover <图片>   覆盖 covers.json 里的封面（绝对路径，或相对 `articles/` 的路径）
 *   --no-cover       不设封面
 *   --dry-run        只填写不保存（先看效果，不发草稿、也不体检）
 *   --keep-open      结束后不关标签页
 *   --session <名>   会话名（决定用哪个标签页，透传给 publish-via-browser）
 *
 * 前置：自动化 Chrome 已登录公众号后台（同 publish-via-browser；不在跑会自动拉起）。
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readBrandProfile } from '@stylewx/service'
import { articlesDir, brandsDir, outDir, workspaceDir } from './paths.mjs'

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2)
const opts = { brand: 'hippie-youth', dryRun: false, keepOpen: false, noCover: false }
const positional = []

function fail(msg, code = 2) {
  console.error(`\n✖  ${msg}\n`)
  process.exit(code)
}

for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  const next = () => argv[++i]
  if (a === '--brand') opts.brand = next()
  else if (a === '--title') opts.title = next()
  else if (a === '--author') opts.author = next()
  else if (a === '--cover') opts.cover = next()
  else if (a === '--session') opts.session = next()
  else if (a === '--dry-run') opts.dryRun = true
  else if (a === '--keep-open') opts.keepOpen = true
  else if (a === '--no-cover') opts.noCover = true
  else if (a.startsWith('--')) fail(`未知参数：${a}`)
  else positional.push(a)
}

const [article] = positional
if (!article) {
  fail(
    '用法：node assets-src/publish-hippie.mjs <文章名> [--brand 名] [--cover 图片] [--no-cover] [--dry-run]\n' +
      '   <文章名> 指 articles/hippie/<文章名>.md，文章名由调用方给 —— 仓库里不留具体文章名（§34）',
  )
}

// ---------------------------------------------------------------------------
// 1. 正文
// ---------------------------------------------------------------------------
const hippieDir = join(articlesDir(), 'hippie')
const mdPath = join(hippieDir, `${article}.md`)
if (!existsSync(mdPath)) {
  const existing = existsSync(hippieDir)
    ? readdirSync(hippieDir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')).join(' / ')
    : '(目录不存在)'
  fail(`找不到正文：${mdPath}\n   articles/hippie/ 里现有：${existing}`)
}
const markdown = readFileSync(mdPath, 'utf8')

// ---------------------------------------------------------------------------
// 2. 标题 / 作者 / 封面（工作区私人文案）
// ---------------------------------------------------------------------------
const coversPath = join(workspaceDir(), 'brand', 'covers.json')
if (!existsSync(coversPath)) fail(`读不到封面配置 ${coversPath}（标题/作者/封面都从这里读）`)
const cfg = JSON.parse(readFileSync(coversPath, 'utf8'))
const entry = (cfg.covers ?? []).find((c) => c.title === article)
if (!entry) {
  const titles = (cfg.covers ?? []).map((c) => c.title).join(' / ') || '(空)'
  fail(`brand/covers.json 里没有「${article}」的条目。\n   现有：${titles}\n   补一条 {title, subtitle, author, cover} 再发。`)
}

const title = opts.title ?? entry.title
const author = opts.author ?? entry.author
if (!title) fail('没有标题：covers.json 该条目缺 title，且未传 --title')
if (!author) fail(`没有作者：covers.json 里「${article}」缺 author，且未传 --author`)

function resolveCover() {
  if (opts.noCover) return undefined
  const raw = opts.cover ?? entry.cover
  if (!raw) {
    fail(
      `没有封面：covers.json 里「${article}」缺 cover，也没有 --cover。\n` +
        '   本号的封面用人的实拍图（文章目录 original-covers/），别自己另画 —— 确定不要封面就传 --no-cover。',
    )
  }
  // covers.json 里的相对路径以 `articles/` 为基准（与 gen-hippie-covers.mjs 读的同一份配置）
  const p = isAbsolute(raw) ? raw : resolve(articlesDir(), raw)
  if (!existsSync(p)) fail(`封面文件不存在：${p}\n   （covers.json 里的相对路径以 articles/ 为基准）`)
  return p
}
const cover = resolveCover()

// ---------------------------------------------------------------------------
// 3. 正文与配置的一致性闸门（发布是不可逆动作，先在这些地方拦）
// ---------------------------------------------------------------------------
/** 取正文里 `:::cover{...}` 的属性表。 */
const coverAttrs = {}
const coverLine = markdown.match(/^:::cover\{([^}]*)\}/m)?.[1]
if (coverLine) {
  for (const m of coverLine.matchAll(/([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)) coverAttrs[m[1]] = m[2]
}
const mismatches = []
for (const key of ['title', 'subtitle', 'author']) {
  if (coverAttrs[key] && entry[key] && coverAttrs[key] !== entry[key]) {
    mismatches.push(`${key}：正文「${coverAttrs[key]}」≠ covers.json「${entry[key]}」`)
  }
}
if (mismatches.length) {
  fail(
    `正文标题图与 covers.json 不一致（同一篇的两处文案必须一样，否则封面图与正文说两套话）：\n   ` +
      mismatches.join('\n   '),
  )
}

const head = markdown.match(/^:::hip-head-([abc])\b/m)?.[1]
const end = markdown.match(/^:::hip-end-([abc])\b/m)?.[1]
if (head && end && head !== end) {
  fail(`头尾图不同字母：hip-head-${head} 配 hip-end-${end} —— 品牌规则要求同一篇内同字母（见品牌档案 brand.md）`)
}

// ---------------------------------------------------------------------------
// 4. 主题（品牌档案是唯一真源）
// ---------------------------------------------------------------------------
let profile
try {
  profile = readBrandProfile(opts.brand)
} catch (e) {
  fail(`读不到品牌档案「${opts.brand}」（${brandsDir()}）：${e.message}`)
}
if (!profile?.theme) fail(`品牌档案「${opts.brand}」里没有 theme，先跑 brand_save / build-brand.py`)

const themeDir = outDir('publish')
mkdirSync(themeDir, { recursive: true })
const themePath = join(themeDir, `theme-${opts.brand}.json`)
writeFileSync(themePath, JSON.stringify(profile.theme, null, 2))

console.log(`[hippie] 正文   ${mdPath}`)
console.log(`[hippie] 主题   ${profile.theme.name}（品牌档案 ${opts.brand}）`)
console.log(`[hippie] 标题   ${title} · 作者 ${author}`)
console.log(`[hippie] 封面   ${cover ?? '(不设)'}`)
console.log(`[hippie] 头尾   hip-head-${head ?? '?'} + hip-end-${end ?? '?'}`)

// ---------------------------------------------------------------------------
// 5. 先渲染评审 + 截图（评审的就是发布的：同一个 md、同一个主题）
// ---------------------------------------------------------------------------
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REVIEW = join(repoRoot, 'assets-src', 'review-hippie.mjs')
const PUBLISH = join(repoRoot, 'apps', 'mcp-server', 'scripts', 'publish-via-browser.mjs')
const VERIFY = join(repoRoot, 'apps', 'mcp-server', 'scripts', 'verify-drafts.mjs')

/** 跑一个子进程，边跑边透出输出，并把 stdout 收集回来。 */
function run(cmd, args) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [cmd, ...args], { cwd: repoRoot, stdio: ['inherit', 'pipe', 'inherit'] })
    let out = ''
    child.stdout.on('data', (d) => {
      out += d.toString()
      process.stdout.write(d)
    })
    child.on('close', (code) => done({ code, out }))
  })
}

console.log(`\n[hippie] 渲染评审 + 390px 截图 …`)
const rev = await run(REVIEW, [article])
if (rev.code !== 0) fail(`评审没过（exit ${rev.code}）：先按上面的提示改正文，再发。`, rev.code)
console.log(`[hippie] 截图 ${join(outDir('hippie-articles'), `preview-${article}.png`)}`)

// ---------------------------------------------------------------------------
// 6. 走浏览器通道发布，然后读回体检
// ---------------------------------------------------------------------------
const pub = await run(PUBLISH, [
  mdPath,
  '--theme',
  themePath,
  '--title',
  title,
  '--author',
  author,
  cover ? '--cover' : '--no-cover',
  ...(cover ? [cover] : []),
  ...(opts.session ? ['--session', opts.session] : []),
  ...(opts.dryRun ? ['--dry-run'] : []),
  ...(opts.keepOpen ? ['--keep-open'] : []),
])
if (pub.code !== 0) fail(`发布脚本退出码 ${pub.code}，未跑读回体检。`, pub.code)

if (opts.dryRun) {
  console.log('\n[dry-run] 浏览器里已填好、未保存草稿，也没有体检可跑。')
  process.exit(0)
}

const appmsgid = pub.out.match(/appmsgid=(\d+)/)?.[1]
if (!appmsgid) {
  console.log('\n⚠️  没从输出里读到 appmsgid，跳过读回体检 —— 请到后台确认这条草稿。')
  process.exit(0)
}

console.log(`\n[hippie] 读回体检 appmsgid=${appmsgid} …`)
const ver = await run(VERIFY, [appmsgid])
if (ver.code !== 0) fail(`读回体检没过（appmsgid=${appmsgid}）—— 稿子在草稿箱里，但它不对。`, ver.code)
console.log('\n完成。草稿箱里那条要人来决定去留；同名多份是正常的，agent 不主动删（§29）。')
