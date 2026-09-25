/**
 * Mermaid 图组件：`:::mermaid` + ```mermaid 代码块（由 core 预处理归一为 :::mermaid）。
 *
 * 本文件只负责**占位**：把图源码原样放进 `data-swx-mermaid`（base64url），
 * 真正的渲染（Chromium 里跑 mermaid → PNG → 本地资产 URL）发生在
 * `@stylewx/service` 的 renderPreview 管线（见 packages/service/src/mermaid.ts）。
 *
 * 为什么组件本体不直接出图：
 *  - 组件渲染是**同步、无 DOM/Node** 的（同构边界，AGENTS.md 铁律③）；
 *  - Mermaid 需要 DOM + 官方发行包，只能放在有 Chromium 的 Node 侧（@stylewx/preview）。
 *
 * 为什么最终产物是 <img> 而不是内联 SVG：微信实测会剥离 id，Mermaid SVG 里的
 * url(#…) / <marker> / <clipPath> 引用会全部失效；<img> 是微信最稳的图片通道，
 * 发布时 relocate 把本地资产 URL 搬到微信素材库（与用户上传的截图同一条已验证路径）。
 */
import { css, escapeAttr, escapeHtml } from '../style.js'
import type { ComponentNode, RenderContext } from '../types.js'

/** 占位符的 data 属性名：service 管线靠它在渲染后的 HTML 里找到待渲染的图。 */
export const MERMAID_DATA_ATTR = 'data-swx-mermaid'

/* base64url 手写实现：组件包是同构的（铁律③：不碰 Node API），不能用 Buffer。
   输入是图源码（UTF-8），先编码成 UTF-8 字节再走标准 base64 字符表。 */
const B64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function encodeMermaidSource(src: string): string {
  const bytes = new TextEncoder().encode(src)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    out += B64URL_ALPHABET[b0 >> 2]
    out += B64URL_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)]
    out += b1 === undefined ? '' : B64URL_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)]
    out += b2 === undefined ? '' : B64URL_ALPHABET[b2 & 0x3f]
  }
  return out
}

export function decodeMermaidSource(encoded: string): string {
  const clean = encoded.replace(/=+$/, '')
  const bytes: number[] = []
  for (let i = 0; i < clean.length; i += 4) {
    // noUncheckedIndexedAccess：数组下标访问都要走 nullish 兼容；
    // 越界字符按 0 处理（长度不足 4 的尾组），不影响正确字节。
    const at = (k: number): number => {
      const ch = clean[i + k]
      const v = ch === undefined ? -1 : B64URL_ALPHABET.indexOf(ch)
      return v < 0 ? 0 : v
    }
    const n0 = at(0)
    const n1 = at(1)
    const n2 = at(2)
    const n3 = at(3)
    bytes.push((n0 << 2) | (n1 >> 4))
    if (i + 2 < clean.length) bytes.push(((n1 & 0x0f) << 4) | (n2 >> 2))
    if (i + 3 < clean.length) bytes.push(((n2 & 0x03) << 6) | n3)
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
}

function renderMermaid(node: ComponentNode, ctx: RenderContext): string {
  const palette = ctx.palette
  const source = node.body.trim()
  const caption = node.props.caption || ''

  // 空图：给一句可操作的提示（作者多半是还没把源码粘进来）
  if (!source) {
    return `<section style="${css({
      margin: `0 0 ${palette.blockGap}`,
      padding: '18px 16px',
      'text-align': 'center',
      color: palette.muted,
      'font-size': '13px',
      'background-color': palette.cardBg,
      'border-radius': palette.radius,
      border: `1px dashed ${palette.divider}`,
    })}">Mermaid 图源码为空：请在 :::mermaid 正文里粘贴图定义。</section>`
  }

  // 占位符必须是「叶子节点」：service 管线用正则定位并整块替换，
  // 内部不能再嵌 section（否则边界匹配会被子节点截断）。图注也走 data 属性传递。
  return `<section data-swx="mermaid" ${MERMAID_DATA_ATTR}="${escapeAttr(encodeMermaidSource(source))}" data-swx-mermaid-caption="${escapeAttr(caption)}" style="${css({
    margin: `0 0 ${palette.blockGap}`,
    padding: '14px',
    'text-align': 'center',
    'background-color': palette.cardBg,
    'border-radius': palette.radius,
    'font-size': '12.5px',
    color: palette.muted,
    'line-height': '1.7',
  })}">正在渲染 Mermaid 图…（首次渲染需数秒，同图之后走缓存）</section>`
}

export const mermaidComponents: Record<string, (node: ComponentNode, ctx: RenderContext) => string> = {
  mermaid: renderMermaid,
}
