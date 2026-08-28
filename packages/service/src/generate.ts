/**
 * AI 主题生成：LLM 结构化输出主题 JSON → zod + 白名单校验 → 失败自动修复（最多 2 次重试）
 * → 仍失败则降级返回最接近的预置主题并标记 fallback: true。
 * 生成成功后自动渲染一篇内置示例文章并截图。
 */
import { z } from 'zod'
import {
  themeToJsonSchema,
  validateTheme,
  getPresetTheme,
  PRESET_THEMES,
} from '@mp-style/theme'
import type { Theme } from '@mp-style/theme'
import { analyzeArticle } from './analyze.js'
import { renderPreview } from './render.js'
import type { LlmClient, LlmMessage } from './llm.js'

export interface GenerateThemeParams {
  /** 文章全文（可选）。提供时会先让模型做一次内容分析。 */
  article?: string
  /** 风格描述 / 设计需求（可选）。 */
  prompt?: string
  /** 基础主题名（在预置主题基础上微调）。 */
  baseTheme?: string
}

export interface GenerateThemeResult {
  theme: Theme
  /** 是否因多次修复失败而降级到预置主题。 */
  fallback: boolean
  /** 尝试次数（含最终成功的那次）。 */
  repairAttempts: number
  /** 生成失败时的修复建议（fallback=true 时有用）。 */
  errorDetail?: string
  /** 内容分析结论（提供 article 时返回）。 */
  analysis?: {
    contentType: string
    tone: string
    industry: string
    designDirection: string
    text: string
  }
  /** 用该主题渲染内置示例文章的截图（若已安装 Chromium）。 */
  previewPng?: Buffer
}

const MAX_REPAIRS = 2

export const SAMPLE_ARTICLE = `# 示例文章

## 一、背景

在内容创作中，排版往往被低估。好的排版能**显著提升**阅读体验，也能让品牌更有辨识度。

> 这只是一个用于验证主题效果的示例段落。

## 二、核心要点

- 一致性：全局统一字号、行距与配色
- 克制：装饰元素宁缺毋滥
- 可读：在手机上，线条与留白胜过炫技

## 三、代码示例

\`\`\`ts
export function hello(name: string): string {
  return \`Hello, \${name}\`
}
\`\`\`

![示例配图](https://mmbiz.qpic.cn/sz_mmbiz_png/placeholder/0?wx_fmt=png)

---

结尾示例文字。
`

const contentAnalysisSchema = z.object({
  contentType: z.enum(['tech', 'business', 'literary', 'government', 'academic', 'general']),
  tone: z.string(),
  industry: z.string(),
  designDirection: z.string(),
})

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m?.[1]) return null
  const v = m[1]
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ]
}

function colorDistance(a: string, b: string): number {
  const ra = hexToRgb(a)
  const rb = hexToRgb(b)
  if (!ra || !rb) return Number.MAX_SAFE_INTEGER
  return Math.sqrt((ra[0]! - rb[0]!) ** 2 + (ra[1]! - rb[1]!) ** 2 + (ra[2]! - rb[2]!) ** 2)
}

/** 选择与「目标主色」最接近的预置主题；无法比较时回退到首选。 */
function closestPresetTheme(targetColor?: string): Theme {
  if (targetColor) {
    let best: Theme = PRESET_THEMES[0]!
    let bestDist = Number.MAX_SAFE_INTEGER
    for (const theme of PRESET_THEMES) {
      const dist = colorDistance(theme.tokens.primaryColor, targetColor)
      if (dist < bestDist) {
        bestDist = dist
        best = theme
      }
    }
    return best
  }
  return PRESET_THEMES[0]!
}

function buildThemeSystemPrompt(baseTheme?: string): string {
  const baseNotes = baseTheme
    ? `请以预置主题「${baseTheme}」为基础进行微调，保持其整体气质，但可调整配色与细节。\n`
    : ''
  return `你是资深的公众号排版设计专家。请根据用户需求，输出一个「主题 JSON」。
主题 JSON 必须严格符合给定的 JSON Schema。
硬性约束：
1. tokens 必须提供 primaryColor(十六进制)、textColor、fontSize(如 15px)、lineHeight(数字 0.8~4)、fontFamily、spacing.block。
2. blocks 包含 h1,h2,h3,p,blockquote,ul,ol,li,code,pre,img,figcaption,hr,a,strong 十六个对象；每个对象的键是 CSS 属性。
3. 所有 CSS 属性必须在微信白名单内（禁止 position/transform/animation/transition/float/box-shadow/伪类/外部字体等，这些微信会过滤）。
4. 值可以用 {{primaryColor}}、{{textColor}}、{{fontSize}}、{{spacing.block}}、{{lineHeight}} 等 token 引用。
5. description 请用中文写清楚风格与适用场景（供 Agent 选择时阅读），不要太短。
6. 只输出 JSON 本身，不要输出任何多余文字或代码块标记。
${baseNotes}`
}

function themePromptForAttempt(instructions: string, fixNotes?: string): string {
  const user = fixNotes
    ? `${instructions}\n\n上一版主题未通过校验，请修复以下问题后再输出完整主题 JSON（只输出 JSON，不要解释）：\n${fixNotes}`
    : instructions
  return user
}

