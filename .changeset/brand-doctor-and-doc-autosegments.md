---
"@stylewx/service": minor
"@stylewx/mcp-server": minor
---

品牌三方一致性闸门（`brand doctor`）+ 品牌宪法自动段 + 编辑器品牌面板。

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
