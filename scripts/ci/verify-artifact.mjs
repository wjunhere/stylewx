#!/usr/bin/env node
/**
 * verify-artifact.mjs —— 发布前「装产物真跑」闸门。
 *
 * ── 为什么需要这一步 ─────────────────────────────────────────────────────
 * `pnpm test` 跑的是 TypeScript 源码 + in-memory 传输；`check:pack` 只校验
 * tarball 的**文件清单**。两者都不检查**发布产物的行为**。
 *
 * 0.4.0 就是这么漏的：单测 22 个全绿、产物校验通过、dry-run 发布成功，
 * 但 `initialize` 握手返回的 serverInfo.version 是硬编码的 '0.1.0'，
 * 与包版本对不上——连发三个版本都没人发现，因为**没有任何测试读过握手返回值**。
 *
 * 所以这里做真实路径的端到端验证：
 *   1) 用 pnpm pack 打出真实 tarball（不经过 registry）
 *   2) 解到临时目录，用**解出来的 dist/** 起真实 stdio server 进程
 *   3) 连真实 Client，断言握手元数据与 package.json 一致、工具能满足最低要求
 *   4) 顺带校验 /editor 是自包含的（品牌令牌在、无外部 CDN、favicon 内联）
 *
 * 用法：
 *   node scripts/ci/verify-artifact.mjs                 # 校验 @stylewx/mcp-server
 *   node scripts/ci/verify-artifact.mjs --keep          # 保留临时目录（排查用）
 *
 * 说明：只解包、不 npm install——运行 MCP Server 只需要 @modelcontextprotocol/sdk，
 * 而它已经在仓库 devDependencies 里，通过 NODE_PATH 指过去即可，
 * 这样这个闸门不需要联网、也不需要装依赖，可以随时跑。
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const keep = process.argv.includes('--keep')

const failures = []
const note = (m) => console.log('  ' + m)
const pass = (m) => console.log('  ✓ ' + m)
const fail = (m) => {
  failures.push(m)
  console.log('  ✗ ' + m)
}

const pkgDir = join(repoRoot, 'apps/mcp-server')
const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
const expectedVersion = manifest.version

console.log(`verify-artifact: 校验 ${manifest.name}@${expectedVersion} 的真实发布产物\n`)

/* ── 1. 打包 ───────────────────────────────────────────────────────────
 * 不经 shell 直接 spawn 'pnpm' 在 Windows 上会 ENOENT：
 * D:\Nodejs\pnpm 是 POSIX shell 脚本（真正入口是 pnpm.CMD），execFileSync 不能执行它。
 * 所以用 shell:true 交给系统 shell 解析（参数无空格与特殊字符，不会被切碎）。 */
const work = mkdtempSync(join(tmpdir(), 'stylewx-verify-'))
console.log('打包')
try {
  execFileSync(
    `pnpm --filter ${manifest.name} pack --pack-destination "${work}"`,
    { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], shell: true },
  )
} catch (error) {
  fail(`pnpm pack 失败：${error.stderr?.toString().slice(0, 400) ?? error.message}`);
  process.exit(1)
}

const tarball = join(work, `${manifest.name.replace('@', '').replace('/', '-')}-${expectedVersion}.tgz`)
if (!existsSync(tarball)) {
  fail(`未生成预期的 tarball：${tarball}`);
  process.exit(1)
}
pass(`tarball 已生成（${(readFileSync(tarball).length / 1024).toFixed(1)} KB）`);

/* ── 2. 解包 ───────────────────────────────────────────────────────────
 * 必须传**文件名**并把 cwd 设到 work：直接传 Windows 绝对路径（C:\...）时，
 * GNU tar 会把盘符里的冒号当成“远程主机”（"Cannot connect to C: resolve failed"）。
 * 用 cwd + basename 就没有冒号，也就不需要 --force-local 这种 GNU 专属参数。 */
const unpacked = join(work, 'unpacked')
mkdirSync(unpacked, { recursive: true })
execFileSync('tar', ['-xzf', basename(tarball), '-C', 'unpacked'], { cwd: work, stdio: 'inherit' })
const pkgRoot = join(unpacked, 'package')
pass('tarball 已解包');

/* ── 3. 产物结构 ─────────────────────────────────────────────────────── */
console.log('\n产物结构')
const packedManifest = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))
packedManifest.version === expectedVersion
  ? pass(`包内版本一致：${packedManifest.version}`)
  : fail(`包内版本不一致：${packedManifest.version} ≠ ${expectedVersion}`)

