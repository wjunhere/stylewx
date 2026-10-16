# 发布通道与草稿箱（§20、§29）

浏览器登录态发布（含可编辑性判据、工具选型、正文视频）与草稿箱纪律。
平台组件见 [platform-widgets.md](./platform-widgets.md)；上层：[设计说明索引](../DESIGN.md)。

## 20. 浏览器登录态发布（绕过 API IP 白名单）

### 20.1 问题

`draft/add` 要求调用方 IP 在公众号后台白名单内。校园网 / 多出口 NAT 环境下出口 IP 会漂移
（实测一天内见到 `153.3.21.105` / `153.3.21.153` / `36.152.24.135`），逐个加白名单追不上；
用代理固定出口又会让日常上网受影响，且 Clash 的 `GEOIP,CN → 直连` 规则还会让微信域名绕过代理。

### 20.2 方案：专用 profile 的 Chrome + CDP

`apps/mcp-server/scripts/publish-via-browser.mjs` 通过 **CDP** 驱动一个**专用的 Chrome 实例**
（`--user-data-dir=<工作区>/out/chrome-profile` + `--remote-debugging-port=9222`），
在里面写正文、传封面、点「保存为草稿」——走后台自己的保存接口，无 IP 白名单约束。

为什么必须是**专用 profile**：Chrome 136+ 起拒绝在默认 user-data-dir 上开调试端口，
实测报错原文就是

```
DevTools remote debugging requires a non-default data directory. Specify this using --user-data-dir.
```

代价是「第一次要在这个 profile 里扫码登录」；换来的是爆炸半径只剩这一个 profile（碰不到日常 cookie），
以及一条**可审计**的通道（见 §20.3）。

### 20.3 选型：为什么最后是 CDP，而不是某个浏览器扩展

候选都实测过。判据按重要性排序：**能不能上传本地文件** → **定位是否精确** → **是否可审计** → 前置成本。

| 路径 | 复用登录态 | 上传本地文件 | 元素定位 | 可审计 | 前置成本 |
| --- | --- | --- | --- | --- | --- |
| **CDP + Playwright**（现用） | ✅ 专用 profile 登录一次 | ✅ `setInputFiles` / `DOM.setFileInputFiles` | role+name / selector，**精确** | ✅ Playwright 开源、协议开放 | 要用 `--user-data-dir` 起浏览器 |
| kimi-webbridge（闭源，已弃用） | ✅ 扩展注入，浏览器照常用 | ✅ 扩展 `upload`（要开「允许访问文件网址」） | snapshot 的 `@e` ref（较精确） | ❌ 闭源 daemon（实测往 `gator.volces.com` 上报命令名） | 装扩展 |
| opencli | ✅ 扩展桥接 | ⚠️ 隐藏 input 必失败 | CSS / 语义（**会退化模糊匹配**，实测误点过「退出登录」） | ❌ 闭源 | 装扩展 |
| cua-driver | ✅ 走 Chrome CDP | ⚠️ 原生对话框只能填路径、确认得人按 | UIA/CDP 元素，精确 | ❌ 闭源 | 要 `--grant existing-profile` |
| browser-use | ✅ 接同一层 CDP | ✅ 同 CDP | AX 树 + `backendNodeId`，精确 | ✅ 引擎开源（本机 CLI 有遥测） | 装 Python CLI |

两条**旧的错误结论**在这里更正（都是取证边界写错了，细节见 §20.10）：

1. 曾写「`DOM.setFileInputFiles` 在 `chrome.debugger` 沙箱下返回 `Not allowed`（协议层硬限制）」——
   那只是**扩展沙箱**的限制，不是 CDP 协议本身的。裸 CDP 三条路（直连节点 / 静态 input 拦截 /
   动态创建 input 拦截）2026-10-16 全部实测通过。
2. 曾据此推出「上传本地文件只能靠扩展的 upload」——不成立。

**为什么确定性流程不直接用 browser-use**：它是 Python CLI，每步一次进程往返，一个发布流程
几十步会让链路变脆；而 Playwright 本来就在仓库依赖里（`packages/preview`），
同源、可测、可调试。两者接的是**同一个浏览器**，分工见 §20.11。

### 20.4 技术要点（实测得出）

