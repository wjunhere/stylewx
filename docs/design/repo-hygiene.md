# 仓库卫生：私人产物与项目代码分开（§34）

上层：[设计说明索引](../DESIGN.md)。相关：[§22.8](./pitfalls.md)（品牌动效资产）、[§30](./brand-pack.md)（品牌档案是唯一真源）。

## 34. 仓库只放代码，私人产物放工作区

### 症状

一次普通的 `git push`（16 个本地提交）把 **Hippie 青年的头/尾图源**推上了公开仓库。
推送者没有识别出来：`git status` 里 `assets-src/motion/*.svg` 与 `packages/core/src/*.ts`
长得一样，都是「被跟踪的文件」；`git log --oneline` 也只看得到「B 头图：两只鸟左移」。

### 原因

私人产物住在**被 git 跟踪的仓库路径**里，于是「提交什么」与「什么是私人的」之间没有任何机器可判的边界：

| 位置 | 是什么 | 当时的状态 |
|---|---|---|
| `assets-src/motion/`、`docs/assets/brand-motion/` | 品牌头/尾图、logo 的 SVG 源与定稿副本 | **被跟踪** |
| `articles/`、`articles/hippie/originals/` | 文章、人的初版快照 | 在仓库目录里（ignore，但物理混住） |
| `.env` | `LLM_API_KEY` / `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 在仓库根（ignore） |
| `assets-src/review/`、`docs/assets/hippie-articles/`、`.ui-shots/` | 整页渲染、评审截图 | 在仓库里（ignore） |
| `assets-src/contact.mjs` 等 | 脚本里写死开发机的绝对路径（`<盘符>:/<repo>/...`、`<home>/.stylewx/...`） | 代码知道你本机的目录布局 |

**判据**：只要私人产物在被跟踪的路径里，「这次提交会不会泄露」就只能靠人逐个提交去读 ——
而人在看 16 个提交时一定会漏。边界必须由**路径**给出，不能由注意力给出。

### 防线

1. **工作区与仓库分离。** 私人产物一律在工作区（默认与仓库同级 `../stylewx-workspace`，
   用 `STYLEWX_WORKSPACE` 指过去）：`articles/`、`brand/motion/`、`brand/motion-shipped/`、
   `out/`、`.env`。仓库里只剩代码、生成器、CI 闸门与**项目自己的**配图（`docs/assets/banner-*` 等）。
2. **路径统一从 `assets-src/paths.mjs` 解析。** 未设 `STYLEWX_WORKSPACE` 就**就地报错**，
   不做「猜一个默认目录」的兜底 —— 兜底会让私人产物悄悄写回仓库。
3. **机器闸门**：`node scripts/ci/check-private-paths.mjs`（CI 里跑，也可挂 pre-push）。
   提交一旦触及私人路径就非零退出。靠人眼识别「哪些文件是私人的」已经失败过一次，
   所以这条闸门是**路径级**的，不依赖判断。
4. **推送前逐提交过内容**：`git log --name-status origin/main..HEAD` 走一遍，
   把「私人资产 / 文章 / 本机产物」单独列出来确认。闸门只拦已知路径，新类别的私人文件靠这一步。

### 代价

- 脚本要改：凡是引用 `assets-src/motion/`、`articles/`、`docs/assets/hippie-articles/`、
  `.ui-shots/`、`.env` 的地方都改成从 `paths.mjs` 取，且必须有 `STYLEWX_WORKSPACE` 才能跑。
- 文档里的示例图如果引用私人资产，会 404 —— 项目配图（banner、theme-library）留在仓库里，
  私人那套（Hippie 三套头/尾图）只留在工作区。
- 历史里已有的私人资产**不会因为搬家而消失**：搬家只保证「从现在起不再进仓库」。
  要从历史里清除得重写历史（force push，所有 commit SHA 变、tag 与 Release 指到的提交被孤立），
  与搬家是两件独立的事。
