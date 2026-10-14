import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brandDoctor, brandFix, brandOverview } from './brand-doctor.js'
import { brandApply, brandSave } from './brand-store.js'
import { listSavedThemes } from './theme-store.js'
import { listUserComponents, saveUserComponent } from './component-store.js'

/**
 * 真链路测试：用 brandSave 真写盘（品牌目录 + 主题库 + 组件库），
 * 再人为制造漂移，看 doctor 是否报出、--fix 是否修好。
 *
 * 不 mock 任何东西 —— 漂移是这套闸门唯一要抓的东西，用假数据测等于没测。
 *
 * 隔离用**环境变量**（STYLEWX_BRANDS_PATH / STYLEWX_THEMES_PATH / STYLEWX_COMPONENTS_PATH），
 * 不用 options 传参：brandSave / brandApply 内部的组件校验路径不接受组件库选项，
 * 传 options 会漏出真实 ~/.stylewx（实测把 tide-notes 写进了用户的主题库）。
 */
describe('brand doctor', () => {
  let dir = ''
  let themesFile = ''
  let componentsFile = ''
  const prev = { brands: process.env.STYLEWX_BRANDS_PATH, themes: process.env.STYLEWX_THEMES_PATH, comps: process.env.STYLEWX_COMPONENTS_PATH }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'stylewx-doctor-brands-'))
    themesFile = join(mkdtempSync(join(tmpdir(), 'stylewx-doctor-themes-')), 'themes.json')
    componentsFile = join(mkdtempSync(join(tmpdir(), 'stylewx-doctor-comps-')), 'components.json')
    process.env.STYLEWX_BRANDS_PATH = dir
    process.env.STYLEWX_THEMES_PATH = themesFile
    process.env.STYLEWX_COMPONENTS_PATH = componentsFile
  })

  afterEach(() => {
    for (const [key, value] of [['STYLEWX_BRANDS_PATH', prev.brands], ['STYLEWX_THEMES_PATH', prev.themes], ['STYLEWX_COMPONENTS_PATH', prev.comps]] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(dir, { recursive: true, force: true })
    rmSync(join(themesFile, '..'), { recursive: true, force: true })
    rmSync(join(componentsFile, '..'), { recursive: true, force: true })
  })

  const THEME = {
    name: 'tide-notes',
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
  }

  const COMPONENT = {
    name: 'tide-quote',
    description: '潮汐金句卡',
    template: '<section style="padding:12px;background:{{theme.cardBg}}">{{body}}</section>',
  }

  /** 建立一份「三方一致」的品牌档案（brandSave 写品牌目录 + 主题库，brandApply 补组件库）。 */
  function saveBrand(): void {
    // logo 声明为包内相对路径 —— 那就必须真的存在，否则 doctor 会（正确地）报 asset_missing。
    const assetsDir = join(dir, 'tide-notes', 'assets')
    mkdirSync(assetsDir, { recursive: true })
    writeFileSync(join(assetsDir, 'logo-a.png'), Buffer.from('89504e470d0a1a0a', 'hex'))
    brandSave({
      name: 'tide-notes',
      displayName: '潮汐手记',
      description: '生活方式号，气质：温暖、治愈',
      rationale: '主色采自海边礁石的青苔绿，压低饱和度模拟油墨印刷质感',
      theme: THEME,
      components: [COMPONENT],
      logo: 'assets/logo-a.png',
    })
    brandApply('tide-notes')
  }

  const doctor = () => brandDoctor()
  const fix = () => brandFix()

  it('刚保存的品牌三方一致', () => {
    saveBrand()
    const report = doctor()
    expect(report.brands).toEqual(['tide-notes'])
    expect(report.issues).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('brand.md 自动段被人为改坏 → 报 doc_drift，--fix 修回', () => {
    saveBrand()
    const docPath = join(dir, 'tide-notes', 'brand.md')
    const doc = readFileSync(docPath, 'utf8')
    expect(doc).toContain('| 主色 primary | `#1D5C4A` |')
    writeFileSync(docPath, doc.replace('`#1D5C4A`', '`#FF00FF`'), 'utf8')

    const report = doctor()
    expect(report.ok).toBe(false)
    const issue = report.issues.find((i) => i.kind === 'doc_drift')
    expect(issue?.target).toBe('palette')
    expect(issue?.message).toContain('不一致')

    const fixed = fix()
    expect(fixed.docsSynced).toContain('tide-notes')
    expect(readFileSync(docPath, 'utf8')).toContain('| 主色 primary | `#1D5C4A` |')
    expect(doctor().ok).toBe(true)
  })

  it('主题副本被改坏 → 报 theme_drift，--fix 按真源覆盖回来', () => {
    saveBrand()
    const stored = listSavedThemes().themes
    const broken = stored.map((t) => (t.name === 'tide-notes' ? { ...t, tokens: { ...t.tokens, primaryColor: '#FF00FF' } } : t))
    writeFileSync(themesFile, JSON.stringify({ themes: broken }, null, 2), 'utf8')

    expect(doctor().issues.some((i) => i.kind === 'theme_drift')).toBe(true)

    fix()
    expect(listSavedThemes().themes.find((t) => t.name === 'tide-notes')?.tokens.primaryColor).toBe('#1D5C4A')
    expect(doctor().ok).toBe(true)
  })

  it('主题副本整个缺失 → 报 theme_missing（编辑器里选不到这个品牌）', () => {
    saveBrand()
    writeFileSync(themesFile, JSON.stringify({ themes: [] }, null, 2), 'utf8')
    expect(doctor().issues.some((i) => i.kind === 'theme_missing')).toBe(true)
    fix()
    expect(listSavedThemes().themes.map((t) => t.name)).toContain('tide-notes')
  })

  it('组件副本缺失 → 报 component_missing，--fix 补齐', () => {
    saveBrand()
    writeFileSync(componentsFile, JSON.stringify({ components: [] }, null, 2), 'utf8')
    expect(doctor().issues.some((i) => i.kind === 'component_missing' && i.target === 'tide-quote')).toBe(true)
    fix()
    expect(listUserComponents().map((c) => c.name)).toContain('tide-quote')
    expect(doctor().ok).toBe(true)
  })

  it('组件副本被改坏 → 报 component_drift（真源是品牌目录）', () => {
    saveBrand()
    const stored = listUserComponents()
    const broken = stored.map((c) => (c.name === 'tide-quote' ? { ...c, template: '<section>被人手改过</section>' } : c))
    writeFileSync(componentsFile, JSON.stringify({ components: broken }, null, 2), 'utf8')
    expect(doctor().issues.some((i) => i.kind === 'component_drift')).toBe(true)
    fix()
    expect(listUserComponents().find((c) => c.name === 'tide-quote')?.template).toBe(COMPONENT.template)
    expect(doctor().ok).toBe(true)
  })

  it('品牌目录里只有空目录（没有 profile.json）→ 报 profile_missing', () => {
    mkdirSync(join(dir, 'ghost'), { recursive: true })
    const report = doctor()
    expect(report.brands).toContain('ghost')
    expect(report.issues.some((i) => i.brand === 'ghost' && i.kind === 'profile_missing')).toBe(true)
  })

  it('brand.md 被人删掉 → 报 doc_missing，--fix 重新生成', () => {
    saveBrand()
    const docPath = join(dir, 'tide-notes', 'brand.md')
    rmSync(docPath)
    expect(doctor().issues.some((i) => i.kind === 'doc_missing')).toBe(true)
    fix()
    expect(existsSync(docPath)).toBe(true)
    expect(doctor().ok).toBe(true)
  })

  it('brand.md 里漏了闭合标记 → 报 doc_unpaired', () => {
    saveBrand()
    const docPath = join(dir, 'tide-notes', 'brand.md')
    const doc = readFileSync(docPath, 'utf8').replace('<!-- /stylewx:auto -->', '', )
    writeFileSync(docPath, doc, 'utf8')
    expect(doctor().issues.some((i) => i.kind === 'doc_unpaired')).toBe(true)
  })

  it('--fix 不碰 profile.json（真源只能由 brand_save 改）', () => {
    saveBrand()
    const profilePath = join(dir, 'tide-notes', 'profile.json')
    const before = readFileSync(profilePath, 'utf8')
    writeFileSync(join(dir, 'tide-notes', 'brand.md'), '被人改坏的文档', 'utf8')
    fix()
    expect(readFileSync(profilePath, 'utf8')).toBe(before)
  })

  it('人写段与 profile 不一致只给警告，不拦闸门', () => {
    saveBrand()
    const docPath = join(dir, 'tide-notes', 'brand.md')
    writeFileSync(docPath, readFileSync(docPath, 'utf8').replace('生活方式号，气质：温暖、治愈', '另一种定位'), 'utf8')
    const report = doctor()
    expect(report.issues.some((i) => i.kind === 'doc_human_drift' && i.severity === 'warning')).toBe(true)
    expect(report.ok).toBe(true)
  })

  it('brandOverview 返回编辑器需要的字段（含 doc 与组件名）', () => {
    saveBrand()
    const { brands } = brandOverview()
    expect(brands).toHaveLength(1)
    const b = brands[0]!
    expect(b.name).toBe('tide-notes')
    expect(b.displayName).toBe('潮汐手记')
    expect(b.components).toEqual(['tide-quote'])
    expect(b.logo).toBe('assets/logo-a.png')
    expect(b.theme.tokens.primaryColor).toBe('#1D5C4A')
    expect(b.doc).toContain('<!-- stylewx:auto palette -->')
  })

  // ---- 游离组件：在全局库里、不属于任何品牌，所以不会随 .brand 包走 ----
  describe('游离组件', () => {
    /** 再存一个品牌（组件带共同前缀），让前缀推导有足够样本。 */
    function saveBrandWith(names: string[]): void {
      brandSave({
        name: 'tide-notes',
        displayName: '潮汐手记',
        description: '生活方式号，气质：温暖、治愈',
        rationale: '主色采自海边礁石的青苔绿，压低饱和度模拟油墨印刷质感',
        theme: THEME,
        components: names.map((n) => ({ ...COMPONENT, name: n })),
      })
      brandApply('tide-notes')
    }

    it('带品牌前缀的游离组件 → 报在该品牌名下（就是 hip-quote 那个坑）', () => {
      saveBrandWith(['tide-quote', 'tide-stat'])
      // 直接进全局库，没经过 brand_save —— 正是 hip-quote 的成因
      saveUserComponent({ ...COMPONENT, name: 'tide-letter' })

      const report = doctor()
      const orphans = report.issues.filter((i) => i.kind === 'component_orphan')
      expect(orphans).toHaveLength(1)
      expect(orphans[0]?.brand).toBe('tide-notes')
      expect(orphans[0]?.target).toBe('tide-letter')
      expect(orphans[0]?.severity).toBe('warning')
      // 是警告、不是错误：本机能渲染，只有换环境才掉
      expect(report.ok).toBe(true)
      expect(orphans[0]?.message).toContain('不会随 .brand 包走')
    })

    it('对不上任何品牌前缀的 → 全量体检时汇总报一条', () => {
      saveBrandWith(['tide-quote', 'tide-stat'])
      saveUserComponent({ ...COMPONENT, name: 'loose-one' })
      saveUserComponent({ ...COMPONENT, name: 'loose-two' })

      const report = doctor()
      const agg = report.issues.filter((i) => i.kind === 'component_orphan')
      expect(agg).toHaveLength(1)
      expect(agg[0]?.brand).toBe('(未归属)')
      expect(agg[0]?.message).toContain('loose-one')
      expect(agg[0]?.message).toContain('loose-two')
    })

    it('单查一个品牌时不报「未归属」汇总（那是全局结论，不是该品牌的）', () => {
      saveBrandWith(['tide-quote', 'tide-stat'])
      saveUserComponent({ ...COMPONENT, name: 'loose-one' })
      const report = brandDoctor({ name: 'tide-notes' })
      expect(report.issues.some((i) => i.kind === 'component_orphan')).toBe(false)
    })

    it('已归档案的组件不会误报（前缀相同也不算游离）', () => {
      saveBrandWith(['tide-quote', 'tide-stat'])
      const report = doctor()
      expect(report.issues.filter((i) => i.kind === 'component_orphan')).toEqual([])
    })

    it('内置组件永远不算游离（它们不需要任何品牌带）', () => {
      saveBrandWith(['tide-quote', 'tide-stat'])
      // 内置名进不了 saveUserComponent（它拦保留名），所以直接写盘模拟历史遗留文件。
      // 这一条守的是「判据是内置清单，不是「不在档案里」」。
      const store = JSON.parse(readFileSync(componentsFile, 'utf8'))
      store.components.push({ name: 'section-title', description: '内置同名', template: '<section>{{body}}</section>' })
      writeFileSync(componentsFile, JSON.stringify(store, null, 2), 'utf8')

      const report = doctor()
      expect(report.issues.filter((i) => i.kind === 'component_orphan')).toEqual([])
    })

    it('多品牌时，归属要看全部品牌 —— 别的品牌的组件不能被当成本品牌的游离组件', () => {
      saveBrandWith(['tide-quote', 'tide-stat'])
      brandSave({
        name: 'other-notes',
        displayName: '别的号',
        description: '另一个品牌，用于验证归属判断',
        rationale: '主色取自另一种场景，压低饱和度做印刷质感对照',
        theme: { ...THEME, name: 'other-notes' },
        components: [
          { ...COMPONENT, name: 'other-quote' },
          { ...COMPONENT, name: 'other-stat' },
        ],
      })
      brandApply('other-notes')

      const report = doctor()
      expect(report.brands).toEqual(['other-notes', 'tide-notes'])
      // 若归属只看「第一个品牌」，other-* 会被误判成游离
      expect(report.issues.filter((i) => i.kind === 'component_orphan')).toEqual([])
    })

    it('组件没有共同前缀时不猜（否则会把所有组件都算成该品牌的）', () => {
      saveBrandWith(['alpha', 'beta'])
      saveUserComponent({ ...COMPONENT, name: 'gamma' })
      const report = brandDoctor({ name: 'tide-notes' })
      expect(report.issues.filter((i) => i.kind === 'component_orphan')).toEqual([])
    })
  })
})
