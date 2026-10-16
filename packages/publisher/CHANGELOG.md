# @stylewx/publisher

## 0.7.2

No changes in this release.

## 0.7.1

No changes in this release.

## 0.7.0

### Patch Changes

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
- 41bda5c: 新增 `:::music` 音乐占位组件：发布时**自动插入**微信原生播放器（无需人工）。
  
  与 `:::video` 相反 —— 音乐不需要人工点。实测（`docs/design/platform-widgets.md` §26）：把旧草稿
  `draft/get` 里的 `<mp-common-clmusic …>` 标签直接 `insertHTML`，编辑器完整保留；
  保存后再读回仍完整。两条插入路径：`source`（原样标签，首选）/ `clue`（关键词搜索）。
  
  两个组合性修复（同一个根因，铁律⑨）：
  
  - `injectMarker` 改用引号感知扫描找开标签结尾。此前用 `indexOf('>')`，而 `escapeAttr`
    刻意不转义 `>`，属性值里出现裸 `>` 时开标签会被提前截断，把后续属性写进那个属性的值里
    —— 渲染产物里会多出一段可见的垃圾文本。音乐组件第一次把整段 HTML 当属性值存才踩到。
  - `@stylewx/publisher` 新增 `stripHtmlTags()` 并在 `computeDigest` 使用。此前的
    `/<[^>]+>/g` 会被属性里的 `>` 骗到，把标签文本当正文写进文章摘要。

## 0.6.0

No changes in this release.

## 0.5.0

### Minor Changes

- b71ae67: 编辑器新增四项能力，均为「补齐与主流公众号编辑器的必要差距」：
  
  - **正文图片上传**：本地图经 Chromium 规范化（等比缩放、降质，GIF 不重编）后存入本地资产库，正文可引用；发布时 `relocate` 经 `resolveLocal` 钩子解析回字节并搬运到微信素材库。此前正文只能引用 http(s) 外链。
  - **封面生成**：`renderCoverPng` 按主题色渐变 + 标题 + 品牌角标生成 900×383 封面，替代原先无文字的纯渐变兜底。
  - **深色模式预览**：模拟微信暗色页底，用真实计算样式扫描「深色文字且无任何底色」的元素；新增可选 token `pageBackgroundColor`（白名单 GRAY 档）写进根节点，未设置时不输出，预置主题不受影响。
  - **排版设置面板**：字体/字号/行高/字距/正文色/主色/页面底色；编辑器改为向 API 传递完整主题对象，支持另存为自定义主题。
  
  修复：组件库参数表未初始化、切主题不回填；顶栏结构未闭合导致主内容被吞入；「主题管理」下拉遮挡封面弹层。

## 0.4.1

No changes in this release.

## 0.4.0

No changes in this release.
