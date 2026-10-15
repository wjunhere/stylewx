/**
 * Hippie 青年 · 动效品牌资产生成器
 *
 * 颜色全部**采样自真实资产**（公众号头像：夜蓝渐变天空 + 一盏橘黄路灯），
 * 文案锚点取自账号签名「前已无通路，后不见归途。」—— 不发明新色、不发明新话。
 *
 * 通道约束：微信正文禁 JS、禁外链动画，内联 SVG + SMIL 是唯一能真正动起来、
 * 且经真人发布实测存活（23/23）的通道。微信会剥掉 id → 禁用 url(#…) / <use> / <linearGradient>。
 *
 * 两个实测坑（都在这份文件里踩过并修掉，见对应注释）：
 *   1. 缩放元素时不能把绝对坐标乘以 s，要用 transform 搬原点再 scale。
 *   2. 父级挂了 <animateTransform transform> 时，子树里的静态 transform 会让整棵子树消失。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brandMotionDir } from './paths.mjs'

// ── 色板：全部位采样自 app 头像，括号内是采样点 ────────────────────────────
const C = {
  night: '#0A2A6B', // 夜穹最深处（头像顶部天空压暗）
  nightSoft: '#16408F', // 天空第 20 行
  twilight: '#3E6DA8', // 天空逼近地平线
  lamp: '#F5A623', // 灯泡最暖处 #feb900 收一档，避免过曝
  lampSoft: '#E8B44F',
  paper: '#FBF9F4', // 底色：稿纸白，不用纯白
  card: '#F2F0EA',
  text: '#16202E', // 正文：夜蓝压成近黑，比纯黑透气
  muted: '#5C6675',
  rule: '#D7DDE7',
}
const SERIF = "Georgia, 'Times New Roman', 'Songti SC', serif"
const SLOW = '0.35 0 0.15 1'

const svg = (vb, kids, style = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="xMidYMid meet" style="width:100%;display:block${style}">${kids}</svg>`

const fade = (dur, begin, from = 0, to = 1) =>
  `<animate attributeName="opacity" from="${from}" to="${to}" dur="${dur}" begin="${begin}" fill="freeze"/>`

/** 几何生长：带缓动，收尾像弹簧而不是线性。 */
const grow = (attr, from, to, dur, begin) =>
  `<animate attributeName="${attr}" values="${from};${to}" keyTimes="0;1" calcMode="spline" keySplines="${SLOW}" dur="${dur}" begin="${begin}" fill="freeze"/>`

/** 环形呼吸。 */
const loop = (attr, values, dur, begin = '0s') =>
  `<animate attributeName="${attr}" values="${values}" dur="${dur}" begin="${begin}" repeatCount="indefinite"/>`

const rise = (dy, dur, begin, dx = 0) =>
  `<animateTransform attributeName="transform" type="translate" from="${dx} ${dy}" to="0 0" values="${dx} ${dy};0 0" keyTimes="0;1" calcMode="spline" keySplines="${SLOW}" dur="${dur}" begin="${begin}" fill="freeze"/>`

const drawIn = (len, dur, begin) =>
  `<animate attributeName="stroke-dashoffset" from="${len}" to="0" calcMode="spline" keySplines="${SLOW}" dur="${dur}" begin="${begin}" fill="freeze"/>`

const txt = (o) =>
  `<text x="${o.x}" y="${o.y}" font-size="${o.size}" fill="${o.fill}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.weight ? ` font-weight="${o.weight}"` : ''}${o.ls ? ` letter-spacing="${o.ls}"` : ''} font-family="${o.family ?? SERIF}"${o.opacity !== undefined ? ` opacity="${o.opacity}"` : ''}>${o.text}${o.anim ?? ''}</text>`

/** 灯柱：一根竖线接一段弧头，用 stroke-dashoffset 描出来。 */
const lampPost = ({ x, groundY, topY, bend, stroke, dash, begin, dur }) =>
  `<path d="M${x} ${groundY} L${x} ${topY + 26} Q${x} ${topY} ${x + bend} ${topY}" fill="none" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="${dash}" stroke-dashoffset="${dash}">` +
  drawIn(dash, dur, begin) +
  `</path>`

/**
 * 灯罩 + 灯泡（可选光晕）。
 *
 * ⚠️ 缩放必须用 transform 把原点搬到灯心再 scale。
 * 早先写成 `g(v) = v * s` 直接乘绝对坐标，灯头被搬到 (x*s, y*s)，和灯柱弧头脱开，越放大偏得越厉害。
 *
 * ⚠️ `halo` **默认 false**（历史上是 true，结果在深色底上默认踩坑）。
 * 光晕是「大面积 + 低透明度的暖色填充」，在深色底上必变灰褐（§22.8 ⑧ / 铁律⑩）。
 * 只有**浅色底**（A 的纸白、B 的暖灰纸）才应该显式传 `halo: true`。
 */
const lampHead = ({ x, y, s = 1, begin, halo = false }) =>
  `<g transform="translate(${x} ${y}) scale(${s})" opacity="0">` +
  fade('0.5s', begin) +
  `<path d="M-26 0 Q0 -30 26 0 Z" fill="${C.lampSoft}" opacity="0.9"/>` +
  `<path d="M-26 0 Q0 -30 26 0 Z" fill="none" stroke="${C.lamp}" stroke-width="1.6"/>` +
  `<ellipse cx="0" cy="5" rx="5" ry="4" fill="${C.lamp}"/>` +
  (halo
    ? `<ellipse cx="0" cy="16" rx="34" ry="26" fill="${C.lamp}" opacity="0.13">${loop('opacity', '0.08;0.19;0.08', '4.5s')}</ellipse>` +
      `<ellipse cx="0" cy="12" rx="18" ry="14" fill="${C.lampSoft}" opacity="0.2">${loop('opacity', '0.14;0.28;0.14', '3.2s', '0.4s')}</ellipse>`
    : '') +
  `</g>`

