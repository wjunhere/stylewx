/**
 * CLI 测试。
 *
 * 两层：
 *  1. `runCli` 是纯函数（不读 process.argv / 不写 stdout / 不 exit），所以能直接断言
 *     每个字与退出码 —— 这是**闸门类命令**的核心契约（退出码要能被 shell 读到）。
 *  2. 另有一条**真子进程**用例：`isEntry()` 守卫与 `process.exit` 那一层只有真跑才验证得到。
 *     （`runCli` 永远返回 0/1/2 是设计，但「真的以那个码退出」是另一件事。）
 *
 * 不用 mock：真建品牌、真打包、真写盘，只把品牌/主题/组件三层存储指到临时目录。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCli } from './cli.js'
import { brandApply, brandDoctor, brandSave, packBrand } from '@stylewx/service'
import type { CliIo } from './cli.js'

/** 收集输出，让测试能逐字断言。 */
function collector(): { io: CliIo; lines: string[]; errLines: string[] } {
  const lines: string[] = []
  const errLines: string[] = []
  return {
    lines,
    errLines,
    io: {
      out: (t: string) => lines.push(t),
      err: (t: string) => errLines.push(t),
    },
  }
}

/** 最小合法 PNG（1×1）—— 资产必须是真图片字节，服务端会验 magic bytes。 */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
    '0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex',
)

const THEME = {
  name: 'tide-notes',
  description: '测试品牌主题',
  tokens: {
    primaryColor: '#1D5C4A',
    textColor: '#2A2A26',
    fontSize: '15px',
    lineHeight: 1.85,
    fontFamily: 'Georgia, serif',
    spacing: { block: '20px' },
  },
  blocks: {
    h1: { 'font-size': '30px', color: '{{primaryColor}}', 'font-weight': 'bold' },
    h2: { 'font-size': '22px', color: '{{primaryColor}}', 'font-weight': 'bold' },
    p: { 'font-size': '15px', color: '{{textColor}}', 'line-height': '{{lineHeight}}' },
  },
}

/** 把主题副本改坏，制造可被 doctor 抓到的漂移。 */
function breakThemeCopy(): void {
  const file = process.env.STYLEWX_THEMES_PATH as string
  const themes = JSON.parse(readFileSync(file, 'utf8'))
  themes.themes.find((x: { name: string }) => x.name === 'tide-notes').tokens.primaryColor = '#000000'
  writeFileSync(file, JSON.stringify(themes, null, 2))
}

/** 真篡改 zip 内容：改掉指定条目名后面的一个字节（sha256 必然对不上）。 */
function tamperZipEntry(zipPath: string, entry: string): void {
  const buf = readFileSync(zipPath)
  const nameBytes = Buffer.from(entry, 'utf8')
  const at = buf.indexOf(nameBytes)
  if (at < 0) throw new Error(`zip 里找不到条目 ${entry}`)
  const target = at + nameBytes.length + 1
  buf[target] = (buf[target] as number) ^ 0xff
  writeFileSync(zipPath, buf)
}

