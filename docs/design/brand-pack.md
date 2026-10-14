# 品牌一致性与品牌包（§30–§31）

三处数据一道闸门（`brand doctor`）、`.brand` 包的打包与分发。
品牌体系本身见 [brand-system.md](./brand-system.md)；上层：[设计说明索引](../DESIGN.md)。

## 30. 品牌一致性：三处数据、一道闸门（`brand doctor`）

### 症状：同一份品牌信息写在三处，没有任何东西检查

`brandSave` / `brandApply` 往三个地方写同一份品牌信息：

| 位置 | 角色 | 谁读它 |
| --- | --- | --- |
| `~/.stylewx/brands/<name>/{profile.json,brand.md}` | **唯一真源** | agent（`brand_apply`）与**人**（brand.md） |
| `~/.stylewx/themes.json` | 派生副本 | 编辑器主题下拉 |
| `~/.stylewx/components.json` | 派生副本 | 渲染时的 `:::名字` 解析 |

三处会漂，而且**漂了没有任何东西会报**。实测漂了两处，都是靠人肉发现的：

1. **`brand.md` 的事实是错的。** hippie-youth 的 `brand.md` 里写着
   「C『行囊』…一人背行囊走出灯下」，而 C 在两轮前已经改成「远山」（去掉人影，见 §22.8）。
   **人是照 `brand.md` 理解品牌的** —— 这份文档当时就是错的。
2. **副本根本没同步。** `ink-ledger` 的三个组件从来没进过 `components.json`
   （它是在同步逻辑之前建的档案），编辑器里 `:::ink-quote` 渲染不出来。
   同一个品牌的主题也不在 `themes.json` 里 —— 编辑器下拉里根本选不到它。

### 原因：`brand.md` 一份文件承担了两种内容

`brand.md` 里既有程序能算出来的事实（色板表、字号、组件清单、迭代记录），
也有只有人能写的散文（定位、色彩论证、禁忌背后的理由）。

- 程序**重写整篇** → 抹掉人的散文；
- 程序**不重写** → 事实必然漂（没人会记得手工同步色板表）。

两者都试过，两者都错。这就是漂移的机制：**没有一个「程序负责哪一段、人负责哪一段」的约定**。

### 防线：自动段 + 三方闸门

**① `brand.md` 拆成自动段与人写段**（`packages/service/src/brand-doc.ts`）。

