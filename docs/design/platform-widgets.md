# 平台组件（§26–§28）

音乐、推荐搜索（两者数据自包含，可自动插入）、以及「哪些平台组件不该做」的判据。
发布脚本与草稿箱见 [publishing.md](./publishing.md)；上层：[设计说明索引](../DESIGN.md)。

## 26. 音乐组件（:::music）

**结论先说：音乐**能**全自动插入，视频不能。** 这对曾经的判断是个反转——早先只看 API 侧，
以为音频和视频同属「微信不让写、只能人工点」的一类。

### 实测（2026-10-12，探针 `apps/mcp-server/scripts/probe-wechat-music.mjs --stage <picker|inject|survive|search>`）

| 步骤 | 结果 |
| --- | --- |
| 把旧草稿 `draft/get` 里的 `<mp-common-clmusic …>` 直接 `insertHTML` | **完整存活**，属性一字不差；编辑器只加了 `contenteditable="false"` |
| 保存为草稿 → 再 `draft/get` 读回 | **仍完整存活**；编辑器另补 `<mp-style-type data-value="3">`（音频块标记） |

对比视频：`<mpvideo>` 虽存活但读者端渲染成 0×0，`<iframe class="video_iframe">` 直接被删，
所以视频只能人工点（§20.10）。**音乐没有这个问题。**

### 为什么音乐能自动：标签即数据

微信原生音乐播放器就是一个自定义元素，所有信息都在属性上，不需要额外接口：

```html
<mp-common-clmusic data-pluginname="insertaudio" singer="惘闻" music_name="焦虑抑制剂"
  duration="530000" listenid="78221540362775072" albumurl="…" …></mp-common-clmusic>
```

属性在，播放器就在。所以「从旧草稿里抄一个标签、原样复刻」是零风险路径。

### 两条插入路径

`:::music` 渲染成一个占位块，并写入 `data-swx-music-*` 标记；发布脚本
（`publish-via-browser.mjs`，**自动执行，无需 flag**）见到占位块就按标记二选一：

1. **`source` 有值**（从旧草稿 `draft/get` 抄来的 `<mp-common-clmusic>` 标签）→ 直接复刻。
   零交互、最稳，**首选**。这些三篇文章走的都是这条。
2. **只有 `clue`**（歌手 + 歌名）→ 开「音频 → 音乐」弹窗，搜索后按歌名精确选中 → 插入。
   新曲目用这条。

### 三个踩坑

- **搜索必须显式点放大镜按钮。** 只往输入框里填值不会触发查询——实测等 9 秒也不发请求
  （不是防抖太慢，是压根没绑 input 事件）。必须找到 `.weui-desktop-search__btn` 点一下。
- **「音频」入口是 dropdown，不是直接弹窗。** 它下面还有「音频 / 音乐」两项，
  要展开后点 `.js_insertmusic`。直接点 `#audio_music_plugin_btn` 什么都不会发生。
- **占位块上不能跨调用打临时标记。** 第一版实现用 `setAttribute('data-swx-music-picked','1')`
  标记「处理中」，下一次 evaluate 再查——**查不到**：ProseMirror 会按自己的文档模型重渲染 DOM，
  手加的属性被抹掉。所以「定位 → 插入 → 删占位块」必须在**同一次 evaluate 里原子完成**，
  标签也从 DOM 属性里现取，不要跨调用传递。

### 边界

- 组件**不写** `position` / `filter`（白名单 BANNED 档），图标用内联 SVG 而非 emoji 字体。
- 属性值含大量双引号，写进 Markdown 时 `source='…'` 用单引号 —— 参数解析器
  （`packages/components/src/parse.ts` 的 `parseProps`）本来就支持单引号值。
- 只支持微信曲库里的曲目（弹窗搜得到才行），不能给一个任意音频 URL。

## 27. 平台内建组件盘点（哪些该纳入、哪些不该）

**目的**：拿一份「平台有什么」的事实清单，跟 stylewx 现有组件做差集，避免凭印象猜。
实测清单（`probe-wechat-toolbar.mjs`，2026-10-12，17 个一级项）：

