/**
 * 品牌记忆系统：把使用者的品牌资产固化为可复用的排版档案。
 *
 * 双轨结构（~/.stylewx/brands/<name>/，可用 STYLEWX_BRANDS_PATH 覆盖）：
 *  - profile.json ：结构化真相源（完整主题 + 品牌专属组件 + 迭代记录），MCP 直接消费。
 *  - brand.md     ：人可读的「品牌宪法」（定位、气质、色彩论证、语气规则、迭代记录），
 *                   人可以直接编辑补充；agent 在排版前读取它作为设计上下文。
 *
 * 设计原则：**设计决策由 agent 产出，MCP 只做校验、编译、存储与回放**——
 * 不在 MCP 里烧 LLM。brand_interview 只返回问题清单，访谈由 agent 完成。
 *
 * 注意：本模块使用 Node fs —— 只允许出现在 service 层。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { validateTheme, completeThemeBlocks } from '@stylewx/theme'
import type { Theme } from '@stylewx/theme'
import type { UserComponentDef } from '@stylewx/components'
import { validateUserComponent, saveUserComponent } from './component-store.js'
import { saveTheme } from './theme-store.js'
import { serviceError } from './errors.js'
import { AUTO_KEYS, autoTitle, findUnpairedMarkers, renderAutoSection, syncBrandDoc } from './brand-doc.js'

const DEFAULT_DIR = join(homedir(), '.stylewx', 'brands')

export interface BrandStoreOptions {
  /** 覆盖品牌根目录（测试用）。 */
  dir?: string
  /** 覆盖主题库文件路径（测试用）——品牌主题会同步写到这里。 */
  themesFile?: string
}

function brandsDir(opts?: BrandStoreOptions): string {
  return opts?.dir ?? process.env.STYLEWX_BRANDS_PATH ?? DEFAULT_DIR
}

function brandDir(name: string, opts?: BrandStoreOptions): string {
  return join(brandsDir(opts), name)
}

const BRAND_NAME_RE = /^[a-z][a-z0-9-]{0,31}$/

export interface BrandLearning {
  date: string
  note: string
}

/**
 * 品牌包里的资产索引（`brand.json` 的 `assets` 键）。
 *
 * 历史包袱：本仓的 `assets` 早先被 agent 当「资产说明」的自由文本用过
 * （`motionSource` / `generator` / `plans` / `illustration`）。那些键**原样保留**，
 * 机器可读的路径放在 `files` 下 —— 不丢旧内容，也不把两种语义搅在一起。
 */
export interface BrandAssets {
  /** 身份位图：用途 → 品牌目录内的相对路径（如 `{ logo: 'assets/logo-a.png' }`）。 */
  files?: Record<string, string>
  /** 历史自由字段（motionSource / generator / plans / illustration…）原样保留。 */
  [key: string]: unknown
}

export interface BrandProfile {
  /** 品牌档案 ID（目录名），小写字母/数字/连字符。 */
  name: string
  /** 品牌包容器格式版本（导入/打包时写入；本机自建为空）。 */
  formatVersion?: number
  /** 资产索引（身份位图在品牌目录内的相对路径）。 */
  assets?: BrandAssets
  /** 撞名映射：导入时被改名的组件 → 原名（让 agent 知道该调哪个名字）。 */
  renamedFrom?: Record<string, string>
  /** 对外展示名（如公众号名）。 */
  displayName?: string
  /** 一句话品牌定位 + 气质关键词。 */
  description: string
  /** 色彩论证：为什么是这个色（采样来源与理由）。写不出论证的品牌不允许保存。 */
  rationale: string
  /** 完整排版主题（已通过 Schema + 微信白名单校验），主题名与品牌名一致。 */
  theme: Theme
  /** 品牌专属组件库（建议以品牌名为前缀，如 tide-quote）。 */
  components: UserComponentDef[]
  /** 品牌 logo 图片路径（品牌目录内相对路径，或内联 `data:`；导入时拒绝远程 URL）。 */
  logo?: string
  /** 品牌默认封面图路径（同上）。 */
  coverImage?: string
  /** 品牌头图组件名：每篇文章开头自动调用（如 ink-header），通常包含 logo + 品牌名 + 期号。 */
  headerComponent?: string
  /** 语气 / 编排规则（每节末尾金句、不用感叹号等），随渲染上下文注入。 */
  voice?: string[]
  /** 禁忌清单（绝对不要出现的东西）。 */
  taboos?: string[]
  /** 迭代记录：每次 brand_learn 追加一条。 */
  learnings: BrandLearning[]
  updatedAt: string
}

