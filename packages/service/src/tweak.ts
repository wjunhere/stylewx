/**
 * 主题微调（service 层）：解析主题名 / 对象 → 应用确定性 patch → 可选示例截图。
 * 这是「改一点再试一下」的快速通道，不调用 LLM。
 */
import { tweakTheme as applyPatch } from '@stylewx/theme'
import type { Theme, ThemePatch } from '@stylewx/theme'
import { resolveTheme } from './themes.js'
import { serviceError } from './errors.js'
import { renderPreview } from './render.js'
import { SAMPLE_ARTICLE } from './generate.js'

export interface TweakThemeParams {
  /** 基础主题：预置名 / 已保存名 / 完整主题对象。 */
  theme: string | Theme
  /** 要改的字段。 */
  patch: ThemePatch
  /** 是否渲染内置示例文章的截图（默认 false，保证秒级返回）。 */
  preview?: boolean
}

export interface TweakThemeServiceResult {
  theme: Theme
  /** 实际被修改的字段路径。 */
  changed: string[]
  /** 修改后是否仍然合法（不合法时 theme 为 null，见 issues）。 */
  ok: boolean
  issues: { path: string; message: string }[]
  /** 修改后主题渲染示例文章的截图（preview=true 且已安装 Chromium 时返回）。 */
  previewPng?: Buffer
}

/**
 * 在现有主题上做确定性微调。
 * 与 generate_theme 的区别：后者从零生成一版新主题（烧 LLM），本函数只改指定字段、秒回。
 */
export async function tweakTheme(params: TweakThemeParams): Promise<TweakThemeServiceResult> {
  const base = resolveTheme(params.theme)
  const result = applyPatch(base, params.patch ?? {})
  if (!result.ok || !result.theme) {
    throw serviceError(
      'invalid_theme_patch',
      `微调后主题不合法：${result.issues.map((i) => `${i.path}: ${i.message}`).join('；')}`,
      '请检查改动值：颜色需为合法色值，尺寸需带单位（如 16px、1.5em），CSS 属性需在微信白名单内。',
    )
  }

  const out: TweakThemeServiceResult = {
    theme: result.theme,
    changed: result.changed,
    ok: true,
    issues: [],
  }

  if (params.preview) {
    try {
      const rendered = await renderPreview(SAMPLE_ARTICLE, result.theme, { includeScreenshot: true })
      out.previewPng = rendered.screenshotPng
    } catch {
      // 截图失败不致命
    }
  }

  return out
}
