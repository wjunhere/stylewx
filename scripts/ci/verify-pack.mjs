#!/usr/bin/env node
/**
 * 校验 npm 发布产物（tarball）内容，CI 与本地都能跑。
 *
 * 背景：`package.json#files` 写错时，npm 不会报错——它只是安静地少打包（运行时报
 * MODULE_NOT_FOUND）或者多打包（把源码/密钥一起发出去）。所以要在发布前把 tarball 拆开看。
 *
 * 检查项：
 *   1. tarball 数量与可发布包一一对应（没有漏包 / 多个版本）
 *   2. 每个 tarball 内的 package.json 名字与版本，与磁盘上的 manifest 一致
 *   3. 关键运行时文件在包内（例：@stylewx/mcp-server 必须带 editor.html，否则 /editor 起不来）
 *   4. 不漏发 LICENSE、不带 .env / 私钥等敏感文件
 *
 * 用法：
 *   node scripts/ci/verify-pack.mjs <pack目录>     # 目录里放着 pnpm -r pack 的产物
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** 每个包「必须真的被打进 tarball」的文件。改 files 或改构建产物位置时同步更新这里。 */
const REQUIRED_FILES = {
  '@stylewx/mcp-server': ['package/dist/index.js', 'package/editor.html'],
  '@stylewx/api': ['package/dist/index.js'],
  '@stylewx/core': ['package/dist/index.js'],
  '@stylewx/components': ['package/dist/index.js'],
  '@stylewx/theme': ['package/dist/index.js'],
  '@stylewx/validator': ['package/dist/index.js'],
  '@stylewx/service': ['package/dist/index.js'],
  '@stylewx/publisher': ['package/dist/index.js'],
  '@stylewx/preview': ['package/dist/index.js'],
}

/** 绝不允许出现在发布产物里的路径特征。 */
const FORBIDDEN_PATTERNS = [
  { re: /(^|\/)\.env(\.|$)/, why: '环境变量文件可能含真实凭据' },
  { re: /(^|\/)(id_rsa|id_ed25519)$/, why: '私钥' },
  { re: /\.pem$/, why: '证书/私钥' },
  { re: /(^|\/)\.npmrc$/, why: '可能含 npm token' },
]

const failures = []
const fail = (m) => failures.push(m)

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function collectAll() {
  const out = []
  // 仓根自身也是一个包（private），必须纳入：pnpm -r pack 会连它一起打包，
  // 而它没有 files 白名单，一旦入包就会带走源码与示例。
  const rootManifestPath = join(repoRoot, 'package.json')
  if (existsSync(rootManifestPath)) {
    const rootManifest = readJson(rootManifestPath)
    if (rootManifest.name) out.push(rootManifest)
  }
  for (const group of ['packages', 'apps']) {
    const groupDir = join(repoRoot, group)
    if (!existsSync(groupDir)) continue
    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const manifestPath = join(groupDir, entry.name, 'package.json')
      if (!existsSync(manifestPath)) continue
      const manifest = readJson(manifestPath)
      if (manifest.name) out.push(manifest)
    }
  }
  return out
}

/**
 * 列出 tarball 内的文件。
 *
 * 注意：必须传**文件名**并以 packDir 为 cwd。Git Bash 的 GNU tar 会把绝对路径
 * `C:\...` 当成 `主机:路径` 解析（报 connect failed），相对路径则两边平台都正常。
 */
function listTarball(filename, cwd) {
  const stdout = execFileSync('tar', ['-tzf', filename], { cwd, encoding: 'utf8' })
  return stdout.split(/\r?\n/).filter(Boolean)
}

function readTarballEntry(filename, entry, cwd) {
  return execFileSync('tar', ['-xzOf', filename, entry], { cwd, encoding: 'utf8' })
}

const packDirArg = process.argv[2]
if (!packDirArg) {
  console.error('用法：node scripts/ci/verify-pack.mjs <pack目录>')
  process.exit(2)
}
const packDir = resolve(packDirArg)
if (!existsSync(packDir)) {
  console.error(`pack 目录不存在：${packDir}`)
  process.exit(2)
}

const allManifests = collectAll()
const manifests = allManifests.filter((m) => m.private !== true)
const privateNames = new Set(allManifests.filter((m) => m.private === true).map((m) => m.name))
const tarballs = readdirSync(packDir).filter((f) => f.endsWith('.tgz'))

// 断言 1：数量对得上（漏一个包 = 线上依赖装不上）
if (tarballs.length !== manifests.length) {
  fail(`tarball 数量 ${tarballs.length} 与可发布包数量 ${manifests.length} 不一致：${tarballs.join(', ')}`)
}

for (const tarball of tarballs) {
  // private 包（尤其是仓根：files 未声明 = 几乎全部入包）绝不应被打包/发布。
  // 用 name-version.tgz 精确匹配，不能拿包名做前缀（`stylewx-` 会误命中 `stylewx-theme-...`）。
  const owner = allManifests.find((m) => tarball === `${m.name.replace('@', '').replace('/', '-')}-${m.version}.tgz`)
  if (owner && privateNames.has(owner.name)) {
    fail(`private 包 ${owner.name} 被打包成了 ${tarball}：` + '包未声明 files 白名单时会把源码/示例/构建中间产物一起带走，不允许进入发布流程。')
  }
}

const seen = new Set()
for (const manifest of manifests) {
  // tarball 文件名由包名推导：@scope/name → scope-name-version.tgz
  const base = manifest.name.replace('@', '').replace('/', '-')
  const expected = `${base}-${manifest.version}.tgz`
  if (!tarballs.includes(expected)) {
    fail(`缺少 ${manifest.name}@${manifest.version} 的 tarball（期望文件名 ${expected}）`)
    continue
  }
  seen.add(expected)

  const files = listTarball(expected, packDir)

  // 断言 2：包内 manifest 与磁盘一致（防止 pack 缓存了旧版本号）
  const packedManifestEntry = files.find((f) => f === 'package/package.json')
  if (!packedManifestEntry) {
    fail(`${expected} 内没有 package/package.json`)
  } else {
    const packed = JSON.parse(readTarballEntry(expected, 'package/package.json', packDir))
    if (packed.name !== manifest.name || packed.version !== manifest.version) {
      fail(`${expected} 内 manifest 为 ${packed.name}@${packed.version}，磁盘上是 ${manifest.name}@${manifest.version}`)
    }
  }

  // 断言 3：关键运行时文件
  for (const required of REQUIRED_FILES[manifest.name] ?? []) {
    if (!files.includes(required)) fail(`${manifest.name} 缺少必需文件 ${required}`)
  }

  // 断言 4：LICENSE 必须带上（MIT 要求随分发保留许可声明）
  if (!files.includes('package/LICENSE')) fail(`${manifest.name} 未包含 LICENSE`)

  // 断言 5：敏感文件不得入包
  for (const file of files) {
    for (const { re, why } of FORBIDDEN_PATTERNS) {
      if (re.test(file)) fail(`${manifest.name} 含敏感文件 ${file}（${why}）`)
    }
  }

  console.log(`  ✓ ${expected}（${files.length} 个文件）`)
}

for (const tarball of tarballs) {
  if (!seen.has(tarball)) fail(`存在未能对应到任何包的 tarball：${tarball}`)
}

if (failures.length > 0) {
  console.log(`\n发布产物校验失败（${failures.length} 项）：`)
  for (const m of failures) console.log(`  ✗ ${m}`)
  process.exit(1)
}

console.log(`\n发布产物校验通过 ✔（${tarballs.length} 个包）`)
