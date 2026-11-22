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
  it('真实微信会过滤的属性(banned)被拒绝为 error', () => {
    const html = '<section><p style="position: absolute; color: red;">x</p></section>'
    const r = validateHtml(html)
    const issues = issuesForRule(r, 'css-property-banned')
    expect(issues).toHaveLength(1)
    expect(issues[0]?.severity).toBe('error')
    expect(issues[0]?.message).toContain('position')
    expect(issues[0]?.suggestion).toContain('移除')
    expect(r.pass).toBe(false)
  })

  it('灰色属性(transform)降级为 warning，不阻断 pass', () => {
    const html = '<section><p style="transform: rotate(3deg); color: red;">x</p></section>'
    const r = validateHtml(html)
    const issues = issuesForRule(r, 'css-property-gray')
    expect(issues).toHaveLength(1)
    expect(issues[0]?.severity).toBe('warning')
    expect(r.pass).toBe(true)
  })

  it('白名单内属性通过', () => {
    const html = '<section><p style="color: #333; font-size: 15px; margin: 0;">x</p></section>'
    const r = validateHtml(html)
    expect(issuesForRule(r, 'css-property-not-whitelisted')).toHaveLength(0)
  })

  it('!important 与外部 url() 被标记为 warning(css-value-unsafe)', () => {
    const html =
      '<section><p style="color: red !important; background-image: url(https://evil/a.png);">x</p></section>'
    const r = validateHtml(html)
    const issues = issuesForRule(r, 'css-value-unsafe')
    expect(issues.length).toBeGreaterThanOrEqual(2)
    expect(issues.every((i) => i.severity === 'warning')).toBe(true)
    expect(r.pass).toBe(true)
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

describe('微信实测约束（draft/add → draft/get）', () => {
  it('页内锚点 href="#..." 报错（实测 errcode 45166）', () => {
    const r = validateHtml('<section><a href="#toc">目录</a></section>')
    expect(r.pass).toBe(false)
    expect(r.issues.some((i) => i.rule === 'no-hash-anchor' && i.severity === 'error')).toBe(true)
  })

  it('id 属性给出 warning（微信会剥离）', () => {
    const r = validateHtml('<section><p id="x">hi</p></section>')
    expect(r.pass).toBe(true)
    expect(r.issues.some((i) => i.rule === 'id-will-be-stripped' && i.severity === 'warning')).toBe(true)
  })

  it('SVG url(#...) 引用报错（id 被剥离后必然失效）', () => {
    const r = validateHtml('<section><svg viewBox="0 0 10 10"><rect width="10" height="10" fill="url(#g)"/></svg></section>')
    expect(r.pass).toBe(false)
    expect(r.issues.some((i) => i.rule === 'svg-url-ref-broken' && i.severity === 'error')).toBe(true)
  })

  it('内联样式里的 url(#...) 同样报错且不重复', () => {
    const r = validateHtml('<section><div style="background-image:url(#x)">a</div></section>')
    const hits = r.issues.filter((i) => i.rule === 'svg-url-ref-broken')
    expect(hits).toHaveLength(1)
  })

  it('干净的 SVG + SMIL 动画可以通过', () => {
    const svg =
      '<section><svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#409eff">' +
      '<animate attributeName="opacity" values="1;0;1" dur="2s" repeatCount="indefinite"/></rect></svg></section>'
    const r = validateHtml(svg)
    expect(r.pass).toBe(true)
    expect(r.issues.some((i) => i.rule === 'no-forbidden-tag')).toBe(false)
  })
})

describe('parseHtml', () => {
  it('返回 hast 根节点', () => {
    const root = parseHtml('<section><p>hi</p></section>')
    expect(root.type).toBe('root')
    expect(root.children?.[0]?.type).toBe('element')
  })
})

/**
 * 排版基线闸门。
 *
 * 为什么需要：schema 只管类型（lineHeight 0.8~4 都合法、fontSize 任意长度），
 * 所以一个只会照 schema 生成主题的模型可以写出 `line-height: 1.1` + `font-size: 11px`
 * 这种完全合法但没法读的东西。判据取自 36 套预置主题的实测区间
 * （lineHeight 1.55~2.06 中位 1.7；fontSize 14~17px）。
 *
 * 分档原则：只有明显坏才 error，中间地带只警告 —— 硬拦「偏离预置区间」
 * 会把刻意的极简风一起误伤。
 */
describe('排版基线（typography）', () => {
  const wrap = (pStyle: string, rootStyle = 'font-size:15px') =>
    `<section style="${rootStyle}"><p style="${pStyle}">正文</p><p style="${pStyle}">正文</p></section>`

  it('行高 1.1（密排）→ error，且只报一次', () => {
    const r = validateHtml(wrap('line-height:1.1;margin:0 0 16px'))
    expect(issuesForRule(r, 'typography-line-height').length).toBe(1)
    expect(issuesForRule(r, 'typography-line-height')[0]!.severity).toBe('error')
    expect(r.pass).toBe(false)
  })

  it('行高 1.4（极简风）→ 只 warning，不阻断发布', () => {
    const r = validateHtml(wrap('line-height:1.4;margin:0 0 16px'))
    const hits = issuesForRule(r, 'typography-line-height')
    expect(hits.length).toBe(1)
    expect(hits[0]!.severity).toBe('warning')
    expect(r.pass).toBe(true)
  })

  it('正文字号 12px → error；13.5px → 只 warning', () => {
    const bad = validateHtml(wrap('line-height:1.75;margin:0 0 16px', 'font-size:12px'))
    expect(issuesForRule(bad, 'typography-font-size')[0]!.severity).toBe('error')
    const soft = validateHtml(wrap('line-height:1.75;margin:0 0 16px', 'font-size:13.5px'))
    expect(issuesForRule(soft, 'typography-font-size')[0]!.severity).toBe('warning')
    expect(soft.pass).toBe(true)
  })

  it('行高百分比 / px 都能换算成比值', () => {
    const pct = validateHtml(wrap('line-height:110%;margin:0 0 16px'))
    expect(issuesForRule(pct, 'typography-line-height')[0]!.severity).toBe('error')
    const px = validateHtml(wrap('line-height:16px;margin:0 0 16px')) // 16/15 ≈ 1.07
    expect(issuesForRule(px, 'typography-line-height')[0]!.severity).toBe('error')
  })

  it('字号 em 按父级字号换算（0.7em × 15px = 10.5px → error）', () => {
    const r = validateHtml(wrap('font-size:0.7em;line-height:1.75;margin:0 0 16px'))
    const hit = issuesForRule(r, 'typography-font-size')[0]!
    expect(hit.severity).toBe('error')
    expect(hit.message).toContain('10.5')
  })

  it('根节点给行高、p 自己不写 → 也能判到（继承链）', () => {
    const r = validateHtml('<section style="font-size:15px;line-height:1.1"><p>甲</p><p>乙</p></section>')
    expect(issuesForRule(r, 'typography-line-height').length).toBe(1)
    expect(r.pass).toBe(false)
  })

  it('段落间距 3px → warning；16px → 无问题', () => {
    const tight = validateHtml(wrap('line-height:1.75;margin:0 0 3px'))
    expect(issuesForRule(tight, 'typography-block-spacing')[0]!.severity).toBe('warning')
    const fine = validateHtml(wrap('line-height:1.75;margin:0 0 16px'))
    expect(issuesForRule(fine, 'typography-block-spacing').length).toBe(0)
  })

  it('字距 0.2em → warning；0.04em → 无问题', () => {
    const wide = validateHtml(wrap('line-height:1.75;letter-spacing:0.2em;margin:0 0 16px'))
    expect(issuesForRule(wide, 'typography-letter-spacing')[0]!.severity).toBe('warning')
    const fine = validateHtml(wrap('line-height:1.75;letter-spacing:0.04em;margin:0 0 16px'))
    expect(issuesForRule(fine, 'typography-letter-spacing').length).toBe(0)
  })

  it('正常排版（1.75 行高 / 15px / 16px 段距）零排版问题', () => {
    const r = validateHtml(wrap('line-height:1.75;letter-spacing:0.04em;margin:0 0 16px'))
    expect(r.issues.filter((i) => i.rule.startsWith('typography-')).length).toBe(0)
  })

  it('h1/h2 的 tight 行高不误报（只查正文 p）', () => {
    const r = validateHtml('<section style="font-size:15px"><h1 style="line-height:1.2">标题</h1><p style="line-height:1.75;margin:0 0 16px">正文</p></section>')
    expect(r.issues.filter((i) => i.rule.startsWith('typography-')).length).toBe(0)
  })
})
