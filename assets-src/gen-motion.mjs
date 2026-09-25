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
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

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
 * 灯罩 + 灯泡 + 光晕（光晕呼吸）。
 * ⚠️ 缩放必须用 transform 把原点搬到灯心再 scale。
 * 早先写成 `g(v) = v * s` 直接乘绝对坐标，灯头被搬到 (x*s, y*s)，和灯柱弧头脱开，越放大偏得越厉害。
 */
const lampHead = ({ x, y, s = 1, begin, halo = true }) =>
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
      lampHead({ x: 300, y: 40, begin: '1.1s' }) +
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
// 方案 B ·「灯下」 — 光从灯里长出来
// 语法：不是画线，是「点亮」。光圈层层推开，被照到的文字才显影
// ══════════════════════════════════════════════════════════════════════
const B = {
  key: 'b-lamplight',
  label: '方案 B ·「灯下」',
  idea: '光从灯里一层层推开，字是被照亮的 —— 最适合「做题 / 读书 / 思考」这类内容',
  typography: '标题被光线扫过后才显影；暖黄是唯一亮点，其余全冷',
  timeline: [
    '0.00s 灯柱描出、灯罩落下（0.9s）',
    '0.85s 灯泡亮起（0.5s 渐亮，灯罩先落定再发光）',
    '0.95s 三层光圈依次推开（各错 0.35s，长尾缓动）',
    '1.20s 标题上浮显影 → 1.29s「青年」→ 2.00s 题注',
    '2.40s 内层光圈转入 6s 呼吸循环',
  ],
  header: svg(
    '0 0 340 132',
    `<rect width="340" height="132" fill="${C.paper}"/>` +
      // 三层光圈：半径收在画布内，避免硬切在边缘
      `<ellipse cx="126" cy="80" rx="0" ry="0" fill="${C.lamp}" opacity="0">${grow('rx', 0, 122, '1.5s', '0.95s')}${grow('ry', 0, 52, '1.5s', '0.95s')}<animate attributeName="opacity" from="0" to="0.1" dur="0.8s" begin="0.95s" fill="freeze"/></ellipse>` +
      `<ellipse cx="126" cy="80" rx="0" ry="0" fill="${C.lampSoft}" opacity="0">${grow('rx', 0, 84, '1.3s', '1.3s')}${grow('ry', 0, 36, '1.3s', '1.3s')}<animate attributeName="opacity" from="0" to="0.16" dur="0.7s" begin="1.3s" fill="freeze"/></ellipse>` +
      `<ellipse cx="126" cy="80" rx="0" ry="0" fill="${C.lamp}" opacity="0">${grow('rx', 0, 44, '1.1s', '1.65s')}${grow('ry', 0, 21, '1.1s', '1.65s')}<animate attributeName="opacity" from="0" to="0.24" dur="0.6s" begin="1.65s" fill="freeze"/><animate attributeName="opacity" values="0.24;0.34;0.24" dur="6s" begin="2.4s" repeatCount="indefinite"/></ellipse>` +
      lampPost({ x: 96, groundY: 120, topY: 54, bend: 30, stroke: C.nightSoft, dash: 120, begin: '0s', dur: '0.9s' }) +
      lampHead({ x: 126, y: 54, begin: '0.85s', halo: false }) +
      txt({
        x: 206, y: 62, size: 24, weight: 700, fill: C.night, text: 'HIPPIE', ls: 1.2, opacity: 0,
        anim: fade('0.5s', '1.2s') + rise(0, '0.55s', '1.2s'),
      }) +
      txt({ x: 208, y: 86, size: 14, fill: C.muted, text: '青年', ls: 5.5, opacity: 0, anim: fade('0.5s', '1.29s') }) +
      txt({ x: 206, y: 110, size: 9, ls: 1.4, fill: C.muted, text: '前已无通路 · 后不见归途', opacity: 0, anim: fade('0.6s', '2s') }),
  ),
  footer: svg(
    '0 0 340 140',
    `<rect width="340" height="140" fill="${C.paper}"/>` +
      `<ellipse cx="170" cy="70" rx="0" ry="0" fill="${C.lamp}" opacity="0">${grow('rx', 0, 150, '1.6s', '0.3s')}${grow('ry', 0, 60, '1.6s', '0.3s')}<animate attributeName="opacity" from="0" to="0.09" dur="0.9s" begin="0.3s" fill="freeze"/></ellipse>` +
      // 顶端 = y − 30，y=18 会被切平；下移到 34
      lampHead({ x: 170, y: 34, begin: '0s', halo: false }) +
      txt({
        x: 170, y: 78, size: 14, fill: C.night, anchor: 'middle', text: '前已无通路，后不见归途。', opacity: 0,
        anim: fade('0.9s', '0.85s') + rise(5, '0.9s', '0.85s'),
      }) +
      `<rect x="140" y="92" width="0" height="1" fill="${C.lamp}">${grow('width', 0, 60, '0.6s', '1.5s')}</rect>` +
      txt({ x: 170, y: 114, size: 9, ls: 2.4, fill: C.muted, anchor: 'middle', text: 'HIPPIE 青年', opacity: 0, anim: fade('0.6s', '1.7s') }),
  ),
  logo: svg(
    '0 0 120 120',
    // 「光」这件事用**一束实心光锥**表达，不用低透明光晕也不用同心弧：
    // 低透明暖色叠在深底上会调出脏灰；同心弧半径一大就出画布被圆角切掉。
    // 实心光锥是纯色，缩小后依然是一块干净的暖色。
    `<rect width="120" height="120" rx="24" fill="${C.night}"/>` +
      // 光锥：从灯罩口投到地面
      `<g opacity="0">${fade('0.6s', '0.5s')}<path d="M45 40 L75 40 L98 86 L22 86 Z" fill="${C.lamp}" opacity="0.9"/></g>` +
      // 灯罩
      `<g opacity="0">${fade('0.45s', '0.2s')}<path d="M38 40 A22 22 0 0 1 82 40 Z" fill="${C.paper}"/></g>` +
      // 灯泡：灯罩口上那一点
      `<circle cx="60" cy="43" r="0" fill="${C.lamp}">${grow('r', 0, 5, '0.35s', '0.85s')}</circle>` +
      // 地平线
      `<path d="M20 86 H100" stroke="${C.paper}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="80" stroke-dashoffset="80">${drawIn(80, '0.8s', '1.05s')}</path>`,
  )
}

