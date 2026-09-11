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
  classifyCssProperty,
  findUnsafeCssValue,
  hasTokenReferences,
  tweakTheme,
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

  it('包含真实微信会过滤的属性(position)时失败并给出可读提示', () => {
    const bad = structuredClone(validTheme)
    ;(bad.blocks.p as Record<string, string>)['position'] = 'absolute'
    const r = validateTheme(bad)
    expect(r.ok).toBe(false)
    const issue = r.issues.find((i) => i.path.includes('position'))
    expect(issue).toBeDefined()
    expect(issue?.message).toContain('过滤')
  })

  it('灰色属性(transform)不判主题非法，但归类为 gray', () => {
    const ok = structuredClone(validTheme)
    ;(ok.blocks.h1 as Record<string, string>)['transform'] = 'rotate(3deg)'
    const r = validateTheme(ok)
    expect(r.ok).toBe(true) // 不再硬禁止
    expect(classifyCssProperty('transform')).toBe('gray')
  })

  it('!important 不再让主题非法（降级为 validator 层 warning）', () => {
    const bad = structuredClone(validTheme)
    ;(bad.blocks.h1 as Record<string, string>)['color'] = '{{primaryColor}} !important'
    const r = validateTheme(bad)
    expect(r.ok).toBe(true)
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

  it('真实微信会过滤的属性(banned)被拒绝', () => {
    for (const prop of ['position', 'filter', 'backdrop-filter']) {
      expect(isCssPropertyAllowed(prop), `${prop} 应被禁止`).toBe(false)
      expect(classifyCssProperty(prop)).toBe('banned')
    }
  })

  it('灰色属性(allow + warning)被放行', () => {
    for (const prop of ['transform', 'animation', 'float', 'box-shadow', 'transition', 'opacity', 'top', 'z-index']) {
      expect(isCssPropertyAllowed(prop), `${prop} 应可放行`).toBe(true)
      expect(classifyCssProperty(prop)).toBe('gray')
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

  it('富组件扩展 token 均为可选（老主题不受影响）', () => {
    expect(themeSchema.safeParse(validTheme).success).toBe(true)
    const withExtras = structuredClone(validTheme)
    Object.assign(withExtras.tokens as Record<string, unknown>, {
      accentColor: '#ffe8d6',
      mutedColor: '#7a7f87',
      cardBg: '#fbfcfe',
      cardBorderColor: '#dbe4f0',
      dividerColor: '#e6e9ee',
      canvasBg: '#fafafa',
      radius: '14px',
    })
    const parsed = themeSchema.safeParse(withExtras)
    expect(parsed.success).toBe(true)
    expect((parsed.data as typeof validTheme).tokens).toMatchObject({ radius: '14px', accentColor: '#ffe8d6' })
  })
})

describe('tweakTheme（确定性微调）', () => {
  it('改 token 并回传改动路径', () => {
    const r = tweakTheme(validTheme, { tokens: { primaryColor: '#ff6600', fontSize: '17px', radius: '16px' } })
    expect(r.ok).toBe(true)
    expect(r.theme?.tokens.primaryColor).toBe('#ff6600')
    expect(r.theme?.tokens.fontSize).toBe('17px')
    expect(r.theme?.tokens.radius).toBe('16px')
    expect(r.changed).toEqual(['tokens.primaryColor', 'tokens.fontSize', 'tokens.radius'])
  })

  it('可改主题名与描述', () => {
    const r = tweakTheme(validTheme, { name: 'my-variant', description: '变体' })
    expect(r.theme?.name).toBe('my-variant')
    expect(r.theme?.description).toBe('变体')
    expect(r.changed).toContain('name')
    expect(r.changed).toContain('description')
  })

  it('可覆盖 block 的 CSS 声明', () => {
    const r = tweakTheme(validTheme, { blocks: { p: { 'font-size': '17px', 'letter-spacing': '0.5px' } } })
    expect(r.ok).toBe(true)
    expect(r.theme?.blocks.p['font-size']).toBe('17px')
    expect(r.changed).toContain('blocks.p.font-size')
  })

  it('非法颜色被拒绝且不抛错', () => {
    const r = tweakTheme(validTheme, { tokens: { primaryColor: 'not-a-color' } })
    expect(r.ok).toBe(false)
    expect(r.theme).toBeUndefined()
    expect(r.issues.some((i) => i.path.includes('primaryColor'))).toBe(true)
  })

  it('微信禁止的 CSS 属性被拒绝', () => {
    const r = tweakTheme(validTheme, { blocks: { p: { position: 'absolute' } } })
    expect(r.ok).toBe(false)
    expect(r.issues.some((i) => i.message.includes('position'))).toBe(true)
  })

  it('不修改入参主题', () => {
    const before = JSON.stringify(validTheme)
    tweakTheme(validTheme, { tokens: { primaryColor: '#123456' } })
    expect(JSON.stringify(validTheme)).toBe(before)
  })

  it('空 patch 视为无改动', () => {
    const r = tweakTheme(validTheme, {})
    expect(r.ok).toBe(true)
    expect(r.changed).toEqual([])
    expect(r.theme?.name).toBe(validTheme.name)
  })
})

describe('主题的组件级样式覆盖（components）', () => {
  it('可写入并回传改动路径', () => {
    const r = tweakTheme(validTheme, { components: { card: { root: { padding: '20px' }, title: { 'font-size': '19px' } } } })
    expect(r.ok).toBe(true)
    expect(r.theme?.components?.card?.root?.padding).toBe('20px')
    expect(r.changed).toContain('components.card.root.padding')
    expect(r.changed).toContain('components.card.title.font-size')
  })

  it('传 null 可清空某组件的覆盖', () => {
    const withOverride = tweakTheme(validTheme, { components: { card: { root: { padding: '20px' } } } }).theme!
    const cleared = tweakTheme(withOverride, { components: { card: null } })
    expect(cleared.ok).toBe(true)
    expect(cleared.theme?.components?.card).toBeUndefined()
  })

  it('微信硬禁止属性被拒绝', () => {
    const r = tweakTheme(validTheme, { components: { card: { root: { position: 'absolute' } } } })
    expect(r.ok).toBe(false)
    expect(r.issues.some((i) => i.message.includes('position'))).toBe(true)
  })

  it('组件覆盖可参与主题序列化（JSON Schema 里存在 components）', () => {
    const json = themeToJsonSchema() as { properties?: Record<string, unknown> }
    expect(json.properties && 'components' in json.properties).toBe(true)
  })
})
