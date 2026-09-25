---
'@stylewx/mcp-server': minor
---

编辑器全元素改版（柔结构 Soft Structuralism）：六令牌与色系不变。

- 新材质层：面层级 `--plane-1..4`、柔影三档 `--lift-1/2/3`（分层改为「发丝线管边界 + 柔影管纵深」，
  `check-editor.mjs` 的投影断言同步改为「必须存在、至少两层、从令牌混出」）、输入控件凹槽材质、
  自定义缓动 `--ease`、五档字号阶、圆角档 8/12/18。
- 主题管理面板重构：分节卡片 + 自绘滑杆 + 色块行 + 粘底动作条；已保存主题列表改为可点击的行卡片
  （色板 + 当前标记，点击即切换）。
- 七个弹窗统一规格（标题 + 副标题 + 圆形关闭钮 + 凹槽输入 + 遮罩轻模糊 + 入场动画），
  下拉/弹窗/toast 全部改为 transform/opacity 动画（respect prefers-reduced-motion）。
- 图标归一：撤销/重做/新建/关闭的裸文本字形换成内联 SVG，30 个图标线宽按有效线宽统一。
- 新增 `packages/preview/scripts/ui-shots.mjs`：19 个界面面批量截图，改前后逐面对比。

另外新增 Mermaid 图功能（`:::mermaid` + 工具栏「Mermaid 图」下拉）：

- 十种图型模板（流程/时序/类/甘特/思维导图/饼/状态/ER/时间线/用户旅程），渲染在服务端
  Chromium 里跑官方 mermaid 出 2x PNG（node_modules 注入，无 CDN），落本地资产库，
  发布时搬微信素材库 —— SVG 原样发微信会因 id 剥离而裂图，必须走图片。
- 顺带修复两个既有发布 bug（真实微信实测发现）：
  1. `relocate.ts` 递归漏传 `resolveLocal`，嵌套 section 里的正文图片发布时全部搬运失败；
  2. `client.uploadMaterial` 的 multipart 结束 boundary 前缺 CRLF，微信文件嗅探报
     40113 unsupported file type（图片/封面上传偶发失败的根源）。
- 新增 `apps/mcp-server/scripts/probe-mermaid-wechat.mjs` 真实链路探针（draft/add → get 回读）。
- `@stylewx/preview` 新增依赖 mermaid@^11。

编辑器「另存为」重构：

- 弃用 `window.prompt`（会被浏览器静默禁用），改为编辑器自有弹窗：文件名 +
  目录浏览（面包屑 / 上一级 / 新建文件夹 / 点选已有文件名）。
- 写入范围从单一文章根目录放宽为 `writeRoots()`（文章根 + 用户主目录，
  可用 `STYLEWX_WRITE_ROOTS` 追加），可像文件管理器一样逐层浏览选位置；
  系统位置仍在白名单外（本地 HTTP 服务的 CSRF 防线）。
- 新增端点 `GET /editor/api/list-dir`、`POST /editor/api/make-dir`。
