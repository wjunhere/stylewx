/**
 * 微信兼容 CSS 白名单（三档，基于真实微信实测校准）。
 *
 * 我们先前的「黑名单」是社区经验；这次用真实公众号对 draft/add → draft/get 做了实测，
 * 结论是：微信的「草稿 API」只过滤极少数内联样式属性，其余基本保留。据此把策略改成三档：
 *
 *  - SAFE   放行，无提示：微信内联时稳定保留的基础排版属性。
 *  - GRAY   放行但提示 warning：微信草稿 API 实测**保留**，但编辑器手动粘贴 / 读者最终渲染
 *           仍不确定，故不硬禁止，只提示。
 *  - BANNED 硬禁止（error）：实测微信会过滤 / 存在明显风险的属性（position、filter 等）以及
 *           结构层危险内容（style 标签、script 标签、on* 事件属性、javascript: 链接，见 validator）。
 *
 * 其余不在三个集合内的属性视为「unknown」，也**放行但提示**（证据表明微信很宽容，故不硬失败；
 * 具体是否可用交由 validator 提示）。这比「一刀切禁止」更诚实、更贴近实测。
 *
 * 注意：本模块必须保持同构 —— 不 import 任何 DOM / Node 独有 API。
 */

/** 基础安全属性（内联时微信稳定保留）。 */
export const CSS_PROPERTY_SAFE: ReadonlySet<string> = new Set([
  // ---- 字体 & 文本 ----
  'color',
  'font',
  'font-family',
  'font-size',
  'font-style',
  'font-variant',
  'font-weight',
  'font-feature-settings',
  'letter-spacing',
  'line-height',
  'text-align',
  'text-align-last',
  'text-decoration',
  'text-decoration-color',
  'text-decoration-line',
  'text-decoration-style',
  'text-decoration-thickness',
  'text-indent',
  'text-transform',
  'text-shadow',
  'text-overflow',
  'text-rendering',
  'word-break',
  'word-spacing',
  'word-wrap',
  'overflow-wrap',
  'white-space',
  'vertical-align',

  // ---- 盒模型 ----
  'box-sizing',
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',

  // ---- 背景（纯色）----
  'background-color',

  // ---- 边框 & 圆角 ----
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-width',
  'border-style',
  'border-radius',
  'border-collapse',
  'border-spacing',
  'outline',

  // ---- 布局 / 列表 / 其它 ----
  'display',
  'visibility',
  'overflow',
  'overflow-x',
  'overflow-y',
  'list-style',
  'list-style-type',
  'list-style-position',
  'list-style-image',
  'object-fit',
  'object-position',
  'table-layout',
  'direction',
  'writing-mode',
])

/**
 * 灰色属性（警告）：微信草稿 API 实测**保留**，但编辑器粘贴 / 读者渲染不确定。
 * 不再硬禁止，评估为 warning。
 */
export const CSS_PROPERTY_GRAY: ReadonlySet<string> = new Set([
  // 浮动
  'float',
  'clear',
  // 变换 / 动画 / 过渡
  'transform',
  'transform-origin',
  'transform-style',
  'perspective',
  'perspective-origin',
  'backface-visibility',
  'animation',
  'animation-name',
  'animation-duration',
  'animation-delay',
  'animation-iteration-count',
  'animation-direction',
  'animation-timing-function',
  'animation-fill-mode',
  'transition',
  'transition-property',
  'transition-duration',
  'transition-delay',
  'transition-timing-function',
  // 阴影 / 指针交互
  'box-shadow',
  'cursor',
  'user-select',
  'pointer-events',
  'touch-action',
  // 定位（实测 top/left/z-index 保留）
  'top',
  'right',
  'bottom',
  'left',
  'z-index',
  // flex / gap / 透明度 / 渐变背景
  'flex',
  'flex-direction',
  'flex-wrap',
  'flex-flow',
  'justify-content',
  'align-items',
  'align-content',
  'align-self',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'order',
  'opacity',
  'gap',
  'row-gap',
  'column-gap',
  'background',
  'background-image',
  'background-position',
  'background-size',
  'background-repeat',
  'background-origin',
  'background-clip',
  'background-attachment',
])

