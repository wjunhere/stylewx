---
"@stylewx/mcp-server": patch
---

发布通道从 kimi-webbridge（闭源 daemon + 浏览器扩展）换成 CDP：

- `scripts/lib/chrome.mjs` 管浏览器生命周期。必须用专用 `--user-data-dir` —— Chrome 136+ 拒绝在默认 profile 上开调试端口
- `scripts/lib/cdp-socket.mjs` 是极小原生 CDP 客户端，`Runtime.evaluate` 的语义与旧通道一致
- `scripts/lib/bridge.mjs` 用 Playwright 的 `connectOverCDP` 实现同一套动作名，13 个脚本几乎不用改
- 上传本地文件不再依赖扩展的「允许访问文件网址」权限（`setInputFiles` / `DOM.setFileInputFiles`）
- 新增 `browser-use.mjs`（交互式探查，接同一个浏览器）与 `probe-file-chooser.mjs`（判定某个上传入口能否自动化：事件带 `backendNodeId` 就能塞文件，不带则只能人工）

`upload_video` 的描述按实测更正：10MB 是 `add_material` 接口的限制，不是上传通道的限制；`editor.html` 的视频说明与 tooltip 同步更新。完整实测记录见 `docs/design/publishing.md` §20。
