/**
 * 操作 Windows 原生「打开/保存」文件对话框 —— **填好路径，人按回车**。
 *
 * 为什么需要它（实测背景，见 docs/DESIGN.md §20.10）：
 * 微信编辑器里「视频 → 本地上传」唤起的是**原生文件选择器**，页面 DOM 里
 * **不存在** `video` 类型的 `<input type=file>`，所以：
 *   - 扩展桥（kimi-webbridge `upload`）无目标可指 → **驱动不了**
 *   - CDP 的 `DOM.setFileInputFiles` 同样需要 DOM input → **也驱动不了**
 *   - 但「打开」对话框是标准 Shell 窗口，有完整 UIA 树，**写路径那一步可以自动化**
 *
 * 边界（重要，别越过）：
 *   - ✅ **可以做**：找到真对话框（滤掉幽灵窗口）、命中「文件名」输入框、`set_value` 写路径、核对写入结果
 *   - ❌ **做不了**：点「打开」确认。后台投递会**假成功**（返回 ok 但对话框不关、文件不进），
 *     报 `background_unavailable / uia_status: unavailable`。所以本模块不点确认，
 *     把路径填好后交给人按一下回车。
 *
 * 曾经写成「全自动」并报告成功过，但那不可复现（当时窗口恰在前台才蒙对了）。
 * 一个「有时能用」的自动化比没有更糟 —— 它会半途停下，留下一个开着对话框的编辑器。
 *
 * 本模块只做「对话框」这一层；浏览器绑定、点击入口等由调用方负责。
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)

/** cua-driver CLI 路径。可用 CUA_DRIVER_BIN 覆盖。 */
export function cuaBin() {
  if (process.env.CUA_DRIVER_BIN) return process.env.CUA_DRIVER_BIN
  // 用 join 拼，绝不写字面反斜杠：字符串里的 `\P` / `\b` 会被 JS 当转义序列吃掉
  // （`\Programs` 丢反斜杠、`\bin` 直接变退格符）。第一次写就踩了这个坑。
  return join(
    process.env.LOCALAPPDATA ?? '',
    'Programs',
    'Cua',
    'cua-driver',
    'bin',
    'cua-driver.exe',
  )
}

/**
 * 调一个 cua-driver 工具，返回解析后的 JSON。
 *
 * 走 CLI（`cua-driver call <tool> <json>`）而不是 MCP：脚本里直接用更简单，
 * 且与常驻 daemon 共用同一套会话/授权状态（daemon 未跑时 CLI 会自行拉起）。
 *
 * ⚠️ 必须用 execFile 传参数数组，不能拼 shell 字符串 —— Windows 路径里的
 * 反斜杠与引号会被 shell 吃掉（本仓 §22.7 记过同类问题）。
 */
export async function cuaCall(tool, args = {}, { timeoutMs = 60000 } = {}) {
  const { stdout } = await execFileAsync(cuaBin(), ['call', tool, JSON.stringify(args)], {
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  })
  const text = stdout.trim()
  if (!text) throw new Error(`cua-driver ${tool} 返回空输出`)
  const parsed = JSON.parse(text)
  // 工具级失败（refusal / isError）统一抛错，调用方不必到处判
  if (parsed?.status === 'refused' || parsed?.isError) {
    const msg = parsed.refusal?.message ?? parsed.error ?? JSON.stringify(parsed).slice(0, 200)
    const err = new Error(`cua-driver ${tool} 被拒绝：${msg}`)
    err.code = parsed.refusal?.code ?? 'cua_refused'
    throw err
  }
  return parsed
}

/** 列出窗口，可只列某个 pid。 */
export async function listWindows(pid) {
  const d = await cuaCall('list_windows', pid ? { pid } : {}, { timeoutMs: 30000 })
  return d.windows ?? d._legacy_windows ?? []
}

/**
 * 等一个「打开」类对话框出现，并返回**真正可用**的那个。
 *
 * 关键：对话框是浏览器的**独立子进程窗口**，pid 与浏览器主进程**不同**
 * （实测 Chrome 主进程 49528、对话框 51576），所以要按标题全桌面找，不能按浏览器 pid 过滤。
 *
 * 另一个实测坑：**会有同名幽灵窗口**。上一个浏览器进程被杀后，它的对话框窗口可能残留
 * 在系统窗口列表里（只剩 5 个元素、无比名框），且与新对话框标题完全相同。
 * 所以这里不能只按标题取第一个 —— 要取**有「文件名」输入框和确认按钮**的那个。
 *
 * @param {{ titles?: string[], timeoutMs?: number, pollMs?: number, excludePids?: number[] }} opts
 */
