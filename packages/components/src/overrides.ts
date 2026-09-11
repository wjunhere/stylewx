/**
 * 组件样式覆盖引擎。
 *
 * 目标：让 agent 能把**任意微信白名单内的 CSS**落到**组件的任意部位**，而不用改 22 个渲染器。
 *
 * 寻址方式（三种）：
 * - `root` —— 组件最外层元素
 * - `*`    —— 组件内所有元素（适合统一字体/颜色/行高这类可继承属性）；
 *              不会进入嵌套组件的子树（内层组件在它自己的渲染阶段已处理过）
 * - 语义槽位 —— 渲染器用 `data-swx-slot="title"` 标记的部位，如 title / body / dot / label …
 *
 * 优先级（后者覆盖前者）：`*` → `root` 或槽位 → 实例级 `style`。
 *
 * 该模块只在**确实存在覆盖时**才解析/序列化；未使用时原样返回，保证既有输出零变化。
 * `data-swx-slot` 是渲染期的临时标记，应用后会被剥离，不会进入最终产物。
 */
import { unified } from 'unified'
import rehypeParse from 'rehype-parse'
import rehypeStringify from 'rehype-stringify'

/** 单个部位的声明表：{ 'font-size': '17px' }。 */
export type SlotStyle = Record<string, string>
/** 单个组件的覆盖表：{ root: {...}, title: {...}, '*': {...} }。 */
export type ComponentStyleOverride = Record<string, SlotStyle>
/** 全量覆盖表：{ card: { title: {...} }, badge: { root: {...} } }。 */
export type ComponentStyleOverrides = Record<string, ComponentStyleOverride>

export const ROOT_SLOT = 'root'
export const ALL_SLOT = '*'

interface HastNode {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

const SLOT_PROP = 'dataSwxSlot'
const MARKER_PROP = 'dataSwx'

/** 解析 `a:b;c:d` 形式的声明串。 */
export function parseStyleDeclarations(style: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!style) return out
  for (const seg of style.split(';')) {
    const trimmed = seg.trim()
    if (!trimmed) continue
    const colon = trimmed.indexOf(':')
    if (colon <= 0) continue
    const prop = trimmed.slice(0, colon).trim().toLowerCase()
    const value = trimmed.slice(colon + 1).trim()
    if (prop && value) out[prop] = value
  }
  return out
}

function serializeStyle(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
}

/** 把若干层覆盖依次合并进元素的 style（后者优先）。 */
function mergeInto(properties: Record<string, unknown>, layers: (SlotStyle | undefined)[]): void {
  if (layers.every((l) => !l)) return
  const declarations = parseStyleDeclarations(
    typeof properties['style'] === 'string' ? (properties['style'] as string) : undefined,
  )
  for (const layer of layers) {
    if (!layer) continue
    for (const [rawProp, value] of Object.entries(layer)) {
      const prop = rawProp.trim().toLowerCase()
      if (!prop || value === undefined || value === '') continue
      declarations[prop] = value
    }
  }
  properties['style'] = serializeStyle(declarations)
}

export interface ApplyStylesResult {
  html: string
  /** 实际命中的寻址键（用于诊断：例如 title 没出现说明该组件没有这个部位）。 */
  appliedSlots: string[]
}

/**
 * 对单个组件渲染出的 HTML 应用样式覆盖，并剥离 `data-swx-slot` 标记。
 * @param html 渲染器产出的 HTML
 * @param overrides 主题里该组件的覆盖表
 * @param instanceStyle 实例级 `style` 属性（优先级最高，只作用于根元素）
 */
export function applyComponentStyles(
  html: string,
  overrides: ComponentStyleOverride | undefined,
  instanceStyle?: string,
): ApplyStylesResult {
  const all = overrides?.[ALL_SLOT]
  const rootStyle = overrides?.[ROOT_SLOT]
  const hasInstance = Boolean(instanceStyle && instanceStyle.trim())
  const instance = hasInstance ? parseStyleDeclarations(instanceStyle) : undefined
  if (!all && !rootStyle && !instance && !overrides) return { html, appliedSlots: [] }

  const processor = unified().use(rehypeParse, { fragment: true }).use(rehypeStringify)
  const tree = processor.parse(html) as unknown as HastNode
  const applied = new Set<string>()

  const walk = (node: HastNode, depth: number): void => {
    if (node.type !== 'element') {
      for (const child of node.children ?? []) walk(child, depth)
      return
    }
    const props = node.properties ?? (node.properties = {})

    // 嵌套组件：其覆盖已在自己的渲染阶段应用，这里整棵子树跳过
    if (depth > 0 && MARKER_PROP in props) return

    const slotName = typeof props[SLOT_PROP] === 'string' ? (props[SLOT_PROP] as string) : undefined
    const layers: (SlotStyle | undefined)[] = []
    if (all) layers.push(all)
    if (slotName && overrides?.[slotName]) layers.push(overrides[slotName])
    if (depth === 0) {
      if (rootStyle) layers.push(rootStyle)
      if (instance) layers.push(instance)
    }

    if (layers.some(Boolean)) {
      mergeInto(props, layers)
      if (all) applied.add(ALL_SLOT)
      if (slotName && overrides?.[slotName]) applied.add(slotName)
      if (depth === 0 && rootStyle) applied.add(ROOT_SLOT)
      if (depth === 0 && instance) applied.add('style')
    }

    delete props[SLOT_PROP]
    for (const child of node.children ?? []) walk(child, depth + 1)
  }

  for (const child of tree.children ?? []) walk(child, 0)

  return { html: String(processor.stringify(tree as never)), appliedSlots: [...applied] }
}
