/**
 * 对比实验 · 排版设计数据（agent 设计，脚本只负责渲染与测量）
 *
 * 组1 基线    ：analyze_article 推荐的预置主题 + 原始 markdown（典型「现状」用法）
 * 组2 三方向门：每篇文章 3 个不同温度的 agent 直出主题
 * 组3 品牌记忆：品牌档案（墨账 ink-ledger）+ 品牌专属组件 + 语气规则
 * 组4 品牌迭代：brand_learn 反馈后，主题 v2 + 更精细的组件编排（vite 文章）
 */

const Q = (s) => s // 仅标记字符串方便阅读

export const DESIGN = {
  articles: {
    vite: 'articles/test-vite-perf.md',
    noodle: 'articles/test-midnight-noodle.md',
    coffee: 'articles/test-coffee-costing.md',
  },

  baseline: {
    vite: 'tech-minimal',
    noodle: 'magazine',
    coffee: 'business',
  },

  // 组2：需要 canvas 包裹全文的主题（暗色整页底色必须配合 canvas 组件才生效）
  canvasWrap: {
    noodle: ['C'],
  },

  directions: {
    vite: {
      label: '技术评测《Vite 项目越跑越慢》',
      chosen: 'B',
      reason:
        'C 太野（纯黑白粗野主义对商业技术文受众过激），A 与预置 tech-minimal 差异太小；B 的深松绿+衬线标题在技术号里罕见但不冒犯，区分度最高。',
      variants: {
        A: {
          name: 'vite-A-steel',
          description: '安稳：钢蓝灰科技极简，安全的行业文气质',
          tokens: {
            primaryColor: '#2B4A6F', textColor: '#2A2E33', fontSize: '15px', lineHeight: 1.8,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
            spacing: { block: '18px' }, cardBg: '#F4F7FA', dividerColor: '#DCE3EA', radius: '8px',
          },
          blocks: {
            h1: { 'font-size': '30px', color: '{{primaryColor}}', 'font-weight': '700', 'line-height': '1.35' },
            h2: { 'font-size': '22px', color: '{{primaryColor}}', 'font-weight': '700', 'border-left': '4px solid {{primaryColor}}', 'padding-left': '10px' },
            blockquote: { 'border-left': '4px solid {{primaryColor}}', 'background-color': '{{cardBg}}', color: '#4A5560', padding: '12px 16px', 'border-radius': '4px' },
          },
        },
        B: {
          name: 'vite-B-editorial',
          description: '反差：深松绿衬线编辑风，技术号里的「杂志感」',
          tokens: {
            primaryColor: '#0F4C3A', textColor: '#26312B', fontSize: '15px', lineHeight: 1.85,
            fontFamily: "Georgia, 'Times New Roman', 'Songti SC', 'SimSun', serif",
            spacing: { block: '20px' }, cardBg: '#F3F0E8', canvasBg: '#FAF7F0', dividerColor: '#DAD3C2', radius: '4px',
          },
          blocks: {
            h1: { 'font-size': '32px', color: '{{primaryColor}}', 'font-weight': '700', 'line-height': '1.3', 'letter-spacing': '0.02em' },
            h2: { 'font-size': '24px', color: '{{primaryColor}}', 'font-weight': '700', 'border-bottom': '2px solid {{primaryColor}}', 'padding-bottom': '6px' },
            blockquote: { 'border-left': '3px solid {{primaryColor}}', 'background-color': '{{cardBg}}', color: '#3E4A42', padding: '14px 18px', 'font-style': 'italic', 'border-radius': '0' },
            strong: { color: '{{primaryColor}}', 'font-weight': '700' },
          },
        },
        C: {
          name: 'vite-C-brutal',
          description: '大胆：纯黑白粗野主义 + 信号橙，媒体级强反差',
          tokens: {
            primaryColor: '#0A0A0A', textColor: '#1A1A1A', fontSize: '15px', lineHeight: 1.75,
            fontFamily: "-apple-system, 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif",
            spacing: { block: '20px' }, accentColor: '#FF433D', cardBg: '#F2F2F2', dividerColor: '#0A0A0A', radius: '0px',
          },
          blocks: {
            h1: { 'font-size': '36px', color: '{{primaryColor}}', 'font-weight': '800', 'line-height': '1.2', 'letter-spacing': '-0.01em' },
            h2: { 'font-size': '25px', color: '{{primaryColor}}', 'font-weight': '800', 'border-top': '3px solid {{primaryColor}}', 'padding-top': '12px' },
            blockquote: { 'border-left': '6px solid {{accentColor}}', 'background-color': '{{cardBg}}', color: '#1A1A1A', padding: '12px 16px', 'font-weight': '700', 'border-radius': '0' },
            hr: { border: 'none', 'border-top': '3px solid {{primaryColor}}', margin: '24px 0' },
          },
        },
      },
    },

    noodle: {
      label: '生活随笔《深夜厨房：一碗葱油拌面》',
      chosen: 'C',
      reason:
        '深夜主题天然适合暗场：C 的深夜蓝黑 + 灯光橙直接呼应「深夜厨房只开一半的灯」的意象，形式从内容里长出来；A 是通用暖棕模板，B 清雅但和「深夜」的情绪方向相反。',
      variants: {
        A: {
          name: 'noodle-A-warm',
          description: '安稳：暖棕衬线杂志风，通用的生活随笔气质',
          tokens: {
            primaryColor: '#8C5A3B', textColor: '#3A322C', fontSize: '15px', lineHeight: 1.9,
            fontFamily: "Georgia, 'Songti SC', 'SimSun', serif",
            spacing: { block: '20px' }, cardBg: '#F7F1EA', dividerColor: '#E4D8CA', radius: '8px',
          },
          blocks: {
            h1: { 'font-size': '30px', color: '{{primaryColor}}', 'font-weight': '700' },
            h2: { 'font-size': '23px', color: '{{primaryColor}}', 'font-weight': '700' },
            blockquote: { 'border-left': '4px solid {{primaryColor}}', 'background-color': '{{cardBg}}', color: '#6B5748', padding: '12px 16px', 'font-style': 'italic' },
          },
        },
        B: {
          name: 'noodle-B-ink',
          description: '反差：宣纸底 + 水墨青灰，安静素雅',
          tokens: {
            primaryColor: '#42566B', textColor: '#33393E', fontSize: '15px', lineHeight: 2.0,
            fontFamily: "'Songti SC', 'SimSun', Georgia, serif",
            spacing: { block: '22px' }, cardBg: '#F6F6F3', canvasBg: '#FBFBF8', dividerColor: '#DEDED6', radius: '2px',
          },
          blocks: {
            h1: { 'font-size': '28px', color: '{{primaryColor}}', 'font-weight': '600', 'letter-spacing': '0.06em' },
            h2: { 'font-size': '21px', color: '{{primaryColor}}', 'font-weight': '600', 'letter-spacing': '0.04em' },
            blockquote: { 'border-left': '2px solid {{primaryColor}}', color: '#5A6672', padding: '10px 14px', 'font-style': 'italic' },
          },
        },
        C: {
          name: 'noodle-C-midnight',
          description: '大胆：深夜蓝黑底 + 灯光橙，暗场里的厨房',
          tokens: {
            primaryColor: '#E8A65D', textColor: '#E8E4DA', fontSize: '15px', lineHeight: 1.9,
            fontFamily: "Georgia, 'Songti SC', 'SimSun', serif",
            spacing: { block: '20px' }, accentColor: '#E8A65D', cardBg: '#2A3140', canvasBg: '#1E2430', dividerColor: '#3C4454', radius: '10px',
            mutedColor: '#A8A296',
          },
          blocks: {
            h1: { 'font-size': '31px', color: '{{primaryColor}}', 'font-weight': '700', 'line-height': '1.4' },
            h2: { 'font-size': '23px', color: '{{primaryColor}}', 'font-weight': '700', 'border-bottom': '1px solid {{dividerColor}}', 'padding-bottom': '8px' },
            blockquote: { 'border-left': '3px solid {{primaryColor}}', 'background-color': '{{cardBg}}', color: '#D8D2C4', padding: '14px 18px', 'font-style': 'italic', 'border-radius': '6px' },
            strong: { color: '{{primaryColor}}', 'font-weight': '700' },
            a: { color: '{{primaryColor}}', 'text-decoration': 'none' },
          },
        },
      },
    },
  },

  // 组3：品牌组件编排后的 coffee 文章
  brandMarkdown(coffee) {
    const costTable = [
      ':::ink-stat',
      '牛奶 | 4.2元 | 15%',
      '咖啡豆（18g） | 5.1元 | 18%',
      '杯子吸管 | 1.3元 | 5%',
      '房租水电摊销 | 6.8元 | 24%',
      '人力摊销 | 7.4元 | 26%',
      '平台抽成与损耗 | 1.7元 | 6%',
      ':::',
    ].join('\n')
    const fixedCost = [
      ':::ink-stat',
      '房租 | 380元/天',
      '两个全职咖啡师日薪合计 | 440元/天',
      '水电杂费 | 60元/天',
      ':::',
    ].join('\n')
    const upside = [
      '## 三个被低估的赚钱方向',
      '',
      ':::ink-stat',
      '上午 10 点到下午 2 点的空档 | 卖烘焙和办公位订阅',
      '燕麦奶升级、浓缩加量 | 客单价 +3 元，毛利几乎全涨',
      '储值卡锁定未来 30 次客流 | 固定成本的分摊基数做大',
      ':::',
    ].join('\n')

    return coffee
      .replace(/\| 项目 \| 成本 \| 占比 \|[\s\S]*?(?=\n\n毛利只剩)/, costTable)
      .replace('> 咖啡馆的第一杯咖啡不是卖给客人的，是卖给房东的。', ':::ink-quote\n咖啡馆的第一杯咖啡不是卖给客人的，是卖给房东的。\n:::')
      .replace(/- 房租：每天 380 元，开门就计费\n- 两个全职咖啡师的日薪合计：440 元\n- 水电杂费：日均 60 元/, fixedCost)
      .replace(/## 三个被低估的赚钱方向[\s\S]*?(?=\n\n## 结论)/, upside)
      .replace('咖啡馆是一门用浪漫包装的零售生意。情怀负责让客人走进来，账本负责让你能开到第二年。两者不冲突——冲突的是只拿着情怀不记账的你。', '咖啡馆是一门用浪漫包装的零售生意。\n\n:::ink-quote\n情怀负责让客人走进来，账本负责让你能开到第二年。\n:::\n\n两者不冲突——冲突的是只拿着情怀不记账的你。')
  },

  // 组4：品牌迭代后的 vite 文章
  viteMarkdownV2(vite) {
    const debugTools = [
      ':::ink-stat',
      'vite dev --debug | 看预构建耗时分布',
      'node --prof + --prof-process | 看热函数',
      'du -sh node_modules/.vite | 盯预构建产物体积',
      ':::',
    ].join('\n')
    return vite
      .replace('> 便利性是有账单的，只是它被延迟到了启动时刻。', ':::ink-quote\n便利性是有账单的，只是它被延迟到了启动时刻。\n:::')
      .replace(/- `vite dev --debug` 看预构建耗时分布\n- `node --prof` 配合 `--prof-process` 看热函数\n- `du -sh node_modules\/.vite` 盯住预构建产物的体积变化/, debugTools)
      .replace('工具没有银弹，但有账本。每一次「方便」都有人买单，只是买单的时机不同——Vite 把账单提前到了启动时刻，而你可以在写代码的时候就把它省下来。', ':::ink-quote\n每一次「方便」都有人买单，只是买单的时机不同。\n:::')
  },

  brand: {
    name: 'ink-ledger',
    displayName: '墨账',
    description: '商业与技术评论号「墨账」：用账本思维拆解工具与生意。气质：克制、理性、纸感。受众为一线工程师与独立创业者。',
    rationale:
      '主色采自钢笔墨蓝（老式账本手写墨水），压低饱和度至油墨质感而非屏幕蓝——刻意避开模型偏爱的默认科技蓝 #0066FF；' +
      'cardBg 取牛皮纸账本封面的纸色 #F5F0E6，整体模拟「纸面账本」的文化语境：冷静、可信赖、有翻阅感。',
    theme: {
      name: 'ink-ledger',
      description: '墨账品牌主题：钢笔墨蓝 + 牛皮纸底，衬线标题的账本气质',
      tokens: {
        primaryColor: '#1F3A5F', textColor: '#2B2B28', fontSize: '15px', lineHeight: 1.85,
        fontFamily: "Georgia, 'Times New Roman', 'Songti SC', serif",
        spacing: { block: '20px' },
        accentColor: '#B0713A', cardBg: '#F5F0E6', cardBorderColor: '#E2D9C6',
        canvasBg: '#FAF6ED', dividerColor: '#D8CFBF', radius: '6px',
        mutedColor: '#6E6A60',
      },
      blocks: {
        h1: { 'font-size': '32px', color: '{{primaryColor}}', 'font-weight': '700', 'line-height': '1.32', 'letter-spacing': '0.01em' },
        h2: { 'font-size': '24px', color: '{{primaryColor}}', 'font-weight': '700', 'border-left': '5px solid {{accentColor}}', 'padding-left': '12px', 'line-height': '1.4' },
        h3: { 'font-size': '19px', color: '{{primaryColor}}', 'font-weight': '700' },
        blockquote: { 'border-left': '3px solid {{accentColor}}', 'background-color': '{{cardBg}}', color: '#5A544A', padding: '13px 17px', 'font-style': 'italic', 'border-radius': '4px' },
        strong: { color: '{{primaryColor}}', 'font-weight': '700' },
        hr: { border: 'none', 'border-top': '1px solid {{dividerColor}}', margin: '26px 0' },
      },
    },
    components: [
      {
        name: 'ink-quote',
        description: '墨账金句卡：纸底 + 墨蓝大引号 + 赭石细线，用于节末金句收尾',
        template:
          '<section style="margin:22px 0"><div style="background:{{theme.cardBg}};border-left:3px solid {{theme.primary}};border-radius:{{theme.radius}};padding:16px 18px 14px">' +
          '<div style="font-family:Georgia,serif;font-size:30px;line-height:1;color:{{theme.primary}};height:14px">“</div>' +
          '<div style="margin:4px 0 0;font-size:15.5px;line-height:1.8;color:{{theme.text}};font-weight:bold">{{body}}</div>' +
          '<div style="margin-top:8px;border-top:1px solid {{theme.divider}};padding-top:6px;font-size:12px;color:{{theme.muted}}">—— 墨账</div>' +
          '</div></section>',
        defaults: {},
        slots: [],
      },
      {
        name: 'ink-stat',
        description: '墨账数据条：按正文行「名称 | 数值」渲染的账本行',
        template:
          '<section style="margin:18px 0;border:1px solid {{theme.divider}};border-radius:{{theme.radius}};overflow:hidden">' +
          '{{#each body}}<div style="display:flex;justify-content:space-between;align-items:baseline;padding:9px 14px;{{#if @last}}{{else}}border-bottom:1px dashed {{theme.divider}}{{/if}}">' +
          '<span style="font-size:14px;color:{{theme.text}}">{{this.0}}</span>' +
          '<span style="font-size:15px;font-weight:bold;color:{{theme.primary}};font-family:Georgia,serif">{{this.1}}</span>' +
          '</div>{{/each}}' +
          '</section>',
        defaults: {},
        slots: [],
      },
    ],
    voice: [
      '每节末尾用 :::ink-quote 金句收尾（每篇 2-3 个，不要每节都放）',
      '数据一律用 :::ink-stat 数据条呈现，不要用 Markdown 表格',
      '语气克制：不用感叹号，少用形容词，让数字说话',
    ],
    taboos: [
      '不要荧光色与高饱和撞色',
      '不要目录（文章不长，目录显得啰嗦）',
      '正文不要居中',
      '不要「点击蓝字关注」式的讨要关注话术',
    ],
    learnNote:
      '读者反馈：h2 左边框的赭石色在手机上偏弱，层级感不足；数据条很好但要加大数字字号；' +
      '金句卡每篇 2-3 个正合适；下一篇把 h1/h2 层级再拉开一点。',
    v2Patch: {
      tokens: {},
      blocks: {
        h1: { 'font-size': '34px', 'line-height': '1.28' },
        h2: { 'font-size': '25px', 'border-left-width': '7px', 'padding-left': '14px' },
      },
    },
  },
}
