/**
 * 文章内容分析（确定性启发式，无需 LLM）：
 * 推断内容类型、情绪基调、建议主题方向、估算阅读时长。
 * 该结论同时作为 generate_theme 的输入。
 */
import { countWords, estimateReadingMinutes } from '@mp-style/core'

export type ContentType =
  | 'tech'
  | 'business'
  | 'literary'
  | 'government'
  | 'academic'
  | 'general'

const TYPE_DEFS: Record<ContentType, { label: string; keywords: string[]; themeName: string; themeReason: string }> = {
  tech: {
    label: '技术 / 工程',
    keywords: [
      '代码', '函数', '开发', '接口', '部署', '前端', '后端', '数据库', '算法',
      '编程', 'docker', 'api', 'git', 'rendered', 'variable', 'function', 'framework',
      '性能', '优化', '架构', '微服务', 'serverless',
    ],
    themeName: 'tech-minimal',
    themeReason: '技术内容适合冷峻清晰、留白充分的科技极简风。',
  },
  business: {
    label: '商业 / 财经',
    keywords: [
      '营收', '增长', '市场', '投资', '估值', '融资', '财报', '战略', '品牌',
      '客户', '商业', '行业', '公司', '产品', '利润', '收入', '营销', '招聘',
    ],
    themeName: 'business',
    themeReason: '商业财经适合稳重藏蓝 + 金色点缀的商务风。',
  },
  literary: {
    label: '文艺 / 生活',
    keywords: [
      '散文', '生活', '感悟', '旅行', '回忆', '情绪', '诗歌', '阅读', '人生',
      '月光', '黄昏', '孤独', '温暖', '岁', '字', '篇',
    ],
    themeName: 'magazine',
    themeReason: '文艺人文适合暖棕衬线、宽松行距的杂志风。',
  },
  government: {
    label: '政务 / 官方',
    keywords: [
      '政务', '党建', '党员', '党委', '通知', '政策', '文件', '会议', '落实',
      '精神', '人民', '服务', '基层', '政府', '法规', '条例', '号召',
    ],
    themeName: 'gov-red',
    themeReason: '政务发布适合庄重中国红的官方风。',
  },
  academic: {
    label: '学术 / 研究',
    keywords: [
      '研究', '论文', '文献', '实验', '数据', '假设', '结论', '综述', '方法论',
      '学位', '期刊', '引用', '样本', '分析', '验证',
    ],
    themeName: 'academic',
    themeReason: '学术内容适合中性克制、高可读的学术风。',
  },
  general: {
    label: '通用',
    keywords: [],
    themeName: 'tech-minimal',
    themeReason: '未能明确归类，推荐通用的科技极简风。',
  },
}

export interface AnalyzeResult {
  content: {
    type: ContentType
    typeLabel: string
    tone: string
    readingMinutes: number
    wordCount: number
  }
  suggestedTheme: {
    name: string
    description: string
    reason: string
  }
  analysisText: string
}

function detectTone(markdown: string): string {
  const text = markdown.toLowerCase()
  const positive = ['恭喜', '突破', '成功', '增长', '创新', '利好', '高效', '欣喜', '感动', '温暖']
  const negative = ['风险', '失败', '危机', '下跌', '亏损', '担忧', '警示', '压力', '争议']
  const po = positive.filter((k) => text.includes(k)).length
  const ne = negative.filter((k) => text.includes(k)).length
  if (po > ne) return '积极 / 建设性'
  if (ne > po) return '严肃 / 审慎'
  return '中性 / 客观'
}

export function analyzeArticle(markdown: string): AnalyzeResult {
  const text = markdown.toLowerCase()
  const wordCount = countWords(markdown)
  const readingMinutes = estimateReadingMinutes(markdown)

  let best: ContentType = 'general'
  let bestScore = 0
  for (const [type, def] of Object.entries(TYPE_DEFS) as Array<[ContentType, typeof TYPE_DEFS.general]>) {
    if (type === 'general') continue
    const score = def.keywords.filter((k) => text.includes(k)).length
    if (score > bestScore) {
      bestScore = score
      best = type
    }
  }

  const def = TYPE_DEFS[best]
  const tone = detectTone(markdown)

  const analysisText =
    `内容类型：${def.label}；情绪基调：${tone}；` +
    `字数约 ${wordCount}，预计阅读 ${readingMinutes} 分钟；` +
    `建议主题：${def.themeName}（${def.themeReason}）`

  return {
    content: {
      type: best,
      typeLabel: def.label,
      tone,
      readingMinutes,
      wordCount,
    },
    suggestedTheme: {
      name: def.themeName,
      description: def.themeReason,
      reason: def.themeReason,
    },
    analysisText,
  }
}
