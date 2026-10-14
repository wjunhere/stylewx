#!/usr/bin/env node
/**
 * check-brands.mjs —— 品牌三方一致性闸门（`pnpm check:brands`）。
 *
 * 品牌信息同时存在三处：
 *   1. 品牌目录 `~/.stylewx/brands/<name>/`（profile.json + brand.md）—— **唯一真源**
 *   2. `~/.stylewx/themes.json`     —— 派生副本（编辑器主题下拉读它）
 *   3. `~/.stylewx/components.json` —— 派生副本（渲染时按 :::名字 解析）
 *
 * 三处会漂，而且没有任何东西检查（实测：ink-ledger 的组件从来没同步进
 * components.json；hippie-youth 的 brand.md 写着已被改掉的 C「行囊」）。
 * 本脚本就是那个检查：不一致就退出码非零。
 *
 * 用法：
 *   node scripts/brand/check-brands.mjs            # 检查（无品牌时跳过，退出码 0）
 *   node scripts/brand/check-brands.mjs --fix      # 修自动段与派生副本（不碰 profile.json）
 *   node scripts/brand/check-brands.mjs --json     # 输出 JSON（给工具消费）
 *
 * 真源只能由人 / agent 通过 brand_save 改；--fix 只修「能从真源重算的东西」。
 */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..', '..')
const SERVICE_DIST = resolve(REPO, 'packages', 'service', 'dist', 'index.js')

if (!existsSync(SERVICE_DIST)) {
  console.error('check-brands: 找不到 packages/service/dist —— 先跑 `pnpm build`。')
  process.exit(2)
}

const { brandDoctor, brandFix } = await import(pathToFileURL(SERVICE_DIST).href)

const fix = process.argv.includes('--fix')
const json = process.argv.includes('--json')

if (fix) {
  const repaired = brandFix()
  if (!json) {
    console.log('check-brands --fix')
    if (repaired.docsSynced.length) console.log('  补写 brand.md 自动段：' + repaired.docsSynced.join('、'))
    if (repaired.themesSynced.length) console.log('  同步主题副本：' + repaired.themesSynced.join('、'))
    if (repaired.componentsSynced.length) console.log('  同步组件副本：' + repaired.componentsSynced.join('、'))
    if (repaired.skipped) {
      console.log('  ⚠ 没有找到任何品牌档案：什么都没修（检查 STYLEWX_BRANDS_PATH / 品牌目录）')
    } else if (!repaired.docsSynced.length && !repaired.themesSynced.length && !repaired.componentsSynced.length) {
      console.log('  无需修改')
    }
  }
}

const report = brandDoctor()

if (json) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(`check-brands: ${report.brands.length} 个品牌（${report.brands.join('、') || '无'}）`)
  for (const issue of report.issues) {
    const tag = issue.severity === 'error' ? '✗' : '!'
    console.log(`  ${tag} [${issue.brand}] ${issue.message}`)
    console.log(`      → ${issue.hint}`)
  }
  // 一个品牌都没有时**不能说「一致」**：退出码 0 只表达「没东西可检」，不表达「检查通过」。
  // 这正是环境变量被指错时会发生的假绿（实测踩过）。
  if (report.skipped) {
    console.log('  ⚠ 没有找到任何品牌档案：本次什么都没检查。')
    console.log('    如果不是预期，检查 STYLEWX_BRANDS_PATH 是否被指到了别处。')
  } else if (report.ok) {
    console.log(`  ✓ 三方一致（真源 ↔ 副本 ↔ brand.md 自动段）`)
  }
}

process.exit(report.ok ? 0 : 1)