| 环节 | 结论 |
| --- | --- |
| 正文编辑器 | `.rich_media_content .ProseMirror`。页面上有 **两个** `.ProseMirror`：`[0]` 是标题编辑器（高 30px），`[1]` 才是正文（高 366px）——按所属容器选择最稳 |
| 写入方式 | `execCommand('insertHTML')` 有效，section/span + 内联样式完整保留。合成 `ClipboardEvent('paste')` 无效（ProseMirror 校验事件可信度） |
| 外链图片 | 编辑器自动上传到素材库，`src` 变 `mmbiz.qpic.cn` |
| 内联 SVG + SMIL | 完整保留 |
| 封面入口 | hover 才显示的 `pop-opr` 组，需先 DOM 显形；入口有「从正文选择 / 从图片库选择 / 微信扫码上传 / AI 配图」 |
| 封面弹窗 | 微信预渲染**多份 `0×0` 的模板副本**，必须筛「尺寸 > 200」的那个才是可见实例——用错实例会出现「点击完全无反应」 |
| 封面 file input | **只在封面弹窗打开时存在**，且与编辑器工具栏的插图 input 不同（封面那个 `accept` 含 `image/bmp`）。传错会把封面图插进正文 |
| 封面流程 | 图片库 → 点「上传文件」（唤起 input）→ `upload` → 自动选中 → 「下一步」→「编辑封面」→「确认」 |

### 20.5 安全约束：绝不用文本模糊匹配点按钮

构建过程中我用 opencli 的 `click --text "下一步"` 定位按钮，该参数在精确匹配失败时会
**退化匹配**，结果点到了页面上的「退出登录」，**导致账号被登出**（无数据损失，但需重新扫码）。

因此 `publish-via-browser.mjs` 定下硬约束：

1. **只用精确身份点击**：现在是 role + name 全等（或文本全等），**绝不做模糊/包含匹配**。
   旧通道用的是 snapshot 的 `@e` ref；两者等价的目的：定位方式必须精确且唯一。
2. **ALLOW / DENY 双名单**：只允许 `保存为草稿 / 保存 / 下一步 / 确认 / 确定 / 完成`；
   命中 `退出登录 / 删除 / 取消 / 关闭 / 群发 / 发表` 立即中止

教训：自动化点「确认类」按钮时，相邻位置往往就是危险操作（退出、删除、群发）。
**定位方式必须精确且唯一**，且要有独立的危险名单兜底。

### 20.6 调用方式

**客户端只有一份**：`apps/mcp-server/scripts/lib/bridge.mjs`。它用 Playwright 的
`connectOverCDP` 接上自动化 Chrome，对脚本暴露的动作名与旧通道**保持一致**
（`navigate` / `evaluate` / `snapshot` / `click` / `upload` / `list_tabs` / `close_tab` / `cdp`），
所以换通道时 13 个脚本几乎不用改。三个文件分工固定：

| 文件 | 管什么 |
| --- | --- |
| `lib/chrome.mjs` | 浏览器生命周期：专用 profile、调试点、拉起、**窗口恢复**、`browser-use` 接法 |
| `lib/cdp-socket.mjs` | 极小的原生 CDP 客户端（`Runtime.evaluate` 语义与旧通道一致，供 eval 与透传用） |
| `lib/bridge.mjs` | 会话/标签页、动作封装、`evalJson`、`clickByLabel` + ALLOW·DENY 双名单 |

**不要在各脚本里再复制一份 `wb()`** —— 通道仍可能再换，复制粘贴会把成本抬回 14 处。

前置：

```bash
# 起浏览器（没起的话，脚本自己也会拉起）
STYLEWX_WORKSPACE=B:/stylewx-workspace node apps/mcp-server/scripts/lib/chrome.mjs
```

第一次要在这个专用 profile 里扫码登录公众号后台（之后长期有效）。
环境变量：`STYLEWX_CHROME_PROFILE`（profile 目录）、`STYLEWX_CDP_PORT`（调试点，默认 9222）、`CHROME_BIN`。

### 20.7 可编辑性：选通道的第一判据

`draft/add` 写进草稿箱的文章**人在后台改不了**。判据只有一个：

