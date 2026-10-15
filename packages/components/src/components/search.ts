/**
 * 推荐搜索组件（占位 + 发布时由脚本插入真组件）。
 *
 * 与 `music` 同族：**数据自包含**，可离线合成标签、零交互插入
 * （判据见 docs/DESIGN.md §27：落地的是自包含的 `<mp-common-*>`，属性里带全数据）。
 *
 * 实测（2026-10-12，`apps/mcp-server/scripts/probe-wechat-search-widget.mjs --stage synth`）：
 * 用 API 权威数据（`getaccountbasicinfo` 的 `nickname` / `head_image_info.head_image_url`）
 * 离线合成标签 → insertHTML → 保存 → `draft/get` 读回，**完整存活**。
 *
 * 真组件标签长这样（`data-keywords` 是 URL 编码的 JSON 数组）：
 * ```html
 * <mp-common-search data-pluginname="insertsearch" data-nickname="示例 青年"
 *   data-headimg="http://wx.qlogo.cn/mmhead/…"
 *   data-keywords="%5B%7B%22label%22%3A%22…%22%7D%5D"></mp-common-search>
 * ```
 *
 * 两个必须发布时现场取的字段（不能写死在 Markdown 里）：
 *   1. **昵称** —— 必须与当前账号一致（不一致就是导流到别人的号）。
 *      实测写朴素名（`示例 青年`）即可，微信保存时自己规范化成 `示例&nbsp;青年`。
 *   2. **头像** —— `qlogo.cn` 直链会随换头像失效，且必须与账号匹配。
 *
 * 所以本组件**不落任何真实昵称/头像**，只落关键词与占位标记；昵称/头像由发布脚本
 * 调 API 取。这也顺带避免了把账号信息写进 Markdown 源。
 *
 * 位置要求：它是**读者端唯一带点击交互**的组件（外层 `custom_select_card`，点击唤起搜一搜），
 * 应放在**文末**（`hip-end-a` 之前）。放头部或正文中间会打断阅读。
 */
import { escapeAttr, escapeHtml, css, prop } from '../style.js'
import { svgRoot } from '../svg.js'
import type { ComponentNode, RenderContext } from '../types.js'

/**
 * 平台对单个搜索词的**真实**限制：16 单位，**全角字符按 2 计**。
 *
 * 客服提示文案写的是「每个搜索关键词最多16个字符」，但实测那句话是误导的：
 *
 * | 关键词 | 字数 | 结果 |
 * | --- | --- | --- |
 * | 好好吃饭 | 4 汉字 | ✅ |
 * | 焦虑抑制剂 | 5 汉字 | ✅ |
 * | 我的所有还有意义 | 8 汉字（=16 单位） | ✅ |
 * | 我的所有还有意义吗 | 9 汉字（=18 单位） | ❌ |
 * | abcdefghijklmnop | 16 ASCII | ✅ |
 * | abcdefghijklmnopq | 17 ASCII | ❌ |
 *
 * 也就是：**汉字最多 8 个，英文最多 16 个**，逐词判定（超出的词被拦，不是整条限制）。
 * 超限时保存会被拦下，而错误只在保存后才以浮层出现 —— 很容易当成「保存坏了」。
 * 矩阵实测：`apps/mcp-server/scripts/probe-search-keyword-limit.mjs`。
 */
export const SEARCH_KEYWORD_MAX_UNITS = 16

/** 词的「单位」数：全角（含汉字）按 2，半角按 1。 */
export function searchKeywordUnits(word: string): number {
  let n = 0
  for (const ch of word) n += /[\u1100-\u115F\u2E80-\uFFEF\u{1F300}-\u{1FAFF}]/u.test(ch) ? 2 : 1
  return n
}

/** 超过平台限制的词（用于构建期报错，而不是发布时神秘失败）。 */
export function overlongSearchKeywords(keywords: string[]): string[] {
  return keywords.filter((k) => searchKeywordUnits(k) > SEARCH_KEYWORD_MAX_UNITS)
}

