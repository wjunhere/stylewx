/**
 * 私人产物的路径解析：文章、品牌图源（头/尾图、logo）、本机产物一律在**工作区**里，
 * 仓库只放代码。工作区默认 `B:/stylewx-workspace`，用 `STYLEWX_WORKSPACE` 指过去。
 *
 * 为什么要有这个文件：0.7.0 之前这些东西直接住在仓库里（`assets-src/motion/`、
 * `articles/`、`docs/assets/hippie-articles/`、`.env`），结果一次普通的 `git push`
 * 就把私人品牌资产推上了公开仓库（见 docs/design/pitfalls.md §33）。
 *
 * 一律走这里解析；未设置 `STYLEWX_WORKSPACE` 就**就地报错** —— 不做「猜一个默认目录」
 * 的兜底，免得又悄悄写回仓库。
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** 工作区根目录。没设就直接炸，并说清该设成什么。 */
export function workspaceDir() {
  const dir = process.env['STYLEWX_WORKSPACE']
  if (!dir) {
    throw new Error(
      '未设置 STYLEWX_WORKSPACE：私人产物（文章 / 品牌图源 / 本机产物）不在仓库里。\n' +
        '请在 .env 里写 STYLEWX_WORKSPACE=B:/stylewx-workspace（或换成你的工作区路径）。',
    )
  }
  return resolve(dir)
}

/** 文章工作区（原文、排版成品、封面图）。 */
export const articlesDir = () =>
  process.env['STYLEWX_ARTICLES_DIR'] ?? join(workspaceDir(), 'articles')

/** 品牌图源工作目录：头/尾图与 logo 的 SVG、组件模板、静帧。 */
export const brandMotionDir = () =>
  process.env['STYLEWX_BRAND_ASSETS_DIR'] ?? join(workspaceDir(), 'brand', 'motion')

/** 品牌图源的定稿副本（文档引用/归档的那一份）。 */
export const brandMotionShippedDir = () =>
  process.env['STYLEWX_BRAND_MOTION_SHIPPED_DIR'] ?? join(workspaceDir(), 'brand', 'motion-shipped')

/** 本机产物（截图、整页渲染、位图封面…），按子目录分。 */
export const outDir = (...parts) =>
  join(process.env['STYLEWX_OUT_DIR'] ?? join(workspaceDir(), 'out'), ...parts)

/** 凭据文件：`.env` 在工作区里，不放仓库。 */
export const envFilePath = () => process.env['STYLEWX_ENV_FILE'] ?? join(workspaceDir(), '.env')

/** 品牌档案目录（真源），与服务端 brand-store 的默认一致。 */
export const brandsDir = () =>
  process.env['STYLEWX_BRANDS_PATH'] ?? join(homedir(), '.stylewx', 'brands')

/** 读 .env 成对象；文件不存在返回空对象（要不要硬失败由调用方决定）。 */
export function readEnvFile(path = envFilePath()) {
  const env = {}
  if (!existsSync(path)) return env
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}
