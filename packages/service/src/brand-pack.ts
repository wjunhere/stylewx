/**
 * 品牌包（`.brand`）—— 打包 / 校验 / 安装。
 *
 * ── 为什么是 zip ────────────────────────────────────────────────────────
 * 品牌档案的真源是一个**目录**（`~/.stylewx/brands/<name>/`：可提交进 git、可 diff、
 * `brand.md` 可手改）。但目录没法发给别人，所以需要一个**传输形态**。zip 同时满足三条：
 * ① 一个文件；② 任何系统都能解开（坏了也能手工救）；③ Node 生态有成熟纯 JS 实现
 * （fflate），不需要装系统工具。
 *
 * **扩展名 `.brand` 只是提示，真正的判据是 manifest.json 里的 `formatVersion` + `kind`。**
 * 后缀被改成 `foo.txt` 也照样能装；反过来，后缀写对但内容不是品牌包，会被明确拒绝
 * （而不是装出一个半成品）。
 *
 * ── 包内结构 ───────────────────────────────────────────────────────────
 * ```
 * hippie-youth-1.2.0.brand          (zip)
 * ├── manifest.json     容器元数据（formatVersion / kind / engine / 文件清单 + sha256）
 * ├── brand.json        机器真源（= 品牌目录的 profile.json + formatVersion/assets/renamedFrom）
 * ├── brand.md          人的文档（含自动段，逐字节原样带过来）
 * ├── assets/           只有身份位图：logo-a/b/c.png、cover.png
 * └── source/           可选，默认不含
 * ```
 *
 * 注意文件名的不对称：**包内叫 `brand.json`，装好后叫 `profile.json`**（沿用磁盘上的旧名）。
 * 这个差异写在 manifest 的 `role: "profile"` 里，不靠文件名猜。
 *
 * ── 为什么 source/ 默认不进包 ────────────────────────────────────────────
 * 「把品牌发给别人用」和「把品牌的源文件交接给同事改」是两个场景。默认带源码会让包变大，
 * 也会把不该给的东西（生成脚本、试验产物）一起给出去。要交接就显式 `--with-source`。
 *
 * 注意：本模块使用 Node fs —— 只允许出现在 service 层。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import semver from 'semver'
import { serviceError } from './errors.js'
import { brandApply, brandDirNames, brandPaths, readBrandProfile } from './brand-store.js'
import type { BrandAssets, BrandProfile, BrandStoreOptions } from './brand-store.js'
import { findUnpairedMarkers, syncBrandDoc } from './brand-doc.js'
import { scanOrphanComponents } from './brand-doctor.js'
import { listUserComponents } from './component-store.js'

/** 容器格式版本：**破坏性**变更才 +1（加可选字段不算）。 */
export const FORMAT_VERSION = 1
export const BUNDLE_KIND = 'stylewx.brand'
export const BUNDLE_EXT = '.brand'
/** 装好后记在品牌目录里的侧车文件：记住这个品牌来自哪个包（认亲用）。 */
const ORIGIN_FILE = '.origin.json'
/** 发布得到的微信 CDN 链接记在这里，**不回写 profile**。 */
const PUBLISHED_FILE = '.published.json'

export type BundleFileRole = 'profile' | 'doc' | 'asset' | 'source'

export interface BundleFileEntry {
  path: string
  role: BundleFileRole
  mime?: string
  bytes: number
  sha256: string
}

export interface BundleManifest {
  formatVersion: number
  kind: typeof BUNDLE_KIND
  name: string
  version: string
  /** 最低 stylewx 版本（semver range）——读不了要能明确说，而不是悄悄出错。 */
  engine: string
  /** 认亲用：判断「同一品牌的再次导入 = 升级」。 */
  origin: string
  createdAt: string
  updatedAt: string
  files: BundleFileEntry[]
}

/** 品牌目录里的侧车：这个品牌是从哪个包装来的。 */
export interface BrandOriginRecord {
  origin: string
  version: string
  formatVersion: number
  installedAt: string
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown',
  '.json': 'application/json',
}