/**
 * 行囊青年剪影。
 * ⚠️ 坐标在这里全部烘成绝对值，*不*用 transform="translate() scale()"。
 * 原因（实测）：父级 <g> 挂了 <animateTransform transform> 时，子树里任何静态 transform
 * 都会让整棵子树消失 —— 不是动画失效，是整个图形不见。
 * 建过 case1..4 对照组：唯独「外层 animateTransform + 内层静态 transform」这一组合什么都画不出来。
 */
const traveler = ({ x, y, s, stroke }) => {
  const px = (lx) => +(x + lx * s).toFixed(2)
  const py = (ly) => +(y + ly * s).toFixed(2)
  return (
    `<g opacity="0" fill="none" stroke="${stroke}" stroke-width="${(2.6 * s).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">` +
    fade('0.6s', '1.15s') +
    `<animateTransform attributeName="transform" type="translate" from="40 0" to="0 0" values="40 0;0 0" keyTimes="0;1" calcMode="spline" keySplines="${SLOW}" dur="1.6s" begin="1.15s" fill="freeze"/>` +
    `<circle cx="${px(0)}" cy="${py(-30)}" r="${(7 * s).toFixed(2)}"/>` +
    `<path d="M${px(-8)} ${py(-34)} Q${px(0)} ${py(-46)} ${px(8)} ${py(-34)}"/>` +
    `<path d="M${px(0)} ${py(-23)} L${px(0)} ${py(-6)}"/>` +
    `<rect x="${px(-13)}" y="${py(-22)}" width="${(15 * s).toFixed(2)}" height="${(17 * s).toFixed(2)}" rx="${(3 * s).toFixed(2)}"/>` +
    `<path d="M${px(0)} ${py(-6)} L${px(-6)} ${py(10)} M${px(0)} ${py(-6)} L${px(7)} ${py(10)}"/>` +
    `</g>`
  )
}

