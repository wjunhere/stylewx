# @stylewx/service

## 0.7.0

### Minor Changes

- 42d23b1: 品牌可分发：`.brand` 包（打包 / 校验 / 安装）+ 资产规则 + 重名策略。
  
  **之前缺什么**：品牌档案是一个目录，没法发给别人；`logo` / `coverImage` 存的是
  `mmbiz.qpic.cn` 直链，把它打包发给别人会把**上一个账号的 CDN 链接**一起发出去。
  
  **包格式**：`.brand` = zip，内含 `manifest.json`（`formatVersion` / `kind` / `engine` /
  每个文件的 sha256）+ `brand.json`（= profile.json + `formatVersion` / `assets` / `renamedFrom`）
  + `brand.md`（人的文档，逐字节带过来）+ `assets/`（只有身份位图）。**`source/` 默认不进包**
  （分发品牌 ≠ 交接源码），要交接用 `--with-source`。
  
  **判据不靠后缀**：`.brand` 只是提示，真正判据是 manifest 的 `kind` + `formatVersion`。
  所以 `.brand` / `.stylewx` / `.zip` / `.txt` 都能装；改了后缀的普通文件会被明确拒绝。
  
  **三条资产规则**：
  
  1. `logo` / `coverImage` 从 URL 改成**包内相对路径**（新增 `brand_attach_assets` /
     `stylewx brand attach` 把图片落进品牌目录 `assets/`）。
  2. **导入时拒绝一切远程 URL 资产**（否则一个包就能让导入方去请求任意地址），
     也拒绝 `../` 与绝对路径。
  3. 发布得到的微信 CDN 链接记 `.published.json`，**不回写 profile** —— 重打包不会把
     上一个账号的链接发给别人。
  
  **三条重名规则（重点是幂等）**：
  
  1. 组件撞名 → 加品牌后缀 `x--<brand>`，原名记进 profile 的 `renamedFrom`
     （`brand_apply` 会把它一并返回，让 agent 用对名字）。顺带修掉一个洞：
     导入不再沿用 `brandApply` 的无条件覆盖，不会悄悄覆盖你自己的同名组件。
  2. 品牌名撞名（不同来源）→ 加数字后缀 `-2`，侧车 `.origin.json` 记 `origin`，
     **绝不无声覆盖**（档案里有人写的散文与迭代记录）。
  3. 同一品牌再次导入 = **升级**：按 `name` + `origin` 认亲、原地替换，
     只有第一次才可能加后缀 —— 反复导入不会攒出 `-2 -3 -4`。
  
  **新增工具与命令**
  
  - MCP：`brand_export` / `brand_validate`（dry-run）/ `brand_import` / `brand_attach_assets`
  - CLI：`stylewx brand pack|attach|validate|install`（与 MCP 共用 service 实现）
  - REST：`GET /brands`、`GET /brands/:name`、`GET /brands/doctor`、
    `POST /brands/{validate,export,import,attach-assets}`
  - 编辑器「品牌档案」面板：加导出 `.brand` / 导入 `.brand…`（导入先校验再安装）
  
  **顺带修的**：
  
  - **发布通路回归（P1 自己引入的）**：`coverImage` 改成包内相对路径后，**发布在封面这一步炸**。
    正文图片走 relocate 的 `resolveLocal` 钩子，封面走的却是 `downloadImage`（无条件当 URL）。
    现在两处**共用** `@stylewx/service` 的 `resolveLocalImage`；相对路径以 `brand` 为基准，
    缺基准时明确报错（不伪装成网络失败）。编辑器、MCP `publish_draft`、REST `/drafts`
    三处都补齐（之前只有编辑器传了钩子）。
  - `brand doctor` 现在也检查资产（远程 URL 是警告、指向的包内文件不存在是错误）；
    `brand.md` 的自动段在改过 profile 事实后（如 attach 改 logo）会被同步，
    否则 doctor 会立刻报漂移。
  - `scripts/brand/gen-brand-assets.mjs` 里的工具/组件/主题数改为从代码算
    （banner 上原本写着「22 工具 · 22 组件」，实际已是 28 / 26）。
  
  **新增参数**：`publish_draft` 与 `POST /drafts` 多一个可选 `brand`（相对路径封面的解析基准）。
  
  **测试与闸门补强**：
  
  - `src/cli.ts` 拆成纯函数 `runCli(argv, io)` + 一层壳（`isEntry()` 守卫 + `process.exit`）。
    旧版顶层就 `process.exit`，**这文件根本无法被 import**，所以 200 行闸门逻辑一条测试都没有。
    现在 28 条用例（含真子进程验退出码）。
  - `POST /brands/export` 与 `POST /brands/attach-assets` 的 REST 用例（之前无）。
  - `check:artifact` 新增「CLI 产物」段：**真跑** `dist/cli.js`。
    之前所有闸门只检查 `dist/cli.js` 在不在，从没跑过它 —— 足以放过一个完全起不来的 CLI。
  
  **新增依赖**：`fflate`（纯 JS zip，无原生依赖）、`semver`（判 `engine` 断言）。
