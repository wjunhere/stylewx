import { describe, it, expect, vi } from 'vitest'
import {
  WeChatClient,
  loadConfigFromEnv,
  relocateExternalImages,
  publishDraft,
} from './index.js'

/** 构造一个按 URL 分发的 mock fetch（返回微信 API 形状的 JSON / 图片字节）。 */
function makeMockFetch(opts?: { tokenExpiresIn?: number; failDraft?: boolean; failToken?: boolean }) {
  const calls: { url: string; method?: string; body?: unknown }[] = []
  const fetchMock = async (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
    const url = String(input)
    calls.push({ url, method: init?.method, body: init?.body })
    if (url.includes('/cgi-bin/token')) {
      if (opts?.failToken) {
        return Response.json({ errcode: 40013, errmsg: 'invalid appid' }, { status: 200 })
      }
      return Response.json({ access_token: 'test_token_123', expires_in: opts?.tokenExpiresIn ?? 7200 }, { status: 200 })
    }
    if (url.includes('/cgi-bin/material/add_material')) {
      return Response.json(
        { media_id: 'media_image_1', url: 'https://mmbiz.qpic.cn/mmbiz_png/uploaded.png' },
        { status: 200 },
      )
    }
    if (url.includes('/cgi-bin/draft/add')) {
      if (opts?.failDraft) {
        return Response.json({ errcode: 48001, errmsg: 'api forbidden' }, { status: 200 })
      }
      return Response.json({ media_id: 'draft_abcdef' }, { status: 200 })
    }
    if (url.includes('example.com')) {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    }
    return Response.json({ ok: true }, { status: 200 })
  }
  return { fetchMock: fetchMock as unknown as typeof fetch, calls }
}

function makeClient(overrides?: { tokenExpiresIn?: number; failDraft?: boolean; failToken?: boolean }) {
  const { fetchMock, calls } = makeMockFetch(overrides)
  const client = new WeChatClient({
    appId: 'appid',
    appSecret: 'secret',
    baseUrl: 'https://api.weixin.qq.com',
    fetchImpl: fetchMock,
  })
  return { client, calls }
}

describe('loadConfigFromEnv', () => {
  it('缺少凭据时抛明确错误', () => {
    expect(() => loadConfigFromEnv({} as NodeJS.ProcessEnv)).toThrow(/WECHAT_APP_ID|WECHAT_APP_SECRET/)
  })
  it('读取凭据并生成配置', () => {
    const config = loadConfigFromEnv({
      WECHAT_APP_ID: 'appid',
      WECHAT_APP_SECRET: 'secret',
    } as NodeJS.ProcessEnv)
    expect(config.appId).toBe('appid')
    expect(config.baseUrl).toBe('https://api.weixin.qq.com')
  })
})

describe('getAccessToken', () => {
  it('首次获取并缓存，二次调用不重复请求', async () => {
    const { client, calls } = makeClient()
    const token1 = await client.getAccessToken()
    const token2 = await client.getAccessToken()
    expect(token1).toBe('test_token_123')
    expect(token2).toBe('test_token_123')
    expect(calls.filter((c) => c.url.includes('/cgi-bin/token'))).toHaveLength(1)
  })

  it('临近过期时提前刷新', async () => {
    const { client, calls } = makeClient({ tokenExpiresIn: 60 }) // 60 秒
    await client.getAccessToken()
    // 强行把时间拨到接近过期
    const now = Date.now()
    void now
    // 60 秒过期 → 剩余 60s < 提前 5 分钟(300s) → 下次调用必然刷新
    await client.getAccessToken()
    expect(calls.filter((c) => c.url.includes('/cgi-bin/token'))).toHaveLength(2)
  })

  it('获取 token 失败时抛错误', async () => {
    const { client } = makeClient({ failToken: true })
    await expect(client.getAccessToken()).rejects.toThrow(/errcode/)
  })
})

describe('uploadImage', () => {
  it('上传图片到素材库，返回 url', async () => {
    const { client } = makeClient()
    const result = await client.uploadImage(new Uint8Array([1, 2, 3]), 'a.png', 'image/png')
    expect(result.media_id).toBe('media_image_1')
    expect(result.url).toContain('mmbiz.qpic.cn')
  })
})

describe('addDraft', () => {
  it('调用 draft/add，返回草稿 media_id', async () => {
    const { client, calls } = makeClient()
    const result = await client.addDraft({
      title: '标题',
      content: '<section><p>x</p></section>',
      thumb_media_id: 'thumb_1',
    })
    expect(result.media_id).toBe('draft_abcdef')
    const draftCall = calls.find((c) => c.url.includes('/cgi-bin/draft/add'))
    expect(draftCall).toBeDefined()
    const body = JSON.parse(String((draftCall?.body as string) ?? ''))
    expect(body.articles[0].title).toBe('标题')
    expect(body.articles[0].thumb_media_id).toBe('thumb_1')
  })

  it('draft/add 失败时抛错误', async () => {
    const { client } = makeClient({ failDraft: true })
    await expect(
      client.addDraft({ title: 'x', content: '<p>x</p>', thumb_media_id: 't' }),
    ).rejects.toThrow(/errcode/)
  })
})

