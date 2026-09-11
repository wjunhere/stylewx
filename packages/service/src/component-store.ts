/**
 * 本地组件库：把 agent 自定义的组件模板持久化到本地，用 `:::名字` 调用。
 * 默认存到用户级 `~/.stylewx/components.json`（可用 STYLEWX_COMPONENTS_PATH 覆盖）。
 * 注意：本模块使用 Node fs —— 只允许出现在 service 层。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { COMPONENT_RENDERERS, renderUserComponent } from '@stylewx/components'
import type { UserComponentDef } from '@stylewx/components'
import { serviceError } from './errors.js'
import { validateHtml } from '@stylewx/validator'

const DEFAULT_DIR = join(homedir(), '.stylewx')
const DEFAULT_FILE = join(DEFAULT_DIR, 'components.json')

export interface ComponentStoreOptions {
  /** 覆盖存储文件路径（测试用）。 */
  file?: string
}

function storeFile(opts?: ComponentStoreOptions): string {
  return opts?.file ?? process.env.STYLEWX_COMPONENTS_PATH ?? DEFAULT_FILE
}

const NAME_RE = /^[a-z][a-z0-9-]*$/

/** 内置组件名（含别名），不允许被自定义组件占用。 */
export function reservedComponentNames(): Set<string> {
  return new Set([
    ...Object.keys(COMPONENT_RENDERERS),
    'info',
    'tip',
    'important',
    'warning',
    'danger',
    'success',
    'note',
    'callout',
    'divider',
    'section-title',
    'badge',
    'canvas',
    'background',
    'draw',
    'follow',
  ])
}

function readComponents(file: string): UserComponentDef[] {
  try {
    if (!existsSync(file)) return []
    const raw = readFileSync(file, 'utf8')
    const data = JSON.parse(raw) as { components?: UserComponentDef[] } | UserComponentDef[]
    const arr = Array.isArray(data) ? data : (data.components ?? [])
    return arr.filter(
      (c): c is UserComponentDef =>
        !!c && typeof c === 'object' && typeof c.name === 'string' && typeof c.template === 'string',
    )
  } catch {
    return []
  }
}

function writeComponents(file: string, components: UserComponentDef[]): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ components }, null, 2), 'utf8')
}

/** 列出本地自定义组件（渲染时直接注入用）。 */
export function listUserComponents(opts?: ComponentStoreOptions): UserComponentDef[] {
  return readComponents(storeFile(opts)).map((c) => structuredClone(c))
}

/** 列出本地自定义组件（MCP 返回用）。 */
export function listSavedComponents(opts?: ComponentStoreOptions): { components: UserComponentDef[] } {
  return { components: listUserComponents(opts) }
}

/** 把自定义组件表转成渲染上下文需要的 Map。 */
export function userComponentMap(opts?: ComponentStoreOptions): Record<string, UserComponentDef> {
  const map: Record<string, UserComponentDef> = {}
  for (const def of listUserComponents(opts)) map[def.name] = def
  return map
}

export interface ValidateComponentResult {
  ok: boolean
  issues: string[]
}

/**
 * 用一个「理想输入」渲染模板并跑微信校验，提前发现模板问题。
 * 这是保存自定义组件的安全闸门：禁止的标签（script/style/iframe…）、
 * 事件属性、被过滤的 CSS 属性都会在这里被拦下。
 */