// ══════════════════════════════════════════════════════════════════════
// 方案 A ·「归途」 — 夜景线描
// 语法：整幅画面用描边生长画出来，灯最后亮起并开始呼吸
// ══════════════════════════════════════════════════════════════════════
const A = {
  key: 'a-homeward',
  label: '方案 A ·「归途」',
  idea: '一条地平线、一盏路灯被描出来，灯亮起后开始呼吸 —— 最安静的一套，也最贴那句签名',
  typography: '衬线标题 + 大幅字距，正文克制；暖橘是画面里唯一的有彩色',
  timeline: [
    '0.00s 地平线自左描出（1.0s）',
    '0.35s 灯柱自下向上描出，弧头导向右侧（1.1s）',
    '1.10s 灯罩落下、灯泡点亮，暖色光晕转入 4.5s 呼吸循环',
    '1.30s「HIPPIE」上浮归位 → 1.55s「青年」→ 1.75s 落款细线 → 1.95s 题注',
  ],
  header: svg(
    '0 0 340 132',
    `<rect width="340" height="132" fill="${C.paper}"/>` +
      `<path d="M0 108 H340" stroke="${C.rule}" stroke-width="1.5" stroke-dasharray="340" stroke-dashoffset="340">${drawIn(340, '1s', '0s')}</path>` +
      lampPost({ x: 268, groundY: 108, topY: 40, bend: 32, stroke: C.nightSoft, dash: 130, begin: '0.35s', dur: '1.1s' }) +
      lampHead({ x: 300, y: 40, begin: '1.1s', halo: true }) +
      txt({
        x: 28, y: 62, size: 27, weight: 700, fill: C.night, text: 'HIPPIE', ls: 1.5, opacity: 0,
        anim: fade('0.6s', '1.3s') + rise(6, '0.62s', '1.3s'),
      }) +
      txt({ x: 30, y: 86, size: 15, fill: C.muted, text: '青年', ls: 6, opacity: 0, anim: fade('0.6s', '1.55s') }) +
      `<rect x="28" y="116" width="0" height="1.5" fill="${C.lamp}">${grow('width', 0, 46, '0.6s', '1.75s')}</rect>` +
      txt({ x: 82, y: 121, size: 8.5, ls: 1.6, fill: C.muted, text: 'HIPPIE YOUTH · NOTES', opacity: 0, anim: fade('0.7s', '1.95s') }),
  ),
  footer: svg(
    '0 0 340 140',
    `<rect width="340" height="140" fill="${C.paper}"/>` +
      // 尾图按需求只留文字：去掉路灯，连地平线一起去掉（那是跟灯配的构图元素，
      // 灯没了只剩一条横线会显得突兀）。保留的短线是排印上的强调，不是图形。
      txt({
        x: 170, y: 64, size: 15, fill: C.night, anchor: 'middle', text: '前已无通路，后不见归途。', opacity: 0,
        anim: fade('0.9s', '0.1s') + rise(5, '0.9s', '0.1s'),
      }) +
      `<rect x="142" y="82" width="0" height="1.2" fill="${C.lamp}">${grow('width', 0, 56, '0.7s', '0.75s')}</rect>` +
      txt({ x: 170, y: 106, size: 9, ls: 2.6, fill: C.muted, anchor: 'middle', text: 'HIPPIE 青年', opacity: 0, anim: fade('0.7s', '1s') }),
  ),
  logo: svg(
    '0 0 120 120',
    // 抽象画风格的青年：把「人」压成最基本的几何块 —— 一枚被灯照亮的橘色头、
    // 一段纸白立块当身子、一条橘色斜带当行囊、两段短线当腿；右上角一枚被画布截断的
    // 大橘圆既是路灯又是月亮（抽象画里常见的「截断的太阳」）。地平线向两侧伸出人之外，
    // 留出空旷感。
    //
    // 为什么不做光晕 / 渐层：深色底上「大面积 + 低透明」的暖色实测会变芥末灰；
    // 而且标志要能在 48px 认出来，所以全部用实心块 + 一个高对比的橘。
    `<rect width="120" height="120" rx="24" fill="${C.night}"/>` +
      // 远景的灯（也是月亮）：被画布右上角截断，用浅一档的橘，避免和头部抢焦点
      `<circle cx="100" cy="16" r="0" fill="${C.lampSoft}" opacity="0.92">${grow('r', 0, 28, '1.1s', '0.3s')}</circle>` +
      // 地平线：向人之外伸出，留出空旷
      // 地平线用半透明白：全白会和同样白色的双腿并成一块，腿就没了（实测）
      `<path d="M14 92 H106" stroke="${C.paper}" stroke-width="2" stroke-linecap="round" opacity="0.45" stroke-dasharray="92" stroke-dashoffset="92">${drawIn(92, '0.85s', '0.05s')}</path>` +
      // 头：橘色 —— 用同一枚橘把「人」和「灯」连起来，人被照亮
      `<circle cx="46" cy="38" r="0" fill="${C.lamp}">${grow('r', 0, 11.5, '0.5s', '0.6s')}</circle>` +
      // 身子：纸白立块
      `<g opacity="0">${fade('0.5s', '0.75s')}${rise(9, '0.6s', '0.75s')}` +
      `<rect x="36" y="50" width="21" height="42" rx="2" fill="${C.paper}"/>` +
      `<rect x="38" y="92" width="6.5" height="14" rx="1.5" fill="${C.paper}"/>` +
      `<rect x="48.5" y="92" width="6.5" height="14" rx="1.5" fill="${C.paper}"/>` +
      `</g>` +
      // 行囊：贴在背后的一块方正的包。早先写成上斜的四边形，240px 下看着像翅膀，
      // 不像背包 —— 背东西的轮廓要方，斜切会读成翼。
      `<path d="M55.5 55 L70 55 L70 80 L55.5 80 Z" fill="${C.lamp}" opacity="0">${fade('0.45s', '0.95s')}</path>`,
  )
}

