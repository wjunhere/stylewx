/**
 * 把最终 Markdown 落盘，并返回可直接打开的本地编辑器地址。
 * 这是「agent 生成 → 人在编辑器里微调」的交接点。
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { serviceError } from './errors.js'
import { parseFrontMatter, stringifyFrontMatter } from './front-matter.js'

export interface SaveArticleParams {
  /** 文章 Markdown。 */
  markdown: string
  /** 目标路径：相对路径基于文章根目录；绝对路径必须在根目录内。缺省按标题生成文件名。 */
  path?: string
  /** 标题（用于生成默认文件名，也用于返回信息）。 */
  title?: string
  /**
   * 排版主题名。给了就写进 `.md` 的 front-matter，
   * 这样用户拿编辑器打开/导入这个 md 时会自动选回该主题。
   */
  theme?: string
  /**
   * 允许「明显变短」的覆盖。
   *
   * 默认拒绝把一篇完整文章换成一小段内容（见 assertNotAccidentalShrink），
   * 因为这种覆写几乎都是误操作，且不可逆。确认无误时传 true。
   */
  force?: boolean
}

export interface SaveArticleResult {
  /** 落盘后的绝对路径。 */
  path: string
  /** 写入字节数。 */
  bytes: number
  /** 本地编辑器地址（带 ?file=，打开即可继续微调）。 */
  editorUrl: string
  /** 文章根目录（限制写入范围）。 */
  root: string
  /** 写入 front-matter 的主题名（未指定则 undefined）。 */
  theme?: string
}

/** 允许写入的根目录：可用 STYLEWX_ARTICLES_DIR 覆盖，默认当前工作目录。 */
export function articlesRoot(): string {
  return resolve(process.env['STYLEWX_ARTICLES_DIR'] ?? process.cwd())
}

/** 本地编辑器地址前缀。 */
export function editorBaseUrl(): string {
  return (process.env['STYLEWX_EDITOR_URL'] ?? 'http://localhost:3777').replace(/\/+$/, '')
}

/** 判断目标路径是否落在允许的根目录内（防目录穿越）。 */
export function isInside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel))
}

/**
 * 允许写入的根目录列表（「另存为」可选的顶层范围）。
 *
 * 默认是文章根目录 + 用户主目录：文章可以放任意常见位置，但 C:\Windows、
 * Program Files 等系统位置天然在主目录之外，不会被浏览/写入。
 * 用 STYLEWX_WRITE_ROOTS 追加更多根（分号分隔），主要用于把文章库放在其他盘。
 */
export function writeRoots(): string[] {
  const roots = [articlesRoot()]
  const home = process.env['USERPROFILE'] || process.env['HOME']
  if (home) roots.push(resolve(home))
  const extra = process.env['STYLEWX_WRITE_ROOTS']
  if (extra) for (const r of extra.split(';')) if (r.trim()) roots.push(resolve(r.trim()))
  return [...new Set(roots.map((r) => (process.platform === 'win32' ? r.toLowerCase() : r)))].map(
    (r) => r,
  )
}

/** 目标是否落在任一允许写入的根目录内。 */
export function isInsideAnyRoot(target: string): boolean {
  const t = process.platform === 'win32' ? resolve(target).toLowerCase() : resolve(target)
  return writeRoots().some((root) => isInside(root, t))
}

/** 目标命中哪个允许根（用于 UI 提示）；不命中返回 undefined。 */
export function matchedRoot(target: string): string | undefined {
  const t = process.platform === 'win32' ? resolve(target).toLowerCase() : resolve(target)
  return writeRoots().find((root) => isInside(root, t))
}

