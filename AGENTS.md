# AGENTS.md

给接手这个仓库的 AI Agent（以及人）的说明。**只放每轮都该知道的东西**：
铁律、发布闸门、命令、以及「想改 X 就先读 Y」的索引。

完整设计决策与踩坑全量在 [`docs/DESIGN.md`](./docs/DESIGN.md)；用法在 [`README.md`](./README.md)；
富组件语法在 [`docs/COMPONENTS.md`](./docs/COMPONENTS.md)。

> **约定**：踩坑按「症状 → 原因 → 防线」记在 DESIGN.md，本文件只留**一句话规则 + 章节号**。
> 新增教训时先问：这条是否每轮都要在上下文里？不是就别写进来。

## 1. 这个仓库是什么

公众号排版服务：**无头排版内核** + MCP Server + REST API + 本地 Web 编辑器。
pnpm workspace monorepo，9 个可发布包，`.changeset/config.json` 里配了
`fixed: [["@stylewx/*"]]` —— **任一包升版会带着其余 8 个一起升**。

```
packages/{core,theme,validator,components,publisher,preview,service}
apps/{mcp-server,api}
```

## 2. 铁律

**① 品牌色不进 390px 画布。** 编辑器外壳有一套独立于文章主题的品牌层（六令牌）；
画布每处颜色都由当前文章主题决定。改配色后必须跑 `pnpm brand:check`。详见 §21。

**② 版本号只在 `package.json` 一处。** 源码里不写版本常量（`SERVER_VERSION` 硬编码
`'0.1.0'` 连发三个版本没人发现，§22.1）。「能点数的事实」（几个工具、几套主题）
不要写死在文案里，或至少让测试守住。

**③ `core` / `theme` / `validator` 不碰 DOM 与 Node。** 不 import
`window`/`document`/`navigator`，也不 import `node:fs`/`node:path`/`process`；
微信网络调用只出现在 `publisher`。破坏这条包就无法在浏览器侧复用。

**④ 发布产物必须能被真实消费。** `pnpm test` 全绿 ≠ 发出去的包能用 —— 单测跑 TS 源码 +
in-memory 传输，用户装的是 tarball 里的 `dist/`。发布前按 §3.2 装产物真跑一遍。
同源教训：判断某 HTML 结构能不能用，必须走完 **`draft/add` → `draft/get` → 真浏览器渲染**
三步 —— 只做前两步会误判（§20.10，`mpvideo` 存活但渲染成 0×0）。

**⑤ 验证必须发生在不可逆动作之前。** §22.1 是发完 0.4.0 才去验证已发布产物发现的，
只能补发 0.4.1。tag 一推就触发发布，**推之前必须确认 `pnpm check:release -- --tag v<版本>`**。

**⑥ 给人看的稿子走浏览器通道，不用 `cgi-bin/draft/add`。** 判据是 `draft/get` 里
`leaf=` 的计数：0 = 后台没认领、人改不了；>0 = 可编辑。**正文嵌视频同理**——
上传可用 API，插入必须走浏览器。详见 §20.7 / §20.10。

**⑦ 写一行 import 就补一行 declare。** 靠传递依赖在 monorepo 里能跑通、在产物里必断
（§22.6）。拿不准看 `check:artifact` —— 它就是为这类「装上产物才暴露」的问题存在的。

**⑧ 草稿箱里「不是我创建的」条目，一律不删。** 一次排版会在草稿箱留下同名多份（人的初版 +
每次重排各一份），**这是正常的**，由人来决定去留。删任何草稿前先问人 —— 尤其「不是我创建的」那份
= 人的原文底稿，往往是唯一副本。曾按一条旧规矩把三篇初版当重复项清掉，只能靠删除前抓的快照回灌
（真因与防线见 §27）。防线：**动稿前先把原稿 HTML 落盘**（`articles/hippie/originals/`），
回灌脚本 `assets-src/restore-originals.mjs`（只新建、不删除）。

**⑨ 解析渲染产物的 HTML 时，永远假设属性值里有 `>`。** `escapeAttr` 刻意不转义
`>`（带引号的属性值里它合法），所以 `data-swx-src` 等属性里会出现裸 `-->`。
用 `new RegExp` 字符串拼正则去匹配这类标签，`[^>]*>` 会被提前截断 —— 要么用正则字面量、
要么用 `(?:"[^"]*"|[^>"])*` 风格整段吞带引号属性（§24，真实微信报错才暴露）。

## 3. 发布

常规通道是 Changesets：开发时 `pnpm changeset` 记录变更并提交进 PR，合到 main 后
workflow 自动判定 version / publish / 什么都不做。**合并 Release PR 即完成发布**，
不要再手动打 tag。细节（版本判定表、`changeset version` 会删掉 `.changeset/*.md`、
OIDC Trusted Publishing 登记方式、provenance、npm 异步延迟的回查办法）见 §3 相关章节。