```
draft/get 取回后，数 `leaf=` 出现次数
  leaf = 0   → 后台编辑器没认领，整篇是一个外部导入块，能看能删、改不进去
  leaf > 0   → 编辑器认领过，整篇可编辑
```

实测样本：`draft/add` 发的草稿 `leaf=0`；浏览器保存的 `leaf=30`；人手工写的 `leaf=49~97`。
两者在 `draft/get` 里读起来几乎一样，**只有这个计数能区分** —— 曾经因此把一篇文章
以「看起来正常」的状态发出去，人反馈「改不了」才发现。

**规则：给人看的稿子走浏览器通道；只有不需要人再动手的机器流程才用 `draft/add`。**

### 20.8 cua-driver 通道（Chrome，精确可控）

除 kimi-webbridge 外，还实测了 cua-driver。两者管的是**不同浏览器**：

| | kimi-webbridge | cua-driver |
| --- | --- | --- |
| 控制哪个浏览器 | **Edge**（扩展注入） | **Chrome**（CDP 绑定） |
| 机制 | 扩展在页面里执行 JS（`evaluate`） | CDP 语义快照 + ref 点击 |
| 会话 | 每次调用必须带同一个 `session` | 每个 session 都要重新 `browser_prepare` |
| 现成脚本 | `publish-via-browser.mjs` 已封装全流程 | 需自行编排 |

#### 为什么 Edge 不行、Chrome 行

同一台机器、同一版本驱动，只换浏览器：

| | Edge 153.0.4234.48 | Chrome 153.0.8010.53 |
| --- | --- | --- |
| `browser_prepare` | ✗ `no exact ... consent prompt appeared` | ✓ `status: ok` |
| 远程调试开关 | 被自己回滚成 `false` | 保持 `true` |
| 9222 监听 | 无 | 有 |
| 绑定 | 失败 | ✓ `binding_quality: exact`、`mutation_allowed: true` |
| 副作用 | 开设置页、勾开关、抢焦点 | **全部 `false`** |

根因：**Chrome 144+ 有 agent auto-connect 桥**。profile 已在监听时，cua-driver 读
`DevToolsActivePort` + 校验端口归属进程即可接上，**不需要勾设置、不需要确认框、不需要重启浏览器**。
Edge 走的是「自动勾选 + 等确认框」那条路，而确认框出现在它的检查窗口之后 → 回滚 → 失败；
手动点「允许」也无效。

**结论：Windows 上要 CDP 就用 Chrome。**

前置：`mcp.json` 的 cua-driver args 带 `--grant existing-profile`；
Chrome 的「允许远程调试」开关为 `true`（`Local State` → `devtools`）。

#### 演练过的完整链路

```
get_browser_state(pid, window_id)          → 绑定，拿 target_id + tab_id
browser_navigate(target, tab, url)         → 打开页面（refs 失效，必须重新快照）
get_browser_state(target, tab, query="…")   → 语义快照，拿 ref
browser_click(ref="p6:0")                  → 后台点击，不抢焦点
[draft/get 复核]                            → update_time 前进、leaf 不变
```

全程 `delivery.mode: background`、`foregrounding: not_requested` —— 不打断用户。

#### 六个坑

**① 快照会淹上下文。** 不加 `query` 的全页快照在公众号后台能吐出 3400 行 / 72KB。
必须用 `query` 或 `max_elements` 收窄。

**② 刷新即失效。** `browser_navigate` 之后旧 ref 全废，必须重新快照再拿 ref。

**③ `active` 是三态。** `true` 唯一证明是选中页、`false` 证明未选中、`null` 是原生证据分不清。
**`null` 时不要做写操作**，改用直接指定 URL 绕开。

**④ 点列表里的链接会开新标签页**（进的是预览页而不是编辑器）。直接 `browser_navigate`
到编辑 URL 更可控。

**⑤ kimi-webbridge 不带 `session` 时 `list_tabs` 恒返回空数组**，于是「扩展已连接」
但「找不到标签页」，很容易误判成断连。所有调用都要带同一个 session。

**⑥ 别用固定 token。** token 是会话级的，Edge 和 Chrome 登同一个号也会不同。
让页面自己 `location.href.match(/token=(\d+)/)` 取。