/** 由标题 / 正文首行标题生成安全文件名。 */
export function slugify(title: string): string {
  const base = (title || 'article')
    .trim()
    .replace(/[\\/:*?"<>|#]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '')
  return base || 'article'
}

function firstHeading(markdown: string): string {
  const m = /^#\s+(.+)$/m.exec(markdown)
  return m?.[1]?.trim() ?? ''
}

/** 触发「缩水护栏」的阈值：原文件至少 1KB，且新内容不足它的 25%。 */
const SHRINK_MIN_BYTES = 1000
const SHRINK_RATIO = 0.25

/**
 * 阻止「把一篇完整文章换成一小段」的误覆盖。
 *
 * 这不是假想风险：实测中一次误点保存就把 12303 字节的文章写成了 71 字节，
 * 全文丢掉且无任何提示。宁可多一次确认，也不静默丢数据。
 */
function assertNotAccidentalShrink(target: string, nextBytes: number, force: boolean | undefined): void {
  if (force || !existsSync(target)) return
  const prevBytes = statSync(target).size
  if (prevBytes < SHRINK_MIN_BYTES || nextBytes >= prevBytes * SHRINK_RATIO) return
  const percent = Math.round((nextBytes / prevBytes) * 100)
  throw serviceError(
    'content_shrunk',
    `新内容只有原文件的 ${percent}%（${prevBytes} 字节 → ${nextBytes} 字节），已拒绝覆盖：${target}`,
    '原文件未改动。确认就是要换成短内容时，带 force: true 重新保存（编辑器里会再问一次）。',
  )
}

/**
 * 保存文章 Markdown 到磁盘。
 * 路径必须落在 `STYLEWX_ARTICLES_DIR`（默认 cwd）内，否则拒绝写入。
 */
export function saveArticle(params: SaveArticleParams): SaveArticleResult {
  if (!params.markdown || !params.markdown.trim()) {
    throw serviceError('missing_content', '缺少文章内容。', '请提供 markdown 字段。')
  }

  const root = articlesRoot()
  // 输入本身可能已带 front-matter（比如二次保存）；先拆开，再决定写回去什么。
  const { meta: incomingMeta, body } = parseFrontMatter(params.markdown)
  const title = params.title?.trim() || incomingMeta.title || firstHeading(body)
  const theme = params.theme?.trim() || incomingMeta.theme
  const relativeDefault = `${slugify(title)}.md`
  const requested = params.path?.trim()

  let target: string
  if (!requested) {
    target = resolve(root, relativeDefault)
  } else if (isAbsolute(requested)) {
    target = resolve(requested)
  } else {
    target = resolve(root, requested)
  }
  if (!target.toLowerCase().endsWith('.md') && !target.toLowerCase().endsWith('.markdown')) {
    target += '.md'
  }

  if (!isInsideAnyRoot(target)) {
    throw serviceError(
      'path_not_allowed',
      `目标路径超出允许范围：${target}`,
      `允许写入的位置：${writeRoots().join(' ; ')}。可用环境变量 STYLEWX_WRITE_ROOTS 追加。`,
    )
  }

  // 只在确实有主题（或输入本来就带 front-matter）时才写元信息，
  // 保证不传 theme 的调用与以前逐字节一致。
  const writeMeta = Boolean(theme) || Object.keys(incomingMeta).length > 0
  const contents = writeMeta ? stringifyFrontMatter({ title, theme }, body) : body

  // 先做护栏再写：宁可整次操作失败，也不要写一半或静默覆盖。
  assertNotAccidentalShrink(target, Buffer.byteLength(contents, 'utf8'), params.force)

  try {
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, contents, 'utf8')
  } catch (error) {
    throw serviceError(
      'save_failed',
      `写入失败：${error instanceof Error ? error.message : String(error)}`,
      '请检查路径是否存在、是否有写权限。',
    )
  }

  const query = new URLSearchParams({ file: target })
  if (theme) query.set('theme', theme)

  return {
    path: target,
    bytes: Buffer.byteLength(contents, 'utf8'),
    editorUrl: `${editorBaseUrl()}/editor?${query.toString()}`,
    root,
    theme,
  }
}

// ---------------------------------------------------------------------------
// 「另存为」目录浏览：列出文章根目录下某一层可放文件的位置。

/** 某层目录的内容：子目录 + 已存在的 .md 文件。 */
export interface ListDirResult {
  /** 本次浏览的目录（绝对路径）。 */
  dir: string
  /** 允许写入的根目录列表（前端用来画「可保存的盘/根」）。 */
  roots: string[]
  /** 子目录名（已排序，不含隐藏目录）。 */
  dirs: string[]
  /** 已有的 Markdown 文件名（已排序）。 */
  files: string[]
  /** true 表示本次列的是盘/根级入口（Windows 的「此电脑」层）。 */
  drives: boolean
}

/** 统一处理「另存为」路径输入：反斜杠当分隔符、去首尾斜杠。 */
function normalizeRel(input: string): string {
  return input.trim().split('\\').join('/').replace(/^\/+|\/+$/g, '')
}

/**
 * 浏览一层目录（用于「另存为」选位置）。
 *
 * dir 支持两种形式：
 * - 省略/空 → 列出允许写入的根目录入口（Windows 上就像「此电脑」，多盘都可达）
 * - 绝对路径 → 必须落在某个允许根内，否则拒绝；列出该层的子目录与 .md 文件
 *
 * 浏览是只读的，但入口层就限制在允许根内 —— 不给任何越出白名单的路径探测器。
 */
export function listDir(dirPath?: string): ListDirResult {
  const roots = writeRoots()
  const requested = normalizeRel(dirPath ?? '')
  if (!requested) {
    return { dir: '', roots, dirs: roots, files: [], drives: true }
  }
  const dir = resolve(requested)
  if (!isInsideAnyRoot(dir)) {
    throw serviceError(
      'path_not_allowed',
      `只能浏览允许写入的位置：${roots.join(' ; ')}`,
      '可用环境变量 STYLEWX_WRITE_ROOTS 追加允许的根目录。',
    )
  }
  if (!existsSync(dir)) {
    return { dir, roots, dirs: [], files: [], drives: false }
  }
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch (error) {
    throw serviceError('list_failed', `读取目录失败：${error instanceof Error ? error.message : String(error)}`, '请检查目录权限。')
  }
  const dirs: string[] = []
  const files: string[] = []
  for (const name of entries) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    try {
      if (statSync(full).isDirectory()) dirs.push(name)
      else if (/\.(md|markdown)$/i.test(name)) files.push(name)
    } catch {
      // 不可访问的条目直接跳过，不阻断浏览。
    }
  }
  const collar = (a: string, b: string) => a.localeCompare(b, 'zh-Hans-CN')
  return { dir, roots, dirs: dirs.sort(collar), files: files.sort(collar), drives: false }
}

/** 在允许范围内新建一层目录（用于「另存为」里「新建文件夹」）。 */
export function makeDir(dirPath: string): { dir: string } {
  const rel = normalizeRel(dirPath)
  if (!rel) throw serviceError('invalid_path', '目录名不能为空。', '请输入一个目录名。')
  const dir = resolve(rel)
  if (!isInsideAnyRoot(dir)) {
    throw serviceError('path_not_allowed', `只能创建在允许写入的位置：${writeRoots().join(' ; ')}`, '可用环境变量 STYLEWX_WRITE_ROOTS 追加允许的根目录。')
  }
  try {
    mkdirSync(dir, { recursive: true })
  } catch (error) {
    throw serviceError('save_failed', `创建目录失败：${error instanceof Error ? error.message : String(error)}`, '请检查路径是否合法、是否有写权限。')
  }
  return { dir }
}
