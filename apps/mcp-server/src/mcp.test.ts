import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory'
import { createMcpServer } from './server.js'
import { getPresetTheme } from '@stylewx/theme'
import { WeChatClient } from '@stylewx/publisher'
import type { ToolDeps } from './tools.js'
import type { LlmClient, LlmMessage, LlmJsonOptions } from '@stylewx/service'

async function startClient(deps: ToolDeps = {}) {
  const server = createMcpServer(deps)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const client = new Client({ name: 'test', version: '0.0.0' })
  await client.connect(clientTransport)
  return { client, server }
}

function parseText(result: { content: Array<{ type: string; text?: string }> }) {
  const text = result.content.find((c) => c.type === 'text')?.text ?? ''
  return JSON.parse(text)
}

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

describe('stylewx MCP Server (in-memory)', () => {
  it('list_themes 返回 ≥6 套主题', async () => {
    const { client } = await startClient()
    const names = await client.listTools()
    expect(names.tools.some((t) => t.name === 'list_themes')).toBe(true)
    const res = await client.callTool({ name: 'list_themes', arguments: {} })
    const data = parseText(res as never)
    expect(data.themes.length).toBeGreaterThanOrEqual(6)
  })

  it('list 出全部 15 个 tools', async () => {
    const { client } = await startClient()
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name).sort()
    expect(names).toEqual([
      'analyze_article',
      'delete_component',
      'export_theme',
      'generate_theme',
      'list_components',
      'list_saved_themes',
      'list_themes',
      'publish_draft',
      'render_fragment',
      'render_preview',
      'save_article',
      'save_component',
      'save_theme',
      'tweak_theme',
      'validate_article',
    ])
  })

  it('list_components 返回组件目录与语法', async () => {
    const { client } = await startClient()
    const res = await client.callTool({ name: 'list_components', arguments: {} })
    const data = parseText(res as never)
    expect(data.syntax.single).toContain(':::card')
    expect(Array.isArray(data.components)).toBe(true)
    expect(data.components.length).toBeGreaterThanOrEqual(18)
    const names = data.components.map((c: { name: string }) => c.name)
    for (const expected of ['card', 'gallery', 'carousel', 'reveal', 'cover', 'end-card', 'timeline', 'progress']) {
      expect(names).toContain(expected)
    }
  })

  it('list_components 支持按类别过滤与 markdown 格式', async () => {
    const { client } = await startClient()
    const res = await client.callTool({ name: 'list_components', arguments: { category: 'interactive' } })
    const data = parseText(res as never)
    expect(data.components.every((c: { category: string }) => c.category === 'interactive')).toBe(true)

    const md = await client.callTool({ name: 'list_components', arguments: { format: 'markdown' } })
    const text = (md as { content: Array<{ type: string; text?: string }> }).content.find((c) => c.type === 'text')?.text ?? ''
    expect(text).toContain(':::carousel')
    expect(text).toContain('图片')
  })

  it('analyze_article 返回分析结论', async () => {
    const { client } = await startClient()
    const res = await client.callTool({ name: 'analyze_article', arguments: { markdown: '这是一篇讲前端框架与性能优化的技术文章。' } })
    const data = parseText(res as never)
    expect(data.content.type).toBe('tech')
    expect(data.suggestedTheme.name).toBe('tech-minimal')
  })

  it('render_preview 渲染出无 <style> 的 HTML', async () => {
    const theme = getPresetTheme('tech-minimal')!
    const { client } = await startClient()
    const res = await client.callTool({
      name: 'render_preview',
      arguments: { markdown: '# 标题\n\n正文。\n\n- 项一\n', theme: JSON.parse(JSON.stringify(theme)) },
    })
    const data = parseText(res as never)
    expect(data.html).not.toContain('<style')
    expect(data.html).not.toContain('class=')
    expect(data.validation.pass).toBe(true)
  })

  it('validate_article 返回结构化报告', async () => {
    const { client } = await startClient()
    const res = await client.callTool({ name: 'validate_article', arguments: { html: '<section><script>x</script><p>ok</p></section>' } })
    const data = parseText(res as never)
    expect(data.report.pass).toBe(false)
    expect(data.report.issues.some((i: { rule: string }) => i.rule === 'no-forbidden-tag')).toBe(true)
  })

  it('generate_theme 缺 LLM 时返回统一错误（isError,不崩溃）', async () => {
    const { client } = await startClient()
    const res = await client.callTool({ name: 'generate_theme', arguments: { prompt: '科技风' } })
    expect((res as { isError?: boolean }).isError).toBe(true)
    const data = parseText(res as never)
    expect(data.error.code).toBe('missing_llm_config')
    expect(data.error.hint).toBeTruthy()
  })

  it('generate_theme 提供 LLM 时生成主题', async () => {
    const { client } = await startClient({ llm: fakeLlm([getPresetTheme('business')!]) })
    const res = await client.callTool({ name: 'generate_theme', arguments: { prompt: '商务风' } })
    const data = parseText(res as never)
    expect(data.fallback).toBe(false)
    expect(data.theme.name).toBe('business')
  })

  it('publish_draft 缺微信凭据时返回清晰错误', async () => {
    const { client } = await startClient()
    const res = await client.callTool({
      name: 'publish_draft',
      arguments: { title: '标题', content: '<p></p>', contentHtml: '<p>x</p>' },
    })
    expect((res as { isError?: boolean }).isError).toBe(true)
    const data = parseText(res as never)
    expect(data.error.code).toBe('missing_wechat_credential')
  })

  it('publish_draft 提供微信客户端时发布成功', async () => {
    const fetchMock = async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = String(input)
      if (url.includes('/cgi-bin/token')) return Response.json({ access_token: 't', expires_in: 7200 })
      if (url.includes('/cgi-bin/material/add_material')) return Response.json({ media_id: 'm', url: 'https://mmbiz.qpic.cn/u' })
      if (url.includes('/cgi-bin/draft/add')) return Response.json({ media_id: 'draft_mcp' }, { status: 200 })
      return Response.json({})
    }
    const wechat = new WeChatClient({ appId: 'a', appSecret: 's', baseUrl: 'https://api.weixin.qq.com', fetchImpl: fetchMock as never })
    const { client } = await startClient({ wechat })
    const res = await client.callTool({
      name: 'publish_draft',
      arguments: {
        title: '标题', html: '<section><p>hello</p></section>',
        coverImage: 'https://mmbiz.qpic.cn/cover.png',
      },
    })
    const data = parseText(res as never)
    expect(data.media_id).toBe('draft_mcp')
  })

  it('tweak_theme 做确定性微调并回传改动字段', async () => {
    const { client } = await startClient()
    const res = await client.callTool({
      name: 'tweak_theme',
      arguments: { theme: 'tech-minimal', tokens: { primaryColor: '#ff6600', fontSize: '17px', radius: '16px' } },
    })
    const data = parseText(res as never)
    expect(data.ok).toBe(true)
    expect(data.theme.tokens.primaryColor).toBe('#ff6600')
    expect(data.theme.tokens.fontSize).toBe('17px')
    expect(data.theme.tokens.radius).toBe('16px')
    expect(data.changed).toContain('tokens.primaryColor')
  })

  it('tweak_theme 非法值返回明确错误', async () => {
    const { client } = await startClient()
    const res = await client.callTool({
      name: 'tweak_theme',
      arguments: { theme: 'tech-minimal', tokens: { primaryColor: 'not-a-color' } },
    })
    const data = parseText(res as never)
    expect(data.error.code).toBe('invalid_theme_patch')
    expect(String(data.error.hint)).toContain('颜色')
  })

  it('render_fragment 默认不回 HTML，返回组件清单与校验', async () => {
    const { client } = await startClient()
    const res = await client.callTool({
      name: 'render_fragment',
      arguments: {
        markdown: ':::card{title="片段标题"}\n正文\n:::',
        theme: 'tech-minimal',
        includeScreenshot: false,
      },
    })
    const data = parseText(res as never)
    expect(data.html).toBeUndefined()
    expect(data.components.map((c: { name: string }) => c.name)).toEqual(['card'])
    expect(data.validation.pass).toBe(true)
  })

  it('render_fragment 可显式要求 HTML', async () => {
    const { client } = await startClient()
    const res = await client.callTool({
      name: 'render_fragment',
      arguments: { markdown: ':::badge{text="新"}\n:::', theme: 'tech-minimal', includeHtml: true, includeScreenshot: false },
    })
    const data = parseText(res as never)
    expect(String(data.html)).toContain('新')
  })

  it('save_article 落盘到允许的根目录并返回编辑器地址', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'swx-'))
    process.env.STYLEWX_ARTICLES_DIR = dir
    process.env.STYLEWX_EDITOR_URL = 'http://localhost:3777'
    try {
      const { client } = await startClient()
      const res = await client.callTool({
        name: 'save_article',
        arguments: { markdown: '# 测试标题\n\n正文。', path: 'draft/test.md' },
      })
      const data = parseText(res as never)
      expect(readFileSync(data.path, 'utf8')).toContain('测试标题')
      expect(String(data.editorUrl)).toContain('/editor?file=')
      expect(String(data.path).startsWith(dir)).toBe(true)
    } finally {
      delete process.env.STYLEWX_ARTICLES_DIR
      delete process.env.STYLEWX_EDITOR_URL
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('save_article 拒绝写到根目录之外', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'swx-'))
    process.env.STYLEWX_ARTICLES_DIR = dir
    try {
      const { client } = await startClient()
      const res = await client.callTool({
        name: 'save_article',
        arguments: { markdown: '内容', path: '../escape.md' },
      })
      const data = parseText(res as never)
      expect(data.error.code).toBe('path_not_allowed')
    } finally {
      delete process.env.STYLEWX_ARTICLES_DIR
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('tweak_theme 支持组件级样式覆盖（components）', async () => {
    const { client } = await startClient()
    const res = await client.callTool({
      name: 'tweak_theme',
      arguments: {
        theme: 'tech-minimal',
        components: { card: { root: { padding: '20px' }, title: { 'font-size': '19px' } } },
      },
    })
    const data = parseText(res as never)
    expect(data.ok).toBe(true)
    expect(data.theme.components.card.root.padding).toBe('20px')
    expect(data.changed).toContain('components.card.title.font-size')
  })

  it('list_components 返回每个组件可定制的部位', async () => {
    const { client } = await startClient()
    const res = await client.callTool({ name: 'list_components', arguments: {} })
    const data = parseText(res as never)
    const card = data.components.find((c: { name: string }) => c.name === 'card')
    expect(card.slots).toContain('title')
    expect(card.slots).toContain('body')
    const badge = data.components.find((c: { name: string }) => c.name === 'badge')
    expect(badge.slots).toEqual(['root', '*'])
  })

  it('save_component 定义自定义组件，list_components 能查到并标注 origin=user', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'swx-c-'))
    process.env.STYLEWX_COMPONENTS_PATH = join(dir, 'components.json')
    try {
      const { client } = await startClient()
      const saved = await client.callTool({
        name: 'save_component',
        arguments: {
          name: 'brand-quote',
          description: '品牌引言卡',
          template:
            '<div data-swx-slot="card" style="color:{{theme.primary}}">' +
            '<div data-swx-slot="title">{{title}}</div>{{body}}</div>',
          slots: ['card', 'title'],
        },
      })
      const savedData = parseText(saved as never)
      expect(savedData.component.name).toBe('brand-quote')

      const list = await client.callTool({ name: 'list_components', arguments: {} })
      const listData = parseText(list as never)
      const custom = listData.components.find((c: { name: string }) => c.name === 'brand-quote')
      expect(custom.origin).toBe('user')
      expect(custom.slots).toContain('title')
      const builtin = listData.components.find((c: { name: string }) => c.name === 'card')
      expect(builtin.origin).toBe('builtin')

      const del = await client.callTool({ name: 'delete_component', arguments: { name: 'brand-quote' } })
      expect(parseText(del as never).deleted).toBe('brand-quote')
    } finally {
      delete process.env.STYLEWX_COMPONENTS_PATH
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('save_component 拒绝含 script 的模板', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'swx-c-'))
    process.env.STYLEWX_COMPONENTS_PATH = join(dir, 'components.json')
    try {
      const { client } = await startClient()
      const res = await client.callTool({
        name: 'save_component',
        arguments: { name: 'bad-one', template: '<div><script>alert(1)</script></div>' },
      })
      const data = parseText(res as never)
      expect(data.error.code).toBe('invalid_component')
      expect(String(data.error.message)).toContain('script')
    } finally {
      delete process.env.STYLEWX_COMPONENTS_PATH
      rmSync(dir, { recursive: true, force: true })
    }
  })
})