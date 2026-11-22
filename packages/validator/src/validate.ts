/**
 * 微信兼容性校验器：对渲染后的 HTML 做三类检查（CSS 白名单 / HTML 结构 / 内容）。
 * 输出结构化报告 { pass, issues: [{ rule, severity, message, suggestion, location }] }。
 * 同构：不依赖 DOM / Node 独有 API。
 */
import { unified } from 'unified'
import rehypeParse from 'rehype-parse'
import {
  parseStyleDeclarations,
  classifyCssProperty,
  findUnsafeCssValue,
} from '@stylewx/theme'
import { validationReportSchema } from './report.js'
import type { ValidationIssue, ValidationReport } from './report.js'

/** 微信编辑器会过滤/不支持的标签。 */
const FORBIDDEN_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'applet',
  'canvas',
  'form',
  'input',
  'select',
  'textarea',
  'button',
  'link',
  'meta',
  'base',
  'frame',
  'frameset',
  'audio',
  'video',
])

/** 微信允许的图片域名（上传素材库后即此类域名）。 */
const ALLOWED_IMAGE_HOSTS = ['mmbiz.qpic.cn', 'wx.qlogo.cn', 'mp.weixin.qq.com']

/** 正文文本长度上限的软告警阈值（字符数）。 */
const WORD_COUNT_WARNING = 30000

/**
 * 中文正文的排版基线。
 *
 * 判据来自 36 套预置主题的**实测区间**（lineHeight 1.55~2.06 中位 1.7；fontSize 14~17px），
 * 不是拍脑袋定的数。schema 只管类型（lineHeight 0.8~4 都合法），所以一个只会照 schema
 * 生成主题的模型可以写出 `line-height: 1.1` + `font-size: 11px` 这种完全合法但没法读的东西 ——
 * 这一组就是那道闸门。
 *
 * 分档原则：**只有明显坏才 error**（挡住「没法读」），中间地带只警告。
 * 代价是会放过刻意的极简风（比如故意 1.4 行距的短句排版），这是有意取舍 ——
 * 硬拦「偏离预置区间」会把个性化设计一起误伤。
 */
const TYPOGRAPHY = {
  lineHeight: { errorBelow: 1.3, warnBelow: 1.5, warnAbove: 2.2 },
  fontSize: { errorBelow: 13, warnBelow: 14, warnAbove: 18 },
  blockSpacing: { warnBelow: 8 },
  letterSpacing: { warnAboveEm: 0.15 },
} as const

const TYPOGRAPHY_HINT = '中文正文建议：font-size 15–16px、line-height 1.6–1.9、letter-spacing 0.02–0.06em、段落间距 12–20px。'

const FORBIDDEN_TAG_SUGGESTION = (tag: string): string =>
  `「${tag}」标签微信编辑器会过滤，无法保留。请删除，或改用更基础的排版结构（如引用、图片、段落）表达。`

const EVENT_HANDLER_SUGGESTION =
  '事件属性（on*) 会被微信过滤且存在安全风险，请删除该属性。'
const JS_URL_SUGGESTION =
  'javascript: 链接在微信内会被拦截，请改为正常的 http(s) 链接或删除。'
const STYLE_TAG_SUGGESTION =
  '<style> 标签微信编辑器会丢弃，请在渲染阶段使用 juice 把样式内联到元素上，不要输出 <style>。'
const CSS_PROP_SUGGESTION = (prop: string): string =>
  `属性「${prop}」已被真实微信实测会过滤（如 position / filter 等），请从主题中移除，或改用微信保留的基础属性表达。`

const IMAGE_SUGGESTION =
  '外链图片微信会被拦截/无法显示。请先上传到微信公众号素材库（或使用图床得到 mmbiz.qpic.cn 链接）后再发布。'
const HASH_ANCHOR_SUGGESTION =
  '微信 draft/add 会直接拒绝含 `#` 锚点的链接（errcode 45166，实测）。请把 href 改成完整的 http(s) 地址，或改用不带跳转的视觉目录。'
const ID_STRIPPED_SUGGESTION =
  '微信会剥离所有 id 属性（实测 draft/add → draft/get 后 id 全部消失）。请勿依赖 id 做锚点、CSS 选择器或 SVG 引用。'
const DIV_TAG_SUGGESTION =
  '微信编辑器的标签白名单里没有 <div>，粘贴时会把壳拆掉，其上的 background-color / border-radius / padding / border 会一起消失（只剩里面的文字）。请改用 <section>。'
