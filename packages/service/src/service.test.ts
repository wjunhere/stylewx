import { describe, it, expect } from 'vitest'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  listThemes,
  analyzeArticle,
  renderPreview,
  validateArticle,
  publishDraft,
  generateTheme,
  optimizeArticle,
  saveArticle,
  parseFrontMatter,
  stringifyFrontMatter,
  serviceError,
} from './index.js'
import { getPresetTheme, validateTheme } from '@stylewx/theme'
import { WeChatClient } from '@stylewx/publisher'
import type { LlmClient, LlmMessage, LlmJsonOptions } from './index.js'

describe('front-matter（让 .md 自带 title / theme）', () => {
  it('解析 title / theme，并把正文与元信息分离', () => {
    const { meta, body } = parseFrontMatter('---\ntitle: 收敛水\ntheme: dusk-convergence\n---\n\n正文一。\n')
    expect(meta).toEqual({ title: '收敛水', theme: 'dusk-convergence' })
    expect(body.trim()).toBe('正文一。')
  })

  it('带引号的值也能解析', () => {
    const { meta } = parseFrontMatter('---\ntitle: "含: 冒号的标题"\ntheme: \'eastern-notes\'\n---\n\n正文\n')
    expect(meta.title).toBe('含: 冒号的标题')
    expect(meta.theme).toBe('eastern-notes')
  })

  it('块内没有已知键时当普通分割线，原样返回（不误伤正文）', () => {
    const text = '---\n\n这是正文开头。\n\n---\n\n后面还有。\n'
    const { meta, body } = parseFrontMatter(text)
    expect(meta).toEqual({})
    expect(body).toBe(text)
  })

  it('不含 front-matter 时正文逐字不变', () => {
    const text = '# 标题\n\n正文\n'
    expect(parseFrontMatter(text).body).toBe(text)
  })

  it('stringify 后能被 parse 还原（往返一致）', () => {
    const out = stringifyFrontMatter({ title: '收敛水', theme: 'dusk-convergence' }, '正文。\n')
    const { meta, body } = parseFrontMatter(out)
    expect(meta).toEqual({ title: '收敛水', theme: 'dusk-convergence' })
    expect(body.trim()).toBe('正文。')
  })

  it('没有字段时 stringify 不插入任何东西', () => {
    expect(stringifyFrontMatter({}, '正文\n')).toBe('正文\n')
  })

  it('saveArticle 传 theme 时写入 front-matter，并把它附在 editorUrl 上', () => {
    const r = saveArticle({ markdown: '正文。\n', title: '往返测试', theme: 'dusk-convergence' })
    const raw = readFileSync(r.path, 'utf8')
    expect(raw.startsWith('---\n')).toBe(true)
    expect(raw).toContain('theme: dusk-convergence')
    expect(raw).toContain('title: 往返测试')
    expect(r.theme).toBe('dusk-convergence')
    expect(r.editorUrl).toContain('theme=dusk-convergence')
    rmSync(r.path, { force: true })
  })

  it('saveArticle 不传 theme 时行为与以前一致（不写 front-matter）', () => {
    const md = '正文，没有元信息。\n'
    const r = saveArticle({ markdown: md, title: '无主题测试' })
    expect(readFileSync(r.path, 'utf8')).toBe(md)
    expect(r.theme).toBeUndefined()
    expect(r.editorUrl).not.toContain('theme=')
    rmSync(r.path, { force: true })
  })

  it('二次保存不会叠加 front-matter', () => {
    const once = saveArticle({ markdown: '正文。\n', title: '幂等测试', theme: 'eastern-notes' })
    const twice = saveArticle({ markdown: readFileSync(once.path, 'utf8'), path: once.path, theme: 'eastern-notes' })
    const raw = readFileSync(twice.path, 'utf8')
    expect(raw.match(/^---$/gm)?.length).toBe(2)
    rmSync(once.path, { force: true })
  })

  it('相对路径按文章根目录解析（编辑器「另存为…」走的就是这条路）', () => {
    const r = saveArticle({ markdown: '另存为测试。\n', path: 'drafts/另存为测试.md', theme: 'magazine' })
    expect(r.path).toBe(join(r.root, 'drafts', '另存为测试.md'))
    expect(readFileSync(r.path, 'utf8')).toContain('theme: magazine')
    rmSync(r.path, { force: true })
    rmSync(join(r.root, 'drafts'), { recursive: true, force: true })
  })

  it('目录穿越被拒绝', () => {
    // 注意：serviceError 抛的是普通对象（{ error: { code, message, hint } }）而非 Error，
    // 所以不能用 toThrow(/正则/) 匹配——得自己接住再断言 code。
    let caught: unknown
    try {
      saveArticle({ markdown: 'x', path: '../outside.md' })
    } catch (e) {
      caught = e
    }
    expect((caught as { error?: { code?: string; message?: string } })?.error?.code).toBe('path_not_allowed')
    expect((caught as { error?: { message?: string } })?.error?.message).toContain('超出允许范围')
  })
})