```markdown
## 核心色板

<!-- stylewx:auto palette -->
| 用途 | 色值 |
| --- | --- |
| 主色 primary | `#0A2A6B` |
<!-- /stylewx:auto -->
```

- 自动段 = 程序从 profile 生成，`syncBrandDoc` 只替换段内字节，**段外一字不动**；
- 段缺失时插到**同名小节**下（不是丢到文件末尾，否则段会跟标题脱节）；
- 重复同步幂等（`changed` 第二次为 false）；
- 标记不成对直接报错：漏一个结束标记，后面的散文会被当成段内容吞掉 —— 人写的字就丢了。
  这条在 `brandSave` 里也拦（传进来的 doc 先查成对性）。

**② learnings 只判「缺失」，不判漂移。** 人在文档里会往记录里**续写子级细节**
（实测一条记录带了 5 条补充），而 profile 只存一句话摘要。要求逐字一致会把
「补充细节」变成闸门错误，反而逼人删细节。所以 `STRICT_AUTO_KEYS`（palette / typography /
components / logo）逐字比对，`LOOSE_AUTO_KEYS`（learnings）只查在不在。

**③ 人写段不一致是警告，不是错误。** 定位 / 色彩论证按约定是人写的那份，
人可以在里面补充细节（`profile` 是 agent 读的那份）。不一致时提醒去同步，不拦发布。

**④ `brandDoctor` 只读检查三方**（`brand-doctor.ts`），`brandFix` 只修能从真源重算的东西：

| 检查 | 结论 |
| --- | --- |
| 空目录 / profile 损坏 | error |
| `themes.json` 缺该主题 / 内容不一致 | error（副本漂） |
| `components.json` 缺该组件 / 内容不一致 | error（副本漂） |
| `brand.md` 缺文件 / 自动段漂移或缺失 / 标记不成对 | error |
| 人写段与 profile 不一致 | **warning** |

`--fix` **不碰 `profile.json`**，也不删任何品牌 —— 真源只能由人 / agent 通过
`brand_save` 改。修完再体检一次，剩下的问题原样报出来。

**⑤ 闸门接进 CI**：`pnpm check:brands`（已并入 `pnpm brand:check`）。
退出码非零 = 不一致。CI 机器上没有品牌档案 → doctor 直接跳过，不会误报。

### 踩坑：`JSON.stringify` 比对象相等会误报

doctor 第一版用 `JSON.stringify(a) === JSON.stringify(b)` 比主题副本，结果
**永远修不好**：zod 校验会把对象按 schema 顺序重建，同一份主题经 `saveTheme` 往返一次
键序就变了。表现是「`--fix` 说同步了，体检仍报漂移」—— 闸门自己在制造噪音。
改用键序无关的 canonical 序列化后归零。

**教训**：「两边都是 JSON 所以可以直接 stringify 比」是错的。只要中间过了任何一次
schema 重建 / 键排序，比较就必须先规范化。

### 代价

- 自动段里的内容**改它会被下一次同步覆盖**。要改事实只能改 profile
  （`brand_save` / `brand_learn`）或跑 `--fix`。这必须写进 `brand.md` 顶部的提示里，
  否则人会以为自己改的能留住。
- 人写段的一致性检查是启发式的（判断 profile 文本是否是文档段的子串），
  不覆盖「人在文档里写得更详细但换了措辞」的情形 —— 所以它只是 warning。
- `brand.md` 的迭代记录不再由 `brand_learn` 用正则往标题下塞一行，而是整体重算自动段。
  旧实现遇到「迭代记录」标题被人改过、或标题下已有内容时会插错位置。

### 踩坑：测试隔离不彻底会污染真实用户库

doctor 的第一版测试用 `options` 传隔离路径（`brandDoctor({ dir, file })`）。
但 `brandSave` 内部给品牌组件做校验时，用的是**组件库的默认路径**，不接受选项 ——
于是测试品牌 `tide-notes` 被写进了真实的 `~/.stylewx/themes.json` 与 `components.json`。

修法：测试**统一改用环境变量**（`STYLEWX_BRANDS_PATH` / `STYLEWX_THEMES_PATH` /
`STYLEWX_COMPONENTS_PATH`）全量隔离。这三个变量是这些模块的**唯一**路径入口，
传 options 就一定会漏 —— 凡是「模块内部会间接写别的地方」的场景，隔离必须走进程级配置。

**教训**：判断测试是否真的隔离，不能只看「我传了路径参数」，要看**被测函数会写的每一处**
是否都被覆盖。一个模块内部的校验路径就可能把数据写去别的地方。

### 第四处数据：全局组件库里的「游离组件」

前四处都是「同一份信息写多份」。这是另一种漂：**组件只在一个地方有，而不该只在那里**。

`.brand` 包只带 `profile.components` 里列的组件。所以一个组件如果**在全局库里、却不属于
任何品牌档案**，它就不会随任何包走 —— 本机渲染正常（全局库里有），装到别的环境退化成普通
Markdown。**这种缺失在本机永远看不出来**。

实测就是 `hip-quote`：品牌自己的收尾配方里写着它（迭代记录里那行「canvas(paper) +
hip-head-a + cover + section-title×N + hip-quote + hip-end-a」）、三篇文章都在用，
但它只躺在 `~/.stylewx/components.json`。把包装进干净环境才报：

```
hip-quote | 未知组件「hip-quote」，已按普通 Markdown 渲染其正文。
```

**成因**：组件当时是用 `save_component` 建的（进全局库），而不是通过 `brand_save` 随档案
一起登记。全局库与档案之间没有约束，于是两边都能「看起来正常」。

**判据**：从品牌已有组件名推出命名前缀（`hip-head-a` / `hip-end-a` → `hip-`，
取最长公共前缀、截到连字符），再看全局库里以该前缀开头、却不在档案里的组件。
推不出前缀（组件没有共同前缀）就不猜 —— 宁可不查，也不要把它当成「所有组件都属于这个品牌」。

- 对得上某个品牌前缀 → 报在该品牌名下
- 对不上任何前缀 → 全量体检时汇总报一条（要人来决定归属）
- 归属要看**所有**品牌，不能只看本次要查的那几个（否则别人的组件会被误判成游离）
- 内置组件（`COMPONENT_CATALOG`）永远不算游离 —— 它们不需要任何品牌带

**是警告不是错误**：doctor 无法知道哪篇文章用了它，拦发布是错的。但它是「换环境就坏」的
确定性信号，所以必须报出来。

### 踩坑：自动段是后加的，段外就留了一整套过期副本

`hippie-youth` 的 `brand.md` 有 5 个自动段，每个自动段**后面都又跟了一份旧副本**
（旧色板表 / 旧排版列表 / 旧 CDN logo / 一整份重复的迭代记录）—— 自动段机制是后来才加的，
之前手写的内容留在了段外。`pnpm check:brands` 一直是绿的：它只校验自动段本身，段外不归它管。

这些副本不只是冗余，还有**错的**：段外那份 logo 还指着旧微信 CDN 链接，而档案早已改成
包内相对路径 `assets/logo-a.png`。人读到哪一份是对的？没有依据。

**修法（关键）**：不要逐段删副本 —— 改成**只写人写的内容，让程序重算自动段**。
`brandSave({ doc })` 的 `doc` 可以只给标题与人写段落（不给任何自动段标记），
`syncBrandDoc` 会把每个自动段插到对应标题下面（`## 核心色板` → palette 段……）。
一份 200 行的文件变成 105 行，且以后不会再积副本。