- 42d23b1: 品牌三方一致性闸门（`brand doctor`）+ 品牌宪法自动段 + 编辑器品牌面板。
  
  **修的什么**：品牌信息同时写在三处，此前没有任何东西检查它们一致 ——
  品牌目录 `~/.stylewx/brands/<name>/`（真源）、`themes.json`（编辑器主题下拉的副本）、
  `components.json`（渲染 `:::名字` 的副本）。实测两处真漂了：
  
  - `hippie-youth` 的 `brand.md` 里写着「C『行囊』…一人背行囊走出灯下」，而 C 两轮前已改成
    「远山」（去掉人影）。**人是照 brand.md 理解品牌的**，这份文档是错的。
  - `ink-ledger` 的三个组件从来没同步进 `components.json`（早期建档案时还没同步逻辑），
    编辑器里 `:::ink-quote` 根本渲染不出来。
  
  **怎么做**：
  
  - 新增 `brand-doc.ts`：`brand.md` 拆成**自动段**（`<!-- stylewx:auto palette -->`…`<!-- /stylewx:auto -->`，
    由程序从 profile 生成）与**人写的段**（定位 / 色彩论证 / 语气 / 禁忌）。同步只替换自动段，
    段外字节原样保留 —— 这是「人的散文不会被覆盖」的保证。
  - 新增 `brand-doctor.ts`：`brandDoctor`（只读检查）/ `brandFix`（只修能从真源重算的东西，
    绝不碰 profile.json）/ `brandOverview`（编辑器用）。
  - 新增 MCP 工具 `brand_doctor`（`fix: true` = 修自动段与副本）。
  - 新增 CLI `stylewx brand list|doctor`（与 MCP 共用 service 实现；闸门类命令需要退出码）。
  - 新增 `pnpm check:brands` / `pnpm check:brands:fix`，已接进 `pnpm brand:check` 与 CI。
  - 编辑器新增「品牌档案」面板（只读：列出 / 看 brand.md / 预览 / 应用），
    API `/editor/api/brands` 与 `/editor/api/brands/apply`。
  
  **学习记录不再要求逐字一致**：人在 `brand.md` 的迭代记录里会续写子级细节（实测一条记录
  带了 5 条补充），而 profile 只存一句话摘要。要求一致会把「补充细节」变成闸门错误，逼人删细节；
  所以 learnings 只判「缺失」，不判漂移。
  
  **注意**：`brand.md` 里的自动段改它会被下一次同步覆盖；要改事实请改 profile
  （`brand_save` / `brand_learn`）或跑 `pnpm check:brands:fix`。
  
  **补充：游离组件检查（`component_orphan`）**
  
  `brand doctor` 现在还会比对**全局组件库 ↔ 各品牌档案**：在全局库里却**不属于任何品牌**的
  组件会被报出来。
  
  为什么需要：`.brand` 包只带 `profile.components` 里列的组件。游离组件不会随任何包走 ——
  本机渲染正常（全局库里有），装到别的环境就退化成普通 Markdown。
  
  实测就是 `hip-quote`：品牌自己的收尾配方里写着它（`brand.md` 迭代记录）、文章也在用，
  但它只躺在 `~/.stylewx/components.json` 里。本机一直看不出问题，直到把包装进干净环境才报
  「未知组件「hip-quote」，已按普通 Markdown 渲染其正文」。
  
  两种报法：
  
  - 名字能对上一个品牌的前缀（`hip-` / `ink-` / `wx-`，由该品牌已有组件名推出）→ 报在那个品牌名下
  - 对不上任何前缀 → 全量体检时汇总报一条（需要人来决定归哪个品牌）
  
  是**警告不是错误**：doctor 无法知道哪篇文章用了它，所以不拦闸门。