// ══════════════════════════════════════════════════════════════════════
// 方案 C ·「行囊」 — 渐层暮色 + 一个剪影走进去
// ══════════════════════════════════════════════════════════════════════
const C_PLAN = {
  key: 'c-traveler',
  label: '方案 C ·「行囊」',
  idea: '暮色分三层压下来，一个人背着行囊走进画面，路灯已经先亮了 —— 叙事性最强的一套',
  typography: '标题压在地平线上，靠天空的明度差读字；暖灯与冷夜强对比',
  timeline: [
    '0.00s 暮色分三层自上而下压下来（每层错 0.25s）',
    '0.40s 地平线描出 → 0.55s 灯柱、0.95s 灯罩',
    '1.15s 剪影从右缘走进画面并停在灯下（1.6s，长尾缓动）',
    '1.60s「HIPPIE」自下浮出 → 1.85s「青年」→ 2.10s 签名',
  ],
  header: svg(
    '0 0 340 132',
    `<rect width="340" height="132" fill="${C.paper}"/>` +
      // 三层暮色：叠三层比单层渐变更接近纸本质感；明度差收紧，避免出现硬色带
      `<rect x="0" y="0" width="340" height="0" fill="${C.night}" opacity="0.9">${grow('height', 0, 132, '1.4s', '0s')}<animate attributeName="opacity" from="0" to="0.9" dur="0.9s" begin="0s" fill="freeze"/></rect>` +
      `<rect x="0" y="0" width="340" height="0" fill="${C.twilight}" opacity="0">${grow('height', 0, 92, '1.4s', '0.25s')}<animate attributeName="opacity" from="0" to="0.3" dur="0.9s" begin="0.25s" fill="freeze"/></rect>` +
      `<rect x="0" y="0" width="340" height="0" fill="${C.nightSoft}" opacity="0">${grow('height', 0, 54, '1.4s', '0.5s')}<animate attributeName="opacity" from="0" to="0.22" dur="0.9s" begin="0.5s" fill="freeze"/></rect>` +
      `<path d="M0 96 H340" stroke="${C.paper}" stroke-width="1.4" opacity="0.6" stroke-dasharray="340" stroke-dashoffset="340">${drawIn(340, '1s', '0.4s')}</path>` +
      lampPost({ x: 262, groundY: 96, topY: 28, bend: 32, stroke: C.paper, dash: 122, begin: '0.55s', dur: '1s' }) +
      lampHead({ x: 294, y: 28, s: 0.82, begin: '0.95s' }) +
      traveler({ x: 176, y: 96, s: 0.82, stroke: C.paper }) +
      txt({
        x: 28, y: 54, size: 25, weight: 700, fill: C.paper, text: 'HIPPIE', ls: 1.4, opacity: 0,
        anim: fade('0.7s', '1.6s') + rise(7, '0.7s', '1.6s'),
      }) +
      txt({ x: 30, y: 78, size: 13.5, fill: C.lamp, text: '青年', ls: 5, opacity: 0, anim: fade('0.7s', '1.85s') }) +
      txt({ x: 28, y: 118, size: 8.5, ls: 1.3, fill: C.paper, text: '前已无通路 · 后不见归途', opacity: 0, anim: fade('0.8s', '2.1s') }),
  ),
  footer: svg(
    '0 0 340 140',
    `<rect width="340" height="140" fill="${C.paper}"/>` +
      `<rect x="0" y="0" width="340" height="0" fill="${C.night}" opacity="0.92">${grow('height', 0, 140, '1.5s', '0s')}<animate attributeName="opacity" from="0" to="0.92" dur="0.9s" begin="0s" fill="freeze"/></rect>` +
      `<rect x="0" y="0" width="340" height="0" fill="${C.nightSoft}" opacity="0">${grow('height', 0, 74, '1.4s', '0.3s')}<animate attributeName="opacity" from="0" to="0.24" dur="0.9s" begin="0.3s" fill="freeze"/></rect>` +
      lampPost({ x: 274, groundY: 112, topY: 34, bend: -30, stroke: C.paper, dash: 122, begin: '0.35s', dur: '1s' }) +
      lampHead({ x: 244, y: 34, s: 0.8, begin: '0.8s' }) +
      txt({
        x: 32, y: 62, size: 16, weight: 700, fill: C.paper, text: '前已无通路', opacity: 0,
        anim: fade('0.7s', '1.05s') + rise(5, '0.7s', '1.05s'),
      }) +
      txt({
        x: 32, y: 88, size: 16, weight: 700, fill: C.lamp, text: '后不见归途', opacity: 0,
        anim: fade('0.7s', '1.35s') + rise(5, '0.7s', '1.35s'),
      }) +
      `<rect x="32" y="102" width="0" height="1.2" fill="${C.lamp}" opacity="0.7">${grow('width', 0, 74, '0.7s', '1.7s')}</rect>` +
      txt({ x: 32, y: 122, size: 9, ls: 2.2, fill: C.paper, text: 'HIPPIE 青年', opacity: 0, anim: fade('0.6s', '1.9s') }),
  ),
  logo: svg(
    '0 0 120 120',
    // 人在 48px 下必须是**实心剪影**才看得见（描边会散掉）；行囊要背在**身后**，
    // 抱在身前会读成相机。不做光晕——夜与昼的分界本身就是这张图的光。
    `<rect width="120" height="120" rx="24" fill="${C.night}"/>` +
      `<rect x="0" y="78" width="120" height="42" fill="${C.paper}"/>` +
      // 远处那盏灯：一个亮点 + 一圈细环
      `<circle cx="92" cy="32" r="0" fill="${C.lamp}">${grow('r', 0, 5, '0.4s', '0.2s')}</circle>` +
      `<circle cx="92" cy="32" r="11" fill="none" stroke="${C.lamp}" stroke-width="1.6" opacity="0">` +
      `<animate attributeName="opacity" values="0;0.5" dur="0.5s" begin="0.5s" fill="freeze"/>` +
      `<animate attributeName="r" values="11;15" dur="4.5s" begin="1.2s" repeatCount="indefinite"/>` +
      `</circle>` +
      // 地平线
      `<path d="M0 78 H120" stroke="${C.lamp}" stroke-width="2" stroke-dasharray="120" stroke-dashoffset="120">${drawIn(120, '0.9s', '0.85s')}</path>` +
      // 背行囊的青年（实心剪影）。要点：行囊与躯干之间**留一道缝**，否则两者并成一块方
      // 就谁也读不出来（上一版 48px 下糊成一坨）；腿要够粗，细三角在缩小后直接消失。
      `<g fill="${C.paper}" opacity="0">` +
      fade('0.6s', '1.05s') +
      rise(8, '0.7s', '1.05s') +
      `<circle cx="55" cy="36" r="7.5"/>` +
      // 躯干：肩窄下摆宽，像件外套
      `<path d="M48 46 L62 46 L65 66 L45 66 Z"/>` +
      // 行囊：贴在背后，与躯干留 1.5px 缝
      `<path d="M63.5 47 h7 a3 3 0 0 1 3 3 v9 h-10 z"/>` +
      // 腿：加粗，中间留缝
      `<path d="M49 67 l-2.5 12 h5 z M60 67 l2.5 12 h-5 z"/>` +
      `</g>`,
  )
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

const outDir = join(HERE, 'motion')
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
        description: `${p.label} 尾图：签名 + 落款，纯文字版式（无图形元素）`,
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
    lampHead({ x: 868, y: 118, s: 1.5, begin: '1.2s' }) +
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
