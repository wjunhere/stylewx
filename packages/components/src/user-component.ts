/**
 * 用户自定义组件（F 能力）：agent 用 HTML 模板定义全新组件，存到本地组件库，用 `:::名字` 调用。
 *
 * 模板语法（刻意保持最小，够用且好教）：
 * - `{{prop}}`            prop 值，默认 HTML 转义；`{{prop|raw}}` 不转义
 * - `{{body}}`            正文（Markdown 已渲染成 HTML）
 * - `{{theme.primary}}`   主题配色，避免把颜色写死（见 PALETTE_KEYS）
 * - `{{#if prop}}…{{/if}}` / `{{#unless prop}}…{{/unless}}`  条件块
 * - `{{#each body}}…{{/each}}`  按正文的非空行迭代，块内可用 `{{this}}`、
 *   `{{this.0}}` / `{{this.1}}`（按 `|` 切分）、`{{@index}}`
 *
 * 模板里可以直接写 `data-swx-slot="title"` 来声明可被主题样式覆盖的部位
 * （渲染后会被剥离，不会进入最终产物）。
 *
 * 本模块保持同构：不做文件读写、不做校验（保存时的校验在 service 层）。
 */
import { escapeHtml } from './style.js'
import type { ComponentNode, RenderContext } from './types.js'

export interface UserComponentDef {
  /** 组件名（小写+连字符），不能与内置组件重名。 */
  name: string
  description: string
  /** HTML 模板。 */
  template: string
  /** prop 默认值。 */
  defaults?: Record<string, string>
  /** 声明的可定制部位（文档用途；实际以模板里的 data-swx-slot 为准）。 */
  slots?: string[]
}

/** 模板里可用的主题配色键。 */
export const PALETTE_KEYS = [
  'primary',
  'primarySoft',
  'primaryStrong',
  'onPrimary',
  'text',
  'muted',
  'weak',
  'cardBg',
  'cardBorder',
  'divider',
  'canvasBg',
  'fontFamily',
  'fontSize',
  'lineHeight',
  'blockGap',
  'radiusSm',
  'radius',
  'radiusLg',
] as const

interface Scope {
  props: Record<string, string>
  bodyRaw: string
  bodyHtml: string
  palette: Record<string, string>
  local?: { value: string; index: number }
}

interface Lookup {
  value: string
  /** true 表示不转义（body / theme / |raw）。 */
  raw: boolean
  found: boolean
}

function splitParts(line: string): string[] {
  return line.split('|').map((p) => p.trim())
}

function lookup(expr: string, scope: Scope): Lookup {
  const rawSuffix = /\|\s*raw\s*$/.test(expr)
  const path = rawSuffix ? expr.replace(/\|\s*raw\s*$/, '').trim() : expr.trim()

  if (path === 'body') return { value: scope.bodyHtml, raw: true, found: true }

  if (path === 'this' || path.startsWith('this.')) {
    if (!scope.local) return { value: '', raw: false, found: false }
    if (path === 'this') return { value: scope.local.value, raw: false, found: true }
    const idx = Number(path.slice('this.'.length))
    const parts = splitParts(scope.local.value)
    return { value: Number.isInteger(idx) ? (parts[idx] ?? '') : '', raw: false, found: true }
  }

  if (path === '@index') {
    return { value: scope.local ? String(scope.local.index + 1) : '', raw: false, found: true }
  }

  if (path.startsWith('theme.')) {
    const key = path.slice('theme.'.length)
    const value = scope.palette[key]
    return { value: value ?? '', raw: true, found: value !== undefined }
  }

  // prop 名不区分大小写（存储时统一小写）
  const propKey = path.toLowerCase()
  if (propKey in scope.props) return { value: scope.props[propKey] ?? '', raw: rawSuffix, found: true }
  return { value: '', raw: rawSuffix, found: false }
}

/** 从 start 处取出配对的块内容（支持同类块嵌套）。 */
function extractBlock(
  template: string,
  start: number,
  openTag: string,
  closeTag: string,
): { inner: string; end: number } {
  let depth = 1
  let i = start
  while (i < template.length) {
    const nextOpen = template.indexOf(openTag, i)
    const nextClose = template.indexOf(closeTag, i)
    if (nextClose === -1) break
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1
      i = nextOpen + openTag.length
      continue
    }
    depth -= 1
    if (depth === 0) {
      return { inner: template.slice(start, nextClose), end: nextClose + closeTag.length }
    }
    i = nextClose + closeTag.length
  }
  // 未闭合：当成到结尾
  return { inner: template.slice(start), end: template.length }
}

