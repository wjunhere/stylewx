---
'@stylewx/mcp-server': patch
---

`brand_attach_assets` 的 `from` 参数说明改为指向工作区（`<工作区>/brand/motion`）。

品牌图源（头/尾图、logo）不再住在仓库里：私人产物（文章 / 品牌图源 / `.env` / 本机产物）一律放
`STYLEWX_WORKSPACE`（默认与仓库同级 `../stylewx-workspace`），路径统一从 `assets-src/paths.mjs`
解析。仓库侧新增路径级闸门 `pnpm check:private`（详见 docs/design/repo-hygiene.md §34）。
