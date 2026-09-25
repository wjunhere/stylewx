/**
 * 视频占位组件。
 *
 * 为什么是「占位」而不是真播放器：见 docs/DESIGN.md §20.10 的实测结论——
 * `draft/add` 写不进能播的视频结构。实测五种候选：
 *   - `<iframe class="video_iframe" data-vid=…>` → 被整个删掉
 *   - `<mpvideo data-vid=…>`                      → 存活，但读者端渲染成 **0×0 不可见**
 *   - `<mp-common-videosnap>`                     → 被剥掉
 * 唯一可靠的路是「上传走 API（add_material?type=video）+ 插入走浏览器点官方「视频」组件」。
 *
 * 所以本组件只产出**封面 + 播放提示**，并在 DOM 里留一条机器可读的占位标记
 * （`data-swx-video` / `data-swx-video-title`），让发布脚本（`--video`）与人
 * 精确找到「这里该插一个视频」的位置。视频源在渲染期不存在（vid 要上传后才拿到），
 * 所以这里不写任何假 src——宁可少一个属性，也不要放一个看起来能播、实际是死链的地址。
 *
 * 两条硬约束（都踩过）：
 *   1. **不能用 `position`**——微信草稿 API 会裁掉它（白名单 BANNED 档），校验直接报 error。
 *      所以「画中叠三角」不用绝对定位，而是整块用一个 `<svg>` 画（与 carousel 同路数）。
 *   2. 不用 `filter`（同理被裁）。光晕/阴影一律不画。
 */
import { escapeAttr, escapeHtml, css, prop, boolProp } from '../style.js'
import { svgRoot } from '../svg.js'
import type { ComponentNode, RenderContext } from '../types.js'

const COVER_W = 320
const COVER_H = 180

/** 封面 + 播放三角，整块用 SVG 画（避开 position）。 */
function coverBlock(cover: string, alt: string, palette: { radius: string }): string {
  const cx = COVER_W / 2
  const cy = COVER_H / 2
  // 三角用半透明黑圆托底，保证在任何封面上都看得见
  const svg = svgRoot({
    viewBox: `0 0 ${COVER_W} ${COVER_H}`,
    style: { 'border-radius': palette.radius, overflow: 'hidden' },
    children:
      `<image href="${escapeAttr(cover)}" x="0" y="0" width="${COVER_W}" height="${COVER_H}" preserveAspectRatio="xMidYMid slice"/>` +
      `<circle cx="${cx}" cy="${cy}" r="26" fill="#000000" opacity="0.42"/>` +
      `<path d="M${cx - 8} ${cy - 12} L${cx + 14} ${cy} L${cx - 8} ${cy + 12} Z" fill="#FFFFFF"/>`,
  })
  return `<section style="${css({ 'line-height': '0' })}" aria-label="${escapeAttr(alt)}">${svg}</section>`
}

/** 视频占位。props：src（封面图）、vid、title、caption、hint、show-hint。 */
function renderVideo(node: ComponentNode, ctx: RenderContext): string {
  const p = node.props
  const palette = ctx.palette
  const cover = prop(p, 'src')
  const vid = prop(p, 'vid')
  const title = prop(p, 'title')
  const caption = prop(p, 'caption')
  const hint = prop(p, 'hint', '视频将在发布时由编辑器插入')
  const showHint = boolProp(p, 'show-hint', true)

  // 占位标记：发布脚本据此定位、人据此知道该在哪插视频。
  const mark =
    ` data-swx-video="1"` +
    (vid ? ` data-swx-video-vid="${escapeAttr(vid)}"` : '') +
    (title ? ` data-swx-video-title="${escapeAttr(title)}"` : '')

  const body = cover
    ? coverBlock(cover, title || caption || '视频', palette)
    : // 没封面时给一个「视频框」外观，而不是空白——否则在编辑器里看不出这里该有东西
      `<section style="${css({
        padding: '26px 18px',
        'border-radius': palette.radius,
        background: palette.cardBg,
        border: `1px dashed ${palette.cardBorder}`,
        'text-align': 'center',
      })}">` +
      (title
        ? `<section style="${css({ 'font-size': '14px', 'font-weight': '600', color: palette.text, 'margin-bottom': '6px' })}">${escapeHtml(title)}</section>`
        : '') +
      (showHint ? `<section style="${css({ 'font-size': '12.5px', color: palette.weak })}">${escapeHtml(hint)}</section>` : '') +
      `</section>`

  const cap = caption
    ? `<section style="${css({ 'font-size': '12.5px', color: palette.weak, 'text-align': 'center', 'margin-top': '7px' })}">${escapeHtml(caption)}</section>`
    : ''

  return `<section${mark} style="${css({ margin: `0 0 ${palette.blockGap}` })}">${body}</section>${cap}`
}

export const videoComponents: Record<string, (node: ComponentNode, ctx: RenderContext) => string> = {
  video: renderVideo,
}
