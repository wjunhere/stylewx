import { describe, it, expect } from 'vitest'
import {
  markdownToHtml,
  renderMarkdownToHtml,
  countWords,
  estimateReadingMinutes,
  preprocessSuperSub,
} from './index.js'
import { getPresetTheme, compileThemeToCss, unquoteFontFamily } from '@stylewx/theme'
import { validateHtml } from '@stylewx/validator'
import { htmlToMarkdown } from '@stylewx/components'
import type { Theme } from '@stylewx/theme'

const theme = getPresetTheme('tech-minimal') as Theme

const sampleMarkdown = `# 科技极简示例

## 标题二

这是一段普通正文，包含 **加粗**、*斜体* 以及 [一个链接](https://example.com)。

> 这是一段引用文字。

- 列表项一
- 列表项二
  - 嵌套项

1. 有序一
2. 有序二

\`\`\`js
const x = 1
console.log(x)
\`\`\`

| 列A | 列B |
| --- | --- |
| 1 | 2 |

![示例图](https://mmbiz.qpic.cn/example.png)

---

结尾段落。
`

describe('markdownToHtml', () => {
  it('把 Markdown 转成 HTML，保留 GFM 语法', () => {
    const html = markdownToHtml('# Hello\n\n- a\n- b\n\n| x | y |\n| - | - |\n| 1 | 2 |')
    expect(html).toContain('<h1>')
    expect(html).toContain('<li>')
    expect(html).toContain('<table>')
    expect(html).toContain('<td')
  })

  it('允许内嵌 HTML（交由 validator 负责安全校验）', () => {
    const html = markdownToHtml('text <script>alert(1)</script>')
    expect(html).toContain('<script>alert(1)</script>')
  })

  it('容错：`##无空格` 也识别为标题（CommonMark 需空格，这里 lenient）', () => {
    expect(markdownToHtml('##照相')).toContain('<h2>')
    expect(markdownToHtml('##照相')).toContain('照相')
    // 已有空格 / 纯 # 不受影响
    expect(markdownToHtml('## 正常')).toContain('<h2>')
    const h6 = markdownToHtml('######深标题')
    expect(h6).toContain('<h6>')
  })

  it('上标 ^x^ 与下标 ~x~，且不动 ~~删除线~~ 与代码', () => {
    const out = preprocessSuperSub('上标 x^2^、下标 H~2~O、删除 ~~x~~、代码 `a^b^c`')
    expect(out).toContain('<sup>2</sup>')
    expect(out).toContain('<sub>2</sub>')
    expect(out).toContain('~~x~~')
    expect(out).toContain('`a^b^c`')
  })

  it(':::type 标题 … ::: 渲染为带内联样式的警告框，内容仍走 Markdown', () => {
    const html = markdownToHtml(':::warning 警告内容\n**别这样做**。\n:::')
    expect(html).toContain('border-left:4px solid')
    expect(html).toContain('警告内容')
    expect(html).toContain('<strong>别这样做</strong>')
  })

  it('代码围栏内的 `##` 行不被误判为标题', () => {
    const md = '```\n##not-a-heading\n```'
    const html = markdownToHtml(md)
    expect(html).not.toContain('<h2>')
    expect(html).toContain('##not-a-heading')
  })
})

describe('decorations（伪元素装饰的真实元素等价物）', () => {
  const decoTheme: Theme = {
    ...theme,
    decorations: [
      { target: 'h2', position: 'before', text: '◆', style: { display: 'block', color: '#a33a2b' } },
      { target: 'h1', position: 'after', style: { display: 'block', width: '18px', height: '18px' } },
      { target: 'blockquote', position: 'before', text: '“' },
      { target: 'li', position: 'before', text: '[*] ' },
    ],
  }

  it('微信不支持伪元素，所以必须落成真实的内联元素', () => {
    const { html } = renderMarkdownToHtml(sampleMarkdown, decoTheme)
    // 绝不能出现伪元素或 class 依赖
    expect(html).not.toContain('::before')
    expect(html).not.toContain('::after')
    expect(html).not.toContain('class=')
    // h2 前缀、h1 后缀块、引用块引号、列表项标记都必须在场
    expect(html).toMatch(/<h2[^>]*><span style="display:block;color:#a33a2b">◆<\/span>/)
    expect(html).toMatch(/<h1[^>]*>[\s\S]*<span style="display:block;width:18px;height:18px"><\/span><\/h1>/)
    expect(html).toContain('“')
    expect(html).toContain('[*] ')
  })

  it('counter 按文档出现顺序自增，等价于 CSS counter', () => {
    const t: Theme = {
      ...theme,
      decorations: [
        { target: 'h2', position: 'before', counter: 'decimal-leading-zero', style: { 'margin-right': '4px' } },
      ],
    }
    const { html } = renderMarkdownToHtml('## 甲\n\n正文\n\n## 乙\n\n正文\n\n## 丙\n', t)
    expect(html).toContain('>01</span>')
    expect(html).toContain('>02</span>')
    expect(html).toContain('>03</span>')
  })

  it('未声明 decorations 时输出与之前完全一致', () => {
    const withOut = renderMarkdownToHtml(sampleMarkdown, theme).html
    const withEmpty = renderMarkdownToHtml(sampleMarkdown, { ...theme, decorations: [] }).html
    expect(withEmpty).toBe(withOut)
  })

  it('预置主题 eastern-notes / modern-editorial / receipt 带上了上游的伪元素装饰', () => {
    for (const name of ['eastern-notes', 'modern-editorial', 'receipt']) {
      const t = getPresetTheme(name) as Theme
      expect(t.decorations?.length, `${name} 应有 decorations`).toBeGreaterThan(0)
    }
  })
})

