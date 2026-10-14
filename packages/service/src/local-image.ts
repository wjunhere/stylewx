/**
 * 非 http(s) 图片引用的统一解析器：把「编辑器资产 URL / file:// / 绝对路径 /
 * 品牌包内相对路径」都读成字节，供发布时上传微信素材库、渲染封面等使用。
 *
 * 为什么集中在一处：正文图片走 relocate 的 `resolveLocal`，封面走
 * `resolveThumbMediaId` 的同一个钩子。两处各写一份必然漂 —— 封面这一路曾经
 * 就没有解析钩子，品牌包把 `coverImage` 改成包内相对路径后，正文图能发、
 * 封面直接炸（拿去 HTTP 请求 `assets/cover.png`）。
 *
 * 安全边界（与原实现一致，均为只读图片字节）：
 *  - 只认图片扩展名白名单，别的扩展名一律不读；
 *  - 单张上限 20MB，空文件视为读不到；
 *  - 相对路径必须有明确基准（`brand`），否则**拒绝**而不是猜 —— 没有基准的相对路径
 *    在不同进程的工作目录下会指向不同文件，静默猜错比报错更贵。
 */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brandPaths } from './brand-store.js'
import { readImageAssetByUrl } from './image-store.js'
import type { ImageStoreOptions } from './image-store.js'

/** 只收真图片，别的扩展名一律不读。 */
const EXT_IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

/** 单张图片字节上限（微信素材库的实际上限比这更严，这里只挡明显异常的大文件）。 */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

export interface ResolveLocalImageOptions extends ImageStoreOptions {
  /**
   * 相对路径的基准品牌名（品牌包内 `assets/cover.png` 这类）。
   * 缺省时相对路径一律解析失败 —— 见文件头注释。
   */
  brand?: string
}

/** 按扩展名给 MIME；不是受支持的图片扩展名返回 undefined。 */
export function imageMimeOf(path: string): string | undefined {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return undefined
  return EXT_IMAGE_MIME[path.slice(dot).toLowerCase()]
}

/** 读文件字节并做大小/图片类型校验；不合格返回 undefined（调用方决定怎么报错）。 */
function readImageFile(path: string): { bytes: Uint8Array; mimeType: string } | undefined {
  const mimeType = imageMimeOf(path)
  if (!mimeType) return undefined
  if (!existsSync(path)) return undefined
  try {
    const bytes = readFileSync(path)
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return undefined
    return { bytes: new Uint8Array(bytes), mimeType }
  } catch {
    return undefined
  }
}

/**
 * 把一个图片引用解析成字节。
 *
 * @returns 解析成功返回 `{ bytes, mimeType }`；不是本地引用或读不到时返回 `undefined`
 *          （相对路径缺少 `brand` 基准也算读不到）。
 */
export function resolveLocalImage(
  src: string,
  options?: ResolveLocalImageOptions,
): { bytes: Uint8Array; mimeType: string } | undefined {
  const raw = typeof src === 'string' ? src.trim() : ''
  if (!raw) return undefined

  // 1. 本服务的编辑器资产 URL（/editor/api/asset/<name>）
  const fromStore = readImageAssetByUrl(raw, options)
  if (fromStore) return fromStore

  // 2. file:// URL
  if (raw.startsWith('file://')) {
    try {
      return readImageFile(fileURLToPath(raw))
    } catch {
      return undefined
    }
  }

  // 3. 绝对路径（Windows 盘符 / UNC / POSIX）
  if (isAbsolute(raw) || /^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith('\\\\')) {
    return readImageFile(raw)
  }

  // 4. 相对路径 —— 只认品牌目录这一个基准，不猜工作目录
  if (options?.brand) {
    const norm = raw.replace(/\\/g, '/')
    // `..` 一律拒绝：相对基准也要封死跨越（与品牌包的路径规则同一条）
    if (norm.split('/').includes('..')) return undefined
    return readImageFile(join(brandPaths(options.brand, options).dir, norm))
  }
  return undefined
}
