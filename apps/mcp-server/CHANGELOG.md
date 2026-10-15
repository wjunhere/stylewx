# @stylewx/mcp-server

## 0.7.1

### Patch Changes

- 8ab8a0c: `brand_attach_assets` 的 `from` 参数说明改为指向工作区（`<工作区>/brand/motion`）；
  `search` / `music` 组件的工具文案与注释里的示例换成中性示例（不再写真实号名 / 文章名 / 曲名）。
  
  品牌图源（头/尾图、logo）不再住在仓库里：私人产物（文章 / 品牌图源 / `.env` / 本机产物 /
  探针夹具里的账号数据）一律放 `STYLEWX_WORKSPACE`（默认与仓库同级 `../stylewx-workspace`），
  路径统一从 `assets-src/paths.mjs` 解析。仓库侧新增路径级闸门 `pnpm check:private`
  （详见 docs/design/repo-hygiene.md §34）。
- Updated dependencies [8ab8a0c]
  - @stylewx/components@0.7.1
  - @stylewx/core@0.7.1
  - @stylewx/preview@0.7.1
  - @stylewx/service@0.7.1
  - @stylewx/publisher@0.7.1
  - @stylewx/theme@0.7.1
  - @stylewx/validator@0.7.1

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
- 5a626d6: 10 套社区流行样式、表格 block、tech-minimal 换掉默认科技蓝、三个组件重做。
  
  ## 10 套社区样式（编辑器里可挑）
  
  GitHub 文档、GitHub 深色、Tailwind `prose`、Water.css、new.css、Sakura、Pico、LaTeX 论文、
  Tufte 长文、doocs/md「优雅」。**按各自上游的原值实现**（颜色/字号/边框/表格线都取自源头，
  只把无法内联表达的部分换成等价写法）—— 一旦掺我们的配方，十套都会变成「我们那套默认 + 换个色」，
  挑主题时的参照作用就没了。出处与许可（九个 MIT + doocs WTFPL）逐套写在 `community-presets.ts` 文件头。
  
  三处刻意的偏离：正文字距统一 0.04em（中文更耐读）；不用 `box-shadow` / 渐变（GRAY 档与白名单外属性）；
  纯黑 `#000` 换成近黑（实测微信会把 `color: #000000` 整条吞掉）。
  搬不过来的两处写在文档里而不是硬凑：Tailwind 的反引号（伪元素）、Water.css 的斑马纹与 Tufte 的旁注
  （需要 `tr` / 旁注定位）。
  
  ## 表格 block
  
  `table` / `th` / `td` 补上了（`EXTRA_BLOCK_NAMES`，**可选**）：判据是「默认基线里有的就是可选」——
  自建主题（默认基线、6 套原创、10 套社区）都带表格，而 `wemd-presets.ts` 那 20 套是生成文件，
  把它们算成必需会让整批红掉，不设只是回到旧行为。表头底色也做成可选（`Palette.tableHeadBg`）：
  GitHub / Tailwind 的表头本来就没底色。默认样式三线或全框都能表达，不需要新机制。
  
  ## tech-minimal：换掉 `#0b6bff`
  
  那个蓝正是 SKILL 里「被用烂清单」点名的那一支，一个仓库不该一边教 agent 别用默认科技蓝、
  一边把它当默认主题。新配色是石板灰墨 + 工程绿 `#047857`（取自 ui-ux-pro-max 给「developer tool
  文档站」的推荐，但把强调色的明度压到 700 档：推荐里的 `#22C55E` 在白底上对比度约 2.2:1，
  当文字色不合格）。代码块走深色底（石板 800 + 亮灰字）；标题不再各加一条竖线。
  `dark-code` 顺手补上 `pageBackgroundColor` —— 深色整页主题没有页底时，白底上的暗色字不可读。
  
  ## 三个组件重做（card / callout / quote）
  
  三者原来都是「同款浅底 + 左色条 + 圆角」，读者分不出哪块是强调、哪块是容器。现在按语义分成三种形状：
  
  - **card** = 有边界的**容器**：四面细边框 + 圆角 + 标题下一条发丝线，`tone` 只染标题前的小竖条。
  - **callout** = 贴着左线的**提示**：4px 色线 + 浅底 + 只在右侧收圆角，没有外框。
  - **quote** = **引文**：没有盒子也没有底 —— 大引号 + 正文 + 落款上方一条发丝线。
  
  ## 其它
  
  - `renderMarkdownToHtml` 的默认配色（未传主题时）跟随 tech-minimal 一起换。
  - 预置主题从 26 套变 36 套，品牌 banner 上的数字由代码算出（`pnpm brand:assets` 已重新生成）。
  - `docs/assets/theme-library.png` 重截；`capture-theme-library.mjs` 修掉「固定等 2800ms + 只截弹层」，
    改成等预览真的渲染完 + 截整个视口（含页脚版本号）。
  - 新增 `packages/service/scripts/theme-sheet.mjs`：多套主题并排的对比图（挑主题用）。