for (const rel of ['dist/index.js', 'editor.html', 'LICENSE', 'README.md']) {
  existsSync(join(pkgRoot, rel)) ? pass(`包含 ${rel}`) : fail(`缺少 ${rel}`)
}

/* ── 4. 握手真跑 ─────────────────────────────────────────────────────── */
console.log('\n真跑 stdio server（真实进程 + 真实 Client）')

/**
 * 为解出来的包准备 node_modules。
 *
 * 不能靠 NODE_PATH：ESM 解析不读这个变量（CJS 才读），而本包是 ESM。
 * 也不能靠 npm install：那需要联网，而且会去 registry 拉 @stylewx/*，
 * 测的就不是本次要发的产物了。
 *
 * 所以把仓库里**已解析好**的依赖链接进解包目录：
 *   · 被测代码是本 tarball 里的 dist/（这是重点）
 *   · 兄弟包用仓库里构建好的版本（与本仓 dev 环境一致）
 * junction 在 Windows 上不需要管理员权限，也是 pnpm 自己的做法。
 *
 * 注意不能用 require.resolve('@stylewx/service/package.json')：
 * 这些包的 exports 只开放 "."，深路径 ./package.json 会抛 ERR_PACKAGE_PATH_NOT_EXPORTED。
 * 所以改用 require.resolve('<pkg>') 拿到入口文件，再往上找到包根。
 */
const { symlinkSync } = await import('node:fs')
const linkDir = join(pkgRoot, 'node_modules')
mkdirSync(linkDir, { recursive: true })

/**
 * 从 pnpm 的 node_modules 布局里找到依赖的真实目录。
 *
 * 不能 require.resolve(dep)：@modelcontextprotocol/sdk 是 CJS/ESM 双入口，
 * require.resolve 会去要 dist/cjs/index.js（本包只装了 esm）。
 * 也不能 require.resolve('<dep>/package.json')：部分包的 exports 不开放深路径，
 * 会抛 ERR_PACKAGE_PATH_NOT_EXPORTED。
 *
 * 所以直接用文件系统找：从某个起点目录逐层向上，看 node_modules/<dep> 是否存在。
 * 这与 Node 自身的查找规则一致，且不碰任何 exports 限制。
 */
