/**
 * 把最终 Markdown 落盘，并返回可直接打开的本地编辑器地址。
 * 这是「agent 生成 → 人在编辑器里微调」的交接点。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
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
