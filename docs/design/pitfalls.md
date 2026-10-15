# 踩过的坑（全量，§22）

按「症状 → 原因 → 防线」记，都是真实发生过的。铁律与索引在 [AGENTS.md](../../AGENTS.md)。
上层：[设计说明索引](../DESIGN.md)。

## 22. 踩过的坑（全量）

按「症状 → 原因 → 防线」记，都是真实发生过的。

### 22.1 `initialize` 握手版本号停在 0.1.0（三个版本没发现）

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

### 22.2 `check:pack` 本地不幂等

**症状**：本地连跑两次报 `✗ 存在未能对应到任何包的 tarball：stylewx-validator-0.4.0.tgz`。

**原因**：它不清理 `pack-out/`，上一轮 tarball 被 `verify-pack.mjs` 当成"未能对应到任何包"。
**CI 遇不到**，因为每次是新检出、`pack-out/` 天然为空。

**防线**：`check:pack` 前置清理。用 `node -e "require('fs').rmSync(...)"`，**不要用 rimraf** ——
这个仓库并没装它（原 `clean` 脚本里的 rimraf 同样是坏的）。

**教训**：**只在 CI 跑的脚本，在本地可能是坏的。** 本地会累积状态，CI 不会 ——
"CI 一直绿"不能证明脚本健壮。

### 22.3 引用了从未定义的 CSS 变量

**症状**：编辑器 AI 弹层选中态颜色不对（继承色而非品牌色）。

**原因**：`.ai-chip` / `.ai-selinfo` / `.ai-prompt:focus` 引用了 `--blue`，而它**从未在 `:root` 定义过**。
CSS 对未定义变量不报错，静默回退。

**防线**：`scripts/brand/check-editor.mjs` 扫描所有 `var(--x)` 并比对已定义集合。
**教训**：CSS 自定义变量的拼写错误是静默的，必须有脚本兜。

### 22.4 同权重选择器让禁用态看起来可点

**症状**：组件库弹层里禁用按钮仍渲染成实底深色，像是能点。

**原因**：新加的 `.btn.ink`（墨色实底）与既有 `.btn:disabled` **特异性相同**，而后者写在前面，被盖掉了。

**防线**：禁用态与每个实底变体**成对声明**：

```css
.btn.ink:disabled { background: color-mix(in oklch, var(--fg) 34%, var(--bg)); ... }
```

混色对象用 `--bg` 而非无彩的 `--surface`，避免在 oklch 插值里跑出怪色相。

### 22.5 专有概念被挪用到别的语义上

**症状**：校验条把 `[image-count-zero]`（正文没有图片）也标成「灰档」。

**原因**：「灰档」是**专有概念** —— 特指微信草稿 API 实测会保留、但读者端需真机核对的 CSS 属性。
用它描述普通警告，会让人以为两类问题是一回事。

**防线**：只有 `[css-property-gray]` 能叫「灰档」，其余显示为「警告」。
**教训**：领域词进了 UI 就是术语，不能当形容词用。

### 22.6 其它值得知道的

- **不要靠"写在后面"赢同权重样式** —— 见 §18.1（`editor.md`）。
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
- **直接 import 的包必须自己声明依赖，靠传递依赖在 monorepo 里能跑通、在产物里必断** ——
  workspace 链接是平的，`@stylewx/preview` 作为 service 的传递依赖在 dev 环境能解析到，
  于是 mcp-server 直接 import 它却没写进自己的 dependencies，也没人发现；
  直到 `check:artifact` 起真实产物进程才报 ERR_MODULE_NOT_FOUND。
  单测、`check:pack` 都查不出来，因为它们不解析依赖图。规则：**写一行 import 就补一行声明**，
  拿不准就看 `check:artifact`（它就是为这类「装上产物才暴露」的问题存在的）。
- **flex 容器里的 `vertical-align` 是死属性** —— flex item 会被 blockify，`vertical-align`（以及
  `text-align`、`float`）对它们无效。工具条「上标/下标」两个按钮曾因此渲染成**一模一样**：
  `x<sup>2</sup>` 里的 `<sup>` 成了 flex item，`vertical-align:super` 被忽略。
  防线：这类行内内容要包一层元素还原行内上下文（`editor.html` 工具条上标/下标那两个按钮上就带着这条注释）。
  半连的另一个坑：sup/sub 还会把**行盒撑高**，于是 `x²` 与 `x₂` 的 x 不在同一水平线（实测差 2.83px），
  还得给 sup/sub 加 `line-height:0` 把它们从行盒高度计算里摘出去。两个坑合起来才算真对齐。

