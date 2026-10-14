import { describe, it, expect } from 'vitest'
import {
  AUTO_KEYS,
  checkBrandDoc,
  checkHumanSections,
  findUnpairedMarkers,
  parseAutoBlocks,
  parseSections,
  renderAutoBlock,
  renderAutoSection,
  stripAutoBlocks,
  syncBrandDoc,
} from './brand-doc.js'
import type { BrandDocFacts } from './brand-doc.js'

/** 一份真实形状的品牌事实（形状取自 hippie-youth，但值全是测试自造的）。 */
function facts(over: Partial<BrandDocFacts> = {}): BrandDocFacts {
  return {
    name: 'tide-notes',
    displayName: '潮汐手记',
    description: '生活方式号，气质：温暖、治愈',
    rationale: '主色采自海边礁石的青苔绿，压低饱和度模拟油墨印刷质感',
    theme: {
      description: '潮汐主题',
      tokens: {
        primaryColor: '#1D5C4A',
        textColor: '#2A2A26',
        accentColor: '#C87F4A',
        cardBg: '#F4F1E9',
        dividerColor: '#D9D3C6',
        fontSize: '15px',
        lineHeight: 1.85,
        fontFamily: 'Georgia, serif',
      },
    },
    components: [
      { name: 'tide-quote', description: '潮汐金句卡' },
      { name: 'tide-end', description: '潮汐尾卡' },
    ],
    headerComponent: 'tide-quote',
    logo: 'assets/logo-a.png',
    learnings: [
      { date: '2026-01-02', note: '第一版：卡片太花，降低饱和度' },
      { date: '2026-01-05', note: 'h2 加左边框更好' },
    ],
    ...over,
  }
}

describe('renderAutoBlock', () => {
  it('palette 只列出真实存在的色值（不写空行）', () => {
    const block = renderAutoBlock('palette', facts())
    expect(block).toContain('| 主色 primary | `#1D5C4A` |')
    expect(block).toContain('| 强调 accent | `#C87F4A` |')
    expect(block).not.toContain('undefined')
  })

  it('typography 把数字型 lineHeight 写成正常文本（旧实现会拼出 undefined）', () => {
    const block = renderAutoBlock('typography', facts())
    expect(block).toContain('- 字号 15px / 行高 1.85')
    expect(block).not.toContain('undefined')
  })

  it('components 先写头图规范再写组件清单', () => {
    const lines = renderAutoBlock('components', facts())!.split('\n')
    expect(lines[0]).toContain('`:::tide-quote`')
    expect(lines[0]).toContain('头图规范')
    expect(lines[1]).toBe('- `:::tide-quote` —— 潮汐金句卡')
  })

  it('没有内容可写时返回 undefined（不生成空段）', () => {
    const bare = facts({
      logo: undefined,
      headerComponent: undefined,
      components: [],
      learnings: [],
      theme: { description: undefined, tokens: {} },
    })
    for (const key of AUTO_KEYS) expect(renderAutoBlock(key, bare)).toBeUndefined()
  })

  it('learnings 按 profile 顺序逐条输出', () => {
    const block = renderAutoBlock('learnings', facts())!
    expect(block.split('\n')).toEqual([
      '- 2026-01-02：第一版：卡片太花，降低饱和度',
      '- 2026-01-05：h2 加左边框更好',
    ])
  })
})

describe('syncBrandDoc', () => {
  const skeleton = [
    '# 潮汐手记 · 品牌宪法',
    '',
    '## 品牌定位',
    '',
    '生活方式号，气质：温暖、治愈',
    '',
    '## 色彩论证',
    '',
    '主色采自海边礁石的青苔绿，压低饱和度模拟油墨印刷质感',
    '',
    '## 核心色板',
    '',
    '| 用途 | 色值 |',
    '| --- | --- |',
    '| 主色 primary | `#000000` |',
    '',
    '## 迭代记录',
    '',
    '- 2026-01-01：旧记录',
    '',
  ].join('\n')

  it('把自动段插进同名小节，而不是丢到文件末尾', () => {
    const { doc } = syncBrandDoc(skeleton, facts())
    const paletteAt = doc.indexOf('<!-- stylewx:auto palette -->')
    const nextHeading = doc.indexOf('## 迭代记录')
    expect(paletteAt).toBeGreaterThan(-1)
    expect(paletteAt).toBeLessThan(nextHeading) // 在「核心色板」小节里
    expect(doc.indexOf('## 核心色板')).toBeLessThan(paletteAt)
  })

  it('段外的人写内容一字不动', () => {
    const { doc } = syncBrandDoc(skeleton, facts())
    expect(doc).toContain('# 潮汐手记 · 品牌宪法')
    expect(doc).toContain('生活方式号，气质：温暖、治愈')
    expect(doc).toContain('主色采自海边礁石的青苔绿，压低饱和度模拟油墨印刷质感')
  })

  it('重复同步是幂等的（changed 第二次为 false）', () => {
    const once = syncBrandDoc(skeleton, facts())
    const twice = syncBrandDoc(once.doc, facts())
    expect(twice.doc).toBe(once.doc)
    expect(twice.changed).toBe(false)
  })

  it('profile 变了 → 自动段跟着变，人写的段不动', () => {
    const before = syncBrandDoc(skeleton, facts()).doc
    const after = syncBrandDoc(before, facts({ theme: { description: '潮汐主题', tokens: { ...facts().theme.tokens, primaryColor: '#0B3D2E' } } })).doc
    expect(after).toContain('| 主色 primary | `#0B3D2E` |')
    expect(after).toContain('生活方式号，气质：温暖、治愈')
    expect(after).not.toContain('| 主色 primary | `#1D5C4A` |')
  })

  it('人在自动段里手改会被下一次同步覆盖回来（这正是闸门要拦的行为）', () => {
    const tampered = skeleton.replace('| 主色 primary | `#000000` |', '| 主色 primary | `#000000` |\n\n<!-- stylewx:auto palette -->\n手改的假色板\n<!-- /stylewx:auto -->')
    const { doc } = syncBrandDoc(tampered, facts())
    expect(doc).not.toContain('手改的假色板')
    expect(doc).toContain('| 主色 primary | `#1D5C4A` |')
  })

  it('没有可写内容时删掉残留的旧自动段（不留过期事实）', () => {
    const withLogo = syncBrandDoc(skeleton, facts()).doc
    const withoutLogo = syncBrandDoc(withLogo, facts({ logo: undefined })).doc
    expect(withoutLogo).not.toContain('stylewx:auto logo')
    expect(withoutLogo).not.toContain('![logo]')
  })
})

