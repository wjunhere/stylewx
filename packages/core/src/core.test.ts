import { describe, it, expect } from 'vitest'
import {
  markdownToHtml,
  renderMarkdownToHtml,
  countWords,
  estimateReadingMinutes,
} from './index.js'
import { getPresetTheme, compileThemeToCss } from '@mp-style/theme'
import type { Theme } from '@mp-style/theme'

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