// ══════════════════════════════════════════════════════════════════════
// 共用：山形 / 树 / 鸟 / 月 / 亮窗
//
// 山的画法要点（早先是「等距锯齿」，读起来像心电图不像山）：
//   - 峰数少（3 个）、峰高差明显；峰间要有**鞍部**（回落但不回到底）；
//   - 用 Q 二次贝塞尔在峰点**圆化**，避免硬尖；
//   - 远山亮、近山暗（大气雾感），只有近山脊描白边收形。
// ══════════════════════════════════════════════════════════════════════
/**
 * 折线山脊（Q 圆化峰顶）。
 *
 * ⚠️ 本项目的硬约束：**文字占据左侧 x 26~140（C 的副标题到 139）**，
 * 所以山脊在 x<165 的区间必须整体压在 `y ≥ 100`（低于文字块下沿）——
 * 峰只能出现在**右半**。曾经把峰写在 x=86 处，白色山脊线直接横穿副标题，
 * 缩略图完全看不出来（漏了 4 次），现在由 `check-collisions.mjs` 机器把关。
 *
 * peaks 按 x 升序，两端自动落到 baseY。
 */
const ridgeD = (peaks, baseY) => {
  let d = `M0 ${baseY}`
  let px = 0
  for (const [x, y] of peaks) {
    d += ` Q${(px + (x - px) * 0.55).toFixed(1)} ${y} ${x} ${y}`
    px = x
  }
  return d + ` Q${(px + (340 - px) * 0.5).toFixed(1)} ${baseY} 340 ${baseY}`
}

/**
 * 三层实心山（方案 C 用）。右端带一个平台，供灯脚站立。
 *
 * 左右不对称是**有意**的：左低（让开文字）、右高（主峰 + 平台），
 * 顺带也比对称的等距锯齿更像真山。
 */
const mountainLayers = ({ baseY = 132, shelfX = 232, shelfY = 114, textBottom = 98 }) => {
  // 左半一律 ≥ textBottom + 8（让开文字），峰全部落在 x ≥ 210；
  // 三层明度差要拉开：远山 twilight 0.5 / 中山 nightSoft 0.8 / 近山实心 ——
  // 早先远山只有 0.28，在夜蓝底上几乎隐形，「三层山」读成一层。
  const far = [[64, 112], [150, 104], [238, 52], [322, 84]]
  const mid = [[42, 120], [148, 110], [246, 74], [326, 98]]
  const near = [[100, 126], [214, Math.max(112, textBottom + 14)], [shelfX, shelfY]]
  const fill = (p, c, o) => `<path d="${ridgeD(p, baseY)} L340 ${baseY} L0 ${baseY} Z" fill="${c}" opacity="${o}"/>`
  // 近山脊描边：只描到平台起点；平台段不描，避免多出一条线与受光弧相交
  const seg = (p) => {
    let d = `M0 ${baseY}`
    let px = 0
    for (const [x, y] of p) {
      d += ` Q${(px + (x - px) * 0.55).toFixed(1)} ${y} ${x} ${y}`
      px = x
    }
    return d
  }
  return (
    fill(far, C.twilight, 0.5) +
    fill(mid, C.nightSoft, 0.8) +
    // 近山：从平台右缘垂直落到画布底，形成一块「坡地」
    `<path d="${ridgeD(near, baseY)} L340 ${shelfY} L340 ${baseY} Z" fill="${C.night}"/>` +
    `<path d="${seg(near)} L340 ${shelfY}" fill="none" stroke="${C.paper}" stroke-width="1.8" stroke-linejoin="round" opacity="0.85" stroke-dasharray="700" stroke-dashoffset="700">${drawIn(700, '1.6s', '0.5s')}</path>`
  )
}

/**
 * 纯线描山脊（方案 B 用，不填充 —— 与 C 的实心剪影形成语法对比）。
 * 同样受「左低右高」约束；另外 `baseY` 必须低于文字块，否则线会横穿文字。
 */
const ridgeLine = ({ peaks, baseY, stroke = C.night, begin = '0.5s', op = 0.6, w = 1.8 }) =>
  `<path d="${ridgeD(peaks, baseY)}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round" opacity="${op}" stroke-dasharray="700" stroke-dashoffset="700">${drawIn(700, '1.5s', begin)}</path>`

/** 实心针叶树（C 用）。 */
const pine = (x, base, h, w, color = C.paper, op = 0.9) => {
  const o = []
  for (let i = 0; i < 3; i += 1) {
    o.push(`<path d="M${x} ${base - h + h * 0.46 * i} L${x + (w * (0.5 + i * 0.25)) / 2} ${base - h * (0.62 - i * 0.24)} L${x - (w * (0.5 + i * 0.25)) / 2} ${base - h * (0.62 - i * 0.24)} Z" fill="${color}" opacity="${op}"/>`)
  }
  o.push(`<rect x="${(x - 1.3).toFixed(1)}" y="${base - 5}" width="2.6" height="7" fill="${color}" opacity="${op}"/>`)
  return o.join('')
}

