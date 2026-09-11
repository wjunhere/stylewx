import type { ComponentStyleOverrides } from './overrides.js'
/**
 * 组件 AST 类型。
 * 组件用 `:::name{props}` … `:::` 语法书写；冒号数量用于支持嵌套（外层用更多冒号）。
 */

/** 一段原样交给 Markdown 管线渲染的文本。 */
export interface MarkdownNode {
  type: 'markdown'
  value: string
}

/** 一个富组件节点。 */
export interface ComponentNode {
  type: 'component'
  /** 组件名（小写、连字符），例如 card / section-title / image-card。 */
  name: string
  /** 组件参数，来自 `{key="value"}`；无值参数值为 'true'。 */
  props: Record<string, string>
  /** 组件的原始正文（仅含本层直接文本，不含嵌套组件源码）。 */
  body: string
  /** 已解析的子节点（Markdown 文本段 + 嵌套组件）。 */
  children: RenderNode[]
  /** 组件在原文中的起始行号（从 1 开始，用于诊断）。 */
  line: number
}

export type RenderNode = MarkdownNode | ComponentNode

/** 渲染上下文：由 core 注入 Markdown 渲染能力，组件自身保持同构、无依赖。 */
export interface RenderContext {
  /** 把 Markdown 文本渲染为 HTML（由 core 提供，保证与主管线一致）。 */
  renderMarkdown: (markdown: string) => string
  /** 渲染组件的子节点（含嵌套组件）。由 core 注入，避免循环依赖。 */
  renderChildren: (node: ComponentNode) => string
  /** 主题级组件样式覆盖（components.<组件名>.<部位>）。 */
  componentStyles?: ComponentStyleOverrides
  /**
   * 给组件部位打标记（渲染期临时属性，应用覆盖后会被剥离）。
   * 仅当该组件确实存在样式覆盖时才产出标记，未使用时输出与之前完全一致。
   */
  slot: (name: string) => string
  /** 内部使用：当前组件是否存在样式覆盖（决定是否产出部位标记）。 */
  slotEnabled?: boolean
  /** 组件配色（由主题 tokens 派生）。 */
  palette: ComponentPalette
  /** 文档中出现过的标题（供 toc 组件使用）。 */
  headings: HeadingInfo[]
  /** 渲染过程中收集到的诊断信息。 */
  diagnostics: ComponentDiagnostic[]
}

/** 文档标题信息。 */
export interface HeadingInfo {
  level: number
  text: string
}

/** 组件渲染诊断（未知组件、参数缺失等），不抛错，交给上层决定如何呈现。 */
export interface ComponentDiagnostic {
  level: 'warning' | 'error'
  component: string
  message: string
  line?: number
}

/** 组件配色，全部由主题 tokens 派生，保证组件随主题变化。 */
export interface ComponentPalette {
  primary: string
  primarySoft: string
  primaryStrong: string
  onPrimary: string
  text: string
  muted: string
  weak: string
  cardBg: string
  cardBorder: string
  divider: string
  canvasBg: string
  fontFamily: string
  fontSize: string
  lineHeight: string
  blockGap: string
  radiusSm: string
  radius: string
  radiusLg: string
}

/** 单个组件的渲染函数签名。 */
export type ComponentRenderer = (node: ComponentNode, ctx: RenderContext) => string
