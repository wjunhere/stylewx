#!/usr/bin/env node
/**
 * 发布前置校验（CI 用，只读，不落盘）：
 *
 * 1) 所有**可发布包**（`private !== true`）版本必须一致——本仓是固定版本（fixed versioning）
 *    的 monorepo，包之间用 `workspace:*` 互相依赖，版本一旦分叉就会出现「依赖已发布、
 *    被依赖者没发布」的半截状态（npm 上 @stylewx/api 曾落后到 0.2.2 就是这个原因）。
 * 2) 打 tag 发布时，tag 必须与包版本一致（`v0.3.0` ↔ `0.3.0`），否则 GitHub Release 会指向错版本。
 * 3) 每个可发布包的元数据必须齐全：`license` / `repository.url` / `files` / `publishConfig.access`。
 *    缺少 `files` 会把 src、测试一并塞进 tarball；`access` 缺失会让 scoped 包默认按 restricted 推。
 *
 * 用法：
 *   node scripts/ci/verify-release.mjs                # 只校验一致性，不比对 tag
 *   RELEASE_TAG=v0.3.0 node scripts/ci/verify-release.mjs
 *   node scripts/ci/verify-release.mjs --tag v0.3.0
 *   node scripts/ci/verify-release.mjs --check-registry   # 额外核对 npm 上是否真有这个版本（发布后跑）
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const EXPECTED_REPO = 'github.com/wjunhere/stylewx'

const failures = []

function fail(message) {
  failures.push(message)
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`无法解析 ${path}：${error.message}`)
    return undefined
  }
}

/** 收集 workspace 包：packages/* 与 apps/*（与 pnpm-workspace.yaml 对齐）。 */
function collectPackages() {
  const packages = []
  for (const group of ['packages', 'apps']) {
    const groupDir = join(repoRoot, group)
    if (!existsSync(groupDir)) continue
    for (const name of readdirSync(groupDir, { withFileTypes: true })) {
      if (!name.isDirectory()) continue
      const manifestPath = join(groupDir, name.name, 'package.json')
      if (!existsSync(manifestPath)) continue
      const manifest = readJson(manifestPath)
      if (!manifest?.name) {
        fail(`${group}/${name.name}/package.json 缺少 name`)
        continue
      }
      packages.push({
        dir: `${group}/${name.name}`,
        name: manifest.name,
        version: manifest.version,
        private: manifest.private === true,
        license: manifest.license,
        files: manifest.files,
        access: manifest.publishConfig?.access,
        repositoryUrl: manifest.repository?.url,
        hasPrepublish: Boolean(manifest.scripts?.prepublishOnly),
      })
    }
  }
  return packages
}

function resolveTagVersion() {
  const flagIndex = process.argv.indexOf('--tag')
  const tag = flagIndex >= 0 ? process.argv[flagIndex + 1] : process.env.RELEASE_TAG
  if (!tag) return undefined
  const match = /^v(.+)$/.exec(tag.trim())
  if (!match) {
    fail(`tag 格式应为 v<version>（例如 v0.3.0），实际收到：${tag}`)
    return undefined
  }
  return match[1]
}

/**
 * 查 npm 上该包该版本是否真的存在；不存在或网络异常返回 undefined。
 *
 * 直连 registry 而不调 `npm view`：一是省掉每个包一次进程启动，二是 Windows 上 npm 是
 * `.cmd`，Node 出于安全默认不允许 execFile 直接跑（需 shell:true），跨平台会绊人。
 */
async function npmPublishedVersion(name, version) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return undefined
    const data = await res.json()
    return typeof data?.version === 'string' ? data.version : undefined
  } catch {
    return undefined
  }
}

const packages = collectPackages()
const publishable = packages.filter((p) => !p.private)
const privatePkgs = packages.filter((p) => p.private)

if (publishable.length === 0) fail('没有找到任何可发布包，检查 collectPackages 的目录约定')

// ---- 1. 版本一致性 ----
const versions = new Set(publishable.map((p) => p.version))
const consistent = versions.size === 1
if (!consistent) {
  const detail = publishable.map((p) => `  ${p.name}@${p.version}`).join('\n')
  fail(
    `可发布包版本不一致（本仓要求固定版本）：\n${detail}\n` +
      '修复：把所有可发布包的 version 改成同一个值，并在同一次发布中全部推上去。',
  )
}
const version = consistent ? publishable[0]?.version : undefined

// ---- 2. tag 与版本一致（版本分叉时已报错，不再叠加一条误导性的 tag 对比）----
const tagVersion = resolveTagVersion()
if (tagVersion && version && tagVersion !== version) {
  fail(`tag 版本 ${tagVersion} 与包版本 ${version} 不一致。请先把版本号改成 ${tagVersion} 再打 tag。`)
}

// ---- 3. 元数据 ----
for (const pkg of publishable) {
  if (!pkg.version) fail(`${pkg.name} 缺少 version`)
  if (pkg.license !== 'MIT') fail(`${pkg.name} 的 license 应为 MIT，实际：${pkg.license ?? '(缺失)'}`)
  if (!pkg.files?.length) fail(`${pkg.name} 缺少 files 白名单（会把源码与测试一起发布）`)
  if (pkg.access !== 'public') fail(`${pkg.name} 的 publishConfig.access 应为 public，实际：${pkg.access ?? '(缺失)'}`)
  if (pkg.repositoryUrl && !pkg.repositoryUrl.includes(EXPECTED_REPO)) {
    fail(`${pkg.name} 的 repository.url 指向 ${pkg.repositoryUrl}，期望包含 ${EXPECTED_REPO}`)
  }
}

// ---- 输出 ----
console.log(`仓库：${repoRoot}`)
console.log(`可发布包 ${publishable.length} 个${consistent ? `，版本 ${version}` : '（版本不一致，详见下方报错）'}：`)
for (const pkg of publishable) console.log(`  - ${pkg.name}@${pkg.version}`)
if (privatePkgs.length) {
  console.log(`私有包 ${privatePkgs.length} 个（不发布）：${privatePkgs.map((p) => p.name).join(', ')}`)
}
if (tagVersion) console.log(`tag 校验：v${tagVersion}${version ? ` ↔ ${version}` : '（包版本不一致，跳过对比）'}`)

// ---- 4. 发布后核对：npm 上真的有这个版本（发布 workflow 在 publish 之后跑）----
if (process.argv.includes('--check-registry') && version) {
  console.log(`\n核对 npm 上的版本（共 ${publishable.length} 个包）：`)
  const found = await Promise.all(
    publishable.map(async (pkg) => ({ pkg, actual: await npmPublishedVersion(pkg.name, pkg.version) })),
  )
  for (const { pkg, actual } of found) {
    if (actual === pkg.version) {
      console.log(`  ✓ ${pkg.name}@${pkg.version}`)
    } else {
      console.log(`  ✗ ${pkg.name}@${pkg.version} 未在 npm 上生效（读到：${actual ?? '无'}）`)
      fail(`${pkg.name}@${pkg.version} 发布后未在 npm 上查到`)
    }
  }
}

if (failures.length > 0) {
  // 失败详情统一走 stdout：和上方摘要保持固定顺序（stderr 会先于 stdout 刷新，导致日志顺序颠倒）。
  console.log(`\n发布前置校验失败（${failures.length} 项）：`)
  for (const message of failures) console.log(`  ✗ ${message}`)
  process.exit(1)
}

console.log('\n发布前置校验通过 ✔')
