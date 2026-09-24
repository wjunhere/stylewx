/**
 * 浏览器侧的图片处理代码（page.evaluate 里跑），与 Node 侧隔开。
 *
 * 这个包的 tsconfig 刻意不含 DOM lib（它是个 Node 包，AGENTS.md 铁律③），
 * 所以这里用最小 ambient 声明标注「这些标识符只在浏览器里存在」——
 * 编译器帮不上忙，写错只有在 Chromium 里才会发现，改这块要小心。
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

declare const Image: {
  new (): {
    src: string
    decode(): Promise<void>
    naturalWidth: number
    naturalHeight: number
  }
}
declare const document: {
  createElement(tag: 'canvas'): {
    width: number
    height: number
    getContext(kind: '2d'): {
      imageSmoothingQuality: 'low' | 'medium' | 'high'
      drawImage(img: unknown, dx: number, dy: number, dw: number, dh: number): void
    }
    toDataURL(type: string, quality?: number): string
  }
}

export interface BrowserProbe {
  w: number
  h: number
}

/** 解码图片，拿原始宽高。 */
export async function browserProbeSize(src: string): Promise<BrowserProbe> {
  const img = new Image()
  img.src = src
  await img.decode()
  return { w: img.naturalWidth, h: img.naturalHeight }
}

export interface ReencodeArgs {
  src: string
  w: number
  h: number
  type: string
  q: number
}

/** 等比绘制到画布并重编码。 */
export async function browserReencode(args: ReencodeArgs): Promise<string> {
  const { src, w, h, type, q } = args
  const img = new Image()
  img.src = src
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL(type, q)
}
