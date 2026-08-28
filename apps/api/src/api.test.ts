import { describe, it, expect } from 'vitest'
import { createApp } from './app.js'
import { getPresetTheme } from '@mp-style/theme'
import { WeChatClient } from '@mp-style/publisher'
import type { ApiDeps } from './app.js'
import type { LlmClient, LlmMessage, LlmJsonOptions } from '@mp-style/service'

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

async function jsonResponse(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>
}

describe('mp-style REST API', () => {
  it('GET /health', async () => {
    const app = createApp({})
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    expect(await jsonResponse(res)).toEqual({ ok: true })
  })

  it('GET /themes 返回 ≥6 套主题', async () => {
    const app = createApp({})
    const res = await app.request('/themes')
    const data = await jsonResponse(res)
    expect((data.themes as unknown[]).length).toBeGreaterThanOrEqual(6)
  })

  it('POST /validate 返回报告', async () => {
    const app = createApp({})
    const res = await app.request('/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ html: '<section><script>x</script></section>' }),
    })
    const data = await jsonResponse(res)
    expect((data.report as { pass: boolean }).pass).toBe(false)
  })

  it('POST /render 渲染无 <style> HTML', async () => {
    const app = createApp({})
    const res = await app.request('/render', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ markdown: '# 标题\n\n正文。', theme: getPresetTheme('tech-minimal') }),
    })
    expect(res.status).toBe(200)
    const data = await jsonResponse(res)
    expect(String(data.html)).not.toContain('<style')
    expect(String(data.html)).not.toContain('class=')
    expect((data.validation as { pass: boolean }).pass).toBe(true)
  })

  it('POST /themes/generate 无 LLM 时返回 503 统一错误', async () => {
    const app = createApp({})
    const res = await app.request('/themes/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: '科技风' }),
    })
    expect(res.status).toBe(503)
    const data = await jsonResponse(res)
    expect((data as unknown as { error: { code: string } }).error.code).toBe('missing_llm_config')
  })

  it('POST /themes/generate 提供 LLM 时返回主题', async () => {
    const app = createApp({ llm: fakeLlm([getPresetTheme('academic')!]) })
    const res = await app.request('/themes/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: '学术风' }),
    })
    expect(res.status).toBe(200)
    const data = await jsonResponse(res)
    expect((data.theme as { name: string }).name).toBe('academic')
  })

  it('POST /drafts 无微信凭据时返回 503', async () => {
    const app = createApp({})
    const res = await app.request('/drafts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '标题', html: '<p>x</p>' }),
    })
    expect(res.status).toBe(503)
    const data = await jsonResponse(res)
    expect((data as unknown as { error: { code: string } }).error.code).toBe('missing_wechat_credential')
  })

  it('POST /drafts 提供微信客户端时发布成功', async () => {
    const fetchMock = async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = String(input)
      if (url.includes('/cgi-bin/token')) return Response.json({ access_token: 't', expires_in: 7200 })
      if (url.includes('/cgi-bin/material/add_material')) return Response.json({ media_id: 'm', url: 'https://mmbiz.qpic.cn/u' })
      if (url.includes('/cgi-bin/draft/add')) return Response.json({ media_id: 'draft_api' }, { status: 200 })
      return Response.json({})
    }
    const deps: ApiDeps = { wechat: new WeChatClient({ appId: 'a', appSecret: 's', baseUrl: 'https://api.weixin.qq.com', fetchImpl: fetchMock as never }) }
    const app = createApp(deps)
    const res = await app.request('/drafts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '标题', html: '<section><p>hello</p></section>', coverImage: 'https://mmbiz.qpic.cn/c.png' }),
    })
    expect(res.status).toBe(201)
    const data = await jsonResponse(res)
    expect(data.media_id).toBe('draft_api')
  })
})
