#!/usr/bin/env node
/**
 * 私人产物 / 凭据闸门（§34）。
 *
 * 为什么是路径级而不是「推送前读一遍提交」：0.7.0 那次推送里，私人品牌头/尾图源
 * （`assets-src/motion/*.svg`）与普通源码在 git 眼里完全一样 —— 都是被跟踪的文件，
 * `git status` 分不出来。靠人逐个提交去读一定会漏，所以边界必须由**路径与模式**给出。
 *
 * 三组规则：
 *   A 私人路径：文章 / 品牌图源 / `.env` / 本机产物 / 品牌档案 —— 一律不许被跟踪
 *   B 凭据：任何被跟踪文件里都不许出现真实密钥（匹配**值**，不是键名）
 *   C 本机绝对路径：`C:/Users/<名>`、`/home/<名>`、`/Users/<名>`、本仓的绝对路径
 *      —— 会泄露本机目录布局（本项目踩过：脚本里写死本仓的绝对路径）
 *
 * 跑法：
 *   node scripts/ci/check-private-paths.mjs            # 查全部被跟踪文件（路径 + 内容）
 *   node scripts/ci/check-private-paths.mjs --staged   # 只查暂存区（pre-commit 用）
 * 退出码：命中 → 1，逐条打印「文件:行 命中哪条规则」。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'

const STAGED = process.argv.includes('--staged')

/** A 私人路径：正则按 POSIX 分隔符匹配仓库内相对路径。 */
const PRIVATE_PATHS = [
  [/^assets-src\/motion\//, '品牌图源（头/尾图、logo）在工作区 brand/motion/，不进仓库'],
  [/^docs\/assets\/brand-motion\//, '品牌图源的定稿副本在工作区 brand/motion-shipped/，不进仓库'],
  [/^articles\//, '文章是私人产物，在工作区 articles/'],
  [/^assets-src\/review\//, '评审产物是私人产物，在工作区 out/review/'],
  [/^docs\/assets\/hippie-articles\//, '整页渲染是私人产物，在工作区 out/hippie-articles/'],
  [/^\.ui-shots\//, '本机截图在工作区 out/shots/'],
  [/(^|\/)\.env$/, '凭据只放工作区 .env（模板是 .env.example）'],
  [/\.brand$/, '品牌包是私人档案，不进仓库'],
  [/(^|\/)profile\.json$/, '品牌档案是私人档案，不进仓库'],
  [/(^|\/)brand\.md$/, '品牌档案是私人档案，不进仓库'],
  [/\.published\.json$/, '已发布 CDN 链接属于账号数据，不进仓库'],
]

/** B 凭据与账号数据：只匹配「看起来是真值」的形态，避免把键名与空模板判成泄漏。 */
const SECRETS = [
  [/\b(?:WECHAT_APP_SECRET|WECHAT_APP_ID|LLM_API_KEY|NPM_TOKEN|GITHUB_TOKEN|CLASH_SECRET|WB_TOKEN)\s*[=:]\s*["']?[A-Za-z0-9_-]{12,}/, '看起来是真实凭据值（应只放工作区 .env）'],
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'OpenAI 风格密钥'],
  [/\bghp_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/, 'GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, '私钥'],
  [/wx\.qlogo\.cn\/(?:mmopen|mmhead|n)\/[A-Za-z0-9_-]{20,}/, '账号头像直链（账号数据）——从工作区 .env 注入'],
  [/v2_[A-Za-z0-9]{20,}@finder/, '视频号 id（账号数据）——从工作区 .env 注入'],
]

/** C 本机绝对路径。泛用名（CI 的 runner、模板里的占位符）不算泄漏。 */
const GENERIC_NAMES = new Set(['runner', 'user', 'users', 'public', 'default', 'yourname', 'username'])
const isGeneric = (name) => GENERIC_NAMES.has(name.toLowerCase()) || /^[<{%]/.test(name)
const LOCAL_PATHS = [
  [/[A-Za-z]:[\\/]Users[\\/]([^\\/\s"']+)/, '本机 Windows 用户目录绝对路径'],
  [/(?:^|[^\w])\/(?:home|Users)\/([\w.-]+)\//, '本机 Unix 用户目录绝对路径'],
]

const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.pdf', '.zip'])
const MAX_BYTES = 1024 * 1024

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

/** 仓库自身的绝对路径（正反斜杠两种写法都要拦）。 */
const repoRoot = git('rev-parse', '--show-toplevel').trim()
const repoRootPatterns = [
  new RegExp(repoRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
  new RegExp(repoRoot.replace(/\\/g, '/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
]

const listFiles = () =>
  STAGED
    ? git('diff', '--cached', '--name-only', '--diff-filter=ACM', '-z').split('\0').filter(Boolean)
    : git('ls-files', '-z').split('\0').filter(Boolean)

const readFile = (path) => {
  // 工作区里还在就读盘（快）；已从工作区删掉但仍在索引里（删文件刚 add 之前）就读索引
  if (!STAGED && existsSync(path)) {
    if (statSync(path).size > MAX_BYTES) return null
    return readFileSync(path, 'utf8')
  }
  return git('show', `:${path}`)
}

const problems = []
const add = (file, line, rule) => problems.push({ file, line, rule })

for (const path of listFiles()) {
  const posix = path.split('\\').join('/')

  for (const [re, why] of PRIVATE_PATHS) {
    if (re.test(posix)) add(path, 0, `私人路径：${why}`)
  }

  const ext = posix.slice(posix.lastIndexOf('.'))
  if (SKIP_EXT.has(ext.toLowerCase())) continue

  let text
  try {
    text = readFile(path)
  } catch {
    continue // 二进制或不可读：跳过内容检查（路径检查已覆盖）
  }
  if (text === null || text.includes('\0')) continue

  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    for (const [re, why] of SECRETS) if (re.test(line)) add(path, i + 1, `凭据：${why}`)
    for (const [re, why] of LOCAL_PATHS) {
      const m = re.exec(line)
      if (m && !isGeneric(m[1] ?? '')) add(path, i + 1, `本机路径：${why}`)
    }
    if (repoRootPatterns.some((re) => re.test(line))) add(path, i + 1, '本机路径：本仓库的绝对路径')
  }
}

if (problems.length === 0) {
  console.log(`✓ 私人产物闸门通过（${STAGED ? '暂存区' : '全部被跟踪文件'}，${listFiles().length} 个文件）`)
  process.exit(0)
}

console.error(`✖ 私人产物闸门命中 ${problems.length} 处（§34：仓库只放代码）：\n`)
for (const p of problems) {
  console.error(`  ${p.file}${p.line ? `:${p.line}` : ''}\n    ${p.rule}`)
}
console.error('\n私人产物（文章 / 品牌图源 / .env / 本机产物）请放工作区：STYLEWX_WORKSPACE（默认 ../stylewx-workspace）。')
process.exit(1)
