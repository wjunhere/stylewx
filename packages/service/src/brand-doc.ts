/**
 * 品牌宪法的「自动段」机制。
 *
 * 背景（P0 要修的真问题②）：`brand.md` 同时承担两种内容 —— 程序能算出来的事实
 * （色板表、字号、组件清单、迭代记录）和只有人能写的散文（定位、色彩论证、禁忌背后的
 * 理由）。前者由程序写、程序改；后者由人写。混在一起时，程序重写整篇会抹掉人的字，
 * 程序不重写则事实会漂 —— 实测漂过：`brand.md` 里写着「C『行囊』…一人背行囊走出灯下」，
 * 而两轮前 C 已经改成「远山」（去掉人影）。
 *
 * 解法：用 HTML 注释标记把两类内容分开，注释不会渲染出来（Markdown / 微信都不显示）。
 *
 *     ## 核心色板
 *
 *     <!-- stylewx:auto palette -->
 *     | 用途 | 色值 |
 *     ...
 *     <!-- /stylewx:auto -->
 *
 * 规则：
 *  - 自动段**只由程序生成**（`renderAutoBlock`），`syncBrandDoc` 用生成的替换文件里的旧段。
 *  - 段外的一切字节原样保留（`docAround`）—— 这就是「人的字不会被覆盖」的保证。
 *  - 自动段缺失时补在文件末尾；缺失不是错误（老文档先补上，再纳入闸门）。
 *  - 自动段与 profile 不一致是错误（`checkBrandDoc`），由 `brand doctor` 报出。
 *
 * 注意：本模块不碰 fs —— 纯字符串处理，可在浏览器侧复用。
 */

/**
 * 自动段键：段内容完全由 profile 决定。
 */
export type AutoKey = 'palette' | 'typography' | 'components' | 'logo' | 'learnings'

/** 自动段的排列顺序（sync 时按此顺序重建缺失段）。 */
export const AUTO_KEYS: readonly AutoKey[] = ['palette', 'typography', 'components', 'logo', 'learnings']

/**
 * 自动段里「必须逐字节一致」的键。
 *
 * 为什么 learnings 不在其中：迭代记录是人会在文档里**续写细节**的地方 ——
 * 实测 hippie-youth 的一条记录在 brand.md 里带了 5 条子级补充（子列表），而 profile
 * 只存一句话摘要。要求逐字一致会把「人在文档里补充细节」变成闸门错误，反而逼人删掉细节。
 * 所以 learnings 只**生成与补齐**，不参与漂移判定（它的单调追加性质由 brand_learn 保证）。
 */
export const STRICT_AUTO_KEYS: readonly AutoKey[] = ['palette', 'typography', 'components', 'logo']

/** 自动段里「缺失才算错」的键（内容不做逐字比对）。 */
export const LOOSE_AUTO_KEYS: readonly AutoKey[] = ['learnings']

/** 段标题（人读文档时的可见小标题；自动段本身不带标题，标题留给人写）。 */
const AUTO_TITLES: Record<AutoKey, string> = {
  palette: '核心色板',
  typography: '排版基调',
  components: '品牌专属组件',
  logo: 'Logo',
  learnings: '迭代记录',
}

/**
 * 「核心色板」自动段要列的 token，按主题 schema 的声明顺序。
 *
 * 为什么是一份完整清单，而不是只挑 5 个常用的：清单短了，人在文档里补的那一行就**没有地方去** ——
 * 它只能留在自动段外，而「段外」按约定是人写内容，程序既不该删也不会重算。
 * 实测踩过：stylewx-craft 的 `pageBackgroundColor`（页底）不在清单里，于是色板段外多出一行
 * 「| 页底 pageBg | `#F7F9FC` |」，段外永远清不干净。
 *
 * 约束：这份清单与 `@stylewx/theme` 的 `colorSchema` 类 token **必须一一对应** ——
 * 由 `brand-doc.test.ts` 直接比对 schema（不是比对另一份手写清单），漏一个就红。
 */
export const PALETTE_TOKENS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'primaryColor', label: '主色 primary' },
  { key: 'textColor', label: '正文 text' },
  { key: 'accentColor', label: '强调 accent' },
  { key: 'mutedColor', label: '次要 muted' },
  { key: 'cardBg', label: '卡片底 cardBg' },
  { key: 'cardBorderColor', label: '卡片描边 cardBorder' },
  { key: 'dividerColor', label: '分割线 divider' },
  { key: 'canvasBg', label: '画布底 canvasBg' },
  { key: 'pageBackgroundColor', label: '页底 pageBg' },
]

const OPEN = (key: string): string => `<!-- stylewx:auto ${key} -->`
const CLOSE = '<!-- /stylewx:auto -->'

/** 人写的段：内容来自 profile，但允许人在文档里补充细节（doc 是人读的那一份）。 */
export const HUMAN_SECTIONS = { positioning: '品牌定位', rationale: '色彩论证' } as const