export async function waitForFileDialog({
  titles = ['打开', 'Open'],
  timeoutMs = 15000,
  pollMs = 400,
  excludePids = [],
} = {}) {
  const deadline = Date.now() + timeoutMs
  const wanted = new Set(titles)
  let lastCandidates = []
  while (Date.now() < deadline) {
    const ws = await listWindows()
    const cands = ws.filter((w) => wanted.has(String(w.title ?? '').trim()) && !excludePids.includes(w.pid))
    lastCandidates = cands
    for (const c of cands) {
      // 用 UIA 树里「有别名字框 + 有确认按钮」作为「这是真对话框」的判据
      try {
        const st = await cuaCall('get_window_state', { pid: c.pid, window_id: c.window_id })
        const els = st.elements ?? []
        const hasName = els.some((e) => e.role === 'Edit' && /文件名|File name/i.test(String(e.label ?? '')))
        const hasOk = els.some((e) => e.role === 'Button' && /^(打开|保存|Open|Save)/i.test(String(e.label ?? '').trim()))
        if (hasName && hasOk) return c
      } catch {
        // 幽灵窗口快照可能直接失败；跳过试下一个
      }
    }
    await new Promise((r) => setTimeout(r, pollMs))
  }
  const detail = lastCandidates.length
    ? `找到 ${lastCandidates.length} 个同名窗口，但都没有完整的文件名框/确认按钮（可能是已死进程的幽灵窗口）`
    : `没找到标题为 ${[...wanted].join('/')} 的窗口`
  throw new Error(`等文件对话框超时（${timeoutMs}ms）：${detail}。`)
}

/**
 * 在一个已找到的文件对话框里填路径并确认。
 *
 * 元素按 UIA role/label 定位，**不按坐标** —— 对话框的布局随系统主题/DPI/语言变化，
 * 坐标会漂；role+label 稳定。找不到就明确报错，绝不猜着点。
 *
 * 重要：本函数**只写到「路径已填好」为止，不点确认**。
 *
 * 为何不点（实测结论，见 docs/DESIGN.md §20.10）：
 * 「打开」对话框的确认按钮**拒绝后台投递**。`click`（UIA Invoke）会返回成功，但对话框不关、
 * 文件也不进；报错是 `background_unavailable / uia_status: unavailable`。试过的都无效：
 * bring_to_front 后再 Invoke、聚焦 + press_key Enter、escalate_session、坐标点击、get_desktop_state。
 * 所以正确解法是「机器填好、人按回车」——这也是本模块存在的意义：
 * 把容易出错的「找窗口 + 命中右那个输入框 + 拼正确路径」做好，把唯一需要前台的一下留给人。
 *
 * 曾经写成「自动点确认」并报告成功过，但那不可复现：当时窗口恰好在**前台**才蒙对了。
 * 一个「有时能用」的自动化比没有更糟——它会半途停下，留下一个开着对话框的编辑器。
 *
 * @returns {{ fileNameElement: string, fileName: string, confirmElement: string, confirmLabel: string }}
 *   `confirmElement` 一并返回，供调用方在需要时自行尝试前台点击。
 */
