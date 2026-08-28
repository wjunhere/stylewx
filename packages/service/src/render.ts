import { renderMarkdownToHtml } from '@mp-style/core'
import { validateTheme } from '@mp-style/theme'
import type { Theme } from '@mp-style/theme'
import { validateHtml } from '@mp-style/validator'
import type { ValidationReport } from '@mp-style/validator'
import { renderIphonePreview } from '@mp-style/preview'
import { serviceError } from './errors.js'
import type { ServiceError } from './errors.js'

export interface RenderPreviewResult {
  html: string
  theme: Theme
  validation: ValidationReport
  /** 模拟 iPhone 视口（390px）的截图 PNG（若已安装 Chromium）。 */
  screenshotPng?: Buffer
}

/**
 * 渲染预览：Markdown + 主题 → 内联样式 HTML → 校验报告 → iPhone 视口截图。
 * 截图失败不影响 HTML 与校验结果（降级返回无截图）。
 */
export async function renderPreview(
  markdown: string,
  theme: Theme,
  options: { includeScreenshot?: boolean } = {},
): Promise<RenderPreviewResult> {
  const themeCheck = validateTheme(theme)
  if (!themeCheck.ok || !themeCheck.theme) {
    const detail = themeCheck.issues.map((i) => `${i.path}: ${i.message}`).join('；')
    throw serviceError(
      'invalid_theme',
      `主题不合法：${detail}`,
      '请用符合主题 Schema 的 JSON 传入 theme，或先用 generate_theme 生成主题。',
    )
  }

  const { html } = renderMarkdownToHtml(markdown, themeCheck.theme)
  const validation = validateHtml(html)

  const result: RenderPreviewResult = {
    html,
    theme: themeCheck.theme,
    validation,
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
