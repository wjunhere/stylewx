/**
 * 组件库预览：给每个组件生成一段示例 Markdown 并用当前主题渲染，
 * 供编辑器「组件库」页面展示真实效果。
 */
import { COMPONENT_CATALOG, getComponentSpec, slotsForComponent } from '@stylewx/components'
import type { ComponentDiagnostic, UserComponentDef } from '@stylewx/components'
import { renderMarkdownToHtml } from '@stylewx/core'
import type { Theme } from '@stylewx/theme'
import { validateTheme } from '@stylewx/theme'
import { serviceError } from './errors.js'
import { listUserComponents } from './component-store.js'

export interface ComponentPreview {
  name: string
  origin: 'builtin' | 'user'
  summary: string
  /** 可被主题样式覆盖的部位。 */
  slots: string[]
  /** 用于预览的示例 Markdown（也是「复制示例」的内容）。 */
  sample: string
  /** 用当前主题渲染后的 HTML 片段。 */
  html: string
  /** 该示例渲染时的组件诊断。 */
  diagnostics: ComponentDiagnostic[]
}

/**
 * 预览用占位图（内联 SVG data URI）。
 * 组件示例里的图片 URL 是 `https://example.com/…` 这种占位链接，浏览器加载不出来，
 * 预览就会是一片空白。这里在**仅渲染预览**时替换成内联占位图：无需联网、必定渲染，
 * 而返回给「复制示例」的 sample 仍是干净的原文。
 */
const PLACEHOLDER_COLORS = [
  ['#dbeafe', '#93c5fd'],
  ['#fee2e2', '#fca5a5'],
  ['#dcfce7', '#86efac'],
  ['#fef9c3', '#fde047'],
  ['#ede9fe', '#c4b5fd'],
  ['#cffafe', '#67e8f9'],
]

export function placeholderImageUrl(index: number, label: string): string {
  const pair = PLACEHOLDER_COLORS[(Math.max(1, index) - 1) % PLACEHOLDER_COLORS.length] as [string, string]
  const bg = pair[0]
  const fg = pair[1]
  const text = String(label || `${index}`).replace(/[<>&"]/g, "")
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">' +
    `<rect width="600" height="400" fill="${bg}"/>` +
    `<rect width="600" height="6" y="394" fill="${fg}"/>` +
    '<g fill="none" stroke="' + fg + '" stroke-width="6" stroke-linejoin="round">' +
    '<rect x="235" y="165" width="130" height="95" rx="10"/>' +
    '<path d="M245 245l40-38 28 24 34-34 28 48z"/>' +
    '<circle cx="270" cy="192" r="10"/>' +
    '</g>' +
    `<text x="300" y="300" text-anchor="middle" font-family="sans-serif" font-size="26" fill="#64748b">${text}</text>` +
    '</svg>'
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** 把示例里的图片地址换成占位图（只用于渲染预览）。 */
function withPlaceholderImages(sample: string): string {
  let n = 0
  return sample
    // Markdown 图片：![图一](https://example.com/1.jpg)
    .replace(/!\[([^\]]*)\]\(\s*([^\s)]+)[^)]*\)/g, (_m, alt: string) => {
      n += 1
      return `![${alt}](${placeholderImageUrl(n, alt || `示例图 ${n}`)})`
    })
    // 组件参数：src="..." 与 image="..."（cover 用的是 image 参数）
    .replace(/(?<![-\w])(src|image)="[^"]*"/g, (_m, name: string) => {
      n += 1
      return `${name}="${placeholderImageUrl(n, `示例图 ${n}`)}"`
    })
}

/** 把 props 拼成 `{k="v" k2=v2}`。 */
function propString(props: Record<string, string>): string {
  const parts = Object.entries(props)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => (/^[A-Za-z0-9._-]+$/.test(v) ? `${k}=${v}` : `${k}="${v.replace(/"/g, '&quot;')}"`))
  return parts.length ? `{${parts.join(' ')}}` : ''
}

/** 自定义组件的示例：用 defaults 预填参数，正文给两行（兼容 `{{#each body}}` 的 `this.0/this.1`）。 */
export function userComponentSample(def: UserComponentDef): string {
  const head = `:::${def.name}${propString(def.defaults ?? {})}`
  return `${head}\n示例一 | 说明一\n示例二 | 说明二\n:::`
}

/** 取某个组件的示例 Markdown（内置用组件目录里的 example）。 */
export function sampleForComponent(name: string, userDef?: UserComponentDef): string | undefined {
  if (userDef) return userComponentSample(userDef)
  return getComponentSpec(name)?.example
}

export interface RenderComponentPreviewsOptions {
  /** 只渲染这些组件；缺省渲染全部。 */
  names?: string[]
  /** 覆盖本地组件库（测试用）。 */
  userComponents?: UserComponentDef[]
}

/**
 * 用给定主题渲染组件库预览。
 * 纯计算（不做截图、不写文件），一次调用返回全部组件的预览 HTML。
 */
export function renderComponentPreviews(
  theme: Theme,
  options: RenderComponentPreviewsOptions = {},
): { previews: ComponentPreview[] } {
  const check = validateTheme(theme)
  if (!check.ok || !check.theme) {
    const detail = check.issues.map((i) => `${i.path}: ${i.message}`).join('；')
    throw serviceError('invalid_theme', `主题不合法：${detail}`, '请传入符合 Schema 的主题对象。')
  }
  const safeTheme = check.theme
  const users = options.userComponents ?? listUserComponents()
  const wanted = options.names?.length ? new Set(options.names) : undefined

  const entries: { name: string; origin: 'builtin' | 'user'; summary: string; slots: string[]; sample: string }[] = []

  for (const spec of COMPONENT_CATALOG) {
    if (wanted && !wanted.has(spec.name)) continue
    entries.push({
      name: spec.name,
      origin: 'builtin',
      summary: spec.summary,
      slots: spec.slots ?? slotsForComponent(spec.name),
      sample: spec.example,
    })
  }
  // 别名（follow）也给一份预览，方便用户看到
  if (!wanted || wanted.has('follow')) {
    const endCard = getComponentSpec('end-card')
    if (endCard) {
      entries.push({
        name: 'follow',
        origin: 'builtin',
        summary: '结尾卡片别名（与 end-card 同一渲染器）',
        slots: slotsForComponent('follow'),
        sample: endCard.example.replace(':::end-card', ':::follow'),
      })
    }
  }
  for (const def of users) {
    if (wanted && !wanted.has(def.name)) continue
    entries.push({
      name: def.name,
      origin: 'user',
      summary: def.description || '自定义组件',
      slots: def.slots ?? ['root', '*'],
      sample: userComponentSample(def),
    })
  }

  const previews: ComponentPreview[] = entries.map((entry) => {
    try {
      const { html, diagnostics } = renderMarkdownToHtml(withPlaceholderImages(entry.sample), safeTheme)
      return { ...entry, html, diagnostics: diagnostics ?? [] }
    } catch (error) {
      return {
        ...entry,
        html: '',
        diagnostics: [
          {
            level: 'error',
            component: entry.name,
            message: `渲染失败：${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      }
    }
  })

  return { previews }
}