```
图片(下拉:本地上传/图片库/扫码/AI配图)  视频          音频(下拉:音频/音乐)  超链接
小程序        模板          投票          搜索          地理位置
视频号        账号名片       问答          礼物
收入变现(广告/带货/小店)     更多          自定义工具栏
```

### 判据：决定能否自动化的不是「功能」，是「数据在不在自己身上」

音乐组件那次踩出来的判据（§26），推广到全部平台组件后非常好用 ——
**插入后落地的是不是自包含的自定义元素（数据在属性上）**：

| 类别 | 特征 | 能否自动化 |
| --- | --- | --- |
| **A. 自包含型** | 落地 `<mp-common-*>`，数据以属性形式带在自己身上 | ✅ 标签可离线合成，零交互插入 |
| **B. 查库型** | 要先按名称**往返搜索平台实体**再选一个（对象 id / appid 在白名单里） | ❌ 只能浏览器驱动 + 人工确认 |
| **C. 平台状态型** | 指向一个平台侧在变的状态（视频、直播、带货库存） | ❌ 快照必然漂移，且多需资质/过审 |
| **D. 本地图片型** | 本质是图片，微信只收自己的 `mmbiz` 链接 | ❌ 得先传素材库（我们已用「外链自动搬运」解决） |

### 已实测的结论

| 平台组件 | 落地标记 | 数据位置 | 判据 | 纳入？ |
| --- | --- | --- | --- | --- |
| 音乐 | `<mp-common-clmusic>` | 属性（歌名/歌手/listenid） | **保存后存活**（已验证） | ✅ 已做 `:::music`（自动） |
| 推荐搜索 | `<mp-common-search>` | `data-nickname`/`data-headimg`/`data-keywords`(URL 编码 JSON) | **保存后存活**（已验证） | ✅ 已做 `:::search`（自动，见 §28）|
| 账号名片 | 搜索账号 → 选人 | 平台实体 | B 型 | ❌ 只做 CTA（`:::end-card`） |
| 超链接 | 搜索账号/文章 → 选一个 | 平台实体 | B 型 | ❌ Markdown 链接已够 |
| 问答 | 搜索账号或问题 | 平台实体 | B 型 | ❌ |
| 投票 | 需配置表单 + 服务端记录 | 平台实体 | B/C 型 | ❌ 且正文互动一律不碰 |
| 地理位置 | 需 POI 库搜索 | 平台实体 | B 型 | ❌ 对文艺随笔零收益 |
| 视频号 | 需已发布且公开的视频 | 平台状态 | C 型 | ❌ 且需授权 |
| 礼物 | 需商品/资质 | 平台状态 | C 型 | ❌ |
| 小程序 | 需 appid 白名单 | 平台实体 | B 型 | ❌ |
| 模板 / 收入变现 | 平台业务非排版 | — | — | ❌ |
| 图片（AI 配图等） | 本质字节 | 微信素材库 | D 型 | ✅ 封面已做；正文图已有 `image`/`gallery` |

**关键区分：谁该拥有这个组件的「配置」？**

- 标签是**渲染指令**（样式、数据内联、离线可算）→ 属于 Markdown 源，能给 agent 用。音乐、推荐搜索属这类。
- 要求**平台对象引用**（id / appid / POI / 商品）→ 属于平台运行时，**塞进 Markdown 会让 agent 生成幻觉引用**。
  这是「不该纳入」的核心原因，不是技术做不到。

### 推荐搜索：已实现，见 §28

`<mp-common-search>` 已验证存活（`probe-wechat-widget-survival.mjs`），数据自包含：

```html
<mp-common-search data-pluginname="insertsearch" data-nickname="Hippie 青年"
  data-headimg="https://wx.qlogo.cn/…" data-keywords="%5B%7B%22label%22%3A%22…%22%7D%5D"></mp-common-search>
```

**当时记下三条顾虑，做完后发现只有一条是真的**（值得留档，因为误判也会误导后来者）：

