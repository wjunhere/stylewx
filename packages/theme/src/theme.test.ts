import { describe, it, expect } from 'vitest'
import {
  compileThemeToCss,
  compileRootBaseStyle,
  getPresetTheme,
  PRESET_THEMES,
  resolveTokenReferences,
  validateTheme,
  themeToJsonSchema,
  themeSchema,
  isCssPropertyAllowed,
  findUnsafeCssValue,
  hasTokenReferences,
} from './index.js'
import type { Theme } from './index.js'

const validTheme: Theme = {
  name: 'test-theme',
  description: '用于测试的主题',
  tokens: {
    primaryColor: '#0b6bff',
    textColor: '#1f2329',
    fontSize: '15px',
    lineHeight: 1.75,
    fontFamily: 'sans-serif',
    spacing: { block: '16px' },
  },
  blocks: {
    h1: { color: '{{primaryColor}}', 'font-size': '1.6em', margin: '0 0 {{spacing.block}}' },
    h2: {},
    h3: {},
    p: { color: '{{textColor}}', 'font-size': '{{fontSize}}', 'line-height': '{{lineHeight}}' },
    blockquote: { 'border-left': '4px solid {{primaryColor}}' },
    ul: {},
    ol: {},
    li: {},
    code: { 'background-color': '#f2f2f2' },
    pre: { 'background-color': '#f6f8fa' },
    img: { 'max-width': '100%' },
    figcaption: {},
    hr: { 'border-top': '1px solid #ccc' },
    a: { color: '{{primaryColor}}' },
    strong: { 'font-weight': '600' },
  },
}

describe('preset themes', () => {
  it('至少提供 6 套预置主题，且每套都通过 schema 校验', () => {
    expect(PRESET_THEMES.length).toBeGreaterThanOrEqual(6)
    for (const theme of PRESET_THEMES) {
      const result = validateTheme(theme)
      expect(result.ok, `主题 ${theme.name} 应通过校验：${JSON.stringify(result.issues)}`).toBe(true)
      expect(theme.description.length).toBeGreaterThan(10)
    }
  })

  it('每套主题应包含全部 16 个 block', () => {
    const names = [
      'h1', 'h2', 'h3', 'p', 'blockquote', 'ul', 'ol', 'li',
      'code', 'pre', 'img', 'figcaption', 'hr', 'a', 'strong',
    ] as const
    for (const theme of PRESET_THEMES) {
      for (const n of names) expect(theme.blocks[n], `${theme.name} 缺 block ${n}`).toBeDefined()
    }
  })

  it('可通过名字查找预置主题', () => {
    expect(getPresetTheme('tech-minimal')?.name).toBe('tech-minimal')
    expect(getPresetTheme('not-exist')).toBeUndefined()
  })
})

describe('validateTheme', () => {
  it('合法主题通过', () => {
    const r = validateTheme(validTheme)
    expect(r.ok).toBe(true)
    expect(r.issues).toEqual([])
  })

  it('包含微信不兼容属性时失败并给出可读提示', () => {
    const bad = structuredClone(validTheme)
    ;(bad.blocks.p as Record<string, string>)['position'] = 'absolute'
    const r = validateTheme(bad)
    expect(r.ok).toBe(false)
    const issue = r.issues.find((i) => i.path.includes('position'))
    expect(issue).toBeDefined()
    expect(issue?.message).toContain('白名单')
  })

  it('包含 !important 时失败', () => {
    const bad = structuredClone(validTheme)
    ;(bad.blocks.h1 as Record<string, string>)['color'] = '{{primaryColor}} !important'
    const r = validateTheme(bad)
    expect(r.ok).toBe(false)
    expect(r.issues.some((i) => i.message.includes('!important'))).toBe(true)
  })
})

describe('themeToJsonSchema', () => {
  it('导出合法 JSON Schema，包含 name/description/tokens/blocks', () => {
    const schema = themeToJsonSchema()
    expect(schema.type).toBe('object')
    const props = (schema as Record<string, any>).properties as Record<string, any>
    expect(props).toHaveProperty('name')
    expect(props).toHaveProperty('description')
    expect(props).toHaveProperty('tokens')
    expect(props).toHaveProperty('blocks')
  })
})

describe('compileThemeToCss', () => {
  it('能解析 token 引用，输出中不残留 {{ }}', () => {
    const css = compileThemeToCss(validTheme)
    expect(css).not.toContain('{{')
    expect(css).toContain('h1')
    expect(css).toContain('#0b6bff')
    expect(css).toContain('line-height: 1.75')
  })

  it('root base style 包含继承默认值', () => {
    const base = compileRootBaseStyle(validTheme)
    expect(base).toContain('font-family: sans-serif')
    expect(base).toContain('font-size: 15px')
    expect(base).toContain('color: #1f2329')
    expect(base).toContain('line-height: 1.75')
  })
})

describe('token 系统', () => {
  it('解析 token 引用', () => {
    expect(resolveTokenReferences('0 0 {{spacing.block}}', validTheme.tokens)).toBe('0 0 16px')
    expect(resolveTokenReferences('{{rowColor}}', validTheme.tokens)).toBe('')
  })

  it('检测 token 引用存在', () => {
    expect(hasTokenReferences('{{primaryColor}}')).toBe(true)
    expect(hasTokenReferences('#0b6bff')).toBe(false)
  })
})

describe('CSS 白名单', () => {
  it('白名单允许安全属性', () => {
    expect(isCssPropertyAllowed('color')).toBe(true)
    expect(isCssPropertyAllowed('font-size')).toBe(true)
    expect(isCssPropertyAllowed('margin')).toBe(true)
    expect(isCssPropertyAllowed('border-radius')).toBe(true)
  })

  it('黑名单属性被拒绝', () => {
    for (const prop of ['position', 'transform', 'animation', 'float', 'box-shadow', 'transition']) {
      expect(isCssPropertyAllowed(prop), `${prop} 应在黑名单`).toBe(false)
    }
  })

  it('拒绝通配符与 CSS 变量定义', () => {
    expect(isCssPropertyAllowed('*')).toBe(false)
    expect(isCssPropertyAllowed('--bg')).toBe(false)
  })

  it('findUnsafeCssValue 识别外部 url()', () => {
    expect(findUnsafeCssValue('url(https://evil.com/a.png)')).not.toBeNull()
    expect(findUnsafeCssValue('url(data:image/png;base64,xxx)')).toBeNull()
    expect(findUnsafeCssValue('red')).toBeNull()
  })
})

describe('themeSchema 类型解析', () => {
  it('lineHeight 越界被拒绝', () => {
    const bad = structuredClone(validTheme)
    ;(bad.tokens as { lineHeight: number }).lineHeight = 5
    expect(themeSchema.safeParse(bad).success).toBe(false)
  })

  it('无效颜色被拒绝', () => {
    const bad = structuredClone(validTheme)
    ;(bad.tokens as { primaryColor: string }).primaryColor = 'not-a-color'
    expect(themeSchema.safeParse(bad).success).toBe(false)
  })
})