function profilePath(name: string, opts?: BrandStoreOptions): string {
  return join(brandDir(name, opts), 'profile.json')
}

function docPath(name: string, opts?: BrandStoreOptions): string {
  return join(brandDir(name, opts), 'brand.md')
}

function readProfile(name: string, opts?: BrandStoreOptions): BrandProfile {
  const file = profilePath(name, opts)
  if (!existsSync(file)) {
    throw serviceError(
      'brand_not_found',
      `品牌档案「${name}」不存在。`,
      '先用 brand_list 查看已有品牌；没有就通过 brand_interview 访谈后 brand_save 建立。',
    )
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as BrandProfile
  } catch {
    throw serviceError('brand_corrupted', `品牌档案「${name}」的 profile.json 损坏。`, '请修复或删除后重建该品牌档案。')
  }
}

function writeProfile(profile: BrandProfile, opts?: BrandStoreOptions): void {
  const dir = brandDir(profile.name, opts)
  mkdirSync(dir, { recursive: true })
  writeFileSync(profilePath(profile.name, opts), JSON.stringify(profile, null, 2), 'utf8')
}

/**
 * 从 profile 生成 brand.md 骨架（agent 传了 doc 则用 doc 覆盖正文主体）。
 *
 * 事实类小节（色板 / 字号 / 组件清单 / logo / 迭代记录）走 `<!-- stylewx:auto … -->`
 * 自动段，由程序生成、由 doctor 校验；定位 / 色彩论证 / 语气 / 禁忌留给人写。
 */
