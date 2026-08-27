import { Service } from '@deepseek-ai/cordis'
import { CompactionRuntime } from '../core/compaction-runtime.js'

/**
 * Wraps CompactionRuntime as a Cordis Service so other plugins can
 * access it via ctx.compaction.
 *
 * The summarizer goes straight to ctx.llm — it never runs through the
 * agent loop and never appends usage to the session log, exactly like
 * the official compaction plugin calling llm.stream directly.
 */
class CompactionService extends Service {
    static inject = ['sessions', 'tokenMeter', 'llm']

    constructor(ctx, config) {
        super(ctx, 'compaction')
        this.runtime = new CompactionRuntime({
            sessions: ctx.sessions,
            tokenMeter: ctx.tokenMeter,
            summarize: (transcript, { signal }) => summarizeWithLlm(ctx.llm, transcript, signal),
            threshold: config.threshold,
        })
    }

    measure(sessionId) {
        return this.runtime.measure(sessionId)
    }

    shouldCompact(sessionId) {
        return this.runtime.shouldCompact(sessionId)
    }

    compact(sessionId, options) {
        return this.runtime.compact(sessionId, options)
    }

    maybeCompact(sessionId, options) {
        return this.runtime.maybeCompact(sessionId, options)
    }
}

async function summarizeWithLlm(llm, transcript, signal) {
    const response = await llm.chat({
        system:
            'Summarize the following conversation history for an AI coding assistant. ' +
            'Keep: the user goal, decisions made, file paths, commands run, and their outcomes. ' +
            'Drop small talk and tool output noise. Reply with the summary only.',
        messages: [{ role: 'user', content: transcript }],
        signal,
    })

    return response.content || '(empty summary)'
}

export const name = 'mini-compaction'
export const inject = ['sessions', 'tokenMeter', 'llm']

export function apply(ctx, config = {}) {
    ctx.plugin(CompactionService, {
        threshold: config.threshold ?? Number(process.env.MINI_DSH_COMPACT_AT ?? 24000),
    })
}