### 20.9 安全纪律

- **只用 snapshot 返回的 ref 点击，绝不用文本模糊匹配**（§20.5 的事故）。
- **删草稿前先列一遍同名条目并逐个确认。** 曾把用户亲手写的原生草稿当「重复」删掉。
- **不要盲按 `Ctrl+1/2/3` 切标签页** —— 看不清标签栏时靠猜位置，会误关页面。
  要切标签用 `zoom` 先读标签栏，或用 `browser_navigate` 直接指定 URL。
- **动剪贴板前先读原值，用完还原。** 曾把测试文本留在用户剪贴板里。

---

### 20.10 正文嵌入视频：实测结论（2026-09-25）

**结论：`draft/add` 这条路写不出能播的视频；只有浏览器走官方「视频」组件才行。**

#### 已实测：什么能存活、什么不能

用 `draft/add` 写入 5 种候选结构，再 `draft/get` 取回比对：

| 写入的结构 | `draft/get` 取回后 | 真浏览器渲染 |
| --- | --- | --- |
| `<iframe class="video_iframe" data-vid=... src=...>` | ❌ **整个 iframe 被删** | — |
| **`<mpvideo data-vid="apiv_…">`** | ✅ **完整存活**（属性都在） | ❌ **0×0，不可见** |
| `<mp-common-videosnap data-vid=...>` | ❌ 被剥掉 | — |
| `<iframe>`（不带 class） | ⚠️ 标签留着、**属性全剥** → `<iframe></iframe>` | 废 |
| `<section class="video_iframe">` | ✅ 存活 | ❌ 不生成播放器 |

**关键判据：`draft/get` 存活 ≠ 能播。** `<mpvideo>` 是唯一能完整持久化的，但读者端
它既不进微信的渲染白名单（页面脚本里 `video_iframe` 在列、`mpvideo` **不在**），
也不被升级成播放器 —— Playwright 实测它的 `getBoundingClientRect()` 是 **0×0**，
页面里也没有 `mpvideo.qpic.cn` 这个真实视频流域名。

**教训：以后判断「某结构能不能用」，必须走完 `draft/add → draft/get → 真浏览器渲染`
三步。只做前两步会得出「能用」的错误结论**（`mpvideo` 就骗过了前两步）。

#### 能用的路：素材库 + 浏览器 UI

素材接口是通的，实测可用：

```
POST /cgi-bin/material/add_material?type=video   → { media_id }
POST /cgi-bin/material/get_material              → { vid: "apiv_…", down_url }
```

- 上传成功，`get_material` 能拿到 **`vid`**（形如 `apiv_4709954571878367233`）
- `batchget_material?type=video` 能列出，`materialcount.video_count` 会 +1
- **API 上传限制：MP4、10MB 以内**（后台 UI 上传更宽松）
- 上传后**要过审**才能用；审核状态可用 `get_material` / 查询接口轮询

但**写进正文必须靠浏览器点官方「视频」组件**：编辑器工具栏有
`视频` / `视频号` 两个入口，弹窗里能看到**我们自己通过 API 上传的那个视频**
（实测：素材库列表显示 `stylewx 视频通路测试`），选中后由微信自己生成合法结构。
**API 无法自己拼出那个结构** —— 这也是为什么「上传走 API、插入走浏览器」是唯一组合。

#### 与 SMIL 的分工（别混用）

| | SMIL 内联 SVG | 视频 |
| --- | --- | --- |
| 何时开始动 | **打开文章即动** | **必须点一下** |
| 体积 | ~2.6KB/资产 | 25KB(3s) 起，GIF 更大 16 倍 |
| 半透明 | ✅ 支持 | GIF 只有二值透明 |

所以要「打开就有生命感」用 SMIL；视频是另一种媒介，不是动效的替代品。

#### Remotion 的定位

Remotion（4.0.52x）实测可用，3s/640×360 出 25.5KB MP4，产物能通过
`add_material?type=video` 上传（10MB 限制下轻松）。但它**不能产出 SMIL**——
它是逐帧渲染成视频的框架，官方明确不支持 SMIL/CSS 动画的 SVG。
**用途是「做视频内容」，不是「替换现有动效资产」。**

