import { describe, expect, it } from 'vitest'
import { readImageSize } from './image-size.js'

/** 造一个最小 PNG 头（签名 + IHDR 前 8 字节足够读出宽高）。 */
function pngHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8) // IHDR 长度
  b.write('IHDR', 12, 'latin1')
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  return b
}

/** 造一个最小 GIF 头（GIF89a + 逻辑屏幕描述符）。 */
function gifHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(13)
  b.write('GIF89a', 0, 'latin1')
  b.writeUInt16LE(width, 6)
  b.writeUInt16LE(height, 8)
  return b
}

/** 造一个最小 JPEG：SOI + 一个 APP0 段 + 一个 SOF0 段。 */
function jpegHeader(width: number, height: number): Buffer {
  const app0 = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14)])
  const sof = Buffer.alloc(19)
  sof.writeUInt16BE(0xffc0, 0) // SOF0
  sof.writeUInt16BE(17, 2) // 段长
  sof.writeUInt8(8, 4) // 精度
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  sof.writeUInt8(3, 9) // 分量数
  sof.writeUInt8(1, 10)
  sof.writeUInt8(0x22, 11)
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])])
}

describe('readImageSize（文件头解析，不启浏览器）', () => {
  it('PNG：IHDR 里的宽高', () => {
    expect(readImageSize(pngHeader(2400, 2667))).toEqual({ width: 2400, height: 2667 })
  })

  it('GIF：逻辑屏幕描述符（小端）', () => {
    expect(readImageSize(gifHeader(320, 240))).toEqual({ width: 320, height: 240 })
  })

  it('JPEG：跳过 APP0 后从 SOF0 拿宽高', () => {
    expect(readImageSize(jpegHeader(1620, 1800))).toEqual({ width: 1620, height: 1800 })
  })

  it('WebP VP8X：24 位小端宽高 +1', () => {
    const b = Buffer.alloc(30)
    b.write('RIFF', 0, 'latin1')
    b.write('WEBP', 8, 'latin1')
    b.write('VP8X', 12, 'latin1')
    b.writeUInt32LE(9, 16)
    const w = 2399
    const h = 2666
    b[24] = w & 0xff
    b[25] = (w >> 8) & 0xff
    b[26] = (w >> 16) & 0xff
    b[27] = h & 0xff
    b[28] = (h >> 8) & 0xff
    b[29] = (h >> 16) & 0xff
    expect(readImageSize(b)).toEqual({ width: 2400, height: 2667 })
  })

  it('不认识的格式返回 undefined（不瞎猜）', () => {
    expect(readImageSize(Buffer.from('not an image at all'))).toBeUndefined()
    expect(readImageSize(Buffer.alloc(0))).toBeUndefined()
  })
})