/** 线描松（B 用，只描轮廓不填充）。 */
const pineLine = (x, base, h, w, op = 0.5) =>
  `<path d="M${x} ${base - h} L${x + w / 2} ${base - h * 0.34} L${x - w / 2} ${base - h * 0.34} Z" fill="none" stroke="${C.night}" stroke-width="1.5" stroke-linejoin="round" opacity="${op}"/>` +
  `<path d="M${x} ${base - h * 0.62} L${x + w * 0.36} ${base - h * 0.04} L${x - w * 0.36} ${base - h * 0.04} Z" fill="none" stroke="${C.night}" stroke-width="1.5" stroke-linejoin="round" opacity="${op}"/>` +
  `<path d="M${x} ${base} V${base - h * 0.04}" stroke="${C.night}" stroke-width="1.6" opacity="${op}"/>` +
  `<path d="M${(x - w * 0.2).toFixed(1)} ${base} H${(x + w * 0.2).toFixed(1)}" stroke="${C.night}" stroke-width="1.6" opacity="${op}"/>`

/**
 * 飞鸟剪影（滑翔姿，双翅平展、短燕尾）。
 * 12 个候选里选出来的：之前「椭圆身体+三角超勝」拼出来像鸭子，
 * 一笔连贯的滑翔姿才是飞鸟的识别性来源（try-bird2.mjs 对比图）。
 */
const bird = (x, y, s = 1, color = C.paper, op = 0.85) =>
  `<g transform="translate(${x} ${y}) scale(${s})" fill="${color}" opacity="${op}">` +
  `<path d="M-14 -2.6 Q-8 -5.4 -3.2 -4.2 Q-1 -3.6 0 -2.2 Q1 -3.6 3.2 -4.2 Q8 -5.4 14 -2.6 Q8.6 -3 4.6 -1.4 Q2.6 -0.6 1.4 0.8 L3 3.2 L-0.4 1.6 L-3.4 3.4 L-2.2 0.9 Q-3.4 -0.6 -5.4 -1.4 Q-9.4 -3 -14 -2.6 Z"/></g>`

/** 弦月。微信剥 mask，所以不能用「两圆相减」，要用两段弧拼。 */
const moon = (x, y, r, color = C.paper, op = 0.9) =>
  `<path d="M${x} ${y - r} A${r} ${r} 0 1 0 ${x} ${y + r} A${(r * 1.28).toFixed(1)} ${(r * 1.28).toFixed(1)} 0 0 1 ${x} ${y - r} Z" fill="${color}" opacity="${op}">${fade('0.9s', '0.4s')}</path>`

/** 亮窗：小面积 + 高不透明 —— 深色底上唯一不脏的暖色填充（见 try-pool.mjs）。 */
const litWin = (x, y, w, h, op = 0.92, begin = '0.9s') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.lamp}" opacity="0">${fade('0.4s', begin)}</rect>` +
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.lamp}" opacity="${op}"/>`

/** B 的线描灯（夜蓝细线 + 一小块暖色灯罩）。 */
const lampLine = ({ x, groundY, topY, bend, begin = '0.5s', s = 0.78 }) =>
  `<path d="M${x} ${groundY} L${x} ${topY + 22} Q${x} ${topY} ${x + bend} ${topY}" fill="none" stroke="${C.nightSoft}" stroke-width="2.1" stroke-linecap="round" stroke-dasharray="130" stroke-dashoffset="130">${drawIn(130, '1s', begin)}</path>` +
  `<g transform="translate(${x + bend} ${topY}) scale(${s})" opacity="0">${fade('0.5s', '0.85s')}` +
  `<path d="M-26 0 Q0 -30 26 0 Z" fill="${C.lampSoft}" opacity="0.9"/>` +
  `<path d="M-26 0 Q0 -30 26 0 Z" fill="none" stroke="${C.lamp}" stroke-width="1.5"/>` +
  `<ellipse cx="0" cy="5" rx="4.6" ry="3.8" fill="${C.lamp}"/></g>`

/**
 * 地面受光：一道纯色描边弧。
 * 深色底上「暖色填充」必脏（fill 参与混色），只有 stroke 干净 —— 见 §22.8 ⑧ 与 try-pool.mjs。
 * 弧高压到 w*0.13，且画在平台**之下**，避免与山脊线相交成 X。
 */
const litArc = (x, y, w, begin, stroke = C.lamp, op = 0.72) =>
  `<path d="M${x - w / 2} ${y} Q${x} ${(y - w * 0.13).toFixed(1)} ${x + w / 2} ${y}" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" opacity="${op}" stroke-dasharray="${Math.round(w * 1.06)}" stroke-dashoffset="${Math.round(w * 1.06)}">${drawIn(Math.round(w * 1.06), '0.9s', begin)}</path>`