describe('relocateExternalImages', () => {
  it('把外链图搬运到素材库并替换 src', async () => {
    const { client, calls } = makeClient()
    const html = '<section><p><img src="https://example.com/a.png"></p><img src="https://mmbiz.qpic.cn/ok.png"></section>'
    const result = await relocateExternalImages(html, client)
    expect(result.uploaded).toHaveLength(1)
    expect(result.uploaded[0]?.original).toBe('https://example.com/a.png')
    expect(result.html).toContain('mmbiz.qpic.cn/mmbiz_png/uploaded.png')
    // 微信图床未被重复搬运
    expect(result.skipped).toContain('https://mmbiz.qpic.cn/ok.png')
    // 至少一次下载 + 一次上传
    expect(calls.some((c) => c.url.includes('example.com'))).toBe(true)
  })

  it('下载失败时记录失败而不抛出', async () => {
    const customFetch = async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = String(input)
      if (url.includes('example.com')) return new Response('bad', { status: 404 })
      if (url.includes('/cgi-bin/token')) return Response.json({ access_token: 't', expires_in: 7200 })
      if (url.includes('/cgi-bin/material/add_material')) return Response.json({ media_id: 'm', url: 'https://mmbiz.qpic.cn/u' })
      return Response.json({})
    }
    const client = new WeChatClient({
      appId: 'a', appSecret: 's', baseUrl: 'https://api.weixin.qq.com',
      fetchImpl: customFetch as unknown as typeof fetch,
    })
    const result = await relocateExternalImages('<img src="https://example.com/broken.png">', client)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]?.reason).toContain('404')
  })
})

describe('publishDraft', () => {
  it('发布草稿，优先使用 coverImage 作为封面', async () => {
    const { client, calls } = makeClient()
    const result = await publishDraft(client, {
      title: '我的文章',
      content: '<section><p>hello</p></section>',
      coverImage: 'https://example.com/cover.png',
      author: '作者',
    })
    expect(result.media_id).toBe('draft_abcdef')
    expect(result.coverMediaId).toBe('media_image_1')
    const draftCall = calls.find((c) => c.url.includes('/cgi-bin/draft/add'))
    const body = JSON.parse(String((draftCall?.body as string) ?? ''))
    expect(body.articles[0].thumb_media_id).toBe('media_image_1')
    expect(body.articles[0].digest).toContain('hello')
  })

  it('未提供封面时，用正文第一张图作为封面（回退）', async () => {
    const { client, calls } = makeClient()
    const result = await publishDraft(client, {
      title: '带图文章',
      content: '<section><p><img src="https://example.com/a.png"></p></section>',
    })
    expect(result.coverMediaId).toBe('media_image_1')
    expect(result.uploadedImages).toHaveLength(1)
    const draftCall = calls.find((c) => c.url.includes('/cgi-bin/draft/add'))
    const body = JSON.parse(String((draftCall?.body as string) ?? ''))
    expect(body.articles[0].content).toContain('mmbiz.qpic.cn')
  })

  it('缺少标题时明确报错', async () => {
    const { client } = makeClient()
    await expect(
      publishDraft(client, { title: '', content: '<p>x</p>' }),
    ).rejects.toThrow(/标题/)
  })

  it('本地上传的 coverData 优先作为封面', async () => {
    const { client, calls } = makeClient()
    const r = await publishDraft(client, { title: 'x', content: '<p>a</p>', coverData: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' } })
    expect(r.media_id).toBe('draft_abcdef')
    expect(calls.filter((c) => c.url.includes('add_material')).length).toBeGreaterThanOrEqual(1)
  })

  it('无封面且无任何图片时自动生成默认封面（不失败）', async () => {
    const { client, calls } = makeClient()
    const r = await publishDraft(client, { title: 'x', content: '<p>纯文字</p>' })
    expect(r.media_id).toBe('draft_abcdef')
    // 应发生了一次封面上传（material/add_material 的 thumb 上传）
    expect(calls.some((c) => c.url.includes('/cgi-bin/material/add_material'))).toBe(true)
  })

  it('安全边界：不暴露任何 freepublish/submit 能力', () => {
    const client = new WeChatClient({
      appId: 'a', appSecret: 's', baseUrl: 'https://api.weixin.qq.com', fetchImpl: makeMockFetch().fetchMock,
    })
    // 客户端对象不存在群发方法
    expect((client as unknown as Record<string, unknown>).submit).toBeUndefined()
    expect((client as unknown as Record<string, unknown>).freepublish).toBeUndefined()
  })
})
