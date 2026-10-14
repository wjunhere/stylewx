#!/usr/bin/env node
/**
 * stylewx CLI —— 与 MCP 工具**共用同一份 service 实现**，不另写逻辑。
 *
 * 为什么要有 CLI：有些事不适合让 agent 通过 MCP 做 —— 尤其是**闸门类**命令。
 * `stylewx brand doctor` 需要在 CI / 提交前跑，退出码要能被 shell 读到；
 * 做成 MCP 工具就得由 agent 去解释输出，很容易「报错了也当成功」。
 *
 * 用法：
 *   stylewx brand list [--json]                     列出品牌档案
 *   stylewx brand doctor [name] [--fix] [--json]    三方一致性体检（退出码非零 = 不一致）
 *   stylewx brand pack <name> [--out <目录|文件>] [--version <v>] [--with-source]
 *   stylewx brand attach <name> --from <目录>       把 logo/封面落进品牌目录
 *   stylewx brand install <包|目录> [--as <名字>] [--new] [--json]
 *   stylewx brand validate <包|目录> [--json]       只校验（dry-run，不落盘）
 *
 * MCP server 入口仍是 `stylewx-mcp`（见 apps/mcp-server/src/index.ts）。
 *
 * ── 结构：纯函数 + 一层壳 ──────────────────────────────────────────────
 * `runCli(argv, io)` 是**纯的**：不读 process.argv、不写 process.stdout、不 process.exit，
 * 输出与退出码都从返回值走。原因很实际：旧版在模块顶层直接 `process.exit(main())`，
 * 于是**这个文件根本无法被 import** —— 它有 200 行闸门逻辑却一条测试都没有，
 * 改坏了只能靠人手动跑一遍（而手动跑最容易漏的就是退出码）。
 * 副作用现在只留在文件末尾那一层壳里。
 */
import { pathToFileURL } from 'node:url'
import {
  asServiceError,
  attachBrandAssets,
  brandDoctor,
  brandFix,
  brandList,
  installBrand,
  packBrand,
  validateBundle,
} from '@stylewx/service'

/** 输出与退出码的收集点（测试里换成数组收集器，就能断言每个字）。 */
export interface CliIo {
  out(text: string): void
  err(text: string): void
}

/** 默认 IO：直接写真实 stdout/stderr。 */
export const processIo: CliIo = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
}

export function usage(): string {
  return (
    [
      'stylewx CLI',
      '',
      '  stylewx brand list     [--json]                    列出品牌档案',
      '  stylewx brand doctor   [name] [--fix] [--json]     品牌三方一致性体检',
      '  stylewx brand pack     <name> [--out <目录|文件>] [--version <v>] [--with-source]',
      '  stylewx brand attach   <name> --from <目录>       把 logo/封面落进品牌目录',
      '  stylewx brand install  <包|目录> [--as <名字>] [--new] [--json]',
      '  stylewx brand validate <包|目录> [--json]          只校验，不落盘',
      '',
      '（MCP server 用 `stylewx-mcp` 启动；编辑器用 `pnpm stylewx:editor`。）',
      '',
    ].join('\n') + '\n'
  )
}

