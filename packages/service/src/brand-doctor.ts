/**
 * `brand doctor` —— 品牌三方一致性闸门。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────
 * `brandSave` / `brandApply` 往**三处**写同一份品牌信息，却没有任何东西检查它们是否一致：
 *
 *   1. 品牌目录 `~/.stylewx/brands/<name>/`（profile.json + brand.md）—— **唯一真源**
 *   2. `~/.stylewx/themes.json`      —— 派生副本（编辑器主题下拉读它）
 *   3. `~/.stylewx/components.json`  —— 派生副本（渲染时按 `:::名字` 解析）
 *
 * 实测的漂移：`brand.md` 里写着「C『行囊』…一人背行囊走出灯下」，而 C 两轮前已改成
 * 「远山」。**人是照 brand.md 理解品牌的**，这份文档是错的。另一个方向也漂：
 * `ink-ledger` 的组件根本没同步进 components.json（早期建档案时还没同步逻辑）。
 *
 * 所以 doctor 只做一件事：**把三处比对一遍，不一致就报错、退出码非零**。
 * 真源是品牌目录 —— 副本不一致时修的是副本；brand.md 的自动段不一致时修的是文档。
 *
 * 注意：本模块使用 Node fs —— 只允许出现在 service 层。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateTheme } from '@stylewx/theme'
import { COMPONENT_CATALOG } from '@stylewx/components'
import { serviceError } from './errors.js'
import { brandApply, brandDirNames, brandPaths, brandsRootPath, readBrandProfile } from './brand-store.js'
import type { BrandProfile, BrandStoreOptions } from './brand-store.js'
import { checkBrandDoc, checkHumanSections, findUnpairedMarkers, syncBrandDoc } from './brand-doc.js'
import { listSavedThemes } from './theme-store.js'
import { listUserComponents } from './component-store.js'
import type { ComponentStoreOptions } from './component-store.js'
import type { ThemeStoreOptions } from './theme-store.js'

export interface BrandDoctorOptions extends BrandStoreOptions, ThemeStoreOptions, ComponentStoreOptions {
  /** 只检查这一个品牌（缺省检查全部）。 */
  name?: string
}

type SyncKind = 'theme_missing' | 'theme_drift' | 'component_missing' | 'component_drift' | 'doc_missing' | 'doc_drift' | 'doc_unpaired'

export type BrandIssueKind =
  | 'profile_missing'
  | 'profile_corrupted'
  | 'doc_missing'
  | 'doc_unpaired'
  | 'doc_drift'
  | 'doc_human_drift'
  | 'theme_missing'
  | 'theme_drift'
  | 'component_missing'
  | 'component_drift'
  | 'component_orphan'
  | 'asset_remote'
  | 'asset_missing'

export interface BrandIssue {
  brand: string
  /** 受影响的对象（自动段键 / 主题名 / 组件名）。 */
  target: string
  kind: BrandIssueKind
  severity: 'error' | 'warning'
  message: string
  hint: string
}

export interface BrandCheckReport {
  brands: string[]
  issues: BrandIssue[]
  /** 按 severity=error 计数。 */
  errorCount: number
  ok: boolean
}

