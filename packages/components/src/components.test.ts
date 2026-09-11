import { describe, it, expect } from 'vitest'
import { parseComponents, parseProps } from './parse.js'
import { renderDocument, renderNodes, extractHeadings, COMPONENT_NAMES } from './render.js'
import { buildPalette } from './palette.js'
import { contrastText, darken, lighten, mix, parseColor } from './color.js'
import { measureEm, truncateEm, wrapText } from './text.js'
import { COMPONENT_CATALOG, COMPONENT_SLOTS, catalogToMarkdown, getComponentSpec } from './catalog.js'
import { formatProps, htmlToMarkdown } from './reverse.js'
import type { ComponentNode, RenderContext } from './types.js'

/** 测试用的极简 Markdown 渲染器：只把 **粗体** 转成 <strong>，段落包 <p>。 */
function fakeMarkdown(md: string): string {
  return md
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, ' ')}</p>`)
    .join('')
}

function makeCtx(): RenderContext {
  const ctx: RenderContext = {
    renderMarkdown: fakeMarkdown,
    renderChildren: () => '',
    slot: (name: string) => (ctx.slotEnabled ? ' data-swx-slot="' + name + '"' : ''),
    palette: buildPalette({
      primaryColor: '#0b6bff',
      textColor: '#1f2329',
      fontSize: '15px',
      lineHeight: 1.75,
      fontFamily: 'sans-serif',
      spacing: { block: '16px' },
    }),
    headings: [],
    diagnostics: [],
  }
  ctx.renderChildren = (node: ComponentNode) => renderNodes(node.children, ctx)
  return ctx
}

function render(md: string, ctx = makeCtx()): string {
  return renderDocument(md, ctx)
}

describe('parseProps', () => {
  it('解析键值、引号与无值参数', () => {
    expect(parseProps('title="核心 结论" tone=primary flag')).toEqual({
      title: '核心 结论',
      tone: 'primary',
      flag: 'true',
    })
    expect(parseProps("a='单引号' b=1")).toEqual({ a: '单引号', b: '1' })
    expect(parseProps(undefined)).toEqual({})
  })
})

describe('parseComponents', () => {
  it('解析单个组件与正文', () => {
    const nodes = parseComponents(':::card{title="A"}\n正文\n:::')
    expect(nodes).toHaveLength(1)
    const node = nodes[0] as ComponentNode
    expect(node.name).toBe('card')
    expect(node.props.title).toBe('A')
    expect(node.body).toBe('正文')
  })

  it('支持嵌套：外层用更多冒号', () => {
    const md = '::::canvas{tone="paper"}\n:::card{title="内层"}\nx\n:::\n::::'
    const nodes = parseComponents(md)
    const canvas = nodes[0] as ComponentNode
    expect(canvas.name).toBe('canvas')
    const inner = canvas.children.find((c) => c.type === 'component') as ComponentNode
    expect(inner.name).toBe('card')
    expect(inner.props.title).toBe('内层')
  })

  it('保留组件前后的 Markdown 文本', () => {
    const nodes = parseComponents('# 标题\n\n:::divider\n:::\n\n结尾')
    expect(nodes.map((n) => n.type)).toEqual(['markdown', 'component', 'markdown'])
  })

  it('代码围栏内的 ::: 不被解析', () => {
    const nodes = parseComponents('```\n:::card\n```')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('markdown')
  })

  it('未闭合组件自动闭合（对 LLM 输出容错）', () => {
    const nodes = parseComponents(':::card{title="A"}\n正文')
    expect((nodes[0] as ComponentNode).name).toBe('card')
    expect((nodes[0] as ComponentNode).body).toBe('正文')
  })

  it('callout 别名支持「:::warning 标题」尾随写法', () => {
    const node = parseComponents(':::warning 小心\n内容\n:::')[0] as ComponentNode
    expect(node.name).toBe('warning')
    expect(node.props.title).toBe('小心')
  })

  it('非 callout 组件的尾随文本不当作开启，避免吞掉后续内容', () => {
    const md = ':::badge{text="a"}:::badge{text="b"}\n\n后续段落'
    const nodes = parseComponents(md)
    expect(nodes.every((n) => n.type === 'markdown')).toBe(true)
  })
})

describe('组件渲染', () => {
  it('card 渲染标题与正文，且不依赖 class', () => {
    const html = render(':::card{title="核心"}\n正文\n:::')
    expect(html).toContain('核心')
    expect(html).toContain('<p>正文</p>')
    expect(html).not.toContain('class=')
  })

  it('gallery 解析 Markdown 图片为网格', () => {
    const html = render(':::gallery{cols="2"}\n![图一](https://x/a.jpg)\n![图二](https://x/b.jpg)\n:::')
    expect(html).toContain('https://x/a.jpg')
    expect(html).toContain('https://x/b.jpg')
    expect(html).toContain('flex-wrap:wrap')
  })

  it('carousel 生成 SVG 轮播且使用 SMIL（无 id 引用）', () => {
    const html = render(':::carousel{height="200"}\n![a](https://x/a.jpg)\n![b](https://x/b.jpg)\n:::')
    expect(html).toContain('<svg')
    expect(html).toContain('<animate')
    expect(html).toContain('repeatCount="indefinite"')
    expect(html).not.toContain('url(#')
    expect(html).not.toMatch(/\sid=/)
  })

  it('reveal 使用 begin="click" 实现点击展开', () => {
    const html = render(':::reveal{label="点我"}\n答案内容\n:::')
    expect(html).toContain('begin="click"')
    expect(html).toContain('点我')
    expect(html).toContain('答案内容')
  })

  it('progress 用 SMIL 动画生长宽度', () => {
    const html = render(':::progress{value="80" label="完成度"}\n:::')
    expect(html).toContain('attributeName="width"')
    expect(html).toContain('完成度')
    expect(html).toContain('80%')
  })

  it('timeline 解析「时间 | 内容」行', () => {
    const html = render(':::timeline{title="历程"}\n- 2023 | 启动\n- 2024 | 上线\n:::')
    expect(html).toContain('2023')
    expect(html).toContain('启动')
    expect(html).toContain('2024')
  })

  it('compare 把两列表格渲染成两栏卡片', () => {
    const html = render(':::compare{layout="stack"}\n| 旧 | 新 |\n| --- | --- |\n| A | B |\n:::')
    expect(html).toContain('旧')
    expect(html).toContain('新')
    expect(html).not.toContain('<table>')
  })

  it('toc 使用注入的标题列表且不含 # 锚点链接', () => {
    const ctx = makeCtx()
    ctx.headings = [
      { level: 1, text: '大标题' },
      { level: 2, text: '第一节' },
      { level: 2, text: '第二节' },
    ]
    const html = render(':::toc{title="目录"}\n:::', ctx)
    expect(html).toContain('第一节')
    expect(html).toContain('第二节')
    expect(html).not.toContain('大标题')
    expect(html).not.toContain('href="#')
  })

  it('canvas 渲染嵌套组件（回归：容器不能吞掉子组件）', () => {
    const html = render('::::canvas{tone="paper"}\n:::card{title="内层"}\n正文\n:::\n::::')
    expect(html).toContain('内层')
    expect(html).toContain('<p>正文</p>')
  })

  it('cover / end-card / divider / badge / callout / quote / image-card 均产出内容', () => {
    expect(render(':::cover{title="封面标题"}\n:::')).toContain('封面标题')
    expect(render(':::end-card{title="感谢阅读"}\n:::')).toContain('感谢阅读')
    expect(render(':::divider{style="wave"}\n:::')).toContain('<svg')
    expect(render(':::badge{text="新"}\n:::')).toContain('新')
    expect(render(':::callout{type="tip" title="提示"}\n内容\n:::')).toContain('提示')
    expect(render(':::quote{author="某人"}\n引用\n:::')).toContain('某人')
    expect(render(':::image-card{src="https://x/a.jpg" title="卡片"}\n:::')).toContain('卡片')
    expect(render(':::draw{shape="check"}\n:::')).toContain('stroke-dashoffset')
    expect(render(':::background{tone="primary"}\n内容\n:::')).toContain('内容')
  })

  it('未知组件降级为 Markdown 并给出诊断', () => {
    const ctx = makeCtx()
    const html = render(':::not-a-component\n正文\n:::', ctx)
    expect(html).toContain('正文')
    expect(ctx.diagnostics[0]?.component).toBe('not-a-component')
  })

  it('自包含组件被写入正文时给出诊断', () => {
    const ctx = makeCtx()
    render(':::badge{text="x"}\n这段不该出现\n:::', ctx)
    expect(ctx.diagnostics.some((d) => d.component === 'badge')).toBe(true)
  })
})


describe('HTML → Markdown 反向导入', () => {
  it('渲染结果带机器可读标记（data-swx / data-swx-props）', () => {
    const html = render(':::card{title="标题" tone=primary}\n正文\n:::')
    expect(html).toContain('data-swx="card"')
    expect(html).toContain('data-swx-props="title=')
    expect(html).toContain('data-swx-body="1"')
  })

  it('结构化正文的组件把原始正文存进 data-swx-src', () => {
    const html = render(':::timeline{title="历程"}\n- 2023 | 启动\n:::')
    expect(html).toContain('data-swx-src=')
    const back = htmlToMarkdown(html)
    expect(back.markdown).toContain(':::timeline{title="历程"}')
    expect(back.markdown).toContain('- 2023 | 启动')
  })

  it('容器组件的 Markdown 正文从 DOM 还原', () => {
    const html = render(':::card{title="标题"}\n正文 **加粗**\n\n- 一\n- 二\n:::')
    const back = htmlToMarkdown(html)
    expect(back.markdown).toContain(':::card{title="标题"}')
    expect(back.markdown).toContain('**加粗**')
    expect(back.markdown).toContain('- 一')
    expect(back.components[0]).toMatchObject({ name: 'card', bodyFrom: 'markdown' })
  })

  it('嵌套组件（canvas > card）能递归还原', () => {
    const html = render('::::canvas{tone="paper"}\n:::card{title="内层"}\n正文\n:::\n::::')
    const back = htmlToMarkdown(html)
    expect(back.markdown).toContain('::::canvas{tone=paper}')
    expect(back.markdown).toContain(':::card{title="内层"}')
    expect(back.components.map((c) => c.name)).toEqual(['canvas', 'card'])
  })

  it('无标记的 HTML 退化为普通 Markdown（不丢内容）', () => {
    const back = htmlToMarkdown('<h1>标题</h1><p>段落 <strong>粗</strong></p><ul><li>项</li></ul>')
    expect(back.markdown).toContain('# 标题')
    expect(back.markdown).toContain('**粗**')
    expect(back.markdown).toContain('- 项')
    expect(back.components).toEqual([])
  })

  it('标题优先取 h1，其次回退到 cover 的 title', () => {
    expect(htmlToMarkdown('<h1>正文标题</h1>').title).toBe('正文标题')
    const cover = render(':::cover{title="封面标题"}\n:::')
    expect(htmlToMarkdown(cover).title).toBe('封面标题')
  })

  it('props 格式化：布尔值省略等号，含空格的值加引号', () => {
    expect(formatProps({ outline: 'true', tone: 'primary', title: '有 空格' })).toBe(
      '{outline tone=primary title="有 空格"}',
    )
    expect(formatProps({})).toBe('')
  })

  it('图片 / 表格 / 代码块能还原为 Markdown', () => {
    const md = htmlToMarkdown(
      '<p><img src="https://x/a.jpg" alt="图" /></p><table><thead><tr><th>列A</th><th>列B</th></tr></thead>' +
        '<tbody><tr><td>1</td><td>2</td></tr></tbody></table><pre><code>const a = 1</code></pre>',
    ).markdown
    expect(md).toContain('![图](https://x/a.jpg)')
    expect(md).toContain('| 列A | 列B |')
    expect(md).toContain('```')
    expect(md).toContain('const a = 1')
  })
})
describe('extractHeadings', () => {
  it('提取标题并跳过代码围栏', () => {
    const h = extractHeadings('# 一\n\n```\n# 不是标题\n```\n\n## 二\n')
    expect(h).toEqual([
      { level: 1, text: '一' },
      { level: 2, text: '二' },
    ])
  })
})