/** 取 `--opt value` 的值。 */
function option(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

/** 去掉命令名与 --flags（及其值），剩下的当作位置参数。 */
function positional(argv: string[], from: number): string[] {
  const out: string[] = []
  for (let i = from; i < argv.length; i += 1) {
    const a = argv[i] as string
    if (a.startsWith('--')) {
      if (['--out', '--version', '--from', '--as', '--engine'].includes(a)) i += 1
      continue
    }
    out.push(a)
  }
  return out
}

function printJson(io: CliIo, value: unknown): void {
  io.out(JSON.stringify(value, null, 2) + '\n')
}

/** brand 子命令组。返回进程退出码（0 = 成功，1 = 有错，2 = 用法问题）。 */
function brandCommand(argv: string[], io: CliIo, has: (flag: string) => boolean): number {
  const sub = argv[3]
  if (sub === 'list') {
    const result = brandList()
    if (has('--json')) printJson(io, result)
    else {
      if (!result.brands.length) io.out('没有品牌档案。\n')
      for (const b of result.brands) {
        io.out(`${b.name}${b.displayName ? `（${b.displayName}）` : ''} · 组件 ${b.componentCount} · 迭代 ${b.learningCount}\n  ${b.description}\n`)
      }
    }
    return 0
  }

  if (sub === 'doctor') {
    const [name] = positional(argv, 4)
    const fix = has('--fix')
    const json = has('--json')
    if (fix) {
      const repaired = brandFix(name ? { name } : {})
      if (!json) {
        if (repaired.docsSynced.length) io.out(`补写 brand.md 自动段：${repaired.docsSynced.join('、')}\n`)
        if (repaired.themesSynced.length) io.out(`同步主题副本：${repaired.themesSynced.join('、')}\n`)
        if (repaired.componentsSynced.length) io.out(`同步组件副本：${repaired.componentsSynced.join('、')}\n`)
        if (!repaired.docsSynced.length && !repaired.themesSynced.length && !repaired.componentsSynced.length) {
          io.out('无需修改\n')
        }
      }
    }
    const report = brandDoctor(name ? { name } : {})
    if (json) printJson(io, report)
    else {
      io.out(`品牌：${report.brands.join('、') || '无'}\n`)
      for (const issue of report.issues) {
        io.out(`${issue.severity === 'error' ? '✗' : '!'} [${issue.brand}] ${issue.message}\n    → ${issue.hint}\n`)
      }
      if (report.ok) io.out('✓ 三方一致（真源 ↔ 副本 ↔ brand.md 自动段）\n')
    }
    return report.ok ? 0 : 1
  }

  if (sub === 'pack') {
    const [name] = positional(argv, 4)
    if (!name) {
      io.err('用法：stylewx brand pack <name> [--out <目录|文件>] [--version <v>] [--with-source]\n')
      return 2
    }
    const result = packBrand(name, {
      out: option(argv, '--out'),
      version: option(argv, '--version'),
      engine: option(argv, '--engine'),
      withSource: has('--with-source'),
    })
    io.out(`已打包：${result.path}\n  ${result.manifest.files.length} 个文件 / ${Math.round(result.bytes / 1024)}KB / 版本 ${result.manifest.version}\n`)
    io.out(`  文件：${result.manifest.files.map((f) => f.path).join('、')}\n`)
    // 自包含预检：不拦打包（无法知道哪篇文章用了它），但「换环境就坏」必须说出口
    for (const w of result.warnings) io.out(`  ! ${w}\n`)
    return 0
  }

  if (sub === 'attach') {
    const [name] = positional(argv, 4)
    const from = option(argv, '--from')
    if (!name || !from) {
      io.err('用法：stylewx brand attach <name> --from <目录>\n')
      return 2
    }
    const result = attachBrandAssets(name, from)
    io.out(`已挂资产（${result.name}）：${result.attached.join('、')}\n`)
    if (result.missing.length) io.out(`  未找到（跳过）：${result.missing.join('、')}\n`)
    io.out(`  logo=${result.logo ?? '（无）'} coverImage=${result.coverImage ?? '（无）'}\n`)
    return 0
  }

  if (sub === 'validate') {
    const [source] = positional(argv, 4)
    if (!source) {
      io.err('用法：stylewx brand validate <包|目录>\n')
      return 2
    }
    const report = validateBundle(source)
    if (has('--json')) printJson(io, report)
    else {
      for (const f of report.files) io.out(`${f.ok ? '✓' : '✗'} ${f.path}${f.problem ? ` —— ${f.problem}` : ''}\n`)
      for (const i of report.issues) io.out(`✗ ${i}\n`)
      for (const w of report.warnings) io.out(`! ${w}\n`)
      if (report.ok) io.out(`✓ 品牌包合法：${report.manifest?.name} ${report.manifest?.version}（engine ${report.manifest?.engine}）\n`)
    }
    return report.ok ? 0 : 1
  }

  if (sub === 'install') {
    const [source] = positional(argv, 4)
    if (!source) {
      io.err('用法：stylewx brand install <包|目录> [--as <名字>] [--new]\n')
      return 2
    }
    const result = installBrand(source, { as: option(argv, '--as'), forceNew: has('--new') })
    if (has('--json')) printJson(io, result)
    else {
      io.out(`${result.upgraded ? '已升级' : '已安装'}品牌：${result.name}${result.displayName ? `（${result.displayName}）` : ''}\n`)
      io.out(`  来源：${result.source.origin} ${result.source.version}\n`)
      io.out(`  主题：${result.themeName}\n  组件：${result.components.join('、')}\n`)
      if (Object.keys(result.renamedFrom).length) {
        io.out('  组件撞名已改名（新名 → 原名）：\n')
        for (const [newName, oldName] of Object.entries(result.renamedFrom)) io.out(`    ${newName} → ${oldName}\n`)
      }
      for (const w of result.warnings) io.out(`  ! ${w}\n`)
    }
    return 0
  }

  io.out(usage())
  return 2
}

/**
 * 跑一条命令行，返回退出码（**不调用 process.exit**）。
 *
 * @param argv 完整 argv（含 node 与脚本路径，与 `process.argv` 同形）。
 */
export function runCli(argv: string[], io: CliIo = processIo): number {
  const command = argv[2]
  try {
    if (command === 'brand') {
      return brandCommand(argv, io, (name) => argv.includes(name))
    }
  } catch (error) {
    // CLI 的职责是把 service 的结构化错误渲染成一行可读的话（不是吞掉错误 —— 仍然非零退出）。
    const e = asServiceError(error).error
    io.err(`✗ ${e.code}: ${e.message}\n  → ${e.hint}\n`)
    return 1
  }
  io.out(usage())
  return 2
}

/** 把相对/绝对路径都归一成 file URL，用于判断「本文件是不是入口」。 */
function isEntry(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return import.meta.url === pathToFileURL(entry).href
  } catch {
    return false
  }
}

// ---- 副作用只留在这一层 ----
if (isEntry()) {
  process.exit(runCli(process.argv, processIo))
}