export function validateUserComponent(def: UserComponentDef): ValidateComponentResult {
  const issues: string[] = []
  const problems: string[] = []

  // 用一份「把所有 prop 都填上」的样本来渲染，尽量覆盖到各分支
  const sampleProps: Record<string, string> = { ...(def.defaults ?? {}) }
  for (const key of Object.keys(def.defaults ?? {})) sampleProps[key] = '样例'
  // 模板里出现的 prop 也补上占位值，避免被 {{#if}} 跳过
  for (const m of def.template.matchAll(/\{\{\s*#?(?:if|unless)\s+([a-zA-Z0-9_.-]+)\s*\}\}/g)) {
    if (m[1]) sampleProps[m[1]] = '样例'
  }
  for (const m of def.template.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*(?:\|\s*raw\s*)?\}\}/g)) {
    const key = m[1] as string
    if (!key || key.startsWith('theme.') || key === 'body' || key === 'this' || key === '@index') continue
    sampleProps[key] = sampleProps[key] ?? '样例'
  }

  const fakeNode = {
    type: 'component' as const,
    name: def.name,
    props: sampleProps,
    body: '第一行 | 说明\n第二行 | 说明',
    children: [],
    line: 1,
  }
  const ctx = {
    renderMarkdown: () => '<p>样例正文</p>',
    renderChildren: () => '<p>样例正文</p>',
    slot: () => '',
    palette: {
      primary: '#0b6bff',
      primarySoft: '#eef4ff',
      primaryStrong: '#0847a8',
      onPrimary: '#ffffff',
      text: '#1f2329',
      muted: '#6b7280',
      weak: '#9aa1ab',
      cardBg: '#f5f8ff',
      cardBorder: '#dbe6ff',
      divider: '#e6e9ee',
      canvasBg: '#f7f8fa',
      fontFamily: 'sans-serif',
      fontSize: '15px',
      lineHeight: '1.75',
      blockGap: '16px',
      radiusSm: '6px',
      radius: '12px',
      radiusLg: '19px',
    },
    headings: [],
    diagnostics: [],
  }

  const { html } = renderUserComponent(def, fakeNode as never, ctx as never, '<p>样例正文</p>')
  if (!html.trim()) issues.push('模板渲染结果为空，请检查模板内容。')
  if (!/<[a-zA-Z]/.test(html)) issues.push('模板至少要产出一个 HTML 元素（否则无法承载样式与标记）。')

  const report = validateHtml(html)
  for (const issue of report.issues) {
    if (issue.severity !== 'error') continue
    problems.push(`${issue.rule}: ${issue.message}`)
  }
  issues.push(...problems)
  return { ok: issues.length === 0, issues }
}

export interface SaveComponentResult {
  component: UserComponentDef
  /** 保存前的模板自检结果（已通过才会有 component）。 */
  warnings: string[]
}

/** 保存（或覆盖）一个自定义组件定义，保存前做模板自检。 */
export function saveUserComponent(input: unknown, opts?: ComponentStoreOptions): SaveComponentResult {
  if (!input || typeof input !== 'object') {
    throw serviceError('invalid_component', '组件定义必须是对象。', '请提供 { name, template, description? }。')
  }
  const raw = input as Partial<UserComponentDef>
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) {
    throw serviceError('invalid_component', '缺少组件名 name。', '请提供小写字母/数字/连字符组成的组件名，例如 brand-quote。')
  }
  if (!NAME_RE.test(name)) {
    throw serviceError(
      'invalid_component',
      `组件名「${name}」不合法。`,
      '只能用「小写字母开头 + 小写字母/数字/连字符」，例如 brand-quote。',
    )
  }
  if (reservedComponentNames().has(name)) {
    throw serviceError(
      'invalid_component',
      `组件名「${name}」与内置组件重名。`,
      '请换一个名字（内置组件见 list_components 的 origin=builtin 条目）。',
    )
  }
  const template = typeof raw.template === 'string' ? raw.template.trim() : ''
  if (!template) {
    throw serviceError(
      'invalid_component',
      '缺少 template。',
      '模板里可用 {{prop}}、{{body}}、{{theme.primary}}、{{#if prop}}…{{/if}}、{{#each body}}…{{/each}}。',
    )
  }

  const def: UserComponentDef = {
    name,
    description: typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim() : `${name}（自定义组件）`,
    template,
    defaults: raw.defaults && typeof raw.defaults === 'object' ? { ...raw.defaults } : undefined,
    slots: Array.isArray(raw.slots) ? raw.slots.filter((x): x is string => typeof x === 'string') : undefined,
  }

  const check = validateUserComponent(def)
  if (!check.ok) {
    throw serviceError(
      'invalid_component',
      `模板自检未通过：${check.issues.join('；')}`,
      '请修正后重试：不要用 script/style/iframe/input 等微信会过滤的标签，不要用 position/filter 等被过滤的 CSS，不要写 on* 事件属性。',
    )
  }

  const file = storeFile(opts)
  const all = readComponents(file)
  const idx = all.findIndex((c) => c.name === name)
  if (idx >= 0) all[idx] = def
  else all.push(def)
  writeComponents(file, all)
  return { component: def, warnings: [] }
}

/** 删除一个自定义组件。 */
export function deleteUserComponent(name: string, opts?: ComponentStoreOptions): { deleted: string } {
  const file = storeFile(opts)
  const all = readComponents(file)
  const next = all.filter((c) => c.name !== name)
  if (next.length === all.length) {
    throw serviceError('invalid_component', `没有自定义组件「${name}」。`, '请用 list_components 查看已定义的自定义组件。')
  }
  writeComponents(file, next)
  return { deleted: name }
}