> **环境注意**：装 Remotion 时不要在仓库里 `pnpm add`——会把 2400+ 行写进根
> `pnpm-lock.yaml` 污染 monorepo。要装在**仓库外的独立目录**（或加进 workspace 并
> 约束），验证完删掉。踩过一次，已还原。

#### B 方案：浏览器脚本自动插入（已实现，待过审视频验证）

`publish-via-browser.mjs --video <名称>` 会在保存前完成插入。**探测到的关键 DOM（真实实测）**：

| 元素 | 选择器 | 备注 |
| --- | --- | --- |
| 「视频」工具栏入口 | `li.tpl_item.jsInsertIcon.video` | 精确 class，不必文本匹配 |
| 弹窗容器 | `.video-select-dialog` | 用**它**作作用域，避免全页误命中 |
| 素材库条目 | `.more-video__item` | 名称取 `innerText` 第一行 |
| 未过审条目 | `.more-video__item_disabled` | **必须跳过**，不能硬点 |
| 底部按钮 | `.weui-desktop-dialog__ft` 里的 `确定` / `取消` | `确定` 未过审时也是 disabled |
| 三个来源标签 | `素材库` / `视频链接` / `本地上传` | `视频链接` 支持公众号/腾讯视频链接 |

**安全设计（比封面更严）**：只在 `.video-select-dialog` 内查找；条目名用**精确相等**比对
（防同名误选）；`disabled` 一律跳过；出错时点「取消」回滚而不是留着半开弹窗。

**两个发现改变了设计**：

1. **`本地上传` 走的是原生文件选择器**，页面里不出现 `video` 类型的 `<input type=file>`
   （只有一个 `accept` 全是图片的隐藏 input）。扩展的 `upload` 驱动不了它 ——
   所以「绕开 API 的 10MB 限制」这条路**不通**，上传仍必须走 `upload_video`。
2. **占位标记能活过 ProseMirror。** `data-swx-video` / `data-swx-video-title` 经
   `execCommand('insertHTML')` 写入后**完整保留**（实测），因此插入点定位可靠。

#### ⚠️ 决定性发现：API 上传的视频**不能用于图文正文**

上一版这里写的是「等审核通过即可」。**实测推翻了它。** 轮询 25 分钟始终 disabled，
于是去读条目 DOM 里的说明，微信自己写得很清楚：

```html
<span class="more-video__item-status">上传完成
  <div class="weui-desktop-popover__desc">
    API上传完成，可用于自定义菜单、自动回复等场景。
  </div>
</span>
<label><input type="checkbox" disabled="disabled" ...></label>
```

**「可用于自定义菜单、自动回复等场景」——图文正文不在其中。** 这不是等待中的审核状态，
是**通道级限制**：`add_material?type=video` 上传的视频，在正文里就是选不中
（`li.more-video__item_disabled` + `input[disabled]` + 底部「确定」也 disabled），
**永远如此**，等多久都一样。

**推论**：`upload_video` 工具对「正文嵌视频」**没有用**。它的正确用途是自定义菜单/自动回复
（这仍是有价值的工具，但描述里不能说「用于正文」）。正文嵌视频只剩这些路：
人在编辑器点「本地上传」传本地 MP4 —— 因为**本地上传**走的是另一条通道。

#### 本地上传：2026-10-16 实测更正（原结论只对「无 input 的原生对话框」成立）

⚠️ **下面那节是 2026-09-25 的观测，对「微信本地上传」的定性已被 2026-10-16 推翻。**
保留它是因为 UIA 那套技巧（填路径、人按回车）在真遇到**无 input 的原生对话框**时仍然成立，
但它不该被用来说明微信这条路的可行性。

实测（Chrome 155 + 当天的微信编辑器）：

