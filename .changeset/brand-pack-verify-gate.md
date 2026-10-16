---
"@stylewx/mcp-server": patch
---

新增 `scripts/verify-brand-pack.mjs`：验证一个 `.brand` 包是否**自包含** —— 装进干净环境（空品牌目录 + 空组件库）再逐个渲染它声明的组件，缺件或渲染退化就退出码非零。

为什么需要它：组件只做了 `save_component`（进全局库 `~/.stylewx/components.json`）、没再 `brand_save` 把完整清单写进档案时，`.brand` 包不带它 —— 而**本机渲染永远正常**（全局库里有），只有装到干净环境才报「未知组件」。实测踩过 `hip-quote`。

判据 A（缺件）的参照物一律在包外：`--expect` 显式清单 / 本机同品牌档案 / `--articles <该品牌文章目录>`。拿包内的 `brand.md` 当参照等于自己证明自己（缺件时两边一起缺）。
