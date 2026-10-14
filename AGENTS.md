# AGENTS.md

给接手这个仓库的 AI Agent（以及人）的说明。**只放每轮都该知道的东西**：铁律、发布闸门、
命令、以及「想改 X 就先读 Y」的索引。

- [`README.md`](./README.md) — 面向使用者：功能 / 安装 / 接入 / MCP 工具清单
- [`docs/DESIGN.md`](./docs/DESIGN.md) — 设计说明**索引**；正文按主题拆在 [`docs/design/`](./docs/design/)（**踩坑全量**在 `pitfalls.md`）
- [`docs/COMPONENTS.md`](./docs/COMPONENTS.md) — 富组件语法与清单

> **约定**：踩坑按「症状 → 原因 → 防线」记在 `docs/design/`，本文件只留**一句话规则 + 章节号**。
> `§N` 是拆文件也没变的**全局 id**（源码注释与工具文案也在引它），照写不改，用 `rg '^## 20\.' docs/` 定位。
> 新增内容前先问：这条是否每轮都要在上下文里？不是就别写进来。
> 写文档要说清「为什么」和「代价」——本项目大量结论是权衡的结果，只记结论会让后来者把代价改坏。

## 1. 这个仓库是什么

公众号排版服务：**无头排版内核** + MCP Server + REST API + 本地 Web 编辑器。
pnpm workspace monorepo，9 个可发布包（`packages/{core,theme,validator,components,publisher,preview,service}`
+ `apps/{mcp-server,api}`），`.changeset/config.json` 配了 `fixed: [["@stylewx/*"]]` ——
**任一包升版会带着其余 8 个一起升**。

## 2. 铁律

**① 品牌色不进 390px 画布。** 编辑器外壳的品牌层（六令牌，只做状态）与文章主题是两套；
画布每处颜色都由当前主题决定。改配色后跑 `pnpm brand:check`。→ §21

**② 版本号只在 `package.json` 一处。** 源码里不写版本常量；「能点数的事实」（几个工具、
几套主题）也不要写死在文案里，或至少让测试守住。→ §22.1

**③ `core` / `theme` / `validator` 不碰 DOM 与 Node。** 不 import `window`/`document`/`navigator`，
也不 import `node:fs`/`node:path`/`process`；微信网络调用只出现在 `publisher`。
破坏这条包就无法在浏览器侧复用。→ §2

**④ 发布产物必须能被真实消费。** `pnpm test` 全绿 ≠ 包能用 —— 单测跑 TS 源码 + in-memory 传输，
用户装的是 tarball 里的 `dist/`。发布前跑 `pnpm check:artifact`。
同源教训：判断某 HTML 结构能不能用，必须走完 **`draft/add` → `draft/get` → 真浏览器渲染** 三步。→ §20.10

**⑤ 验证必须发生在不可逆动作之前。** tag 一推就触发发布，**推之前先确认
`pnpm check:release -- --tag v<版本>`**。→ §22.1

**⑥ 给人看的稿子走浏览器通道，不用 `cgi-bin/draft/add`。** 判据是 `draft/get` 里 `leaf=` 的计数：
0 = 后台没认领、人改不了；>0 = 可编辑。**正文嵌视频同理** —— 上传可用 API，插入必须走浏览器。→ §20.7 / §20.10

**⑦ 写一行 import 就补一行 declare。** 靠传递依赖在 monorepo 里能跑通、在产物里必断。
拿不准看 `check:artifact`。→ §22.6

**⑧ 草稿箱里「不是我创建的」条目，一律不删。** 一次排版留下同名多份是正常的；
动稿前先把原稿 HTML 落盘，回灌只走浏览器通道（`assets-src/restore-originals.mjs`，只新建不删除）。→ §29

**⑨ 解析渲染产物的 HTML 时，永远假设属性值里有 `>`。** `escapeAttr` 刻意不转义 `>`，
所以属性里会出现裸 `-->`：`[^>]*>` 会被提前截断，要用
`(?:"[^"]*"|[^>"])*` 风格整段吞带引号属性，或直接用正则字面量。→ §24

**⑩ 深色底上的「发光」不能用暖色填充，只能描边。** 低透明暖色 `fill` 与底色混色必变灰褐/土棕
（换面积、换层数都没用）；该底上所有 `lampHead` 类光晕都要 `halo:false`。→ §22.8 ⑧

**⑪ 品牌档案目录是唯一真源，`themes.json` / `components.json` 只是派生副本。**
改品牌事实只改 `profile.json`（`brand_save` / `brand_learn`）；`brand.md` 里带
`<!-- stylewx:auto -->` 的小节由程序生成，手改会被覆盖。改完跑 `pnpm check:brands`。
比较副本不要用 `JSON.stringify`（zod 会按 schema 顺序重建键序，被误判成漂移）。→ §30

