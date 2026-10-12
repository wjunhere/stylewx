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

/**
 * 同心光池：多层低透明度实心椭圆，伪造「柔光衰减」。
 * 为什么不用 <radialGradient>：微信会剥掉 <defs> 与 id，`fill="url(#…)"` 到读者端必裂。
 * 多层低透明度叠加是唯一能在微信里成立的柔边做法。
 */
const pool = (rings, begin) =>
  rings
    .map(([cx, cy, rx, ry, op], i) => {
      const b = `${(parseFloat(begin) + i * 0.32).toFixed(2)}s`
      return (
        `<ellipse cx="${cx}" cy="${cy}" rx="0" ry="0" fill="${i % 2 ? C.lampSoft : C.lamp}" opacity="0">` +
        grow('rx', 0, rx, '1.6s', b) +
        grow('ry', 0, ry, '1.6s', b) +
        `<animate attributeName="opacity" from="0" to="${op}" dur="0.9s" begin="${b}" fill="freeze"/></ellipse>`
      )
    })
    .join('')

/**
 * 路面受光：地平线上一道被灯照亮的小弧。
 *
 * 为什么不用椭圆光斑 / 灯罩光晕（C 两种都用过，实测都被退回）：
 * 品牌 learning 明载「深色底上大面积 + 低透明度的暖色会调出脏灰」。C 是**深色底**，
 * 把暖橘以 opacity 0.13~0.35 铺在夜蓝上，无论椭圆多大、叠几层，都会变成灰褐/土棕，
 * 读成一块「煎饼」或「陨石坑」。7 种方案实拍对照见 assets-src/try-pool.mjs。
 *
 * 深色底上成立的做法只有两类：
 *   ① 小面积 + 高不透明度（实心灯头、灯泡）；
 *   ② **纯色描边**（就是这道弧）—— 描边不参与底色混色，所以不会脏。
 */