describe('optimizeArticle', () => {
  it('用桩 LLM 返回优化后的 Markdown', async () => {
    const stub = { completeText: async () => '# 优化标题\n\n优化后的正文。' } as unknown as LlmClient
    const r = await optimizeArticle('# 标题\n\n正文。', stub)
    expect(r.markdown).toContain('优化标题')
  })

  it('空正文抛 missing_content', async () => {
    const stub = { completeText: async () => '' } as unknown as LlmClient
    await expect(optimizeArticle('   ', stub)).rejects.toMatchObject({ error: { code: 'missing_content' } })
  })
})

describe('listThemes', () => {
  it('返回至少 6 套预置主题', () => {
    const { themes } = listThemes()
    expect(themes.length).toBeGreaterThanOrEqual(6)
    expect(themes[0]).toHaveProperty('name')
    expect(themes[0]).toHaveProperty('description')
    expect(themes[0]?.tokens).toHaveProperty('primaryColor')
  })
})

describe('analyzeArticle', () => {
  it('技术类内容被识别并给出建议主题', () => {
    const r = analyzeArticle('本文介绍前端框架的部署与性能优化，包含 function 概念。')
    expect(r.content.type).toBe('tech')
    expect(r.suggestedTheme.name).toBe('tech-minimal')
    expect(r.content.readingMinutes).toBeGreaterThanOrEqual(1)
  })
  it('政务类内容被识别', () => {
    const r = analyzeArticle('关于落实党建精神的通知，请各党委组织学习。')
    expect(r.content.type).toBe('government')
  })
})

describe('renderPreview', () => {
  it('渲染并校验通过，无 <style>/class=', { timeout: 30000 }, async () => {
    const theme = getPresetTheme('tech-minimal')!
    const r = await renderPreview('# 标题\n\n正文内容。\n\n- 项一\n', theme)
    expect(r.html).not.toContain('<style')
    expect(r.html).not.toContain('class=')
    expect(r.validation.pass).toBe(true)
  })
  it('非法主题抛出统一错误', async () => {
    const bad = structuredClone(getPresetTheme('tech-minimal')!)
    ;(bad.blocks.p as Record<string, string>)['position'] = 'absolute'
    await expect(renderPreview('# x', bad)).rejects.toMatchObject({ error: { code: 'invalid_theme' } })
  })
})

describe('validateArticle', () => {
  it('返回结构化报告', () => {
    const { report } = validateArticle('<section><p style="color:#333">x</p></section>')
    expect(report.pass).toBe(true)
  })
  it('检测微信不兼容内容', () => {
    const { report } = validateArticle('<section><script>x</script></section>')
    expect(report.pass).toBe(false)
  })
})

describe('publishDraft (service)', () => {
  function makeClient(failDraft = false) {
    const fetchMock = async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = String(input)
      if (url.includes('/cgi-bin/token')) return Response.json({ access_token: 't', expires_in: 7200 })
      if (url.includes('/cgi-bin/material/add_material')) return Response.json({ media_id: 'm', url: 'https://mmbiz.qpic.cn/u' })
      if (url.includes('/cgi-bin/draft/add')) {
        if (failDraft) return Response.json({ errcode: 48001, errmsg: 'forbidden' }, { status: 200 })
        return Response.json({ media_id: 'draft_x' }, { status: 200 })
      }
      if (url.includes('example.com')) return new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } })
      return Response.json({})
    }
    return new WeChatClient({
      appId: 'a', appSecret: 's', baseUrl: 'https://api.weixin.qq.com',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })
  }

  it('发布成功返回媒体 id', async () => {
    const r = await publishDraft(makeClient(), {
      title: '标题', content: '<section><p>hello</p></section>', coverImage: 'https://example.com/c.png',
    })
    expect(r).not.toHaveProperty('error')
    expect((r as { media_id: string }).media_id).toBe('draft_x')
  })

  it('微信接口失败被包装为统一错误', async () => {
    const r = await publishDraft(makeClient(true), {
      title: '标题', content: '<section><p>x</p></section>', coverImage: 'https://example.com/c.png',
    })
    expect(r).toHaveProperty('error')
    expect((r as { error: { message: string } }).error.message).toContain('errcode')
  })
})

