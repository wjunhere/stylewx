---
"@stylewx/service": minor
"@stylewx/mcp-server": minor
---

色板自动段覆盖全量 token、打包前自包含预检、品牌档案段外副本清理。

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
