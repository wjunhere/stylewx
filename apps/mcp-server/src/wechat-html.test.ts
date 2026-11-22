/**
 * `scripts/lib/wechat-html.mjs` 的测试。
 *
 * 一个字符串变换，却决定「代码块进微信后是否还分得清行」—— 手工目测守不住，
 * 所以放在这里跟着 CI 跑（脚本本身不进测试，只有这个纯函数进）。
 */
import { describe, expect, it } from 'vitest'
import { freezeCodeBlockBreaks } from '../scripts/lib/wechat-html.mjs'

describe('freezeCodeBlockBreaks', () => {
  it('把 pre 内的换行换成 br，并去掉 pre 声明的 white-space', () => {
    const html = '<p>x</p><pre style="background-color: #f6f8fa; white-space: pre-wrap"><code>a\nb</code></pre>'
    const r = freezeCodeBlockBreaks(html)
    expect(r.blocks).toBe(1)
    expect(r.html).toBe('<p>x</p><pre style="background-color: #f6f8fa;"><code>a<br>b</code></pre>')
  })

  it('末尾那条换行不算行（否则代码块下面多一条空行）', () => {
    expect(freezeCodeBlockBreaks('<pre>a\nb\n</pre>').html).toBe('<pre>a<br>b</pre>')
    expect(freezeCodeBlockBreaks('<pre><code>a\nb\n</code></pre>').html).toBe('<pre><code>a<br>b</code></pre>')
  })

  it('CRLF 归一化；行内前导空格原样保留（是否塌由微信决定）', () => {
    const r = freezeCodeBlockBreaks('<pre><code>a\r\n  b</code></pre>')
    expect(r.html).toBe('<pre><code>a<br>  b</code></pre>')
  })

  it('属性里出现裸 > 也能整段匹配（§24：escapeAttr 不转义 >）', () => {
    const html = '<pre style="color: red" data-tip="a --> b"><code>x\ny</code></pre><p>z</p>'
    const r = freezeCodeBlockBreaks(html)
    expect(r.blocks).toBe(1)
    expect(r.html).toBe('<pre style="color: red" data-tip="a --> b"><code>x<br>y</code></pre><p>z</p>')
  })

  it('没有 pre 时原样返回', () => {
    const html = '<p>no code here</p>'
    const r = freezeCodeBlockBreaks(html)
    expect(r).toEqual({ html, blocks: 0 })
  })
})
