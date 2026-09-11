# @stylewx/preview

用 Chromium 把渲染结果截图，用于发布前的视觉检查。**Node-only**（依赖 Playwright）。

## 安装

```bash
npm i @stylewx/preview
npx playwright install chromium
```

## 用法

```ts
import { renderIphonePreview, renderHtmlToPng, closePreviewBrowser } from '@stylewx/preview'

// 模拟 iPhone 视口（默认 390×844，devicePixelRatio 2）整页截图
const { png, viewport } = await renderIphonePreview(html)
writeFileSync('preview.png', png)

// 自定义视口
const shot = await renderHtmlToPng(html, { width: 1440, height: 900, fullPage: false })

// 浏览器实例是惰性启动 + 复用的；进程常驻时可显式关闭
await closePreviewBrowser()
```

## 说明

启动 Chromium 有固定开销，而编辑器每次键入都截图会很贵，
所以 [`@stylewx/service`](https://www.npmjs.com/package/@stylewx/service) 的 `renderPreview`
默认**跳过截图**，只在需要出图时打开。

---

属于 **[stylewx](https://github.com/wjunhere/stylewx)** —— 把 Markdown 排成微信公众号文章的工具链。MIT License.
