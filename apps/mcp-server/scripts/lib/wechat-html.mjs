/**
 * 微信编辑器侧的 HTML 预加工（只给「注入浏览器后台」这条路用，预览路径一律不碰）。
 *
 * 这些变换的共同点：本地预览看不出来，只有进微信后台保存后才现形 —— 所以必须发生在
 * 注入之前、且和渲染分开，否则会反过来破坏本地预览。
 */

/**
 * 代码块换行「焊死」：`<pre>` 内的换行 → `<br>`，并去掉 `pre` 自带的 `white-space`。
 *
 * 症状：代码块所有行挤成一段文字。
 * 原因：微信编辑器在粘贴/保存时剥掉 `pre` 上的 `white-space`（`pre` 的 UA 默认样式也一并没了），
 *       `<br>` 是内容里的硬换行，剥不掉。
 * 代价：去掉 `white-space` 后，在**没**被剥的环境里也不会和 `<br>` 叠成双倍行距 ——
 *       换行只由 `<br>` 决定，两种环境表现一致。代码块的「行内前导空格」仍然会塌
 *       （要保留得写 `&nbsp;`，那会让读者复制代码时粘出一串不断行空格，不做）。
 *
 * 属性里可能有裸 `>`（见 §24：escapeAttr 刻意不转义 `>`），所以开标签按「带引号整段吞」匹配。
 */
export function freezeCodeBlockBreaks(html) {
  let blocks = 0
  const out = html.replace(/<pre((?:"[^"]*"|[^>"])*)>([\s\S]*?)<\/pre>/g, (_full, attrs, body) => {
    blocks += 1
    const cleaned = attrs.replace(/\s*white-space\s*:[^;"]*;?/g, '')
    // 末尾那条换行是渲染器的排版产物（`<pre>text\n</pre>` 或 `<pre><code>text\n</code></pre>`），
    // 转成 `<br>` 会在代码块末尾多一条空行
    const text = body
      .replace(/\r\n?/g, '\n')
      .replace(/\n$/, '')
      .replace(/\n(<\/code>)$/, '$1')
    return `<pre${cleaned}>${text.replace(/\n/g, '<br>')}</pre>`
  })
  return { html: out, blocks }
}
