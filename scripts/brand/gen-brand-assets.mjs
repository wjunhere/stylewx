/**
 * gen-brand-assets.mjs —— 生成 stylewx 品牌资产（方向 B · 协议 Protocol）。
 *
 * 产出的东西：
 *   docs/assets/logo-mark.svg        主标（56px 起）
 *   docs/assets/logo-lockup.svg      横式锁定（标记 + 等宽字标 + 品类）
 *   docs/assets/logo-mono.svg        单字 sw（favicon / 头像）
 *   docs/assets/logo-inverse.svg     暗底反白
 *   apps/mcp-server/icon.svg         编辑器 favicon（16px 简化版）
 *   docs/assets/banner-1280x420.svg  README 头图主尺寸
 *   docs/assets/banner-640x200.svg   窄尺寸
 *   → 再用 Chromium 把 svg 渲成同名 .png（GitHub README 与 npm 用 PNG 更稳）
 *
 * 为什么用 SVG 源 + 渲染成 PNG：
 *   GitHub 的 README 渲染 SVG 时对 <style>/@import 有限制，
 *   而且 npm 页面不渲染 SVG。所以真相是 SVG，发布用 PNG 2x。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..', '..')
const DOCS = resolve(REPO, 'docs/assets')
const MCP = resolve(REPO, 'apps/mcp-server')

/* playwright 是 @stylewx/preview 的依赖，从那个包的位置解析，
   这样脚本不必为了截图而给根 package.json 添依赖。
   playwright 的入口是 CJS，ESM 动态 import 拿不到具名导出，所以走 require。 */
const pw = createRequire(resolve(REPO, 'packages/preview/package.json'))('playwright')

/* ── 令牌（与品牌定稿完全同值） ──────────────────────────────────── */
const T = {
  bg: '#f9fafb',
  surface: '#ffffff',
  fg: '#0c1015',
  muted: '#52565b',
  border: '#dcdee1',
  accent: '#114cbf',
}

/* ── 标志母题 ──────────────────────────────────────────────────────
   外框 = 恒定的 390px 预览帧；框内两行 = 文本层级；右下实心圆 = 端点。
   16px 简化：去掉第三行，只留「外框 + 一行 + 端点」。 */
const markShape = ({ simplified = false, color = 'currentColor', opacity = {} } = {}) => {
  const o = { frame: 0.38, line2: 0.55, ...opacity }
  return `
    <rect x="6.5" y="6.5" width="19" height="19" rx="5" fill="none" stroke="${color}" stroke-width="${simplified ? 2.6 : 2.2}" opacity="${o.frame}"/>
    <rect x="11" y="12" width="10" height="${simplified ? 3.2 : 2.6}" rx="${simplified ? 1.6 : 1.3}" fill="${color}"/>
    ${
      simplified
        ? ''
        : `<rect x="11" y="17.4" width="6" height="2.6" rx="1.3" fill="${color}" opacity="${o.line2}"/>`
    }
    <circle cx="25.5" cy="25.5" r="${simplified ? 4.2 : 3.6}" fill="${color}"/>`
}

/**
 * 把 32×32 的母题放进边长 box 的方块里，方块左上角在 (x, y)。
 *
 * 需要一层光学居中：母题的可见范围不是满幅 0–32，而是
 *   外框描边 5.4–26.6、端点圆 21.9–29.1   →  实际边界 5.4–29.1，中心在 17.25
 * 所以直接按 viewBox 居中会看起来偏左下，这里补回 (17.25 − 16) 的偏移。
 *
 * 只在「标志独立成图」时做这个补偿；编辑器界面里的标记保持原坐标系，
 * 与定稿 HTML 完全一致。
 */
const markIn = (box, { x = 0, y = 0, fill: fillRatio = 0.92, optical = true, ...opts } = {}) => {
  const s = (box / 32) * fillRatio
  const off = (box - 32 * s) / 2 - (optical ? 1.25 * s : 0)
  return `<g transform="translate(${(x + off).toFixed(3)} ${(y + off).toFixed(3)}) scale(${s.toFixed(4)})">${markShape(opts)}</g>`
}