| 当时的顾虑 | 实测结论 |
| --- | --- |
| `data-headimg` 会过期，除非发布时现取 | ✅ **成立** → 已用 `getaccountbasicinfo` 现取 |
| `data-nickname` 与真实号名不一致，照抄有风险 | ❌ **不成立** —— 微信自己会规范化：写 `Hippie 青年`，存下来是 `Hippie&nbsp;青年` |
| 价值场景窄 | ❌ 由使用者判断，不该由实现者替决定 |

放置位置：读者端唯一带点击交互的组件（`custom_select_card`，点击弹搜一搜；
`:::reveal` 是 SMIL 不是链接），所以放**文末**（`hip-end-a` 之前），不能放头图之后。

### 不该做的结论（避免后来者重复劳动）

- 别为 `视频` / `视频号` / `直播` 写自动化：§20.10 已证明没有可用数据源。
- 别把 `投票` / `问答` / `礼物` / `地理位置` 做成组件：散在 Markdown 里既杂乱，又与
  「微信端只假设有内联 SVG + SMIL」这条基本约束冲突（它们都要运行时对象）。
- 别把平台组件当「功能列表」抄过来 —— 抄过来的是**耦合**，不是能力。

## 28. 推荐搜索组件（:::search）

**为什么做**：`mp-common-search` 与音乐同族（§27 的 A 类：数据自包含），是平台组件里
唯一对**读者端**有价值、且能自动化的那个 —— 它在读者端是**唯一带点击交互**的组件
（外层 `custom_select_card`，点击唤起搜一搜）。

### 数据全在属性上，可离线合成

```html
<mp-common-search data-pluginname="insertsearch" data-nickname="Hippie 青年"
  data-headimg="http://wx.qlogo.cn/mmhead/…"
  data-keywords="%5B%7B%22label%22%3A%22…%22%7D%5D"></mp-common-search>
```

实测（`probe-wechat-search-widget.mjs --stage synth`）：用 API 权威数据离线合成 → 保存 →
`draft/get` 读回**完整存活**。

### 三个踩坑（每个都值得记）

**① 昵称/头像必须发布时现取，不能写进 Markdown。**
别名不一致就是导流到别人的号；`qlogo.cn` 头像直链会随换头像失效。权威来源是
`getaccountbasicinfo`（返回 `nickname` + `head_image_info.head_image_url`）。
所以组件**故意不落**这两个字段，只落关键词 + 占位标记，发布脚本现取。

顺带纠正一条早期误判：原先担心「`data-nickname` 与真实号名不一致、不能照抄」——
实测**微信自己**会把朴素名规范化（`Hippie 青年` → `Hippie&nbsp;青年`），写朴素名即可。

**② 关键词限制是「16 单位、全角算 2」，不是提示文案说的「16 个字符」。**

| 关键词 | 字数 | 结果 |
| --- | --- | --- |
| 好好吃饭 | 4 汉字 | ✅ |
| 我的所有还有意义 | 8 汉字（16 单位） | ✅ |
| 我的所有还有意义吗 | 9 汉字（18 单位） | ❌ |
| abcdefghijklmnop | 16 ASCII | ✅ |
| abcdefghijklmnopq | 17 ASCII | ❌ |

即**汉字最多 8 个 / 英文最多 16 个**，逐词判定。矩阵实测：`probe-search-keyword-limit.mjs`。
超限时保存被平台拦下，错误**只以浮层出现**、URL 里没有 `appmsgid` ——
第一次遇到会当成「保存坏了」，实际是校验没过。

两道防线：`overlongSearchKeywords()` 在渲染期报 **error** 诊断；
`publish-via-browser.mjs` 把组件 error 诊断当**发布闸门**（此前只看 `validation`，
不看 `diagnostics`，所以会漏）；保存后读不到 `appmsgid` 时**直接 fail** 而不是
只打印「请确认」—— 那次就是靠这条发现的。