describe('pagePadding 与 :::canvas 的归属（不叠加）', () => {
  const withPad = getPresetTheme('eastern-notes') as Theme // pagePadding: 24px 28px
  const withOutPad = getPresetTheme('tech-minimal') as Theme // 无 pagePadding
  const rootStyle = (html: string) => (html.match(/<section style="([^"]*)"/) ?? ['', ''])[1]
  const canvasStyle = (html: string) =>
    (html.match(/<section style="([^"]*)" data-swx="canvas"/) ?? ['', ''])[1]

  it('无 canvas：主题 pagePadding 落在根节点上', () => {
    const { html } = renderMarkdownToHtml('## 标题\n\n正文。', withPad)
    expect(rootStyle(html)).toContain('padding: 24px 28px')
  })

  it('有 canvas：根节点不再输出 padding，改由画布接手主题的 pagePadding', () => {
    const { html } = renderMarkdownToHtml('::::canvas{tone="paper"}\n正文。\n::::', withPad)
    expect(rootStyle(html)).not.toContain('padding:')
    expect(canvasStyle(html)).toContain('padding:24px 28px')
  })

  it('canvas 显式指定 padding 时优先于主题', () => {
    const { html } = renderMarkdownToHtml(
      '::::canvas{tone="paper" padding="10px 30px"}\n正文。\n::::',
      withPad,
    )
    expect(rootStyle(html)).not.toContain('padding:')
    expect(canvasStyle(html)).toContain('padding:10px 30px')
  })

  it('主题没有 pagePadding 时，canvas 回退到 16px 默认值', () => {
    const { html } = renderMarkdownToHtml('::::canvas{tone="paper"}\n正文。\n::::', withOutPad)
    expect(canvasStyle(html)).toContain('padding:16px')
  })

  it('letter-spacing / word-break 不受 canvas 影响', () => {
    const { html } = renderMarkdownToHtml('::::canvas{tone="paper"}\n正文。\n::::', withPad)
    expect(rootStyle(html)).toContain('letter-spacing: 0.045em')
    expect(rootStyle(html)).toContain('word-break: break-word')
  })
})

describe('renderMarkdownToHtml', () => {
  it('输出不含 <style> / <link> / class 依赖（属性内联率 100%）', () => {
    const { html } = renderMarkdownToHtml(sampleMarkdown, theme)
    expect(html).not.toContain('<style')
    expect(html).not.toContain('<link')
    expect(html).not.toContain('class=')
  })

  it('主题覆盖的 block 元素均携带内联 style', () => {
    const { html } = renderMarkdownToHtml(sampleMarkdown, theme)
    // 这些 block 一定出现在示例中（除 img 外都应有 style）
    for (const tag of ['h1', 'h2', 'p', 'strong', 'a', 'blockquote', 'li', 'pre', 'code', 'hr', 'img']) {
      expect(
        html.includes(`<${tag}`) && new RegExp(`<${tag}[^>]*style=`).test(html),
        `元素 <${tag}> 应带内联 style`,
      ).toBe(true)
    }
  })

  it('token 引用在最终输出中已被解析（无残留 {{ }}）', () => {
    const { html } = renderMarkdownToHtml(sampleMarkdown, theme)
    expect(html).not.toContain('{{')
  })

  it('根节点 font-family 不含引号，不会被微信 style 解析器搞崩（回归）', () => {
    const { html } = renderMarkdownToHtml('# 标题', theme)
    const match = /^<section style="([^"]*)">/.exec(html)
    expect(match).not.toBeNull()
    const style = match?.[1] ?? ''
    expect(style).toContain('font-family')
    expect(style).toContain('font-size')
    expect(style).toContain('line-height')
    expect(style).toContain('color')
    // 实测 draft/add → draft/get：带引号的字体名（无论原文引号还是 &quot;）会让微信
    // 把整个 style 清成 style=""，并连带丢掉后面的 color / font-size / line-height。
    // 去掉引号后 `Georgia, Songti SC, SimSun, serif` 仍是合法 CSS。
    const fontFamily = /font-family:\s*([^;]*)/.exec(style)?.[1] ?? ''
    expect(fontFamily).not.toMatch(/["']/)
    expect(fontFamily).not.toContain('&quot;')
    expect(fontFamily.length).toBeGreaterThan(0)
  })

  it('unquoteFontFamily 去掉字体名引号但保留名字（含多词字体）', () => {
    // 带引号 → 去掉，多词字体名不能因此被切碎
    expect(unquoteFontFamily('Georgia, "Songti SC", \'STSong\', serif')).toBe(
      'Georgia, Songti SC, STSong, serif',
    )
    expect(unquoteFontFamily('"Noto Serif CJK SC", "Source Han Serif SC", SimSun, serif')).toBe(
      'Noto Serif CJK SC, Source Han Serif SC, SimSun, serif',
    )
    // 本来就无引号 → 原样（仅规范逗号后空格）
    expect(unquoteFontFamily('PingFang SC,Microsoft YaHei,sans-serif')).toBe(
      'PingFang SC, Microsoft YaHei, sans-serif',
    )
    expect(unquoteFontFamily('serif')).toBe('serif')
  })

  it('主题 CSS 编译结果可被 validator 白名单复验', () => {
    const css = compileThemeToCss(theme)
    expect(css).toContain('#0b6bff')
    expect(css).not.toContain('position')
  })

  it('非法主题抛错', () => {
    const bad = structuredClone(theme) as Theme
    ;(bad.blocks.p as Record<string, string>)['position'] = 'absolute'
    expect(() => renderMarkdownToHtml(sampleMarkdown, bad)).toThrow(/position|过滤/)
  })
})

