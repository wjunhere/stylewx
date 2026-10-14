/**
 * stylewx MCP Server 入口。
 * 双传输模式：--transport stdio（默认） | --transport http。
 * 依赖注入：从环境变量构造 LLM / 微信客户端；缺少时对应 tool 会返回明确错误，而非崩溃。
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, resolve, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createMcpServer } from './server.js'
import {
  loadLlmConfigFromEnv,
  LlmClient,
  listThemes,
  listSavedThemes,
  renderPreview,
  generateTheme,
  saveTheme,
  exportTheme,
  validateArticle,
  resolveTheme,
  optimizeArticle,
  asServiceError,
  articlesRoot,
  isInside,
  listSavedComponents,
  deleteUserComponent,
  renderComponentPreviews,
  withPlaceholderImages,
  saveImageAsset,
  readImageAssetByUrl,
  resolveLocalImage,
  renderThemePreviews,
  parseFrontMatter,
  saveArticle,
  listDir,
  makeDir,
  brandList,
  brandOverview,
  brandApply,
  attachBrandAssets,
  installBrand,
  packBrand,
  validateBundle,
} from '@stylewx/service'
import { renderCoverPng, prepareImage } from '@stylewx/preview'
import { loadConfigFromEnv, WeChatClient, publishDraft as publisherPublishDraft } from '@stylewx/publisher'
import { htmlToMarkdown, buildPalette } from '@stylewx/components'
import type { ToolDeps } from './tools.js'

interface CliOptions {
  transport: 'stdio' | 'http'
  port: number
}

function parseArgs(argv: string[]): CliOptions {
  let transport: 'stdio' | 'http' = 'stdio'
  let port = 3000
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--transport') {
      const next = argv[i + 1]
      if (next === 'http' || next === 'stdio') transport = next
    } else if (arg === '--port') {
      const next = Number(argv[i + 1])
      if (Number.isFinite(next)) port = next
    }
  }
  return { transport, port }
}

/** 从环境构造依赖；LLM / 微信客户端缺失时不抛错，对应的 tool 会返回明确错误。 */
function buildDeps(): ToolDeps {
  const deps: ToolDeps = {}
  try {
    const llmConfig = loadLlmConfigFromEnv()
    deps.llm = new LlmClient(llmConfig)
  } catch {
    // 缺 LLM 配置：generate_theme 可用 list_themes 兜底
    deps.llm = undefined
  }
  try {
    const wxConfig = loadConfigFromEnv()
    deps.wechat = new WeChatClient(wxConfig)
  } catch {
    // 缺微信凭据：publish_draft 会返回清晰错误
    deps.wechat = undefined
  }
  return deps
}

// ---------- 本地 Web 编辑器（/editor + /editor/api/*） ----------