describe('stylewx CLI', () => {
  let home: string
  let outDir: string
  let prev: Record<string, string | undefined>

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'stylewx-cli-'))
    outDir = mkdtempSync(join(tmpdir(), 'stylewx-cli-out-'))
    prev = {
      STYLEWX_BRANDS_PATH: process.env.STYLEWX_BRANDS_PATH,
      STYLEWX_THEMES_PATH: process.env.STYLEWX_THEMES_PATH,
      STYLEWX_COMPONENTS_PATH: process.env.STYLEWX_COMPONENTS_PATH,
    }
    process.env.STYLEWX_BRANDS_PATH = join(home, 'brands')
    process.env.STYLEWX_THEMES_PATH = join(home, 'themes.json')
    process.env.STYLEWX_COMPONENTS_PATH = join(home, 'components.json')
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(home, { recursive: true, force: true })
    rmSync(outDir, { recursive: true, force: true })
  })

  /**
   * 用 service 真建一个品牌（含身份位图与一个品牌组件）。
   * 组件默认不撞名；要测撞名就传 clash=true，让组件名与预置的全局组件同名。
   */
  function seedBrand(name = 'tide-notes', opts: { component?: string } = {}): string {
    const components = opts.component
      ? [{ name: opts.component, description: '品牌自带组件', template: `<blockquote>{{content}}</blockquote>` }]
      : undefined
    brandSave({
      name,
      displayName: '潮汐手记',
      description: '生活方式号，气质：温暖、治愈',
      rationale: '主色采自海边礁石的青苔绿，压低饱和度模拟油墨印刷质感',
      theme: { ...THEME, name },
      logo: 'assets/logo-a.png',
      components,
    })
    const dir = join(home, 'brands', name, 'assets')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'logo-a.png'), PNG)
    return join(home, 'brands', name)
  }

  /** 让目标环境已存在一个同名全局组件（制造撞名）。 */
  function seedGlobalComponent(name: string): void {
    writeFileSync(
      process.env.STYLEWX_COMPONENTS_PATH as string,
      JSON.stringify({ components: [{ name, description: '别人的组件', template: '<p>{{content}}</p>' }] }),
    )
  }

  // ---- 用法与参数 ----
  describe('用法与参数', () => {
    it('无命令 → 打印用法并以 2 退出', () => {
      const { io, lines, errLines } = collector()
      expect(runCli(['node', 'stylewx'], io)).toBe(2)
      expect(lines.join('')).toContain('stylewx CLI')
      expect(errLines).toEqual([])
    })

    it('未知子命令 → 用法 + 2', () => {
      const { io, lines } = collector()
      expect(runCli(['node', 'stylewx', 'brand', 'nope'], io)).toBe(2)
      expect(lines.join('')).toContain('stylewx CLI')
    })

    it('缺少必需参数 → 写 stderr 且退出码 2（用法问题不是执行失败）', () => {
      for (const argv of [
        ['brand', 'pack'],
        ['brand', 'attach', 'tide-notes'],
        ['brand', 'validate'],
        ['brand', 'install'],
      ]) {
        const { io, lines, errLines } = collector()
        expect(runCli(['node', 'stylewx', ...argv], io), argv.join(' ')).toBe(2)
        expect(errLines.join('')).toMatch(/用法：/)
        expect(lines).toEqual([])
      }
    })

    it('`--from` 的值不会被当成位置参数', () => {
      seedBrand()
      const seed = join(outDir, 'seed')
      mkdirSync(seed, { recursive: true })
      writeFileSync(join(seed, 'logo-a.png'), PNG)
      const { io, lines } = collector()
      expect(runCli(['node', 'stylewx', 'brand', 'attach', 'tide-notes', '--from', seed], io)).toBe(0)
      expect(lines.join('')).toContain('已挂资产（tide-notes）')
    })
  })

  // ---- list ----
  describe('brand list', () => {
    it('无档案时明说「没有」而不是打印空', () => {
      const { io, lines } = collector()
      expect(runCli(['node', 'stylewx', 'brand', 'list'], io)).toBe(0)
      expect(lines.join('')).toContain('没有品牌档案')
    })

    it('列出名称 / 组件数 / 迭代数', () => {
      seedBrand()
      brandApply('tide-notes')
      const { io, lines } = collector()
      expect(runCli(['node', 'stylewx', 'brand', 'list'], io)).toBe(0)
      const text = lines.join('')
      expect(text).toContain('tide-notes')
      expect(text).toContain('潮汐手记')
      expect(text).toMatch(/组件 \d+/)
    })

    it('--json 输出可解析的 JSON（agent 消费的是这一份）', () => {
      seedBrand()
      const { io, lines } = collector()
      expect(runCli(['node', 'stylewx', 'brand', 'list', '--json'], io)).toBe(0)
      const data = JSON.parse(lines.join(''))
      expect(data.brands.map((b: { name: string }) => b.name)).toContain('tide-notes')
    })
  })

  // ---- doctor：闸门语义 ----
  describe('brand doctor（闸门）', () => {
    it('一致 → 退出码 0 + 明确的一行「三方一致」', () => {
      seedBrand()
      brandApply('tide-notes')
      const { io, lines } = collector()
      expect(runCli(['node', 'stylewx', 'brand', 'doctor'], io)).toBe(0)
      expect(lines.join('')).toContain('✓ 三方一致')
    })

    it('不一致 → 退出码 1（这是 CI 拦发布的那一下）', () => {
      seedBrand()
      brandApply('tide-notes')
      breakThemeCopy()
      const { io, lines } = collector()
      expect(runCli(['node', 'stylewx', 'brand', 'doctor'], io)).toBe(1)
      const text = lines.join('')
      expect(text).toContain('✗')
      expect(text).toContain('→') // hint 必须打出来，否则人不知道怎么修
      expect(text).not.toContain('✓ 三方一致')
    })

    it('--fix 先修再体检 → 退出码 0，并说明修了什么', () => {
      seedBrand()
      brandApply('tide-notes')
      breakThemeCopy()
      const { io, lines } = collector()
      expect(runCli(['node', 'stylewx', 'brand', 'doctor', '--fix'], io)).toBe(0)
      const text = lines.join('')
      expect(text).toContain('同步主题副本')
      expect(text).toContain('✓ 三方一致')
      // 真修好了：副本回到真源的颜色
      expect(brandDoctor().ok).toBe(true)
    })

    it('--fix 无事可做时说「无需修改」（不要假装做了事）', () => {
      seedBrand()
      brandApply('tide-notes')
      const { io, lines } = collector()
      expect(runCli(['node', 'stylewx', 'brand', 'doctor', '--fix'], io)).toBe(0)
      expect(lines.join('')).toContain('无需修改')
    })

    it('--json 与人类输出互斥，JSON 里带 issues', () => {
      seedBrand()
      brandApply('tide-notes')
      breakThemeCopy()
      const { io, lines } = collector()
      expect(runCli(['node', 'stylewx', 'brand', 'doctor', '--json'], io)).toBe(1)
      const report = JSON.parse(lines.join(''))
      expect(report.ok).toBe(false)
      expect(report.issues.length).toBeGreaterThan(0)
    })

    it('指定单个品牌名时只查它', () => {
      seedBrand('tide-notes')
      seedBrand('ink-notes')
      brandApply('tide-notes')
      brandApply('ink-notes')
      const { io, lines } = collector()
      expect(runCli(['node', 'stylewx', 'brand', 'doctor', 'tide-notes', '--json'], io)).toBe(0)
      const report = JSON.parse(lines.join(''))
      expect(report.brands).toEqual(['tide-notes'])
    })
  })

  // ---- pack / validate / install：真链路 ----
  describe('pack → validate → install', () => {
    it('pack 打印产物路径 / 文件清单 / 版本', () => {
      seedBrand()
      const { io, lines } = collector()
      expect(runCli(['node', 'stylewx', 'brand', 'pack', 'tide-notes', '--out', outDir, '--version', '9.9.9'], io)).toBe(0)
      const text = lines.join('')
      expect(text).toContain('已打包')
      expect(text).toContain('tide-notes-9.9.9.brand')
      expect(text).toContain('版本 9.9.9')
      expect(text).toContain('assets/logo-a.png')
      expect(existsSync(join(outDir, 'tide-notes-9.9.9.brand'))).toBe(true)
    })

    it('validate 合法包 → 0，且逐文件打勾', () => {
      seedBrand()
      const { path } = packBrand('tide-notes', { out: outDir })
      const { io, lines } = collector()
      expect(runCli(['node', 'stylewx', 'brand', 'validate', path], io)).toBe(0)
      const text = lines.join('')
      expect(text).toContain('✓ brand.json')
      expect(text).toContain('✓ 品牌包合法')
    })

    it('validate 被篡改的包 → 1（拦在安装前）', () => {
      seedBrand()
      const { path } = packBrand('tide-notes', { out: outDir })
      tamperZipEntry(path, 'brand.md')
      const { io, lines } = collector()
      expect(runCli(['node', 'stylewx', 'brand', 'validate', path], io)).toBe(1)
      expect(lines.join('')).toMatch(/✗/)
    })

    it('install 到干净环境 → 0，资产与副本都落地，doctor 随即为绿', () => {
      seedBrand()
      const { path } = packBrand('tide-notes', { out: outDir })
      const fresh = mkdtempSync(join(tmpdir(), 'stylewx-cli-fresh-'))
      try {
        process.env.STYLEWX_BRANDS_PATH = join(fresh, 'brands')
        process.env.STYLEWX_THEMES_PATH = join(fresh, 'themes.json')
        process.env.STYLEWX_COMPONENTS_PATH = join(fresh, 'components.json')

        const { io, lines } = collector()
        expect(runCli(['node', 'stylewx', 'brand', 'install', path], io)).toBe(0)
        const text = lines.join('')
        expect(text).toContain('已安装品牌：tide-notes')
        expect(text).toContain('来源：')
        expect(existsSync(join(fresh, 'brands', 'tide-notes', 'assets', 'logo-a.png'))).toBe(true)
        expect(brandDoctor().ok).toBe(true)

        // 幂等：再装一次是「已升级」，不产生 -2
        const again = collector()
        expect(runCli(['node', 'stylewx', 'brand', 'install', path], again.io)).toBe(0)
        expect(again.lines.join('')).toContain('已升级品牌：tide-notes')
        expect(readdirSync(join(fresh, 'brands'))).toEqual(['tide-notes'])
      } finally {
        rmSync(fresh, { recursive: true, force: true })
      }
    })

    it('install --json 给出结构化结果', () => {
      seedBrand()
      const { path } = packBrand('tide-notes', { out: outDir })
      const fresh = mkdtempSync(join(tmpdir(), 'stylewx-cli-fresh2-'))
      try {
        process.env.STYLEWX_BRANDS_PATH = join(fresh, 'brands')
        process.env.STYLEWX_THEMES_PATH = join(fresh, 'themes.json')
        process.env.STYLEWX_COMPONENTS_PATH = join(fresh, 'components.json')
        const { io, lines } = collector()
        expect(runCli(['node', 'stylewx', 'brand', 'install', path, '--json'], io)).toBe(0)
        const data = JSON.parse(lines.join(''))
        expect(data.name).toBe('tide-notes')
        expect(data.upgraded).toBe(false)
        expect(data.renamedFrom).toEqual({})
      } finally {
        rmSync(fresh, { recursive: true, force: true })
      }
    })

    it('组件撞名时打出「新名 → 原名」，并确认对方组件没被覆盖', () => {
      // 品牌自带 tide-quote
      seedBrand('tide-notes', { component: 'tide-quote' })
      const { path } = packBrand('tide-notes', { out: outDir })

      // 目标环境必须是**另一个**：同一个环境里品牌已存在，那就成了「升级」，
      // 覆盖自己的组件本来就是对的（第一次写这条测试就踩了这个坑）。
      const fresh = mkdtempSync(join(tmpdir(), 'stylewx-cli-clash-'))
      try {
        process.env.STYLEWX_BRANDS_PATH = join(fresh, 'brands')
        process.env.STYLEWX_THEMES_PATH = join(fresh, 'themes.json')
        process.env.STYLEWX_COMPONENTS_PATH = join(fresh, 'components.json')
        seedGlobalComponent('tide-quote')

        const { io, lines } = collector()
        expect(runCli(['node', 'stylewx', 'brand', 'install', path], io)).toBe(0)
        const text = lines.join('')
        expect(text).toContain('已安装品牌：tide-notes') // 不是「已升级」
        expect(text).toContain('撞名已改名')
        // 对方的组件原样保留（这才是这条规则存在的理由）
        const comps = JSON.parse(readFileSync(process.env.STYLEWX_COMPONENTS_PATH as string, 'utf8'))
        expect(comps.components.find((c: { name: string }) => c.name === 'tide-quote').description).toBe('别人的组件')
        expect(comps.components.some((c: { name: string }) => c.name === 'tide-quote--tide-notes')).toBe(true)
      } finally {
        rmSync(fresh, { recursive: true, force: true })
      }
    })

    it('升级时沿用上次改的名，不叠 -2，也不回写覆盖对方的同名组件', () => {
      seedBrand('tide-notes', { component: 'tide-quote' })
      const { path } = packBrand('tide-notes', { out: outDir })
      const fresh = mkdtempSync(join(tmpdir(), 'stylewx-cli-up-'))
      try {
        process.env.STYLEWX_BRANDS_PATH = join(fresh, 'brands')
        process.env.STYLEWX_THEMES_PATH = join(fresh, 'themes.json')
        process.env.STYLEWX_COMPONENTS_PATH = join(fresh, 'components.json')
        seedGlobalComponent('tide-quote')

        expect(runCli(['node', 'stylewx', 'brand', 'install', path], collector().io)).toBe(0)
        // 第二次：升级
        const second = collector()
        expect(runCli(['node', 'stylewx', 'brand', 'install', path], second.io)).toBe(0)
        const text = second.lines.join('')
        expect(text).toContain('已升级品牌：tide-notes')
        // 关键不变量①：不叠出 -2（沿用上次改的名）。
        // 注：升级时仍会列出「新名 → 原名」——那是有用的提醒（这个名字与原文不同），
        // 不是重复告警；真正错的是名字越改越长，所以断言名字集合而不是文案。
        const comps = JSON.parse(readFileSync(process.env.STYLEWX_COMPONENTS_PATH as string, 'utf8'))
        const names = comps.components.map((c: { name: string }) => c.name).sort()
        expect(names).toEqual(['tide-quote', 'tide-quote--tide-notes'])
        // 关键不变量②：对方的同名组件始终没被覆盖
        expect(comps.components.find((c: { name: string }) => c.name === 'tide-quote').description).toBe('别人的组件')
      } finally {
        rmSync(fresh, { recursive: true, force: true })
      }
    })

    it('无撞名时不打「撞名已改名」那一段', () => {
      seedBrand()
      const { path } = packBrand('tide-notes', { out: outDir })
      const { io, lines } = collector()
      expect(runCli(['node', 'stylewx', 'brand', 'install', path], io)).toBe(0)
      expect(lines.join('')).not.toContain('撞名已改名')
    })
  })

  // ---- 错误渲染 ----
  describe('service 错误的渲染', () => {
    it('结构化错误 → 一行 code + message，hint 另起一行，退出码 1', () => {
      const { io, lines, errLines } = collector()
      expect(runCli(['node', 'stylewx', 'brand', 'pack', 'no-such-brand', '--out', outDir], io)).toBe(1)
      expect(errLines.join('')).toMatch(/✗ \w+:/)
      expect(errLines.join('')).toContain('→')
      expect(lines).toEqual([])
    })

    it('非法包渲染成可读输出而不是抛栈', () => {
      const fake = join(outDir, 'fake.brand')
      writeFileSync(fake, '这不是 zip')
      const { io, lines } = collector()
      expect(runCli(['node', 'stylewx', 'brand', 'validate', fake], io)).toBe(1)
      // validate 走返回报告而不是抛异常：issue 里应说明它读不了
      expect(lines.join('')).toMatch(/✗ .*不是有效的 zip/)
    })
  })
})

