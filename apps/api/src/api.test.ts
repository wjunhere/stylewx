import { describe, it, expect } from 'vitest'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './app.js'
import { getPresetTheme } from '@stylewx/theme'
import { WeChatClient } from '@stylewx/publisher'
import type { ApiDeps } from './app.js'
import type { LlmClient, LlmMessage, LlmJsonOptions } from '@stylewx/service'

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

describe('stylewx REST API', () => {
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

  it('POST /render 支持富组件并返回 diagnostics', async () => {
    const app = createApp({})
    const md = ':::card{title="卡片标题"}\n正文\n:::\n\n:::no-such\n兜底内容\n:::'
    const res = await app.request('/render', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ markdown: md, theme: 'magazine', includeScreenshot: false }),
    })
    expect(res.status).toBe(200)
    const data = await jsonResponse(res)
    expect(String(data.html)).toContain('卡片标题')
    expect(String(data.html)).toContain('兜底内容')
    const diags = data.diagnostics as Array<{ component: string }>
    expect(diags.some((d) => d.component === 'no-such')).toBe(true)
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

  it('GET /brands + /brands/doctor 返回品牌清单与体检报告', async () => {
    // 三层存储都要隔离（只隔离品牌库不够）：doctor 现在也会看全局组件库，
    // 不隔离就会读到用户真实的 components.json，把那里的游离组件报进 issues。
    const prev = {
      brands: process.env.STYLEWX_BRANDS_PATH,
      themes: process.env.STYLEWX_THEMES_PATH,
      comps: process.env.STYLEWX_COMPONENTS_PATH,
    }
    const home = mkdtempSync(join(tmpdir(), 'stylewx-api-brands-'))
    process.env.STYLEWX_BRANDS_PATH = join(home, 'brands')
    process.env.STYLEWX_THEMES_PATH = join(home, 'themes.json')
    process.env.STYLEWX_COMPONENTS_PATH = join(home, 'components.json')
    try {
      const app = createApp({})
      const list = await jsonResponse(await app.request('/brands'))
      expect(Array.isArray(list.brands)).toBe(true)
      const report = await jsonResponse(await app.request('/brands/doctor'))
      expect(report.ok).toBe(true)
      expect(report.issues).toEqual([])
    } finally {
      for (const [key, value] of [
        ['STYLEWX_BRANDS_PATH', prev.brands],
        ['STYLEWX_THEMES_PATH', prev.themes],
        ['STYLEWX_COMPONENTS_PATH', prev.comps],
      ] as const) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })

  it('POST /brands/validate 不落盘；POST /brands/import 从目录安装', async () => {
    // 先用一个真品牌目录当「包」：write 到临时品牌库，再导入到另一个临时品牌库
    const src = join(mkdtempSync(join(tmpdir(), 'stylewx-api-src-')), 'brands')
    const dst = join(mkdtempSync(join(tmpdir(), 'stylewx-api-dst-')), 'brands')
    const prev = { brands: process.env.STYLEWX_BRANDS_PATH, themes: process.env.STYLEWX_THEMES_PATH, comps: process.env.STYLEWX_COMPONENTS_PATH }
    const theme = {
      name: 'tide-notes',
      description: '测试品牌主题',
      tokens: { primaryColor: '#1D5C4A', textColor: '#2A2A26', fontSize: '15px', lineHeight: 1.85, fontFamily: 'Georgia, serif', spacing: { block: '20px' } },
      blocks: {
        h1: { 'font-size': '30px', color: '{{primaryColor}}', 'font-weight': 'bold' },
        h2: { 'font-size': '22px', color: '{{primaryColor}}', 'font-weight': 'bold' },
        p: { 'font-size': '15px', color: '{{textColor}}', 'line-height': '{{lineHeight}}' },
      },
    }
    try {
      process.env.STYLEWX_BRANDS_PATH = src
      process.env.STYLEWX_THEMES_PATH = join(src, '..', 'themes.json')
      process.env.STYLEWX_COMPONENTS_PATH = join(src, '..', 'components.json')
      const { brandSave } = await import('@stylewx/service')
      brandSave({ name: 'tide-notes', description: '生活方式号，气质：温暖、治愈', rationale: '主色采自海边礁石的青苔绿，压低饱和度模拟油墨印刷质感', theme })

      // validate：dry-run，写盘前后目录内容不变
      process.env.STYLEWX_BRANDS_PATH = dst
      const app = createApp({})
      const validated = await jsonResponse(await app.request('/brands/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: join(src, 'tide-notes') }),
      }))
      expect(validated.ok).toBe(true)
      expect(existsSync(join(dst, 'tide-notes'))).toBe(false)

      const imported = await app.request('/brands/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: join(src, 'tide-notes') }),
      })
      expect(imported.status).toBe(201)
      const installed = await jsonResponse(imported)
      expect(installed.name).toBe('tide-notes')
      expect(installed.themeName).toBe('tide-notes')
      expect(existsSync(join(dst, 'tide-notes', 'profile.json'))).toBe(true)
    } finally {
      for (const [key, value] of [['STYLEWX_BRANDS_PATH', prev.brands], ['STYLEWX_THEMES_PATH', prev.themes], ['STYLEWX_COMPONENTS_PATH', prev.comps]] as const) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })

  it('POST /brands/export 真打出 .brand（含 manifest 与资产 sha256）', async () => {
    const src = join(mkdtempSync(join(tmpdir(), 'stylewx-api-exp-')), 'brands')
    const out = mkdtempSync(join(tmpdir(), 'stylewx-api-exp-out-'))
    const prev = { brands: process.env.STYLEWX_BRANDS_PATH, themes: process.env.STYLEWX_THEMES_PATH, comps: process.env.STYLEWX_COMPONENTS_PATH }
    try {
      process.env.STYLEWX_BRANDS_PATH = src
      process.env.STYLEWX_THEMES_PATH = join(src, '..', 'themes.json')
      process.env.STYLEWX_COMPONENTS_PATH = join(src, '..', 'components.json')
      const { brandSave } = await import('@stylewx/service')
      brandSave({
        name: 'tide-notes',
        description: '生活方式号，气质：温暖、治愈',
        rationale: '主色采自海边礁石的青苔绿，压低饱和度模拟油墨印刷质感',
        theme: {
          name: 'tide-notes',
          description: '测试品牌主题',
          tokens: { primaryColor: '#1D5C4A', textColor: '#2A2A26', fontSize: '15px', lineHeight: 1.85, fontFamily: 'Georgia, serif', spacing: { block: '20px' } },
          blocks: { h1: { 'font-size': '30px' }, h2: { 'font-size': '22px' }, p: { 'font-size': '15px' } },
        },
      })

      const app = createApp({})
      // 缺 name → 400 且错误码可辨
      const bad = await app.request('/brands/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(bad.status).toBe(400)

      const res = await app.request('/brands/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'tide-notes', out, version: '3.1.4' }),
      })
      expect(res.status).toBe(200)
      const data = await jsonResponse(res)
      const manifest = data.manifest as { kind: string; version: string; files: Array<{ path: string; sha256: string }> }
      expect(manifest.kind).toBe('stylewx.brand')
      expect(manifest.version).toBe('3.1.4')
      expect(manifest.files.some((f) => f.path === 'brand.json')).toBe(true)
      // 每个条目都带 sha256
      expect(manifest.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256))).toBe(true)
      // 并且 manifest 里的 sha256 是**真的内容哈希**（不是看着像哈希的常量）。
      // 反面教材：只断言 /^[0-9a-f]{64}$/ 时，把哈希写成 `'deadbeef'.repeat(8)` 也能过（我验过）。
      // 做法：改掉源文件的 brand.md 后重打包，只有 brand.md 的哈希该变，其他不该变。
      expect(manifest.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256))).toBe(true)
      const brandMdHash = (files: Array<{ path: string; sha256: string }>): string =>
        (files.find((f) => f.path === 'brand.md') as { sha256: string }).sha256
      const brandJsonHash = (files: Array<{ path: string; sha256: string }>): string =>
        (files.find((f) => f.path === 'brand.json') as { sha256: string }).sha256
      const { appendFileSync: append } = await import('node:fs')
      append(join(src, 'tide-notes', 'brand.md'), '\n\n人为追写一行（只有这个文件的哈希该变）\n')
      const repacked = await jsonResponse(
        await app.request('/brands/export', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'tide-notes', out, version: '3.1.5' }),
        }),
      )
      const files2 = (repacked.manifest as { files: Array<{ path: string; sha256: string }> }).files
      expect(brandMdHash(files2)).not.toBe(brandMdHash(manifest.files))
      expect(brandJsonHash(files2)).toBe(brandJsonHash(manifest.files))
      // 真落盘了
      expect(existsSync(String(data.path))).toBe(true)

      // 不存在的品牌 → 4xx，不是 500
      const missing = await app.request('/brands/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'no-such-brand', out }),
      })
      expect(missing.status).toBeGreaterThanOrEqual(400)
      expect(missing.status).toBeLessThan(500)
    } finally {
      for (const [key, value] of [['STYLEWX_BRANDS_PATH', prev.brands], ['STYLEWX_THEMES_PATH', prev.themes], ['STYLEWX_COMPONENTS_PATH', prev.comps]] as const) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })

  it('POST /brands/attach-assets 把图片落进品牌目录并把 URL 改成相对路径', async () => {
    const src = join(mkdtempSync(join(tmpdir(), 'stylewx-api-att-')), 'brands')
    const from = mkdtempSync(join(tmpdir(), 'stylewx-api-att-src-'))
    const prev = { brands: process.env.STYLEWX_BRANDS_PATH, themes: process.env.STYLEWX_THEMES_PATH, comps: process.env.STYLEWX_COMPONENTS_PATH }
    try {
      process.env.STYLEWX_BRANDS_PATH = src
      process.env.STYLEWX_THEMES_PATH = join(src, '..', 'themes.json')
      process.env.STYLEWX_COMPONENTS_PATH = join(src, '..', 'components.json')
      const { brandSave } = await import('@stylewx/service')
      brandSave({
        name: 'tide-notes',
        description: '生活方式号，气质：温暖、治愈',
        rationale: '主色采自海边礁石的青苔绿，压低饱和度模拟油墨印刷质感',
        theme: {
          name: 'tide-notes',
          description: '测试品牌主题',
          tokens: { primaryColor: '#1D5C4A', textColor: '#2A2A26', fontSize: '15px', lineHeight: 1.85, fontFamily: 'Georgia, serif', spacing: { block: '20px' } },
          blocks: { h1: { 'font-size': '30px' }, h2: { 'font-size': '22px' }, p: { 'font-size': '15px' } },
        },
        // 一开始是远程直链（品牌包不允许这种形式）
        logo: 'https://mmbiz.qpic.cn/old/0?wx_fmt=png',
      })
      // 放真图片字节（服务端会验 magic bytes，文本会被拒）
      const { writeFileSync } = await import('node:fs')
      const png = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
          '0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
        'hex',
      )
      writeFileSync(join(from, 'logo-a.png'), png)
      writeFileSync(join(from, 'cover.png'), png)

      const app = createApp({})
      // 缺 from → 400
      const bad = await app.request('/brands/attach-assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'tide-notes' }),
      })
      expect(bad.status).toBe(400)

      const res = await app.request('/brands/attach-assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'tide-notes', from }),
      })
      expect(res.status).toBe(200)
      const data = await jsonResponse(res)
      expect(data.attached).toContain('assets/logo-a.png')
      // 关键：URL 改成了包内相对路径（否则打包会被拒）
      expect(data.logo).toBe('assets/logo-a.png')
      expect(data.coverImage).toBe('assets/cover.png')
      // 字节真落地了
      expect(existsSync(join(src, 'tide-notes', 'assets', 'logo-a.png'))).toBe(true)
      // 而 brand.md 的自动段同步了 —— doctor 必须仍然为绿
      const { brandDoctor } = await import('@stylewx/service')
      expect(brandDoctor().ok).toBe(true)

      // 目录里一个约定文件都没有 → 明确失败（fail-fast），而不是“成功但什么都没做”。
      // 指向空目录几乎总是“指错了目录”，静默返回 missing 会让人以为已经挂上了。
      const empty = mkdtempSync(join(tmpdir(), 'stylewx-api-att-empty-'))
      const res2 = await app.request('/brands/attach-assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'tide-notes', from: empty }),
      })
      expect(res2.status).toBe(400)
      const errBody = await jsonResponse(res2)
      const err = errBody.error as { code: string; message: string; hint: string }
      expect(err.code).toBe('invalid_asset')
      expect(err.message).toContain('没有找到任何身份位图')
      expect(err.hint).toContain('logo-a.png')
    } finally {
      for (const [key, value] of [['STYLEWX_BRANDS_PATH', prev.brands], ['STYLEWX_THEMES_PATH', prev.themes], ['STYLEWX_COMPONENTS_PATH', prev.comps]] as const) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })
})
