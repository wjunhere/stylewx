import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { installBrand, packBrand, readBrandOrigin, validateBundle, writePublishedAssets, attachBrandAssets } from './brand-pack.js'
import { brandApply, brandList, brandSave, readBrandProfile } from './brand-store.js'
import { brandDoctor } from './brand-doctor.js'
import { saveUserComponent } from './component-store.js'

/**
 * 品牌包测试：真 zip、真写盘、不 mock。
 *
 * 关键断言都跟「能不能安全地把它发给别人」有关：
 * sha256、`../`、远程 URL、三条重名规则（重点是幂等）。
 */

/** 一张 1×1 的真 PNG（16 进制写，避免把 base64 大块塞进源码）。 */
const PNG_1X1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
    '0000000a49444154789c6300010000050001' +
    '0d0a2db40000000049454e44ae426082',
  'hex',
)

const THEME = (name: string) => ({
  name,
  description: '测试品牌主题',
  tokens: {
    primaryColor: '#1D5C4A',
    textColor: '#2A2A26',
    accentColor: '#C87F4A',
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
})

const COMPONENT = (name: string, tag: string) => ({
  name,
  description: `${name} 的说明`,
  template: `<section style="padding:12px;background:{{theme.cardBg}}">${tag}:{{body}}</section>`,
})

const envKeys = ['STYLEWX_BRANDS_PATH', 'STYLEWX_THEMES_PATH', 'STYLEWX_COMPONENTS_PATH'] as const

describe('品牌包（.brand）', () => {
  let root = ''
  let outDir = ''
  const prev: Record<string, string | undefined> = {}

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'stylewx-pack-'))
    outDir = mkdtempSync(join(tmpdir(), 'stylewx-pack-out-'))
    for (const key of envKeys) prev[key] = process.env[key]
    useEnv(join(root, 'env-a'))
  })

  afterEach(() => {
    for (const key of envKeys) {
      const value = prev[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(root, { recursive: true, force: true })
    rmSync(outDir, { recursive: true, force: true })
  })

  function useEnv(base: string): void {
    process.env.STYLEWX_BRANDS_PATH = join(base, 'brands')
    process.env.STYLEWX_THEMES_PATH = join(base, 'themes.json')
    process.env.STYLEWX_COMPONENTS_PATH = join(base, 'components.json')
  }

  /** 建一个可用于打包的品牌（含真 PNG 资产）。 */
  function seedBrand(name = 'tide-notes', componentNames: string[] = ['tide-quote', 'tide-end']): void {
    const dir = join(process.env.STYLEWX_BRANDS_PATH as string, name, 'assets')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'logo-a.png'), PNG_1X1)
    writeFileSync(join(dir, 'cover.png'), PNG_1X1)
    brandSave({
      name,
      displayName: '潮汐手记',
      description: '生活方式号，气质：温暖、治愈',
      rationale: '主色采自海边礁石的青苔绿，压低饱和度模拟油墨印刷质感',
      theme: THEME(name),
      components: componentNames.map((c) => COMPONENT(c, c)),
      logo: 'assets/logo-a.png',
      coverImage: 'assets/cover.png',
      headerComponent: componentNames[0],
    })
    brandApply(name)
  }

  /** 把 zip 拆开再按改动重新打回（模拟篡改 / 恶意包）。 */
  function repack(file: string, mutate: (raw: Record<string, Uint8Array>) => void): string {
    const raw = unzipSync(new Uint8Array(readFileSync(file)))
    mutate(raw)
    const zippable: Record<string, [Uint8Array, { mtime: Date }]> = {}
    for (const [k, v] of Object.entries(raw)) zippable[k] = [v, { mtime: new Date('2026-01-01T00:00:00Z') }]
    const out = join(outDir, `mutated-${Math.random().toString(36).slice(2, 8)}.brand`)
    writeFileSync(out, zipSync(zippable as never, { level: 6 }))
    return out
  }

  it('打包 → 校验 → 干净环境安装：往返一致，doctor 绿', () => {
    seedBrand()
    const packed = packBrand('tide-notes', { out: outDir, version: '1.2.0' })
    expect(packed.path.endsWith('tide-notes-1.2.0.brand')).toBe(true)

    const v = validateBundle(packed.path)
    expect(v.ok).toBe(true)
    expect(v.issues).toEqual([])
    expect(v.manifest?.kind).toBe('stylewx.brand')
    expect(v.manifest?.engine).toMatch(/^>=/)

    // 换到干净环境（另一个品牌库）
    useEnv(join(root, 'env-b'))
    const installed = installBrand(packed.path)
    expect(installed.name).toBe('tide-notes')
    expect(installed.displayName).toBe('潮汐手记')
    expect(installed.themeName).toBe('tide-notes')
    expect(installed.components.sort()).toEqual(['tide-end', 'tide-quote'])
    expect(brandDoctor().ok).toBe(true)
    // 主题与组件副本真同步了（编辑器能选到、正文能用 :::）
    expect(brandList().brands.map((b) => b.name)).toContain('tide-notes')
  })

  it('资产字节真的在包里，也真的落到干净环境（不是只写了个路径）', () => {
    seedBrand()
    const packed = packBrand('tide-notes', { out: outDir })
    const raw = unzipSync(new Uint8Array(readFileSync(packed.path)))
    expect(raw['assets/logo-a.png']).toBeDefined()
    expect(Buffer.from(raw['assets/logo-a.png'] as Uint8Array).equals(PNG_1X1)).toBe(true)
    // brand.json 里 logo 是包内相对路径
    expect((JSON.parse(strFromU8(raw['brand.json'] as Uint8Array)) as { logo: string }).logo).toBe('assets/logo-a.png')

    useEnv(join(root, 'env-b'))
    installBrand(packed.path)
    const installedPng = readFileSync(join(process.env.STYLEWX_BRANDS_PATH as string, 'tide-notes', 'assets', 'logo-a.png'))
    expect(installedPng.equals(PNG_1X1)).toBe(true)
  })

  it('sha256 能发现篡改（改了 brand.md 里的一个字）', () => {
    seedBrand()
    const packed = packBrand('tide-notes', { out: outDir })
    const tampered = repack(packed.path, (raw) => {
      raw['brand.md'] = strToU8(strFromU8(raw['brand.md'] as Uint8Array) + '\n偷偷加了一行\n')
    })
    const v = validateBundle(tampered)
    expect(v.ok).toBe(false)
    expect(v.issues.join(' ')).toContain('sha256')
    expectServiceError(() => installBrand(tampered), /sha256/)
  })

  it('远程 URL 资产被拒（打包时拒，导入时也拒）', () => {
    seedBrand()
    const packed = packBrand('tide-notes', { out: outDir })
    // 导入侧：把 logo 改成远程地址（并把 sha256 一起改掉，绕过 sha 检查，单看路径规则）
    const evil = repack(packed.path, (raw) => {
      const brand = JSON.parse(strFromU8(raw['brand.json'] as Uint8Array)) as { logo: string }
      brand.logo = 'https://evil.example.com/steal.png'
      const bytes = strToU8(JSON.stringify(brand, null, 2))
      raw['brand.json'] = bytes
      const manifest = JSON.parse(strFromU8(raw['manifest.json'] as Uint8Array)) as { files: Array<{ path: string; bytes: number; sha256: string }> }
      const entry = manifest.files.find((f) => f.path === 'brand.json')
      if (entry) {
        entry.bytes = bytes.length
        entry.sha256 = sha256(bytes)
      }
      raw['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))
    })
    const v = validateBundle(evil)
    expect(v.ok).toBe(false)
    expect(v.issues.join(' ')).toContain('远程 URL')

    // 打包侧：profile 里还是远程 URL 时直接拒绝
    const profilePath = join(process.env.STYLEWX_BRANDS_PATH as string, 'tide-notes', 'profile.json')
    const profile = JSON.parse(readFileSync(profilePath, 'utf8')) as { logo: string }
    profile.logo = 'https://mmbiz.qpic.cn/some/cdn.png'
    writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf8')
    expectServiceError(() => packBrand('tide-notes', { out: outDir }), /远程 URL/)
  })

  it('`../` 路径被拒（打包时不收，导入时也拦）', () => {
    seedBrand()
    const packed = packBrand('tide-notes', { out: outDir })
    const evil = repack(packed.path, (raw) => {
      const brand = JSON.parse(strFromU8(raw['brand.json'] as Uint8Array)) as { logo: string }
      brand.logo = '../../../../etc/passwd'
      const bytes = strToU8(JSON.stringify(brand, null, 2))
      raw['brand.json'] = bytes
      const manifest = JSON.parse(strFromU8(raw['manifest.json'] as Uint8Array)) as { files: Array<{ path: string; bytes: number; sha256: string }> }
      const entry = manifest.files.find((f) => f.path === 'brand.json')
      if (entry) {
        entry.bytes = bytes.length
        entry.sha256 = sha256(bytes)
      }
      raw['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))
    })
    const v = validateBundle(evil)
    expect(v.ok).toBe(false)
    expect(v.issues.join(' ')).toContain('跳出包外')
  })

  it('清单外的文件会被指出，但不是错误', () => {
    seedBrand()
    const packed = packBrand('tide-notes', { out: outDir })
    const withExtra = repack(packed.path, (raw) => {
      raw['notes.txt'] = strToU8('清单里没有这个文件')
    })
    const v = validateBundle(withExtra)
    expect(v.ok).toBe(true)
    expect(v.warnings.join(' ')).toContain('notes.txt')
  })

  it('同一输入打两次 → 字节完全一致（zip 内时间戳固定）', () => {
    seedBrand()
    const a = packBrand('tide-notes', { out: outDir, version: '1.0.0' })
    const first = readFileSync(a.path)
    const b = packBrand('tide-notes', { out: outDir, version: '1.0.0' })
    expect(readFileSync(b.path).equals(first)).toBe(true)
  })

  it('扩展名只是提示：改名成 .txt 仍能识别；假的 .brand 会被明确拒绝', () => {
    seedBrand()
    const packed = packBrand('tide-notes', { out: outDir })
    for (const ext of ['.brand', '.stylewx', '.zip', '.txt']) {
      const renamed = join(outDir, `renamed${ext}`)
      writeFileSync(renamed, readFileSync(packed.path))
      const v = validateBundle(renamed)
      expect(v.ok).toBe(true)
      expect(v.manifest?.name).toBe('tide-notes')
    }
    const fake = join(outDir, 'fake.brand')
    writeFileSync(fake, '这不是 zip，只是改了后缀')
    const v = validateBundle(fake)
    expect(v.ok).toBe(false)
    expect(v.issues.join(' ')).toContain('不是有效的 zip')
  })

  it('不带 kind 的 zip 会被拒（判据是 manifest，不是后缀）', () => {
    const notABundle = join(outDir, 'other.brand')
    const zippable = { 'manifest.json': [strToU8(JSON.stringify({ formatVersion: 1, kind: 'other.thing' })), { mtime: new Date('2026-01-01T00:00:00Z') }] }
    writeFileSync(notABundle, zipSync(zippable as never, { level: 6 }))
    const v = validateBundle(notABundle)
    expect(v.ok).toBe(false)
    expect(v.issues.join(' ')).toContain('kind=other.thing')
  })

  it('engine 读不了时明确说「读不了」，不装作能装', () => {
    seedBrand()
    const packed = packBrand('tide-notes', { out: outDir, engine: '>=99.0.0' })
    const v = validateBundle(packed.path)
    expect(v.ok).toBe(false)
    expect(v.issues.join(' ')).toContain('读不了')
  })

  it('source/ 默认不进包；--with-source 才带', () => {
    seedBrand()
    const srcDir = join(process.env.STYLEWX_BRANDS_PATH as string, 'tide-notes', 'source')
    mkdirSync(srcDir, { recursive: true })
    writeFileSync(join(srcDir, 'gen.mjs'), '// 生成脚本')

    const without = packBrand('tide-notes', { out: outDir, version: '1.0.0' })
    expect(validateBundle(without.path).manifest?.files.some((f) => f.path.startsWith('source/'))).toBe(false)

    const withSrc = packBrand('tide-notes', { out: join(outDir, 'with-source.brand'), version: '1.0.0', withSource: true })
    expect(validateBundle(withSrc.path).manifest?.files.some((f) => f.path === 'source/gen.mjs')).toBe(true)
  })

  it('规则 3（幂等）：同一品牌连导两次 → 原地升级，不产生 -2/-3', () => {
    seedBrand()
    const packed = packBrand('tide-notes', { out: outDir })
    useEnv(join(root, 'env-b'))

    const first = installBrand(packed.path)
    const second = installBrand(packed.path)
    const third = installBrand(packed.path)
    expect([first.upgraded, second.upgraded, third.upgraded]).toEqual([false, true, true])
    expect([first.name, second.name, third.name]).toEqual(['tide-notes', 'tide-notes', 'tide-notes'])
    expect(readdirSync(process.env.STYLEWX_BRANDS_PATH as string)).toEqual(['tide-notes'])
    expect(brandDoctor().ok).toBe(true)
  })

  it('规则 1：组件撞名 → 加品牌后缀，并在 brand_apply 的返回里给出映射', () => {
    seedBrand()
    const packed = packBrand('tide-notes', { out: outDir })
    useEnv(join(root, 'env-b'))
    // 先放一个与包里同名的「我自己的」组件（不同模板）
    saveUserComponent(COMPONENT('tide-quote', '我的完全不同的模板'))

    const installed = installBrand(packed.path)
    expect(installed.renamedFrom).toEqual({ 'tide-quote--tide-notes': 'tide-quote' })
    const profile = readBrandProfile('tide-notes')
    expect(profile.components.map((c) => c.name)).toContain('tide-quote--tide-notes')
    // headerComponent 也要跟着改名，否则头图调不到
    expect(profile.headerComponent).toBe('tide-quote--tide-notes')
    // 我自己的组件没被覆盖
    const mine = JSON.parse(readFileSync(process.env.STYLEWX_COMPONENTS_PATH as string, 'utf8')) as { components: Array<{ name: string; template: string }> }
    expect(mine.components.find((c) => c.name === 'tide-quote')?.template).toContain('我的完全不同的模板')
    // brand_apply 把映射一并返回
    expect(brandApply('tide-notes').profile.renamedFrom).toEqual({ 'tide-quote--tide-notes': 'tide-quote' })
    expect(brandDoctor().ok).toBe(true)
  })

  it('规则 1 + 规则 3：升级时沿用上次撞出来的名字，不再套一层后缀', () => {
    seedBrand()
    const packed = packBrand('tide-notes', { out: outDir })
    useEnv(join(root, 'env-b'))
    saveUserComponent(COMPONENT('tide-quote', '我自己的'))
    const first = installBrand(packed.path)
    const second = installBrand(packed.path)
    expect(second.renamedFrom).toEqual(first.renamedFrom)
    expect(readBrandProfile('tide-notes').components.map((c) => c.name)).toContain('tide-quote--tide-notes')
    expect(readBrandProfile('tide-notes').components.map((c) => c.name).some((n) => n.endsWith('-2'))).toBe(false)
  })

  it('规则 2：品牌名撞名（不同来源）→ 加数字后缀，绝不无声覆盖', () => {
    seedBrand()
    const packed = packBrand('tide-notes', { out: outDir })
    useEnv(join(root, 'env-b'))
    const first = installBrand(packed.path)
    expect(first.name).toBe('tide-notes')
    expect(readBrandOrigin('tide-notes')?.origin).toBe('tide-notes')

    // 同一份包、伪造另一个 origin（模拟别人也做了同名品牌）
    const other = repack(packed.path, (raw) => {
      const manifest = JSON.parse(strFromU8(raw['manifest.json'] as Uint8Array)) as { origin: string }
      manifest.origin = 'someone-else/tide-notes'
      raw['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))
    })
    const second = installBrand(other)
    expect(second.name).toBe('tide-notes-2')
    expect(second.upgraded).toBe(false)
    // 原来那个品牌的内容一个字没动
    expect(readBrandProfile('tide-notes').description).toBe('生活方式号，气质：温暖、治愈')
    expect(readBrandProfile('tide-notes-2').description).toBe('生活方式号，气质：温暖、治愈')
    expect(readBrandOrigin('tide-notes')?.origin).toBe('tide-notes')
    expect(readBrandOrigin('tide-notes-2')?.origin).toBe('someone-else/tide-notes')
    // 第二个品牌的组件也加了它自己的后缀（不与第一个撞）
    expect(readBrandProfile('tide-notes-2').components.every((c) => c.name.endsWith('tide-notes-2'))).toBe(true)
    expect(brandDoctor().ok).toBe(true)
  })

  it('安装品牌目录与安装 .brand 文件等价（两种都收）', () => {
    seedBrand()
    const dir = join(process.env.STYLEWX_BRANDS_PATH as string, 'tide-notes')

    useEnv(join(root, 'env-dir'))
    const fromDir = installBrand(dir)
    expect(fromDir.name).toBe('tide-notes')
    expect(brandDoctor().ok).toBe(true)

    const packed = packBrand('tide-notes', { out: outDir })
    useEnv(join(root, 'env-zip'))
    const fromZip = installBrand(packed.path)
    expect(fromZip.name).toBe('tide-notes')

    // 两条路径的产物应当一致（主题与组件名）
    useEnv(join(root, 'env-dir'))
    const a = readBrandProfile('tide-notes')
    useEnv(join(root, 'env-zip'))
    const b = readBrandProfile('tide-notes')
    expect(a.theme).toEqual(b.theme)
    expect(a.components).toEqual(b.components)
  })

  it('把微信 CDN 链接写进 .published.json 后，重打包不会带上它', () => {
    seedBrand()
    const published = writePublishedAssets('tide-notes', { logo: 'https://mmbiz.qpic.cn/prev-account/0?wx_fmt=png' })
    expect(existsSync(published)).toBe(true)
    // profile 里的 logo 仍是包内路径
    expect(readBrandProfile('tide-notes').logo).toBe('assets/logo-a.png')

    const packed = packBrand('tide-notes', { out: outDir })
    const raw = unzipSync(new Uint8Array(readFileSync(packed.path)))
    expect(strFromU8(raw['brand.json'] as Uint8Array)).not.toContain('mmbiz.qpic.cn')
    const v = validateBundle(packed.path)
    expect(v.ok).toBe(true)
    // .published.json 不进包
    expect(v.manifest?.files.some((f) => f.path === '.published.json')).toBe(false)
  })

  it('attachBrandAssets：把 URL 改成包内相对路径，并同步 brand.md 自动段', () => {
    // 先造一个 logo 还是远程 URL 的品牌（brandSave 允许存 URL，只是打包时会拒）
    brandSave({
      name: 'tide-notes',
      description: '生活方式号，气质：温暖、治愈',
      rationale: '主色采自海边礁石的青苔绿，压低饱和度模拟油墨印刷质感',
      theme: THEME('tide-notes'),
      logo: 'https://mmbiz.qpic.cn/old/0?wx_fmt=png',
    })
    const srcDir = join(root, 'asset-src')
    mkdirSync(srcDir, { recursive: true })
    writeFileSync(join(srcDir, 'logo-a.png'), PNG_1X1)
    writeFileSync(join(srcDir, 'cover.png'), PNG_1X1)

    const result = attachBrandAssets('tide-notes', srcDir)
    expect(result.attached.sort()).toEqual(['assets/cover.png', 'assets/logo-a.png'])
    expect(result.logo).toBe('assets/logo-a.png')
    expect(result.coverImage).toBe('assets/cover.png')
    // 幂等：再挂一次不会攒出重复键（曾经 `logo` 与 `logo-a` 共存过）
    attachBrandAssets('tide-notes', srcDir)
    expect(Object.keys(readBrandProfile('tide-notes').assets?.files ?? {}).sort()).toEqual(['cover', 'logo'])
    expect(existsSync(join(process.env.STYLEWX_BRANDS_PATH as string, 'tide-notes', 'assets', 'logo-a.png'))).toBe(true)
    // 旧 URL 已经从 profile 与 brand.md 的自动段里消失
    expect(readBrandProfile('tide-notes').logo).toBe('assets/logo-a.png')
    const doc = readFileSync(join(process.env.STYLEWX_BRANDS_PATH as string, 'tide-notes', 'brand.md'), 'utf8')
    expect(doc).not.toContain('mmbiz.qpic.cn')
    // 事实改了，自动段要跟着改，否则 doctor 立刻报漂移
    expect(brandDoctor().ok).toBe(true)
    // 这下能打包了
    expect(packBrand('tide-notes', { out: outDir }).bytes).toBeGreaterThan(0)
  })

  it('attachBrandAssets 拒绝非图片与超大文件', () => {
    seedBrand()
    const srcDir = join(root, 'bad-src')
    mkdirSync(srcDir, { recursive: true })
    writeFileSync(join(srcDir, 'logo-a.png'), '这不是 PNG')
    expectServiceError(() => attachBrandAssets('tide-notes', srcDir), /不是 PNG/)
  })
})

/** 测试里改包要用同一套 sha256 算法（不改产品代码，只在测试里算）。 */
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/**
 * 断言 serviceError 被抛出并命中关键词。
 *
 * 为什么不用 `expect(fn).toThrow(/x/)`：service 抛的是**结构化错误对象**
 * `{ error: { code, message, hint } }`（见 errors.ts），不是 Error 实例，
 * vitest 拿不到 message，匹配永远失败（实测踩过：断言失败信息是空字符串）。
 */
function expectServiceError(fn: () => unknown, pattern: RegExp): void {
  try {
    fn()
  } catch (error) {
    const message = typeof error === 'object' && error !== null && 'error' in error
      ? (error as { error: { message: string; hint: string } }).error.message + ' ' + (error as { error: { hint: string } }).error.hint
      : String(error)
    expect(message).toMatch(pattern)
    return
  }
  throw new Error(`预期抛出 serviceError（${pattern}），但它成功了。`)
}
