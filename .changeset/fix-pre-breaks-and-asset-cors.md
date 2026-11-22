---
"@stylewx/theme": patch
"@stylewx/preview": patch
"@stylewx/service": patch
"@stylewx/mcp-server": patch
---

修一批会静默毁掉正文、或让发布静默半成功的问题，并给两处「静默」加硬拦截。

**正文/渲染**
- `publish-via-browser.mjs --theme <主题名>` 之前必崩（`homedir` 未导入，只走预设名或已保存名这条路就会 `ReferenceError`）。
- 浏览器通道注入前把 `<pre>` 内换行焊成 `<br>`：微信编辑器保存时剥掉 `white-space`，代码块所有行会挤成一段（新增 `scripts/lib/wechat-html.mjs`）。
- 编译器给 `pre` 兜一层 `text-align: left`：正文容器默认 `justify` 会把等宽字体长行拉出大空隙；主题显式声明则不改。
- `/editor/api/asset/` 补 `Access-Control-Allow-Origin: *`：微信编辑保存时会用 XHR 抓外链图，跨源被拦后保存「成功」但草稿里没有内容。

**硬拦截（不再静默半成功）**
- 浏览器通道注入前先确认编辑器是空的（剔除编辑器的占位 widget），有内容就中止、不保存；注入后校对 `img`/`pre` 数量，DOM 少于源 HTML 即中止。
- `save_article` 遇到 `%file` / `@file` 这类文件引用写法直接报错（原来会把它当正文原样落盘成垃圾文件，还报成功）。

**图片管道（`prepareImage`）**
- 唯一触发条件改成「体积超 `maxBytes`」：**不再**因为「最长边 > 1600」这个没有平台依据的常量砍像素；不超预算的图连浏览器都不起。
- 超预算时**先保像素**：不透明的图先试原尺寸转 JPEG（质量阶梯 0.88→0.68），进预算就停；透明的留 PNG 缩像素（长边不低于 800）。
- 压完比原图还大（截图类 PNG）就回退原图并标 `fellBack`；压到底仍超预算则标 `overBudget`（不再静默当成功）。
- 免压通道用新增的 `readImageSize()`（PNG/GIF/JPEG/WebP 文件头解析，不启浏览器）报真宽高，不再返回 `0×0`。
- `upload-image` 的原图体积提示改用上传字节计算（原来会显示「707KB → 707KB」）。
- 破坏性变更：`PrepareImageOptions.maxEdge` 与 `quality` 已移除；`PrepareImageResult` 新增 `overBudget`。

**主题库来源标记**
- `themes.json` 新增旁挂的 `origins`（`agent` / `brand:<名字>`）；`deleteTheme` 拒绝删除品牌派生主题（`brand_apply` 会幂等补回），也拒绝删除没有标记的存量主题，除非显式 `allowUnknown`。
- `verify-drafts.mjs` 只检查稿子里**真的存在**的组件：一头一尾都在才比对字母（只放尾图不再误报「不同字母」），没放推荐搜索就不再判它✗。