/** 放大镜图标（内联 SVG，避开 emoji 字体差异）。 */
function searchIcon(color: string): string {
  return svgRoot({
    viewBox: '0 0 20 20',
    style: { width: '18px', height: '18px', 'flex-shrink': '0' },
    children:
      `<circle cx="8.6" cy="8.6" r="5.6" fill="none" stroke="${color}" stroke-width="1.8"/>` +
      `<path d="M12.8 12.8 L17.4 17.4" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>`,
  })
}

/**
 * 推荐搜索占位。props：title、keywords、hint、show-hint。
 *
 * 关键词两条来源（二选一）：
 *   - `keywords="甲|乙|丙"` 参数形式
 *   - 组件正文，每行一个
 * 平台上限 4 个，超出截断（多了平台也不收）。
 */
function renderSearch(node: ComponentNode, ctx: RenderContext): string {
  const p = node.props
  const palette = ctx.palette
  const title = prop(p, 'title', '推荐搜索')
  const hint = prop(p, 'hint', '搜索组件将在发布时插入')
  const showHint = prop(p, 'show-hint', 'true') !== 'false'

  // 关键词：参数优先，其次取正文每行
  const fromProp = prop(p, 'keywords')
  const fromBody = node.body
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  const keywords = (fromProp ? fromProp.split('|').map((s) => s.trim()) : fromBody).filter(Boolean).slice(0, 4)

  // 平台真实限制：单词 16 单位（全角算 2）。超限时**平台保存会被拦**且错误只在保存后浮出，
  // 所以在这里就报 error —— 构建期看见，好过发布时神秘失败。
  const overlong = overlongSearchKeywords(keywords)
  if (overlong.length) {
    ctx.diagnostics.push({
      level: 'error',
      component: 'search',
      message:
        `搜索词超长：${overlong.map((k) => `「${k}」(${searchKeywordUnits(k)} 单位)`).join('、')}。` +
        `平台限制每个词 ${SEARCH_KEYWORD_MAX_UNITS} 单位，全角按 2 计 → 汉字最多 8 个、英文最多 16 个。` +
        `注意提示文案写的是「16 个字符」，把它当「16 个汉字」会踩坑。`,
      line: node.line,
    })
  }

  // 占位标记：发布脚本据此定位，并用 data-swx-search-keywords 取关键词。
  // 昵称/头像**故意不落** —— 发布时按当前账号现取（见文件头注释）。
  const mark =
    ` data-swx-search="1"` +
    (keywords.length ? ` data-swx-search-keywords="${escapeAttr(keywords.join('|'))}"` : '')

  const chips = keywords.length
    ? `<section style="${css({ display: 'flex', 'flex-wrap': 'wrap', gap: '8px', 'margin-top': '10px' })}">` +
      keywords
        .map(
          (k) =>
            `<section style="${css({
              'font-size': '13px',
              color: palette.primary,
              background: palette.canvasBg,
              border: `1px solid ${palette.cardBorder}`,
              'border-radius': '999px',
              padding: '4px 12px',
            })}">${escapeHtml(k)}</section>`,
        )
        .join('') +
      `</section>`
    : ''

  const hintLine = showHint
    ? `<section style="${css({ 'font-size': '12px', color: palette.weak, 'margin-top': '8px' })}">${escapeHtml(hint)}</section>`
    : ''

  const body =
    `<section style="${css({
      padding: '16px 18px',
      'border-radius': palette.radius,
      background: palette.cardBg,
      border: `1px dashed ${palette.cardBorder}`,
    })}">` +
    `<section style="${css({ display: 'flex', 'align-items': 'center', gap: '8px' })}">` +
    searchIcon(palette.primary) +
    `<section style="${css({ 'font-size': '14.5px', 'font-weight': '600', color: palette.text })}">${escapeHtml(title)}</section>` +
    `</section>` +
    chips +
    hintLine +
    `</section>`

  return `<section${mark} style="${css({ margin: `0 0 ${palette.blockGap}` })}">${body}</section>`
}

export const searchComponents: Record<string, (node: ComponentNode, ctx: RenderContext) => string> = {
  search: renderSearch,
}