### 22.7 写跨平台 Node 脚本会碰到的五件事

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
`<用户目录>\node_modules`（意外残留）而侥幸通过**，Linux 一路到 `/` 都没有就失败。
这不是"CI 环境有问题"，是代码依赖了机器上碰巧存在的东西 —— 把探针放进被测包目录（命中 junction）即可。

验证方法：`mv ~/node_modules ~/node_modules.bak && pnpm check:artifact && mv ~/node_modules.bak ~/node_modules`。

**教训**：凡是"在本地能过"的判断，先问一句 *它是不是蹭到了本机环境？*
临时目录、盘根、用户目录都是容易被意外蹭到的地方。

**⑥ 闸门只检查「文件在不在」，就没有任何东西在跑那个文件。** 这条是 P1 补测试时发现的，
足以让一个**完全跑不起来的 CLI** 堂而皇之过全部闸门：

- `verify-pack.mjs` 只断言 `dist/cli.js` **存在于** tarball 里；
- `verify-artifact.mjs` 只真跑 stdio **server**（`dist/index.js`）；
- 单测跑的是 **TS 源码**（`src/cli.ts`），产物里那份 `dist/cli.js` 没人碰过；
- `pnpm test` 全绿、`check:artifact` 全绿，而用户 `npx stylewx` 一跑就
  `does not provide an export named 'attachBrandAssets'`（手工用 npm 装单个 tarball 时，
  `@stylewx/*` 会去 registry 拉到旧版本 —— 这正是发布前最该拦住的形态）。

**防线**：`check:artifact` 新增一段「CLI 产物」，**真跑** `dist/cli.js`：
`brand doctor --json` 能吐 JSON、退出码与报告 `ok` 一致（闸门语义）、`brand list` 能跑、
无参数退出码为 2。实测：把 import 改成不存在的导出 → 三项同时报错。

**推广**：凡是「声明要发布的入口」（bin / main / exports），都得有一道**真执行**它的闸门。
`existsSync` 不是验证。

**⑦ CLI 的副作用不能写在模块顶层。** `cli.ts` 旧版在顶层 `process.exit(main())`，
后果是**这个文件根本无法被 import** —— 于是它有 200 行闸门逻辑却一条测试都没有，
因为 import 它等于退出测试进程。改法：`runCli(argv, io)` 纯化（不读 `process.argv`、
不写 stdout、不 `process.exit`），副作用缩到文件末尾一层 `isEntry()` 守卫壳。
现在能逐字断言输出与退出码，另加一条真子进程用例守着那层壳。

### 22.8 内联 SVG + SMIL 写动效资产会碰到的七件事

微信正文禁 JS、禁外链动画，**内联 SVG + SMIL 是唯一真能动且实测存活的通道**。写
`brand/tools/gen-motion.mjs`（品牌头/尾图与 logo，住工作区、不进仓库）时这些坑各踩了一遍。

**① 缩放不能用「绝对坐标 × s」。** 给灯头写 `g(v) = v * s` 会把灯心搬到 `(x·s, y·s)`，
和灯柱的弧头脱开，`s` 越大偏得越远。要用 `transform="translate(x y) scale(s)"`
先搬原点再缩放。**只在 1 倍下看一眼是发现不了的** —— 必须把 s ≠ 1 的实例都截出来。

**② 父级挂了 `<animateTransform transform>` 时，子树里的静态 `transform` 会让整棵子树消失。**
不是动画失效，是**图形整个不见**。原本想用「外层 g 做位移入场 + 内层 g 做静态 scale」两层结构，
结果剪影完全画不出来。当时建了 case1..4 对照组才定位到：唯独这一组合什么都渲染不出。
解法是**把坐标在生成器里烘成绝对值**，只让一个元素承载动画。

**③ 深色底上「大面积 + 低透明」的暖色会调出脏灰。** 夜蓝 `#0A2A6B` 上叠一层
`opacity:0.13` 的暖橘，实测变**芥末灰**。光晕在浅色头图里好看，在深色 logo 里就是泥。

**④ logo 不是插画。** 第一版把整幅插画（灯柱 + 光晕 + 渐层天空）塞进 logo，
`240px` 尚可，`48px` 糊成一团。**判据是缩放对照表**：把同一份 SVG 在 240 / 120 / 48px
并排截出来再决定（`assets-src/contact.mjs` 就是干这个的）。logo 只留一个形、实心、高对比；
光晕、渐变、呼吸这类「气氛」留给头图。