// 方案 B ·「灯下」 — 暖灰纸底 · 纯线描
//
// 与 C 的区分**不只在底色，更在语法**：
//   C = 实心剪影（纸白块压在夜蓝上，强对比，夜景感）
//   B = 纯线描（夜蓝细线画在暖灰纸上，轻，纸本感）—— 这才是「灯下读书」该有的样子
// 两者同一组颜色、同一母题（灯 + 地平面 + 山），所以仍是一套系统。
//
// 布局硬约束（踩过：线穿过文字，缩略图看不出来）：
//   三条水平线各占一个 y —— 地面 112 / 受光弧 120 / 山脊 ≤104，**互不相交**；
//   山脊在文字块所在区间（x < 150）必须压到 y ≥ 108，只在右侧才隆起。
//   机器校验：`node assets-src/check-collisions.mjs`
// ══════════════════════════════════════════════════════════════════════
const B = {
  key: 'b-lamplight',
  label: '方案 B ·「灯下」',
  idea: '光从灯里一层层推开，字是被照亮的 —— 最适合「做题 / 读书 / 思考」这类内容',
  typography: '细线为主、暖橘只点在灯与窗上；暖灰纸底，纸本感',
  timeline: [
    '0.00s 地面基线自左描出（0.8s）',
    '0.35s 远山轮廓淡线 → 0.60s 近山轮廓（各 1.5s）',
    '0.50s 灯柱自下描出、灯罩落下（1.0s）',
    '0.85s 灯泡亮起（0.5s 渐亮）',
    '1.10s 地面受光弧自中点向两侧展开（0.9s）',
    '1.50s「HIPPIE」上浮归位 → 1.75s「青年」→ 2.00s 题注',
  ],
  header: svg(
    '0 0 340 132',
    `<rect width="340" height="132" fill="${C.card}"/>` +
      // 远山：淡线，左低右高（左半避开文字区）
      ridgeLine({ peaks: [[70, 124], [168, 112], [258, 78]], baseY: 124, begin: '0.35s', op: 0.34, w: 1.6 }) +
      // 近山：稍深，同样左低。baseY=124 与地面线(112)**不同 y**，所以不重叠；
      // 且整条线在 y≥112 之下，不会碰文字（文字下沿 98）
      ridgeLine({ peaks: [[46, 130], [156, 122], [266, 106]], baseY: 130, begin: '0.6s', op: 0.52, w: 1.9 }) +
      // 地面基线：纸本的「桌面」
      `<path d="M28 112 H312" stroke="${C.rule}" stroke-width="1.3" stroke-dasharray="284" stroke-dashoffset="284">${drawIn(284, '0.8s', '0s')}</path>` +
      // 两只鸟在灯的左侧天空带（x≤214，灯罩左缘 242——勿再右移，会叠进灯罩）
      bird(186, 34, 0.72, C.night, 0.4) + bird(208, 42, 0.6, C.night, 0.32) +
      lampLine({ x: 268, groundY: 112, topY: 44, bend: -26, begin: '0.5s' }) +
      litArc(246, 120, 62, '1.1s') +
      txt({
        x: 26, y: 44, size: 24, weight: 700, fill: C.night, text: 'HIPPIE', ls: 1.4, opacity: 0,
        anim: fade('0.6s', '1.5s') + rise(6, '0.6s', '1.5s'),
      }) +
      txt({ x: 28, y: 67, size: 13.5, fill: C.lamp, text: '青年', ls: 5, opacity: 0, anim: fade('0.6s', '1.75s') }) +
      txt({ x: 26, y: 94, size: 8.5, ls: 1.3, fill: C.muted, text: '前已无通路 · 后不见归途', opacity: 0, anim: fade('0.7s', '2s') }),
  ),
  footer: svg(
    '0 0 340 140',
    `<rect width="340" height="140" fill="${C.card}"/>` +
      // 与 A 尾图同构：纯文字 + 一条强调线，图形全部去掉。
      // 三套尾图的差异由底色（A 纸白 / B 暖灰纸 / C 夜蓝）承担，不再靠图形堆叠。
      txt({
        x: 170, y: 64, size: 15, fill: C.night, anchor: 'middle', text: '前已无通路，后不见归途。', opacity: 0,
        anim: fade('0.9s', '0.1s') + rise(5, '0.9s', '0.1s'),
      }) +
      `<rect x="142" y="82" width="0" height="1.2" fill="${C.lamp}">${grow('width', 0, 56, '0.7s', '0.75s')}</rect>` +
      txt({ x: 170, y: 106, size: 9, ls: 2.6, fill: C.muted, anchor: 'middle', text: 'HIPPIE 青年', opacity: 0, anim: fade('0.7s', '1s') }),
  ),
  logo: svg(
    '0 0 120 120',
    // 「光」这件事用**一束实心光锥**表达，不用低透明光晕也不用同心弧：
    // 低透明暖色叠在深底上会调出脏灰；同心弧半径一大就出画布被圆角切掉。
    // 实心光锥是纯色，缩小后依然是一块干净的暖色。
    `<rect width="120" height="120" rx="24" fill="${C.night}"/>` +
      `<g opacity="0">${fade('0.6s', '0.5s')}<path d="M45 40 L75 40 L98 86 L22 86 Z" fill="${C.lamp}" opacity="0.9"/></g>` +
      `<g opacity="0">${fade('0.45s', '0.2s')}<path d="M38 40 A22 22 0 0 1 82 40 Z" fill="${C.paper}"/></g>` +
      `<circle cx="60" cy="43" r="0" fill="${C.lamp}">${grow('r', 0, 5, '0.35s', '0.85s')}</circle>` +
      `<path d="M20 86 H100" stroke="${C.paper}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="80" stroke-dashoffset="80">${drawIn(80, '0.8s', '1.05s')}</path>`,
  ),
}

// ══════════════════════════════════════════════════════════════════════
// 方案 C ·「远山」 — 夜蓝底 · 山为主体（无人影）
//
// 按需求**去掉人影**，改以「三层山 + 路灯」为主体：山是叙事里那个「回不去的地方」，
// 比一个剪影小人更含蓄，也不会因为人形画得糙而显廉价。
//
// 几何要点（修过两处真实错误，都是放大 4 倍才看见的）：
//   ① 灯脚落在**平台**（shelfY）上，不悬空；
//   ② 受光弧画在平台**之下**，与山脊线不相交（早先两条线交叉成 X）。
//   机器校验：`node assets-src/check-collisions.mjs hip-head-c`
// ══════════════════════════════════════════════════════════════════════
const C_SKY = {}
const C_SHELF_X = 232
const C_SHELF_Y = 114
const C_TEXT_BOTTOM = 98