describe('颜色工具', () => {
  it('解析与转换', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseColor('#0b6bff')?.b).toBe(255)
    expect(parseColor('rgb(1,2,3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 })
    expect(parseColor('not-a-color')).toBeNull()
  })
  it('混合 / 变亮 / 变暗 / 对比色', () => {
    expect(lighten('#000000', 1)).toBe('#ffffff')
    expect(darken('#ffffff', 1)).toBe('#000000')
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(contrastText('#ffffff')).toBe('#1a1a1a')
    expect(contrastText('#000000')).toBe('#ffffff')
  })
})

describe('文本折行', () => {
  it('CJK 按 1em 计算并按宽度折行', () => {
    expect(measureEm('中文')).toBe(2)
    expect(measureEm('ab')).toBeCloseTo(1.1, 5)
    const lines = wrapText('这是一段很长的中文需要折行', 5)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join('')).toBe('这是一段很长的中文需要折行')
  })
  it('超长文本截断加省略号', () => {
    expect(truncateEm('这是一个很长的标题', 4)).toMatch(/…$/)
  })
})

describe('组件目录', () => {
  it('目录覆盖全部已注册组件', () => {
    const catalogNames = COMPONENT_CATALOG.map((c) => c.name)
    for (const name of COMPONENT_NAMES) {
      expect(catalogNames, `目录缺少组件 ${name}`).toContain(name)
    }
  })
  it('每个组件都有示例且示例能被解析为该组件', () => {
    for (const spec of COMPONENT_CATALOG) {
      const nodes = parseComponents(spec.example)
      const component = nodes.find((n) => n.type === 'component') as ComponentNode | undefined
      expect(component, `${spec.name} 的示例无法解析`).toBeDefined()
      expect(component?.name).toBe(spec.name)
    }
  })
  it('catalogToMarkdown 输出含语法示例', () => {
    const md = catalogToMarkdown()
    expect(md).toContain(':::carousel')
    expect(md).toContain('### 图片')
    expect(getComponentSpec('card')?.summary).toContain('卡片')
  })
})