**③ 必须「注入前预替换」，不能「注入后再插」—— 否则块会落进尾图的 SVG 内部。**
占位块后面紧邻 `hip-end-a`（含内联 `<svg>`）。实测**所有**走
`execCommand('insertHTML')` 的落点策略（`setStartAfter` / `setStartBefore` /
`selectNode` / 插到文档末尾，六种）都会把搜索块塞进 `svg` 里，尾图被破坏。
判据 `mp-common-search`.closest('svg') !== null。策略矩阵：`probe-search-position.mjs`。

正解：**注入前**把占位块替换成真标签，整篇一次性注入 —— 落点由初次解析决定
（源码里本来就在尾图之前），不依赖光标位置。验证：`probe-search-presubstitute.mjs`。
替换时保留 `data-swx` / `data-swx-props` / `data-swx-src` 三个标记，往返回导才不断。

**替换时又踩了铁律⑨两次**（同一个根因，这次是第二次、第三次）：

- `[^>]*>` 找开标签会被属性值里的裸 `>` 截断 → 用引号感知的 `findTagEnd()`
- `[\s\S]*?</section>` 非贪婪会被**嵌套 section** 骗到，在第一个 `</section>` 就停
  → 用同深度计数的 `findMatchingSectionEnd()`

**④ 账号信息不能依赖 API —— IP 白名单一掉，占位块就静默进了草稿箱。**

2026-10-13：本机出口 IP 被移出白名单（`errcode 40164`），`client_credential` 取不到
`access_token`，于是 `fetchAccountInfo()` 抛错 —— 而调用处是个 `try/catch`，
**只打了行警告就继续保存**。结果：草稿箱里躺着两篇 `<mp-common-search>` 为 0、
占位块原样存在的"成功"稿件。稿子看着发出去了，读者端是坏的。

这跟本模块开头不用 `draft/add` 的理由是**同一条**：出口 IP 会漂、追不上白名单。
保存走浏览器通道解决了写入，但读账号信息还留着一条 API 依赖，所以同样会掉。

两道修正（缺一不可）：

1. **首选来源改成已登录的后台页面**（与保存同一信任边界）：
   `.acount_box-nickname` 取昵称、`.weui-desktop-account__thumb` 取头像。
   实测两种来源的头像 URL 形式不同 —— API 给 `wx.qlogo.cn/n/<hash>/64`，
   页面给 `wx.qlogo.cn/mmopen/<hash>/64`。**后者一样可用**：
   编辑器把组件渲染在 shadow DOM 里，头像 `<img>` 的 `naturalWidth = 64`（已加载）。
   验证：`assets-src/probe-search-avatar.mjs <appmsgid>`。
2. **替换失败必须硬失败，不能降级继续**。判据三条：取不到账号信息 fail、
   解析不出关键词 fail、替换数为 0 fail。"保留占位块照样保存"是最坏的选择 ——
   它把可发现的失败变成了沉默的数据损坏（铁律⑤）。

⚠️ 顺带失效的：`probe-search-presubstitute.mjs` / `probe-search-keyword-limit.mjs`
等**手动探针**仍走 API，白名单掉的那段时间它们也跑不通（不影响发布路径）。

**读回草稿体检**：`node apps/mcp-server/scripts/verify-drafts.mjs <appmsgid>…`
（同样走浏览器通道，不受白名单影响）。检查头尾同字母、SVG/animate 存活、
搜索真标签在尾图之前且昵称/头像/关键词齐全、音乐标签、封面已设。
这就是发现上面那两篇坏稿的手段 —— 发布脚本报"✅ 已保存"**不等于**稿子是对的。

两个坑叠加的表现是**静默漏替换**（日志只说「占位块没有关键词」），排查花了不少时间。
`AGENTS.md` 铁律⑨ 这次真的挡住了第二、三个受害者 —— 这条纪律值得保留。

### 位置

放**文末**（`hip-end-a` 之前）。理由：它是读者端唯一带点击的组件，放头部或正文中间会打断阅读；
它的用途是「读完了，去看看别的」。