/** 任一自动段的完整正则（贪婪到最近一个闭合标记）。 */
const ANY_BLOCK_RE = /<!--\s*stylewx:auto\s+([a-z]+)\s*-->([\s\S]*?)<!--\s*\/stylewx:auto\s*-->/g

/** 品牌档案里参与自动段生成的最小形状（与 BrandProfile 结构兼容，不引入循环依赖）。 */
export interface BrandDocFacts {
  name: string
  displayName?: string
  /** 一句话品牌定位（人写段「品牌定位」的内容，doc 应包含它）。 */
  description: string
  /** 色彩论证（人写段「色彩论证」的内容，doc 应包含它）。 */
  rationale: string
  theme: { tokens: Record<string, unknown>; description?: string }
  components: Array<{ name: string; description?: string }>
  headerComponent?: string
  logo?: string
  learnings: Array<{ date: string; note: string }>
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function token(tokens: Record<string, unknown>, key: string): string | undefined {
  return str(tokens[key])
}

/**
 * 生成单个自动段的**内部**内容（不含 `<!-- stylewx:auto … -->` 标记行）。
 * 没有可写内容时返回 undefined（该段不生成）。
 */
export function renderAutoBlock(key: AutoKey, facts: BrandDocFacts): string | undefined {
  const t = facts.theme.tokens
  switch (key) {
    case 'palette': {
      // 只列真实存在的色值：主题里没设的 token 不占行
      const rows: Array<[string, string | undefined]> = PALETTE_TOKENS.map(({ key, label }) => [label, token(t, key)])
      const present = rows.filter((r): r is [string, string] => !!r[1])
      if (!present.length) return undefined
      const lines = ['| 用途 | 色值 |', '| --- | --- |']
      for (const [label, value] of present) lines.push(`| ${label} | \`${value}\` |`)
      return lines.join('\n')
    }
    case 'typography': {
      const lines: string[] = []
      const size = token(t, 'fontSize')
      const lh = t['lineHeight']
      // lineHeight 在 token 里可能是数字（1.9）—— 旧实现直接拼 `${t.lineHeight}` 得到 undefined
      const lhText = typeof lh === 'number' ? String(lh) : (str(lh) ?? undefined)
      if (size || lhText) lines.push(`- 字号 ${size ?? '—'} / 行高 ${lhText ?? '—'}`)
      const font = token(t, 'fontFamily')
      if (font) lines.push(`- 字体栈 \`${font}\``)
      const desc = str(facts.theme.description)
      if (desc) lines.push(`- 主题描述：${desc}`)
      return lines.length ? lines.join('\n') : undefined
    }
    case 'components': {
      const lines: string[] = []
      if (facts.headerComponent) lines.push(`- 头图规范：每篇文章开头先调 \`:::${facts.headerComponent}\``)
      for (const c of facts.components) {
        const desc = str(c.description) ?? ''
        lines.push(`- \`:::${c.name}\`${desc ? ` —— ${desc}` : ''}`)
      }
      return lines.length ? lines.join('\n') : undefined
    }
    case 'logo': {
      const logo = str(facts.logo)
      if (!logo) return undefined
      return `![logo](${logo})\n\n> logo 用于文章头图 / 封面 / end-card 签名位，不进正文每节。`
    }
    case 'learnings': {
      if (!facts.learnings.length) return undefined
      return facts.learnings.map((l) => `- ${l.date}：${l.note}`).join('\n')
    }
  }
}

/** 把自动段包上标记（含前后空行），供写入文档。 */
export function renderAutoSection(key: AutoKey, facts: BrandDocFacts): string | undefined {
  const body = renderAutoBlock(key, facts)
  if (body === undefined) return undefined
  return `${OPEN(key)}\n${body}\n${CLOSE}`
}

/** 该自动段是否带标题（`## 核心色板`）。留给人写的段没有自动段。 */
export function autoTitle(key: AutoKey): string {
  return AUTO_TITLES[key]
}

export interface ParsedAutoBlock {
  key: string
  /** 标记之间的原文（不含标记行）。 */
  body: string
  /** 匹配到的整段（含标记），用于替换。 */
  raw: string
}

/** 解析文档里所有自动段（按出现顺序）。 */
export function parseAutoBlocks(doc: string): ParsedAutoBlock[] {
  const out: ParsedAutoBlock[] = []
  for (const m of doc.matchAll(ANY_BLOCK_RE)) {
    out.push({ key: m[1] as string, body: (m[2] as string).trim(), raw: m[0] as string })
  }
  return out
}

/** 按 `## 标题` 切段（返回标题 → 正文；h1 不计入）。 */
export function parseSections(doc: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = /^##\s+(.+?)\s*$/gm
  const heads = [...doc.matchAll(re)]
  for (let i = 0; i < heads.length; i += 1) {
    const start = (heads[i]!.index ?? 0) + heads[i]![0].length
    const end = i + 1 < heads.length ? (heads[i + 1]!.index ?? doc.length) : doc.length
    out.set(heads[i]![1]!.trim(), doc.slice(start, end).trim())
  }
  return out
}

/**
 * 人写段的一致性**警告**（不是错误）：文档里的定位 / 色彩论证应包含 profile 的对应文本。
 *
 * 为什么是警告而不是错误：这两段按约定是人写的 —— 人可以在文档里补充细节，
 * 而 profile 是 agent 读到的那份。两者不一致时不该拦下发布，但应该提醒去同步。
 */
export function checkHumanSections(doc: string, facts: BrandDocFacts): Array<{ section: string; message: string }> {
  const sections = parseSections(doc)
  const out: Array<{ section: string; message: string }> = []
  const pairs: Array<[string, string]> = [
    [HUMAN_SECTIONS.positioning, facts.description],
    [HUMAN_SECTIONS.rationale, facts.rationale],
  ]
  for (const [title, expected] of pairs) {
    const body = sections.get(title)
    if (body === undefined || !expected.trim()) continue
    if (!body.includes(expected.trim())) {
      out.push({
        section: title,
        message: `brand.md 的「${title}」与 profile 不一致（文档是人读的那份，profile 是 agent 读的那份）`,
      })
    }
  }
  return out
}

/**
 * 同步：用程序生成的自动段替换文件里的旧段；文件里缺失的段补进**同名小节**。
 *
 * 插入位置规则（关键，否则段会跑到文件末尾、跟小标题脱节）：
 *   1. 段已存在 → 原地替换内容；
 *   2. 段缺失、但文件里有 `## <该段的标题>` → 插到标题之后（其余内容原样留在下面）；
 *   3. 段缺失、也没有标题 → 在文末补「标题 + 段」。
 *
 * **段外的字节原样保留** —— 人的散文与标题不受影响。
 */
export function syncBrandDoc(doc: string, facts: BrandDocFacts): { doc: string; changed: boolean } {
  let next = doc
  for (const key of AUTO_KEYS) {
    const section = renderAutoSection(key, facts)
    const re = new RegExp(`<!--\\s*stylewx:auto\\s+${key}\\s*-->[\\s\\S]*?<!--\\s*\\/stylewx:auto\\s*-->`)
    if (section === undefined) {
      // 没有内容可写：若文档里残留旧段，删掉它（不能留过期的自动内容）
      if (re.test(next)) next = next.replace(re, '').replace(/\n{3,}/g, '\n\n')
      continue
    }
    if (re.test(next)) {
      next = next.replace(re, section)
      continue
    }
    const headingRe = new RegExp(`^##\\s*${autoTitle(key)}\\s*$`, 'm')
    if (headingRe.test(next)) {
      next = next.replace(headingRe, (h) => `${h}\n\n${section}`)
    } else {
      next = next.trimEnd() + `\n\n## ${autoTitle(key)}\n\n${section}\n`
    }
  }
  // 清理替换留下的多余空行（只压三连空行，避免动到人写的段落间距）
  next = next.replace(/\n{3,}/g, '\n\n')
  return { doc: next, changed: next !== doc }
}

/** 自动段标记的成对性检查（漏闭合标记会让后面的正文被当成段内容吞掉）。 */
export function findUnpairedMarkers(doc: string): string[] {
  const opens = [...doc.matchAll(/<!--\s*stylewx:auto\s+([a-z]+)\s*-->/g)].map((m) => m[1] as string)
  const closes = (doc.match(/<!--\s*\/stylewx:auto\s*-->/g) ?? []).length
  if (opens.length === closes) return []
  return [`自动段标记不成对：${opens.length} 个开始标记 / ${closes} 个结束标记`]
}

/**
 * 一致性检查：文件里的自动段必须等于由 facts 生成的内容。
 *
 * STRICT 键逐字比对（漂移 / 缺失都报）；LOOSE 键只在**缺失**时报。
 * 返回不一致的段键。
 */
export function checkBrandDoc(doc: string, facts: BrandDocFacts): Array<{ key: string; expected: string; actual: string; kind: 'drift' | 'missing' }> {
  const found = new Map(parseAutoBlocks(doc).map((b) => [b.key, b.body]))
  const issues: Array<{ key: string; expected: string; actual: string; kind: 'drift' | 'missing' }> = []
  for (const key of [...STRICT_AUTO_KEYS, ...LOOSE_AUTO_KEYS]) {
    const expected = renderAutoBlock(key, facts)
    if (expected === undefined) continue
    const actual = found.get(key)
    if (actual === undefined) {
      issues.push({ key, expected, actual: '', kind: 'missing' })
    } else if (STRICT_AUTO_KEYS.includes(key) && actual !== expected.trim()) {
      issues.push({ key, expected, actual, kind: 'drift' })
    }
  }
  return issues
}

/** 去掉所有自动段（只看人写的内容时用）。 */
export function stripAutoBlocks(doc: string): string {
  return doc.replace(ANY_BLOCK_RE, '').replace(/\n{3,}/g, '\n\n')
}
