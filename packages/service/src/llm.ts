/**
 * OpenAI 兼容的 LLM 客户端（结构化输出）。
 * 通过 JSON Schema 约束模型输出，供 generate_theme 使用。
 *
 * 环境变量：
 *   - LLM_BASE_URL   OpenAI 兼容 API 地址（如 https://api.openai.com/v1）
 *   - LLM_API_KEY    API 密钥
 *   - LLM_MODEL      模型名（如 gpt-4o-mini / deepseek-chat）
 * 任何凭据都只从环境读取，绝不硬编码。
 */

export interface LlmConfig {
  baseUrl: string
  apiKey: string
  model: string
  fetchImpl?: typeof fetch
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmJsonOptions {
  /** 用于约束输出的 JSON Schema。 */
  schema: Record<string, unknown>
  /** 响应格式名称（用于 json_schema response_format）。 */
  name: string
  temperature?: number
  maxTokens?: number
}

export interface LlmClientConfig {
  baseUrl: string
  apiKey: string
  model: string
  fetchImpl?: typeof fetch
}

/** 从环境变量加载 LLM 配置；缺少关键项时给出明确错误。 */
export function loadLlmConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const baseUrl = env.LLM_BASE_URL?.trim() ?? ''
  const apiKey = env.LLM_API_KEY?.trim() ?? ''
  const model = env.LLM_MODEL?.trim() ?? ''
  const missing: string[] = []
  if (!baseUrl) missing.push('LLM_BASE_URL')
  if (!apiKey) missing.push('LLM_API_KEY')
  if (!model) missing.push('LLM_MODEL')
  if (missing.length > 0) {
    throw new Error(
      `缺少 LLM 环境变量：${missing.join('、')}。generate_theme 需要一个 OpenAI 兼容接口。示例：LLM_BASE_URL=https://api.openai.com/v1 LLM_API_KEY=... LLM_MODEL=gpt-4o-mini`,
    )
  }
  return { baseUrl, apiKey, model }
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
  private readonly config: LlmClientConfig
  private readonly fetchImpl: typeof fetch

  constructor(config: LlmClientConfig) {
    this.config = config
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch
  }

  /**
   * 请求结构化 JSON 输出。
   * 优先使用 response_format=json_schema 约束；若提供方不支持，则回退到 json_object
   * 并从文本中提取 JSON。
   */
  async completeJson(
    messages: LlmMessage[],
    options: LlmJsonOptions,
  ): Promise<unknown> {
    const temperature = options.temperature ?? 0.4
    const maxTokens = options.maxTokens ?? 1200
    const payload = {
      model: this.config.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: options.name,
          strict: true,
          schema: options.schema,
        },
      },
    }

    try {
      const text = await this.request(payload)
      return extractJson(text)
    } catch (error) {
      // 退化到 json_object + 文本提取（部分兼容端点不支持 json_schema）
      const fallbackPayload = {
        ...payload,
        response_format: { type: 'json_object' },
      }
      const text = await this.request(fallbackPayload)
      return extractJson(text)
    }
  }

  /** 请求纯文本输出。 */
  async completeText(messages: LlmMessage[], options: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
    const payload = {
      model: this.config.model,
      messages,
      temperature: options.temperature ?? 0.4,
      max_tokens: options.maxTokens ?? 1024,
    }
    return this.request(payload)
  }

  private async request(payload: unknown): Promise<string> {
    const url = this.config.baseUrl.replace(/\/$/, '') + '/chat/completions'
    const response = await this.fetchImpl(url, {
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
    const data = JSON.parse(text) as { choices: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('LLM 返回内容为空。')
    }
    return content
  }
}