/* ══ ① 主标 ═══════════════════════════════════════════════════════ */
const logoMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="stylewx">
  <title>stylewx</title>
  <rect width="64" height="64" rx="12" fill="${T.fg}"/>
  ${markIn(64, { color: T.surface })}
</svg>
`

/* ══ ② 横式锁定 ═══════════════════════════════════════════════════ */
const logoLockup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 232 48" width="232" height="48" role="img" aria-label="stylewx 公众号排版 AGENT">
  <title>stylewx 公众号排版 AGENT</title>
  <rect x="2" y="6" width="36" height="36" rx="8" fill="${T.fg}"/>
  ${markIn(36, { x: 2, y: 6, color: T.surface })}
  <text x="50" y="26" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="21" font-weight="600" letter-spacing="-0.4" fill="${T.fg}">stylewx</text>
  <text x="51" y="40" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="10.5" letter-spacing="1.05" fill="${T.muted}">公众号排版 AGENT</text>
</svg>
`

/* ══ ③ 单字 sw ════════════════════════════════════════════════════ */
const logoMono = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="stylewx">
  <title>stylewx</title>
  <rect width="64" height="64" rx="12" fill="${T.fg}"/>
  <text x="32" y="45" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="36" font-weight="600" letter-spacing="-1" fill="${T.surface}">sw</text>
</svg>
`

/* ══ ④ 暗底反白 ═══════════════════════════════════════════════════ */
const logoInverse = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="stylewx">
  <title>stylewx</title>
  ${markIn(64, { color: T.surface })}
</svg>
`

/* ══ ⑤ favicon · 16px 简化版 ═════════════════════════════════════ */
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect width="32" height="32" rx="7" fill="${T.fg}"/>
  ${markIn(32, { simplified: true, color: T.surface })}
</svg>
`

/* ══ ⑥ README banner 1280×420 ════════════════════════════════════
   右侧不是装饰，是真实调用链：agent → mcp-server → service → core·theme。
   「可校验」是整张图唯一的强色。 */
const banner = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 420" width="1280" height="420" role="img" aria-label="stylewx 排版内核，可校验">
  <title>stylewx — 排版内核，可校验</title>
  <rect width="1280" height="420" fill="${T.bg}"/>

  <!-- 左侧 -->
  <g transform="translate(52 52)">
    <rect width="36" height="36" rx="8" fill="${T.fg}"/>
    ${markIn(36, { color: T.surface })}
    <text x="50" y="17" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="22" font-weight="600" letter-spacing="-0.44" fill="${T.fg}">stylewx</text>
    <text x="51" y="31" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="11" letter-spacing="1.1" fill="${T.muted}">公众号排版 AGENT</text>
  </g>

  <text x="52" y="204" font-family="Iowan Old Style,Charter,Georgia,Songti SC,serif" font-size="58" font-weight="600" letter-spacing="-1.62" fill="${T.fg}">排版内核，<tspan fill="${T.accent}">可校验</tspan></text>

  <text x="52" y="254" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif" font-size="19" fill="${T.muted}">22 个 MCP 工具 + REST API，一步成稿或拆成原语分步迭代。</text>

  <text x="52" y="356" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="13" letter-spacing="1.43" fill="${T.muted}">内核 · MCP · REST · 编辑器</text>

  <!-- 右侧：调用链面板 -->
  <g transform="translate(836 52)">
    <rect width="392" height="316" rx="14" fill="#f2f3f5" stroke="${T.border}"/>
    <text x="24" y="42" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,sans-serif" font-size="17" font-weight="600" fill="${T.fg}">调用链</text>
    <text x="368" y="42" text-anchor="end" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="11" letter-spacing="1.32" fill="${T.muted}">CALL PATH</text>

    ${[
      ['agent', '设计决策'],
      ['mcp-server', 'stdio / http'],
      ['service', '编排'],
      ['core · theme', '纯函数'],
    ]
      .map(([name, note], i) => {
        const y = 86 + i * 54
        const link =
          i < 3
            ? `<line x1="27.5" y1="${y + 8}" x2="27.5" y2="${y + 46}" stroke="${T.fg}" stroke-opacity="0.32"/>`
            : ''
        return `${link}
    <circle cx="27.5" cy="${y}" r="3.5" fill="${T.fg}"/>
    <text x="48" y="${y + 5}" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="14" fill="${T.fg}">${name}</text>
    <text x="368" y="${y + 5}" text-anchor="end" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="12.5" fill="${T.muted}">${note}</text>`
      })
      .join('')}

    <text x="24" y="292" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="13" fill="${T.muted}">22 工具 · 26 主题 · 22 组件</text>
  </g>
</svg>
`

