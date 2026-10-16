# 手动验证脚本（§23，不参与 CI）

改动相关模块时按需跑 —— 这些脚本不进 CI，本地坏了不会有人发现。
上层：[设计说明索引](../DESIGN.md)。

## 23. 手动验证脚本（不参与 CI）

改动相关模块时按需跑。这些脚本不进 CI，所以**本地坏了不会有人发现** —— 跑之前先确认它还能用。

> 用到浏览器通道的脚本共用同一个客户端，三个文件分工固定：
> `lib/chrome.mjs`（浏览器生命周期：专用 profile / 调试点 / 拉起 / 窗口恢复）、
> `lib/cdp-socket.mjs`（原生 CDP 客户端，供 eval 与透传）、
> `lib/bridge.mjs`（会话/动作/evalJson/精确点击 + ALLOW·DENY 双名单）。
> **改通道行为只改这三个文件**；新脚本 import 它们，不要再复制一份 `wb()`（参见 §20.6）。

| 脚本 | 验证什么 |
|---|---|
| `apps/mcp-server/scripts/verify-agent-workflow.mjs` | 模拟 agent 分步工作流（真实 MCP stdio）：微调主题 → 逐段 → 整篇 → 落盘 → editorUrl 读回 |
| `apps/mcp-server/scripts/verify-handoff.mjs` | `save_article` 落盘后从编辑器端点读回（需编辑器在 3777 运行） |
| `apps/mcp-server/scripts/verify-html-roundtrip.mjs` | 本地往返：渲染 → HTML 回导 → 再渲染，比对组件标记与纯文本 |
| `apps/mcp-server/scripts/verify-wechat-showcase.mjs` | 真实微信端到端：发布 → 取回 → 核对组件存活 + 回导还原 |
| `apps/mcp-server/scripts/publish-via-browser.mjs` | 浏览器登录态发布（免 IP 白名单，含封面上传、推荐搜索预替换、音乐注入） |
| `apps/mcp-server/scripts/browser-use.mjs` | 用 browser-use（交互式/探查）接上**同一个**自动化浏览器：`node … 'print(page_info())'` |
| `apps/mcp-server/scripts/probe-file-chooser.mjs` | **上传入口能不能自动化**的判据：点下去有无 `fileChooserOpened`、带不带 `backendNodeId`（带=能塞文件，不带=FSA 只能人工） |
| `assets-src/publish-hippie.mjs` | **hippie 系列一键发草稿箱**：标题/作者/封面读工作区 `brand/covers.json`，主题读品牌档案（唯一真源）；发布前拦「正文标题图与 covers.json 不一致 / 头尾不同字母 / 封面文件缺失」，发完自动接着跑 `verify-drafts.mjs`。用法 `node assets-src/publish-hippie.mjs <文章名>` |
| `apps/mcp-server/scripts/verify-drafts.mjs` | **读回已保存草稿体检**（浏览器通道）：头尾同字母 / SVG·animate 存活 / 搜索真标签在尾图之前且昵称·头像·关键词齐全 / 音乐标签 / 封面。发完必跑 —— 脚本报「✅ 已保存」不等于稿子是对的（§28 ④） |
| `assets-src/probe-search-avatar.mjs` | 草稿里推荐搜索组件的**实际渲染**（shadow DOM 里头像 `naturalWidth` 是否为真加载值）+ 截图。换账号信息来源时必跑 |
| `scripts/comparison/run.mjs` | 品牌记忆 + 多组排版策略对比（4 篇 × 4 组），输出截图与量化指标 |
| `packages/preview/scripts/test-editor-*.mjs` | 编辑器 E2E（导入 / 同步滚动 / 交接 / 组件面板，需 Playwright + 3777 运行） |
| `packages/preview/scripts/capture-hero.mjs` | 重截 README 配图 `docs/assets/editor-preview.png` |
| `apps/mcp-server/scripts/probe-mermaid-wechat.mjs` | mermaid 图真实微信链路（draft/add → get 回读，会写一条 [probe] 草稿） |
| `assets-src/shot-abc.mjs` | 三套头/尾图并排截图（`.ui-shots/abc/`），改头图/尾图必跑（配合 `zoom-abc.mjs` 看细节，改完两个一起跑否则看的是旧图） |
| `assets-src/zoom-abc.mjs` | 三套头图 4x 放大截图（`.ui-shots/zoom/`），看小尺寸下漏掉的叠压/错位 |
| `assets-src/check-collisions.mjs` | **几何碰撞闸门**：头/尾图装饰不得压文字。用 `isPointInFill/isPointInStroke` 精确点内判定（不是 bbox 相交），退出码非零，改头/尾图必跑 |
| `assets-src/cmp-cover.mjs` | 标题图 `:::cover` 高度对照（150/165/180/220），拍出来选而不是拍脑袋定 |
| `assets-src/final-shots.mjs` | 三篇整页终态截图 + 输出各块高度占比（头/标题/尾图） |
| `apps/mcp-server/scripts/probe-wechat-music.mjs` | 音乐组件链路探针（`--stage picker` 入口结构 / `inject` 标签注入存活 / `survive` 保存后读回 / `search` 搜索点选）。`survive` 会写一条 [探针] 草稿并在读回后自动删除，其余阶段只探查不保存 |
| `apps/mcp-server/scripts/probe-wechat-toolbar.mjs` | 枚举编辑器**全部插入项**（一级项 id + 各 dropdown 子项），拿「平台有什么」的事实清单。只探查不保存 |
| `apps/mcp-server/scripts/probe-wechat-landed.mjs` | 逐个打开插入项弹窗，dump 它**要什么参数**。`node … "id1,id2"` 指定目标。只探查不保存 |
| `apps/mcp-server/scripts/probe-wechat-search-widget.mjs` | 「推荐搜索」专项：走完「点占位文本 → 输入 → 确定」并 dump 落地标签（`<mp-common-search>`）。只探查不保存 |
| `apps/mcp-server/scripts/probe-wechat-widget-survival.mjs` | **存活验证**：把平台组件标签直接 insertHTML → 保存 → 读回，判定能否自动化（音乐/推荐搜索都是这样验的）。会写 [探针] 草稿并自动删除 |
| `apps/mcp-server/scripts/probe-wechat-search-position.mjs` | 落点策略矩阵：证明所有 `execCommand` 二次插入都会把搜索块塞进 svg（六种全中），只有预替换正确。只探查不保存 |
| `apps/mcp-server/scripts/probe-search-presubstitute.mjs` | 验证「注入前预替换」方案：落点正确 + 读回仍在尾图之前。会写 [探针] 草稿并自删 |
| `apps/mcp-server/scripts/probe-search-keyword-limit.mjs` | 搜索关键词限制矩阵：定位到「16 单位、全角算 2」（汉字 8 / 英文 16）。会写多条草稿并自删 |
| `apps/mcp-server/scripts/probe-search-save-debug.mjs` | 保存失败诊断：抓平台浮层报错（首次发现关键词超限就是这样）。只诊断 |
| `packages/preview/scripts/ui-shots.mjs` | 编辑器 19 个面（主界面 / 浮层 / 7 弹窗 / 空态 / 窄屏 / toast）各拍一张，改前后逐面对比 |
| `packages/service/scripts/theme-sheet.mjs` | 主题样张：多套主题并排渲染成一张对比图（挑主题/改默认 block 后看效果）。需先 `pnpm build`；选 3777 以外的编辑器用 `EDITOR_URL=…` |
| `packages/preview/scripts/capture-theme-library.mjs` | 重截 `docs/assets/theme-library.png`（需 3777 在跑；改了预置主题就要重跑） |