/** C 的头图公共骨架：山 + 平台 + 灯 + 受光弧 + 品牌文字，天空内容由参数注入。 */
const cHead = (sky) =>
  svg(
    '0 0 340 132',
    `<rect width="340" height="132" fill="${C.night}"/>` +
      sky +
      mountainLayers({ shelfX: C_SHELF_X, shelfY: C_SHELF_Y, textBottom: C_TEXT_BOTTOM }) +
      lampPost({ x: 272, groundY: C_SHELF_Y, topY: 40, bend: -26, stroke: C.paper, dash: 130, begin: '0.5s', dur: '1s' }) +
      lampHead({ x: 246, y: 40, s: 0.72, begin: '0.9s', halo: false }) +
      litArc(246, C_SHELF_Y + 4, 62, '1.2s') +
      txt({
        x: 26, y: 44, size: 24, weight: 700, fill: C.paper, text: 'HIPPIE', ls: 1.4, opacity: 0,
        anim: fade('0.6s', '1.5s') + rise(6, '0.6s', '1.5s'),
      }) +
      txt({ x: 28, y: 67, size: 13.5, fill: C.lamp, text: '青年', ls: 5, opacity: 0, anim: fade('0.6s', '1.75s') }) +
      txt({ x: 26, y: 94, size: 8.5, ls: 1.3, fill: C.paper, text: '前已无通路 · 后不见归途', opacity: 0, anim: fade('0.7s', '2s') }),
  )

const C_PLAN = {
  key: 'c-traveler',
  label: '方案 C ·「远山」',
  idea: '三层山叠进夜里，一盏灯已经先亮了 —— 山是那个「回不去的地方」，比人影含蓄得多',
  typography: '标题压在山脊之上的天空带，靠明度差读字；暖橘只在灯与地面一小弧',
  timeline: [
    '0.00s 暮色三层自上而下压下来（每层错 0.25s）',
    '0.40s 远山 → 0.50s 中景山 → 0.70s 近山脊描白边（1.6s）',
    '0.50s 灯柱自平台升起、0.90s 灯罩点亮',
    '1.20s 平台下方那一道受光弧自中点展开（0.9s）',
    '1.50s「HIPPIE」自下浮出 → 1.75s「青年」→ 2.00s 签名',
  ],
  header: cHead(moon(186, 34, 11)),
  footer: svg(
    '0 0 340 140',
    `<rect width="340" height="140" fill="${C.night}"/>` +
      // 与 A 尾图同构：纯文字 + 一条强调线。唯一保留的图形是弦月 ——
      // 夜蓝底上没有月亮就不成立，且它远离文字区、一枚即可。
      moon(304, 34, 9) +
      txt({
        x: 170, y: 64, size: 15, fill: C.paper, anchor: 'middle', text: '前已无通路，后不见归途。', opacity: 0,
        anim: fade('0.9s', '0.1s') + rise(5, '0.9s', '0.1s'),
      }) +
      `<rect x="142" y="82" width="0" height="1.2" fill="${C.lamp}">${grow('width', 0, 56, '0.7s', '0.75s')}</rect>` +
      txt({ x: 170, y: 106, size: 9, ls: 2.6, fill: C.paper, anchor: 'middle', text: 'HIPPIE 青年', opacity: 0, anim: fade('0.7s', '1s') }),
  ),
  logo: svg(
    '0 0 120 120',
    // 人在 48px 下必须是**实心剪影**才看得见（描边会散掉）；行囊要背在**身后**，
    // 抱在身前会读成相机。不做光晕——夜与昼的分界本身就是这张图的光。
    `<rect width="120" height="120" rx="24" fill="${C.night}"/>` +
      `<rect x="0" y="78" width="120" height="42" fill="${C.paper}"/>` +
      `<circle cx="92" cy="32" r="0" fill="${C.lamp}">${grow('r', 0, 5, '0.4s', '0.2s')}</circle>` +
      `<circle cx="92" cy="32" r="11" fill="none" stroke="${C.lamp}" stroke-width="1.6" opacity="0">` +
      `<animate attributeName="opacity" values="0;0.5" dur="0.5s" begin="0.5s" fill="freeze"/>` +
      `<animate attributeName="r" values="11;15" dur="4.5s" begin="1.2s" repeatCount="indefinite"/></circle>` +
      `<path d="M0 78 H120" stroke="${C.lamp}" stroke-width="2" stroke-dasharray="120" stroke-dashoffset="120">${drawIn(120, '0.9s', '0.85s')}</path>` +
      // 背行囊的青年（实心剪影，侧身行走）。与头图同一套部件拆法，只是压到 48px 仍可辨。
      `<g fill="${C.paper}" opacity="0">` +
      fade('0.6s', '1.05s') +
      rise(8, '0.7s', '1.05s') +
      `<circle cx="56" cy="33" r="7.5"/>` +
      `<path d="M50.5 42 h11 v4 h-11 z"/>` +
      `<path d="M49 45 h14 l-1.5 21 h-11 z"/>` +
      `<path d="M48 45 h-6 a2.5 2.5 0 0 0 -2.5 2.5 v14 h8.5 z"/>` +
      `<path d="M62 46 l4.5 12" stroke="${C.paper}" stroke-width="3.2" stroke-linecap="round"/>` +
      `<path d="M54 66 l7.5 8.5 v9.5" stroke="${C.paper}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
      `<path d="M51 66 l-4.5 9 v8.5" stroke="${C.paper}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
      `</g>`,
  ),
}

const PLANS = [A, B, C_PLAN]