**⑤ 别忽略画布裁切。** 灯罩半圆的顶端是 `y − 30·s`；`y=14, s=0.7` 时顶端为 `−7`，
会被 viewBox 切平。SVG 不会报错，只会安静地切掉。

**⑥ 灯头坐标必须等于 `灯柱 x + bend`。** `hip-end-a` 里灯柱写 `x=60, bend=-26`（弧头在 34），
灯头却写 `x=86` —— **整盏灯向右飘了 52 单位**，而且全套 9 处灯里只有这一处不一致，
所以尤其难发现。改灯柱参数时要同时改灯头，两者没有联动。

**⑦ 同色相邻会“吃”掉形状。** logo 里白色的双腿正好压在同样白色的地平线上，
腿直接消失。不同结构用同一颜色时必须降对比分层（地平线用 `opacity:0.45`）。
同理：底色 `#0A2A6B` 上做暖色光晕会被调成芥末灰，要么缩小面积提高不透明度，要么改实心块。

**⑧ 深色底上「暖色填充」这条路整体不通，只有描边能走。**
这一条是找 ③ 的完整答案，而且是被逼出来的：重做方案 C 时，灯下的地面受光先后试过
**椭圆光斑 → 双层光池 → 小面积高不透明实心椭圆**，每种都在夜蓝底上变成**灰褐/土棕** ——
读者眼里是一块「煎饼」或「陨石坑」，不是光。

**7 种方案实拍对照**（`assets-src/try-pool.mjs`）后结论：

| 做法 | 夜蓝底上的结果 |
| --- | --- |
| 大面积低透明暖色椭圆 | ✗ 灰 |
| 白椭圆 + 橘心 | ✗ 灰底 + 土棕心 |
| 小面积 + 高不透明度 | ✗ 仍然是土棕「煎饼」 |
| **纯色描边弧线** | ✓ **干净** |

原因：`fill` 会与底色做视觉混色，暖橘配夜蓝的混色必然往灰棕走；
而 `stroke` 是纯色线条，不参与底色混色，所以属性上就不会脏。

**判据：深色底上的「发光」只能用 ① 小面积高不透明实心，② 纯色描边。**
所以 C 的地面受光是一道 `litArc()` 描边弧，不是任何形式的椭圆。
同一原因，C 里的 `lampHead` 必须传 `halo: false` —— 它的光晕就是低透明暖色填充。

**⑨ 三套方案的区分靠「画面主导色」，不靠不同颜色。**
只允许用同一组色（夜蓝 / 纸白 / 暖橘），让各套各让一个占主导：
**A 纸白主导（亮）→ B 暖灰纸主导（暖）→ C 夜蓝主导（暗）**。
所以 B 的底是 `cardBg` 而不是 `canvasBg`。这样三篇并读一眼可分，
又不会出现「同一账号却像三个品牌」的问题。

**⑩ 剪影的「简陋」来自部件太少，不是画得不够细。**
旧版剪影是「一个圆 + 一条竖线 + 一个方框 + 两条斜线」，50px 下就只剩一竖一横。
重做时改成**五个独立部件**（头 / 颈 / 躯干 / 行囊 / 手臂 / 两段式双腿），
并且：躯干**肩宽腰收**、行囊与躯干**留缝**（不留缝两块并成一个方块，两个都读不出来）、
腿画**髖→膝→脚两段式**（细三角缩小后直接消失）。
另外还加了山脊、道路、基座石三样**环境物**——没有它们，人在空白底色上仍然显得单薄。

> 动效资产的可复用产物在工作区 `brand/motion-shipped/`、图源在 `brand/motion/`（**都不在仓库里**，见 §34），
> 生成器是工作区 `brand/tools/gen-motion.mjs`，品牌档案 `~/.stylewx/brands/hippie-youth/`。
> 三套方案 **A「归途」/ B「灯下」/ C「行囊」全部可用**（不是只有 A 定稿），
> 区分靠画面主导色，选哪套看文章气质（报名 `brand.md`）。
> 重生成链路（都在工作区）：`brand/tools/gen-motion.mjs` → `brand/tools/build-brand.py`（写品牌档案与组件库）→ `assets-src/rasterize.mjs`（logo/封面位图）。
> 视觉验证：`shot-abc.mjs`（三套并排）/ `cmp-cover.mjs`（标题图高度对照）/ `final-shots.mjs`（三篇整页）。