export interface RenderUserComponentResult {
  html: string
  /** 模板里引用到但没给值的 prop（会作为诊断上报）。 */
  missing: string[]
}

/** 渲染一个用户自定义组件。 */
export function renderUserComponent(
  def: UserComponentDef,
  node: ComponentNode,
  ctx: RenderContext,
  bodyHtml: string,
): RenderUserComponentResult {
  // 参数名统一小写（parseProps 已把 markdown 里的参数名转小写，这里保持一致）
  const props: Record<string, string> = {}
  for (const [k, v] of Object.entries(def.defaults ?? {})) props[k.toLowerCase()] = v
  for (const [k, v] of Object.entries(node.props)) props[k.toLowerCase()] = v
  const palette = ctx.palette as unknown as Record<string, string>
  const scope: Scope = {
    props,
    bodyRaw: node.body,
    bodyHtml,
    palette,
  }
  const missing = new Set<string>()
  /** 模板里实际引用到的标识符（用于「参数给了但没用到」的诊断）。 */
  const used = new Set<string>()

/** 从表达式里取出根标识符（`a.b` → `a`）。 */
function rootOf(expr: string): string {
  const clean = expr.replace(/\|\s*raw\s*$/, '').trim()
  return clean.split('.')[0] ?? ''
}

  const render = (template: string, current: Scope): string => {
    let out = ''
    let i = 0
    while (i < template.length) {
      const open = template.indexOf('{{', i)
      if (open === -1) {
        out += template.slice(i)
        break
      }
      out += template.slice(i, open)
      const close = template.indexOf('}}', open)
      if (close === -1) {
        out += template.slice(open)
        break
      }
      const token = template.slice(open + 2, close).trim()

      if (token.startsWith('#each ')) {
        const expr = token.slice('#each '.length).trim()
        used.add(rootOf(expr).toLowerCase())
        const { inner, end } = extractBlock(template, close + 2, '{{#each ', '{{/each}}')
        const lines =
          expr === 'body'
            ? current.bodyRaw
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean)
            : []
        out += lines
          .map((line, index) =>
            render(inner, { ...current, local: { value: line, index } }),
          )
          .join('')
        i = end
        continue
      }

      if (token.startsWith('#if ') || token.startsWith('#unless ')) {
        const unless = token.startsWith('#unless ')
        const expr = token.slice(unless ? '#unless '.length : '#if '.length).trim()
        const openTag = unless ? '{{#unless ' : '{{#if '
        const closeTag = unless ? '{{/unless}}' : '{{/if}}'
        const { inner, end } = extractBlock(template, close + 2, openTag, closeTag)
        used.add(rootOf(expr).toLowerCase())
        const hit = Boolean(lookup(expr, current).value)
        if (unless ? !hit : hit) out += render(inner, current)
        i = end
        continue
      }

      used.add(rootOf(token).toLowerCase())
      const result = lookup(token, current)
      if (!result.found && !token.startsWith('theme.')) missing.add(token.replace(/\|\s*raw\s*$/, '').trim())
      out += result.raw ? result.value : escapeHtml(result.value)
      i = close + 2
    }
    return out
  }

  const html = render(def.template, scope)

  // 模板里引用了不存在的 prop → 明确告知（避免静默产出空内容）
  for (const key of missing) {
    ctx.diagnostics.push({
      level: 'warning',
      component: def.name,
      message: `自定义组件 :::${def.name} 的模板引用了未提供的参数「${key}」，该项渲染为空。`,
      line: node.line,
    })
  }

  // 反向诊断：agent 常把参数名写错（如 tagline 写成 subtitle），导致静默不生效
  const ignored = Object.keys(node.props).filter(
    (key) => key !== 'style' && !used.has(key) && !(key in (def.defaults ?? {})),
  )
  for (const key of ignored) {
    ctx.diagnostics.push({
      level: 'warning',
      component: def.name,
      message: `自定义组件 :::${def.name} 收到了参数「${key}」，但模板里没有使用它（可能拼错了参数名）。`,
      line: node.line,
    })
  }

  return { html, missing: [...missing] }
}