function mimeOf(path: string): string | undefined {
  return MIME[extname(path).toLowerCase()]
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** 当前 stylewx 版本（等于各包版本，固定版本 monorepo）。 */
function currentVersion(): string {
  // 版本号只在 package.json 一处维护：源码是 src/、产物是 dist/，都在包根下一层。
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 3; i += 1) {
    try {
      const pkg = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')) as { name?: string; version?: string }
      if (pkg.name === '@stylewx/service' && pkg.version) return pkg.version
    } catch {
      // 继续向上找
    }
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return '0.0.0'
}

/** 包内路径安全检查：只接受相对路径（拒绝绝对路径与 `..`）。 */
export function assertSafeRelativePath(path: string, what = '路径'): void {
  const norm = path.replace(/\\/g, '/')
  if (!path || isAbsolute(path) || /^[a-zA-Z]:[\\/]/.test(path) || norm.startsWith('/')) {
    throw serviceError('invalid_bundle', `品牌包里的${what}不是相对路径：${path}`, '包内路径必须是相对路径（如 assets/logo-a.png）。')
  }
  if (norm.split('/').includes('..')) {
    throw serviceError('invalid_bundle', `品牌包里的${what}试图跳出包外：${path}`, '路径里不允许出现 `..`。')
  }
}

/** 远程 URL 判据：http/https 一律拒绝（`data:` 内联字节允许）。 */
export function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

// ---------------------------------------------------------------------------
// 打包
// ---------------------------------------------------------------------------

export interface PackOptions extends BrandStoreOptions {
  /** 输出**目录**或文件路径；缺省当前工作目录。 */
  out?: string
  /** 版本号（写进 manifest 与文件名）；缺省用 profile.updatedAt 的日期。 */
  version?: string
  /** engine 断言，缺省 `>=<当前 stylewx 版本>`。 */
  engine?: string
  /** 连 `source/` 一起打（交接源码场景）。 */
  withSource?: boolean
  /** 固定 zip 内时间戳（测试用：同一输入必须产出同一字节）。 */
  mtime?: Date
}

export interface PackResult {
  path: string
  bytes: number
  manifest: BundleManifest
  /**
   * 不拦打包、但「装到别处会坏」的信号（目前只有游离组件）。
   *
   * `.brand` 包只带 `profile.components` 里列的组件，所以「换个环境能不能跑」等于
   * 「组件是不是全在档案里」。游离组件本机渲染完全正常，只有换环境才暴露 ——
   * 那正是这个包要避免的事，所以必须回给调用方（而不是静静打完了事）。
   * 只报不拦：无法知道哪篇文章用了它，拦下打包只会让人连档案都交不出去。
   */
  warnings: string[]
}

/** 遍历目录 → `相对路径 → 绝对路径`（路径一律用 `/`，保证跨平台一致）。 */
function walk(dir: string, root = dir): Map<string, string> {
  const out = new Map<string, string>()
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      for (const [k, v] of walk(abs, root)) out.set(k, v)
    } else if (entry.isFile()) {
      out.set(relative(root, abs).split(sep).join('/'), abs)
    }
  }
  return out
}

function sortedEntries(map: Map<string, Uint8Array>): Array<[string, Uint8Array]> {
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
}

/**
 * 把品牌目录打成 `.brand`。
 *
 * 资产规则：只有品牌目录 `assets/` 下的文件进包（那是身份位图）；
 * `logo` / `coverImage` 必须是包内相对路径或内联 `data:`，**远程 URL 一律拒绝** ——
 * 否则一个包就能让导入方去请求任意地址。微信素材库的 CDN 链接请记 `.published.json`。
 */
