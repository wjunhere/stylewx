# @stylewx/theme

微信公众号排版主题：**zod Schema 校验** + 预置主题 + 编译成微信安全 CSS + 确定性微调。

主题用声明式 JSON 描述（`tokens` + `blocks` + 可选的 `components` 组件级覆盖）。
这个包负责校验它、把 token 引用（`{{primaryColor}}`）解析成实际值、编译出可用 CSS，
以及在不调用 LLM 的前提下做确定性微调。

## 安装

```bash
npm i @stylewx/theme
```

## 用法

```ts
import {
  PRESET_THEMES,
  getPresetTheme,
  validateTheme,
  compileThemeToCss,
  tweakTheme,
} from '@stylewx/theme'

// 取预置主题
const theme = getPresetTheme('magazine')!

// 校验：zod + 微信 CSS 白名单；返回补齐默认值后的安全副本
const { ok, theme: safe, issues } = validateTheme(theme)
if (!ok) throw new Error(issues.map((i) => `${i.path}: ${i.message}`).join('; '))

// 编译成 CSS
const css = compileThemeToCss(safe!)

// 确定性微调（不烧 LLM）：改 token、某个 block 的声明，或组件级覆盖
const { theme: adjusted } = tweakTheme(theme, {
  tokens: { primaryColor: '#1f3864' },
  blocks: { h2: { 'border-left': '4px solid {{primaryColor}}' } },
})
```

## 预置主题

`tech-minimal`、`business`、`magazine`、`gov-red`、`academic`、`dark-code`，
外加 22 个 WeMD 兼容主题（`basic`、`code-github`、`aurora-glass` 等）。
完整列表就是 `PRESET_THEMES`。

## 设计约束

主题里能写哪些 CSS，由**微信实际保留的属性**决定（来自真实 `draft/add` → `draft/get` 实测，
不是社区传闻）。`isCssPropertyAllowed()` 与 `findUnsafeCssValue()` 会拦掉
`position`、`filter`、`url(#…)` 这类会被剥离、甚至导致发布报错的写法。

---

属于 **[stylewx](https://github.com/wjunhere/stylewx)** —— 把 Markdown 排成微信公众号文章的工具链。MIT License.
