/**
 * 本地图片解析器：品牌包把 `logo` / `coverImage` 改成包内相对路径后，
 * 发布管线必须能把它们读成字节。
 *
 * 这条曾经断过：封面走的是 `downloadImage`（无条件 HTTP），相对路径必炸；
 * 正文图片走 relocate 的 `resolveLocal`。两处各写一份必然漂 —— 测试就守这一点。
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveLocalImage, saveImageAsset } from './index.js'

/** 最小的合法 PNG 头（本解析器只看扩展名与字节数，不解码）。 */
const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

describe('resolveLocalImage', () => {
  let brandsDir: string
  let assetsDir: string

  beforeEach(() => {
    brandsDir = join(mkdtempSync(join(tmpdir(), 'stylewx-li-brands-')), 'brands')
    assetsDir = join(mkdtempSync(join(tmpdir(), 'stylewx-li-assets-')), 'assets')
    mkdirSync(join(brandsDir, 'tide-notes', 'assets'), { recursive: true })
    writeFileSync(join(brandsDir, 'tide-notes', 'assets', 'cover.png'), PNG_BYTES)
  })

  afterEach(() => {
    rmSync(brandsDir, { recursive: true, force: true })
    rmSync(assetsDir, { recursive: true, force: true })
  })

  it('品牌包内相对路径按品牌目录解析（发布封面靠它）', () => {
    const got = resolveLocalImage('assets/cover.png', { dir: brandsDir, brand: 'tide-notes' })
    expect(got?.mimeType).toBe('image/png')
    expect(got?.bytes.length).toBe(PNG_BYTES.length)
  })

  it('相对路径没有基准时拒绝，而不是猜工作目录', () => {
    expect(resolveLocalImage('assets/cover.png', { dir: brandsDir })).toBeUndefined()
  })

  it('相对路径里的 .. 一律拒绝（不许跨越品牌目录）', () => {
    expect(resolveLocalImage('assets/../../../etc/passwd', { dir: brandsDir, brand: 'tide-notes' })).toBeUndefined()
  })

  it('绝对路径可读', () => {
    const p = join(brandsDir, 'tide-notes', 'assets', 'cover.png')
    expect(resolveLocalImage(p)?.mimeType).toBe('image/png')
  })

  it('file:// URL 可读', () => {
    const p = join(brandsDir, 'tide-notes', 'assets', 'cover.png')
    const url = 'file:///' + p.replace(/\\/g, '/').replace(/^\//, '')
    expect(resolveLocalImage(url)?.mimeType).toBe('image/png')
  })

  it('本服务的编辑器资产 URL 可读', () => {
    const saved = saveImageAsset(PNG_BYTES, 'image/png', { dir: assetsDir })
    const got = resolveLocalImage(saved.urlPath, { dir: assetsDir })
    expect(got?.mimeType).toBe('image/png')
  })

  it('非图片扩展名不读', () => {
    const p = join(brandsDir, 'tide-notes', 'assets', 'notes.txt')
    writeFileSync(p, 'hello')
    expect(resolveLocalImage(p)).toBeUndefined()
  })

  it('空文件视为读不到（上传到微信只会得到一张坏图）', () => {
    const p = join(brandsDir, 'tide-notes', 'assets', 'empty.png')
    writeFileSync(p, '')
    expect(resolveLocalImage(p)).toBeUndefined()
  })

  it('不存在的文件返回 undefined', () => {
    expect(resolveLocalImage('/no/such/file.png')).toBeUndefined()
  })

  it('http(s) 链接不归它管（交给下载）', () => {
    expect(resolveLocalImage('https://example.com/a.png')).toBeUndefined()
  })
})
