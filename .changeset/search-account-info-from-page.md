---
"@stylewx/mcp-server": patch
---

发布脚本：账号信息改从登录页面读（不再依赖 API），且替换失败硬失败。

`getaccountbasicinfo` 需要 access_token，而取 token 要求调用方 IP 在白名单内；
出口 IP 一漂（本机 2026-10-13 就掉了一次，`errcode 40164`），取账号信息抛错
被 `catch` 静默吞掉，**带死占位块的稿子照样"保存成功"** —— 稿子看着发出去了，
读者端推荐搜索是坏的。

三处修正：

1. 昵称/头像改为**优先从已登录的后台页面读**（`.acount_box-nickname` /
   `.weui-desktop-account__thumb`），与保存同一信任边界，不受白名单影响；API 降为兜底。
   实测页面给的 `wx.qlogo.cn/mmopen/<hash>/64` 与 API 的 `…/n/<hash>/64` 都可用
   （编辑器 shadow DOM 里头像 `naturalWidth = 64`）。
2. 三处**硬失败**替代静默降级：取不到账号信息、解析不出关键词、替换数为 0 —— 一律中止发布。
3. 新增 `verify-drafts.mjs`：发布后读回草稿体检（头尾同字母 / SVG·animate 存活 /
   搜索真标签在尾图之前且昵称·头像·关键词齐全 / 音乐标签 / 封面）。
