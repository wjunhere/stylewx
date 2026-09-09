/**
 * SVG 构造工具。
 *
 * 微信实测约束（真实 draft/add → draft/get 验证）：
 * - 会剥离所有 `id` 属性 → 禁止使用 `url(#…)`、`<use>`、`<linearGradient>`、`<clipPath>` 引用；
 * - 会移除 `<svg>` 内的 `<a>`；
 * - 属性名被小写化（viewBox → viewbox），浏览器 HTML 解析器会按规范纠正回来，因此照常写驼峰即可；
 * - `<animate>` / `<animateTransform>` / `<set>` + `begin="click"` 全部保留并真实生效。
 */
import { styleAttr } from './style.js'
import type { StyleMap } from './style.js'

/** 生成 `<svg>` 根元素：始终带 xmlns、viewBox、宽度自适应。 */
export function svgRoot(params: {
  viewBox: string
  children: string
  style?: StyleMap
  slice?: boolean
}): string {
  const style: StyleMap = {
    width: '100%',
    display: 'block',
    ...(params.style ?? {}),
  }
  const preserve = params.slice ? 'xMidYMid slice' : 'xMidYMid meet'
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${params.viewBox}"` +
    ` preserveAspectRatio="${preserve}"${styleAttr(style)}>${params.children}</svg>`
  )
}

/** SVG 文本节点。 */
export function svgText(params: {
  x: number
  y: number
  text: string
  size?: number
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
  weight?: number | string
  family?: string
  opacity?: number
  children?: string
}): string {
  const attrs = [
    `x="${params.x}"`,
    `y="${params.y}"`,
    `font-size="${params.size ?? 14}"`,
    `fill="${params.fill ?? '#333333'}"`,
    params.anchor ? `text-anchor="${params.anchor}"` : '',
    params.weight ? `font-weight="${params.weight}"` : '',
    params.family ? `font-family="${params.family}"` : '',
    params.opacity !== undefined ? `opacity="${params.opacity}"` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return `<text ${attrs}>${params.text}${params.children ?? ''}</text>`
}

/** `<animate>` 节点（SMIL）。 */
export function svgAnimate(params: {
  attributeName: string
  from?: string
  to?: string
  values?: string
  keyTimes?: string
  dur: string
  begin?: string
  repeatCount?: string | number
  fill?: 'freeze' | 'remove'
  calcMode?: 'linear' | 'discrete' | 'spline'
  restart?: 'always' | 'whenNotActive' | 'never'
}): string {
  const attrs = [
    `attributeName="${params.attributeName}"`,
    params.from !== undefined ? `from="${params.from}"` : '',
    params.to !== undefined ? `to="${params.to}"` : '',
    params.values !== undefined ? `values="${params.values}"` : '',
    params.keyTimes !== undefined ? `keyTimes="${params.keyTimes}"` : '',
    `dur="${params.dur}"`,
    params.begin ? `begin="${params.begin}"` : '',
    params.repeatCount !== undefined ? `repeatCount="${params.repeatCount}"` : '',
    params.fill ? `fill="${params.fill}"` : '',
    params.calcMode ? `calcMode="${params.calcMode}"` : '',
    params.restart ? `restart="${params.restart}"` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return `<animate ${attrs}></animate>`
}

/** `<animateTransform>` 节点（平移/缩放/旋转）。 */
export function svgAnimateTransform(params: {
  type: 'translate' | 'scale' | 'rotate'
  from?: string
  to?: string
  values?: string
  dur: string
  begin?: string
  repeatCount?: string | number
  fill?: 'freeze' | 'remove'
}): string {
  const attrs = [
    `attributeName="transform"`,
    `type="${params.type}"`,
    params.from !== undefined ? `from="${params.from}"` : '',
    params.to !== undefined ? `to="${params.to}"` : '',
    params.values !== undefined ? `values="${params.values}"` : '',
    `dur="${params.dur}"`,
    params.begin ? `begin="${params.begin}"` : '',
    params.repeatCount !== undefined ? `repeatCount="${params.repeatCount}"` : '',
    params.fill ? `fill="${params.fill}"` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return `<animateTransform ${attrs}></animateTransform>`
}

/** `<rect>` 节点。 */
export function svgRect(params: {
  x?: number
  y?: number
  width: number | string
  height: number | string
  rx?: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  children?: string
}): string {
  const attrs = [
    params.x !== undefined ? `x="${params.x}"` : '',
    params.y !== undefined ? `y="${params.y}"` : '',
    `width="${params.width}"`,
    `height="${params.height}"`,
    params.rx !== undefined ? `rx="${params.rx}"` : '',
    params.fill ? `fill="${params.fill}"` : '',
    params.stroke ? `stroke="${params.stroke}"` : '',
    params.strokeWidth !== undefined ? `stroke-width="${params.strokeWidth}"` : '',
    params.opacity !== undefined ? `opacity="${params.opacity}"` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return `<rect ${attrs}>${params.children ?? ''}</rect>`
}

/** `<circle>` 节点。 */
export function svgCircle(params: {
  cx: number
  cy: number
  r: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  children?: string
}): string {
  const attrs = [
    `cx="${params.cx}"`,
    `cy="${params.cy}"`,
    `r="${params.r}"`,
    params.fill ? `fill="${params.fill}"` : '',
    params.stroke ? `stroke="${params.stroke}"` : '',
    params.strokeWidth !== undefined ? `stroke-width="${params.strokeWidth}"` : '',
    params.opacity !== undefined ? `opacity="${params.opacity}"` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return `<circle ${attrs}>${params.children ?? ''}</circle>`
}

/** `<path>` 节点。 */
export function svgPath(params: {
  d: string
  fill?: string
  stroke?: string
  strokeWidth?: number
  strokeLinecap?: 'butt' | 'round' | 'square'
  strokeDasharray?: string
  strokeDashoffset?: number | string
  opacity?: number
  children?: string
}): string {
  const attrs = [
    `d="${params.d}"`,
    params.fill ? `fill="${params.fill}"` : 'fill="none"',
    params.stroke ? `stroke="${params.stroke}"` : '',
    params.strokeWidth !== undefined ? `stroke-width="${params.strokeWidth}"` : '',
    params.strokeLinecap ? `stroke-linecap="${params.strokeLinecap}"` : '',
    params.strokeDasharray ? `stroke-dasharray="${params.strokeDasharray}"` : '',
    params.strokeDashoffset !== undefined ? `stroke-dashoffset="${params.strokeDashoffset}"` : '',
    params.opacity !== undefined ? `opacity="${params.opacity}"` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return `<path ${attrs}>${params.children ?? ''}</path>`
}

/** `<g>` 分组。 */
export function svgGroup(params: { transform?: string; opacity?: number; children: string }): string {
  const attrs = [
    params.transform ? `transform="${params.transform}"` : '',
    params.opacity !== undefined ? `opacity="${params.opacity}"` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return `<g${attrs ? ' ' + attrs : ''}>${params.children}</g>`
}