### Patch Changes

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
- 85d0905: 发布脚本：账号信息改从登录页面读（不再依赖 API），且替换失败硬失败。
  
  `getaccountbasicinfo` 需要 access_token，而取 token 要求调用方 IP 在白名单内；
  出口 IP 一漂（本机 2026-10-13 就掉了一次，`errcode 40164`），取账号信息抛错
  被 `catch` 静默吞掉，**带死占位块的稿子照样"保存成功"** —— 稿子看着发出去了，
  读者端推荐搜索是坏的。
  
  三处修正：
  
  1. 昵称/头像改为**优先从已登录的后台页面读**（`.acount_box-nickname` /
     `.weui-desktop-account__thumb`），与保存同一信任边界，不受白名单影响；API 降为兜底。
     实测页面给的 `wx.qlogo.cn/mmopen/<hash>/64` 与 API 的 `…/n/<hash>/64` 都可用
     （编辑器 shadow DOM 里头像 `naturalWidth = 64`）。
  2. 三处**硬失败**替代静默降级：取不到账号信息、解析不出关键词、替换数为 0 —— 一律中止发布。
  3. 新增 `verify-drafts.mjs`：发布后读回草稿体检（头尾同字母 / SVG·animate 存活 /
     搜索真标签在尾图之前且昵称·头像·关键词齐全 / 音乐标签 / 封面）。
- Updated dependencies [1fd0164]
- Updated dependencies [42d23b1]
- Updated dependencies [42d23b1]
- Updated dependencies [65b8e23]
- Updated dependencies [6bdcf91]
- Updated dependencies [5a626d6]
- Updated dependencies [3f68b60]
- Updated dependencies [41bda5c]
- Updated dependencies [bd3e695]
- Updated dependencies [74c2e87]
  - @stylewx/service@0.7.0
  - @stylewx/publisher@0.7.0
  - @stylewx/theme@0.7.0
  - @stylewx/core@0.7.0
  - @stylewx/components@0.7.0
  - @stylewx/preview@0.7.0
  - @stylewx/validator@0.7.0

## 0.6.0

### Minor Changes

- d0a600f: 编辑器全元素改版（柔结构 Soft Structuralism）：六令牌与色系不变。
  
  - 新材质层：面层级 `--plane-1..4`、柔影三档 `--lift-1/2/3`（分层改为「发丝线管边界 + 柔影管纵深」，
    `check-editor.mjs` 的投影断言同步改为「必须存在、至少两层、从令牌混出」）、输入控件凹槽材质、
    自定义缓动 `--ease`、五档字号阶、圆角档 8/12/18。
  - 主题管理面板重构：分节卡片 + 自绘滑杆 + 色块行 + 粘底动作条；已保存主题列表改为可点击的行卡片
    （色板 + 当前标记，点击即切换）。
  - 七个弹窗统一规格（标题 + 副标题 + 圆形关闭钮 + 凹槽输入 + 遮罩轻模糊 + 入场动画），
    下拉/弹窗/toast 全部改为 transform/opacity 动画（respect prefers-reduced-motion）。
  - 图标归一：撤销/重做/新建/关闭的裸文本字形换成内联 SVG，30 个图标线宽按有效线宽统一。
  - 新增 `packages/preview/scripts/ui-shots.mjs`：19 个界面面批量截图，改前后逐面对比。
  
  另外新增 Mermaid 图功能（`:::mermaid` + 工具栏「Mermaid 图」下拉）：
  
  - 十种图型模板（流程/时序/类/甘特/思维导图/饼/状态/ER/时间线/用户旅程），渲染在服务端
    Chromium 里跑官方 mermaid 出 2x PNG（node_modules 注入，无 CDN），落本地资产库，
    发布时搬微信素材库 —— SVG 原样发微信会因 id 剥离而裂图，必须走图片。
  - 顺带修复两个既有发布 bug（真实微信实测发现）：
    1. `relocate.ts` 递归漏传 `resolveLocal`，嵌套 section 里的正文图片发布时全部搬运失败；
    2. `client.uploadMaterial` 的 multipart 结束 boundary 前缺 CRLF，微信文件嗅探报
       40113 unsupported file type（图片/封面上传偶发失败的根源）。
  - 新增 `apps/mcp-server/scripts/probe-mermaid-wechat.mjs` 真实链路探针（draft/add → get 回读）。
  - `@stylewx/preview` 新增依赖 mermaid@^11。
  
  编辑器「另存为」重构：
  
  - 弃用 `window.prompt`（会被浏览器静默禁用），改为编辑器自有弹窗：文件名 +
    目录浏览（面包屑 / 上一级 / 新建文件夹 / 点选已有文件名）。
  - 写入范围从单一文章根目录放宽为 `writeRoots()`（文章根 + 用户主目录，
    可用 `STYLEWX_WRITE_ROOTS` 追加），可像文件管理器一样逐层浏览选位置；
    系统位置仍在白名单外（本地 HTTP 服务的 CSRF 防线）。
  - 新增端点 `GET /editor/api/list-dir`、`POST /editor/api/make-dir`。

