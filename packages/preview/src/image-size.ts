/**
 * 从文件头读图片像素尺寸（不启浏览器、不加第三方依赖）。
 *
 * 为什么自己读：`prepareImage` 的免压通道刻意不开 Chromium（0.1s vs 数秒），
 * 但调用方仍需要一个真宽高 —— 返回 0 会让「未探测」和「0×0」混在一起。
 *
 * 已知边界（都有意为之）：
 *  - 不做 EXIF 方向处理：报的是**原始像素**宽高，不是「旋转后看到的」宽高；
 *  - 不认识/损坏的格式返回 undefined，由调用方决定退化行为（不猜）。
 */

export interface ImageSize {
  width: number
  height: number
}

/** PNG：8 字节签名之后 IHDR 固定在最前，宽高是大端 4 字节。 */
function pngSize(b: Buffer): ImageSize | undefined {
  if (b.length < 24) return undefined
  if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return undefined
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}

/** GIF：逻辑屏幕描述符，宽高是小端 2 字节（总尺寸，不是首帧尺寸）。 */
function gifSize(b: Buffer): ImageSize | undefined {
  if (b.length < 10) return undefined
  const sig = b.subarray(0, 3).toString('latin1')
  if (sig !== 'GIF') return undefined
  return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) }
}

/** JPEG：遍历段，找 SOF0..SOF15（跳过 C4/C8/CC 这三个非 SOF），高度在 +5、宽度在 +7。 */
function jpegSize(b: Buffer): ImageSize | undefined {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return undefined
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i += 1
      continue
    }
    const marker = b[i + 1] as number
    // 无长度字段的标记：SOI、TEM、RSTn
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    const len = b.readUInt16BE(i + 2)
    if (len < 2) return undefined
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) }
    i += 2 + len
  }
  return undefined
}

/** WebP：三种子格式各自的宽高编码都不一样，分别处理。 */
function webpSize(b: Buffer): ImageSize | undefined {
  if (b.length < 30) return undefined
  if (b.subarray(0, 4).toString('latin1') !== 'RIFF' || b.subarray(8, 12).toString('latin1') !== 'WEBP') return undefined
  const fmt = b.subarray(12, 16).toString('latin1')
  if (fmt === 'VP8 ') {
    // 有损：帧头里 14 位宽、14 位高
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
  }
  if (fmt === 'VP8L') {
    // 无损：紧跟在签名 0x2f 之后的 28 位里各放 14 位（存的是 width-1 / height-1）
    const bits = b.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  if (fmt === 'VP8X') {
    const width = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16))
    const height = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16))
    return { width, height }
  }
  return undefined
}

/** 读图片像素尺寸；不认识的格式返回 undefined（调用方自行退化，不要在这里瞎猜）。 */
export function readImageSize(bytes: Buffer): ImageSize | undefined {
  return pngSize(bytes) ?? gifSize(bytes) ?? jpegSize(bytes) ?? webpSize(bytes)
}
