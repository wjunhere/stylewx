/**
 * 验证：组件库预览里的图片能真的显示出来。
 * 运行：node apps/mcp-server/scripts/verify-preview-images.mjs
 */
import { renderComponentPreviews } from '@stylewx/service'
import { getPresetTheme } from '@stylewx/theme'

const theme = getPresetTheme('magazine')
const { previews } = renderComponentPreviews(theme)

const withImages = previews.filter((p) => /<img\b|<image\b/.test(p.html))
console.log('含图片的组件:', withImages.map((p) => p.name).join(', '))

let bad = 0
for (const p of withImages) {
  const imgs = [...p.html.matchAll(/<(?:img|image)\b[^>]*>/g)].map((m) => m[0])
  const dataUris = imgs.filter((t) => /(?:src|href)="data:image\/svg\+xml/.test(t)).length
  const webUrls = imgs.filter((t) => /(?:src|href)="https?:/.test(t)).length
  const ok = dataUris === imgs.length && webUrls === 0
  if (!ok) bad += 1
  console.log(`  ${ok ? '✅' : '❌'} ${p.name}: 共 ${imgs.length} 张，data URI ${dataUris}，外链 ${webUrls}`)
}

console.log('\n样本仍是干净原文（不含 data URI）:')
const imagePreview = previews.find((p) => p.name === 'image')
const galleryPreview = previews.find((p) => p.name === 'gallery')
console.log('  image.sample  :', JSON.stringify(imagePreview?.sample.split('\n')[0]))
console.log('  gallery 第一行:', JSON.stringify(galleryPreview?.sample.split('\n')[1]))
const samplesClean = !previews.some((p) => p.sample.includes('data:image/'))
console.log('  所有 sample 均无 data URI:', samplesClean)

console.log('\n占位图可用性:')
const first = imagePreview?.html.match(/src="(data:image\/svg\+xml[^"]*)"/)?.[1] ?? ''
console.log('  长度:', first.length, '字符')
console.log('  可解码:', decodeURIComponent(first.replace(/^data:image\/svg\+xml;charset=utf-8,/, '')).startsWith('<svg'))

console.log(`\n结论: ${bad === 0 && samplesClean ? '✅ 全部组件的预览图片都已内联，不依赖网络' : '❌ 仍有问题'}`)
process.exit(bad === 0 && samplesClean ? 0 : 1)