describe('预置主题（含 WeMD 移植）渲染后都通过微信白名单校验', { timeout: 60000 }, () => {
  it('每一套预置主题渲染出的 HTML 都通过 validator（无白名单外属性）', async () => {
    const { themes } = listThemes()
    expect(themes.length).toBeGreaterThanOrEqual(26)
    const sample = '# 标题\n\n正文 **加粗** 与 [链接](https://a.com)。\n\n> 引用\n\n- 项一\n- 项二\n\n```\ncode\n```\n\n![图](https://mmbiz.qpic.cn/a.png)\n\n---\n'
    for (const theme of themes) {
      const r = await renderPreview(sample, theme, { includeScreenshot: false })
      expect(r.validation.pass, `${theme.name} 渲染后应通过校验: ${JSON.stringify(r.validation.issues.slice(0, 3))}`).toBe(true)
      expect(r.html).not.toContain('<style')
      expect(r.html).not.toContain('class=')
    }
  })
})

describe('serviceError', () => {
  it('生成统一错误格式', () => {
    const e = serviceError('x', 'm', 'h')
    expect(e).toEqual({ error: { code: 'x', message: 'm', hint: 'h' } })
  })
})

describe('generateTheme (LLM 修复循环)', () => {
  function fakeLlm(responses: unknown[]): LlmClient {
    let i = 0
    const completeJson = async (_m: LlmMessage[], _o: LlmJsonOptions): Promise<unknown> => {
      const r = responses[i]
      i += 1
      if (r instanceof Error) throw r
      return r
    }
    return { completeJson } as unknown as LlmClient
  }

  const validTheme = getPresetTheme('tech-minimal')!
  const invalidTheme = () => {
    const t = structuredClone(validTheme)
    delete (t.blocks as Record<string, unknown>).h1 // 缺 h1 → schema 失败
    return t
  }

  it('LLM 直接返回合法主题：success, fallback=false', { timeout: 30000 }, async () => {
    const r = await generateTheme({ prompt: '科技风' }, fakeLlm([validTheme]))
    expect(r.fallback).toBe(false)
    expect(r.repairAttempts).toBe(1)
    expect(validateTheme(r.theme).ok).toBe(true)
  })

  it('第一次非法、第二次合法：修复成功', { timeout: 30000 }, async () => {
    const r = await generateTheme({ prompt: '科技风' }, fakeLlm([invalidTheme(), validTheme]))
    expect(r.fallback).toBe(false)
    expect(r.repairAttempts).toBe(2)
  })

  it('始终非法：降级到预置主题并标记 fallback', { timeout: 30000 }, async () => {
    const r = await generateTheme({ prompt: '科技风' }, fakeLlm([invalidTheme(), invalidTheme(), invalidTheme()]))
    expect(r.fallback).toBe(true)
    expect(r.errorDetail).toContain('h1')
    expect(validateTheme(r.theme).ok).toBe(true)
    expect(PRESET_NAMES).toContain(r.theme.name)
  })

  it('提供文章时先生成内容分析，并返回分析结论', { timeout: 30000 }, async () => {
    const analysis = {
      contentType: 'tech', tone: '中性', industry: '互联网', designDirection: '冷色简洁',
    }
    const r = await generateTheme({ article: '这篇讲前端技术。' }, fakeLlm([analysis, validTheme]))
    expect(r.analysis?.contentType).toBe('tech')
    expect(r.fallback).toBe(false)
  })
})

const PRESET_NAMES = listThemes().themes.map((t) => t.name)
