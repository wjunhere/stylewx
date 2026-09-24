# AGENTS.md

给接手这个仓库的 AI Agent（以及人）的说明。**铁律、发布流程与失败教训**在这里；
设计决策在 [`docs/DESIGN.md`](./docs/DESIGN.md)；用法在 [`README.md`](./README.md)。

## 1. 这个仓库是什么

公众号排版服务：**无头排版内核** + MCP Server + REST API + 本地 Web 编辑器。
pnpm workspace monorepo，9 个可发布包，在 `.changeset/config.json` 里配了
`fixed: [["@stylewx/*"]]` —— **任一包升版会带着其余 8 个一起升**。

```
packages/{core,theme,validator,components,publisher,preview,service}
apps/{mcp-server,api}
```

## 2. 铁律

**① 品牌色不进入 390px 画布。** 编辑器外壳有一套独立于文章主题的品牌层（六令牌）；
画布里的每一处颜色都由当前文章主题决定，切换主题时只有画布变色。
详见 [`docs/DESIGN.md` §21](./docs/DESIGN.md#21-品牌体系方向-b--协议-protocol)，改配色后必须跑 `pnpm brand:check`。

**② 版本号只在 `package.json` 维护一处。** 不要在源码里写版本常量（`SERVER_VERSION` 曾硬编码
`'0.1.0'`，连发三个版本没人发现，见 §4.1）。同理，「能点数的事实」（22 个工具、26 套主题）
不要写死在文案里，或至少让它可被测试守住。

**③ `core` / `theme` / `validator` 不碰 DOM 与 Node。** 不 import `window`/`document`/`navigator`，
也不 import `node:fs`/`node:path`/`process`；所有微信网络调用只出现在 `publisher`。
破坏这条会让包无法在浏览器侧复用。

**④ 发布产物必须能被真实消费。** `pnpm test` 全绿不等于发出去的包能用 —— 单测跑的是 TS 源码与
in-memory 传输，真实用户装的是 tarball 里的 `dist/`。发布前按 §3.2 装产物真跑一遍。

**⑤ 通道幂等，但别乱打 tag。** `pnpm -r publish` 会自动跳过已存在的版本，重复触发安全；
但 tag 一推就触发发布，**推之前必须确认 `pnpm check:release -- --tag v<版本>` 通过**。

## 3. 发布

### 3.1 常规通道：Changesets

开发时 `pnpm changeset` 记录变更（选 patch/minor/major）并提交进 PR。合到 main 后 workflow 自动判定：

| 仓库状态 | 动作 |
|---|---|
| 有 `.changeset/*.md` | **version**：改 9 个版本 + 写 CHANGELOG + 同步 lockfile，开 Release PR |
| 无 changeset，但有「版本已升、未发布」的包 | **publish**：校验 → 发布 → 打 tag → 建 Release |
| 其余 | 什么都不做 |

**合并 Release PR 即完成发布**，不要再手动打 tag。注意 `changeset version` 会**删除**
`.changeset/*.md`（消费掉）并生成 `CHANGELOG.md`，两个改动要一起提交，否则下次会被当成"没有 changeset"。

### 3.2 发布前本地闸门

```bash
pnpm build && pnpm type-check && pnpm test
pnpm brand:check            # 品牌回归：令牌漂移 / 按钮层级 / 21 项对比度
pnpm check:release          # 9 个包版本一致 + 元数据齐全
pnpm check:pack             # 真打 tarball 拆开看：关键文件在不在、有没有漏 .env
pnpm check:artifact         # 装产物真跑：握手版本、工具清单、编辑器自包含
pnpm -r publish --dry-run --no-git-checks --access public
```

这就是 `pnpm release` 的内容（再加上真正的 publish）。

**`check:artifact` 为什么存在**：`pnpm test` 跑 TS 源码 + in-memory 传输，`check:pack` 只看 tarball
的文件清单，**两者都不检查产物行为** —— §4.1 就是这么漏的。它做四件事：`pnpm pack` 打真实 tarball
（不经 registry）→ 解到临时目录用 `dist/` 起**真实 stdio 进程** → 连**真实 Client** 断言
`serverInfo.version === package.json` 与核心工具齐全 → 顺带校验 `editor.html` 自包含。
不联网、不装依赖（依赖用 junction 链到仓库已构建版本），可随时跑；`--keep` 保留临时目录。

### 3.3 紧急 / 重试 / 演练

```bash
pnpm check:release -- --tag v0.4.2           # 先确认 tag 与包版本匹配
git tag v0.4.2 && git push origin v0.4.2     # 校验 → 构建测试 → 产物校验 → 发布 → 回查 → Release
```

或在 Actions 面板手动 dispatch（默认 `dry_run=true`，只打包校验不真发）。
**手动触发时 `GITHUB_REF` 是分支名不是 tag**，workflow 里那段 `if [ "$GITHUB_REF_TYPE" = "tag" ]`
不要删 —— 否则 tag 校验会拿分支名去比，必然失败（踩过一次）。

### 3.4 认证与 provenance

主路径是 npm Trusted Publishing（OIDC），仓库里不存 token：在 npmjs.com 给每个 `@stylewx/*` 包
登记 Trusted Publisher，workflow 文件名填 **`release.yml`**（两条通道刻意合并进一个文件，
就为了只登记 9 次而不是 18 次）。**必须勾「Allow npm publish」** —— 2026-09-03 起新建配置默认只允许
`npm stage publish`。未登记时退回 `NPM_TOKEN` secret（都在时 OIDC 优先）。

走 OIDC 发出来的包带 **provenance**：`0.3.0` 用静态 token 发，没有；`0.4.x` 有。
核对 `npm view @stylewx/mcp-server@<version> dist.attestations --json`。

### 3.5 发布后回查（npm 是异步的）

`pnpm publish` 返回 0 **不代表** 9 个包真都可见了 —— npm 处理新版本是异步的，刚发完立刻
`npm view` 会看到旧版本，这不是失败，别急着重发。用 `node scripts/ci/verify-release.mjs --check-registry`
轮询等待（默认 10s 一次、最多 240s）。**CI 里跑一次就够，本地不必重复跑**：等待消不掉，重复等待纯属浪费。

## 4. 踩过的坑

按「症状 → 原因 → 防线」记，都是真实发生过的。

### 4.1 `initialize` 握手版本号停在 0.1.0（三个版本没发现）

**症状**：每个装了 stylewx 的人，在 MCP 客户端 `serverInfo` 里看到的版本都是 `0.1.0`，与 npm 对不上。

**原因**：`apps/mcp-server/src/server.ts` 里写着 `export const SERVER_VERSION = '0.1.0'`，
**从首个版本起就没跟过 `package.json`**。

**为什么没被发现**：单测用 in-memory 传输，从不读握手返回值；`smoke-stdio.mjs` 虽然起了真实进程、
连了真实 Client，却只断言工具列表与行为，**没断言版本**。"有真实进程"和"覆盖了真实契约"是两件事。

**防线**：`server.ts` 改为从包元数据读（源码与 `dist/` 下 `../package.json` 都解析到正确位置）；
`mcp.test.ts` 与 `smoke-stdio.mjs` 都断言握手版本等于 `package.json`；
新增 `check:artifact`（§3.2）并接进 `pnpm release`。

**更重要的教训**：我是**发完 0.4.0 才去验证已发布产物**时发现的，只能补发 0.4.1。
**验证必须发生在不可逆动作之前。**

### 4.2 `check:pack` 本地不幂等

**症状**：本地连跑两次报 `✗ 存在未能对应到任何包的 tarball：stylewx-validator-0.4.0.tgz`。

**原因**：它不清理 `pack-out/`，上一轮 tarball 被 `verify-pack.mjs` 当成"未能对应到任何包"。
**CI 遇不到**，因为每次是新检出、`pack-out/` 天然为空。

**防线**：`check:pack` 前置清理。用 `node -e "require('fs').rmSync(...)"`，**不要用 rimraf** ——
这个仓库并没装它（原 `clean` 脚本里的 rimraf 同样是坏的）。

**教训**：**只在 CI 跑的脚本，在本地可能是坏的。** 本地会累积状态，CI 不会 ——
"CI 一直绿"不能证明脚本健壮。

### 4.3 引用了从未定义的 CSS 变量

**症状**：编辑器 AI 弹层选中态颜色不对（继承色而非品牌色）。

**原因**：`.ai-chip` / `.ai-selinfo` / `.ai-prompt:focus` 引用了 `--blue`，而它**从未在 `:root` 定义过**。
CSS 对未定义变量不报错，静默回退。

**防线**：`scripts/brand/check-editor.mjs` 扫描所有 `var(--x)` 并比对已定义集合。
**教训**：CSS 自定义变量的拼写错误是静默的，必须有脚本兜。

### 4.4 同权重选择器让禁用态看起来可点

**症状**：组件库弹层里禁用按钮仍渲染成实底深色，像是能点。

**原因**：新加的 `.btn.ink`（墨色实底）与既有 `.btn:disabled` **特异性相同**，而后者写在前面，被盖掉了。

**防线**：禁用态与每个实底变体**成对声明**：

```css
.btn.ink:disabled { background: color-mix(in oklch, var(--fg) 34%, var(--bg)); ... }
```

混色对象用 `--bg` 而非无彩的 `--surface`，避免在 oklch 插值里跑出怪色相。

### 4.5 专有概念被挪用到别的语义上

**症状**：校验条把 `[image-count-zero]`（正文没有图片）也标成「灰档」。

**原因**：「灰档」是**专有概念** —— 特指微信草稿 API 实测会保留、但读者端需真机核对的 CSS 属性。
用它描述普通警告，会让人以为两类问题是一回事。

**防线**：只有 `[css-property-gray]` 能叫「灰档」，其余显示为「警告」。
**教训**：领域词进了 UI 就是术语，不能当形容词用。

### 4.6 其它值得知道的

- **不要靠"写在后面"赢同权重样式** —— 见 `docs/DESIGN.md` §18.1。
- **`prop()` 判空用 `||` 不用 `??`** —— 它缺省返回**空串**，`??` 对空串无效。见 §19.6。
- **原生 `FormData` 在 undici 下 body 会被吞**（微信报 41005）—— 见 §19.7。
- **自动化点「确认类」按钮很危险** —— 曾用 opencli 的 `click --text "下一步"`，该参数精确匹配失败时
  会**退化模糊匹配**，结果点到「退出登录」导致账号登出。定位必须精确唯一并配危险名单兜底。见 §20.5。
- **直接调 `renderMarkdownToHtml` 会漏掉自定义组件** —— `renderPreview` / `renderFragment` 都经过
  `safeUserComponents()`，不传就从 `~/.stylewx/components.json` 兜底读；而绕过它们直接调核心渲染时
  必须自己传 `userComponents`，否则 `:::我的组件` 会被当成普通文本渲染，只报一条
  「未知组件」，看着就像组件坏了。组件库预览曾因此五个自定义组件全部不渲染。
- **`package.json` 的 `files` 写错 npm 不报错** —— 只是安静地少打包，运行时才炸。
  所以有 `verify-pack.mjs` 把 tarball 拆开看。
- **flex 容器里的 `vertical-align` 是死属性** —— flex item 会被 blockify，`vertical-align`（以及
  `text-align`、`float`）对它们无效。工具条「上标/下标」两个按钮曾因此渲染成**一模一样**：
  `x<sup>2</sup>` 里的 `<sup>` 成了 flex item，`vertical-align:super` 被忽略。
  防线：这类行内内容要包一层元素还原行内上下文（`editor.html` 工具条上标/下标那两个按钮上就带着这条注释）。
  半连的另一个坑：sup/sub 还会把**行盒撑高**，于是 `x²` 与 `x₂` 的 x 不在同一水平线（实测差 2.83px），
  还得给 sup/sub 加 `line-height:0` 把它们从行盒高度计算里摘出去。两个坑合起来才算真对齐。

### 4.7 写跨平台 Node 脚本会碰到的五件事

写 `scripts/ci/verify-artifact.mjs` 时全踩了一遍。不是本仓特有的 bug，但会反复消耗时间。

**① `execFileSync('pnpm', ...)` 会 ENOENT**：`D:\Nodejs\pnpm` 是 **POSIX shell 脚本**
（真入口是 `pnpm.CMD`），不经 shell 执行不了。要么 `shell: true`，要么直接调 `.cmd`。
同理别假设 `python`/`python3`/`tar` 背后是什么（实测 `python3` 是 Store 空壳）。

**② GNU tar 会把 `C:\path` 当远程主机**（`Cannot connect to C: resolve failed`）：
盘符冒号被当成 `host:path`。解法是**传文件名 + 把 cwd 设成目标目录**，
而不是传 Windows 绝对路径 —— 比依赖 `--force-local`（GNU 专属）更稳。

```js
execFileSync('tar', ['-xzf', basename(tarball), '-C', 'unpacked'], { cwd: work })
```

**③ ESM 不读 `NODE_PATH`**：那是 CJS 的机制，而本仓全是 ESM。要让解包出来的包用上仓库依赖，
得像 pnpm 一样做链接（`symlinkSync(real, target, 'junction')`，junction 在 Windows 上不需要管理员权限）。

**④ `require.resolve('<pkg>/package.json')` 常会抛错**：现代包普遍用 `exports` 限定路径，
很多只开放 `"."`（抛 `ERR_PACKAGE_PATH_NOT_EXPORTED`）；双入口包更麻烦，`require.resolve(dep)`
会去要 `dist/cjs/index.js`，而该文件可能根本没装。
**结论：找依赖目录就直接查文件系统** —— 逐层向上看 `node_modules/<dep>/package.json` 在不在，
与 Node 自身查找规则一致，且绕开 `exports` 与双入口问题。

**⑤ 「本地过、CI 挂」几乎总是环境依赖 —— 用一个干净环境复现。** 最隐蔽的一条。
`verify-artifact.mjs` 在 Windows 本地全绿，推 CI（Linux）报
`Cannot find package '@modelcontextprotocol/sdk' imported from /tmp/.../probe.mjs`。
原因是探针自己也要 import SDK，而 ESM 从**脚本所在目录**向上找 `node_modules`：
探针放在临时目录根部，向上会走到 `%TEMP%` → 用户目录 → 盘根，于是 Windows 上**盘根恰好有
`C:\Users\wjun\node_modules`（意外残留）而侥幸通过**，Linux 一路到 `/` 都没有就失败。
这不是"CI 环境有问题"，是代码依赖了机器上碰巧存在的东西 —— 把探针放进被测包目录（命中 junction）即可。

验证方法：`mv ~/node_modules ~/node_modules.bak && pnpm check:artifact && mv ~/node_modules.bak ~/node_modules`。

**教训**：凡是"在本地能过"的判断，先问一句 *它是不是蹭到了本机环境？*
临时目录、盘根、用户目录都是容易被意外蹭到的地方。

## 5. 改动前先看哪里

| 想改什么 | 先读 |
|---|---|
| 编辑器界面 / 颜色 / 按钮层级 | `docs/DESIGN.md` §21 + `pnpm brand:check` |
| 微信兼容规则（白名单） | `docs/DESIGN.md` §6；常量在 `packages/theme/src/css-whitelist.ts` |
| 富组件 | `docs/COMPONENTS.md`；目录单一来源在 `packages/components/src/catalog.ts` |
| MCP 工具 | `README.md`「MCP 工具」+ `apps/mcp-server/src/tools.ts` |
| 文章主题 | `packages/theme/src/presets.ts`（原创 6 套）、`wemd-presets.ts`（移植 20 套） |
| 发布流程 | 本文件 §3 + `.github/workflows/release.yml` |

## 6. 常用命令

```bash
# 开发
pnpm build && pnpm type-check && pnpm test
pnpm stylewx:editor                     # 本地编辑器 http://localhost:3777/editor

# 品牌体系
pnpm brand:check                        # 回归：令牌 / 按钮层级 / 21 项对比度
pnpm brand:assets                       # 重生成 logo 与 banner（SVG 源 → PNG 2x）

# 发布（CI 里由 pnpm release 调用）
pnpm check:release && pnpm check:pack && pnpm check:artifact
node scripts/ci/verify-release.mjs --check-registry   # 发布后回查，仅 CI 跑一次
```

仓库里还有一批**不参与 CI 的手动验证脚本**，改动相关模块时按需跑：

| 脚本 | 验证什么 |
|---|---|
| `apps/mcp-server/scripts/verify-agent-workflow.mjs` | 模拟 agent 分步工作流（真实 MCP stdio）：微调主题 → 逐段 → 整篇 → 落盘 → editorUrl 读回 |
| `apps/mcp-server/scripts/verify-handoff.mjs` | `save_article` 落盘后从编辑器端点读回（需编辑器在 3777 运行） |
| `apps/mcp-server/scripts/verify-html-roundtrip.mjs` | 本地往返：渲染 → HTML 回导 → 再渲染，比对组件标记与纯文本 |
| `apps/mcp-server/scripts/verify-wechat-showcase.mjs` | 真实微信端到端：发布 → 取回 → 核对组件存活 + 回导还原 |
| `apps/mcp-server/scripts/publish-via-browser.mjs` | 浏览器登录态发布（免 IP 白名单，含封面上传） |
| `scripts/comparison/run.mjs` | 品牌记忆 + 多组排版策略对比（4 篇 × 4 组），输出截图与量化指标 |
| `packages/preview/scripts/test-editor-*.mjs` | 编辑器 E2E（导入 / 同步滚动 / 交接 / 组件面板，需 Playwright + 3777 运行） |
| `packages/preview/scripts/capture-hero.mjs` | 重截 README 配图 `docs/assets/editor-preview.png` |

## 7. 文档分工

- **README.md** — 面向使用者：功能、安装、接入方式、MCP 工具清单
- **docs/DESIGN.md** — 面向维护者：设计决策、约束、实测结论、踩坑记录
- **docs/COMPONENTS.md** — 富组件语法与清单
- **AGENTS.md**（本文件）— 面向 AI Agent 与接手的人：铁律、发布流程、失败教训

写文档时的约定：**说清楚"为什么"和"代价"**，不要只写"是什么"。
本项目大量决策是权衡的结果（例如取消全部投影的代价是发丝线不能调浅），
只记结论会让后来者在不了解代价的情况下把它改坏。
