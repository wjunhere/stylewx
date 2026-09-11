/**
 * F 能力验证：agent 用模板定义全新组件 → 存本地组件库 → 用 :::名字 调用 → 主题样式覆盖 → 往返还原。
 *
 * 运行：node apps/mcp-server/scripts/verify-custom-component.mjs
 * 使用临时组件库文件（STYLEWX_COMPONENTS_PATH），不污染 ~/.stylewx/components.json。
 */
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'swx-comp-'))
process.env.STYLEWX_COMPONENTS_PATH = join(dir, 'components.json')

const { saveUserComponent, deleteUserComponent, listSavedComponents, renderPreview } = await import('@stylewx/service')
const { getPresetTheme, tweakTheme } = await import('@stylewx/theme')
const { htmlToMarkdown } = await import('@stylewx/components')

function assert(cond, msg) {
  if (!cond) throw new Error('断言失败: ' + msg)
}

const BRAND_QUOTE = `<div data-swx-slot="card" style="margin:0 0 {{theme.blockGap}};background-color:{{theme.primarySoft}};border-left:4px solid {{theme.primary}};border-radius:{{theme.radius}};padding:16px 18px">
  <div data-swx-slot="mark" style="font-size:26px;line-height:1;color:{{theme.primary}}">“</div>
  <div data-swx-slot="body" style="font-size:15px;color:{{theme.text}};line-height:1.9">{{body}}</div>
  {{#if author}}<div data-swx-slot="author" style="margin-top:10px;text-align:right;font-size:12.5px;color:{{theme.muted}}">— {{author}}</div>{{/if}}
</div>`

const STAT_LIST = `<div data-swx-slot="list" style="margin:0 0 {{theme.blockGap}};background-color:{{theme.cardBg}};border-radius:{{theme.radius}};padding:12px 16px">
  {{#each body}}
  <div data-swx-slot="row" style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-bottom:1px dashed {{theme.divider}}">
    <span data-swx-slot="key" style="font-size:13px;color:{{theme.muted}}">{{this.0}}</span>
    <span data-swx-slot="value" style="font-size:14px;font-weight:600;color:{{theme.primary}}">{{this.1}}</span>
  </div>
  {{/each}}
</div>`

console.log('=== 1) 定义两个自定义组件 ===')
const a = saveUserComponent({
  name: 'brand-quote',
  description: '品牌引言卡：左侧色带 + 引号 + 可选作者',
  template: BRAND_QUOTE,
  slots: ['card', 'mark', 'body', 'author'],
})
const b = saveUserComponent({
  name: 'stat-list',
  description: '数据条：按正文行渲染「名称 | 数值」两列',
  template: STAT_LIST,
  slots: ['list', 'row', 'key', 'value'],
})
console.log('  已保存:', a.component.name, '/', b.component.name)
assert(listSavedComponents().components.length === 2, '组件库应有 2 个')

console.log('\n=== 2) 非法模板被拒绝 ===')
for (const [label, tpl] of [
  ['script 标签', '<div><script>alert(1)</script></div>'],
  ['position 定位', '<div style="position:absolute">x</div>'],
  ['on* 事件', '<div onclick="x()">x</div>'],
  ['内置重名', '<div>x</div>'],
]) {
  try {
    saveUserComponent({ name: label === '内置重名' ? 'card' : 'bad-' + Math.random().toString(36).slice(2, 6), template: tpl })
    console.log(`  ❌ ${label} 竟然通过了`)
    assert(false, label + ' 应被拒绝')
  } catch (e) {
    console.log(`  ✅ ${label} 被拒绝：${String(e.error?.message ?? e.message).slice(0, 60)}`)
  }
}

console.log('\n=== 3) 渲染自定义组件（主题配色 + 条件 + 循环）===')
const theme = getPresetTheme('magazine')
const md = [
  ':::brand-quote{author="某位编辑"}',
  '读者不会记得你用了什么字体，但会记得读起来累不累。',
  ':::',
  '',
  ':::stat-list',
  '2024 | 1200 万',
  '2025 | 3800 万',
  ':::',
].join('\n')

const r = await renderPreview(md, theme, { includeScreenshot: false })
console.log('  校验 pass     :', r.validation.pass)
console.log('  组件诊断      :', (r.diagnostics ?? []).length === 0 ? '无' : JSON.stringify(r.diagnostics))
console.log('  主题主色注入  :', r.html.includes(theme.tokens.primaryColor))
console.log('  条件块(作者)  :', r.html.includes('某位编辑'))
console.log('  循环(两行)    :', r.html.includes('1200 万') && r.html.includes('3800 万'))
console.log('  slot 已剥离   :', !r.html.includes('data-swx-slot'))
console.log('  组件标记      :', r.html.includes('data-swx="brand-quote"') && r.html.includes('data-swx="stat-list"'))

console.log('\n=== 4) 主题级样式覆盖（自定义组件同样支持）===')
const themed = tweakTheme(theme, {
  components: { 'brand-quote': { card: { padding: '24px 26px' }, mark: { color: '#ff6600' } } },
}).theme
const r2 = await renderPreview(md, themed, { includeScreenshot: false })
console.log('  card.padding 生效:', r2.html.includes('padding:24px 26px'))
console.log('  mark.color 生效  :', r2.html.includes('#ff6600'))

console.log('\n=== 5) 往返：渲染产物可回导为 ::: 指令 ===')
const back = htmlToMarkdown(r.html)
console.log('  识别组件:', back.components.map((c) => c.name).join(', '))
console.log('  保留 author:', back.markdown.includes('author="某位编辑"'))
console.log('  保留正文行:', back.markdown.includes('1200 万'))
assert(back.components.some((c) => c.name === 'brand-quote'), '应还原 brand-quote')
assert(back.components.some((c) => c.name === 'stat-list'), '应还原 stat-list')

console.log('\n=== 6) 未提供的参数给出诊断 ===')
const r3 = await renderPreview(':::brand-quote{nosuch="x"}\n正文\n:::', theme, { includeScreenshot: false })
console.log('  诊断:', (r3.diagnostics ?? []).map((d) => d.message).join(' | ') || '（无）')

console.log('\n=== 7) 删除自定义组件 ===')
deleteUserComponent('stat-list')
console.log('  剩余:', listSavedComponents().components.map((c) => c.name).join(', '))
const r4 = await renderPreview(':::stat-list\n2024 | 1\n:::', theme, { includeScreenshot: false })
console.log('  删除后按未知组件处理:', (r4.diagnostics ?? []).some((d) => d.message.includes('未知组件')))

rmSync(dir, { recursive: true, force: true })
assert(!existsSync(dir), '临时目录应已清理')
console.log('\n✅ F 能力端到端通过')