describe('组件样式覆盖（root / * / 语义槽位）', () => {
  // 每个组件一份「把所有部位都写出来」的样本，确保登记表里的槽位都真的可达
  const SLOT_SAMPLES: Record<string, string> = {
    card: ':::card{title="标题" icon="★" footer="页脚"}\n正文\n:::',
    callout: ':::callout{type="tip" title="标题"}\n正文\n:::',
    quote: ':::quote{author="作者" source="出处"}\n正文\n:::',
    'section-title': ':::section-title{index="01" title="标题" subtitle="副标题"}\n:::',
    image: ':::image{src="https://x/a.jpg" caption="图注"}\n:::',
    'end-card': ':::end-card{title="标题" footer="页脚"}\n正文\n:::',
    follow: ':::follow{title="标题" footer="页脚"}\n正文\n:::',
  }

  it('登记表里的每个组件都有覆盖全部部位的测试样本（防止漏测）', () => {
    for (const name of Object.keys(COMPONENT_SLOTS)) {
      expect(SLOT_SAMPLES[name], `COMPONENT_SLOTS.${name} 缺少样本`).toBeDefined()
    }
  })

  it('声明了槽位的组件，每个槽位都能被真实命中', () => {
    for (const [name, slots] of Object.entries(COMPONENT_SLOTS)) {
      for (const slotName of slots) {
        if (slotName === 'root' || slotName === '*') continue
        const ctx = makeCtx()
        ctx.componentStyles = { [name]: { [slotName]: { 'letter-spacing': '7px' } } }
        const html = render(SLOT_SAMPLES[name] ?? '', ctx)
        expect(html, `${name}.${slotName} 未命中（登记表与实现漂移）`).toContain('letter-spacing:7px')
      }
    }
  })

  it('root 覆盖组件最外层，* 覆盖内部所有元素', () => {
    const ctx = makeCtx()
    ctx.componentStyles = { card: { root: { padding: '20px' }, '*': { 'line-height': '1.95' } } }
    const html = render(':::card{title="标题"}\n正文\n:::', ctx)
    expect(html).toContain('padding:20px')
    expect(html).toContain('line-height:1.95')
  })

  it('实例级 style 优先级高于主题覆盖，只作用于根元素', () => {
    const ctx = makeCtx()
    ctx.componentStyles = { card: { root: { padding: '20px', 'margin-top': '0' } } }
    const html = render(':::card{title="标题" style="padding:4px"}\n正文\n:::', ctx)
    expect(html).toContain('padding:4px')
    expect(html).not.toContain('padding:20px')
    expect(html).toContain('margin-top:0')
  })

  it('没有覆盖时不产出任何 slot 标记，输出与之前一致', () => {
    const html = render(':::card{title="标题"}\n正文\n:::', makeCtx())
    expect(html).not.toContain('data-swx-slot')
  })

  it('写错槽位时给出诊断', () => {
    const ctx = makeCtx()
    ctx.componentStyles = { card: { nosuchslot: { color: '#f00' } } }
    render(':::card{title="标题"}\n正文\n:::', ctx)
    expect(ctx.diagnostics.some((d) => d.message.includes('nosuchslot'))).toBe(true)
  })
})