function renderBrandDoc(profile: BrandProfile): string {
  const lines: string[] = []
  lines.push(`# ${profile.displayName ?? profile.name} · 品牌宪法`)
  lines.push('')
  lines.push(`> 本文件由 stylewx 品牌记忆系统维护，人可以直接编辑。`)
  lines.push(`> 标注 \`<!-- stylewx:auto … -->\` 的小节由程序生成（改它会被下一次同步覆盖），其余小节是人写的。`)
  lines.push(`> 改完告诉 agent 重新 brand_save 即可生效。`)
  lines.push('')
  lines.push('## 品牌定位')
  lines.push('')
  lines.push(profile.description)
  lines.push('')
  lines.push('## 色彩论证')
  lines.push('')
  lines.push(profile.rationale)
  for (const key of AUTO_KEYS) {
    const section = renderAutoSection(key, profile)
    if (!section) continue
    lines.push('')
    lines.push(`## ${autoTitle(key)}`)
    lines.push('')
    lines.push(section)
  }
  if (profile.voice?.length) {
    lines.push('')
    lines.push('## 语气与编排规则')
    lines.push('')
    for (const v of profile.voice) lines.push(`- ${v}`)
  }
  if (profile.taboos?.length) {
    lines.push('')
    lines.push('## 禁忌')
    lines.push('')
    for (const v of profile.taboos) lines.push(`- ${v}`)
  }
  lines.push('')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// brand_interview：返回结构化访谈问题清单（纯数据，不烧 LLM，访谈由 agent 完成）
// ---------------------------------------------------------------------------

export interface InterviewQuestion {
  id: string
  question: string
  why: string
  /** 引导用户更易回答的选项 / 示例。 */
  examples?: string[]
  required: boolean
}

export interface InterviewSection {
  id: string
  title: string
  questions: InterviewQuestion[]
}

/** 品牌访谈问卷：agent 拿到后一次性批量问用户，再把回答提炼成 brand_save 的入参。 */
export function brandInterview(): { instructions: string; sections: InterviewSection[] } {
  return {
    instructions:
      '把下面的问题一次性批量列给用户（不要一个个来回问）。用户答不上来的可以跳过（除 required 外）。' +
      '收集完成后，由你（agent）提炼为品牌档案：推导色板并写出一句话色彩论证（采样→收敛→论证），' +
      '产出完整主题 JSON 与品牌专属组件，然后调用 brand_save 固化。不要把未加工的原始回答直接存档。',
    sections: [
      {
        id: 'positioning',
        title: '定位与受众',
        questions: [
          { id: 'account_name', question: '公众号名称是什么？（将作为品牌档案展示名）', why: '确定品牌档案 ID 与展示名', required: true },
          { id: 'positioning', question: '这个号是做什么的？给谁看？', why: '定位决定气质边界：给创业者看的和给主妇看的，排版气质完全不同', examples: ['AI 工具评测 / 一线开发者', '生活方式 / 25-35 岁都市女性'], required: true },
        ],
      },
      {
        id: 'temperament',
        title: '气质关键词',
        questions: [
          { id: 'keywords', question: '用 3~5 个词形容你想要的排版气质？', why: '气质关键词直接决定色彩温度与组件风格', examples: ['克制、专业、冷静', '温暖、治愈、手账感', '大胆、年轻、撞色'], required: true },
          { id: 'temperature', question: '三个方向里你偏好哪种：安静极简 / 中性编辑感 / 大胆强对比？', why: '确定主题温度，三方向门会按这个偏好配比出稿', required: false },
        ],
      },
      {
        id: 'color',
        title: '色彩来源',
        questions: [
          { id: 'color_source', question: '有既定品牌色吗？（直接给 hex 色值最好；没有就说说你希望从哪里取色：logo / 产品图 / 内容领域）', why: '色彩必须采样自真实来源，禁止凭空发明；有 hex 就不用猜', examples: ['#0B6BFF 是我们 logo 的蓝', '从封面插画里取色', '科技领域，但不要默认科技蓝'], required: true },
          { id: 'color_taboo', question: '有没有绝对不想看到的颜色？', why: '写入禁忌清单', examples: ['不要荧光色', '不要大红大紫'], required: false },
        ],
      },
      {
        id: 'asset',
        title: '资产',
        questions: [
          { id: 'logo', question: '有 logo / 封面图吗？（logo 将用于封面图、cover 组件、文末签名位，不进正文每节）', why: '确定 logo 使用位', required: false },
          { id: 'reference', question: '有喜欢的参考公众号或排版截图吗？', why: '参考是最高效的气质对齐方式', required: false },
        ],
      },
      {
        id: 'component',
        title: '组件与编排偏好',
        questions: [
          { id: 'component_preference', question: '喜欢什么样的内容表达？多选：金句引用 / 数据卡片 / 步骤流程 / 时间线 / 对比表格 / 点击展开互动 / 都可以', why: '决定品牌专属组件库建哪些', required: false },
          { id: 'voice', question: '有没有语气 / 编排规则？（例如：每节末尾一句金句、不用感叹号、开头必有导语）', why: '写入 voice 规则，之后每篇文章自动遵循', required: false },
          { id: 'taboo', question: '排版上有没有禁忌？（例如：不要目录、不要太多卡片、正文不要居中）', why: '写入禁忌清单，评审时会被拦下', required: false },
        ],
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// brand_save / brand_list / brand_apply / brand_learn / brand_delete
// ---------------------------------------------------------------------------

export interface BrandSaveInput {
  name: string
  displayName?: string
  description: string
  rationale: string
  /** 完整主题 JSON（含 name/description/tokens/blocks），必须通过 Schema + 微信白名单校验。 */
  theme: unknown
  /** 品牌专属组件定义（可选；保存前同样做微信校验）。 */
  components?: UserComponentDef[]
  voice?: string[]
  taboos?: string[]
  /** 人可读的品牌宪法正文（Markdown）。缺省由 profile 自动生成骨架。 */
  doc?: string
  /** 品牌 logo 路径（可选）。 */
  logo?: string
  /** 品牌默认封面图路径（可选）。 */
  coverImage?: string
  /** 品牌头图组件名（可选）：每篇文章开头先调它。 */
  headerComponent?: string
  /** 品牌包来源标识（导入时写入侧车 manifest.json，不写进 profile）。 */
  origin?: string
  /** 容器格式版本（导入/打包时写入 profile）。 */
  formatVersion?: number
  /** 资产索引（导入时写入 profile）。 */
  assets?: BrandAssets
  /** 撞名映射（导入时写入 profile）。 */
  renamedFrom?: Record<string, string>
}

export interface BrandSaveResult {
  profile: BrandProfile
  /** brand.md 的落盘内容。 */
  doc: string
  docPath: string
  profilePath: string
}

/** 保存（或覆盖）一个品牌档案：校验主题与组件 → 写 profile.json + brand.md。 */
export function brandSave(input: unknown, opts?: BrandStoreOptions): BrandSaveResult {
  if (!input || typeof input !== 'object') {
    throw serviceError('invalid_brand', 'brand_save 需要对象入参。', '请提供 { name, description, rationale, theme, components?, voice?, taboos?, doc? }。')
  }
  const raw = input as Partial<BrandSaveInput>

  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!BRAND_NAME_RE.test(name)) {
    throw serviceError(
      'invalid_brand',
      `品牌名「${name}」不合法。`,
      '用小写字母开头的小写字母/数字/连字符（≤32 字符），例如 tide-notes。',
    )
  }
  if (typeof raw.description !== 'string' || !raw.description.trim()) {
    throw serviceError('invalid_brand', '缺少 description（一句话品牌定位 + 气质关键词）。', '例如「AI 工具评测号，气质：克制、专业、冷静」。')
  }
  if (typeof raw.rationale !== 'string' || raw.rationale.trim().length < 10) {
    throw serviceError(
      'invalid_brand',
      '缺少色彩论证 rationale（或太短）。',
      '论证是防 AI slop 的自检门：写清楚色值采样自哪里、为什么是这个色。写不出来说明你在抄配方，请回去重新推导。',
    )
  }

  // 主题必须整体过 Schema + 白名单，且主题名与品牌名对齐。
  // agent 直出时往往只写关键 block（h1/h2/p/blockquote…），缺省 block 用中性样式补全。
  const themeInputRaw =
    raw.theme && typeof raw.theme === 'object' ? (raw.theme as Record<string, unknown>) : undefined
  if (!themeInputRaw) {
    throw serviceError('invalid_brand', '缺少 theme。', '请产出完整主题 JSON（name/description/tokens/blocks）。')
  }
  const themeInput = {
    ...themeInputRaw,
    name,
    blocks: completeThemeBlocks(themeInputRaw.blocks as Record<string, Record<string, string>> | undefined),
  }
  const themeCheck = validateTheme(themeInput)
  if (!themeCheck.ok || !themeCheck.theme) {
    const detail = themeCheck.issues.map((i) => `${i.path}: ${i.message}`).join('；')
    throw serviceError(
      'invalid_brand',
      `品牌主题不合法：${detail}`,
      'theme 需要是完整的主题 JSON（name/description/tokens/blocks，CSS 属性在微信白名单内）。可以先 tweak_theme 或参照 list_themes 的预置主题结构。',
    )
  }

  // 品牌组件逐个过微信校验
  const components: UserComponentDef[] = []
  if (Array.isArray(raw.components)) {
    for (const c of raw.components) {
      const saved = saveUserComponent(c, { file: join(brandDir(name, opts), '.components-validate.json') })
      components.push(saved.component)
    }
    // 校验用的临时文件清掉
    const tmp = join(brandDir(name, opts), '.components-validate.json')
    if (existsSync(tmp)) rmSync(tmp)
  }

  // 主题同步进主题库，让「人」也能在编辑器里选到它。
  //
  // 为什么必须做：profile.json 是 agent 的真相源（brand_apply 会把它交回调用方），但编辑器
  // 的主题下拉读的是 themes.json —— 只写 profile 就会出现「agent 能用、人选不到」的不对称。
  // 实测踩过：hippie-youth 品牌建好了，主题库却没有它，编辑器里根本选不出来。
  // 主题名已在上面被强制对齐为品牌名，所以覆盖写入是幂等的。
  const savedTheme = saveTheme(themeCheck.theme, { file: opts?.themesFile })

  const existing = existsSync(profilePath(name, opts)) ? readProfile(name, opts) : undefined
  const profile: BrandProfile = {
    name,
    formatVersion: raw.formatVersion ?? existing?.formatVersion,
    assets: raw.assets ?? existing?.assets,
    renamedFrom: raw.renamedFrom ?? existing?.renamedFrom,
    displayName: raw.displayName ?? existing?.displayName,
    description: raw.description.trim(),
    rationale: raw.rationale.trim(),
    theme: themeCheck.theme,
    components,
    logo: raw.logo ?? existing?.logo,
    coverImage: raw.coverImage ?? existing?.coverImage,
    headerComponent: raw.headerComponent ?? existing?.headerComponent,
    voice: Array.isArray(raw.voice) ? raw.voice.filter((v): v is string => typeof v === 'string' && !!v.trim()) : existing?.voice,
    taboos: Array.isArray(raw.taboos) ? raw.taboos.filter((v): v is string => typeof v === 'string' && !!v.trim()) : existing?.taboos,
    learnings: existing?.learnings ?? [],
    updatedAt: new Date().toISOString(),
  }

  writeProfile(profile, opts)
  // 自动段必须成对：漏一个结束标记，后面的散文会被当成段内容吞掉（人写的字就丢了）。
  const provided = typeof raw.doc === 'string' && raw.doc.trim() ? raw.doc : undefined
  if (provided) {
    const unpaired = findUnpairedMarkers(provided)
    if (unpaired.length) {
      throw serviceError(
        'invalid_brand',
        `brand.md 的自动段标记不完整：${unpaired.join('；')}`,
        '每个 `<!-- stylewx:auto <key> -->` 都必须有对应的 `<!-- /stylewx:auto -->`。',
      )
    }
  }
  // 无论 doc 是传进来的还是自动生成的，事实类小节都按 profile 重算一遍：
  // 段外（人写的散文）原样保留。
  const { doc } = syncBrandDoc(provided ?? renderBrandDoc(profile), profile)
  const dir = brandDir(name, opts)
  mkdirSync(dir, { recursive: true })
  writeFileSync(docPath(name, opts), doc, 'utf8')

  return { profile, doc, docPath: docPath(name, opts), profilePath: profilePath(name, opts) }
}

/** 列出所有品牌档案（摘要）。 */
export function brandList(opts?: BrandStoreOptions): { brands: Array<Pick<BrandProfile, 'name' | 'displayName' | 'description' | 'updatedAt'> & { componentCount: number; learningCount: number }> } {
  const dir = brandsDir(opts)
  if (!existsSync(dir)) return { brands: [] }
  const names = readdirSafe(dir)
  const brands = names
    .map((n) => {
      try {
        const p = readProfile(n, opts)
        return {
          name: p.name,
          displayName: p.displayName,
          description: p.description,
          updatedAt: p.updatedAt,
          componentCount: p.components.length,
          learningCount: p.learnings.length,
        }
      } catch {
        return undefined
      }
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
  return { brands }
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir).filter((n) => existsSync(join(dir, n, 'profile.json')))
  } catch {
    return []
  }
}

/** 品牌档案根目录（doctor / 编辑器用）。 */
export function brandsRootPath(opts?: BrandStoreOptions): string {
  return brandsDir(opts)
}

/** 读取一个品牌档案（doctor / 编辑器用）。 */
export function readBrandProfile(name: string, opts?: BrandStoreOptions): BrandProfile {
  return readProfile(name, opts)
}

/** 品牌档案在磁盘上的三个位置（报错时指路用）。 */
export function brandPaths(name: string, opts?: BrandStoreOptions): { dir: string; profile: string; doc: string } {
  return { dir: brandDir(name, opts), profile: profilePath(name, opts), doc: docPath(name, opts) }
}

/** 品牌目录列表（含没有 profile.json 的目录，doctor 要能报出它们）。 */
export function brandDirNames(opts?: BrandStoreOptions): string[] {
  const dir = brandsDir(opts)
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

export interface BrandApplyResult {
  profile: BrandProfile
  /** 编译好的完整主题（可直接传给 render_preview / render_fragment / publish_draft）。 */
  theme: Theme
  /** 品牌宪法正文（作为设计上下文注入 agent）。 */
  doc: string
  /** 品牌专属组件（渲染时会从全局组件库解析；此处返回供 agent 确认）。 */
  components: UserComponentDef[]
  /** 已同步到全局组件库的品牌组件名。 */
  syncedComponents: string[]
}

/**
 * 加载品牌档案并编译为可直接使用的主题 + 组件。
 * 品牌组件会同步进全局组件库（~/.stylewx/components.json），render 工具即可按 `:::名字` 调用。
 */
export function brandApply(name: string, opts?: BrandStoreOptions): BrandApplyResult {
  const profile = readProfile(name, opts)
  const synced: string[] = []
  for (const c of profile.components) {
    saveUserComponent(c)
    synced.push(c.name)
  }
  // 同步主题进主题库：品牌可能是早期版本建的（那时只写 profile.json），
  // 或用户手改了 themes.json。这里幂等补齐，保证 brand_apply 之后编辑器一定能选到。
  const theme = saveTheme(profile.theme, { file: opts?.themesFile }).theme
  return { profile, theme, doc: readBrandDoc(name, opts), components: structuredClone(profile.components), syncedComponents: synced }
}

/** 读取品牌宪法正文（人可能手改过，以文件为准；缺失则从 profile 重新生成）。 */
export function readBrandDoc(name: string, opts?: BrandStoreOptions): string {
  const file = docPath(name, opts)
  if (existsSync(file)) return readFileSync(file, 'utf8')
  return renderBrandDoc(readProfile(name, opts))
}

/** 追加一条迭代记录（同时写入 profile.learnings 与 brand.md 迭代记录节）。 */
export function brandLearn(name: string, note: string, opts?: BrandStoreOptions): { profile: BrandProfile; doc: string } {
  const trimmed = typeof note === 'string' ? note.trim() : ''
  if (!trimmed) throw serviceError('invalid_brand', 'brand_learn 需要非空 note。', '记录这次排版学到的东西，例如「用户嫌卡片底色太花，下次降低饱和度」。')
  const profile = readProfile(name, opts)
  profile.learnings.push({ date: new Date().toISOString().slice(0, 10), note: trimmed })
  profile.updatedAt = new Date().toISOString()
  writeProfile(profile, opts)
  // 迭代记录是自动段：整体按 profile 重算，不再靠正则往标题下塞一行
  // （旧实现遇到「迭代记录」标题被人改过、或标题下已有内容时会插错位置）。
  const file = docPath(name, opts)
  const base = existsSync(file) ? readFileSync(file, 'utf8') : renderBrandDoc(profile)
  const { doc } = syncBrandDoc(base, profile)
  mkdirSync(brandDir(name, opts), { recursive: true })
  writeFileSync(file, doc, 'utf8')
  return { profile, doc }
}

/** 删除品牌档案（目录级删除，含 brand.md）。 */
export function brandDelete(name: string, opts?: BrandStoreOptions): { deleted: string } {
  const dir = brandDir(name, opts)
  if (!existsSync(dir)) {
    throw serviceError('brand_not_found', `品牌档案「${name}」不存在。`, '用 brand_list 查看已有品牌。')
  }
  rmSync(dir, { recursive: true, force: true })
  return { deleted: name }
}

// ---------------------------------------------------------------------------
// review_article：发布前的确定性品味检查（定性判断由 agent 基于截图完成）
// ---------------------------------------------------------------------------

export interface ReviewIssue {
  severity: 'error' | 'warning' | 'info'
  dimension: 'hierarchy' | 'component-density' | 'uniqueness' | 'readability' | 'consistency'
  message: string
  suggestion: string
}

export interface ReviewArticleResult {
  pass: boolean
  /** 主题标题/正文字号层级比（h1、h2 相对正文）。 */
  hierarchy: { h1Ratio: number | null; h2Ratio: number | null }
  /** 用到的组件类型与次数。 */
  componentUsage: { name: string; count: number }[]
  /** 组件类型数（>6 提示堆砌）。 */
  componentTypeCount: number
  /** 每千字组件次数。 */
  componentsPerKiloChar: number
  issues: ReviewIssue[]
  /** 给 agent 的定性评审框架（Keep / Fix / Quick Wins + 眯眼测试）。 */
  qualitativePrompt: string
}

function parsePx(v: string | undefined): number | null {
  if (!v) return null
  const m = /([\d.]+)px/.exec(v)
  return m ? Number(m[1]) : null
}

/**
 * 发布前的确定性评审：
 * - 层级：h1/h2 与正文字号比（< 2.0 / 1.5 警告——微信移动端层级模糊）
 * - 组件堆砌：类型数 > 6 警告
 * - 组件密度：每千字 > 4 次警告
 * - 独特性：主题与全部预置主题相同 → 提示缺品牌感
 */
export function reviewArticle(markdown: string, theme: Theme, opts?: { presetThemes?: Theme[] }): ReviewArticleResult {
  const issues: ReviewIssue[] = []
  const t = theme.blocks
  const bodyPx = parsePx(t.p?.['font-size']) ?? parsePx(theme.tokens.fontSize) ?? 15
  const h1Px = parsePx(t.h1?.['font-size'])
  const h2Px = parsePx(t.h2?.['font-size'])
  const h1Ratio = h1Px ? Number((h1Px / bodyPx).toFixed(2)) : null
  const h2Ratio = h2Px ? Number((h2Px / bodyPx).toFixed(2)) : null
  if (h1Ratio !== null && h1Ratio < 2.0) {
    issues.push({ severity: 'warning', dimension: 'hierarchy', message: `h1 与正文层级比仅 ${h1Ratio}（建议 ≥ 2.0）`, suggestion: '用 tweak_theme 把 h1 font-size 提到正文的 2 倍以上，或缩小正文字号。' })
  }
  if (h2Ratio !== null && h2Ratio < 1.5) {
    issues.push({ severity: 'warning', dimension: 'hierarchy', message: `h2 与正文层级比仅 ${h2Ratio}（建议 ≥ 1.5）`, suggestion: '用 tweak_theme 把 h2 font-size 提到正文的 1.5 倍左右，并配合颜色/粗细建立层级。' })
  }

  // 组件统计
  const usage = new Map<string, number>()
  for (const m of markdown.matchAll(/:::+\s*([a-z][a-z0-9-]*)/g)) {
    usage.set(m[1]!, (usage.get(m[1]!) ?? 0) + 1)
  }
  const componentUsage = Array.from(usage.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
  const typeCount = componentUsage.length
  const chars = markdown.replace(/\s/g, '').length || 1
  const totalUses = componentUsage.reduce((s, c) => s + c.count, 0)
  const perKilo = Number(((totalUses / chars) * 1000).toFixed(2))
  if (typeCount > 6) {
    issues.push({ severity: 'warning', dimension: 'component-density', message: `用了 ${typeCount} 种组件，超过 6 种`, suggestion: '堆砌组件比没有组件更糟：砍到 4~6 种，让同一种组件在全文重复形成节奏。' })
  }
  if (perKilo > 4) {
    issues.push({ severity: 'warning', dimension: 'component-density', message: `组件密度 ${perKilo}/千字，偏高`, suggestion: '正文才是主角：合并短段落，减少装饰性组件。' })
  }

  // 独特性：与任一预置主题完全一致 → 缺品牌感
  const presets = opts?.presetThemes ?? []
  const same = presets.some((p) => JSON.stringify(p) === JSON.stringify(theme))
  if (same) {
    issues.push({ severity: 'info', dimension: 'uniqueness', message: '当前主题与某个预置主题完全一致', suggestion: '至少 tweak_theme 调整主色/圆角/卡片底，让它成为「这个号自己的」样子；有品牌档案时用 brand_apply。' })
  }

  return {
    pass: !issues.some((i) => i.severity === 'error'),
    hierarchy: { h1Ratio, h2Ratio },
    componentUsage,
    componentTypeCount: typeCount,
    componentsPerKiloChar: perKilo,
    issues,
    qualitativePrompt:
      '请再看一遍 390px 截图完成定性评审，输出三栏清单：Keep（保留的优点）/ Fix（必须改的问题）/ Quick Wins（5 分钟内能做的提升）。' +
      '评审时做「眯眼测试」：眯起眼层级是否仍清晰；并自查 AI 感（默认蓝、模板感、组件堆砌）。确认无 error 后再 publish_draft。',
  }
}