**代价 / 边界**：段外那些**不是**副本的内容会丢，所以必须先分清「副本」与「人后来又写的」。
这次段外有两段是真内容（【三套头尾图重做】与【自我纠错】），保留下来了；
其余逐条比对确认为重复后才删。

### 段外副本的根因：自动段覆盖不全

只有「程序算得出来的东西」能被自动段接走。清单里没列的，人补一行就只能留在段外 ——
**palette 段只列 5 个 token**（primary / text / accent / cardBg / divider）时，
`stylewx-craft` 的第 6 个 token（`pageBackgroundColor`，人写的「| 页底 pageBg | `#F7F9FC` |」）就无处可去。
不修这个，段外永远会有「清理时不知道能不能删」的行。

现在 `brand-doc.ts` 里的 `PALETTE_TOKENS` 跟着主题 schema 的**全部颜色 token** 走（9 个），
并由 `brand-doc.test.ts` 直接拿 `themeTokensSchema` 推出颜色 token 集合来比对 ——
**不是**跟另一份手写清单比，所以漏一个、多一个都红（两边都实测过会红）。

三个品牌都照同一套手法清完了（写「只含人写内容」的 doc → `brandSave` 重算自动段）：
`hippie-youth` 200 → 105 行、`ink-ledger` 87 → 68 行、`stylewx-craft` 95 → 67 行。
段外那点独有事实先折进真源再清：`ink-ledger` 的「头图含 logo」折进组件 `description`
（它原本只存在于段外那一行），`stylewx-craft` 的 pageBg 靠 palette 段自动接走。

`stylewx-craft` 顺手换掉了 CRLF（原文件 45 个 `\r`、行尾混用）。自动段一直是 LF，
段外是 CRLF —— 一个文件两种行尾没必要留着。

## 31. 品牌包（`.brand`）：把品牌发给别人

### 为什么需要

品牌档案是一个**目录**（`~/.stylewx/brands/<name>/`），这是刻意的选择：可提交进 git、
可 diff、`brand.md` 可手改。但目录没法发给别人 —— 所以需要一个**传输形态**。

选 zip 的理由只有三条，但每条都是硬要求：① 一个文件；② 任何系统都能解开
（包坏了一只手也能救出来）；③ Node 生态有成熟纯 JS 实现（`fflate`），
不需要装系统工具。**没有做 DTCG / 设计令牌互操作层** —— 只服务本项目，
多一层映射只会多一处漂移。

### 结构，与那处刻意的文件名不一致

```
hippie-youth-1.2.0.brand          (zip)
├── manifest.json      容器元数据：formatVersion / kind / engine / 文件清单 + sha256
├── brand.json         机器真源
├── brand.md           人的文档（含自动段，逐字节带过来）
├── assets/            只有身份位图：logo-a/b/c.png、cover.png
└── source/            可选，默认不含
```

**包内叫 `brand.json`，磁盘上叫 `profile.json`** —— 同一个东西，两个名字。
这是历史包袱（磁盘上原名 profile.json，改名要动所有既有档案），所以刻意留了不对称，
并在 manifest 里用 `role: "profile"` 标注身份、不靠文件名猜。
`loadBundle` 两个名字都收。

### 判据不写在文件名里

