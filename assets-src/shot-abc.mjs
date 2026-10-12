// 把品牌 A/B/C 三套头尾图 + hip-letter 各拍一张，用于肉眼判断差异是否足够
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderPreview } from '../packages/service/dist/index.js'
import { chromium } from '../packages/preview/node_modules/playwright/index.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(HERE)

const brand = JSON.parse(readFileSync('C:/Users/wjun/.stylewx/brands/hippie-youth/profile.json', 'utf8'));
const uc = {};
for (const c of brand.components) uc[c.name] = { template: c.template, defaults: c.defaults ?? {} };

const variants = [
  ['A 归途', 'hip-head-a', 'hip-end-a'],
  ['B 灯下', 'hip-head-b', 'hip-end-b'],
  ['C 行囊', 'hip-head-c', 'hip-end-c'],
];

mkdirSync('.ui-shots/abc', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });

for (const [label, head, end] of variants) {
  const md = `::::canvas{tone="paper" padding="16px"}\n\n:::${head}\n:::\n\n:::section-title{index="01" title="示例章节"}\n:::\n\n:::hip-quote\n引用样式对比用的一行字。\n:::\n\n:::${end}\n:::\n\n::::`;
  const r = await renderPreview(md, brand.theme, { includeScreenshot: false, userComponents: uc });
  await page.setContent(`<html><body style="margin:0">${r.html}</body></html>`);
  await page.waitForTimeout(7000); // 等 SMIL 动画播完再拍，否则抓到中间帧
  const file = `.ui-shots/abc/${label.replace(' ', '-')}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(label, '->', file);
}

// 单独一张 hip-letter
const md = `::::canvas{tone="paper" padding="16px"}\n\n:::hip-letter\n:::\n\n::::`;
const r = await renderPreview(md, brand.theme, { includeScreenshot: false, userComponents: uc });
await page.setContent(`<html><body style="margin:0">${r.html}</body></html>`);
await page.waitForTimeout(7000); // 等 SMIL 动画播完再拍，否则抓到中间帧
await page.screenshot({ path: '.ui-shots/abc/letter.png', fullPage: true });
console.log('letter -> .ui-shots/abc/letter.png');

await browser.close();