/**
 * 结构相等（键顺序无关）。
 *
 * 不能用 `JSON.stringify` 直接比：zod 校验会把对象按 schema 顺序重建，
 * 同一份主题经 saveTheme 往返一次键序就变了 —— 实测 doctor 因此把「已同步」
 * 报成「副本漂了」，永远修不好。
 */
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  const keys = Object.keys(v as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`
}

function deepEqual(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b)
}

/** 检查单个品牌（不做任何写盘）。 */
function checkOne(name: string, opts: BrandDoctorOptions): BrandIssue[] {
  const issues: BrandIssue[] = []
  const paths = brandPaths(name, opts)

  if (!existsSync(paths.profile)) {
    issues.push({
      brand: name,
      target: paths.profile,
      kind: 'profile_missing',
      severity: 'error',
      message: `品牌目录里没有 profile.json：${paths.dir}`,
      hint: '空目录直接删掉；想保留就把 profile.json 补回去（品牌目录是唯一真源）。',
    })
    return issues
  }

  let profile: BrandProfile
  try {
    profile = readBrandProfile(name, opts)
  } catch (error) {
    issues.push({
      brand: name,
      target: paths.profile,
      kind: 'profile_corrupted',
      severity: 'error',
      message: `profile.json 读不出来：${error instanceof Error ? error.message : String(error)}`,
      hint: '修好 JSON 或删除该品牌后重建。',
    })
    return issues
  }

  // 主题副本
  const themeCheck = validateTheme(profile.theme)
  if (!themeCheck.ok) {
    issues.push({
      brand: name,
      target: profile.theme?.name ?? name,
      kind: 'profile_corrupted',
      severity: 'error',
      message: `profile.theme 不合法：${themeCheck.issues.map((i) => `${i.path}: ${i.message}`).join('；')}`,
      hint: '重新 brand_save 该品牌（主题会过 Schema + 微信白名单校验）。',
    })
  }
  const savedTheme = listSavedThemes({ file: opts.file }).themes.find((t) => t.name === profile.theme?.name)
  if (!savedTheme) {
    issues.push({
      brand: name,
      target: profile.theme?.name ?? name,
      kind: 'theme_missing',
      severity: 'error',
      message: `主题「${profile.theme?.name}」不在 themes.json 里 —— 编辑器主题下拉里选不到这个品牌。`,
      hint: `跑 brand_apply ${name} 补齐副本，或 node scripts/brand/check-brands.mjs --fix。`,
    })
  } else if (!deepEqual(savedTheme, profile.theme)) {
    issues.push({
      brand: name,
      target: savedTheme.name,
      kind: 'theme_drift',
      severity: 'error',
      message: `themes.json 里的「${savedTheme.name}」与品牌目录里的主题不一致（副本漂了）。`,
      hint: `真源是品牌目录：跑 brand_apply ${name} 把副本覆盖回来（或 doctor --fix）。`,
    })
  }

  // 组件副本
  const stored = new Map(listUserComponents({ file: opts.file }).map((c) => [c.name, c]))
  for (const c of profile.components) {
    const got = stored.get(c.name)
    if (!got) {
      issues.push({
        brand: name,
        target: c.name,
        kind: 'component_missing',
        severity: 'error',
        message: `品牌组件「${c.name}」不在 components.json 里 —— 正文里 \`:::${c.name}\` 会渲染不出来。`,
        hint: `跑 brand_apply ${name} 补齐副本，或 doctor --fix。`,
      })
    } else if (!deepEqual(got, c)) {
      issues.push({
        brand: name,
        target: c.name,
        kind: 'component_drift',
        severity: 'error',
        message: `components.json 里的「${c.name}」与品牌目录里的定义不一致（副本漂了）。`,
        hint: `真源是品牌目录：跑 brand_apply ${name} 把副本覆盖回来（或 doctor --fix）。`,
      })
    }
  }

  // 资产：logo / coverImage 与包内文件（已改本地路径但文件不在时报错；仍是远程 URL 只提醒）
  for (const [field, value] of [['logo', profile.logo], ['coverImage', profile.coverImage]] as const) {
    if (!value || value.startsWith('data:')) continue
    if (/^https?:\/\//i.test(value)) {
      issues.push({
        brand: name,
        target: field,
        kind: 'asset_remote',
        severity: 'warning',
        message: `${field} 还是远程 URL —— 打包时会拒绝（品牌包不允许引用远程地址）。`,
        hint:
          `跑 \`stylewx brand attach ${name} --from <放着 logo-a.png / cover.png 的目录>\` 把图片落进品牌目录 ` +
          'assets/ 并改成包内相对路径。微信素材库的 CDN 链接记 .published.json，不要写回 profile。',
      })
      continue
    }
    if (!existsSync(join(paths.dir, value))) {
      issues.push({
        brand: name,
        target: field,
        kind: 'asset_missing',
        severity: 'error',
        message: `${field} 指向 ${value}，但品牌目录里没有这个文件。`,
        hint: `把图片放到 ${join(paths.dir, value)}，或跑 \`stylewx brand attach ${name} --from <目录>\` 重挂。`,
      })
    }
  }

  // brand.md 自动段
  if (!existsSync(paths.doc)) {
    issues.push({
      brand: name,
      target: paths.doc,
      kind: 'doc_missing',
      severity: 'warning',
      message: '没有 brand.md —— 人就没有可读的品牌宪法。',
      hint: `doctor --fix 会按 profile 生成一份（只补事实类自动段，散文留给人写）。`,
    })
  } else {
    const doc = readFileSync(paths.doc, 'utf8')
    const unpaired = findUnpairedMarkers(doc)
    if (unpaired.length) {
      issues.push({
        brand: name,
        target: paths.doc,
        kind: 'doc_unpaired',
        severity: 'error',
        message: unpaired.join('；'),
        hint: '每个 `<!-- stylewx:auto <key> -->` 都要有 `<!-- /stylewx:auto -->`；漏一个后面的正文会被吞进自动段。',
      })
    } else {
      for (const d of checkBrandDoc(doc, profile)) {
        issues.push({
          brand: name,
          target: d.key,
          kind: 'doc_drift',
          severity: 'error',
          message:
            d.kind === 'missing'
              ? `brand.md 缺少自动段「${d.key}」（文档里没有这一段事实）`
              : `brand.md 的自动段「${d.key}」与 profile 不一致`,
          hint: '自动段由程序生成：跑 doctor --fix（或重新 brand_save / brand_learn）把它同步过来。',
        })
      }
      // 人写段（定位 / 色彩论证）：不一致是警告，不是错误 —— 文档允许人补充细节。
      for (const h of checkHumanSections(doc, profile)) {
        issues.push({
          brand: name,
          target: h.section,
          kind: 'doc_human_drift',
          severity: 'warning',
          message: h.message,
          hint: '确认哪一份是对的：文档是人读的那份，profile 是 agent 读的那份；改好后跑 brand_save 或手改 brand.md。',
        })
      }
    }
  }

  return issues
}

