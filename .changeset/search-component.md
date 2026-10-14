---
"@stylewx/components": minor
"@stylewx/service": patch
---

新增 `:::search` 推荐搜索组件（发布时自动插入）+ 三处平台限制防线。

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
