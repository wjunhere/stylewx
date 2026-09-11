# @stylewx/publisher

微信公众号草稿箱客户端：**只发草稿，不群发**。

## 安装

```bash
npm i @stylewx/publisher
```

## 用法

```ts
import {
  WeChatClient,
  loadConfigFromEnv,
  publishDraft,
  relocateExternalImages,
} from '@stylewx/publisher'

const client = new WeChatClient(loadConfigFromEnv())

// 可选：把外链图片搬进微信素材库（正文外链图会被微信拦截）
const localHtml = await relocateExternalImages(html, client)

const result = await publishDraft(client, {
  title: '文章标题',
  html: localHtml,
})

console.log(result.media_id) // 草稿 media_id
```

## 凭据

只从环境变量读取，不要在代码里硬编码：

| 变量 | 说明 |
| --- | --- |
| `WECHAT_APP_ID` | 公众号 AppID |
| `WECHAT_APP_SECRET` | 公众号 AppSecret |
| `WECHAT_API_BASE` | 可选，默认官方接口地址（便于走代理或自建网关） |

## 附带能力

- `relocateExternalImages(html, client)` — 外链图片 → 微信素材库（实测 8 张外链图全部搬运成功，
  返回的内容内图片地址为 `mmbiz.qpic.cn`）
- `generateDefaultCover()` — 未提供封面时生成 900×383 的默认封面

---

属于 **[stylewx](https://github.com/wjunhere/stylewx)** —— 把 Markdown 排成微信公众号文章的工具链。MIT License.
