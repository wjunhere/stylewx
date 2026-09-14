/**
 * 把最终 Markdown 落盘，并返回可直接打开的本地编辑器地址。
 * 这是「agent 生成 → 人在编辑器里微调」的交接点。
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
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

  if (!isInside(root, target)) {
    throw serviceError(
      'path_not_allowed',
      `目标路径超出允许范围：${target}`,
      `只能写入文章根目录（${root}）内。可用环境变量 STYLEWX_ARTICLES_DIR 调整根目录。`,
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