- 6bdcf91: 色板自动段覆盖全量 token、打包前自包含预检、品牌档案段外副本清理。
  
  **修的什么**：品牌档案的自动段只覆盖「清单里列了的」东西，没列的就只能留在段外 ——
  `palette` 段只列 5 个 token（primary / text / accent / cardBg / divider）时，
  人在文档里补的第 6 个 token（`stylewx-craft` 的 `pageBackgroundColor`）无处可去，
  段外于是永远清不干净。三个品牌都照同一套手法清完了（写「只含人写内容」的 doc →
  `brandSave` 重算自动段）：`hippie-youth` 200 → 105 行、`ink-ledger` 87 → 68 行、
  `stylewx-craft` 95 → 67 行。
  
  **怎么做**：
  
  - `brand-doc.ts` 的 `PALETTE_TOKENS` 跟着主题 schema 的**全部颜色 token** 走（9 个）。
    `brand-doc.test.ts` 直接拿 `themeTokensSchema` 推出颜色 token 集合来比对（不是跟另一份
    手写清单比），漏一个、多一个都红 —— 两边都用变异验证过确实会红。
  - `packBrand` 打之前跑一次**自包含预检**：调 doctor 同一个 `scanOrphanComponents`
    （不另写一份前缀规则），把「看着属于这个品牌、却不在档案里」的组件从 `PackResult.warnings`
    回给调用方 —— CLI 打成 `! …`、编辑器导出后显示在品牌面板、REST 与 MCP 原样返回。
    **只警告不拦**：无法知道哪篇文章用了它，拦下打包只会让人连档案都交不出去。
    前缀推不出来（组件不足 2 个 / 没有共同前缀）时不查也不报。
  - 编辑器导入 `.brand` 成功后重新拉一次主题列表：`brandApply` 那条路（点「应用品牌」）拉了、
    导入那条漏了，表现是导完下拉里看不到，要再点一次「应用品牌」才出现。
  - `SKILL.md` 补「品牌打包与分发」一节，并把规则写死：**品牌组件必须通过 `brand_save` 归档案，
    否则不会随 `.brand` 包走**（就是 `hip-quote` 那个坑：本机渲染正常，装到别的环境退化成普通 Markdown）。
  
  **段外那点独有事实没丢**：`ink-ledger` 的「头图含 logo」折进组件 `description`（它原本只存在于
  段外那一行），`stylewx-craft` 的 pageBg 由 palette 段接走（那句「深色模式可读」的理由本来就在
  迭代记录里）。

### Patch Changes

- 1fd0164: 品牌头/尾图 B、C 重做：去掉人影、加几何碰撞校验。
  
  - **C 从「行囊」改为「远山」**：删掉剪影小人（被两次批「太简陋」），改为三层实心山
    + 一盏灯立在平台上。山的区分靠「画面主导色」：A 纸白亮 / B 暖灰纸暖 / C 夜蓝暗。
  - **B 改为纯线描**（夜蓝细线画在暖灰纸上），与 C 的实心剪影形成**语法对比**，
    不只是底色不同。同色板、同母题（灯 + 地平面 + 山），仍是一套系统。
  - 新增 `assets-src/check-collisions.mjs`：用浏览器 `isPointInFill/isPointInStroke`
    精确判定装饰元素是否压到文字。此前「山脊线穿过副标题」「云带压住 HIPPIE」这类错误
    缩略图看不见、放大 4 倍才看见，靠肉眼漏了 4 次；bbox 相交法又会把「文字在山上方的
    填充山体」误判成碰撞（山的 bbox 是大矩形）。点内判定 + 排除底色矩形后无假阳性。
    退出码非零，可直接当发布前闸门。
  - `lampHead` 的 `halo` 默认值从 true 改为 **false**：光晕是「大面积 + 低透明度暖色填充」，
    深色底必变灰褐（铁律⑩）。浅色底需要时显式传 true。
- 65b8e23: 品牌闸门不再假绿：一个品牌都没找到时标记 `skipped`，并停止说「三方一致」。
  
  **症状**：`check:brands` / `brand doctor` 在「0 个品牌」时印着「✓ 三方一致（真源 ↔ 副本 ↔
  brand.md 自动段）」退出 0。实测触发过一次：`STYLEWX_BRANDS_PATH` 被指到空目录，闸门于是变成
  no-op，而报告看上去是全绿。而且那时它还会顺带报一条「全局组件库里 16 个组件不属于任何品牌」——
  零品牌时这是废话，真正的信号（什么都没检）反而没说出来。
  
  **怎么做**：`BrandCheckReport` / `BrandFixReport` 新增 `skipped`（`brands.length === 0`）；
  CLI 与 `pnpm check:brands` 遇到它改印
  
  ```
  ⚠ 没有找到任何品牌档案：本次什么都没检查。
    如果不是预期，检查 STYLEWX_BRANDS_PATH 是否被指到了别处。
  ```
  
  并且零品牌时不再汇总「游离组件」（那条只在真有品牌时才有意义）。
  退出码不变（CI 机器上没有品牌档案仍算通过——它确实没东西可检）。
  新增两条测试：零品牌时 `skipped=true` 且不报游离汇总；有品牌时 `skipped=false`。