export async function generateTheme(
  params: GenerateThemeParams,
  llm: LlmClient,
): Promise<GenerateThemeResult> {
  const instructions = params.prompt?.trim() || params.article?.trim() || '生成一款简洁大方、适合公众号的文章主题。'

  // 若提供全文，先让模型做内容分析（结论随响应返回）
  let analysis: GenerateThemeResult['analysis']
  let analysisText = ''
  if (params.article && params.article.trim()) {
    const heuristic = analyzeArticle(params.article)
    analysisText = heuristic.analysisText
    try {
      const raw = await llm.completeJson(
        [
          { role: 'system', content: '你是内容分析助手。请分析下面文章的类型、情绪基调、所属行业，并给出排版设计方向建议（用中文，简洁）。' },
          { role: 'user', content: params.article.slice(0, 6000) },
        ],
        {
          schema: z.toJSONSchema(contentAnalysisSchema),
          name: 'content_analysis',
          temperature: 0.3,
          maxTokens: 500,
        },
      )
      const parsed = contentAnalysisSchema.parse(raw)
      analysis = {
        contentType: parsed.contentType,
        tone: parsed.tone,
        industry: parsed.industry,
        designDirection: parsed.designDirection,
        text:
          `内容类型：${parsed.contentType}；基调：${parsed.tone}；行业：${parsed.industry}；` +
          `排版方向：${parsed.designDirection}\n` +
          `（启发式分析：${heuristic.analysisText}）`,
      }
    } catch {
      // LLM 分析失败则回退到启发式结论
      analysis = {
        contentType: heuristic.content.type,
        tone: heuristic.content.tone,
        industry: '',
        designDirection: heuristic.suggestedTheme.reason,
        text: heuristic.analysisText,
      }
    }
  }

  const scheme = themeToJsonSchema()
  // 预置主题作为参考，给模型更稳定的起点
  const base = params.baseTheme ? getPresetTheme(params.baseTheme) : undefined

  const genInstructions =
    `${instructions}\n` +
    (params.article && params.article.trim() ? `\n文章全文（节选）：\n${params.article.slice(0, 6000)}\n` : '') +
    (analysis ? `\n内容分析结论：\n${analysis.text}\n` : '') +
    (base ? `\n基础主题 tokens 参考：${JSON.stringify(base.tokens)}\n` : '')

  const messages: LlmMessage[] = [
    { role: 'system', content: buildThemeSystemPrompt(params.baseTheme) },
    { role: 'user', content: themePromptForAttempt(genInstructions) },
  ]

  let theme: Theme | null = null
  let errorDetail = ''
  let repairAttempts = 0
  let lastTargetColor: string | undefined

  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt += 1) {
    try {
      const raw = await llm.completeJson(messages, {
        schema: scheme,
        name: 'mp_style_theme',
        temperature: 0.5,
        maxTokens: 1400,
      })
      const candidate = assignThemeDefaults(raw as Partial<Theme>)
      lastTargetColor = candidate.tokens?.primaryColor
      const validation = validateTheme(candidate)
      if (validation.ok && validation.theme) {
        theme = validation.theme
        repairAttempts = attempt + 1
        break
      }
      // 失败 → 收集修复建议，回传给模型再试
      const issues = validation.issues
        .map((i) => `- ${i.path}: ${i.message}`)
        .join('\n')
      errorDetail = issues
      messages.push({
        role: 'assistant',
        content: '（上一版本无效主题）',
      })
      messages.push({
        role: 'user',
        content: themePromptForAttempt(genInstructions, `请修复：\n${issues}`),
      })
    } catch (error) {
      errorDetail = error instanceof Error ? error.message : String(error)
      messages.push({
        role: 'user',
        content: themePromptForAttempt(genInstructions, `请重新输出一个完整、合法且完全符合 Schema 的主题 JSON。`),
      })
    }
  }

  let fallback = false
  if (!theme) {
    fallback = true
    repairAttempts = MAX_REPAIRS + 1
    theme = closestPresetTheme(lastTargetColor)
  }

  // 自动渲染内置示例文章并截图（截图失败不致命）
  let previewPng: Buffer | undefined
  try {
    const preview = await renderPreview(SAMPLE_ARTICLE, theme, { includeScreenshot: true })
    previewPng = preview.screenshotPng
  } catch {
    // ignore
  }

  return {
    theme,
    fallback,
    repairAttempts,
    errorDetail: fallback ? errorDetail || '主题生成多次失败，已降级为预置主题。' : undefined,
    analysis,
    previewPng,
  }
}

/** 为 LLM 可能缺省的字段补上合理默认值，提高首次通过率。 */
function assignThemeDefaults(raw: Partial<Theme>): Theme {
  const fallbackTheme = PRESET_THEMES[0]!
  const tokens = raw.tokens ?? fallbackTheme.tokens
  const blocks = raw.blocks ?? fallbackTheme.blocks
  return {
    name: raw.name ?? '自定义主题',
    description: raw.description ?? 'AI 生成的主题。',
    tokens,
    blocks,
  }
}