## 3. 发布

常规通道是 **Changesets**：开发时 `pnpm changeset` 记录变更并提交进 PR，合到 main 后
workflow 自动判定 version / publish / 什么都不做。**合并 Release PR 即完成发布，不要再手动打 tag。**

```bash
pnpm build && pnpm type-check && pnpm test
pnpm brand:check      # 品牌回归：令牌漂移 / 按钮层级 / 21 项对比度 / 品牌三方一致性
pnpm check:release    # 9 个包版本一致 + 元数据齐全
pnpm check:pack       # 真打 tarball 拆开看：关键文件在不在、有没有漏 .env
pnpm check:artifact   # 装产物真跑：握手版本、工具清单、编辑器自包含
```

这就是 `pnpm release` 的内容（再加上真正的 publish）。版本判定表、两条发布通道、OIDC Trusted
Publishing 登记、provenance 与回查办法 → 见 `.github/workflows/release.yml`（写在该文件头部注释里）。

## 4. 想改什么，先读哪里

| 想改什么 | 先读 |
|---|---|
| 编辑器界面 / 颜色 / 按钮层级 | `brand-system.md §21` + `pnpm brand:check` |
| 微信兼容规则（白名单） | `core.md §6`；常量在 `packages/theme/src/css-whitelist.ts` |
| 富组件 / 自定义组件 / 样式覆盖 | `component-system.md §11、§14–§16`；语法与清单见 `docs/COMPONENTS.md` |
| MCP 工具 | `README.md`「MCP 工具」+ `apps/mcp-server/src/tools.ts` |
| 文章主题 | `packages/theme/src/presets.ts`（原创 6 套）、`wemd-presets.ts`（移植 20 套） |
| 品牌动效资产（头图/尾图/logo） | `pitfalls.md §22.8`（①~⑩）+ `assets-src/gen-motion.mjs` |
| 标题图太大 / 头尾图发灰 | `pitfalls.md §22.8` ①/⑧（深色底暖色填充必脏，只能描边）+ `assets-src/cmp-cover.mjs` |
| 发布通道 / 浏览器自动化 / 正文嵌视频 | `publishing.md §20` |
| 草稿箱里人的初版 | `publishing.md §29`（**不许删**）；回灌 `assets-src/restore-originals.mjs` |
| 平台组件（音乐 / 推荐搜索 / 该不该做） | `platform-widgets.md §26–§28`；探针 `probe-wechat-toolbar.mjs` |
| 品牌档案 / 一致性 / 打包分发 | `brand-pack.md §30–§31`；闸门 `pnpm check:brands`、CLI `stylewx brand doctor` |
| Mermaid 图 | `editor.md §24`；组件 `components/mermaid.ts`、出图 `packages/preview/src/mermaid.ts` |
| 编辑器另存为 / 写入白名单 | `editor.md §25`；闸门 `writeRoots()`（save-article.ts），`STYLEWX_WRITE_ROOTS` |
| 踩过的坑（全量） | `pitfalls.md §22` |
| 手动验证脚本（不进 CI） | `manual-scripts.md §23` |
| 发布流程细节 | `.github/workflows/release.yml`（两条通道与版本判定写在其头部注释） |

## 5. 常用命令

```bash
# 开发
pnpm build && pnpm type-check && pnpm test
pnpm stylewx:editor                     # 本地编辑器 http://localhost:3777/editor

# 品牌体系
pnpm brand:check                        # 回归：令牌 / 柔影签名 / 按钮层级 / 21 项对比度
pnpm brand:assets                       # 重生成 logo 与 banner（SVG 源 → PNG 2x）
pnpm check:brands                       # 三方一致性（真源 ↔ 副本 ↔ brand.md 自动段）
pnpm check:brands:fix                   # 只修自动段与派生副本，绝不碰 profile.json

# 头/尾图（改 assets-src/gen-motion.mjs 后必跑）
python assets-src/build-brand.py && node assets-src/check-collisions.mjs  # 装饰不得压文字，退出码非零
node assets-src/shot-abc.mjs && node assets-src/zoom-abc.mjs              # 并排图 + 4x 放大（两个必须一起跑）

# 发到草稿箱后**必须**读回体检（脚本报「已保存」≠ 稿子是对的）
node apps/mcp-server/scripts/verify-drafts.mjs <appmsgid>…

# 编辑器视觉回归（不进 CI，需 3777 在跑）
node packages/preview/scripts/ui-shots.mjs .ui-shots/after   # 19 个面各拍一张，改前改后逐面比
```

其余手动验证脚本（探针 / E2E / 对比）见 **§23 表** —— 它们不进 CI，本地坏了没人发现，
跑之前先确认它还能用。
