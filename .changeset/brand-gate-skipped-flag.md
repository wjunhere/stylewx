---
"@stylewx/service": patch
"@stylewx/mcp-server": patch
---

品牌闸门不再假绿：一个品牌都没找到时标记 `skipped`，并停止说「三方一致」。

**症状**：`check:brands` / `brand doctor` 在「0 个品牌」时印着「✓ 三方一致（真源 ↔ 副本 ↔
brand.md 自动段）」退出 0。实测触发过一次：`STYLEWX_BRANDS_PATH` 被指到空目录，闸门于是变成
no-op，而报告看上去是全绿。而且那时它还会顺带报一条「全局组件库里 16 个组件不属于任何品牌」——
零品牌时这是废话，真正的信号（什么都没检）反而没说出来。

**怎么做**：`BrandCheckReport` / `BrandFixReport` 新增 `skipped`（`brands.length === 0`）；
CLI 与 `pnpm check:brands` 遇到它改印

```
⚠ 没有找到任何品牌档案：本次什么都没检查。
  如果不是预期，检查 STYLEWX_BRANDS_PATH 是否被指到了别处。
```

并且零品牌时不再汇总「游离组件」（那条只在真有品牌时才有意义）。
退出码不变（CI 机器上没有品牌档案仍算通过——它确实没东西可检）。
新增两条测试：零品牌时 `skipped=true` 且不报游离汇总；有品牌时 `skipped=false`。