export async function fillFileDialog(dialog, filePath, { session = 'native-file-dialog' } = {}) {
  // 防「静默损坏的路径」——这是本模块最危险的一类输入：
  // 路径里的字面反斜杠很容易在上游被 JS/shell 吃掉一层（`\v` 变垂直制表符、`\b` 变退格），
  // 于是字符串看着像路径，其实已经坏了。对话框会回「文件名无效」，但那时已经点过一次了。
  // 所以在这里先拦住控制字符，并给一个能直接看出问题的错误。
  const badChar = [...filePath].find((c) => c.charCodeAt(0) < 32)
  if (badChar !== undefined) {
    const pos = filePath.indexOf(badChar)
    throw new Error(
      `文件路径含控制字符 U+${badChar.charCodeAt(0).toString(16).padStart(4, '0')}（位置 ${pos}）：` +
        `${JSON.stringify(filePath)}。` +
        '这是上游把字面反斜杠当转义序列吃掉了（`\\v` 会变垂直制表符、`\\b` 变退格）。' +
        '请改用正斜杠，或用 join() 拼路径。',
    )
  }

  const { pid, window_id: windowId } = dialog
  const st = await cuaCall(
    'get_window_state',
    { pid, window_id: windowId, session, include_accessibility_tree: true },
    { timeoutMs: 60000 },
  )
  const els = st.elements ?? []

  // 排除「ComboBox 的子元素」——文件名/文件类型两个 ComboBox 内部都有一个 label 为
  // 「打开」的下拉按钮（id=DropDown），它会跟真正的确认按钮撞名。实测第一个版本就是
  // 抓到了那个下拉按钮，于是 set_value 写进去了、点却没反应，对话框不关。
  const byIndex = new Map(els.map((e) => [e.element_index, e]))
  const isComboChild = (el) => {
    let p = byIndex.get(el.parent_index)
    let depth = 0
    while (p && depth++ < 4) {
      if (p.role === 'ComboBox') return true
      p = byIndex.get(p.parent_index)
    }
    return false
  }

  // 文件名输入框：优先 role=Edit 且 label 含「文件名」；退化到对话框里唯一的 Edit
  const nameRe = /文件名|File name|名稱|Name/i
  let nameEl = els.find((e) => e.role === 'Edit' && nameRe.test(String(e.label ?? '')))
  if (!nameEl) {
    const edits = els.filter((e) => e.role === 'Edit' && (e.actions ?? []).includes('set_value') && !isComboChild(e))
    if (edits.length === 1) nameEl = edits[0]
  }
  if (!nameEl) {
    throw new Error('在文件对话框里找不到「文件名」输入框（UIA 树里没有可 set_value 的 Edit）。')
  }

  // 确认按钮：「打开(O)」/「保存(S)」这类，label 以打开或保存开头，且支持 invoke，
  // 且不能在 ComboBox 里面。多个候选时优先带快捷键括注的那个（真正的确认按钮都有）。
  const okRe = /^(打开|保存|Open|Save)/i
  const cands = els.filter(
    (e) =>
      e.role === 'Button' &&
      okRe.test(String(e.label ?? '').trim()) &&
      (e.actions ?? []).includes('invoke') &&
      !isComboChild(e),
  )
  const okEl =
    cands.find((e) => /[（(][A-Z][)）]\s*$/.test(String(e.label ?? '').trim())) ?? cands[0]
  if (!okEl) {
    throw new Error('在文件对话框里找不到「打开/保存」按钮。')
  }

  await cuaCall(
    'set_value',
    { pid, window_id: windowId, element_token: nameEl.element_token, value: filePath, session },
    { timeoutMs: 30000 },
  )

  // 写完核对一次：对话框有时会把路径规范化（正斜杠 → 反斜杠），也可能直接拒绝。
  // 不核对就叫人按回车，人看不到真实状态。
  //
  // 注意：**不能靠 element_token 比对再次快照**，因为 token 的「代」号每次快照都会递增
  // （实测 `s00000027:121` → `s00000028:121`，后半截索引才稳定）。所以按 role+label 重新定位。
  const check = await cuaCall(
    'get_window_state',
    { pid, window_id: windowId, session, include_accessibility_tree: true },
    { timeoutMs: 60000 },
  )
  const after = (check.elements ?? []).find(
    (e) => e.role === 'Edit' && String(e.label ?? '').trim() === String(nameEl.label ?? '').trim(),
  )
  const actual = String(after?.value ?? '')
  const baseName = filePath.split(/[\\/]/).pop() ?? ''
  const accepted = !!baseName && actual.includes(baseName)

  return {
    fileNameElement: nameEl.element_token,
    fileName: actual || filePath,
    confirmElement: okEl.element_token,
    confirmLabel: String(okEl.label ?? '').trim(),
    /** 对话框是否接受了这个路径（false 时别让人按回车，先修路径）。 */
    accepted,
  }
}

/**
 * 在**已知窗口处于前台**时尝试点确认。
 *
 * 默认不要用：后台投递会假成功（返回 ok 但对话框不关）。保留此函数是为了给
 * 「人能确认窗口已在前台」的场景一个显式入口 —— 调用方必须先自行确认前提，
 * 且必须用 `waitForDialogGone` 验证结果，不能信返回值。
 */
export async function tryConfirmForeground(dialog, elementToken, { session = 'native-file-dialog' } = {}) {
  const { pid, window_id: windowId } = dialog
  await cuaCall('bring_to_front', { pid, window_id: windowId }, { timeoutMs: 15000 })
  await cuaCall('click', { pid, window_id: windowId, element_token: elementToken, session }, { timeoutMs: 15000 })
  return waitForDialogGone(dialog, { timeoutMs: 5000 })
}

/** 等对话框消失（确认成功的必要条件，不是充分条件）。 */
export async function waitForDialogGone(dialog, { timeoutMs = 10000, pollMs = 400 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ws = await listWindows(dialog.pid)
    if (!ws.some((w) => w.window_id === dialog.window_id)) return true
    await new Promise((r) => setTimeout(r, pollMs))
  }
  return false
}