/**
 * 从品牌已有的组件名推出命名前缀（`hip-head-a` / `hip-end-a` → `hip-`）。
 *
 * 只认「到连字符为止」的最长公共前缀，且要求前缀至少 2 字符 —— 组件没有共同前缀时
 * 推出来会是空串，那时宁可不检查，也不要把它当成「所有组件都属于这个品牌」。
 */
function deriveComponentPrefix(names: string[]): string | undefined {
  if (names.length < 2) return undefined
  let prefix = names[0] as string
  for (const name of names.slice(1)) {
    let i = 0
    while (i < prefix.length && i < name.length && prefix[i] === name[i]) i += 1
    prefix = prefix.slice(0, i)
  }
  const dash = prefix.lastIndexOf('-')
  return dash >= 1 ? prefix.slice(0, dash + 1) : undefined
}

/**
 * 一次「游离组件」扫描的结果。
 *
 * doctor（全量体检）与 packBrand（打包前自包含预检）共用同一套前缀规则：
 * 两处各写一份「这个名字是不是这个品牌的」，迟早会分叉成两种答案。
 */
export interface OrphanScan {
  /** 全部游离组件：在全局库里，却不属于任何品牌档案。 */
  orphans: string[]
  /** 按品牌分组：前缀推得出来、且组件名以该前缀开头的那些游离组件。 */
  byBrand: Map<string, { prefix: string; components: string[] }>
  /** 对不上任何品牌前缀的游离组件（需要人来决定归哪个品牌）。 */
  unclaimed: string[]
}

/**
 * 扫描全局组件库里的游离组件（不写盘）。
 *
 * `brands` 只决定「哪些品牌参与前缀归属」；**组件归谁看所有品牌**，
 * 否则被别的品牌拥有的组件会被误判成游离。
 */
export function scanOrphanComponents(brands: string[], opts?: BrandDoctorOptions): OrphanScan {
  const owner = new Map<string, string>()
  const profiles = new Map<string, BrandProfile>()
  for (const name of brandDirNames(opts)) {
    try {
      const profile = readBrandProfile(name, opts)
      profiles.set(name, profile)
      for (const c of profile.components) owner.set(c.name, name)
    } catch {
      // 读不出来的品牌由 checkOne 单独报，这里跳过
    }
  }

  const builtinNames = new Set(COMPONENT_CATALOG.map((c) => c.name))
  const orphans = listUserComponents(opts)
    .map((c) => c.name)
    .filter((n) => !builtinNames.has(n) && !owner.has(n))

  const byBrand = new Map<string, { prefix: string; components: string[] }>()
  const claimed = new Set<string>()
  for (const name of brands) {
    const profile = profiles.get(name)
    if (!profile) continue
    const prefix = deriveComponentPrefix(profile.components.map((c) => c.name))
    if (!prefix) continue
    const mine = orphans.filter((orphan) => orphan.startsWith(prefix))
    if (!mine.length) continue
    for (const orphan of mine) claimed.add(orphan)
    byBrand.set(name, { prefix, components: mine })
  }

  return { orphans, byBrand, unclaimed: orphans.filter((n) => !claimed.has(n)) }
}