const QUOTED_FONT_FAMILY_SUGGESTION =
  '微信的 style 解析器处理不了 font-family 里的引号：整条声明会被丢弃，并连带把同一 style 里后续的 color / font-size / line-height 一起污染。去掉引号即可（`Georgia, Songti SC, SimSun, serif` 仍是合法 CSS）。'
const SVG_URL_REF_SUGGESTION =
  '微信会剥离 id，因此 `url(#…)` 引用（渐变、裁剪、遮罩、<use>）在读者端全部失效。请改用纯色填充或叠加图形实现同样效果。'

interface HastNode {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

function isElement(node: HastNode): node is HastNode & { tagName: string; properties: Record<string, unknown> } {
  return node.type === 'element' && typeof node.tagName === 'string'
}

function textOf(node: HastNode): string {
  if (node.type === 'text') return node.value ?? ''
  if (node.type === 'comment') return ''
  let out = ''
  if (node.children) for (const c of node.children) out += textOf(c)
  return out
}

function countWords(text: string): number {
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length ?? 0
  const latin = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ').match(/[a-zA-Z0-9]+/g)?.length ?? 0
  return cjk + latin
}

function isAllowedImageUrl(src: string): boolean {
  const s = src.trim()
  if (s.startsWith('data:image/')) return true
  if (s.startsWith('//')) {
    const host = s.slice(2).split('/')[0]?.toLowerCase() ?? ''
    return ALLOWED_IMAGE_HOSTS.includes(host)
  }
  try {
    const url = new URL(s)
    const host = url.hostname.toLowerCase()
    return (
      host === 'mmbiz.qpic.cn' ||
      host.endsWith('.qpic.cn') ||
      ALLOWED_IMAGE_HOSTS.includes(host)
    )
  } catch {
    // 非 URL（相对路径等）按外链处理，提示上传素材库。
    return false
  }
}

interface WalkState {
  issues: ValidationIssue[]
  imageCount: number
  text: string
  /** 排版类问题每个 rule 只报一次：50 段的文章不该出 50 条一样的警告。 */
  typoReported: Set<string>
}

/** 从根节点继承下来的排版值（字号、行高比、字距 em）。 */
interface Typography {
  fontSizePx?: number
  lineHeightRatio?: number
  letterSpacingEm?: number
}

function pxOf(value: string, parentPx?: number): number | undefined {
  const v = value.trim()
  const px = /^(-?[\d.]+)px$/.exec(v)
  if (px) return Number(px[1])
  const em = /^(-?[\d.]+)em$/.exec(v)
  if (em) return parentPx === undefined ? undefined : Number(em[1]) * parentPx
  const pct = /^(-?[\d.]+)%$/.exec(v)
  if (pct) return parentPx === undefined ? undefined : (Number(pct[1]) / 100) * parentPx
  return undefined
}

function ratioOf(value: string, fontSizePx?: number): number | undefined {
  const v = value.trim()
  if (/^normal$/i.test(v)) return undefined // 交给浏览器默认值，不参与判断
  const px = /^(-?[\d.]+)px$/.exec(v)
  if (px) return fontSizePx ? Number(px[1]) / fontSizePx : undefined
  const pct = /^(-?[\d.]+)%$/.exec(v)
  if (pct) return Number(pct[1]) / 100
  const num = /^(-?[\d.]+)$/.exec(v)
  if (num) return Number(num[1])
  return undefined
}

function emOf(value: string, fontSizePx?: number): number | undefined {
  const v = value.trim()
  const em = /^(-?[\d.]+)em$/.exec(v)
  if (em) return Number(em[1])
  const px = /^(-?[\d.]+)px$/.exec(v)
  if (px) return fontSizePx ? Number(px[1]) / fontSizePx : undefined
  const num = /^(-?[\d.]+)$/.exec(v)
  if (num) return Number(num[1])
  return undefined
}

/** 段落下边距：兼容 `margin-bottom` 与 `margin` 简写（1~4 个值）。 */
function marginBottomPx(decls: Array<{ property: string; value: string }>, fontSizePx?: number): number | undefined {
  const direct = decls.find((d) => d.property.toLowerCase() === 'margin-bottom')
  if (direct) return pxOf(direct.value, fontSizePx)
  const shorthand = decls.find((d) => d.property.toLowerCase() === 'margin')
  if (!shorthand) return undefined
  const parts = shorthand.value.trim().split(/\s+/)
  // 1 值=四边；2 值=上下/左右；3 值=上/左右/下；4 值=上/右/下/左
  const bottom = parts.length === 1 ? parts[0] : parts.length === 2 ? parts[0] : parts[2]
  return bottom === undefined ? undefined : pxOf(bottom, fontSizePx)
}

function resolveTypography(node: HastNode, inherited: Typography): Typography {
  const out: Typography = { ...inherited }
  const styleValue = node.properties?.style
  if (typeof styleValue !== 'string' || !styleValue.trim()) return out
  for (const decl of parseStyleDeclarations(styleValue)) {
    const prop = decl.property.toLowerCase()
    if (prop === 'font-size') {
      const px = pxOf(decl.value, out.fontSizePx)
      if (px !== undefined) out.fontSizePx = px
    } else if (prop === 'line-height') {
      const ratio = ratioOf(decl.value, out.fontSizePx)
      if (ratio !== undefined) out.lineHeightRatio = ratio
    } else if (prop === 'letter-spacing') {
      const em = emOf(decl.value, out.fontSizePx)
      if (em !== undefined) out.letterSpacingEm = em
    }
  }
  return out
}

/** 正文（`<p>`）排版检查：只判「明显坏」，每个 rule 最多报一次。 */
function checkParagraphTypography(
  node: HastNode,
  typo: Typography,
  state: WalkState,
  tagLocation: string,
): void {
  const push = (rule: string, severity: 'error' | 'warning', message: string): void => {
    if (state.typoReported.has(rule)) return
    state.typoReported.add(rule)
    state.issues.push({ rule, severity, message, suggestion: TYPOGRAPHY_HINT, location: tagLocation })
  }

  const { lineHeightRatio, fontSizePx, letterSpacingEm } = typo

  if (lineHeightRatio !== undefined) {
    const lh = Number(lineHeightRatio.toFixed(2))
    if (lh < TYPOGRAPHY.lineHeight.errorBelow) {
      push('typography-line-height', 'error', `正文行高仅 ${lh}，中文密排会挤成一团（< ${TYPOGRAPHY.lineHeight.errorBelow}）。`)
    } else if (lh < TYPOGRAPHY.lineHeight.warnBelow || lh > TYPOGRAPHY.lineHeight.warnAbove) {
      push(
        'typography-line-height',
        'warning',
        `正文行高 ${lh} 偏离常见区间（${TYPOGRAPHY.lineHeight.warnBelow}–${TYPOGRAPHY.lineHeight.warnAbove}）。`,
      )
    }
  }

  if (fontSizePx !== undefined) {
    const fs = Number(fontSizePx.toFixed(1))
    if (fs < TYPOGRAPHY.fontSize.errorBelow) {
      push('typography-font-size', 'error', `正文字号仅 ${fs}px，手机上难以阅读（< ${TYPOGRAPHY.fontSize.errorBelow}px）。`)
    } else if (fs < TYPOGRAPHY.fontSize.warnBelow || fs > TYPOGRAPHY.fontSize.warnAbove) {
      push(
        'typography-font-size',
        'warning',
        `正文字号 ${fs}px 偏离常见区间（${TYPOGRAPHY.fontSize.warnBelow}–${TYPOGRAPHY.fontSize.warnAbove}px）。`,
      )
    }
  }

  if (letterSpacingEm !== undefined && letterSpacingEm > TYPOGRAPHY.letterSpacing.warnAboveEm) {
    push(
      'typography-letter-spacing',
      'warning',
      `正文字距 ${Number(letterSpacingEm.toFixed(3))}em 过宽（> ${TYPOGRAPHY.letterSpacing.warnAboveEm}em），会吃栏宽、字显散。`,
    )
  }

  const styleValue = node.properties?.style
  if (typeof styleValue === 'string' && styleValue.trim()) {
    const bottom = marginBottomPx(parseStyleDeclarations(styleValue), fontSizePx)
    if (bottom !== undefined && bottom < TYPOGRAPHY.blockSpacing.warnBelow) {
      push(
        'typography-block-spacing',
        'warning',
        `段落间距仅 ${Number(bottom.toFixed(1))}px（< ${TYPOGRAPHY.blockSpacing.warnBelow}px），段落之间没有呼吸。`,
      )
    }
  }
}

function walk(node: HastNode, location: string, state: WalkState, inherited: Typography = {}): void {
  if (node.type === 'text') {
    state.text += node.value ?? ''
    return
  }
  if (!isElement(node)) return

  const tag = node.tagName.toLowerCase()
  const tagLocation = `${location} > ${tag}`
  const typo = resolveTypography(node, inherited)

  // 1. 禁止标签
  if (FORBIDDEN_TAGS.has(tag)) {
    state.issues.push({
      rule: 'no-forbidden-tag',
      severity: 'error',
      message: `检测到微信不支持的标签「<${tag}>」。`,
      suggestion: FORBIDDEN_TAG_SUGGESTION(tag),
      location: tagLocation,
    })
  }

  // 2. 事件属性 & 危险属性
  // 微信编辑器粘贴时会拆掉 <div> 壳（白名单里没有 div），样式跟着壳一起没了。
  if (tag === 'div') {
    state.issues.push({
      rule: 'div-will-be-unwrapped',
      severity: 'warning',
      message: '检测到 <div>。微信编辑器会拆掉 div 壳，其上的背景色/圆角/内边距会全部丢失。',
      suggestion: DIV_TAG_SUGGESTION,
      location: tagLocation,
    })
  }
  for (const [attr, raw] of Object.entries(node.properties)) {
    const key = attr.toLowerCase()
    if (key.startsWith('on')) {
      state.issues.push({
        rule: 'no-event-handler-attr',
        severity: 'error',
        message: `属性「${attr}」是事件处理函数，微信会过滤且存在安全风险。`,
        suggestion: EVENT_HANDLER_SUGGESTION,
        location: `${tagLocation}[${attr}]`,
      })
    }
    if (key === 'srcdoc') {
      state.issues.push({
        rule: 'no-dangerous-attr',
        severity: 'error',
        message: `属性「${attr}」可能导致 HTML 注入。`,
        suggestion: '请删除该属性。',
        location: `${tagLocation}[${attr}]`,
      })
    }
    if (typeof raw === 'string' && /^javascript:/i.test(raw.trim())) {
      state.issues.push({
        rule: 'no-dangerous-url',
        severity: 'error',
        message: `发现了 javascript: 链接，微信内会被拦截。`,
        suggestion: JS_URL_SUGGESTION,
        location: `${tagLocation}[${attr}]`,
      })
    }
    // 微信会剥离 id（实测）：任何依赖 id 的引用都会失效
    if (key === 'id') {
      state.issues.push({
        rule: 'id-will-be-stripped',
        severity: 'warning',
        message: `属性「id」会被微信剥离，无法在读者端生效。`,
        suggestion: ID_STRIPPED_SUGGESTION,
        location: `${tagLocation}[id]`,
      })
    }
    // SVG 的 url(#id) 引用在 id 被剥离后必然失效
    if (key !== 'style' && typeof raw === 'string' && /url\(\s*['"]?#/.test(raw)) {
      state.issues.push({
        rule: 'svg-url-ref-broken',
        severity: 'error',
        message: `属性「${attr}」引用了 url(#…)，但微信会剥离 id，该引用在读者端必然失效。`,
        suggestion: SVG_URL_REF_SUGGESTION,
        location: `${tagLocation}[${attr}]`,
      })
    }
    // 页内锚点：draft/add 实测直接报 45166
    if (key === 'href' && typeof raw === 'string' && raw.trim().startsWith('#')) {
      state.issues.push({
        rule: 'no-hash-anchor',
        severity: 'error',
        message: `页内锚点链接「${raw.trim()}」会被微信 draft/add 拒绝（实测 errcode 45166）。`,
        suggestion: HASH_ANCHOR_SUGGESTION,
        location: `${tagLocation}[href]`,
      })
    }
  }

  // 3. 内联样式 -> CSS 三档校验（safe 放行 / gray、unknown 警告 / banned 错误）
  const styleValue = node.properties.style
  if (typeof styleValue === 'string' && styleValue.trim()) {
    for (const decl of parseStyleDeclarations(styleValue)) {
      const tier = classifyCssProperty(decl.property)
      // font-family 里的引号会把微信的 style 解析器搞崩，连带丢掉后续声明。
      if (/^font-family$/i.test(decl.property) && /["']/.test(decl.value)) {
        state.issues.push({
          rule: 'quoted-font-family',
          severity: 'error',
          message: 'font-family 里含引号，微信会丢掉整条声明，并连带污染同一 style 里后面的属性。',
          suggestion: QUOTED_FONT_FAMILY_SUGGESTION,
          location: `${tagLocation}@${decl.property}`,
        })
      }
      if (tier === 'banned') {
        state.issues.push({
          rule: 'css-property-banned',
          severity: 'error',
          message: `内联样式使用了真实微信实测会过滤的属性「${decl.property}」。`,
          suggestion: CSS_PROP_SUGGESTION(decl.property),
          location: `${tagLocation}@${decl.property}`,
        })
      } else if (tier === 'gray') {
        state.issues.push({
          rule: 'css-property-gray',
          severity: 'warning',
          message: `内联样式使用了灰色属性「${decl.property}」：微信草稿 API 实测会保留，但编辑器粘贴/读者渲染仍不确定。`,
          suggestion: '若需在微信里稳定呈现，建议改用基础排版属性表达；否则可保留（如有问题可在编辑器里再调整）。',
          location: `${tagLocation}@${decl.property}`,
        })
      } else if (tier === 'unknown') {
        state.issues.push({
          rule: 'css-property-unknown',
          severity: 'warning',
          message: `内联样式使用了未纳入已知白名单的属性「${decl.property}」，微信兼容性未确认。`,
          suggestion: '建议确认该属性在微信端的表现；若不放心，用已验证的基础属性表达。',
          location: `${tagLocation}@${decl.property}`,
        })
      }
      if (/url\(\s*['"]?#/.test(decl.value)) {        state.issues.push({
          rule: 'svg-url-ref-broken',
          severity: 'error',
          message: `属性「${decl.property}」引用了 url(#…)，但微信会剥离 id，该引用在读者端必然失效。`,
          suggestion: SVG_URL_REF_SUGGESTION,
          location: `${tagLocation}@${decl.property}`,
        })
      }
      const unsafe = findUnsafeCssValue(decl.value)
      if (unsafe) {
        state.issues.push({
          rule: 'css-value-unsafe',
          severity: 'warning',
          message: `属性「${decl.property}」的值包含微信表现不稳定的内容：${unsafe}`,
          suggestion: unsafe,
          location: `${tagLocation}@${decl.property}`,
        })
      }
    }
  }

  // 4. 排版基线（只判「明显坏」，见 TYPOGRAPHY 注释）
  if (tag === 'p') checkParagraphTypography(node, typo, state, tagLocation)

  // 5. 图片检查
  if (tag === 'img') {
    state.imageCount += 1
    const src = node.properties.src
    if (typeof src === 'string' && src.trim() && !isAllowedImageUrl(src)) {
      state.issues.push({
        rule: 'external-image',
        severity: 'warning',
        message: '检测到外链图片（非微信素材库域名）。',
        suggestion: IMAGE_SUGGESTION,
        location: `${tagLocation}#${src.slice(0, 60)}`,
      })
    }
  }

  // 递归
  if (node.children) {
    for (const child of node.children) walk(child, tagLocation, state, typo)
  }
}

/** 把 HTML 字符串解析为 hast 根节点。 */
export function parseHtml(html: string): HastNode {
  const processor = unified().use(rehypeParse, { fragment: true })
  const root = processor.parse(html) as HastNode
  return root
}

/**
 * 校验一段 HTML 是否可安全发布到微信公众号，返回结构化报告（恒不抛错，失败信息写入 issues）。
 */
export function validateHtml(html: string): ValidationReport {
  const state: WalkState = { issues: [], imageCount: 0, text: '', typoReported: new Set() }
  let root: HastNode
  try {
    root = parseHtml(html)
  } catch (error) {
    return {
      pass: false,
      issues: [
        {
          rule: 'unparseable-html',
          severity: 'error',
          message: `HTML 无法解析：${error instanceof Error ? error.message : String(error)}`,
          suggestion: '请检查并修正 HTML 语法后再校验。',
          location: '(document)',
        },
      ],
    }
  }
  for (const child of root.children ?? []) walk(child, '(document)', state, {})

  // 5. 图片数量
  if (state.imageCount > 15) {
    state.issues.push({
      rule: 'image-count-high',
      severity: 'warning',
      message: `图片数量较多（${state.imageCount} 张），可能影响加载与阅读体验。`,
      suggestion: '建议精简配图（如压缩体积、删除冗余图），或将长图拆分为多张。',
      location: '(document)',
    })
  }
  if (state.imageCount === 0) {
    state.issues.push({
      rule: 'image-count-zero',
      severity: 'info',
      message: '正文中未检测到图片。',
      suggestion: '若内容需要配图，请补充；纯文字文章可忽略此提示。',
      location: '(document)',
    })
  }

  // 6. 正文字数上限提示
  const words = countWords(state.text)
  if (words > WORD_COUNT_WARNING) {
    state.issues.push({
      rule: 'word-count-limit',
      severity: 'warning',
      message: `正文字数约 ${words} 字，已超过 ${WORD_COUNT_WARNING} 字的软上限。`,
      suggestion: '考虑压缩内容或拆分为多篇发布；若必需，请确认编辑器可完整承载。',
      location: '(document)',
    })
  }

  const pass = state.issues.every((issue) => issue.severity !== 'error')
  const report: ValidationReport = { pass, issues: state.issues }
  try {
    return validationReportSchema.parse(report)
  } catch {
    return report
  }
}
