/**
 * 微信兼容性校验器：对渲染后的 HTML 做三类检查（CSS 白名单 / HTML 结构 / 内容）。
 * 输出结构化报告 { pass, issues: [{ rule, severity, message, suggestion, location }] }。
 * 同构：不依赖 DOM / Node 独有 API。
 */
import { unified } from 'unified'
import rehypeParse from 'rehype-parse'
import {
  parseStyleDeclarations,
  isCssPropertyAllowed,
  findUnsafeCssValue,
} from '@mp-style/theme'
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

const FORBIDDEN_TAG_SUGGESTION = (tag: string): string =>
  `「${tag}」标签微信编辑器会过滤，无法保留。请删除，或改用更基础的排版结构（如引用、图片、段落）表达。`

const EVENT_HANDLER_SUGGESTION =
  '事件属性（on*) 会被微信过滤且存在安全风险，请删除该属性。'
const JS_URL_SUGGESTION =
  'javascript: 链接在微信内会被拦截，请改为正常的 http(s) 链接或删除。'
const STYLE_TAG_SUGGESTION =
  '<style> 标签微信编辑器会丢弃，请在渲染阶段使用 juice 把样式内联到元素上，不要输出 <style>。'
const CSS_PROP_SUGGESTION = (prop: string): string =>
  `属性「${prop}」不在微信白名单内（position / transform / animation / float / box-shadow 等会被过滤）。请从主题中移除，或用允许的间距/颜色/字号等表达。`

const IMAGE_SUGGESTION =
  '外链图片微信会被拦截/无法显示。请先上传到微信公众号素材库（或使用图床得到 mmbiz.qpic.cn 链接）后再发布。'

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
}

function walk(node: HastNode, location: string, state: WalkState): void {
  if (node.type === 'text') {
    state.text += node.value ?? ''
    return
  }
  if (!isElement(node)) return

  const tag = node.tagName.toLowerCase()
  const tagLocation = `${location} > ${tag}`

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
  }

  // 3. 内联样式 -> CSS 白名单校验
  const styleValue = node.properties.style
  if (typeof styleValue === 'string' && styleValue.trim()) {
    for (const decl of parseStyleDeclarations(styleValue)) {
      if (!isCssPropertyAllowed(decl.property)) {
        state.issues.push({
          rule: 'css-property-not-whitelisted',
          severity: 'error',
          message: `内联样式使用了微信不兼容的属性「${decl.property}」。`,
          suggestion: CSS_PROP_SUGGESTION(decl.property),
          location: `${tagLocation}@${decl.property}`,
        })
      }
      const unsafe = findUnsafeCssValue(decl.value)
      if (unsafe) {
        state.issues.push({
          rule: 'css-value-unsafe',
          severity: 'warning',
          message: `属性「${decl.property}」的值包含微信不兼容/不可靠内容：${unsafe}`,
          suggestion: unsafe,
          location: `${tagLocation}@${decl.property}`,
        })
      }
    }
  }

  // 4. 图片检查
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
    for (const child of node.children) walk(child, tagLocation, state)
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
  const state: WalkState = { issues: [], imageCount: 0, text: '' }
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
  for (const child of root.children ?? []) walk(child, '(document)', state)

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