describe('checkBrandDoc', () => {
  it('同步过的文档零漂移', () => {
    const { doc } = syncBrandDoc('# t\n', facts())
    expect(checkBrandDoc(doc, facts())).toEqual([])
  })

  it('人为制造的漂移会被报出（键与期望值都对）', () => {
    const { doc } = syncBrandDoc('# t\n', facts())
    const broken = doc.replace('`#1D5C4A`', '`#FF00FF`')
    const issues = checkBrandDoc(broken, facts())
    expect(issues).toHaveLength(1)
    expect(issues[0]!.key).toBe('palette')
    expect(issues[0]!.kind).toBe('drift')
    expect(issues[0]!.expected).toContain('#1D5C4A')
    expect(issues[0]!.actual).toContain('#FF00FF')
  })

  it('整段被删掉报 missing', () => {
    const { doc } = syncBrandDoc('# t\n', facts())
    const stripped = stripAutoBlocks(doc)
    const issues = checkBrandDoc(stripped, facts())
    expect(issues.map((i) => i.key).sort()).toEqual(['components', 'learnings', 'logo', 'palette', 'typography'])
    expect(issues.every((i) => i.kind === 'missing')).toBe(true)
  })

  it('learnings 允许人在文档里补充子级细节（不判漂移，只判缺失）', () => {
    const { doc } = syncBrandDoc('# t\n', facts())
    const extended = doc.replace('- 2026-01-02：第一版：卡片太花，降低饱和度', '- 2026-01-02：第一版：卡片太花，降低饱和度\n  - 具体是把 cardBg 从 #FFEEDD 换成了 #F4F1E9')
    const issues = checkBrandDoc(extended, facts())
    expect(issues).toEqual([])
  })
})

describe('findUnpairedMarkers', () => {
  it('成对时返回空', () => {
    const { doc } = syncBrandDoc('# t\n', facts())
    expect(findUnpairedMarkers(doc)).toEqual([])
  })

  it('漏一个结束标记会被抓出来', () => {
    const broken = '<!-- stylewx:auto palette -->\n| 用途 |\n'
    expect(findUnpairedMarkers(broken)).toHaveLength(1)
    expect(findUnpairedMarkers(broken)[0]).toContain('不成对')
  })
})

describe('checkHumanSections', () => {
  it('人写段包含 profile 文本时无告警', () => {
    const { doc } = syncBrandDoc('# t\n', facts())
    expect(checkHumanSections(doc, facts())).toEqual([])
  })

  it('人写段与 profile 不一致时给警告（不是错误）', () => {
    const doc = '# t\n\n## 品牌定位\n\n另一种定位描述\n'
    const warns = checkHumanSections(doc, facts())
    expect(warns.map((w) => w.section)).toEqual(['品牌定位'])
  })

  it('人写段里补充了细节但包含 profile 文本 → 不告警', () => {
    const doc = `# t\n\n## 品牌定位\n\n生活方式号，气质：温暖、治愈。受众是 25-35 岁都市女性。\n`
    expect(checkHumanSections(doc, facts())).toEqual([])
  })
})

describe('parseSections / parseAutoBlocks / renderAutoSection', () => {
  it('按 ## 标题切段，h1 不算', () => {
    const s = parseSections('# 标题\n\n## 甲\n\n甲内容\n\n## 乙\n\n乙内容\n')
    expect([...s.keys()]).toEqual(['甲', '乙'])
    expect(s.get('甲')).toBe('甲内容')
  })

  it('renderAutoSection 带成对标记', () => {
    const s = renderAutoSection('logo', facts())!
    expect(s.startsWith('<!-- stylewx:auto logo -->')).toBe(true)
    expect(s.endsWith('<!-- /stylewx:auto -->')).toBe(true)
  })

  it('parseAutoBlocks 读出段键与内容', () => {
    const { doc } = syncBrandDoc('# t\n', facts())
    const blocks = parseAutoBlocks(doc)
    expect(blocks.map((b) => b.key)).toEqual(['palette', 'typography', 'components', 'logo', 'learnings'])
    expect(blocks[0]!.body).toContain('#1D5C4A')
  })
})