/**
 * 游离组件：在全局组件库里，却**不属于任何一个品牌档案**。
 *
 * ── 为什么这是问题 ─────────────────────────────────────────────────────
 * `.brand` 包只带 `profile.components` 里列的组件。游离组件不会随任何包走：
 * 本机渲染正常（全局库里有），装到别的环境就退化成普通 Markdown。
 *
 * 实测就是 `hip-quote`：品牌自己的收尾配方里写着它（brand.md的迭代记录），
 * 文章也在用，但它只存在于 `~/.stylewx/components.json`。本机一直看不出来，
 * 直到把包装进干净环境才报「未知组件「hip-quote」」。
 *
 * 分两种报法：
 *  - 名字能对上一个品牌的前缀 → 报在那个品牌名下（最可能是忘了归档案）
 *  - 对不上任何前缀 → 全量体检时汇总报一条（需要人来决定归哪个品牌）
 */
function checkOrphanComponents(brands: string[], opts: BrandDoctorOptions): BrandIssue[] {
  const issues: BrandIssue[] = []
  const scan = scanOrphanComponents(brands, opts)
  if (!scan.orphans.length) return issues

  for (const [name, { prefix, components }] of scan.byBrand) {
    for (const orphan of components) {
      issues.push({
        brand: name,
        target: orphan,
        kind: 'component_orphan',
        severity: 'warning',
        message: `组件「${orphan}」看着是这个品牌的（前缀 ${prefix}），但它不在档案的 components 里 —— 不会随 .brand 包走。`,
        hint:
          `本机渲染正常（全局组件库里有），但把包装到别的环境它就会退化成普通 Markdown。` +
          `用 brand_save 把组件补进档案（components 传完整清单）。`,
      })
    }
  }

  // 对不上任何品牌前缀的：只在全量体检时报，且汇总成一条（避免刷屏）。
  if (scan.unclaimed.length && !opts.name) {
    issues.push({
      brand: '(未归属)',
      target: 'components.json',
      kind: 'component_orphan',
      severity: 'warning',
      message: `全局组件库里有 ${scan.unclaimed.length} 个组件不属于任何品牌档案：${scan.unclaimed.join('、')}。它们不会随任何 .brand 包走。`,
      hint: '要么用 brand_save 把它们归到某个品牌，要么删掉（用 delete_component）—— 否则某篇文章换环境后会掉样式。',
    })
  }
  return issues
}

/** 只检查，不写盘。 */
export function brandDoctor(opts: BrandDoctorOptions = {}): BrandCheckReport {
  const root = brandsRootPath(opts)
  const all = brandDirNames(opts)
  const brands = opts.name ? all.filter((n) => n === opts.name) : all
  if (opts.name && brands.length === 0) {
    throw serviceError(
      'brand_not_found',
      `品牌档案「${opts.name}」不存在。`,
      `品牌目录：${root}。用 brand_list 查看已有品牌。`,
    )
  }
  const issues = brands.flatMap((n) => checkOne(n, opts)).concat(checkOrphanComponents(brands, opts))
  const errorCount = issues.filter((i) => i.severity === 'error').length
  return { brands, issues, errorCount, ok: errorCount === 0 }
}

export interface BrandFixReport {
  /** 补写了 brand.md 自动段的品牌。 */
  docsSynced: string[]
  /** 按真源覆盖回来的主题名。 */
  themesSynced: string[]
  /** 按真源覆盖回来的组件名。 */
  componentsSynced: string[]  /** 修完之后仍然存在的问题（副本漂移等，需要 brand_apply 或人工处理）。 */
  remaining: BrandIssue[]
}