async function readJsonBody(req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
  let body = ''
  for await (const chunk of req) body += chunk
  if (!body) return {}
  try {
    return JSON.parse(body) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** 把 service 的统一错误对象转成 HTTP 响应。 */
function respondErrorOrSend(
  res: import('node:http').ServerResponse,
  error: unknown,
): void {
  const e = asServiceError(error)
  sendErr(res, e.error)
}

function sendJson(res: import('node:http').ServerResponse, obj: unknown, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

function sendErr(res: import('node:http').ServerResponse, error: { code: string; message: string; hint: string }, status = 400): void {
  sendJson(res, { error }, status)
}

async function handleEditorApi(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  path: string,
  url: URL,
  deps: ToolDeps,
): Promise<void> {
  try {
    if (path === '/editor/api/themes' && req.method === 'GET') {
      const savedNames = new Set(listSavedThemes().themes.map((t) => t.name))
      const themes = listThemes().themes.map((t) => ({ ...t, origin: savedNames.has(t.name) ? 'saved' : 'preset' }))
      return sendJson(res, { themes })
    }

    if (path === '/editor/api/render' && req.method === 'POST') {
      const b = await readJsonBody(req)
      const markdown = typeof b.markdown === 'string' ? b.markdown : ''
      if (!markdown) return sendErr(res, { code: 'missing_content', message: '缺少 markdown 正文。', hint: '请提供 markdown 字段。' })
      const theme = resolveTheme(b.theme ?? 'magazine')
      // 编辑器用轻量渲染：跳过 Chromium 截图（每次键入都截会很贵），仅返回 HTML + 校验
      // placeholders=true 仅给组件库的实时预览用：把示例里的 example.com 占位图换成内联 SVG，
      // 否则改个参数重渲染就变成一张裂图。用户自己的正文绝不能走这条分支。
      const source = b.placeholders === true ? withPlaceholderImages(markdown) : markdown
      const r = await renderPreview(source, theme, { includeScreenshot: false })
      return sendJson(res, {
        html: r.html,
        validation: r.validation,
        theme: r.theme,
        diagnostics: r.diagnostics ?? [],
      })
    }

    if (path === '/editor/api/import-html' && req.method === 'POST') {
      const b = await readJsonBody(req)
      const html = typeof b.html === 'string' ? b.html : ''
      if (!html.trim()) {
        return sendErr(res, { code: 'missing_content', message: '缺少 html 内容。', hint: '请提供 html 字段（完整文档或片段均可）。' })
      }
      try {
        const result = htmlToMarkdown(html)
        return sendJson(res, result)
      } catch (error) {
        return sendErr(res, {
          code: 'import_failed',
          message: `HTML 解析失败：${error instanceof Error ? error.message : String(error)}`,
          hint: '请确认导入的是 stylewx 渲染的 HTML（或标准 HTML 片段）。',
        })
      }
    }

    // 本地自定义组件库（编辑器「富组件」面板里展示「我的组件」）
    // 组件库预览：用当前主题把每个组件示例渲染一遍（一次性返回，供「组件库」页展示）
    if (path === '/editor/api/component-previews' && req.method === 'POST') {
      const b = await readJsonBody(req)
      try {
        const theme = resolveTheme(b.theme ?? 'magazine')
        const names = Array.isArray(b.names) ? b.names.filter((x): x is string => typeof x === 'string') : undefined
        return sendJson(res, renderComponentPreviews(theme, { names }))
      } catch (error) {
        return respondErrorOrSend(res, error)
      }
    }
    // 主题库预览：用统一示例文章渲染所有主题（供编辑器「主题预览」页对比）
    if (path === '/editor/api/theme-previews' && req.method === 'POST') {
      try {
        const b = await readJsonBody(req)
        const names = Array.isArray(b.names) ? b.names.filter((x): x is string => typeof x === 'string') : undefined
        return sendJson(res, renderThemePreviews({ names }))
      } catch (error) {
        return respondErrorOrSend(res, error)
      }
    }
    if (path === '/editor/api/components' && req.method === 'GET') {
      try {
        const { components } = listSavedComponents()
        return sendJson(res, { components })
      } catch (error) {
        return sendErr(res, { code: 'list_failed', message: `读取组件库失败：${String(error)}`, hint: '请检查 ~/.stylewx/components.json 是否可读。' })
      }
    }

    // 品牌档案（编辑器「品牌档案」面板）：
    //   GET  /editor/api/brands            → 品牌总览（含 brand.md 原文）
    //   POST /editor/api/brands/apply      → 把品牌的完整主题返回给编辑器（不写盘）
    // 品牌的写操作（导入/导出）走 P1/P2，这里只做「看到 / 应用 / 预览」。
    if (path === '/editor/api/brands' && req.method === 'GET') {
      try {
        return sendJson(res, brandOverview())
      } catch (error) {
        return respondErrorOrSend(res, error)
      }
    }
    if (path === '/editor/api/brands/apply' && req.method === 'POST') {
      const b = await readJsonBody(req)
      const name = typeof b.name === 'string' ? b.name.trim() : ''
      if (!name) {
        return sendErr(res, { code: 'missing_name', message: '缺少品牌名 name。', hint: '请提供要应用的品牌档案 ID。' })
      }
      try {
        const applied = brandApply(name)
        // 注意：brandApply 会把品牌组件同步进全局组件库 —— 这是「正文里 :::组件名 能渲染」的前提，
        // 与 MCP 的 brand_apply 行为一致（同一个 service 实现，不另写逻辑）。
        return sendJson(res, {
          name: applied.profile.name,
          displayName: applied.profile.displayName,
          theme: applied.theme,
          doc: applied.doc,
          components: applied.syncedComponents,
          headerComponent: applied.profile.headerComponent,
          // 封面可能是品牌包内相对路径（assets/cover.png）—— 回给编辑器，
          // 发布时原样传回 + 带 brand 作解析基准（见 editor.html 的 activeBrand）。
          coverImage: applied.profile.coverImage,
          logo: applied.profile.logo,
        })
      } catch (error) {
        return respondErrorOrSend(res, error)
      }
    }

    // 导出：打成 .brand 返回 base64（浏览器自己存盘 —— 服务端不写用户的下载目录）
    if (path === '/editor/api/brands/export' && req.method === 'POST') {
      const b = await readJsonBody(req)
      const name = typeof b.name === 'string' ? b.name.trim() : ''
      if (!name) {
        return sendErr(res, { code: 'missing_name', message: '缺少品牌名 name。', hint: '请提供要导出的品牌档案 ID。' })
      }
      try {
        // 包的落盘位置由服务端定（临时目录），字节直接回给浏览器下载
        const tmpDir = mkdtempSync(join(tmpdir(), 'stylewx-brand-export-'))
        const packed = packBrand(name, {
          out: tmpDir,
          version: typeof b.version === 'string' ? b.version : undefined,
          withSource: b.withSource === true,
        })
        const bytes = readFileSync(packed.path)
        rmSync(tmpDir, { recursive: true, force: true })
        return sendJson(res, {
          fileName: basename(packed.path),
          bytes: bytes.length,
          data: bytes.toString('base64'),
          manifest: packed.manifest,
        })
      } catch (error) {
        return respondErrorOrSend(res, error)
      }
    }

    // 校验/导入：收浏览器传来的 base64 zip（浏览器选的文件在硬盘上，服务端看不到路径）
    if ((path === '/editor/api/brands/validate' || path === '/editor/api/brands/import') && req.method === 'POST') {
      const b = await readJsonBody(req)
      const data = typeof b.data === 'string' ? b.data : ''
      const fileName = typeof b.fileName === 'string' && b.fileName.trim() ? b.fileName.trim() : 'brand.brand'
      if (!data) {
        return sendErr(res, { code: 'missing_content', message: '缺少包内容。', hint: '请通过选择 .brand 文件导入。' })
      }
      // 落到临时文件再走 service（service 只收路径；也顺便让 pack/install 两条路径完全一致）
      const tmpDir = mkdtempSync(join(tmpdir(), 'stylewx-brand-import-'))
      const tmpFile = join(tmpDir, basename(fileName).replace(/[^A-Za-z0-9._-]/g, '_'))
      try {
        writeFileSync(tmpFile, Buffer.from(data, 'base64'))
        if (path.endsWith('/validate')) return sendJson(res, validateBundle(tmpFile))
        const result = installBrand(tmpFile, {
          as: typeof b.as === 'string' && b.as.trim() ? b.as.trim() : undefined,
          forceNew: b.forceNew === true,
        })
        return sendJson(res, result, 201)
      } catch (error) {
        return respondErrorOrSend(res, error)
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    }

    // 挂资产：把本机目录里的身份位图落进品牌目录（打包前的必经一步）
    if (path === '/editor/api/brands/attach-assets' && req.method === 'POST') {
      const b = await readJsonBody(req)
      const name = typeof b.name === 'string' ? b.name.trim() : ''
      const from = typeof b.from === 'string' ? b.from.trim() : ''
      if (!name || !from) {
        return sendErr(res, { code: 'missing_param', message: '缺少 name 或 from。', hint: '用法：{ name, from }，from 是放着 logo-a.png / cover.png 的目录。' })
      }
      try {
        return sendJson(res, attachBrandAssets(name, from))
      } catch (error) {
        return respondErrorOrSend(res, error)
      }
    }

    if (path === '/editor/api/delete-component' && req.method === 'POST') {
      const b = await readJsonBody(req)
      const name = typeof b.name === 'string' ? b.name.trim() : ''
      if (!name) {
        return sendErr(res, { code: 'missing_name', message: '缺少组件名 name。', hint: '请提供要删除的自定义组件名。' })
      }
      try {
        return sendJson(res, deleteUserComponent(name))
      } catch (error) {
        return respondErrorOrSend(res, error)
      }
    }
    if (path === '/editor/api/load-file' && req.method === 'GET') {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const requested = url.searchParams.get('file') ?? ''
      if (!requested) {
        return sendErr(res, { code: 'missing_path', message: '缺少 file 参数。', hint: '用法：/editor/api/load-file?file=<绝对路径>' })
      }
      const target = resolve(requested)
      const root = articlesRoot()
      if (!isInside(root, target)) {
        return sendErr(res, { code: 'path_not_allowed', message: `只能读取文章根目录内的文件：${root}`, hint: '可用环境变量 STYLEWX_ARTICLES_DIR 调整根目录。' })
      }
      try {
        const stat = statSync(target)
        if (!stat.isFile()) throw new Error('不是普通文件')
        if (stat.size > 4 * 1024 * 1024) {
          return sendErr(res, { code: 'file_too_large', message: '文件超过 4MB。', hint: '请选择更小的 Markdown 文件。' })
        }
        const raw = readFileSync(target, 'utf8')
        // .md 可能自带 front-matter（title / theme）。正文返回给编辑器前必须剥掉，
        // 否则 `---` 会被 Markdown 当成分割线渲染出来。
        const { meta, body } = parseFrontMatter(raw)
        const title = meta.title || (/^#\s+(.+)$/m.exec(body)?.[1] ?? '').trim()
        return sendJson(res, { path: target, markdown: body, title, theme: meta.theme })
      } catch (error) {
        return sendErr(res, {
          code: 'load_failed',
          message: `读取失败：${error instanceof Error ? error.message : String(error)}`,
          hint: '请确认路径存在、是文件且可读。',
        })
      }
    }
    if (path === '/editor/api/validate' && req.method === 'POST') {
      const b = await readJsonBody(req)
      return sendJson(res, validateArticle(typeof b.html === 'string' ? b.html : ''))
    }

    if (path === '/editor/api/generate' && req.method === 'POST') {
      if (!deps.llm) return sendErr(res, { code: 'missing_llm_config', message: '需要 LLM 配置。', hint: '请配置 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL 后重启服务。' })
      const b = await readJsonBody(req)
      const result = await generateTheme(
        {
          prompt: typeof b.prompt === 'string' ? b.prompt : undefined,
          article: typeof b.article === 'string' ? b.article : undefined,
          baseTheme: typeof b.baseTheme === 'string' ? b.baseTheme : undefined,
        },
        deps.llm,
      )
      let saved = false
      if (b.save && result.theme) {
        saveTheme(result.theme)
        saved = true
      }
      return sendJson(res, {
        theme: result.theme ? { ...result.theme, origin: 'saved' } : undefined,
        fallback: result.fallback,
        repairAttempts: result.repairAttempts,
        saved,
        analysis: result.analysis,
        previewPng: result.previewPng ? result.previewPng.toString('base64') : undefined,
      })
    }

    if (path === '/editor/api/save-file' && req.method === 'POST') {
      const b = await readJsonBody(req)
      if (typeof b.markdown !== 'string' || !b.markdown.trim()) {
        return sendErr(res, {
          code: 'missing_content',
          message: '正文为空，不会写回文件。',
          hint: '先在编辑器里写点内容再保存。',
        })
      }
      const requested = typeof b.path === 'string' ? b.path.trim() : ''
      // 路径安全（必须在文章根目录内）交给 saveArticle 统一把关，不在这里重复实现。
      const r = saveArticle({
        markdown: b.markdown,
        path: requested || undefined,
        title: typeof b.title === 'string' ? b.title : undefined,
        theme: typeof b.theme === 'string' ? b.theme : undefined,
        force: b.force === true,
      })
      return sendJson(res, {
        path: r.path,
        bytes: r.bytes,
        theme: r.theme ?? null,
        root: r.root,
        savedAt: Date.now(),
      })
    }

    if (path === '/editor/api/list-dir' && req.method === 'GET') {
      // 「另存为」选位置：列出文章根目录下某层的内容。
      const url = new URL(req.url ?? '/', 'http://localhost')
      try {
        return sendJson(res, listDir(url.searchParams.get('dir') ?? ''))
      } catch (error) {
        return respondErrorOrSend(res, error)
      }
    }

    if (path === '/editor/api/make-dir' && req.method === 'POST') {
      // 「另存为」里的新建文件夹。
      const b = await readJsonBody(req)
      try {
        return sendJson(res, makeDir(typeof b.dir === 'string' ? b.dir : ''))
      } catch (error) {
        return respondErrorOrSend(res, error)
      }
    }

    if (path === '/editor/api/savetheme' && req.method === 'POST') {
      const b = await readJsonBody(req)
      if (!b.theme) return sendErr(res, { code: 'invalid_theme', message: '缺少 theme。', hint: '请提供主题 JSON 对象。' })
      const t = saveTheme(b.theme)
      return sendJson(res, { theme: t.theme })
    }

    if (path === '/editor/api/export' && req.method === 'GET') {
      const name = url.searchParams.get('theme') || ''
      const r = exportTheme(name)
      return sendJson(res, { theme: r.theme })
    }

    if (path === '/editor/api/publish' && req.method === 'POST') {
      if (!deps.wechat) return sendErr(res, { code: 'missing_wechat_credential', message: '需要微信凭据。', hint: '请配置 WECHAT_APP_ID / WECHAT_APP_SECRET 后重启服务。' })
      const b = await readJsonBody(req)
      const title = typeof b.title === 'string' && b.title.trim() ? b.title.trim() : ''
      const markdown = typeof b.markdown === 'string' ? b.markdown : ''
      if (!title) return sendErr(res, { code: 'missing_title', message: '缺少标题。', hint: '请提供 title。' })
      // 主题现在收完整对象（排版设置面板会改 token），不再退化到预置名
      const theme = resolveTheme(b.theme ?? 'magazine')
      const { html } = await renderPreview(markdown, theme)
      // 封面：优先本地上传的原始字节（base64），否则用 URL
      const coverData =
        typeof b.coverData === 'string' && b.coverData
          ? { bytes: new Uint8Array(Buffer.from(b.coverData, 'base64')), mimeType: typeof b.coverMime === 'string' ? b.coverMime : 'image/jpeg' }
          : undefined
      const result = await publisherPublishDraft(deps.wechat, {
        content: html,
        title,
        coverImage: typeof b.coverImage === 'string' ? b.coverImage : undefined,
        coverData,
        author: typeof b.author === 'string' ? b.author : undefined,
        relocate: b.relocate !== false,
        // 无封面图时用主题色生成渐变封面，避免默认暖棕跟正文撞色。
        coverPalette: (() => {
          const palette = buildPalette(theme.tokens)
          return { top: palette.primaryStrong, bottom: palette.primarySoft }
        })(),
        // 正文里的本地图片：本服务的资产 URL、file://、绝对路径、品牌包内相对路径。
        // 解析逻辑统一在 @stylewx/service（resolveLocalImage）—— 在这里再写一份必漂。
        // 相对路径以 `brand` 为基准（编辑器应用品牌时会带上，见 editor.html 的 activeBrand）。
        resolveLocal: (src: string) => resolveLocalImage(src, typeof b.brand === 'string' && b.brand ? { brand: b.brand } : undefined),
      })
      return sendJson(res, { media_id: result.media_id, uploadedImages: result.uploadedImages, coverMediaId: result.coverMediaId })
    }

    // 正文图片上传：编辑器把本地图片变成可引用的 URL（预览可看，发布时转微信 CDN）
    if (path === '/editor/api/upload-image' && req.method === 'POST') {
      const b = await readJsonBody(req)
      const data = typeof b.data === 'string' && b.data ? b.data : ''
      const mime = typeof b.mime === 'string' ? b.mime : 'image/jpeg'
      if (!data) return sendErr(res, { code: 'missing_content', message: '缺少图片内容。', hint: '请提供 base64 的 data 字段。' })
      try {
        let bytes = new Uint8Array(Buffer.from(data, 'base64'))
        // 压缩/缩放：GIF 会原样跳过；不需要处理的也原样返回，不做无损「洗一遍」
        const prepared = await prepareImage(bytes, mime, { maxEdge: 1600, maxBytes: 900 * 1024, quality: 82 })
        bytes = prepared.bytes
        const saved = saveImageAsset(bytes, prepared.mimeType)
        const rawBytes = typeof b.rawBytes === 'number' && b.rawBytes > 0 ? b.rawBytes : bytes.length
        return sendJson(res, {
          url: saved.urlPath,
          bytes: saved.bytes,
          width: prepared.width,
          height: prepared.height,
          changed: prepared.changed,
          note: prepared.changed
            ? `已压缩：${Math.round(rawBytes / 1024)}KB → ${Math.round(saved.bytes / 1024)}KB${prepared.width ? `（${prepared.width}×${prepared.height}）` : ''}`
            : '',
        })
      } catch (error) {
        return respondErrorOrSend(res, error)
      }
    }

    // 本地资产图（GET）：预览 iframe 与发布时的 relocate 都依赖它
    if (path.startsWith('/editor/api/asset/') && req.method === 'GET') {
      const found = readImageAssetByUrl(path)
      if (!found) return sendErr(res, { code: 'not_found', message: '图片不存在或已清理。', hint: '上传过的图片存在 ~/.stylewx/assets/，被手动删掉就会 404。' })
      res.writeHead(200, {
        'Content-Type': found.mimeType,
        'Content-Length': String(found.bytes.length),
        'Cache-Control': 'public, max-age=31536000, immutable', // 文件名含随机段，内容不可变
      })
      res.end(Buffer.from(found.bytes))
      return
    }

    // 封面生成：主题色渐变 + 标题 + 品牌角标（带标题的封面，不再是纯渐变兜底）
    if (path === '/editor/api/cover' && req.method === 'POST') {
      const b = await readJsonBody(req)
      try {
        const theme = resolveTheme(b.theme ?? 'magazine')
        const palette = buildPalette(theme.tokens)
        const r = await renderCoverPng({
          title: typeof b.title === 'string' && b.title.trim() ? b.title : '未命名文章',
          brand: typeof b.brand === 'string' ? b.brand : undefined,
          meta: typeof b.meta === 'string' ? b.meta : undefined,
          primary: palette.primary,
        })
        return sendJson(res, { data: r.png.toString('base64'), mime: 'image/png' })
      } catch (error) {
        return respondErrorOrSend(res, error)
      }
    }

    if (path === '/editor/api/optimize' && req.method === 'POST') {
      if (!deps.llm) return sendErr(res, { code: 'missing_llm_config', message: '需要 LLM 配置。', hint: '请配置 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL 后重启服务。' })
      const b = await readJsonBody(req)
      const markdown = typeof b.markdown === 'string' ? b.markdown : ''
      const prompt = typeof b.prompt === 'string' && b.prompt.trim() ? b.prompt.trim() : undefined
      const sel = b.selection as { start?: number; end?: number } | undefined
      const selection =
        sel && typeof sel.start === 'number' && typeof sel.end === 'number' ? { start: sel.start, end: sel.end } : undefined
      const r = await optimizeArticle(markdown, deps.llm, { prompt, selection })
      return sendJson(res, { markdown: r.markdown })
    }

    return sendErr(res, { code: 'not_found', message: '未知 /editor/api 端点：' + path, hint: '请检查路径。' }, 404)
  } catch (error) {
    const e = asServiceError(error)
    return sendErr(res, e.error)
  }
}

async function runStdio(): Promise<void> {
  const server = createMcpServer(buildDeps())
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[stylewx] MCP server (stdio) started.')
}

async function runHttp(port: number): Promise<void> {
  const transports = new Map<string, StreamableHTTPServerTransport>()
  const deps = buildDeps()
  const editorDir = dirname(fileURLToPath(import.meta.url))
  const editorHtmlPath = resolve(editorDir, '../editor.html')
  // 版本号只在 package.json 维护一处，编辑器页脚从包元数据注入（避免页脚与包版本不一致）
  let editorVersion = 'dev'
  try {
    const pkg = JSON.parse(readFileSync(resolve(editorDir, '../package.json'), 'utf8')) as { version?: string }
    if (pkg.version) editorVersion = pkg.version
  } catch {
    // 读不到就走 dev（非常规打包方式下仍可打开编辑器）
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    // 本地 Web 编辑器（WeMD 风格）；每次读取，改 editor.html 后即时生效
    if (path === '/editor') {
      // 必须禁缓存：源码注释说「改 editor.html 后即时生效」，但浏览器会缓存旧页面，
      // 调试时表现为「改了没反应」，很难排查。
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
      })
      res.end(readFileSync(editorHtmlPath, 'utf8').replace(/\{\{VERSION\}\}/g, editorVersion))
      return
    }
    if (path.startsWith('/editor/api/')) {
      await handleEditorApi(req, res, path, url, deps)
      return
    }
    if (path !== '/mcp') {
      res.writeHead(404)
      res.end('Not Found')
      return
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined
    let transport = sessionId ? transports.get(sessionId) : undefined
    const isNew = !transport

    if (req.method === 'GET') {
      // SSE 拉起：必须有既有会话，否则按规范 404
      if (!transport) {
        res.writeHead(404)
        res.end('Not Found')
        return
      }
      await transport.handleRequest(req, res)
      return
    }

    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      })
      const mcp = createMcpServer(buildDeps())
      transport.onclose = () => {
        if (transport && transport.sessionId) transports.delete(transport.sessionId)
      }
      await mcp.connect(transport)
    }

    await transport.handleRequest(req, res)

    // 会话 ID 在处理 initialize 之后才会生成，这里再登记到会话表
    if (isNew && transport.sessionId) {
      transports.set(transport.sessionId, transport)
    }
  })

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.error(`[stylewx] MCP server (Streamable HTTP) listening on http://localhost:${port}/mcp`)
  })

  const shutdown = (): void => {
    server.close()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (options.transport === 'http') {
    await runHttp(options.port)
  } else {
    await runStdio()
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[stylewx] fatal:', error instanceof Error ? error.message : error)
  process.exit(1)
})
