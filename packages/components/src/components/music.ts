/**
 * 音乐组件（占位 + 发布时插入真播放器）。
 *
 * 与 `video` 组件同路数，但结论**相反**：音乐是能全自动插入的。
 *
 * 实测（2026-10-12，探针 `apps/mcp-server/scripts/probe-wechat-music*.mjs`）：
 *   - 把旧草稿 `draft/get` 里的 `<mp-common-clmusic …>` 原样 `insertHTML` 进 ProseMirror
 *     → **完整存活**（属性一字不差，编辑器只加 `contenteditable="false"`）
 *   - 保存为草稿后再 `draft/get` 读回 → **仍完整存活**，且编辑器补了
 *     `<mp-style-type data-value="3">`（音频块标记）
 *   - 因此音乐**不需要人在编辑器里点**：一条命令即可全自动。
 *
 * 播放器标签长这样（微信给自己维度的白名单，属性即数据，无需额外接口）：
 * ```html
 * <mp-common-clmusic data-pluginname="insertaudio" singer="惘闻" music_name="焦虑抑制剂"
 *   duration="530000" listenid="78221540362775072" albumurl="…" …></mp-common-clmusic>
 * ```
 *
 * 因为「有现成标签 → 照抄」比「驱动搜索器选曲」稳得多，本组件两条路都留：
 *   1. `:::music{source="<原样标签>"}` —— 直接把标签落进占位块，脚本零交互复刻（**首选**）
 *   2. `:::music{clue="惘闻 焦虑抑制剂"}` —— 脚本去编辑器音乐弹窗搜索并按文本选中（新曲目用）
 *
 * 不写 `position` / `filter`（白名单 BANNED 档，会被裁掉并报 error）；
 * 图标用内联 SVG 画，不用 emoji 字体（跨端字形不稳）。
 */
import { escapeAttr, escapeHtml, css, prop } from '../style.js'
import { svgRoot } from '../svg.js'
import type { ComponentNode, RenderContext } from '../types.js'

const ICON_W = 22
const ICON_H = 22

/** 音符图标（内联 SVG，避开 emoji 字体差异）。 */
function noteIcon(color: string): string {
  return svgRoot({
    viewBox: `0 0 ${ICON_W} ${ICON_H}`,
    style: { width: `${ICON_W}px`, height: `${ICON_H}px`, 'flex-shrink': '0' },
    children:
      `<ellipse cx="7" cy="17.5" rx="4.2" ry="3.2" fill="${color}"/>` +
      `<ellipse cx="16.5" cy="15.5" rx="4.2" ry="3.2" fill="${color}"/>` +
      `<path d="M11.2 17.5 L11.2 5.2 L20.7 3 L20.7 15.5" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`,
  })
}

/** 音乐占位。props：song、singer、clue、source、caption、hint、show-hint。 */
function renderMusic(node: ComponentNode, ctx: RenderContext): string {
  const p = node.props
  const palette = ctx.palette
  const song = prop(p, 'song')
  const singer = prop(p, 'singer')
  const clue = prop(p, 'clue')
  // source = 从旧草稿 draft/get 里原样拿到的 <mp-common-clmusic> 标签，发布时直接复刻
  const source = prop(p, 'source')
  const caption = prop(p, 'caption')
  const hint = prop(p, 'hint', '音乐将在发布时由编辑器插入')
  const showHint = prop(p, 'show-hint', 'true') !== 'false'

  // 占位标记：发布脚本据此定位；clue/source 二选一决定用哪条插入路径。
  const mark =
    ` data-swx-music="1"` +
    (song ? ` data-swx-music-song="${escapeAttr(song)}"` : '') +
    (singer ? ` data-swx-music-singer="${escapeAttr(singer)}"` : '') +
    (clue ? ` data-swx-music-clue="${escapeAttr(clue)}"` : '') +
    (source ? ` data-swx-music-source="${escapeAttr(source)}"` : '')

  const titleLine = song
    ? `<section style="${css({ 'font-size': '14.5px', 'font-weight': '600', color: palette.text })}">${escapeHtml(song)}</section>`
    : ''
  const singerLine = singer
    ? `<section style="${css({ 'font-size': '12.5px', color: palette.weak, 'margin-top': '3px' })}">${escapeHtml(singer)}</section>`
    : ''
  const hintLine = showHint
    ? `<section style="${css({ 'font-size': '12px', color: palette.weak, 'margin-top': '6px' })}">${escapeHtml(hint)}</section>`
    : ''

  const body =
    `<section style="${css({
      display: 'flex',
      'align-items': 'flex-start',
      gap: '12px',
      padding: '16px 18px',
      'border-radius': palette.radius,
      background: palette.cardBg,
      border: `1px dashed ${palette.cardBorder}`,
    })}">` +
    noteIcon(palette.primary) +
    `<section style="${css({ flex: '1', 'min-width': '0' })}">${titleLine}${singerLine}${hintLine}</section>` +
    `</section>`

  const cap = caption
    ? `<section style="${css({ 'font-size': '12.5px', color: palette.weak, 'text-align': 'center', 'margin-top': '7px' })}">${escapeHtml(caption)}</section>`
    : ''

  return `<section${mark} style="${css({ margin: `0 0 ${palette.blockGap}` })}">${body}</section>${cap}`
}

export const musicComponents: Record<string, (node: ComponentNode, ctx: RenderContext) => string> = {
  music: renderMusic,
}