/**
 * `--fix`：只修**能从真源重算的东西**。
 *
 *  - brand.md 的自动段 → 按 profile 重算（段外的人写内容原样保留）
 *  - 副本漂移/缺失 → 按 profile 覆盖回来
 *
 * **不碰 profile.json**，也不删除任何品牌 —— 真源只能由人 / agent 通过 brand_save 改。
 */
export function brandFix(opts: BrandDoctorOptions = {}): BrandFixReport {
  const report = brandDoctor(opts)
  const docsSynced: string[] = []
  const themesSynced: string[] = []
  const componentsSynced: string[] = []

  // 主题 / 组件副本：复用 brandApply 的同步路径，避免这里再实现一份。
  for (const name of report.brands) {
    const kinds = new Set<BrandIssueKind>(report.issues.filter((i) => i.brand === name).map((i) => i.kind))
    const needsSync = (['theme_missing', 'theme_drift', 'component_missing', 'component_drift'] as const).some((k) => kinds.has(k))
    if (!needsSync) continue
    if (kinds.has('profile_missing') || kinds.has('profile_corrupted')) continue
    const applied = brandApply(name, { dir: opts.dir, themesFile: opts.file })
    if (kinds.has('theme_missing') || kinds.has('theme_drift')) themesSynced.push(applied.theme.name)
    for (const c of applied.syncedComponents) componentsSynced.push(c)
  }

  // brand.md 自动段
  for (const name of report.brands) {
    const kinds = new Set<BrandIssueKind>(report.issues.filter((i) => i.brand === name).map((i) => i.kind))
    if (!(['doc_missing', 'doc_drift', 'doc_unpaired'] as const).some((k) => kinds.has(k))) continue
    if (kinds.has('profile_missing') || kinds.has('profile_corrupted')) continue
    const profile = readBrandProfile(name, opts)
    const paths = brandPaths(name, opts)
    const base = existsSync(paths.doc) ? readFileSync(paths.doc, 'utf8') : ''
    const { doc } = syncBrandDoc(base, profile)
    writeFileSync(paths.doc, doc, 'utf8')
    docsSynced.push(name)
  }

  const after = brandDoctor(opts)
  return { docsSynced, themesSynced, componentsSynced, remaining: after.issues }
}

// ---------------------------------------------------------------------------
// 编辑器 / MCP 用的「品牌总览」：一个品牌一条，含可渲染的文档 HTML
// ---------------------------------------------------------------------------

export interface BrandOverviewEntry {
  name: string
  displayName?: string
  description: string
  rationale: string
  updatedAt: string
  /** 品牌主题（完整对象，可直接传给渲染）。 */
  theme: BrandProfile['theme']
  /** 品牌专属组件名清单。 */
  components: string[]
  /** 头图组件名。 */
  headerComponent?: string
  /** logo（可能是包内相对路径、data URI 或外链）。 */
  logo?: string
  coverImage?: string
  voice: string[]
  taboos: string[]
  learningCount: number
  /** brand.md 原文（人可读的品牌宪法）。 */
  doc: string
  /** 目录路径（排查用）。 */
  dir: string
}

/** 列出全部品牌档案的完整总览（编辑器品牌面板用）。 */
export function brandOverview(opts?: BrandStoreOptions): { brands: BrandOverviewEntry[] } {
  const brands: BrandOverviewEntry[] = []
  for (const n of brandDirNames(opts)) {
    let p: BrandProfile
    try {
      p = readBrandProfile(n, opts)
    } catch {
      continue
    }
    const paths = brandPaths(n, opts)
    const doc = existsSync(paths.doc) ? readFileSync(paths.doc, 'utf8') : ''
    brands.push({
      name: p.name,
      displayName: p.displayName,
      description: p.description,
      rationale: p.rationale,
      updatedAt: p.updatedAt,
      theme: structuredClone(p.theme),
      components: p.components.map((c) => c.name),
      headerComponent: p.headerComponent,
      logo: p.logo,
      coverImage: p.coverImage,
      voice: p.voice ?? [],
      taboos: p.taboos ?? [],
      learningCount: p.learnings.length,
      doc,
      dir: paths.dir,
    })
  }
  return { brands }
}
