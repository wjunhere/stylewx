/**
 * 真实端到端冒烟：使用真实 LLM（opencode go）跑通
 * analyze_article → generate_theme → render_preview → validate_article，最终 pass:true。
 * 运行： node --env-file=.env apps/mcp-server/scripts/e2e-real.mjs
 */
import {
  analyzeArticle,
  generateTheme,
  renderPreview,
  validateArticle,
  LlmClient,
  loadLlmConfigFromEnv,
} from '@stylewx/service'

const article = `# 一篇关于前端性能优化的思考

## 背景

在构建大型前端应用时，性能往往成为体验的瓶颈。合理的架构与**代码拆分**能显著改善首屏加载速度。

> 有句话说得好：性能优化是长期工程，而非一次性补丁。

## 关键手段

- 懒加载与路由级代码分割
- 合理使用缓存与 CDN
- 减少主线程阻塞，优化渲染路径

## 一点代码

\`\`\`ts
function optimize(entry: string): void {
  void entry
}
\`\`\`

## 结语

好的性能不是炫技，而是对用户时间的尊重。
`

function assert(cond, msg) {
  if (!cond) throw new Error('断言失败: ' + msg)
}

async function main() {
  const llm = new LlmClient(loadLlmConfigFromEnv())
  console.log('[e2e] LLM endpoint =', loadLlmConfigFromEnv().baseUrl, 'model =', loadLlmConfigFromEnv().model)
  console.log('[e2e] 加载配置完成\n')

  // 1. 分析文章
  const analysis = analyzeArticle(article)
  console.log('[e2e] 1) analyze_article ->', analysis.content.type, '/', analysis.suggestedTheme.name)
  assert(analysis.content.type === 'tech', '应识别为 tech')

  // 2. 生成主题（真实 LLM）
  console.log('[e2e] 2) generate_theme (调用真实 LLM, 可能耗时) ...')
  const gen = await generateTheme({ article }, llm)
  console.log('[e2e]   theme.name =', gen.theme.name)
  console.log('[e2e]   fallback =', gen.fallback, '（true=本次LLM输出未通过自检已降级到预置主题；false=生成合法新主题）| repairs =', gen.repairAttempts)
  console.log('[e2e]   analysis.text =', (gen.analysis?.text ?? '').slice(0, 200))
  // 无论生成成功还是降级回退，都必须返回一个可通过校验的完整主题（DoD 要求最终校验 pass:true）
  assert(gen.theme && gen.theme.tokens && gen.theme.blocks, '应返回完整主题对象')

  // 3. 渲染预览
  console.log('[e2e] 3) render_preview ...')
  const preview = await renderPreview(article, gen.theme, { includeScreenshot: true })
  console.log('[e2e]   html 长度 =', preview.html.length, '| 校验 pass =', preview.validation.pass, '| 有截图 =', !!preview.screenshotPng)
  assert(!preview.html.includes('<style'), '输出不应含 <style>')
  assert(!preview.html.includes('class='), '输出不应含 class=')

  // 4. 校验
  const val = validateArticle(preview.html)
  console.log('[e2e] 4) validate_article -> pass =', val.report.pass)
  if (!val.report.pass) {
    console.log('[e2e]   issues =', JSON.stringify(val.report.issues).slice(0, 600))
  }
  assert(val.report.pass === true, '最终校验报告应为 pass:true')

  console.log('\n[e2e] ✅ 真实链路全部通过： analyze_article → generate_theme → render_preview → validate_article (pass:true)')
  process.exit(0)
}

main().catch((error) => {
  console.error('[e2e] 失败:', error instanceof Error ? error.message : error)
  process.exit(1)
})
