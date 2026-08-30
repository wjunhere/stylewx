/**
 * REST API 入口。从环境读取 LLM / 微信配置（缺则对应端点返回明确错误）。
 */
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadLlmConfigFromEnv, LlmClient } from '@stylewx/service'
import { loadConfigFromEnv, WeChatClient } from '@stylewx/publisher'
import type { ApiDeps } from './app.js'

function buildDeps(): ApiDeps {
  const deps: ApiDeps = {}
  try {
    deps.llm = new LlmClient(loadLlmConfigFromEnv())
  } catch {
    deps.llm = undefined
  }
  try {
    deps.wechat = new WeChatClient(loadConfigFromEnv())
  } catch {
    deps.wechat = undefined
  }
  return deps
}

const port = Number(process.env.PORT ?? 3001)
const app = createApp(buildDeps())

serve({ fetch: app.fetch, port }, (info) => {
  // eslint-disable-next-line no-console
  console.error(`[stylewx] REST API listening on http://localhost:${info.port}`)
})
