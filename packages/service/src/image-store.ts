/**
 * 正文图片的本地资产库：编辑器上传的图片落到 `~/.stylewx/assets/`，
 * 用 `/editor/api/asset/<文件名>` 这种本服务自己的 URL 引用。
 *
 * 为什么要有这一层：正文图片原先只支持 http(s) 外链 —— 本地截图、自己生成的图表
 * 都进不了文章；只有封面能走本地上传。有了它，发布时 relocate 能把这类 URL
 * 解析回本地文件再传微信素材库，闭环才完整。
 *
 * 安全边界（有意为之）：
 *  - 文件名一律由服务端生成（随机 + 扩展名白名单），不接受调用方给的名字 → 无路径穿越；
 *  - 只存图片、只吐图片；
 *  - 压缩交给 @stylewx/preview（需要真实解码）。
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { serviceError } from './errors.js'

const DEFAULT_DIR = join(homedir(), '.stylewx', 'assets')

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
}
const MIME_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT_BY_MIME).map(([mime, ext]) => [ext, mime]),
)

export interface ImageStoreOptions {
  /** 覆盖存储目录（测试用）。 */
  dir?: string
}

function assetsDir(options?: ImageStoreOptions): string {
  const dir = options?.dir ?? process.env.STYLEWX_ASSETS_DIR ?? DEFAULT_DIR
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** 服务端自己的图片 URL（编辑器/正文里引用的就是它）。 */
export function assetUrlPath(name: string): string {
  return `/editor/api/asset/${encodeURIComponent(name)}`
}

export interface SaveImageResult {
  name: string
  urlPath: string
  bytes: number
}

/** 存一张图，返回可引用的 URL 路径。名字服务端生成，调用方给不了。 */
export function saveImageAsset(bytes: Uint8Array, mime: string, options?: ImageStoreOptions): SaveImageResult {
  const ext = EXT_BY_MIME[mime.toLowerCase()]
  if (!ext) {
    throw serviceError('unsupported_image', `不支持的图片类型：${mime}`, '目前支持 png / jpeg / webp / gif。')
  }
  if (bytes.length === 0) {
    throw serviceError('empty_image', '图片内容为空。', '请重新选择或上传。')
  }
  const dir = assetsDir(options)
  // 随机名：既避免覆盖，也彻底封死路径穿越（调用方完全给不了名字）
  const name = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}${ext}`
  writeFileSync(join(dir, name), bytes)
  return { name, urlPath: assetUrlPath(name), bytes: bytes.length }
}

/** 把本服务的 asset URL 解析回本地字节；不是本服务的 URL 返回 undefined。 */
export function readImageAssetByUrl(url: string, options?: ImageStoreOptions): { bytes: Uint8Array; mimeType: string } | undefined {
  const m = /\/editor\/api\/asset\/([^/?#]+)/.exec(url)
  if (!m) return undefined
  const name = decodeURIComponent(m[1] ?? '')
  if (!/^[a-z0-9-]+\.(png|jpg|webp|gif)$/i.test(name)) return undefined
  const file = join(assetsDir(options), name)
  if (!existsSync(file)) return undefined
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  return { bytes: new Uint8Array(readFileSync(file)), mimeType: MIME_BY_EXT[ext] ?? 'image/jpeg' }
}

/** 列出资产库（编辑器里复用旧图用），新→旧。 */
export function listImageAssets(options?: ImageStoreOptions): { name: string; urlPath: string; bytes: number }[] {
  const dir = assetsDir(options)
  if (!existsSync(dir)) return []
  return readdirNames(dir)
    .filter((n) => MIME_BY_EXT[n.slice(n.lastIndexOf('.')).toLowerCase()])
    .map((n) => ({
      name: n,
      urlPath: assetUrlPath(n),
      bytes: statSync(join(dir, n)).size,
    }))
    .sort((a, b) => (a.name < b.name ? 1 : -1))
}

function readdirNames(dir: string): string[] {
  return readdirSync(dir)
}