function findDepDir(dep, startDirs) {
  for (const start of startDirs) {
    let dir = start
    for (let i = 0; i < 8; i++) {
      const candidate = join(dir, 'node_modules', dep)
      if (existsSync(join(candidate, 'package.json'))) return candidate
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return undefined
}

const searchFrom = [pkgDir, repoRoot]
const linked = []
const unresolved = []
for (const dep of Object.keys(packedManifest.dependencies ?? {})) {
  const real = findDepDir(dep, searchFrom)
  if (!real) {
    unresolved.push(dep)
    continue
  }
  const target = join(linkDir, dep)
  mkdirSync(dirname(target), { recursive: true })
  if (!existsSync(target)) symlinkSync(real, target, 'junction')
  linked.push(dep)
}
if (linked.length) pass(`已链接 ${linked.length} 个依赖供产物使用`);
if (unresolved.length) note(`未能解析（起进程时会真实暴露）：${unresolved.join(', ')}`);

// 不 npm install：SDK 与兄弟包通过上面的 junction 暴露给子进程，
// 这样闸门不需要联网，也不会去 registry 拉包。
const probe = `
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
const c = new Client({ name: 'verify-artifact', version: '0.0.0' })
await c.connect(new StdioClientTransport({
  command: process.execPath,
  args: [${JSON.stringify(join(pkgRoot, 'dist/index.js'))}, '--transport', 'stdio'],
}))
const info = c.getServerVersion()
const { tools } = await c.listTools()
console.log(JSON.stringify({ info, tools: tools.map((t) => t.name) }))
await c.close()
`
/**
 * probe 必须放在 pkgRoot 里，不能放临时目录根部。
 *
 * 原因：probe 自己也要 import '@modelcontextprotocol/sdk'，而 ESM 是从
 * **probe 所在目录**开始向上找 node_modules 的。之前把它放在临时目录根部，
 * 向上就会走到 %TEMP% → 用户目录 → 盘根，于是：
 *   · Windows 本地：盘根恰好有 C:\Users\wjun\node_modules（某个意外残留），侥幸通过
 *   · Linux CI：一路走到 / 都没有，直接 ERR_MODULE_NOT_FOUND
 * 放进 pkgRoot 后，会命中上面刚建的 junction（pkgRoot/node_modules），
 * 结果不再取决于机器上碰巧存在什么。
 */
const probeFile = join(pkgRoot, 'verify-probe.mjs')
writeFileSync(probeFile, probe, 'utf8')

let result
try {
  const out = execFileSync(process.execPath, [probeFile], {
    cwd: pkgRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 60_000,
  })
  // server 会往 stdout 打日志，取最后一行 JSON
  const line = out.trim().split('\n').filter((l) => l.startsWith('{')).pop()
  result = JSON.parse(line)
} catch (error) {
  fail(`起产物进程失败：${error.stderr?.toString().slice(0, 600) ?? error.message}`);
}

if (result) {
  note(`serverInfo = ${JSON.stringify(result.info)}`);

  // 这就是 0.4.0 漏掉的那条断言
  if (result.info?.name === 'stylewx') pass('serverInfo.name = stylewx')
  else fail(`serverInfo.name 应为 stylewx，实际 ${result.info?.name}`)

  if (result.info?.version === expectedVersion) {
    pass(`serverInfo.version 与 package.json 一致（${expectedVersion}）`);
  } else {
    fail(`serverInfo.version = ${result.info?.version} ≠ package.json 的 ${expectedVersion}`);
  }
  if (result.info?.version === 'dev') {
    fail('serverInfo.version 回退成了 "dev"，说明产物里读不到 package.json');
  }

  // 工具能列出来（不锁总数：工具会随版本增加，锁总数只会让闸门变噪音）
  const REQUIRED = ['list_themes', 'analyze_article', 'render_preview', 'validate_article', 'publish_draft']
  const missing = REQUIRED.filter((n) => !result.tools?.includes(n))
  missing.length === 0
    ? pass(`核心工具齐全（共 ${result.tools.length} 个）`)
    : fail(`缺少核心工具：${missing.join(', ')}`)
}

/* ── 5. 编辑器自包含 ─────────────────────────────────────────────────── */
console.log('\n编辑器产物')
const editorPath = join(pkgRoot, 'editor.html')
if (existsSync(editorPath)) {
  const html = readFileSync(editorPath, 'utf8')

  const TOKENS = ['--bg', '--surface', '--fg', '--muted', '--border', '--accent']
  const missingTokens = TOKENS.filter((t) => !new RegExp(`${t}\\s*:\\s*oklch\\(`).test(html))
  missingTokens.length === 0
    ? pass('六令牌齐备且为 oklch')
    : fail(`编辑器缺少令牌：${missingTokens.join(', ')}`)

  if (/rel="icon" href="data:image\/svg\+xml/.test(html)) {
    pass('favicon 内联（/editor 是独立页面）');
  } else {
    fail('favicon 不是内联 data URI');
  }

  // 自包含指「资源加载」不能指向网络；导航链接（页脚 GitHub）不算，离线只是不跳转。
  const externals = [...html.matchAll(/<(?!a\b)[a-z][^>]*\b(?:src|href)="(https?:\/\/[^"#]+)"/g)].map((m) => m[1])
  externals.length === 0
    ? pass('无外部 CDN 依赖（离线可用）')
    : fail(`编辑器存在外部依赖：${externals.slice(0, 3).join(', ')}`)

  // 强调预算：实底蓝只应出现在「发布草稿箱」
  const primaryIds = [...html.matchAll(/class="btn primary"[^>]*id="([^"]+)"/g)].map((m) => m[1])
  primaryIds.length === 1 && primaryIds[0] === 'pubBtn'
    ? pass('实底蓝只有一处：发布草稿箱')
    : fail(`实底蓝按钮应仅为 pubBtn，实际：${primaryIds.join(', ') || '无'}`)
} else {
  fail('editor.html 不在产物里（/editor 会起不来）');
}

/* ── 收尾 ────────────────────────────────────────────────────────────── */
if (keep) console.log(`\n临时目录保留于：${work}`)
else rmSync(work, { recursive: true, force: true })

if (failures.length) {
  console.error(`\n✗ ${failures.length} 项未通过：`)
  for (const f of failures) console.error('   ' + f)
  console.error('\n提示：单测全绿不代表产物可用，先修好再发布。')
  process.exit(1)
}
console.log('\n✓ 发布产物验证通过')
