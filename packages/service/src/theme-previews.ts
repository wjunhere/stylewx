/**
 * 主题库预览：用一篇统一的示例文章渲染所有主题，供编辑器「主题预览」页对比。
 * 与组件库预览（previews.ts）对等：纯计算、一次性返回，不做截图不写文件。
 */
import type { Theme, ThemeTokens } from '@stylewx/theme'
import { PRESET_THEMES, validateTheme } from '@stylewx/theme'
import { renderMarkdownToHtml } from '@stylewx/core'
import { buildPalette } from '@stylewx/components'
import { serviceError } from './errors.js'
import { listThemes } from './themes.js'

export interface ThemeSwatch {
  label: string
  color: string
}

export interface ThemePreview {
  name: string
  description: string
  origin: 'preset' | 'saved'
  /** 调色板（色点）。 */
  swatches: ThemeSwatch[]
  /** 字体族与字号行距（概述）。 */
  font: string
  /** 用该主题渲染的统一示例文章 HTML。 */
  html: string
}

export interface RenderThemePreviewsOptions {
  /** 只渲染这些主题；缺省渲染全部。 */
  names?: string[]
}

const PRESET_NAMES = new Set(PRESET_THEMES.map((t) => t.name))

/** `{{primaryColor}}` 这类 token 引用 → 实际色值。 */
function resolveColor(value: string | undefined, tokens: ThemeTokens): string | undefined {
  if (!value) return undefined
  const m = /^\{\{\s*([\w.]+)\s*\}\}$/.exec(value.trim())
  if (m) {
    const path = m[1] ?? ''
    let cur: unknown = tokens
    for (const key of path.split('.')) {
      if (!cur || typeof cur !== 'object') return undefined
      cur = (cur as Record<string, unknown>)[key]
    }
    return typeof cur === 'string' ? cur : undefined
  }
  return value.trim() || undefined
}

/** 提取一组色板（利用组件层的派生规则：muted / cardBg / divider 等）。 */
export function themeSwatches(theme: Theme): ThemeSwatch[] {
  const palette = buildPalette(theme.tokens)
  const h1 = resolveColor(theme.blocks.h1?.color, theme.tokens)
  const out: ThemeSwatch[] = [
    { label: '主色', color: palette.primary },
    { label: '正文', color: palette.text },
    { label: '强调', color: palette.primarySoft },
    { label: '次要', color: palette.muted },
    { label: '卡片底', color: palette.cardBg },
    { label: '分隔线', color: palette.divider },
  ]
  if (h1 && h1 !== palette.text) out.splice(1, 0, { label: '标题', color: h1 })
  // 去重（派生色与基础色相同时保留一个）
  const seen = new Set<string>()
  return out.filter((s) => {
    const key = s.color.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * 统一主题展示文章：覆盖标题层次、段落、强调、列表、引用、表格、代码、
 * 分割线，以及几个代表组件（section-title / card / callout / quote）
 * —— 自定义主题可以带组件级样式覆盖，在这里能看到效果。
 */
export const THEME_SAMPLE_MARKDOWN = `# 一片秋叶的时间

> 排版预览 · 所有主题渲染同一份内容，对比字体、颜色与节奏。

## 一、开篇

秋天是从一片叶子开始的。先是叶缘渗出一点黄，像浸了水的宣纸，然后那黄便一寸一寸地铺开，蔓延到叶脉，直到整片叶子都亮了。

**加粗文字**、*斜体文字*、==高亮标记==、\`行内代码\`，以及[链接文字](https://example.com)。

## 二、清单

- 第一个要点：节奏要稳，标题之间留呼吸。
- 第二个要点：正文行距与字号，是阅读的底色。
- 第三个要点：引用、列表、表格各有其位。

1. 序号一：开头先立住观点。
2. 序号二：中间用事实铺陈。
3. 序号三：结尾收束回主题。

## 三、摘录

> 我们想要的不是完美，而是把一件事做完，且做得干净。

| 功能 | 说明 |
| --- | --- |
| 富组件 | 内置 22 个组件 |
| 样式覆盖 | 部位级定制 |
| 交互 | SVG + SMIL |

\`\`\`js
function hello() {
  return 'stylewx';
}
\`\`\`

---

:::section-title{index="02" title="主题对组件的影响" subtitle="THEME & COMPONENTS" align="left"}
:::
:::card{title="卡片组件" tone="primary" icon="📌"}
正文支持完整 Markdown，包括 **加粗**、*强调*、列表。
:::
:::callout{type="tip" title="小提示"}
自定义或 AI 生成的主题可以带组件级样式覆盖，这里会看到差异。
:::
:::quote{author="stylewx" source="排版宣言"}
让每一篇公众号文章，都值得被认真排版。
:::
`

/**
 * 用统一示例渲染全部（或指定）主题。
 * 单条主题渲染失败不影响其它主题（该条 html 留空并附错误说明）。
 */
export function renderThemePreviews(options: RenderThemePreviewsOptions = {}): { previews: ThemePreview[] } {
  const all = listThemes().themes
  const wanted = options.names?.length ? new Set(options.names) : undefined
  const themes = wanted ? all.filter((t) => wanted.has(t.name)) : all

  const previews: ThemePreview[] = themes.map((theme) => {
    const check = validateTheme(theme)
    if (!check.ok || !check.theme) {
      const detail = check.issues.map((i) => `${i.path}: ${i.message}`).join('；')
      throw serviceError('invalid_theme', `主题「${theme.name}」不合法：${detail}`, '请检查主题 Schema。')
    }
    const safe = check.theme
    const font = `${safe.tokens.fontFamily.split(',')[0] ?? ''} · ${safe.tokens.fontSize}/${safe.tokens.lineHeight}`
    try {
      const { html } = renderMarkdownToHtml(THEME_SAMPLE_MARKDOWN, safe)
      return {
        name: safe.name,
        description: safe.description ?? '',
        origin: PRESET_NAMES.has(safe.name) ? 'preset' : 'saved',
        swatches: themeSwatches(safe),
        font,
        html,
      }
    } catch (error) {
      return {
        name: safe.name,
        description: safe.description ?? '',
        origin: PRESET_NAMES.has(safe.name) ? 'preset' : 'saved',
        swatches: themeSwatches(safe),
        font,
        html: `<p style="color:#b91c1c">渲染失败：${error instanceof Error ? error.message : String(error)}</p>`,
      }
    }
  })

  return { previews }
}