/**
 * OpenAI 兼容的 LLM 客户端（结构化输出）。
 * 通过 JSON Schema 约束模型输出，供 generate_theme 使用。
 *
 * 环境变量：
 *   - LLM_BASE_URL    OpenAI 兼容 API 基地址（如 https://api.openai.com/v1，或 opencode go 的 https://opencode.ai/zen/go/v1）
 *   - LLM_API_KEY     API 密钥
 *   - LLM_MODEL       模型名
 *   - LLM_API_STYLE   端点风格：'chat'（/chat/completions，默认）或 'responses'（/responses，如 opencode go）
 * 任何凭据都只从环境读取，绝不硬编码。
 */

export type ApiStyle = 'chat' | 'responses'

export interface LlmConfig {
  baseUrl: string
  apiKey: string
  model: string
  apiStyle?: ApiStyle
  fetchImpl?: typeof fetch
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmJsonOptions {
  /** 用于约束输出的 JSON Schema。 */
  schema: Record<string, unknown>
  /** 响应格式名称（用于 json_schema）。 */
  name: string
  temperature?: number
  maxTokens?: number
}

/** 从环境变量加载 LLM 配置；缺少关键项或 style 不合法时给出明确错误。 */
export function loadLlmConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const baseUrl = env.LLM_BASE_URL?.trim() ?? ''
  const apiKey = env.LLM_API_KEY?.trim() ?? ''
  const model = env.LLM_MODEL?.trim() ?? ''
  const rawStyle = (env.LLM_API_STYLE?.trim() ?? 'chat').toLowerCase()
  const apiStyle: ApiStyle = rawStyle === 'responses' ? 'responses' : 'chat'
  const missing: string[] = []
  if (!baseUrl) missing.push('LLM_BASE_URL')
  if (!apiKey) missing.push('LLM_API_KEY')
  if (!model) missing.push('LLM_MODEL')
  if (missing.length > 0) {
    throw new Error(
      `缺少 LLM 环境变量：${missing.join('、')}。generate_theme 需要一个 OpenAI 兼容接口。示例：LLM_BASE_URL=https://api.openai.com/v1 LLM_API_KEY=... LLM_MODEL=gpt-4o-mini`,
    )
  }
  return { baseUrl, apiKey, model, apiStyle }
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('模型输出中未找到 JSON 对象。')
  }
  return JSON.parse(text.slice(start, end + 1))
}

export class LlmClient {
  private readonly config: LlmConfig
  private readonly fetchImpl: typeof fetch

  constructor(config: LlmConfig) {
    this.config = config
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch
  }

  private get apiStyle(): ApiStyle {
    return this.config.apiStyle ?? 'chat'
  }

  /** 组装 JSON 结构输出请求体（按端点风格差异）。 */
  private buildJsonPayload(
    messages: LlmMessage[],
    options: LlmJsonOptions,
    fallbackToText: boolean,
  ): Record<string, unknown> {
    const temperature = options.temperature ?? 0.4
    const maxTokens = options.maxTokens ?? 1200
    if (this.apiStyle === 'responses') {
      const textFormat = fallbackToText
        ? { type: 'text' }
        : {
            type: 'json_schema',
            name: options.name,
            strict: true,
            schema: options.schema,
          }
      return {
        model: this.config.model,
        input: toResponsesInput(messages),
        temperature,
        max_output_tokens: maxTokens,
        stream: false,
        text: { format: textFormat },
      }
    }
    // chat / completions
    return {
      model: this.config.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: fallbackToText
        ? { type: 'text' }
        : {
            type: 'json_schema',
            json_schema: {
              name: options.name,
              strict: true,
              schema: options.schema,
            },
          },
    }
  }

  /**
   * 请求结构化 JSON 输出。
   * 优先用 json_schema 约束模型；若端点报错，则退化到普通文本输出并从文本中提取 JSON。
   */
  async completeJson(messages: LlmMessage[], options: LlmJsonOptions): Promise<unknown> {
    try {
      const text = await this.request(this.buildJsonPayload(messages, options, false))
      return extractJson(text)
    } catch (error) {
      // 退化：不约束 schema，交由 extractJson 从纯文本中提取
      const text = await this.request(this.buildJsonPayload(messages, options, true))
      return extractJson(text)
    }
  }

  /** 请求纯文本输出。 */
  async completeText(messages: LlmMessage[], options: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
    const temperature = options.temperature ?? 0.4
    const maxTokens = options.maxTokens ?? 1024
    const payload =
      this.apiStyle === 'responses'
        ? {
            model: this.config.model,
            input: toResponsesInput(messages),
            temperature,
            max_output_tokens: maxTokens,
            stream: false,
            text: { format: { type: 'text' } },
          }
        : {
            model: this.config.model,
            messages,
            temperature,
            max_tokens: maxTokens,
          }
    return this.request(payload)
  }

  private endpoint(): string {
    const path = this.apiStyle === 'responses' ? '/responses' : '/chat/completions'
    return this.config.baseUrl.replace(/\/+$/, '') + path
  }

  private async request(payload: unknown): Promise<string> {
    const response = await this.fetchImpl(this.endpoint(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(payload),
    })
    const text = await response.text()
    if (!response.ok) {
      let detail = text
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string } }
        detail = parsed.error?.message ?? text
      } catch {
        // keep raw
      }
      throw new Error(`LLM 请求失败（HTTP ${response.status}）：${detail}`)
    }
    const data = JSON.parse(text) as Record<string, unknown>
    return extractOutputText(data, this.apiStyle)
  }
}

/** 把 chat 消息列表转换成 Responses API 的 input 结构。 */
function toResponsesInput(messages: LlmMessage[]): Array<{ role: string; content: Array<{ type: 'input_text'; text: string }> }> {
  return messages.map((m) => ({
    role: m.role,
    content: [{ type: 'input_text', text: m.content }],
  }))
}

/** 按端点风格从响应 JSON 中提取正文文本。 */
function extractOutputText(data: Record<string, unknown>, apiStyle: ApiStyle): string {
  if (apiStyle === 'responses') {
    const output = Array.isArray(data.output) ? (data.output as Array<Record<string, unknown>>) : []
    const chunks: string[] = []
    for (const item of output) {
      if (item.type === 'message') {
        const content = Array.isArray(item.content) ? (item.content as Array<Record<string, unknown>>) : []
        for (const c of content) {
          if (c.type === 'output_text' && typeof c.text === 'string') chunks.push(c.text)
        }
      }
    }
    const text = chunks.join('')
    if (text.trim()) return text
    // 兜底：某些端点把 output_text 放顶层
    const top = data.output_text
    if (typeof top === 'string' && top.trim()) return top
    throw new Error('LLM 返回内容为空（Responses 响应中未找到 output_text）。')
  }

  const choices = Array.isArray(data.choices) ? (data.choices as Array<{ message?: { content?: string } }>) : []
  const content = choices[0]?.message?.content
  if (typeof content === 'string' && content.trim()) return content
  throw new Error('LLM 返回内容为空。')
}