// ══════════════════════════════════════════════════════════════════════
// 文章内插图 ·「信封」—— 纯线稿动画，不依赖任何外部图片
// ══════════════════════════════════════════════════════════════════════
const LETTER = svg(
  '0 0 320 186',
  `<rect width="320" height="186" fill="${C.paper}"/>` +
    // 信纸先从信封后升起。分层层序有讲究：信纸下缘必须落在信封上缘（y=52）之上，
    // 否则会被信封的实心矩形盖住，只剩一条线（上一版真踩过这个坑）。
    `<g opacity="0">` +
    fade('0.5s', '0.45s') +
    rise(20, '0.9s', '0.45s') +
    `<rect x="76" y="10" width="168" height="42" fill="${C.card}" stroke="${C.rule}" stroke-width="1.4"/>` +
    [0, 1, 2]
      .map(
        (i) =>
          `<rect x="92" y="${20 + i * 10}" width="${[120, 96, 66][i]}" height="3" fill="${C.night}" opacity="0">` +
          `<animate attributeName="opacity" values="0;0.4" dur="0.35s" begin="${(0.75 + i * 0.14).toFixed(2)}s" fill="freeze"/></rect>`,
      )
      .join('') +
    `</g>` +
    `<rect x="40" y="52" width="240" height="88" fill="${C.paper}" stroke="${C.night}" stroke-width="2" stroke-dasharray="656" stroke-dashoffset="656">${drawIn(656, '1.1s', '0s')}</rect>` +
    `<path d="M40 52 L160 118 L280 52" fill="none" stroke="${C.night}" stroke-width="2" stroke-linecap="round" stroke-dasharray="270" stroke-dashoffset="270">${drawIn(270, '0.9s', '1.05s')}</path>` +
    `<circle cx="254" cy="124" r="0" fill="${C.lamp}">${grow('r', 0, 6, '0.45s', '1.6s')}</circle>` +
    txt({ x: 160, y: 172, size: 11, fill: C.muted, anchor: 'middle', text: '信封寄回了家，答案没有跟着回来', opacity: 0, anim: fade('0.6s', '1.75s') }),
)

// ══════════════════════════════════════════════════════════════════════
// 输出：SVG 源文件 + stylewx 组件模板 + 封面 + 预览页
// ══════════════════════════════════════════════════════════════════════
const TOKENS = [
  [C.night, '{{theme.primary}}'],
  [C.nightSoft, '{{theme.primaryStrong}}'],
  [C.lamp, '{{theme.primarySoft}}'],
  [C.lampSoft, '{{theme.primarySoft}}'],
  [C.twilight, '{{theme.primaryStrong}}'],
  [C.paper, '{{theme.canvasBg}}'],
  [C.card, '{{theme.cardBg}}'],
  [C.rule, '{{theme.divider}}'],
  [C.muted, '{{theme.muted}}'],
  [C.text, '{{theme.text}}'],
]

const component = (markup, params = []) => {
  let out = markup
  for (const [hex, token] of TOKENS) out = out.split(hex).join(token)
  for (const [from, to] of params) out = out.split(from).join(to)
  return `<section style="margin:0 0 18px">${out}</section>`
}

// 品牌图源写进**工作区**，不写回仓库（仓库只放这个生成器）
const outDir = brandMotionDir()
mkdirSync(outDir, { recursive: true })

const manifest = []
for (const [i, p] of PLANS.entries()) {
  for (const [kind, markup] of Object.entries({ header: p.header, footer: p.footer, logo: p.logo })) {
    writeFileSync(join(outDir, `${p.key}.${kind}.svg`), markup, 'utf8')
  }
  manifest.push({
    plan: p.label,
    idea: p.idea,
    typography: p.typography,
    timeline: p.timeline,
    components: [
      {
        name: `hip-head-${'abc'[i]}`,
        description: `${p.label} 头图：${p.idea}`,
        template: component(p.header, [
          ['HIPPIE YOUTH · NOTES', '{{slogan}}'],
          ['前已无通路 · 后不见归途', '{{signature}}'],
        ]),
        defaults: { slogan: 'HIPPIE YOUTH · NOTES', signature: '前已无通路 · 后不见归途' },
      },
      {
        name: `hip-end-${'abc'[i]}`,
        description:
          i === 0
            ? `${p.label} 尾图：签名 + 落款，纯文字版式（无图形元素）`
            : `${p.label} 尾图：签名 + 落款，配与头图同源的灯（后图与头图呼应）`,
        template: component(p.footer, [['前已无通路，后不见归途。', '{{signature}}']]),
        defaults: { signature: '前已无通路，后不见归途。' },
      },
    ],
    logo: p.logo,
  })
}
writeFileSync(join(outDir, 'components.json'), JSON.stringify(manifest, null, 1), 'utf8')
writeFileSync(
  join(outDir, 'extras.json'),
  JSON.stringify(
    [
      {
        name: 'hip-letter',
        description: '信封线稿动画插图：外廓描边 → 信纸升起 → 封口 V 线 → 暖色火漆点；纯 SVG，不依赖外部图片',
        template: component(LETTER, [['信封寄回了家，答案没有跟着回来', '{{caption}}']]),
        defaults: { caption: '信封寄回了家，答案没有跟着回来' },
      },
    ],
    null,
    1,
  ),
  'utf8',
)

