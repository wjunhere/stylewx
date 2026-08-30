/**
 * 默认封面生成器：为「无配图的纯文字文章」生成一张主题色渐变封面（900×383，≈2.35:1）。
 * 纯 JS 生成 PNG（gradient + zlib deflate），不依赖任何图片库 / DOM，仅可在 Node 侧使用。
 * publishDraft 在「无 coverImage 且正文无图」时自动调用它，避免发布缺封面而失败。
 */
import zlib from 'node:zlib'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (const x of buf) c = (CRC_TABLE[(c ^ x) & 0xff] ?? 0) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc]) as unknown as Uint8Array
}

/** 垂直渐变 PNG（RGB，top→bottom）。 */
function gradientPng(width: number, height: number, top: [number, number, number], bottom: [number, number, number]): Uint8Array {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1)
    const r = Math.round(top[0] + (bottom[0] - top[0]) * t)
    const g = Math.round(top[1] + (bottom[1] - top[1]) * t)
    const b = Math.round(top[2] + (bottom[2] - top[2]) * t)
    const row = y * (1 + width * 4)
    raw[row] = 0 // filter: none
    for (let x = 0; x < width; x++) {
      const o = row + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = 255
    }
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]) as unknown as Uint8Array
}

export interface CoverBytes {
  bytes: Uint8Array
  filename: string
  mimeType: string
}

/** 生成默认主题封面（暖棕灰渐变）。 */
export function generateDefaultCover(): CoverBytes {
  const bytes = gradientPng(900, 383, [0x6b, 0x55, 0x45], [0xc9, 0xb4, 0x9e])
  return { bytes, filename: 'cover.png', mimeType: 'image/png' }
}
