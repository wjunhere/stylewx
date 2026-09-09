/**
 * 无头排版内核：Markdown → 微信兼容的内联样式 HTML。
 * 组合 unified/remark/rehype 渲染与 juice 内联，纯函数、无 DOM / Node 独有 API。
 */
import juice from 'juice'
import {
  compileRootBaseStyle,
  compileThemeToCss,
  validateTheme,
} from '@stylewx/theme'
import type { Theme } from '@stylewx/theme'
import { markdownToHtml } from './markdown.js'
import type { ComponentDiagnostic } from '@stylewx/components'

export interface RenderResult {
  /** 最终可直接粘贴进微信公众号的 HTML：全部样式已内联，无 <style>/<link>/class 依赖。 */
  html: string
  /** 实际使用的主题（已通过 schema + 微信白名单校验）。 */
  theme: Theme
  /** 组件渲染诊断（未知组件、缺参数等）。 */
  diagnostics?: ComponentDiagnostic[]
}

/** 禁止 juice 去抓取任何外部资源（保持 headless、无网络、可复现）。 */
function juiceOptions(theme: Theme) {
  return {
    extraCss: compileThemeToCss(theme),
    applyStyleTags: false,
    removeStyleTags: true,
    insertPreservedExtraCss: false,
    preserveMediaQueries: false,
    preserveFontFaces: false,
    preserveKeyFrames: false,
    preservePseudos: false,
    preserveImportant: false,
    webResources: {
      links: false,
      scripts: false,
      images: false,
      svgs: false,
    },
  }
}

/** 转义 HTML 属性值（style 里的字体名可能带双引号，必须转义后再拼进属性）。 */
function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/**
 * 渲染一篇 Markdown 为微信兼容的内联样式 HTML。
 * @param markdown 文章 Markdown
 * @param theme 已通过 themeSchema 校验的主题
 */
export function renderMarkdownToHtml(markdown: string, theme: Theme): RenderResult {
  const validation = validateTheme(theme)
  if (!validation.ok || !validation.theme) {
    const detail = validation.issues.map((i) => `${i.path}: ${i.message}`).join('；')
    throw new Error(`主题不合法，无法渲染：${detail}`)
  }
  const safeTheme = validation.theme

  const diagnostics: ComponentDiagnostic[] = []
  const bodyHtml = markdownToHtml(markdown, {
    theme: safeTheme.tokens,
    onDiagnostic: (d) => diagnostics.push(d),
  })
  const baseStyle = compileRootBaseStyle(safeTheme)
  // 注意：主题的 fontFamily 常带双引号（如 Georgia, "Songti SC"），
  // 不转义会截断 style 属性，导致根节点的 font-size/color/line-height 全部丢失。
  const wrapped = `<section style="${escapeAttribute(baseStyle)}">${bodyHtml}</section>`
  const html = juice(wrapped, juiceOptions(safeTheme))

  return { html, theme: safeTheme, diagnostics: diagnostics.length ? diagnostics : undefined }
}
