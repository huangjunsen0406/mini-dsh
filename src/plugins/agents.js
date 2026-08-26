import { Service } from '@deepseek-ai/cordis'
import { AgentRuntime } from '../core/agent-runtime.js'

/**
 * Wraps AgentRuntime as a Cordis Service so other plugins can
 * access it via ctx.agents.
 */
class AgentsService extends Service {
  constructor(ctx) {
    super(ctx, 'agents')
    this.runtime = new AgentRuntime()
  }
  register(agent) { return this.runtime.register(agent) }
  create(options) { return this.runtime.create(options) }
  list() { return this.runtime.list() }
}

export const name = 'mini-agents'
export function apply(ctx) {
  ctx.plugin(AgentsService)
}
