# AGENTS.md

给接手这个仓库的 AI Agent（以及人）的说明。**约束与踩过的坑**写在这里；
设计决策写在 [`docs/DESIGN.md`](./docs/DESIGN.md)；用法写在 [`README.md`](./README.md)。

---

## 1. 这个仓库是什么

stylewx 是公众号排版服务：一个**无头排版内核** + MCP Server + REST API + 本地 Web 编辑器。
pnpm workspace monorepo，9 个可发布包（`packages/*` 7 个 + `apps/*` 2 个），
在 `.changeset/config.json` 里配了 `fixed: [["@stylewx/*"]]` —— **任一包升版会带着其余 8 个一起升**。

```
packages/{core,theme,validator,components,publisher,preview,service}   7 个库
apps/{mcp-server,api}                                                   2 个入口
```

## 2. 铁律

### 2.1 品牌色不进入 390px 画布

编辑器外壳有一套独立于文章主题的品牌层（六令牌）。**画布里的每一处颜色都由当前文章主题决定**，
品牌色一律不进去。切换主题时只有画布变色，外壳一动不动。

详见 [`docs/DESIGN.md` 第 21 节](./docs/DESIGN.md#21-品牌体系方向-b--协议-protocol)。
改配色后**必须**跑 `pnpm brand:check`，它会核对令牌漂移与 21 项对比度。

### 2.2 版本号只在 package.json 维护一处

不要在源码里写版本常量。`SERVER_VERSION` 曾经硬编码 `'0.1.0'`，连发三个版本没人发现
—— 见 §4.1。同理，**能点数的事实**（22 个工具、26 套主题）不要写死在文案或注释里，
或者至少让它可被测试守住。

### 2.3 同步边界：core / theme / validator 不碰 DOM 与 Node

这三个包**不 import** `window`/`document`/`navigator`，也不 import `node:fs`/`node:path`/`process`。
所有微信网络调用只出现在 `publisher`。破坏这条边界会让包无法在浏览器侧复用。

### 2.4 发布产物必须能被真实消费

`pnpm test` 全绿**不等于**发出去的包能用 —— 单测跑的是 TypeScript 源码与 in-memory 传输，
真实用户装的是 tarball 里的 `dist/`。发布前务必按 §3.2 装一次产物真跑一遍。

### 2.5 两条发布通道都是幂等的，但别乱打 tag

`pnpm -r publish` 会自动跳过 npm 上已存在的版本，所以重复触发安全。
但 tag 一旦推上去就会触发发布流程，**推 tag 前必须确认 `pnpm check:release -- --tag v<版本>` 通过**。

## 3. 发布

### 3.1 常规通道：Changesets（默认走这条）

```bash
pnpm changeset              # 开发时记录变更，选择 patch/minor/major，提交进 PR
```

合到 main 后 workflow 自动判定，三种结果：

| 仓库状态 | 动作 |
|---|---|
| 有 `.changeset/*.md` | **version**：改 9 个版本 + 写 CHANGELOG + 同步 lockfile，开 Release PR |
| 无 changeset，但有「版本已升、未发布」的包 | **publish**：校验 → 发布 → 打 tag → 建 Release |
| 其余 | 什么都不做 |

**合并 Release PR 即完成发布**，不要再手动打 tag。

`changeset version` 会消费掉 `.changeset/*.md`（删除该文件）并生成 `CHANGELOG.md`。
这两个改动都要一起提交，否则下次改动会被当成"没有 changeset"。

### 3.2 发布前本地闸门

```bash
pnpm build && pnpm type-check && pnpm test
pnpm brand:check            # 品牌体系回归（令牌 / 按钮层级 / 21 项对比度）
pnpm check:release          # 9 个包版本一致 + 元数据齐全
pnpm check:pack             # 真打 tarball 并拆开看：关键文件在不在、有没有漏 .env
pnpm check:artifact         # 装产物真跑：握手版本、工具清单、编辑器自包含
pnpm -r publish --dry-run --no-git-checks --access public
```

这就是 `pnpm release` 脚本的内容（再加上真正的 publish）。

**关于 `check:artifact`** —— 它是为 §4.1 那个漏发的 bug 特意加的，见下节。
`pnpm test` 跑的是 TS 源码 + in-memory 传输，`check:pack` 只看 tarball 的文件清单，
**两者都不检查发布产物的行为**。`check:artifact` 补的就是这个空：

1. `pnpm pack` 打真实 tarball（不经过 registry）
2. 解到临时目录，用解出来的 `dist/` 起**真实 stdio server 进程**
3. 连**真实 Client**，断言 `serverInfo.version === package.json` 的版本、核心工具齐全
4. 顺带校验 `editor.html` 自包含（六令牌、无外部 CDN、favicon 内联、实底蓝只有一处）

它不联网、不装依赖（兄弟包与 SDK 通过 junction 链到仓库里已构建的版本），
所以可以随时跑：

```bash
pnpm check:artifact
node scripts/ci/verify-artifact.mjs --keep   # 保留临时目录，便于排查
```

### 3.3 紧急 / 重试 / 演练：tag 或手动

```bash
pnpm check:release -- --tag v0.4.2           # 先确认 tag 与包版本匹配
git tag v0.4.2 && git push origin v0.4.2     # 触发：校验 → 构建测试 → 产物校验 → 发布 → 回查 → Release
```

或在 Actions 面板手动 dispatch（默认 `dry_run=true`，只打包校验不真发）。
**手动触发时 `GITHUB_REF` 是分支名不是 tag**，workflow 里刻意加了 `if [ "$GITHUB_REF_TYPE" = "tag" ]`
的判断 —— 改这个文件时别把这段删了，否则 tag 校验会拿分支名去比，必然失败（历史上踩过一次）。

### 3.4 认证

主路径是 npm Trusted Publishing（OIDC），仓库里不存 token：

- 在 npmjs.com 上给每个 `@stylewx/*` 包登记 Trusted Publisher，workflow 文件名填 **`release.yml`**
  （两条通道刻意合并进同一个文件，就是为了只登记 9 次而不是 18 次）
- **必须勾上「Allow npm publish」** —— 2026-09-03 起新建配置默认只允许 `npm stage publish`，
  不勾的话 `pnpm publish` 会被拒
- 未登记时退回 `NPM_TOKEN` secret（两者都在时 OIDC 优先）

**副作用值得注意**：走 OIDC 发出来的包带 **provenance**（可验证的构建来源）。
`0.3.0` 用静态 token 发，没有；`0.4.0` / `0.4.1` 走 OIDC，`dist.attestations` 里有
SLSA provenance。核对：

```bash
npm view @stylewx/mcp-server@<version> dist.attestations --json
```

### 3.5 发布后回查（npm 是异步的）

`pnpm publish` 返回 0 **不代表** 9 个包真都可见了。npm 处理新版本是异步的，
刚发完立刻 `npm view` 会看到旧版本 —— 这不是失败，别急着重发。

```bash
node scripts/ci/verify-release.mjs --check-registry
```

它会轮询等待（默认 10s 一次、最多 240s）。**在 CI 里跑一次就够，本地不必重复跑** ——
等待本身消不掉，但重复等待纯属浪费。CI 的 `Verify versions are live on npm` 步骤已经做了这件事。

## 4. 踩过的坑

按「症状 → 原因 → 防线」记。这些都是真实发生过的。

### 4.1 `initialize` 握手版本号停在 0.1.0（三个版本没发现）

**症状**：每个装了 stylewx 的人，在 MCP 客户端的 `serverInfo` 里看到的版本都是 `0.1.0`，
和 npm 上的 `0.3.0` / `0.4.0` 对不上。

**原因**：`apps/mcp-server/src/server.ts` 里写了 `export const SERVER_VERSION = '0.1.0'`，
**从首个版本起就没跟过 `package.json`**。

**为什么没被发现**：单测用 in-memory 传输，从不读握手返回值；
`smoke-stdio.mjs` 虽然起了真实进程、连了真实 Client，却只断言工具列表与工具行为，
**没有断言版本**。也就是说，"有真实进程"和"覆盖了真实契约"是两件事。

**防线**（已加）：

- `server.ts` 改为从包元数据读（源码与 `dist/` 两种形态下 `../package.json` 都解析到正确位置）
- `mcp.test.ts` 新增回归测试：握手返回的 `serverInfo.version` 必须等于 `package.json` 的版本
- 新增 `scripts/ci/verify-artifact.mjs`（`pnpm check:artifact`）：**装真实产物、起真实进程、连真实 Client**，
  断言握手元数据与核心工具。已接进 `pnpm release`，以后这类问题会在发布前拦住

**另一个教训**：我是**发完 0.4.0 才去验证已发布产物**时发现的，结果只能补发 0.4.1。
正确顺序是发布前验证。**验证要发生在不可逆动作之前。**

### 4.2 `check:pack` 本地不幂等

**症状**：本地连跑两次 `pnpm check:pack`，第二次报
`✗ 存在未能对应到任何包的 tarball：stylewx-validator-0.4.0.tgz`。

**原因**：它不清理 `pack-out/`，上一轮的 tarball 留在那里，
`verify-pack.mjs` 会把上一轮版本的产物当成"未能对应到任何包"。

**为什么 CI 遇不到**：CI 每次是新检出，`pack-out/` 天然是空的。

**防线**：`check:pack` 前置清理。

```jsonc
// 不要用 rimraf —— 这个仓库并没有装它（原 clean 脚本里的 rimraf 同样是坏的）
"check:pack": "node -e \"require('fs').rmSync('pack-out',{recursive:true,force:true})\" && pnpm --filter ... pack ... && node scripts/ci/verify-pack.mjs ./pack-out"
```

**教训**：**只在 CI 跑的脚本，在本地可能是坏的。** 本地会累积状态，CI 不会 ——
所以"CI 一直绿"不能证明脚本健壮。

### 4.3 引用了从未定义的 CSS 变量

**症状**：编辑器 AI 弹层的选中态颜色不对（继承色而非品牌色）。

**原因**：`.ai-chip` / `.ai-selinfo` / `.ai-prompt:focus` 引用了 `--blue`，
而 `--blue` **从未在 `:root` 里定义过**。CSS 对未定义变量不报错，静默回退。

**防线**：`scripts/brand/check-editor.mjs` 会扫描所有 `var(--x)` 引用并比对已定义集合，
未定义即失败。

**教训**：**CSS 自定义变量的拼写错误是静默的**，必须有脚本兜。

### 4.4 同权重选择器让禁用态看起来可点

**症状**：组件库弹层里禁用按钮仍渲染成实底深色，像是能点。

**原因**：新加的 `.btn.ink`（墨色实底）与既有的 `.btn:disabled` **特异性相同**，
而 `.btn:disabled` 写在前面 —— 被盖掉了。

**防线**：禁用态必须与每个实底变体**成对声明**：

```css
.btn.ink:disabled { background: color-mix(in oklch, var(--fg) 34%, var(--bg)); ... }
```

混色对象用 `--bg` 而非无彩的 `--surface`，避免在 oklch 插值里跑出怪色相。

### 4.5 专有概念被挪用到别的语义上

**症状**：校验条把 `[image-count-zero]`（正文没有图片）也标成「灰档」。

**原因**：「灰档」在本产品里是**专有概念** —— 特指微信草稿 API 实测会保留、
但读者端需真机核对的 CSS 属性。用它去描述一条普通警告，会让人以为两类问题是一回事。

**防线**：只有 `[css-property-gray]` 能叫「灰档」，其余显示为「警告」。

**教训**：**领域词进了 UI 就是术语**，不能当形容词用。

### 4.6 其它值得知道的

- **自动化点「确认类」按钮很危险**：曾经用 opencli 的 `click --text "下一步"`（失败时**退化模糊匹配**），
  点到了相邻的「退出登录」，导致账号登出。见 `docs/DESIGN.md` §20.5。
  定位必须精确唯一，并配危险名单兜底。
- **`prop()` 判空用 `||` 不用 `??`**：它缺省返回**空串**，`??` 对空串无效。见 `docs/DESIGN.md` §19.6。
- **原生 `FormData` 在 undici 下 body 会被吞**：见 `docs/DESIGN.md` §19.7。
- **给既有组件加变体类时不要靠"写在后面"赢**：见 `docs/DESIGN.md` §18.1。
- **`package.json` 的 `files` 写错，npm 不报错**：它只是安静地少打包，运行时才炸。
  所以有 `verify-pack.mjs` 把 tarball 拆开看。

### 4.7 在 Windows 上写 Node 脚本会碰到的四件事

写 `scripts/ci/verify-artifact.mjs` 时这四件事全踩了一遍。都不是本仓特有的 bug，但会反复消耗时间。

**① `execFileSync('pnpm', ...)` 会 ENOENT**

`D:\Nodejs\pnpm` 是一个 **POSIX shell 脚本**（真正的 Windows 入口是 `pnpm.CMD`），
`execFileSync` 不经 shell 执行不了它。要么 `shell: true`，要么直接调 `.cmd`。
同理，不要假设 `python` / `python3` / `tar` 这些名字背后是什么（实测 `python3` 是 Store 空壳）。

**② GNU tar 会把 `C:\path` 当远程主机**

```
tar (child): Cannot connect to C: resolve failed
```

盘符里的冒号被当成 `host:path` 语法（GNU tar 确实支持 `-f host:/path`）。
解法是**传文件名 + 把 cwd 设成目标目录**，而不是传 Windows 绝对路径：

```js
execFileSync('tar', ['-xzf', basename(tarball), '-C', 'unpacked'], { cwd: work })
```

比依赖 `--force-local`（GNU 专属参数）更稳 —— 「子进程 cwd」比「拼绝对路径」跨平台可靠得多。

**③ ESM 不读 `NODE_PATH`**

想让解包出来的包用上仓库里的依赖，`NODE_PATH` **无效**：那是 CJS 的机制，而本仓全是 ESM。
得像 pnpm 一样做链接（`symlinkSync(real, target, 'junction')`，junction 在 Windows 上不需要管理员权限）。

**④ `require.resolve('<pkg>/package.json')` 常会抛错**

现代包普遍用 `exports` 限定可导入路径，很多只开放 `"."`，
所以 `require.resolve('@stylewx/service/package.json')` 会抛 `ERR_PACKAGE_PATH_NOT_EXPORTED`。
双入口（CJS/ESM）的包更麻烦：`require.resolve(dep)` 会去要 `dist/cjs/index.js`，
而该文件可能根本没装（只装了 esm）。

**结论：找依赖目录就直接查文件系统** —— 从起点逐层向上看 `node_modules/<dep>/package.json` 在不在。
这与 Node 自身的查找规则一致，且完全绕开 `exports` 限制与双入口问题。

## 5. 改动前先看哪里

| 想改什么 | 先读 |
|---|---|
| 编辑器界面 / 颜色 / 按钮层级 | `docs/DESIGN.md` §21 + `pnpm brand:check` |
| 微信兼容规则（白名单） | `docs/DESIGN.md` §6，白名单常量在 `packages/theme/src/css-whitelist.ts` |
| 富组件 | `docs/COMPONENTS.md`，目录单一来源在 `packages/components/src/catalog.ts` |
| MCP 工具 | `README.md`「MCP 工具」+ `apps/mcp-server/src/tools.ts` |
| 文章主题 | `packages/theme/src/presets.ts`（原创 6 套）与 `wemd-presets.ts`（移植 20 套） |
| 发布流程 | 本文件 §3 + `.github/workflows/release.yml` |

## 6. 常用命令

```bash
pnpm build && pnpm type-check && pnpm test    # 标准三连
pnpm stylewx:editor                            # 起本地编辑器 http://localhost:3777/editor
pnpm brand:check                               # 品牌体系回归
pnpm brand:assets                              # 重生成 logo 与 banner（SVG → PNG 2x）
pnpm check:release && pnpm check:pack          # 发布前闸门（版本/元数据、产物清单）
pnpm check:artifact                            # 装产物真跑（握手版本、工具、编辑器自包含）
pnpm release                                   # 上面全部 + 真正发布（CI 里调用）
node scripts/ci/verify-release.mjs --check-registry   # 发布后回查（仅 CI 跑一次即可）
```

## 7. 文档分工

- **README.md** — 面向使用者：功能、安装、接入方式、MCP 工具清单
- **docs/DESIGN.md** — 面向维护者：设计决策、约束、实测结论、踩坑记录
- **docs/COMPONENTS.md** — 富组件语法与清单
- **AGENTS.md**（本文件）— 面向 AI Agent 与接手的人：铁律、发布流程、失败教训

写文档时的约定：**说清楚"为什么"和"代价"**，不要只写"是什么"。
本项目大量决策是权衡的结果（例如取消全部投影的代价是发丝线不能调浅），
只记结论会让后来者在不了解代价的情况下把它改坏。
