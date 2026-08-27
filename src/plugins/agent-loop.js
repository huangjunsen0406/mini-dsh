import { Service } from '@deepseek-ai/cordis'
import { AgentLoopRuntime } from '../core/agent-loop-runtime.js'

/**
 * Wraps AgentLoopRuntime as a Cordis Service so other plugins can
 * access it via ctx.agentLoop. inject waits until sessions, systemPrompt,
 * tools, llm, and compaction are ready before constructing the loop.
 */
class AgentLoopService extends Service {
    static inject = ['sessions', 'systemPrompt', 'tools', 'llm', 'compaction']

    constructor(ctx) {
        super(ctx, 'agentLoop')
        this.runtime = new AgentLoopRuntime({
            sessions: ctx.sessions,
            systemPrompt: ctx.systemPrompt,
            tools: ctx.tools,
            llm: ctx.llm,
            compaction: ctx.compaction,
        })
    }

    run(agent, input, options) {
        return this.runtime.run(agent, input, options)
    }
}

export const name = 'mini-agent-loop'
export const inject = ['sessions', 'systemPrompt', 'tools', 'llm', 'compaction']

export function apply(ctx) {
    ctx.plugin(AgentLoopService)
}
