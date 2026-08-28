/**
 * 微信公众号发布配置。
 * 仅通过环境变量注入凭据（绝不硬编码/提交）：
 *   - WECHAT_APP_ID      公众号 AppID
 *   - WECHAT_APP_SECRET  公众号 AppSecret
 *   - WECHAT_API_BASE    可选，默认 https://api.weixin.qq.com
 * 缺凭据时给出明确错误，避免静默失败。
 */

export interface PublisherConfig {
  appId: string
  appSecret: string
  /** 微信 API 基地址，仅在测试/私有化时覆盖。 */
  baseUrl: string
  /** 注入的 fetch 实现（默认 global fetch），便于测试 mock。 */
  fetchImpl?: typeof fetch
}

export interface HttpConfig {
  baseUrl: string
  fetchImpl: typeof fetch
}

/** 从环境变量加载配置；缺少凭据时抛出明确中文错误。 */
export function loadConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PublisherConfig {
  const appId = env.WECHAT_APP_ID?.trim()
  const appSecret = env.WECHAT_APP_SECRET?.trim()

  if (!appId || !appSecret) {
    const missing: string[] = []
    if (!appId) missing.push('WECHAT_APP_ID')
    if (!appSecret) missing.push('WECHAT_APP_SECRET')
    throw new Error(
      `缺少微信公众号凭据环境变量：${missing.join('、')}。请在 .env 或启动命令中设置后重试。示例：MCP_APP 启动前 export WECHAT_APP_ID=... WECHAT_APP_SECRET=...`,
    )
  }

  return {
    appId,
    appSecret,
    baseUrl: env.WECHAT_API_BASE?.trim() || 'https://api.weixin.qq.com',
  }
}

export function toHttpConfig(config: PublisherConfig): HttpConfig {
  return {
    baseUrl: config.baseUrl,
    fetchImpl: config.fetchImpl ?? globalThis.fetch,
  }
}
