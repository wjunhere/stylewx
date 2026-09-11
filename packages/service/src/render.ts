import { renderMarkdownToHtml } from '@stylewx/core'
import { userComponentMap } from './component-store.js'
import { validateTheme } from '@stylewx/theme'
import type { Theme } from '@stylewx/theme'
import { parseComponents } from '@stylewx/components'
import type { ComponentDiagnostic, UserComponentDef } from '@stylewx/components'
import { validateHtml } from '@stylewx/validator'
import type { ValidationReport } from '@stylewx/validator'
import { renderIphonePreview } from '@stylewx/preview'
import { serviceError } from './errors.js'

export interface RenderPreviewResult {
  html: string
  theme: Theme
  validation: ValidationReport
  /** 组件渲染诊断（未知组件、缺参数等）；无问题时省略。 */
  diagnostics?: ComponentDiagnostic[]
  /** 模拟 iPhone 视口（390px）的截图 PNG（若已安装 Chromium）。 */
  screenshotPng?: Buffer
}

/** 校验主题并返回校验后的主题；不合法时抛出统一错误。 */
/** 取用户自定义组件表：显式传入优先，否则读本地组件库。 */
function safeUserComponents(
  explicit?: Record<string, UserComponentDef>,
): Record<string, UserComponentDef> | undefined {
  if (explicit) return explicit
  try {
    const map = userComponentMap()
    return Object.keys(map).length > 0 ? map : undefined
  } catch {
    return undefined
  }
}

function assertValidTheme(theme: Theme): Theme {
  const themeCheck = validateTheme(theme)
  if (!themeCheck.ok || !themeCheck.theme) {
    const detail = themeCheck.issues.map((i) => `${i.path}: ${i.message}`).join('；')
    throw serviceError(
      'invalid_theme',
      `主题不合法：${detail}`,
      '请用符合主题 Schema 的 JSON 传入 theme，或先用 generate_theme 生成主题。',
    )
  }
  return themeCheck.theme
}

/**
 * 渲染预览：Markdown + 主题 → 内联样式 HTML → 校验报告 → iPhone 视口截图。
 * 截图失败不影响 HTML 与校验结果（降级返回无截图）。
 */
export async function renderPreview(
  markdown: string,
  theme: Theme,
  options: { includeScreenshot?: boolean; userComponents?: Record<string, UserComponentDef> } = {},
): Promise<RenderPreviewResult> {
  const safeTheme = assertValidTheme(theme)

  const { html, diagnostics } = renderMarkdownToHtml(markdown, safeTheme, {
    userComponents: safeUserComponents(options.userComponents),
  })
  const validation = validateHtml(html)

  const result: RenderPreviewResult = {
    html,
    theme: safeTheme,
    validation,
    diagnostics,
  }

  if (options.includeScreenshot !== false) {
    try {
      const { png } = await renderIphonePreview(html)
      result.screenshotPng = png
    } catch (error) {
      // 截图失败不致命：保留 HTML 与校验结果，仅提示。
      void error
    }
  }

  return result
}

export interface RenderFragmentOptions {
  /** 是否把整段 HTML 返回给调用方（默认 false，避免长文把上下文塞满）。 */
  includeHtml?: boolean
  /** 覆盖本地组件库（默认从 ~/.stylewx/components.json 读取）。 */
  userComponents?: Record<string, UserComponentDef>
  /** 是否返回截图（默认 true，片段渲染很快）。 */
  includeScreenshot?: boolean
}

export interface RenderFragmentResult {
  /** 仅在 includeHtml=true 时返回。 */
  html?: string
  theme: Theme
  validation: ValidationReport
  diagnostics?: ComponentDiagnostic[]
  screenshotPng?: Buffer
  /** 片段中识别到的组件（确认写法是否正确）。 */
  components: { name: string; props: Record<string, string> }[]
}

/**
 * 片段渲染：只渲染一小段（一个组件或一节），用于**逐段迭代**。
 * 默认不返回 HTML、只返回校验/诊断/截图与组件清单，因此比 render_preview 更省上下文。
 */
export async function renderFragment(
  markdown: string,
  theme: Theme,
  options: RenderFragmentOptions = {},
): Promise<RenderFragmentResult> {
  const safeTheme = assertValidTheme(theme)
  const { html, diagnostics } = renderMarkdownToHtml(markdown, safeTheme, {
    userComponents: safeUserComponents(options.userComponents),
  })
  const validation = validateHtml(html)

  const components = parseComponents(markdown)
    .filter((node) => node.type === 'component')
    .map((node) => ({ name: node.name, props: { ...node.props } }))

  const result: RenderFragmentResult = {
    theme: safeTheme,
    validation,
    diagnostics,
    components,
  }
  if (options.includeHtml) result.html = html

  if (options.includeScreenshot !== false) {
    try {
      const { png } = await renderIphonePreview(html)
      result.screenshotPng = png
    } catch (error) {
      void error
    }
  }

  return result
}