```bash
pnpm build && pnpm type-check && pnpm test
pnpm brand:check      # 品牌回归：令牌漂移 / 按钮层级 / 21 项对比度
pnpm check:release    # 9 个包版本一致 + 元数据齐全
pnpm check:pack       # 真打 tarball 拆开看：关键文件在不在、有没有漏 .env
pnpm check:artifact   # 装产物真跑：握手版本、工具清单、编辑器自包含
```

这就是 `pnpm release` 的内容（再加上真正的 publish）。

## 4. 想改什么，先读哪里

| 想改什么 | 先读 |
|---|---|
| 编辑器界面 / 颜色 / 按钮层级 | §21 + `pnpm brand:check` |
| 微信兼容规则（白名单） | §6；常量在 `packages/theme/src/css-whitelist.ts` |
| 富组件 | `docs/COMPONENTS.md`；目录单一来源 `packages/components/src/catalog.ts` |
| MCP 工具 | `README.md`「MCP 工具」+ `apps/mcp-server/src/tools.ts` |
| 文章主题 | `packages/theme/src/presets.ts`（原创 6 套）、`wemd-presets.ts`（移植 20 套） |
| 品牌动效资产（头图/尾图/logo） | `assets-src/gen-motion.mjs` + §22.8；产物在 `docs/assets/brand-motion/` |
| 发布通道 / 浏览器自动化 | §20（含可编辑性判据、cua-driver vs kimi-webbridge、安全纪律） |
| 正文嵌入视频 | §20.10（存活≠能播；上传走 API、插入走浏览器，脚本 `--video`） |
| Mermaid 图 | §24；组件 `packages/components/src/components/mermaid.ts`、出图 `packages/preview/src/mermaid.ts`；探针 `probe-mermaid-wechat.mjs` |
| 编辑器另存为 / 写入白名单 | §25；闸门 `writeRoots()`（save-article.ts），环境变量 `STYLEWX_WRITE_ROOTS` |
| 踩过的坑（全量） | §22 |
| 音乐组件（自动插入） | §26；组件 `packages/components/src/components/music.ts`，实测见 docs/DESIGN.md §26 |
| 平台内建组件该不该做 | §28（判据：数据在不在自己身上）；探针 `probe-wechat-toolbar.mjs` / `probe-wechat-widget-survival.mjs` |
| 推荐搜索（:::search） | §29（三个坑：昵称现取 / 关键词 16 单位 / 预替换）；组件 `music.ts` 同级的 `search.ts` |
| 草稿箱里人的初版 | §27（**不许删**）；快照回灌 `assets-src/restore-originals.mjs` |
| 发布流程细节 | §3 + `.github/workflows/release.yml` |

## 5. 常用命令

```bash
# 开发
pnpm build && pnpm type-check && pnpm test
pnpm stylewx:editor                     # 本地编辑器 http://localhost:3777/editor

# 品牌体系
pnpm brand:check                        # 回归：令牌 / 柔影签名 / 按钮层级 / 21 项对比度
pnpm brand:assets                       # 重生成 logo 与 banner（SVG 源 → PNG 2x）

# 编辑器视觉回归（不进 CI，需 3777 在跑）
node packages/preview/scripts/ui-shots.mjs .ui-shots/after   # 19 个面各拍一张，改前改后逐面比

# 发布（CI 里由 pnpm release 调用）
pnpm check:release && pnpm check:pack && pnpm check:artifact
node scripts/ci/verify-release.mjs --check-registry   # 发布后回查，仅 CI 跑一次
```

**不参与 CI 的手动验证脚本**（改相关模块时按需跑）见 §23 表。

## 6. 文档分工

- **README.md** — 面向使用者：功能、安装、接入方式、MCP 工具清单
- **docs/DESIGN.md** — 面向维护者：设计决策、约束、实测结论、踩坑全量
- **docs/COMPONENTS.md** — 富组件语法与清单
- **AGENTS.md**（本文件）— 面向 AI Agent：铁律、发布闸门、命令、索引

写文档的约定：**说清楚"为什么"和"代价"**，不要只写"是什么"。本项目大量决策是权衡的结果
（例如取消全部投影的代价是发丝线不能调浅），只记结论会让后来者在不了解代价时把它改坏。

## 24. Mermaid 图

