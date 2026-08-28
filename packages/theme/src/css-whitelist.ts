/**
 * WeChat 公众号编辑器 CSS 白名单。
 *
 * 微信官方编辑器（以及旧版富文本解析器）会对粘贴/提交的文章内容做 CSS 清洗（sanitize）：
 * 它会丢弃一整类对移动端排版无意义、或可能被用于攻击/越权的属性（如 position / transform /
 * animation / 伪元素 / 外部字体等），只保留对内联排版友好的基础属性。
 *
 * 我们的策略是「白名单制」：只有出现在 `CSS_PROPERTY_WHITELIST` 中的属性才允许出现在最终主题 CSS 里。
 * 这样能最大程度保证：主题在微信里「所见即所得」，不会被编辑器二次清洗后变形。
 *
 * 注意：本模块必须保持同构 —— 不 import 任何 DOM / Node 独有 API。
 * 允许单独出现的『简写属性』（如 border / margin / background）与对应的『拆分属性』（如 border-width）
 * 同时列入白名单；校验器对简写拆分做语义校验（拆开后逐条仍须在白名单内）。
 */

/**
 * 微信端安全、可放心内联的基础排版属性。
 * 这些属性在微信编辑器内一般不会丢失，且不涉及绝对/固定定位、动画、变换等敏感能力。
 */
export const CSS_PROPERTY_WHITELIST: ReadonlySet<string> = new Set([
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

  // ---- 背景 ----
  'background',
  'background-color',
  'background-image',
  'background-position',
  'background-size',
  'background-repeat',
  'background-origin',
  'background-clip',
  'background-attachment',

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
  'opacity',
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
  'gap',
  'row-gap',
  'column-gap',
  'direction',
  'writing-mode',
])

/**
 * 额外的「语义上危险」属性 / 值，即使被加入白名单也会被校验器单独拦截。
 * 这些属性微信端要么直接丢弃，要么会导致布局/交互异常或潜在 XSS 空间。
 */
export const CSS_PROPERTY_BLOCKLIST: ReadonlySet<string> = new Set([
  // 定位 & 层叠 —— 微信编辑器必然丢弃，且容易造成排版错乱
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'z-index',

  // 浮动 —— 微信端表现不稳定
  'float',
  'clear',

  // 变换 / 动画 / 过渡 —— 微信端丢弃，且无意义
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

  // 滤镜 / 混合 / 滚动吸附 —— 微信端不支持
  'filter',
  'backdrop-filter',
  'mix-blend-mode',
  'scroll-snap-type',
  'scroll-behavior',

  // 指针交互 —— 移动端无意义，且微信清洗
  'cursor',
  'user-select',
  'pointer-events',
  'touch-action',

  // 阴影 —— 微信端表现不稳定，常见被丢弃
  'box-shadow',
])

/**
 * 校验器用于判断某条 declaration 是否兼容微信。供 schema 校验与 validator 复用。
 */
export interface CssDeclaration {
  property: string
  value: string
}

/**
 * 判断单个 CSS 属性是否允许出现在主题中：
 * - 必须在白名单内；
 * - 不得落在黑名单内；
 * - 不得为通配符（`*`）或 CSS 变量定义（`--*`）—— 主题应产出可直接内联的确定性值。
 */
export function isCssPropertyAllowed(property: string): boolean {
  const p = property.trim().toLowerCase()
  if (!p || p === '*' || p.startsWith('--')) return false
  if (CSS_PROPERTY_BLOCKLIST.has(p)) return false
  return CSS_PROPERTY_WHITELIST.has(p)
}

/**
 * 校验某个 CSS 值里是否被微信端拒绝或无效。
 * 重点关注：`!important`（微信端会剥离，且属于不可靠写法）、`url()`（可能引入外部资源或 XSS）。
 * 返回一个可读原因，如果没有问题返回 null。
 */
export function findUnsafeCssValue(value: string): string | null {
  const v = value.trim().toLowerCase()
  if (v.includes('!important')) {
    return '微信编辑器会剥离 !important，请移除该声明，改用更具体的属性覆盖。'
  }
  // 允许 data: 与微信图床的图片 URL，但对外部 url() 保持警惕
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