/* ══ ⑦ banner 640×200 ════════════════════════════════════════════ */
const bannerMini = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 200" width="640" height="200" role="img" aria-label="stylewx 排版内核，可校验">
  <title>stylewx — 排版内核，可校验</title>
  <rect width="640" height="200" fill="${T.bg}"/>

  <g transform="translate(36 30)">
    <rect width="30" height="30" rx="7" fill="${T.fg}"/>
    ${markIn(30, { simplified: true, color: T.surface })}
    <text x="42" y="14" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="18" font-weight="600" letter-spacing="-0.36" fill="${T.fg}">stylewx</text>
    <text x="43" y="26" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="9" letter-spacing="0.9" fill="${T.muted}">公众号排版 AGENT</text>
  </g>

  <text x="36" y="126" font-family="Iowan Old Style,Charter,Georgia,Songti SC,serif" font-size="40" font-weight="600" letter-spacing="-1.12" fill="${T.fg}">排版内核，<tspan fill="${T.accent}">可校验</tspan></text>

  <text x="36" y="168" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="12" letter-spacing="1.32" fill="${T.muted}">22 工具 · 26 主题 · 22 组件</text>
</svg>
`

/* ── 落盘 ───────────────────────────────────────────────────────── */
mkdirSync(DOCS, { recursive: true })

const svgFiles = [
  [resolve(DOCS, 'logo-mark.svg'), logoMark, 64, 64],
  [resolve(DOCS, 'logo-lockup.svg'), logoLockup, 232, 48],
  [resolve(DOCS, 'logo-mono.svg'), logoMono, 64, 64],
  [resolve(DOCS, 'logo-inverse.svg'), logoInverse, 64, 64],
  [resolve(MCP, 'icon.svg'), favicon, 32, 32],
  [resolve(DOCS, 'banner-1280x420.svg'), banner, 1280, 420],
  [resolve(DOCS, 'banner-640x200.svg'), bannerMini, 640, 200],
]

for (const [file, content] of svgFiles) {
  writeFileSync(file, content, 'utf8')
  console.log('  ✓', file.replace(REPO + '\\', '').replace(REPO + '/', ''))
}

/* ── SVG → PNG（2x，给 README / npm 用） ────────────────────────── */
const pngTargets = [
  ['docs/assets/logo-mark.svg', 'docs/assets/logo-mark.png', 64, 64, 2],
  ['docs/assets/logo-lockup.svg', 'docs/assets/logo-lockup.png', 232, 48, 3],
  ['docs/assets/logo-mono.svg', 'docs/assets/logo-mono.png', 64, 64, 2],
  ['docs/assets/banner-1280x420.svg', 'docs/assets/banner-1280x420.png', 1280, 420, 2],
  ['docs/assets/banner-640x200.svg', 'docs/assets/banner-640x200.png', 640, 200, 2],
]

const browser = await pw.chromium.launch()
for (const [srcRel, outRel, w, h, scale] of pngTargets) {
  const src = resolve(REPO, srcRel)
  const out = resolve(REPO, outRel)
  const page = await browser.newPage({
    viewport: { width: w, height: h },
    deviceScaleFactor: scale,
  })
  await page.goto(pathToFileURL(src).href, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(120)
  await page.screenshot({ path: out, omitBackground: false })
  await page.close()
  console.log('  ✓', outRel, `(${w * scale}×${h * scale})`)
}
await browser.close()

console.log('\n品牌资产已生成')