// 封面图 2.35:1（900×383）—— 微信封面只收位图，动效拍不进去，这里给与头图同源的静帧版式
const cover = svg(
  '0 0 940 400',
  `<rect width="940" height="400" fill="${C.paper}"/>` +
    `<rect x="0" y="0" width="0" height="7" fill="${C.night}">${grow('width', 0, 940, '1.2s', '0s')}</rect>` +
    lampPost({ x: 812, groundY: 320, topY: 118, bend: 56, stroke: C.nightSoft, dash: 290, begin: '0.4s', dur: '1.2s' }) +
    lampHead({ x: 868, y: 118, s: 1.5, begin: '1.2s', halo: true }) +
    txt({ x: 64, y: 96, size: 15, fill: C.muted, text: 'HIPPIE 青年', ls: 5, opacity: 0, anim: fade('0.7s', '0.5s') }) +
    `<rect x="64" y="118" width="0" height="1" fill="${C.rule}">${grow('width', 0, 812, '1s', '0.7s')}</rect>` +
    `<g opacity="0">${fade('0.8s', '1.0s')}<text x="64" y="188" font-size="62" font-weight="700" fill="${C.night}" font-family="${SERIF}" letter-spacing="2">HIPPIE</text></g>` +
    `<g opacity="0">${fade('0.8s', '1.2s')}<text x="66" y="228" font-size="30" fill="${C.muted}" font-family="${SERIF}" letter-spacing="12">青年</text></g>` +
    txt({ x: 64, y: 300, size: 27, fill: C.night, text: '关于部分高校寄成绩单的思考', opacity: 0, anim: fade('0.8s', '1.5s') }) +
    txt({ x: 64, y: 340, size: 20, fill: C.lamp, text: '—— 知情权之外，问题还在原地', opacity: 0, anim: fade('0.8s', '1.75s') }) +
    txt({ x: 876, y: 372, size: 13, fill: C.muted, anchor: 'end', text: '独夫之心', opacity: 0, anim: fade('0.7s', '2.0s') }),
)
writeFileSync(join(outDir, 'cover.svg'), cover, 'utf8')

writeFileSync(
  join(outDir, 'rasterize.json'),
  JSON.stringify(
    [
      { html: cover, w: 940, h: 400, out: 'cover.png' },
      { html: A.logo, w: 240, h: 240, out: 'logo-a.png' },
      { html: B.logo, w: 240, h: 240, out: 'logo-b.png' },
      { html: C_PLAN.logo, w: 240, h: 240, out: 'logo-c.png' },
    ],
    null,
    1,
  ),
  'utf8',
)

const page = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>Hippie 青年 · 动效品牌资产三方案</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:40px;background:#E7E5DF;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:${C.text}}
  h1{font-family:${SERIF};font-size:26px;color:${C.night};margin:0 0 6px;letter-spacing:1px}
  .sub{color:${C.muted};font-size:13px;margin-bottom:26px;line-height:1.8}
  .plan{background:#fff;border:1px solid ${C.rule};border-radius:10px;padding:22px;margin-bottom:24px}
  .plan h2{font-family:${SERIF};font-size:19px;color:${C.night};margin:0 0 4px}
  .idea{font-size:13px;color:${C.muted};margin-bottom:6px;line-height:1.7}
  .typo{font-size:12px;color:${C.muted};margin-bottom:14px}
  .row{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}
  .panel{width:340px;background:${C.paper};border:1px solid ${C.rule};border-radius:6px;overflow:hidden}
  .panel .cap{font-size:11px;color:${C.muted};padding:7px 10px;border-top:1px solid ${C.rule};background:#fff}
  .tl{font-size:11.5px;color:${C.muted};line-height:1.95;min-width:268px}
  .tl b{color:${C.night};font-weight:600}
  .tiny{width:120px;background:${C.paper};border:1px solid ${C.rule};border-radius:6px;overflow:hidden}
</style></head><body>
<h1>Hippie 青年 · 动效品牌资产</h1>
<div class="sub">三套动效语法 · 内联 SVG + SMIL（微信实测保留并真实触发）<br>
色板采样自账号头像：夜蓝天空 ${C.night}→${C.twilight}、路灯暖橘 ${C.lamp}；文案锚点取自账号签名「前已无通路，后不见归途。」<br>
下方静帧是动画终态，动效请在浏览器 / 公众号里看。</div>
<div class="plan">
  <h2>封面图（2.35:1，微信只接受位图）</h2>
  <div class="idea">封面拍不出动效 —— 微信封面只能是静态 PNG。这里给出与头图同源的静帧版式，与文章内头图形成呼应。</div>
  <div style="width:640px;border:1px solid ${C.rule};border-radius:6px;overflow:hidden">${cover}</div>
</div>
${PLANS.map(
  (p) => `<div class="plan">
  <h2>${p.label}</h2>
  <div class="idea">${p.idea}</div>
  <div class="typo">排印策略：${p.typography}</div>
  <div class="row">
    <div class="tl"><b>时间轴</b><br>${p.timeline.map((t) => t.replace(/^(\S+)\s/, '<b>$1</b> ')).join('<br>')}</div>
    <div class="panel">${p.header}<div class="cap">头图 340×132</div></div>
    <div class="panel">${p.footer}<div class="cap">尾图 340×140</div></div>
    <div class="tiny">${p.logo}<div class="cap" style="padding:4px 6px">logo</div></div>
  </div>
</div>`,
).join('')}
<div class="plan">
  <h2>文章内插图 ·「信封」</h2>
  <div class="idea">纯线稿动画，不依赖任何外部图片资源 —— 用在正文里做视觉锚点。</div>
  <div style="width:340px;border:1px solid ${C.rule};border-radius:6px;overflow:hidden">${LETTER}<div class="cap">插图 320×186</div></div>
</div>
</body></html>`
writeFileSync(join(outDir, 'preview.html'), page, 'utf8')

console.log('✓', PLANS.map((p) => p.label).join(' / '), '→', outDir)