工具栏「Mermaid 图」下拉插入 `:::mermaid` 源码块（十种图型模板）。渲染链路：
组件只出占位符 → service 在校验前调 `inlineMermaidDiagrams`（Chromium 跑官方 mermaid 出 PNG →
本地资产库 → `<img>`）→ 发布时 relocate 搬素材库。**为什么是图片不是 SVG**：
微信剥 id，SVG 的 url(#) 引用到读者端必裂。实测细节与三个踩坑见 docs/DESIGN.md §24；
验证：`node apps/mcp-server/scripts/probe-mermaid-wechat.mjs`（真实 draft/add，写 [probe] 草稿）。

## 26. 音乐组件（:::music）

与 `video` **相反**：音乐能全自动插入，没有 `--music` flag——脚本见到 `data-swx-music`
占位块就处理。两条路径：`source`（从旧草稿抄来的 `<mp-common-clmusic>` 标签，**首选**）
→ 直接复刻；只有 `clue`（歌手+歌名）→ 走「音频 → 音乐」弹窗搜索点选。
组件在 `packages/components/src/components/music.ts`，实测与三个踩坑见 docs/DESIGN.md §26；
探针 `apps/mcp-server/scripts/probe-wechat-music.mjs`（`--stage picker|inject|survive|search`）。

给旧稿补音乐：从 `draft/get` 原样复制那个标签写进 `source` 即可，属性在、播放器就在。

## 27. 草稿箱纪律（人的初版不能删）

**一次排版会在草稿箱留下同名多份**，这是正常的，不是要清理的垃圾：

| 条目 | 谁创建的 | 处置 |
| --- | --- | --- |
| 人的最初版本 | 人 | **绝不能删**（往往是唯一副本） |
| 每次重排各一份 | agent | 由人决定去留，agent 不主动删 |

2026-10-12 的教训：按 brand.md 里一条旧规矩「同名草稿只留最新一份」，
把三篇的初版当重复项删了。只能靠**删除前抓的快照**回灌恢复
（`articles/hippie/originals/` + `assets-src/restore-originals.mjs`，该脚本只新建、不删除）。

两条防线：

1. **动稿前先把原稿 HTML 落盘**（`draft/get` 的 `content` 原样存，跟封面图一起）。
   有快照，任何误删都可回灌；没快照，人的字就没了。
2. **回灌必须走浏览器通道**，不用 `cgi-bin/draft/add`（后者 `leaf=0`，人改不了，见 §2 铁律⑥）。

brand.md 里那条旧规矩已删除，不要重建。

## 28. 平台内建组件（哪些该做、哪些不该做）

微信编辑器自带 17 个插入项。**能否自动化只看一件事：数据在不在自己身上**——落地的是不是
自包含的 `<mp-common-*>`（属性里带全数据）→ 能；要先按名称查平台实体 → 不能。详见 docs/DESIGN.md §27。

- ✅ 已纳入：`:::music`（自包含，自动插入）、封面/正文图（走素材库搬运）
- ✅ 已纳入：`:::search` 推荐搜索（`<mp-common-search>` 已验证存活；昵称/头像发布时现取）—— 见 §29
- ❌ 不做：账号名片 / 超链接 / 小程序 / 投票 / 问答 / 礼物 / 地理位置 / 视频号 / 收入变现

**核心判据不是「能不能做到」，是「谁该拥有这个组件的配置」**：标签是渲染指令 → 属于 Markdown
源，能给 agent；要求平台对象引用（id / appid / POI / 商品）→ 属于平台运行时，塞进 Markdown
只会让 agent 生成幻觉引用。

**别把平台组件当功能列表抄过来** —— 抄过来的是耦合，不是能力。新增前先跑
`node apps/mcp-server/scripts/probe-wechat-toolbar.mjs` 拿事实清单，再对判据表。

## 29. 推荐搜索（:::search）

与音乐同族（数据自包含），发布时自动插入，无 flag。三个必须知道的点：

1. **昵称/头像发布时调 API 现取**（`getaccountbasicinfo`），不写进 Markdown ——
   昵称不一致就是导流到别人的号；`qlogo.cn` 头像直链会随换头像失效。写朴素名即可（微信自己规范化）。
2. **关键词限 16 单位、全角算 2**（汉字最多 8 个 / 英文 16 个），不是提示文案说的「16 个字符」。
   超限时保存被拦、错误只以浮层出现、URL 无 appmsgid —— 会误判成「保存坏了」。
   防线：渲染期 error 诊断 + 发布闸门 + 保存后读不到 appmsgid 直接 fail。
3. **必须「注入前预替换」**，不能「注入后再插」—— 占位块后面紧邻含 `<svg>` 的尾图，
   所有 `execCommand` 二次插入都会把块塞进 svg 内部（六种策略全中）。

组件 `packages/components/src/components/search.ts`；实测与三个踩坑见 docs/DESIGN.md §28；
探针 `probe-wechat-search-widget.mjs` / `probe-search-position.mjs` / `probe-search-presubstitute.mjs` /
`probe-search-keyword-limit.mjs`。
