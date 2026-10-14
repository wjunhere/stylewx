---
"@stylewx/components": minor
"@stylewx/publisher": patch
---

新增 `:::music` 音乐占位组件：发布时**自动插入**微信原生播放器（无需人工）。

与 `:::video` 相反 —— 音乐不需要人工点。实测（`docs/design/platform-widgets.md` §26）：把旧草稿
`draft/get` 里的 `<mp-common-clmusic …>` 标签直接 `insertHTML`，编辑器完整保留；
保存后再读回仍完整。两条插入路径：`source`（原样标签，首选）/ `clue`（关键词搜索）。

两个组合性修复（同一个根因，铁律⑨）：

- `injectMarker` 改用引号感知扫描找开标签结尾。此前用 `indexOf('>')`，而 `escapeAttr`
  刻意不转义 `>`，属性值里出现裸 `>` 时开标签会被提前截断，把后续属性写进那个属性的值里
  —— 渲染产物里会多出一段可见的垃圾文本。音乐组件第一次把整段 HTML 当属性值存才踩到。
- `@stylewx/publisher` 新增 `stripHtmlTags()` 并在 `computeDigest` 使用。此前的
  `/<[^>]+>/g` 会被属性里的 `>` 骗到，把标签文本当正文写进文章摘要。
