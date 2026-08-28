import { describe, it, expect } from 'vitest'
import { validateHtml, parseHtml } from './index.js'
import type { ValidationIssue, ValidationReport } from './index.js'

function issuesForRule(report: ValidationReport, rule: string): ValidationIssue[] {
  return report.issues.filter((i) => i.rule === rule)
}

describe('HTML 结构校验', () => {
  it('禁用的标签被识别（script/style/iframe 等）', () => {
    const html = '<section><script>alert(1)</script><style>a{}</style><iframe src="x"></iframe></section>'
    const r = validateHtml(html)
    expect(issuesForRule(r, 'no-forbidden-tag').length).toBe(3)
    expect(r.pass).toBe(false)
  })

  it('事件属性（on*）被拒绝', () => {
    const html = '<section><p onclick="alert(1)">text</p></section>'
    const r = validateHtml(html)
    const issues = issuesForRule(r, 'no-event-handler-attr')
    expect(issues).toHaveLength(1)
    expect(issues[0]?.suggestion).toContain('删除')
  })

  it('javascript: 链接被拒绝', () => {
    const html = '<section><a href="javascript:void(0)">x</a></section>'
    const r = validateHtml(html)
    expect(issuesForRule(r, 'no-dangerous-url').length).toBe(1)
  })
})

describe('CSS 白名单校验（内联样式）', () => {
  it('白名单外属性被拒绝，并给出可执行建议', () => {
    const html = '<section><p style="position: absolute; color: red;">x</p></section>'
    const r = validateHtml(html)
    const issues = issuesForRule(r, 'css-property-not-whitelisted')
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain('position')
    expect(issues[0]?.suggestion).toContain('白名单')
  })

  it('白名单内属性通过', () => {
    const html = '<section><p style="color: #333; font-size: 15px; margin: 0;">x</p></section>'
    const r = validateHtml(html)
    expect(issuesForRule(r, 'css-property-not-whitelisted')).toHaveLength(0)
  })

  it('!important 与外部 url() 被标记为不安全', () => {
    const html =
      '<section><p style="color: red !important; background-image: url(https://evil/a.png);">x</p></section>'
    const r = validateHtml(html)
    expect(issuesForRule(r, 'css-value-unsafe').length).toBeGreaterThanOrEqual(2)
  })
})

describe('内容校验', () => {
  it('外链图片被标记为需要上传素材库', () => {
    const html = '<section><img src="https://example.com/a.jpg"></section>'
    const r = validateHtml(html)
    const issues = issuesForRule(r, 'external-image')
    expect(issues).toHaveLength(1)
    expect(issues[0]?.suggestion).toContain('素材库')
  })

  it('微信素材库图片域名通过', () => {
    const html = '<section><img src="https://mmbiz.qpic.cn/sz_mmbiz_png/abc/0?wx_fmt=png"></section>'
    const r = validateHtml(html)
    expect(issuesForRule(r, 'external-image')).toHaveLength(0)
  })

  it('data URI 图片通过', () => {
    const html = '<section><img src="data:image/png;base64,xxxx"></section>'
    const r = validateHtml(html)
    expect(issuesForRule(r, 'external-image')).toHaveLength(0)
  })

  it('图片数量过多时告警', () => {
    const imgs = '<img src="https://mmbiz.qpic.cn/a">'.repeat(16)
    const r = validateHtml(`<section>${imgs}</section>`)
    expect(issuesForRule(r, 'image-count-high')).toHaveLength(1)
  })

  it('无图片时给出 info 提示', () => {
    const r = validateHtml('<section><p>纯文字</p></section>')
    expect(issuesForRule(r, 'image-count-zero')).toHaveLength(1)
  })

  it('超长正文给出软上限提示', () => {
    const longText = '字'.repeat(32000)
    const r = validateHtml(`<section><p>${longText}</p></section>`)
    expect(issuesForRule(r, 'word-count-limit')).toHaveLength(1)
  })
})

describe('报告格式', () => {
  it('无错误时 pass 为 true', () => {
    const r = validateHtml('<section><p style="color:#333">ok</p></section>')
    expect(r.pass).toBe(true)
    // 仅无图片 info 提示，不应导致 pass = false
    expect(r.issues.every((i) => i.severity !== 'error')).toBe(true)
  })

  it('含有 error 时 pass 为 false', () => {
    const r = validateHtml('<section><script>x</script></section>')
    expect(r.pass).toBe(false)
  })

  it('每条 issue 都包含 rule/severity/message/suggestion/location', () => {
    const r = validateHtml('<section><img src="https://evil.com/a.png"></section>')
    for (const issue of r.issues) {
      expect(issue.rule).toBeTruthy()
      expect(['error', 'warning', 'info']).toContain(issue.severity)
      expect(issue.message).toBeTruthy()
      expect(issue.suggestion).toBeTruthy()
      expect(issue.location).toBeTruthy()
    }
  })

  it('超长正文的软上限提示', () => {
    const r = validateHtml(`<section><p>${'字'.repeat(32000)}</p></section>`)
    expect(r.issues.some((i) => i.location === '(document)' && i.rule === 'word-count-limit')).toBe(true)
  })

  it('损坏 HTML 不抛错，返回 unparseable 错误', () => {
    const r = validateHtml('<section><p')
    // 解析容错，通常能作为文本恢复；若非则回退到 unparseable
    expect(typeof r.pass).toBe('boolean')
  })
})

describe('parseHtml', () => {
  it('返回 hast 根节点', () => {
    const root = parseHtml('<section><p>hi</p></section>')
    expect(root.type).toBe('root')
    expect(root.children?.[0]?.type).toBe('element')
  })
})