`.brand` 只是**提示**。真正的判据是 manifest 的 `kind` + `formatVersion`。
实测过四种后缀（`.brand` / `.stylewx` / `.zip` / `.txt`）都能正常识别；
反过来，一个改了后缀的普通文本文件会被明确拒绝（`不是有效的 zip 容器`），
而不是装出一个半成品。

`engine` 字段（semver range）存在的理由：老编辑器要能**明确说「读不了」**，
而不是悄悄漏掉字段。实测 `>=99.0.0` 的包会报「这个包要求 stylewx >=99.0.0，
当前是 0.6.0，读不了」。

### 为什么 `source/` 默认不进包

「把品牌发给别人用」和「把品牌的源文件交接给同事改」是两个场景。默认带源码会让包变大，
也会把不该给的东西（生成脚本、试验产物）一起给出去。要交接就显式 `--with-source`。
**把两个场景混成一个开关，最后一定是两个都做不好。**

### 三条资产规则（含安全）

1. **`logo` / `coverImage` 从 URL 改成包内相对路径。** 新增
   `attachBrandAssets` 把 `assets-src/motion/` 里的图片落进品牌目录 `assets/`，
   并把 profile 的路径改过来（约定文件名 `logo-a/b/c.png` / `cover.png`）。
2. **导入时拒绝一切远程 URL 资产**，路径不许出现 `../`、不许绝对路径。
   否则一个包就能让导入方去请求任意地址。实测：改成 `https://evil.example.com/steal.png`
   的包被拒（`logo 是远程 URL`），改成 `../../../../etc/passwd` 的被拒（`试图跳出包外`）。
   校验时把 sha256 一并改掉，确保拦的是**路径规则本身**，不是 sha 兜底。
3. **微信素材库的 CDN 链接不进 profile。** 发布得到的链接记
   `.published.json`（`writePublishedAssets`）。否则重新打包会把**上一个账号**的
   CDN 链接发给别人 —— 这是「账号数据泄漏」，不是格式问题。

`assets` 这个键有历史包袱：早先被 agent 当「资产说明」的自由文本用过
（`motionSource` / `generator` / `plans`）。这些键**原样保留**（不丢旧内容），
机器可读的路径放 `assets.files`。**不要**再往 `assets` 里塞第三种语义。

### 三条重名规则（重点是幂等）

| 情形 | 处理 |
| --- | --- |
| 组件撞名（对方已有同名组件） | 加品牌后缀 `x--<brand>`，原名记进 profile 的 `renamedFrom` |
| 品牌名撞名（**不同来源**都叫 hippie-youth） | 加数字后缀 `hippie-youth-2`；侧车 `.origin.json` 记 `origin` |
| 同一品牌再次导入（`name` + `origin` 一致） | **升级**：原地替换，不追加后缀 |

**规则 3 是这套设计的关键。** 没有它，反复导入会攒出 `-2 -3 -4`；
有了它，导入是幂等的（实测连导三次：`false / true / true`，品牌目录始终只有一个）。

**规则 2 绝不无声覆盖**：品牌档案里有人写的散文与迭代记录，覆盖就是丢内容。
所以是「加后缀并存」，由人来决定去留（与草稿箱纪律同一条原则，见 §29）。

顺带修掉一个洞：导入路径**不再沿用 `brandApply` 的无条件覆盖** ——
`brandApply` 会把品牌组件直接写进全局 `components.json`，导入别人的品牌就可能悄悄
覆盖你自己的同名组件。现在导入走后缀规则，并且实测确认「我自己的组件没被覆盖」。

### 踩坑

1. **改过 profile 的事实后必须同步 `brand.md` 的自动段。** attach 改了 `logo`、
   安装时组件改了名，`brand.md` 里还是旧值 → `brand doctor` 立刻报漂移。
   两个地方都要显式 `syncBrandDoc`（实测各撞过一次）。
2. **升级时不能用「包里原名」去查已有组件。** `renamedFrom` 是 `新名 → 原名`，
   直接拿原名查永远查不到 → 每次导入都再套一层后缀（`x--brand-2`）。
   要**按原名建索引**（反转一次）才对得上。
3. **`attachBrandAssets` 重建 `assets.files` 而不是合并。** 合并会攒出重复键
   （实测 `logo` 与 `logo-a` 同时存在 —— 角色名与文件名两套命名混用）。
   两份名字指向同一个文件，没人知道该信哪个。