describe('快照测试', () => {
  it('固定 Markdown + 固定主题 → 固定 HTML 结构', () => {
    const { html } = renderMarkdownToHtml(
      '# 快照标题\n\n正文一段，**加粗**。\n\n- 项一\n\n> 引文\n\n```\ncode\n```',
      theme,
    )
    expect(html).toMatchSnapshot()
  })
})

describe('富组件（@stylewx/components 集成）', () => {
  const componentArticle = `:::cover{title="封面" subtitle="SUB" author="作者"}
:::

:::card{title="卡片标题" tone="primary"}
卡片正文，含 **加粗**。
:::

:::gallery{cols="2"}
![图一](https://mmbiz.qpic.cn/a.png)
![图二](https://mmbiz.qpic.cn/b.png)
:::

:::timeline{title="历程"}
- 2023 | 启动
- 2024 | 上线
:::

:::reveal{label="点我"}

答案在点击后显示。

:::

:::end-card{title="感谢阅读"}
:::
`

  it('组件被渲染为 HTML，且主题色注入到组件内联样式', () => {
    const { html } = renderMarkdownToHtml(componentArticle, theme)
    expect(html).toContain('封面')
    expect(html).toContain('卡片标题')
    expect(html).toContain('感谢阅读')
    // tech-minimal 的 primaryColor = #0b6bff，应出现在组件内联样式里
    expect(html).toContain('#0b6bff')
    expect(html).not.toContain('{{')
  })

  it('组件输出仍不含 <style> / <link> / class 依赖', () => {
    const { html } = renderMarkdownToHtml(componentArticle, theme)
    expect(html).not.toContain('<style')
    expect(html).not.toContain('<link')
    expect(html).not.toContain('class=')
  })

  it('组件文章通过微信校验（无 error）', () => {
    const { html } = renderMarkdownToHtml(componentArticle, theme)
    const report = validateHtml(html)
    expect(report.issues.filter((i) => i.severity === 'error')).toEqual([])
  })

  it('未传主题时组件使用默认配色', () => {
    const html = markdownToHtml(':::card{title="x"}\n正文\n:::')
    expect(html).toContain('正文')
    expect(html).toMatch(/background-color/)
  })

  it('未知组件不会丢内容，并通过 onDiagnostic 上报', () => {
    const diagnostics: Array<{ component: string }> = []
    const html = markdownToHtml(':::no-such\n内容还在\n:::', { onDiagnostic: (d) => diagnostics.push(d) })
    expect(html).toContain('内容还在')
    expect(diagnostics[0]?.component).toBe('no-such')
  })

  it('collectHeadings 可用于 toc', () => {
    const html = markdownToHtml('# 一\n\n## 二\n\n:::toc\n:::')
    expect(html).toContain('二')
  })

  it('往返：渲染 → HTML 回导 → 再渲染，组件与文本一致', () => {
    const first = renderMarkdownToHtml(componentArticle, theme)
    const back = htmlToMarkdown(first.html)
    const second = renderMarkdownToHtml(back.markdown, theme)
    const markers = (h: string) => [...h.matchAll(/data-swx="([^"]+)"/g)].map((m) => m[1])
    const plain = (h: string) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, '')
    expect(markers(second.html)).toEqual(markers(first.html))
    expect(markers(first.html).length).toBeGreaterThan(4)
    expect(plain(second.html)).toBe(plain(first.html))
    expect(back.markdown).toContain(":::cover")
    expect(back.warnings).toEqual([])
  })
})

describe('reading time', () => {
  it('统计字数', () => {
    expect(countWords('# 你好世界 hello world')).toBe(6)
    expect(countWords('短文本')).toBe(3)
  })
  it('估算阅读时长至少 1 分钟', () => {
    expect(estimateReadingMinutes('短文本')).toBe(1)
    expect(estimateReadingMinutes('word '.repeat(4000))).toBe(12)
  })
})