export function packBrand(name: string, opts: PackOptions = {}): PackResult {
  const profile = readBrandProfile(name, opts)
  const paths = brandPaths(name, opts)
  if (!existsSync(paths.dir)) {
    throw serviceError('brand_not_found', `品牌档案「${name}」不存在。`, '用 brand_list 查看已有品牌。')
  }

  const version = opts.version ?? defaultVersion(profile)
  if (!semver.valid(version)) {
    throw serviceError('invalid_bundle', `版本号「${version}」不是合法 semver。`, '用 `--version 1.2.0` 指定。')
  }
  const engine = opts.engine ?? `>=${currentVersion()}`

  const doc = existsSync(paths.doc) ? readFileSync(paths.doc, 'utf8') : ''
  if (doc) {
    const unpaired = findUnpairedMarkers(doc)
    if (unpaired.length) {
      throw serviceError('invalid_bundle', `brand.md 的自动段标记不完整：${unpaired.join('；')}`, '先跑 `stylewx brand doctor --fix` 修好再打包。')
    }
  }

  // ---- 自包含预检：包里带了什么，别处就只能用上什么 ----
  // 与 `brand doctor` 同一套前缀规则（scanOrphanComponents），不在这里另写一份。
  // 推不出前缀（档案里的组件不足 2 个或没有共同前缀）时宁可不查 —— 不猜、不误报。
  const warnings: string[] = []
  const orphans = scanOrphanComponents([name], opts).byBrand.get(name)
  if (orphans) {
    for (const component of orphans.components) {
      warnings.push(
        `组件「${component}」看着是这个品牌的（前缀 ${orphans.prefix}），但它不在档案的 components 里 —— 不会进这个包。` +
          `本机渲染正常（全局组件库里有），装到别的环境它会退化成普通 Markdown：用 brand_save 把组件补进档案后重新打包。`,
      )
    }
  }

  // ---- 资产：品牌目录 assets/ 下的文件 ----
  const files = new Map<string, Uint8Array>()
  const entries: BundleFileEntry[] = []
  for (const [rel, abs] of [...walk(join(paths.dir, 'assets')).entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const inBundle = `assets/${rel}`
    const bytes = new Uint8Array(readFileSync(abs))
    files.set(inBundle, bytes)
    entries.push({ path: inBundle, role: 'asset', mime: mimeOf(inBundle), bytes: bytes.length, sha256: sha256(bytes) })
  }

  // ---- logo / coverImage：包内相对路径或内联 ----
  for (const [field, value] of [['logo', profile.logo], ['coverImage', profile.coverImage]] as const) {
    if (!value) continue
    if (isRemoteUrl(value)) {
      throw serviceError(
        'invalid_bundle',
        `品牌档案的 ${field} 是远程 URL（${value.slice(0, 48)}…），不能进包。`,
        `把图片落到品牌目录 assets/ 下，再把 profile.json 的 ${field} 改成包内相对路径（如 assets/logo-a.png）。` +
          '微信素材库的 CDN 链接属于「发布结果」，记 .published.json，不要写回 profile。',
      )
    }
    if (value.startsWith('data:')) continue
    assertSafeRelativePath(value, field)
    if (!files.has(value)) {
      throw serviceError(
        'invalid_bundle',
        `${field} 指向 ${value}，但品牌目录里没有这个文件。`,
        `把图片放到 ${join(paths.dir, value)}，或把 ${field} 改成实际存在的相对路径。`,
      )
    }
  }

  // brand.json 里的 assets.files 由 attach 阶段维护；打包只需确保它指向的文件真在包里
  const brandJson: Record<string, unknown> = { ...profile, formatVersion: FORMAT_VERSION }
  const brandBytes = strToU8(JSON.stringify(brandJson, null, 2))
  files.set('brand.json', brandBytes)
  entries.push({ path: 'brand.json', role: 'profile', mime: 'application/json', bytes: brandBytes.length, sha256: sha256(brandBytes) })

  const docBytes = strToU8(doc)
  files.set('brand.md', docBytes)
  entries.push({ path: 'brand.md', role: 'doc', mime: 'text/markdown', bytes: docBytes.length, sha256: sha256(docBytes) })

  if (opts.withSource) {
    const source = walk(join(paths.dir, 'source'))
    for (const [rel, abs] of [...source.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const bytes = new Uint8Array(readFileSync(abs))
      const inBundle = `source/${rel}`
      files.set(inBundle, bytes)
      entries.push({ path: inBundle, role: 'source', mime: mimeOf(inBundle), bytes: bytes.length, sha256: sha256(bytes) })
    }
  }

  const manifest: BundleManifest = {
    formatVersion: FORMAT_VERSION,
    kind: BUNDLE_KIND,
    name: profile.name,
    version,
    engine,
    origin: profile.name,
    createdAt: profile.updatedAt,
    updatedAt: profile.updatedAt,
    files: entries,
  }
  files.set('manifest.json', strToU8(JSON.stringify(manifest, null, 2)))

  // 可复现：zip 内时间戳固定 —— 否则同一份档案每次打出的字节都不同，没法比对
  const mtime = opts.mtime ?? new Date(profile.updatedAt)
  const zippable: Record<string, [Uint8Array, { mtime: Date }]> = {}
  for (const [path, bytes] of sortedEntries(files)) zippable[path] = [bytes, { mtime }]
  const zip = zipSync(zippable as never, { level: 6 })

  const outIsDir = opts.out ? (existsSync(opts.out) ? statSync(opts.out).isDirectory() : extname(opts.out) === '') : true
  const outDir = opts.out ? (outIsDir ? opts.out : dirname(opts.out)) : process.cwd()
  const outName = opts.out && !outIsDir ? basename(opts.out) : `${name}-${version}${BUNDLE_EXT}`
  const outPath = resolve(outDir, outName)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, zip)
  return { path: outPath, bytes: zip.length, manifest, warnings }
}

/** 默认版本：用 `updatedAt` 的 UTC 日期（`2026.10.12`）。 */
function defaultVersion(profile: BrandProfile): string {
  const d = new Date(profile.updatedAt)
  if (Number.isNaN(d.getTime())) return '0.1.0'
  return `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}`
}

// ---------------------------------------------------------------------------
// 载入 + 校验（dry-run，不落盘）
// ---------------------------------------------------------------------------

export interface BundleValidation {
  ok: boolean
  manifest?: BundleManifest
  profile?: BrandProfile
  /** 逐文件校验结果。 */
  files: Array<{ path: string; role: BundleFileRole; ok: boolean; problem?: string }>
  issues: string[]
  /** 未通过时也能拿到清单（只是没通过校验）。 */
  warnings: string[]
}

interface LoadedBundle {
  manifest: BundleManifest
  profile: BrandProfile
  doc: string
  raw: Map<string, Uint8Array>
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'error' in error) {
    const e = (error as { error?: { message?: string } }).error
    if (e?.message) return e.message
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * `.brand` 文件或品牌目录 → 统一的内存形态。
 *
 * **两种都收**（§一.4：安装命令同时支持目录路径与 `.brand` 文件）。
 * 目录形态没有 manifest.json，就按目录内容**现算一份**（文件清单 + sha256）：
 * 这样「同一台机器上另有品牌目录」与「手里拿到一个 .brand」走完全同一条校验/安装路径，
 * 不需要为目录另写一份分支。
 */
export function loadBundle(source: string): LoadedBundle {
  if (!existsSync(source)) {
    throw serviceError('bundle_not_found', `找不到品牌包：${source}`, '路径可以是 `.brand` 文件，也可以是品牌目录。')
  }
  const raw = new Map<string, Uint8Array>()
  const isDir = statSync(source).isDirectory()
  if (isDir) {
    for (const [rel, abs] of walk(source)) raw.set(rel, new Uint8Array(readFileSync(abs)))
  } else {
    const bytes = new Uint8Array(readFileSync(source))
    let unzipped: Record<string, Uint8Array>
    try {
      unzipped = unzipSync(bytes)
    } catch (error) {
      throw serviceError(
        'invalid_bundle',
        `${basename(source)} 不是有效的 zip 容器：${errorMessage(error)}`,
        '`.brand` 是 zip（用系统解压工具能打开）。若这是别的文件，改名不解决问题 —— 判据是 manifest.json。',
      )
    }
    for (const [path, data] of Object.entries(unzipped)) raw.set(path.replace(/\\/g, '/'), data)
  }

  for (const path of raw.keys()) assertSafeRelativePath(path)

  const manifestRaw = raw.get('manifest.json')
  const manifest = manifestRaw ? parseManifest(manifestRaw) : synthesizeManifest(raw, source)
  if (!manifestRaw) {
    // 目录形态：现算的 manifest 只用于本次校验，不写回目录（目录是人的工作区，不塞派生文件）
  }
  const brandRaw = raw.get('brand.json') ?? raw.get('profile.json')
  if (!brandRaw) {
    throw serviceError(
      'invalid_bundle',
      '包里没有 brand.json（品牌目录里叫 profile.json）。',
      '机器真源必须有：包内是 brand.json、磁盘品牌目录里是 profile.json，两者内容一样，差别只在文件名。',
    )
  }
  const profile = JSON.parse(strFromU8(brandRaw)) as BrandProfile
  const docRaw = raw.get('brand.md')
  return { manifest, profile, doc: docRaw ? strFromU8(docRaw) : '', raw }
}

/** 解 manifest 并验判据（kind / formatVersion / engine）。 */
function parseManifest(manifestRaw: Uint8Array): BundleManifest {
  let manifest: BundleManifest
  try {
    manifest = JSON.parse(strFromU8(manifestRaw)) as BundleManifest
  } catch (error) {
    throw serviceError('invalid_bundle', `manifest.json 不是合法 JSON：${errorMessage(error)}`, '重打包一次，或手工修复该文件。')
  }
  if (manifest.kind !== BUNDLE_KIND) {
    throw serviceError(
      'invalid_bundle',
      `这不是 stylewx 品牌包（kind=${String(manifest.kind)}）。`,
      `只认 kind="${BUNDLE_KIND}"；将来若有别的类型，也用同一个 .brand 容器装、靠 kind 区分。`,
    )
  }
  if (manifest.formatVersion !== FORMAT_VERSION) {
    throw serviceError(
      'invalid_bundle',
      `品牌包格式版本 ${String(manifest.formatVersion)} 与本版 stylewx（${FORMAT_VERSION}）不兼容。`,
      manifest.formatVersion > FORMAT_VERSION ? '请升级 stylewx 后再导入。' : '这个包太旧，请用新版重新打包。',
    )
  }
  const required = semver.validRange(String(manifest.engine ?? ''))
  if (!required) {
    throw serviceError('invalid_bundle', `manifest.engine 不是合法的 semver range：${String(manifest.engine)}`, '重新打包（engine 由 stylewx 自动写入）。')
  }
  if (!semver.satisfies(currentVersion(), required, { includePrerelease: true })) {
    throw serviceError(
      'invalid_bundle',
      `这个包要求 stylewx ${required}，当前是 ${currentVersion()}，读不了。`,
      '升级 stylewx 后再导入，或让打包方降低 engine 断言。',
    )
  }
  return manifest
}

/** 目录形态：按目录内容现算一份 manifest（不落盘）。 */
function synthesizeManifest(raw: Map<string, Uint8Array>, source: string): BundleManifest {
  const brandRaw = raw.get('brand.json') ?? raw.get('profile.json')
  const profile = brandRaw ? (JSON.parse(strFromU8(brandRaw)) as BrandProfile) : undefined
  if (!profile?.name) {
    throw serviceError(
      'invalid_bundle',
      `${source} 既不是 .brand 文件，也不像一个品牌目录（没有 brand.json / profile.json）。`,
      '目录形态的品牌包需要根下有 brand.json 或 profile.json（两者内容相同，差别只在文件名：包里叫 brand.json，磁盘上叫 profile.json）。',
    )
  }
  const entries: BundleFileEntry[] = []
  for (const [path, bytes] of [...raw.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const role: BundleFileRole = path === 'brand.json' || path === 'profile.json' ? 'profile' : path === 'brand.md' ? 'doc' : path.startsWith('assets/') ? 'asset' : 'source'
    entries.push({ path, role, mime: mimeOf(path), bytes: bytes.length, sha256: sha256(bytes) })
  }
  return {
    formatVersion: FORMAT_VERSION,
    kind: BUNDLE_KIND,
    name: profile.name,
    version: defaultVersion(profile),
    engine: `>=${currentVersion()}`,
    origin: profile.name,
    createdAt: profile.updatedAt ?? new Date(0).toISOString(),
    updatedAt: profile.updatedAt ?? new Date(0).toISOString(),
    files: entries,
  }
}

/**
 * 校验一个品牌包（**不落盘**）。
 *
 * 四件事：容器能否解开（含 engine/kind/formatVersion 判据）、每个文件的 sha256 是否对得上、
 * 资产路径是否安全（相对路径 + 不指向远程）、组件名与 brand.md 标记是否合法。
 */
export function validateBundle(source: string): BundleValidation {
  let loaded: LoadedBundle
  try {
    loaded = loadBundle(source)
  } catch (error) {
    return { ok: false, files: [], issues: [errorMessage(error)], warnings: [] }
  }

  const { manifest, profile, raw, doc } = loaded
  const files: BundleValidation['files'] = []
  const issues: string[] = []
  const warnings: string[] = []

  for (const entry of manifest.files) {
    try {
      assertSafeRelativePath(entry.path)
    } catch (error) {
      files.push({ path: entry.path, role: entry.role, ok: false, problem: errorMessage(error) })
      issues.push(errorMessage(error))
      continue
    }
    const bytes = raw.get(entry.path)
    if (!bytes) {
      files.push({ path: entry.path, role: entry.role, ok: false, problem: '清单里列了但包里没有' })
      issues.push(`清单列了 ${entry.path}，但包里没有这个文件。`)
      continue
    }
    const actual = sha256(bytes)
    if (actual !== entry.sha256) {
      files.push({ path: entry.path, role: entry.role, ok: false, problem: `sha256 不匹配（清单 ${String(entry.sha256).slice(0, 12)}… / 实际 ${actual.slice(0, 12)}…）` })
      issues.push(`${entry.path} 的内容被改过（sha256 不匹配）。`)
      continue
    }
    files.push({ path: entry.path, role: entry.role, ok: true })
  }

  // 清单之外的文件：不算错误，但要说出来（免得悄悄塞东西）
  const listed = new Set(manifest.files.map((f) => f.path))
  for (const path of raw.keys()) {
    if (!listed.has(path) && path !== 'manifest.json') warnings.push(`包里有一份没列进清单的文件：${path}`)
  }

  // 资产来源：logo / coverImage 只允许包内相对路径或内联
  for (const [field, value] of [['logo', profile.logo], ['coverImage', profile.coverImage]] as const) {
    if (!value) continue
    if (isRemoteUrl(value)) {
      issues.push(`${field} 是远程 URL（${value.slice(0, 48)}…）—— 品牌包不允许引用远程地址。`)
      continue
    }
    if (value.startsWith('data:')) continue
    try {
      assertSafeRelativePath(value, field)
    } catch (error) {
      issues.push(errorMessage(error))
      continue
    }
    if (!raw.has(value)) issues.push(`${field} 指向包内文件 ${value}，但包里没有它。`)
  }

  const nameRe = /^[a-z][a-z0-9-]*$/
  if (!nameRe.test(String(profile.name ?? ''))) issues.push(`品牌名「${String(profile.name)}」不合法。`)
  for (const c of profile.components ?? []) {
    if (!nameRe.test(c.name)) issues.push(`组件名「${c.name}」不合法（小写字母开头 + 小写字母/数字/连字符）。`)
  }
  if (profile.headerComponent && !(profile.components ?? []).some((c) => c.name === profile.headerComponent)) {
    warnings.push(`headerComponent「${profile.headerComponent}」不在组件清单里。`)
  }
  for (const u of findUnpairedMarkers(doc)) issues.push(u)

  return { ok: issues.length === 0, manifest, profile, files, issues, warnings }
}

// ---------------------------------------------------------------------------
// 安装：三条重名规则（重点是幂等）
// ---------------------------------------------------------------------------

export interface InstallOptions extends BrandStoreOptions {
  /** 指定安装后的品牌名（跳过撞名规则）。 */
  as?: string
  /** 同名且同源时不升级、改用新名字安装。 */
  forceNew?: boolean
}

export interface InstallResult {
  name: string
  displayName?: string
  /** 是否是对已有品牌的原地升级。 */
  upgraded: boolean
  /** 撞名后被改名的组件：新名 → 原名。 */
  renamedFrom: Record<string, string>
  /** 落地的主题名与组件名（派生副本）。 */
  themeName: string
  components: string[]
  source: { origin: string; version: string; formatVersion: number }
  warnings: string[]
}

/** 读品牌目录的侧车 origin（认亲用）；缺失时回退到 `name`（本机自建的品牌）。 */
export function readBrandOrigin(name: string, opts?: BrandStoreOptions): BrandOriginRecord | undefined {
  const file = join(brandPaths(name, opts).dir, ORIGIN_FILE)
  if (!existsSync(file)) return undefined
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as BrandOriginRecord
  } catch {
    return undefined
  }
}

/** 找第一个没被占用的名字：`x` → `x-2` → `x-3`… */
function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}-${i}`
    if (!taken.has(candidate)) return candidate
  }
  throw serviceError('install_conflict', `「${base}」的自动后缀试到 -99 都被占用了。`, '手工清理品牌目录，或用 `--as <名字>` 指定。')
}

/** 发布得到的 CDN 链接记在这里，不写回 profile（否则重打包会把上一个账号的链接发给别人）。 */
export function writePublishedAssets(name: string, assets: Record<string, string>, opts?: BrandStoreOptions): string {
  const file = join(brandPaths(name, opts).dir, PUBLISHED_FILE)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ assets, updatedAt: new Date().toISOString() }, null, 2), 'utf8')
  return file
}

/**
 * 安装一个品牌包（`.brand` 文件或品牌目录）。
 *
 * 三条重名规则（重点是幂等）：
 * 1. **组件撞名** → 导入方的组件名加品牌后缀 `x--<brand>`，并记进 profile 的 `renamedFrom`
 *    （`brand_apply` 会把它一并返回，让 agent 用对名字）。
 * 2. **品牌名撞名**（两个不同来源都叫 `hippie-youth`）→ 加数字后缀 `hippie-youth-2`，
 *    侧车记 `origin`。**绝不无声覆盖** —— 品牌档案里有人写的散文与迭代记录。
 * 3. **同一品牌再次导入 = 升级**：按 `name` + `origin` 认亲，原地替换、不追加后缀。
 *    没有这条，反复导入会攒出 `-2 -3 -4`。
 */
export function installBrand(source: string, opts: InstallOptions = {}): InstallResult {
  const validation = validateBundle(source)
  if (!validation.ok) {
    throw serviceError(
      'invalid_bundle',
      `品牌包校验未通过：${validation.issues.join('；')}`,
      '先跑 `stylewx brand validate <包>` 看清问题。sha256 对不上说明包被改过，重新打包。',
    )
  }
  const { manifest, profile } = loadedOf(validation)
  const { raw, doc } = loadBundle(source)
  const warnings = [...validation.warnings]

  const taken = new Set(brandDirNames(opts))
  const origin = manifest.origin || manifest.name

  // ---- 规则 2/3：品牌名 ----
  let target: string
  let upgraded = false
  if (opts.as) {
    target = opts.as
    upgraded = taken.has(target)
  } else if (taken.has(manifest.name) && !opts.forceNew && (readBrandOrigin(manifest.name, opts)?.origin ?? manifest.name) === origin) {
    target = manifest.name // 规则 3：同一品牌 → 升级
    upgraded = true
  } else {
    target = uniqueName(manifest.name, taken) // 规则 2：撞名 → 加后缀
  }

  // ---- 规则 1：组件撞名 ----
  const store = listUserComponents()
  const storeNames = new Set(store.map((c) => c.name))
  // 升级时，上一次装进来的名字属于本品牌 —— 组件名要与它对齐，否则每次导入都再套一层后缀。
  // 关键：要按**原名**建索引（`renamedFrom` 是 `新名 → 原名`），否则拿包里的原名去查永远查不到。
  const previous = upgraded ? readBrandProfile(target, opts) : undefined
  const previousName = new Map<string, string>()
  for (const [installedName, originalName] of Object.entries(previous?.renamedFrom ?? {})) {
    previousName.set(originalName, installedName)
  }
  const renamedValues = new Set(Object.keys(previous?.renamedFrom ?? {}))
  for (const c of previous?.components ?? []) {
    if (!renamedValues.has(c.name)) previousName.set(c.name, c.name)
  }

  const renamedFrom: Record<string, string> = {}
  const used = new Set(storeNames)
  const components = (profile.components ?? []).map((def) => {
    const original = def.name
    // 自己上次装的：沿用原名字（含上次撞出来的后缀）
    const own = previousName.get(original)
    if (own) {
      if (own !== original) renamedFrom[own] = original
      return { ...def, name: own }
    }
    if (!storeNames.has(original)) return { ...def, name: original }
    let name = `${original}--${target}`
    let n = 2
    while (used.has(name)) {
      name = `${original}--${target}-${n}`
      n += 1
    }
    renamedFrom[name] = original
    warnings.push(`组件「${original}」与已有组件撞名，安装为「${name}」（原名记在 profile 的 renamedFrom）。`)
    used.add(name)
    return { ...def, name }
  })

  const rename = (name: string | undefined): string | undefined => {
    if (!name) return undefined
    const hit = Object.entries(renamedFrom).find(([, orig]) => orig === name)
    return hit ? hit[0] : name
  }

  // ---- 写品牌目录（profile.json + brand.md 原文 + 资产字节）----
  const paths = brandPaths(target, opts)
  mkdirSync(paths.dir, { recursive: true })
  for (const entry of manifest.files) {
    if (entry.role !== 'asset' && entry.role !== 'source') continue
    const bytes = raw.get(entry.path)
    if (!bytes) continue
    const dest = join(paths.dir, entry.path)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, bytes)
  }

  const installed: BrandProfile = {
    ...profile,
    name: target,
    formatVersion: FORMAT_VERSION,
    headerComponent: rename(profile.headerComponent),
    components,
    assets: profile.assets,
    renamedFrom: Object.keys(renamedFrom).length ? renamedFrom : undefined,
  }
  // 主题名在磁盘上必须与品牌名一致（brandSave/brandApply 都假定这一点）
  installed.theme = { ...profile.theme, name: target }
  writeFileSync(join(paths.dir, 'profile.json'), JSON.stringify(installed, null, 2), 'utf8')
  if (doc) {
    // brand.md 是人的文档：先原样落地，再用改过名后的 profile 重算自动段 ——
    // 不重算的话，组件改过名的包装完后文档里还是原名（doctor 立刻报漂移，实测碰过）。
    const { doc: synced } = syncBrandDoc(doc, installed)
    writeFileSync(paths.doc, synced, 'utf8')
  }
  const originRecord: BrandOriginRecord = { origin, version: manifest.version, formatVersion: manifest.formatVersion, installedAt: new Date().toISOString() }
  writeFileSync(join(paths.dir, ORIGIN_FILE), JSON.stringify(originRecord, null, 2), 'utf8')

  // ---- 同步派生副本：走 brandApply（同一个实现，主题与组件都过 Schema + 白名单闸门）----
  const applied = brandApply(target, opts)

  return {
    name: target,
    displayName: installed.displayName,
    upgraded,
    renamedFrom,
    themeName: applied.theme.name,
    components: applied.syncedComponents,
    source: { origin, version: manifest.version, formatVersion: manifest.formatVersion },
    warnings,
  }
}

/** validateBundle 已经解过一次；这里只是把可选字段收窄成必填。 */
function loadedOf(v: BundleValidation): { manifest: BundleManifest; profile: BrandProfile } {
  if (!v.manifest || !v.profile) {
    throw serviceError('invalid_bundle', '品牌包缺少 manifest 或 brand.json。', '重新打包。')
  }
  return { manifest: v.manifest, profile: v.profile }
}

/** 列出品牌目录下的 assets（打包/体检时展示用）。 */
export function listBrandAssets(name: string, opts?: BrandStoreOptions): string[] {
  return [...walk(join(brandPaths(name, opts).dir, 'assets')).keys()].sort()
}

// ---------------------------------------------------------------------------
// 挂资产：把本机图片变成品牌目录里的身份位图
// ---------------------------------------------------------------------------

/** 约定文件名 → 用途（§3：进包的只有身份位图，且只有这几个名字）。 */
export const ASSET_CONVENTIONS: Record<string, string> = {
  'logo-a.png': 'logo',
  'logo-b.png': 'logoB',
  'logo-c.png': 'logoC',
  'cover.png': 'cover',
}

const MAX_ASSET_BYTES = 2 * 1024 * 1024

/** 只收真图片（扩展名 + 魔数双判 —— 扩展名骗不了人，但魔数能挟住误传）。 */
function assertImageBytes(path: string, bytes: Uint8Array): string {
  const ext = extname(path).toLowerCase()
  const mime = MIME[ext]
  if (!mime || !mime.startsWith('image/')) {
    throw serviceError('invalid_asset', `不支持的资产格式：${basename(path)}`, '只收 png / jpg / webp / gif / svg。')
  }
  if (bytes.length === 0) throw serviceError('invalid_asset', `${basename(path)} 是空文件。`, '检查源文件。')
  if (bytes.length > MAX_ASSET_BYTES) {
    throw serviceError('invalid_asset', `${basename(path)} 有 ${Math.round(bytes.length / 1024)}KB，超过 2MB 上限。`, '品牌身份位图应该很小（logo ~20KB、封面 ~60KB）；这张可能是正文图，不是品牌资产。')
  }
  const magic = [...bytes.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('')
  const looksPng = magic.startsWith('89504e47')
  const looksJpg = magic.startsWith('ffd8ff')
  const looksGif = magic.startsWith('47494638')
  const looksWebp = bytes.length > 12 && strFromU8(bytes.slice(8, 12)) === 'WEBP'
  const looksSvg = /^\s*(<\?xml|<svg)/i.test(strFromU8(bytes.slice(0, 256)))
  if (ext === '.png' && !looksPng) throw serviceError('invalid_asset', `${basename(path)} 扩展名是 .png 但内容不是 PNG。`, '检查源文件是不是被改名了。')
  if ((ext === '.jpg' || ext === '.jpeg') && !looksJpg) throw serviceError('invalid_asset', `${basename(path)} 扩展名是 ${ext} 但内容不是 JPEG。`, '检查源文件。')
  if (ext === '.gif' && !looksGif) throw serviceError('invalid_asset', `${basename(path)} 扩展名是 .gif 但内容不是 GIF。`, '检查源文件。')
  if (ext === '.webp' && !looksWebp) throw serviceError('invalid_asset', `${basename(path)} 扩展名是 .webp 但内容不是 WebP。`, '检查源文件。')
  if (ext === '.svg' && !looksSvg) throw serviceError('invalid_asset', `${basename(path)} 扩展名是 .svg 但内容不是 SVG。`, '检查源文件。')
  return mime
}

export interface AttachAssetsOptions extends BrandStoreOptions {
  /** 额外的 用途 → 源文件路径（覆盖约定）。 */
  extra?: Record<string, string>
}

export interface AttachAssetsResult {
  name: string
  /** 已挂进品牌目录的文件（包内相对路径）。 */
  attached: string[]
  /** 没找到的约定文件（不报错）。 */
  missing: string[]
  /** 被写成品牌默认的 role（logo / cover）。 */
  logo?: string
  coverImage?: string
}

/**
 * 把源目录里的身份位图挂进品牌目录 `assets/`，并把 profile 的 `logo` / `coverImage`
 * 从 URL 改成**包内相对路径**。
 *
 * 为什么必须落成文件：§3 规则 1/2 —— 包内资产只允许相对路径，导入时拒绝一切远程 URL。
 * 示例：`stylewx brand attach hippie-youth --from <工作区>/brand/motion`
 */
export function attachBrandAssets(name: string, fromDir: string, opts: AttachAssetsOptions = {}): AttachAssetsResult {
  const profile = readBrandProfile(name, opts)
  const paths = brandPaths(name, opts)
  const srcDir = resolve(fromDir)
  if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) {
    throw serviceError('invalid_asset', `源目录不存在：${srcDir}`, '`--from` 指向放着 logo-a.png / cover.png 的目录。')
  }

  const wanted: Array<[string, string]> = [
    ...Object.entries(ASSET_CONVENTIONS).map(([file, role]) => [file, role] as [string, string]),
    ...Object.entries(opts.extra ?? {}),
  ]

  const attached: string[] = []
  const missing: string[] = []
  // 重建而不是合并：`files` 是「本品牌的身份位图索引」，每次按当前约定重算一遍。
  // 合并会攒出重复键（实测：`logo` 与 `logo-a` 同时存在）—— 两份名字指向同一个文件，没人知道信哪个。
  const files: Record<string, string> = {}
  for (const [file, role] of wanted) {
    const src = join(srcDir, file)
    if (!existsSync(src)) {
      missing.push(file)
      // 没找到的约定文件：保留 profile 里已有的同 role 路径（可能是用户手工放的其他名字）
      const kept = profile.assets?.files?.[role]
      if (kept) files[role] = kept
      continue
    }
    const bytes = new Uint8Array(readFileSync(src))
    assertImageBytes(src, bytes)
    const inBrand = `assets/${file}`
    const dest = join(paths.dir, inBrand)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, bytes)
    attached.push(inBrand)
    files[role] = inBrand
  }
  if (!attached.length) {
    throw serviceError(
      'invalid_asset',
      `${srcDir} 里没有找到任何身份位图（找过：${wanted.map(([f]) => f).join('、')}）。`,
      '约定文件名是 logo-a.png / logo-b.png / logo-c.png / cover.png。',
    )
  }

  // profile：logo / coverImage 改成包内相对路径；旧的自由字段（motionSource 等）原样保留
  const next: BrandProfile = {
    ...profile,
    assets: { ...(profile.assets ?? {}), files },
    logo: files.logo ?? profile.logo,
    coverImage: files.cover ?? profile.coverImage,
    updatedAt: new Date().toISOString(),
  }
  writeFileSync(join(paths.dir, 'profile.json'), JSON.stringify(next, null, 2), 'utf8')
  // 改了 profile 的事实就要同步 brand.md 的自动段 —— 否则 logo 段还写着旧 URL，
  // doctor 立刻会报漂移（实测就是在这个位置撞上的）。
  if (existsSync(paths.doc)) {
    const { doc } = syncBrandDoc(readFileSync(paths.doc, 'utf8'), next)
    writeFileSync(paths.doc, doc, 'utf8')
  }
  return { name, attached, missing, logo: next.logo, coverImage: next.coverImage }
}