const litArc = ({ x, y, w, stroke, begin = '0s', dur = '0.9s', opacity = 0.7 }) => {
  const len = Math.round(w * 1.06)
  return (
    `<path d="M${x - w / 2} ${y} Q${x} ${y - w * 0.18} ${x + w / 2} ${y}" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" opacity="${opacity}" stroke-dasharray="${len}" stroke-dashoffset="${len}">` +
    drawIn(len, dur, begin) +
    `</path>`
  )
}

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
  /**
   * 与 A / C 的区分靠「画面主导色」：三套用的是**同一组颜色**
   * （夜蓝 / 纸白 / 暖橘），只是各让其中一个占主导：
   *   A 纸白主导（亮）→ B 暖灰纸主导（暖）→ C 夜蓝主导（暗）。
   * 所以 B 的底用 cardBg 而不是 canvasBg，整体读成「被灯烤暖的纸」。
   */
  timeline: [
    '0.00s 地面与桌线描出（0.8s）',
    '0.35s 灯柱描出、灯罩落下（0.9s）',
    '0.85s 灯泡亮起（0.5s 渐亮，灯罩先落定再发光）',
    '0.95s 三层光池依次推开（各错 0.32s，长尾缓动）',
    '1.45s 尘埃颗粒在光里浮起（错峰，营造「灯下有空气」）',
    '1.20s 标题上浮显影 → 1.29s「青年」→ 2.00s 题注',
    '2.40s 内层光池转入 6s 呼吸循环',
  ],
  header: svg(
    '0 0 340 132',
    `<rect width="340" height="132" fill="${C.card}"/>` +
      // 光池：三层叠出柔光衰减（微信剥 id，不能用 radialGradient）
      pool([[126, 78, 124, 54, 0.1], [126, 78, 86, 38, 0.16], [126, 78, 48, 23, 0.24]], '0.95s') +
      // 地面：一道冷色基线把光池「坐」住，否则光池像飘在空中
      `<path d="M18 118 H322" stroke="${C.rule}" stroke-width="1.4" stroke-dasharray="304" stroke-dashoffset="304">${drawIn(304, '0.8s', '0s')}</path>` +
      lampPost({ x: 96, groundY: 118, topY: 54, bend: 30, stroke: C.nightSoft, dash: 120, begin: '0.35s', dur: '0.9s' }) +
      lampHead({ x: 126, y: 54, begin: '0.85s', halo: false }) +
      // 尘埃：光里的小颗粒。很小、很淡，但它是「灯下有空气」的关键，没有就显得空
      [
        [104, 74, 1.5], [118, 96, 1.1], [140, 84, 1.8], [152, 106, 1.2],
        [112, 62, 1.0], [134, 112, 1.4], [96, 92, 1.2], [146, 68, 1.0],
      ]
        .map(
          ([cx, cy, r], i) =>
            `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.lamp}" opacity="0">` +
            `<animate attributeName="opacity" from="0" to="${0.25 + (i % 3) * 0.12}" dur="0.7s" begin="${(1.45 + i * 0.09).toFixed(2)}s" fill="freeze"/>` +
            `<animate attributeName="cy" values="${cy};${cy - 7};${cy}" dur="${(4.5 + (i % 4)).toFixed(1)}s" begin="${(2.2 + i * 0.2).toFixed(2)}s" repeatCount="indefinite"/></circle>`,
        )
        .join('') +
      txt({
        x: 206, y: 62, size: 24, weight: 700, fill: C.night, text: 'HIPPIE', ls: 1.2, opacity: 0,
        anim: fade('0.5s', '1.2s') + rise(0, '0.55s', '1.2s'),
      }) +
      txt({ x: 208, y: 86, size: 14, fill: C.muted, text: '青年', ls: 5.5, opacity: 0, anim: fade('0.5s', '1.29s') }) +
      txt({ x: 206, y: 110, size: 9, ls: 1.4, fill: C.muted, text: '前已无通路 · 后不见归途', opacity: 0, anim: fade('0.6s', '2s') }),
  ),
  footer: svg(
    '0 0 340 140',
    `<rect width="340" height="140" fill="${C.card}"/>` +
      // 尾图的灯不再画灯柱：只剩一枚灯罩悬浮在光池里，像熄灯前最后一眼
      pool([[170, 92, 152, 44, 0.09], [170, 92, 104, 30, 0.15], [170, 92, 58, 17, 0.22]], '0.3s') +
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
/**
 * 行囊青年剪影（侧身行走，朝右）。
 *
 * 画法要点（上一版被批「太简陋」，这里是重做版）：
 *   - 头、躯干、行囊、手臂、双腿是**五个独立部件**，不是一个圆加两条线；
 *   - 躯干肩宽腰收、整体前倾，走路姿态才有「动」的感觉；
 *   - 行囊与躯干之间**留一道透光的缝**，否则两块并成一个方块，两个都读不出来；
 *   - 腿画成膝盖两段式（髋→膝→脚），大腿小腿都够粗，缩小后不糊；
 *   - 后腿蹬地、前腿迈出，与「走进画面」的位移动画方向一致。
 *
 * ⚠️ 坐标全部烘成绝对值，*不*用 transform="translate() scale()"。
 * 原因（实测，见文件头坑二）：父级 <g> 挂了 <animateTransform> 时，
 * 子树里任何静态 transform 都会让整棵子树消失 —— 不是动画失效，是图形整个不见。
 */
const traveler = ({ x, y, s, color }) => {
  const px = (lx) => +(x + lx * s).toFixed(2)
  const py = (ly) => +(y + ly * s).toFixed(2)
  const w = (v) => +(v * s).toFixed(2)
  return (
    `<g opacity="0">` +
    fade('0.7s', '1.2s') +
    // 自左缘走入（负偏移 → 移到落点），朝向右侧那盏已经亮起的灯
    `<animateTransform attributeName="transform" type="translate" from="-56 0" to="0 0" values="-56 0;0 0" keyTimes="0;1" calcMode="spline" keySplines="${SLOW}" dur="1.8s" begin="1.2s" fill="freeze"/>` +
    // 头：略前倾
    `<circle cx="${px(1.5)}" cy="${py(-41)}" r="${w(7)}" fill="${color}"/>` +
    // 颈
    `<path d="M${px(-0.5)} ${py(-35.5)} h${w(4.5)}" stroke="${color}" stroke-width="${w(4.5)}" stroke-linecap="round"/>` +
    // 躯干：肩宽、腰收、微前倾
    `<path d="M${px(-5.5)} ${py(-33)} L${px(5.5)} ${py(-33)} L${px(4)} ${py(-14)} L${px(-4)} ${py(-14)} Z" fill="${color}"/>` +
    // 行囊：贴在身后，与躯干留一道缝（缝是让它读成「包」而不是「背」的关键）
    `<path d="M${px(-13)} ${py(-32)} h${w(6)} a${w(2.4)} ${w(2.4)} 0 0 1 ${w(2.4)} ${w(2.4)} v${w(15)} h-${w(8.4)} z" fill="${color}" opacity="0.92"/>` +
    // 手臂：走路时向后摆
    `<path d="M${px(4)} ${py(-31)} L${px(8.5)} ${py(-19)}" stroke="${color}" stroke-width="${w(3.4)}" stroke-linecap="round" fill="none"/>` +
    // 双腿：膝盖两段式，前腿迈出、后腿蹬地
    `<path d="M${px(1)} ${py(-14)} L${px(9)} ${py(-6)} L${px(9.5)} ${py(0.5)}" stroke="${color}" stroke-width="${w(3.8)}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
    `<path d="M${px(-2)} ${py(-14)} L${px(-6.5)} ${py(-6)} L${px(-8)} ${py(0.5)}" stroke="${color}" stroke-width="${w(3.8)}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
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
    '0.00s 暮色三层自上而下压下来（每层错 0.25s）',
    '0.40s 地平线描出 → 0.55s 灯柱、0.95s 灯罩点亮',
    '0.70s 道路自灯下向观众方向展开（近宽远窄，建立纵深）',
    '1.00s 基座石三块错峰落定（提供尺度参照）',
    '1.20s 剪影自左缘走入画面并停在灯下（1.8s，长尾缓动）',
    '1.60s「HIPPIE」自下浮出 → 1.85s「青年」→ 2.10s 签名',
  ],
  header: svg(
    '0 0 340 132',
    `<rect width="340" height="132" fill="${C.paper}"/>` +
      // 暮色三层：叠三层比单层渐变更接近纸本印刷的层次；明度差收紧避免硬色带
      `<rect x="0" y="0" width="340" height="0" fill="${C.night}" opacity="0.9">${grow('height', 0, 132, '1.4s', '0s')}<animate attributeName="opacity" from="0" to="0.9" dur="0.9s" begin="0s" fill="freeze"/></rect>` +
      `<rect x="0" y="0" width="340" height="0" fill="${C.twilight}" opacity="0">${grow('height', 0, 92, '1.4s', '0.25s')}<animate attributeName="opacity" from="0" to="0.3" dur="0.9s" begin="0.25s" fill="freeze"/></rect>` +
      `<rect x="0" y="0" width="340" height="0" fill="${C.nightSoft}" opacity="0">${grow('height', 0, 54, '1.4s', '0.5s')}<animate attributeName="opacity" from="0" to="0.22" dur="0.9s" begin="0.5s" fill="freeze"/></rect>` +
      // 远处山脊：一道低对比的起伏。只放这一个剪影，画面就从「空底色」变成「有纵深的夜」
      `<path d="M0 92 L46 78 L88 88 L132 70 L178 86 L226 74 L276 88 L340 80 L340 96 L0 96 Z" fill="${C.night}" opacity="0">` +
      `<animate attributeName="opacity" from="0" to="0.55" dur="1s" begin="0.35s" fill="freeze"/></path>` +
      // 灯下路面的受光。
      // ⚠️ C 是深色底：不能用 fill 类光斑（pool() 与实心椭圆都会变灰/土棕），只能用纯色描边。
      // 实测对照：assets-src/try-pool.mjs。灯头 x = lampPost.x + bend = 300 + (−32) = 268。
      litArc({ x: 268, y: 104, w: 78, stroke: C.lamp, begin: '1.05s', opacity: 0.72 }) +
      // 道路：自灯下向观众方向展开。近宽远窄 + 两侧斜边是唯一能在这尺寸读出纵深的办法
      `<path d="M262 96 L326 96 L340 132 L216 132 Z" fill="${C.night}" opacity="0">` +
      `<animate attributeName="opacity" from="0" to="0.42" dur="0.9s" begin="0.7s" fill="freeze"/></path>` +
      // 路中轴：一条虚线，把视线引向灯
      `<path d="M294 98 L278 130" stroke="${C.paper}" stroke-width="1.2" stroke-dasharray="4 5" opacity="0">` +
      `<animate attributeName="opacity" from="0" to="0.38" dur="0.7s" begin="1.05s" fill="freeze"/></path>` +
      `<path d="M0 96 H340" stroke="${C.paper}" stroke-width="1.4" opacity="0.6" stroke-dasharray="340" stroke-dashoffset="340">${drawIn(340, '1s', '0.4s')}</path>` +
      lampPost({ x: 300, groundY: 96, topY: 28, bend: -32, stroke: C.paper, dash: 122, begin: '0.55s', dur: '1s' }) +
      lampHead({ x: 268, y: 28, s: 0.82, begin: '0.95s', halo: false }) +
      // 基座石三块：尺寸参照物。没人就不知道灯多大，有了石头画面才有尺度
      [
        [58, 92, 26, 5], [96, 94, 15, 3.5], [130, 93, 19, 4],
      ]
        .map(
          ([cx, cy, w2, h2], i) =>
            `<rect x="${cx}" y="${cy - h2}" width="${w2}" height="${h2}" rx="1" fill="${C.paper}" opacity="0">` +
            `<animate attributeName="opacity" from="0" to="${0.22 - i * 0.04}" dur="0.6s" begin="${(1.0 + i * 0.14).toFixed(2)}s" fill="freeze"/></rect>`,
        )
        .join('') +
      traveler({ x: 176, y: 96, s: 0.82, color: C.paper }) +
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
      // 与头图共用同一座山脊，形成首尾呼应
      `<path d="M0 104 L52 92 L104 100 L156 86 L208 98 L262 90 L316 100 L340 96 L340 112 L0 112 Z" fill="${C.night}" opacity="0">` +
      `<animate attributeName="opacity" from="0" to="0.5" dur="1s" begin="0.35s" fill="freeze"/></path>` +
      // 地平线：与头图同一道。没有它，地面那道暖弧会显得悬在半空（上一版就是如此）
      `<path d="M0 112 H340" stroke="${C.paper}" stroke-width="1.4" opacity="0.55" stroke-dasharray="340" stroke-dashoffset="340">${drawIn(340, '0.9s', '0.35s')}</path>` +
      // 尾图路面的受光：同头图，深色底只能用描边弧。灯头 x = 274 + (−30) = 244。
      litArc({ x: 244, y: 116, w: 70, stroke: C.lamp, begin: '0.6s', opacity: 0.7 }) +
      lampPost({ x: 274, groundY: 112, topY: 34, bend: -30, stroke: C.paper, dash: 122, begin: '0.35s', dur: '1s' }) +
      lampHead({ x: 244, y: 34, s: 0.8, begin: '0.8s', halo: false }) +
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
      `<path d="M0 78 H120" stroke="${C.lamp}" stroke-width="2" stroke-dasharray="120" stroke-dashoffset="120">${drawIn(120, '0.9s', '0.85s')}</path>` +
      // 背行囊的青年（实心剪影，侧身行走）。与头图同一套部件拆法，只是尺寸压到 48px 仍可辨。
      // 要点：行囊与躯干之间留缝；腿画两段式并加粗，细三角缩小后直接消失。
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