| 步骤 | 结果 |
| --- | --- |
| 图文编辑器「视频」→「本地上传」 | **不是原地弹选择器**，而是把当前标签页**导航到独立页面** `t=media/videomsg_edit&type=15`（视频消息编辑页） |
| 那个页面的上传入口 | `<input type=file accept="video/*" name="vid" class="weui-desktop-upload-input">`，**可见**，而且**压在「上传视频」按钮上**（点按钮会被它拦住 pointer 事件而超时——这本身就是「有 input」的强信号） |
| 塞文件 | 三种都成：裸 CDP `DOM.setFileInputFiles` ／ `Page.fileChooserOpened` 带 `backendNodeId` ／ Playwright `setInputFiles` → 页面报「**视频上传成功**」 |
| 体积 | **18.13MB 传成功** → 10MB 是 `add_material` **API** 的限制，**不是 UI 的**（UI 只限「时长 < 1 小时」） |
| 进素材库 | 需在视频消息编辑页点「保存」（先要选/编辑封面）→ `material/get_materialcount` 的 `video_count` +1，素材库里可被 API 看到 |
| 插进图文正文 | 「视频 → 素材库」里**可选（未 disabled）**→ 确定 → 正文里是 `iframe.video_iframe` + `data-mpvid` + `vid`，编辑器内 **578×325**（不是 0×0） |
| 保存后读回 | `draft/get` 里是读者侧的 `data-src="…video_player_tmpl&action=mpvideo&vid=…"`，结构存活 |

**要区分两件事**：①「上传视频材料」②「把视频插进图文正文」。上面证明的是①可全自动、
②的结构是微信自己生成的合法结构；**读者侧能不能真的播还没验**（当天视频状态是「审核中」，
且窗口被遮挡时预览按钮无响应）—— 不要把它写成结论。

复跑判据：`node apps/mcp-server/scripts/probe-file-chooser.mjs --text "上传视频"`
（带 `backendNodeId` = 可塞文件；不带 = File System Access，只能人工）。

<details><summary>2026-09-25 的原始观测（保留，勿当现状）</summary>

#### 本地上传：kimi-webbridge 不行，cua-driver 只能做一半

**kimi-webbridge 完全不行**：点「本地上传」后页面里**不出现任何 `video` 类型的 `<input type=file>`**
（只有 `accept` 全是图片的隐藏 input，`MutationObserver` 也捕获不到新增）——
它唤起的是原生文件选择器，扩展无从插手。

**cua-driver 能做的部分**（走**原生 UIA**，不依赖页面 DOM，这是与扩展/CDP 的本质区别）：

| 步骤 | 能否 | 说明 |
| --- | --- | --- |
| 找到原生「打开」对话框 | ✅ | 它是 Chrome 的**独立子进程窗口**（pid ≠ 浏览器主进程），要按标题全桌面找 |
| 滤掉幽灵窗口 | ✅ | 见下 |
| 命中「文件名」输入框 | ✅ | UIA `ValuePattern.SetValue`，写完可回读核对 |
| **点「打开」确认** | ❌ **不行** | 见下 |

**为什么确认点不了**（这是本节的结论核心）：后台投递会**假成功**——
`click` 返回 `{"delivery":{"mode":"background"},"effect":"unverifiable"}` 看似 OK，
但对话框不关、文件不进；坐标点击直接报 `background_unavailable / uia_status: unavailable`。
试过且都无效的路径：`bring_to_front` 后再 Invoke、聚焦输入框 + `press_key Enter`
（`delivery_failed`，升 foreground 也无效）、`escalate_session`（`invalid_escalation_reason`）、
`get_desktop_state`（返回 0 元素，拿不到桌面层）。

**所以正确形态是「机器填好、人按回车」**（`scripts/lib/native-file-dialog.mjs`）：
机器负责找窗口、滤幽灵、命中输入框、拼对路径、回读核对；人负责最后那下回车。
**不要把它写成「全自动」** —— 曾写成自动点确认并报告成功，但那**不可复现**
（当时窗口恰在前台才蒙对）。一个「有时能用」的自动化比没有更糟：
它会半途停下，留下一个开着对话框的编辑器。

</details>

**两个实测踩到的坑**：

1. **幽灵窗口**：浏览器进程被杀后，它的「打开」对话框会**残留在系统窗口列表**里，
   标题完全相同，但只有 5 个元素、没有文件名框。只按标题取第一个会拿到死的那个。
   判据要用「有文件名框 + 有确认按钮」。
2. **`element_token` 每次快照都在变**：实测 `s00000027:121` → `s00000028:121`，
   只有后半截索引稳定。所以写入后的回读**不能按 token 比对**，要按 role+label 重新定位。

