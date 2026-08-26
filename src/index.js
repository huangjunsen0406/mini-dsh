import { Context } from '@deepseek-ai/cordis'
import dotenv from 'dotenv'

import * as sessions from './plugins/sessions.js'
import * as systemPrompt from './plugins/system-prompt.js'
import * as tools from './plugins/tools.js'
import * as llm from './plugins/llm.js'
import * as agents from './plugins/agents.js'
import * as agentLoop from './plugins/agent-loop.js'
import * as runtimeContext from './plugins/runtime-context.js'
import * as deepseek from './models/deepseek.js'
import * as cli from './plugins/cli.js'

// Load .env before plugins that read environment variables.
dotenv.config()

const root = new Context()
const workspace = process.env.MINI_DSH_WORKSPACE ?? process.cwd()

await root.plugin(sessions)
await root.plugin(systemPrompt)
await root.plugin(tools)
await root.plugin(llm)
await root.plugin(agents)
await root.plugin(agentLoop)

await root.plugin(runtimeContext, { workspace })
await root.plugin(deepseek)
await root.plugin(cli, {
  model: process.env.MINI_DSH_MODEL ?? 'deepseek/deepseek-v4-pro',
})