- bd3e695: 新增 `:::search` 推荐搜索组件（发布时自动插入）+ 三处平台限制防线。
  
  与 `:::music` 同族：数据自包含的 `<mp-common-search>`，可离线合成、零交互插入
  （`docs/design/platform-widgets.md` §28）。昵称与头像**不写进 Markdown**，发布时调 `getaccountbasicinfo` 现取
  —— 昵称不一致就是导流到别人的号，且 `qlogo.cn` 头像直链会随换头像失效。
  
  实测拿到两个反直觉的约束，都做成了防线：
  
  - 搜索词限 **16 单位、全角算 2**（汉字最多 8 个 / 英文最多 16 个），**不是**提示文案说的
    「16 个字符」。超限时保存被平台拦、错误只以浮层出现、URL 无 appmsgid，极易误判为「保存坏了」。
    新增 `overlongSearchKeywords()` / `searchKeywordUnits()` 在渲染期报 error。
  - 必须**注入前预替换**，不能注入后再插：占位块后紧邻含 `<svg>` 的尾图，所有
    `execCommand` 二次插入策略都会把块塞进 svg 内部（六种全测）。
  
  顺带修的两处：
  
  - `publish-via-browser.mjs` 把**组件 error 诊断**当发布闸门（此前只看 validation，漏掉诊断），
    且保存后读不到 `appmsgid` 时直接 fail（此前只打印「请确认」，会误报成功）。
  - `theme-previews.ts` 去掉写死的「内置 24 个组件」（会漂）。
- 74c2e87: 尾图统一简化为「纯文字 + 一条强调线」（与 A 同构）。
  
  B、C 的尾图此前各自带一整套图形（B 双山脊线 + 灯 + 受光弧；C 三层山 + 灯 +
  受光弧 + 月亮）。头图已经承担了「画面」的角色，尾图再画一遍场景，两图并排看
  反而互相抢戏。简化后三套尾图的差异只由底色承担（A 纸白 / B 暖灰纸 / C 夜蓝），
  C 保留一枚弦月——夜蓝底上没有月亮不成立，且它远离文字区。
  
  尾图 animate 数 21/23 → 15/15。
- Updated dependencies [42d23b1]
- Updated dependencies [5a626d6]
- Updated dependencies [3f68b60]
- Updated dependencies [41bda5c]
- Updated dependencies [bd3e695]
  - @stylewx/publisher@0.7.0
  - @stylewx/theme@0.7.0
  - @stylewx/core@0.7.0
  - @stylewx/components@0.7.0
  - @stylewx/preview@0.7.0
  - @stylewx/validator@0.7.0

## 0.6.0

### Patch Changes

- @stylewx/components@0.6.0
  - @stylewx/core@0.6.0
  - @stylewx/preview@0.6.0
  - @stylewx/publisher@0.6.0
  - @stylewx/theme@0.6.0
  - @stylewx/validator@0.6.0

## 0.5.0

### Minor Changes

- b71ae67: 编辑器新增四项能力，均为「补齐与主流公众号编辑器的必要差距」：
  
  - **正文图片上传**：本地图经 Chromium 规范化（等比缩放、降质，GIF 不重编）后存入本地资产库，正文可引用；发布时 `relocate` 经 `resolveLocal` 钩子解析回字节并搬运到微信素材库。此前正文只能引用 http(s) 外链。
  - **封面生成**：`renderCoverPng` 按主题色渐变 + 标题 + 品牌角标生成 900×383 封面，替代原先无文字的纯渐变兜底。
  - **深色模式预览**：模拟微信暗色页底，用真实计算样式扫描「深色文字且无任何底色」的元素；新增可选 token `pageBackgroundColor`（白名单 GRAY 档）写进根节点，未设置时不输出，预置主题不受影响。
  - **排版设置面板**：字体/字号/行高/字距/正文色/主色/页面底色；编辑器改为向 API 传递完整主题对象，支持另存为自定义主题。
  
  修复：组件库参数表未初始化、切主题不回填；顶栏结构未闭合导致主内容被吞入；「主题管理」下拉遮挡封面弹层。

### Patch Changes

- Updated dependencies [b71ae67]
  - @stylewx/preview@0.5.0
  - @stylewx/publisher@0.5.0
  - @stylewx/theme@0.5.0
  - @stylewx/components@0.5.0
  - @stylewx/core@0.5.0
  - @stylewx/validator@0.5.0

## 0.4.1

### Patch Changes

- @stylewx/components@0.4.1
  - @stylewx/core@0.4.1
  - @stylewx/preview@0.4.1
  - @stylewx/publisher@0.4.1
  - @stylewx/theme@0.4.1
  - @stylewx/validator@0.4.1

## 0.4.0

### Patch Changes

- @stylewx/components@0.4.0
  - @stylewx/core@0.4.0
  - @stylewx/preview@0.4.0
  - @stylewx/publisher@0.4.0
  - @stylewx/theme@0.4.0
  - @stylewx/validator@0.4.0