所以 B 方案的最终结论：**脚本能正确定位、开窗、识别、回滚（这些都已验证），
但在「API 上传的视频」这条数据源上注定插不进去**。要真正跑通，得先解决视频从哪来：

| 视频来源 | 能否用于正文 | 备注 |
| --- | --- | --- |
| `add_material?type=video`（API） | ❌ **不能** | 微信明说限菜单/自动回复 |
| 编辑器「本地上传」 | ✅ 能 | 原生选择器：扩展不行，**cua-driver 走 UIA 可以** |
| 视频号已发布视频 | ✅ 能 | 需先有视频号内容 + 授权 |

**`--video` 参数的代码保留**：逻辑正确、安全约束完整，一旦视频进了素材库的「可正文使用」
状态（例如人先用本地上传传过一个），它就能工作。但当前**没有可用的自动化数据源**。

### 20.11 两轨分工：确定性用 bridge，交互式用 browser-use

同一个自动化浏览器（CDP）上有两个客户端，**分工是刻意的**：

| | 用什么 | 干什么 |
| --- | --- | --- |
| 确定性流程 | `lib/bridge.mjs`（Node + Playwright） | 发布、读回体检、探针：动作可复现、能进测试、能 diff |
| 交互式/探查 | `apps/mcp-server/scripts/browser-use.mjs`（包一层 browser-use） | 页面长什么样、按钮在哪、要边看边试；LLM 驱动更顺手 |

browser-use 是 Python CLI，**每步一次进程往返**；把几十步的发布流程交给它只会让链路变脆。
两者接的是同一个浏览器实例，所以看得见同一份登录态、同一批标签页：

```bash
node apps/mcp-server/scripts/browser-use.mjs 'print(page_info())'
node apps/mcp-server/scripts/browser-use.mjs <<'PY'
new_tab("https://mp.weixin.qq.com/")
print(page_info())
PY
```

它自己也能接（不用这个包）：`BU_CDP_URL=http://127.0.0.1:9222 browser-use`。

#### 坑：标签页被节流时，编辑器会「点击命中却毫无反应」

Chrome 对**最小化/被其它窗口完全遮挡**的窗口会把标签页判成 `visibilityState: 'hidden'` 并节流。
症状很迷惑人：`elementFromPoint` 在正确元素上、`hasFocus` 甚至是 `true`，但**点下去什么都不发生**，
DOM 里还会留一堆「查得到、画面上没有」的残留（弹窗、toast、「请设置封面」提示）。

> 2026-10-16 为此查了很久，误以为是页面坏了。判据就一条：`document.visibilityState`。

防线：`lib/chrome.mjs` 的 `ensureBrowser()` 拉起后会**把最小化的窗口恢复**，
`wb('navigate')` 也会在页面 hidden 时往 stderr 打提醒。真被遮挡就把窗口放到可见处再跑。

## 29. 草稿箱纪律（人的初版不能删）

**一次排版会在草稿箱留下同名多份，这是正常的，不是要清理的垃圾**：

| 条目 | 谁创建的 | 处置 |
| --- | --- | --- |
| 人的最初版本 | 人 | **绝不能删**（往往是唯一副本） |
| 每次重排各一份 | agent | 由人决定去留，agent 不主动删 |

### 教训（2026-10-12）

按 `brand.md` 里一条旧规矩「同名草稿只留最新一份」，把三篇的初版当重复项删了。
唯一能救回来的是**删除前抓的快照**（工作区 `articles/hippie/originals/`）——
`assets-src/restore-originals.mjs` 按快照回灌，**只新建、不删除**。

旧规矩已从 `brand.md` 删除，不要重建。

### 两条防线

1. **动稿前先把原稿 HTML 落盘**：`draft/get` 的 `content` 原样存（连同封面 `thumb_url`）。
   有快照，任何误删都能回灌；没快照，人的字就没了。
2. **回灌必须走浏览器通道**，不用 `cgi-bin/draft/add` —— 后者 `leaf=0`，人改不了（§20.7）。

同一条原则在品牌包导入里也成立（§31「三条重名规则」）：不确定该覆盖还是该丢弃时，
**并存并在名字上留痕**，把去留交给人的判断。