// ---- 真子进程：只有它验证得到 isEntry 守卫与 process.exit ----
describe('stylewx CLI（真子进程）', () => {
  const HERE = dirname(fileURLToPath(import.meta.url))
  // 测试跑 TS 源码，但**入口契约**属于构建产物（bin 指向 dist/cli.js）。
  // 这里刻意跑 dist：它才是用户 `npx stylewx` 时执行的东西。
  const CLI = resolve(HERE, '..', 'dist', 'cli.js')

  /** 以真进程跑 CLI，返回 { code, stdout, stderr }。 */
  function runReal(argv: string[]): { code: number; stdout: string; stderr: string } {
    try {
      const stdout = execFileSync(process.execPath, [CLI, ...argv], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      return { code: 0, stdout, stderr: '' }
    } catch (error) {
      const e = error as { status?: number; stdout?: string; stderr?: string }
      return { code: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
    }
  }

  it('dist 存在（没构建就先 pnpm build —— 明确报错而不是静默跳过）', () => {
    expect(existsSync(CLI), `CLI 产物不存在：${CLI} —— 先跑 pnpm build`).toBe(true)
  })

  it('真的以 2 退出（用法问题）', () => {
    const r = runReal([])
    expect(r.code).toBe(2)
    expect(r.stdout).toContain('stylewx CLI')
  })

  it('真的以 1 退出（执行失败）且错误走 stderr', () => {
    const r = runReal(['brand', 'pack', 'no-such-brand-xyz'])
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/✗/)
  })

  it('doctor 的退出码与 JSON 报告里的 ok 一致', () => {
    const r = runReal(['brand', 'doctor', '--json'])
    const report = JSON.parse(r.stdout)
    expect(r.code).toBe(report.ok ? 0 : 1)
  })

  it('被 import 时不执行主流程（守卫有效）—— 旧版做不到这点', () => {
    const probe = `
      import { runCli } from ${JSON.stringify(new URL('../dist/cli.js', import.meta.url).href)}
      const lines = []
      const code = runCli(['node', 'x'], { out: (t) => lines.push(t), err: () => {} })
      process.stdout.write(JSON.stringify({ code, hasUsage: lines.join('').includes('stylewx CLI') }))
    `
    const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', probe], { encoding: 'utf8' })
    const got = JSON.parse(stdout)
    expect(got.code).toBe(2)
    expect(got.hasUsage).toBe(true)
  })
})