/**
 * 硬禁止（error）：实测微信会过滤，或存在明显风险。
 * position / filter 已被真实微信草稿 API 实测为「过滤」；其余为同类风险属性。
 */
export const CSS_PROPERTY_BANNED: ReadonlySet<string> = new Set([
  'position',
  'filter',
  'backdrop-filter',
  'mix-blend-mode',
  'scroll-snap-type',
  'scroll-behavior',
])

/** 允许（放行）的属性集合 = SAFE ∪ GRAY。 */
export const CSS_PROPERTY_WHITELIST: ReadonlySet<string> = new Set([
  ...CSS_PROPERTY_SAFE,
  ...CSS_PROPERTY_GRAY,
])

export type CssPropertyTier = 'safe' | 'gray' | 'banned' | 'unknown'

/**
 * 判断单个 CSS 属性的档位：
 * - banned：微信实测会过滤/有风险（error）
 * - gray：微信保留但编辑器/渲染不确定（warning）
 * - safe：稳定保留（无提示）
 * - unknown：未纳入已知白名单（放行 + 提示）
 */
export function classifyCssProperty(property: string): CssPropertyTier {
  const p = property.trim().toLowerCase()
  if (!p || p === '*' || p.startsWith('--')) return 'unknown'
  if (CSS_PROPERTY_BANNED.has(p)) return 'banned'
  if (CSS_PROPERTY_GRAY.has(p)) return 'gray'
  if (CSS_PROPERTY_SAFE.has(p)) return 'safe'
  return 'unknown'
}

/**
 * 是否允许出现在主题中：仅硬禁止 banned（及通配符 / CSS 变量定义）。
 * safe / gray / unknown 均放行（unknown 也在 validator 侧提示）。
 */
export function isCssPropertyAllowed(property: string): boolean {
  const p = property.trim().toLowerCase()
  if (!p || p === '*' || p.startsWith('--')) return false
  return classifyCssProperty(property) !== 'banned'
}

/**
 * 校验某个 CSS 值里的「不安全/不可靠」内容，返回可读提示（warning 级），没有问题返回 null。
 * 关注外部 url() 与 !important（微信对二者行为不稳定）。
 */
export function findUnsafeCssValue(value: string): string | null {
  const v = value.trim().toLowerCase()
  if (v.includes('!important')) {
    return '包含 !important，微信编辑器/渲染端行为不稳定，建议移除改用更具体的属性覆盖。'
  }
  const urlMatch = value.match(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/)
  if (urlMatch) {
    const raw = urlMatch[1] ?? ''
    if (raw.startsWith('data:') || raw.startsWith('mmbiz.qpic.cn') || raw.startsWith('https://mmbiz.qpic.cn')) {
      return null
    }
    return 'CSS 值中引用了外部资源 URL，微信端可能无法加载或被清洗，请改用内联 data URI 或上传到微信素材库。'
  }
  return null
}

/**
 * 解析一段 `prop: value;` 形式的声明文本（用于内联 style 属性校验）。
 * 返回属性→值 的映射；解析错误的条目会被跳过并可通过回调收集。
 */
export function parseStyleDeclarations(
  style: string,
  onRaw?: (raw: string) => void,
): CssDeclaration[] {
  const declarations: CssDeclaration[] = []
  if (!style) return declarations
  const segments = style.split(';')
  for (const seg of segments) {
    const trimmed = seg.trim()
    if (!trimmed) continue
    if (onRaw) onRaw(trimmed)
    const colon = trimmed.indexOf(':')
    if (colon === -1) {
      if (onRaw) onRaw(trimmed)
      continue
    }
    const property = trimmed.slice(0, colon).trim()
    const value = trimmed.slice(colon + 1).trim()
    if (property && value) declarations.push({ property, value })
  }
  return declarations
}

/** 供校验器/其它模块使用的声明结构。 */
export interface CssDeclaration {
  property: string
  value: string
}
