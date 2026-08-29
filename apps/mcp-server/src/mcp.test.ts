import { describe, it, expect } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory'
import { createMcpServer } from './server.js'
import { getPresetTheme } from '@mp-style/theme'
import { WeChatClient } from '@mp-style/publisher'
import type { ToolDeps } from './tools.js'
import type { LlmClient, LlmMessage, LlmJsonOptions } from '@mp-style/service'

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

describe('mp-style MCP Server (in-memory)', () => {
  it('list_themes 返回 ≥6 套主题', async () => {
    const { client } = await startClient()
    const names = await client.listTools()
    expect(names.tools.some((t) => t.name === 'list_themes')).toBe(true)
    const res = await client.callTool({ name: 'list_themes', arguments: {} })
    const data = parseText(res as never)
    expect(data.themes.length).toBeGreaterThanOrEqual(6)
  })

  it('list 出全部 9 个 tools', async () => {
    const { client } = await startClient()
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name).sort()
    expect(names).toEqual([
      'analyze_article',
      'export_theme',
      'generate_theme',
      'list_saved_themes',
      'list_themes',
      'publish_draft',
      'render_preview',
      'save_theme',
      'validate_article',
    ])
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
})
