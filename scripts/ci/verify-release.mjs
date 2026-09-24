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
 *
 * --check-registry 会轮询等待（npm 对新版本是异步处理的），
 * 超时可用 VERIFY_REGISTRY_TIMEOUT_MS / VERIFY_REGISTRY_INTERVAL_MS 调整。
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 等待版本在 registry 上可见。
 *
 * npm 对新发布版本是**异步处理**的（publish 会回「Your package is being processed and may
 * take a few minutes to become available」），所以发布后立刻回查会得到 404。必须轮询，
 * 否则会把「刚发完还在处理」误判成「发布失败」。
 *
 * 超时时间可用 VERIFY_REGISTRY_TIMEOUT_MS 覆盖（测试/调试用）。
 */
async function waitForVersions(pkgs) {
  const timeoutMs = Number(process.env.VERIFY_REGISTRY_TIMEOUT_MS ?? 240_000)
  const intervalMs = Number(process.env.VERIFY_REGISTRY_INTERVAL_MS ?? 10_000)
  const deadline = Date.now() + timeoutMs
  const live = new Set()
  let pending = pkgs

  for (;;) {
    const checked = await Promise.all(
      pending.map(async (pkg) => ({ pkg, actual: await npmPublishedVersion(pkg.name, pkg.version) })),
    )
    const stillPending = []
    for (const { pkg, actual } of checked) {
      if (actual === pkg.version) live.add(pkg.name)
      else stillPending.push(pkg)
    }
    pending = stillPending
    if (pending.length === 0 || Date.now() >= deadline) break
    console.log(`  … ${pending.length} 个包尚未可见，${intervalMs / 1000}s 后重试（npm 处理新版本是异步的）`)
    await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())))
  }
  return live
}

/**
 * 轮询超时后的最终复核，用一个更全的查询再确认一次。
 *
 * 为什么需要：轮询走的是 `/<name>/<version>` 精确端点，个别包（实测 @stylewx/api@0.5.0）
 * 会比同批其它包晚几分钟才在**该端点**可见——registry 的 CDN 复制是逐包的，不是原子的。
 * 而 packument（`/<name>` 整包文档）与 dist-tags 由源站直接供数，往往先于精确端点就绪。
 * 所以「精确端点 404」≠「没发出去」：不经这一步就把超时判成失败，是误报
 * （会让人怀疑发布坏了，甚至重发一遍）。
 *
 * 返回值：true = 已确认可见（误报，降级为警告）；false = 两条路径都查不到（真失败）。
 */
async function confirmViaPackument(name, version) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: 'application/vnd.npm.install-v1+json' },
    })
    if (!res.ok) return false
    const data = await res.json()
    return data?.versions?.[version] != null || data?.['dist-tags']?.latest === version
  } catch {
    return false
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
  const live = await waitForVersions(publishable)
  const warned = []
  for (const pkg of publishable) {
    if (live.has(pkg.name)) {
      console.log(`  ✓ ${pkg.name}@${pkg.version}`)
      continue
    }
    console.log(`  … ${pkg.name}@${pkg.version} 轮询超时，换 packument 最终复核…`)
    const confirmed = await confirmViaPackument(pkg.name, pkg.version)
    if (confirmed) {
      // 复制延迟的误报：包在 npm 上是真实存在的，不能算失败，否则会诱导重复发布
      console.log(`  ✓ ${pkg.name}@${pkg.version}（精确端点延迟，packument 已确认可见）`)
      warned.push(pkg.name)
    } else {
      console.log(`  ✗ ${pkg.name}@${pkg.version} 两条查询路径均不可见`)
      fail(`${pkg.name}@${pkg.version} 发布后未在 npm 上查到（已轮询等待并复核，不是「刚发完还在处理」）`)
    }
  }
  if (warned.length) {
    console.log(`  · 提示：${warned.join(', ')} 的精确端点有复制延迟（不影响安装与解析），稍后自会就绪`)
  }
}

if (failures.length > 0) {
  // 失败详情统一走 stdout：和上方摘要保持固定顺序（stderr 会先于 stdout 刷新，导致日志顺序颠倒）。
  console.log(`\n发布前置校验失败（${failures.length} 项）：`)
  for (const message of failures) console.log(`  ✗ ${message}`)
  process.exit(1)
}

console.log('\n发布前置校验通过 ✔')
