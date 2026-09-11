import { describe, it, expect } from 'vitest'
import { renderThemePreviews, themeSwatches, THEME_SAMPLE_MARKDOWN } from './index.js'
import { PRESET_THEMES, getPresetTheme } from '@stylewx/theme'

describe('themeSwatches', () => {
  it('主色与正文色来自 tokens，标题色带 token 引用时解析为实际色值', () => {
    const theme = getPresetTheme('magazine')
    expect(theme).toBeTruthy()
    const sw = themeSwatches(theme!)
    expect(sw.length).toBeGreaterThanOrEqual(4)
    expect(sw[0]?.color).toBe(theme!.tokens.primaryColor)
    expect(sw[1]?.color).toBe(theme!.tokens.textColor)
  })

  it('派生色（次要/卡片底/分隔线）始终返回可用色值', () => {
    const base = getPresetTheme('business')!
    const theme = structuredClone(base)
    // 故意去掉可选 token，验证派生规则兜底
    delete theme.tokens.accentColor
    delete theme.tokens.mutedColor
    delete theme.tokens.cardBg
    for (const s of themeSwatches(theme)) {
      expect(s.color).toMatch(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
    }
  })
})

describe('renderThemePreviews', () => {
  it('覆盖全部预置主题，统一示例含排版与组件', () => {
    const { previews } = renderThemePreviews()
    // 至少包含全部预置主题
    for (const name of PRESET_THEMES.map((t) => t.name)) {
      expect(previews.some((p) => p.name === name)).toBe(true)
    }
    const sample = previews[0]!
    expect(sample.html.length).toBeGreaterThan(1000)
    expect(sample.html).toContain('data-swx') // 组件标记
    expect(sample.origin).toMatch(/^(preset|saved)$/)
    expect(sample.font).toContain('·')
  })

  it('names 过滤只渲染指定主题', () => {
    const { previews } = renderThemePreviews({ names: ['magazine', 'dark-code'] })
    expect(previews.map((p) => p.name).sort()).toEqual(['dark-code', 'magazine'])
  })

  it('示例文章覆盖排版要素（不抛错即渲染成功）', () => {
    expect(THEME_SAMPLE_MARKDOWN).toContain('## ')
    expect(THEME_SAMPLE_MARKDOWN).toContain('> ')
    expect(THEME_SAMPLE_MARKDOWN).toContain('| ')
    expect(THEME_SAMPLE_MARKDOWN).toContain('```')
    expect(THEME_SAMPLE_MARKDOWN).toContain(':::' )
  })
})