4. **`assets.files` 的两套命名不要再扩散。** 现在只有 attach 写它（角色名），
   `packBrand` 只校验「指向的文件真在包里」，不再另写一份 basename 键。
5. **测试里不能 `expect(fn).toThrow(/x/)`。** service 抛的是结构化对象
   `{ error: { code, message, hint } }`，不是 `Error` 实例，vitest 拿不到 message，
   断言永远失败（而且失败信息是空的，很容易误判成「代码没抛」）。
   封装 `expectServiceError` 读 `error.message + hint`。
6. **「能点数的事实」不要在文案里写死。** banner 上曾写「22 工具 · 22 组件」，
   实际早已是 28 / 26。现在 `gen-brand-assets.mjs` 直接数 `registerTool(` 的次数、
   读 `COMPONENT_CATALOG` 与 `PRESET_THEMES`（铁律② 的同一个道理）。

### 踩坑（发布通路）

P1 把 `coverImage` 从 CDN 直链改成包内相对路径后，**发布在封面这一步炸了**：

- 正文图片早就走 relocate 的 `resolveLocal` 钩子，封面走的却是另一条路
  （`resolveThumbMediaId` → `client.downloadImage`，无条件当 URL 去 HTTP）。
  实测：`downloadImage 收到: assets/cover.png`。同一个仓库里两处图片解析、两套规则。
- **根除**（不是给调用方打补丁）：把解析器收到 `@stylewx/service` 的 `resolveLocalImage`，
  正文与封面**共用同一个钩子**；编辑器端点、MCP `publish_draft`、REST `/drafts`
  三处都传它（之前编辑器传了、MCP 与 REST 没传）。
- **相对路径必须有基准，没有就拒**。`assets/cover.png` 在不同进程的工作目录下指向不同文件，
  静默猜错比报错贵。基准是品牌名，所以 `publish_draft` / `/drafts` 新增 `brand` 参数；
  缺基准时报的是「没有给出解析基准」而不是伪装成网络失败的下载错误。
- **不在 publisher 里再写一份「品牌相对路径」正则**：`publisher` 被 `service` 依赖，
  反向引用会成环。所以 publisher 只判「是不是 http(s)」——它本来的职责，
  「能不能读成字节」全交给 `resolveLocal`。分类的事只有一处（service）。
- 测试守两件事：**封面字节不经过 HTTP 路径**（断言没有对 `cover.png` 发过请求），
  以及**缺基准时明确报错**。

教训：**同一个概念（「本地图片引用」）存在两份实现时，改一处必定漏另一处。**
要么合并成一个（这里做的），要么给两处共存一个闸门。光靠「我记得还有一处」不叫防线。

### 打包前的自包含预检：游离组件只警告、不拦

`.brand` 只带 `profile.components` 里列的组件，所以「装到别的环境能不能跑」实际等于
「组件是不是全在档案里」。游离组件（见 §30 末）本机渲染完全正常，只有换环境才暴露 ——
那正是这个包要避免的事，而**导出的人正是要把它发给别人的那个**，所以 `packBrand` 在打之前必须说一句。

实现上走 `scanOrphanComponents`（`brand-doctor.ts`）—— 与 doctor **共用同一套前缀规则**，
不在这里另写一份（两处各写一份「这个名字是不是这个品牌的」，迟早会分叉成两种答案）。
结果从 `PackResult.warnings` 回给调用方：CLI 每条打成 `! …`，编辑器导出后显示在品牌面板的提示区，
REST `/brands/export` 原样返回。

**只警告、不拦**：无法知道哪篇文章用了它，拦下打包只会让人连档案都交不出去。
但它是个「换环境就坏」的确定性信号，不能静静打完就完事。
**边界**：前缀推不出来（档案里的组件不足 2 个、或没有共同前缀）就不查也不报 —— 不猜、不误报。

### 代价

- 包内是 **zip，不是可 diff 的目录**。要 diff 得先解开；这是「能发出去」的必然代价。
- `engine` 需要人工维护（现在默认取打包时的 stylewx 版本）。写得过高会拦住能用的人，
  写得过低会让老编辑器在运行时才炸 —— 默认值刻意保守（等于打包版本）。
- sha256 只保证**传输完整**（包没被改坏），**不是签名**。包是谁发的、可不可信，
  这套机制不作回答；`origin` 只是认亲标签，不是身份认证。
