---
"@stylewx/validator": minor
"@stylewx/service": patch
---

加排版基线闸门：schema 只管类型，管不了「合法但没法读」。

`lineHeight: 0.8~4`、`fontSize` 任意长度在类型上都合法，所以只会照 schema 生成主题的模型
能写出 `line-height: 1.1` + `font-size: 11px` —— 微信完全支持，人读不了。validator 原先
18 条规则全是兼容性/安全/数量，一条排版规则都没有。

新增四条（判据取自 36 套预置主题的实测区间，lineHeight 1.55~2.06 中位 1.7、fontSize 14~17px）：

| rule | error（阻断发布） | warning |
| --- | --- | --- |
| `typography-line-height` | < 1.3 | < 1.5 或 > 2.2 |
| `typography-font-size` | < 13px | < 14px 或 > 18px |
| `typography-block-spacing` | — | < 8px |
| `typography-letter-spacing` | — | > 0.15em |

分档原则是**只有明显坏才 error**：硬拦「偏离预置区间」会把刻意的极简风（如 1.4 行距的诗体）一起误伤。
实现上只查正文 `<p>`（h1/h2 的 1.2 紧行高是对的）、值从根节点继承、百分比/px/em 都换算成比值、
每个 rule 最多报一次。

它搭的是现成的车：`publish-via-browser.mjs` 本来就「validation.pass 不过就中止」，所以弱模型
写坏的排版在发布那一刻就被拦住，不需要新铺管线。`generate_theme` 的提示词也补了合理区间
（原文只写「lineHeight 数字 0.8~4」，把类型边界当成了合理值）。