### Patch Changes

- @stylewx/components@0.6.0
  - @stylewx/core@0.6.0
  - @stylewx/preview@0.6.0
  - @stylewx/publisher@0.6.0
  - @stylewx/service@0.6.0
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
  - @stylewx/service@0.5.0
  - @stylewx/preview@0.5.0
  - @stylewx/publisher@0.5.0
  - @stylewx/theme@0.5.0
  - @stylewx/components@0.5.0
  - @stylewx/core@0.5.0
  - @stylewx/validator@0.5.0

## 0.4.1

### Patch Changes

- 修复 `initialize` 握手返回的版本号一直停留在 `0.1.0`。
  
  `SERVER_VERSION` 是硬编码常量，从首个版本起就没跟过 `package.json`。
  MCP 客户端把 `serverInfo.version` 显示给用户，所以每个装了 stylewx 的人
  看到的都是 `0.1.0`（0.2.0 / 0.3.0 / 0.4.0 三个版本都受影响）。
  
  改为从包元数据读取，并新增回归测试：握手返回的版本必须与 `package.json` 一致，
  版本升级忘记同步时会直接失败。
- @stylewx/components@0.4.1
  - @stylewx/core@0.4.1
  - @stylewx/publisher@0.4.1
  - @stylewx/service@0.4.1
  - @stylewx/theme@0.4.1
  - @stylewx/validator@0.4.1

## 0.4.0

### Minor Changes

- 品牌体系（方向 B · 协议 Protocol）落地到编辑器界面。
  
  - **六令牌建立**：`editor.html` 顶部 16 个变量收敛为六个（`--bg` / `--surface` / `--fg` /
    `--muted` / `--border` / `--accent`），派生色只从它们混出来。原来的 `--panel` / `--line` /
    `--ink` / `--brand` 等旧名保留为**兼容别名**（映射到新令牌），所以 `renderEditor` 注入的
    片段与既有自定义组件不受影响。
  - **分层改发丝线**：取消全部投影（`--shadow` / `--shadow-lg` → `none`），改由 1px 描边撑住
    边界。白面与纸底的明度差只有 1.6%，描边不能删也不能调浅。
  - **按钮分工**：新增 `.btn.ink` 承担编辑动作（新建文章、弹层确认等），实底蓝收敛到唯一一处
    「发布草稿箱」。
  - **标志**：新增 `apps/mcp-server/icon.svg`（校验帧 + 端点，16px 简化版），侧栏方形「M」
    替换为母题；favicon 内联为同一形状（`/editor` 是独立页面，不能依赖相对路径）。
  - **校验条重构**：原本直接铺开的 N 条诊断改为「结论 + 统计」胶囊常驻、明细可折叠；
    每条明细带判定词，颜色不再独立承载语义。
  - **修复**：
    - `.ai-*` 系列引用了从未定义的 `--blue`，实际渲染成继承色；
    - `.btn.ink` 与 `.btn:disabled` 同权重，导致禁用态仍渲染成实底、看起来可点；
    - 「灰档」一词被误用于非 CSS 属性的普通警告（如 `image-count-zero`），
      现仅 `css-property-gray` 使用该词，其余显示为「警告」。
  - **品牌资产与校验**：新增 logo 四态、1280×420 与 640×200 两档 banner（SVG 源 + PNG 2x）、
    对比度核对脚本（21 项，含令牌漂移检查）与编辑器回归检查脚本；CI 增加 `pnpm brand:check`。
    新增 `pnpm brand:assets` / `brand:contrast` / `brand:check` 三个脚本。
  
  完整说明见 `docs/DESIGN.md` 第 21 节与 `README.md`「维护品牌资产」。

### Patch Changes

- @stylewx/components@0.4.0
  - @stylewx/core@0.4.0
  - @stylewx/publisher@0.4.0
  - @stylewx/service@0.4.0
  - @stylewx/theme@0.4.0
  - @stylewx/validator@0.4.0
