/**
 * Compacts session history once the estimated context grows past a threshold.
 *
 * Mirrors the official design in miniature: compaction never mutates or
 * deletes log events. It appends a single `session/compact` event whose
 * `upToSeq` marks the covered prefix; deriveMessages() then projects that
 * prefix as one summary message instead of the original events. The log
 * stays append-only — "model-visible means logged" survives compaction.
 */
export class CompactionRuntime {
    /**
     * @param {object} options
     * @param {import('./session-runtime.js').SessionRuntime} options.sessions
     * @param {import('./token-meter-runtime.js').TokenMeterRuntime} options.tokenMeter
     * @param {(transcript: string, options: { signal?: AbortSignal }) => Promise<string>} options.summarize
     * @param {number} [options.threshold] token estimate that triggers compaction
     * @param {number} [options.keepEvents] default message events kept verbatim
     */
    constructor({ sessions, tokenMeter, summarize, threshold = 24000, keepEvents = 20 }) {
        this.sessions = sessions
        this.tokenMeter = tokenMeter
        this.summarize = summarize
        this.threshold = threshold
        this.keepEvents = keepEvents
    }

    measure(sessionId) {
        return this.tokenMeter.measure(this.sessions.deriveMessages(sessionId))
    }

    shouldCompact(sessionId) {
        return this.measure(sessionId) >= this.threshold
    }

    /**
     * Compact the covered prefix now, regardless of the threshold.
     *
     * The cut point must keep the projected message sequence valid: an
     * assistant tool_calls message and its tool results are never split.
     * Message events (user/message, assistant/*) are valid cut points;
     * tool/result is not — when the target lands on one, the compacted
     * prefix grows until the whole tool pair folds into the summary.
     *
     * @param {string} sessionId
     * @param {object} [options]
     * @param {number} [options.keepEvents] recent message events kept verbatim
     * @param {AbortSignal} [options.signal]
     * @returns {Promise<{ summary: string, upToSeq: number } | null>}
     * null when there is nothing older than the kept events to compact.
     */
    async compact(sessionId, { keepEvents = this.keepEvents, signal } = {}) {
        const events = this.sessions.get(sessionId).events

        const messageSeqs = events
            .filter((event) => MESSAGE_EVENT_TYPES.has(event.type))
            .map((event) => event.seq)

        if (messageSeqs.length <= keepEvents) return null

        // Index into messageSeqs of the first kept message event.
        let cut = messageSeqs.length - keepEvents

        // A tool/result first event would orphan its assistant tool_calls
        // in the summary; extend the compacted prefix past the pair.
        while (cut > 0 && !isCutPoint(events, messageSeqs[cut])) {
            cut -= 1
        }
        if (cut === 0) return null

        const upToSeq = messageSeqs[cut] - 1

        const transcript = renderTranscript(events, upToSeq)
        const summary = await this.summarize(transcript, { signal })

        this.sessions.append(sessionId, 'session/compact', {
            summary,
            upToSeq,
        })

        return { summary, upToSeq }
    }

    /**
     * Compact only when the estimated context has grown past the threshold.
     * Called at step boundaries by the agent loop.
     */
    async maybeCompact(sessionId, options) {
        if (!this.shouldCompact(sessionId)) return null
        return this.compact(sessionId, options)
    }
}

/**
 * Event types that fold into chat messages.
 */
const MESSAGE_EVENT_TYPES = new Set([
    'user/message',
    'assistant/message',
    'assistant/tool_calls',
    'tool/result',
])

/**
 * A message event is a valid cut point when nothing before it leaves an
 * assistant tool_calls message without its tool results. In practice that
 * means only tool/result events are invalid cut points: cutting anywhere
 * else keeps every tool pair on one side of the boundary.
 */
function isCutPoint(events, seq) {
    const event = events.find((item) => item.seq === seq)
    return event?.type !== 'tool/result'
}

/**
 * Flatten the compacted event prefix into plain text for the summarizer.
 */
function renderTranscript(events, upToSeq) {
    const lines = []

    for (const event of events) {
        if (event.seq > upToSeq) break
        const { type, data } = event

        if (type === 'user/message') {
            lines.push(`user: ${data.content}`)
        } else if (type === 'assistant/message') {
            lines.push(`assistant: ${data.content}`)
        } else if (type === 'assistant/tool_calls') {
            lines.push(`assistant tool calls: ${JSON.stringify(data.toolCalls)}`)
        } else if (type === 'tool/result') {
            lines.push(`tool ${data.name}: ${data.content}`)
        } else if (type === 'session/compact') {
            // Carry earlier summaries forward so stacked compactions
            // never lose the previously compacted history.
            lines.push(`summary of earlier history: ${data.summary}`)
        }
    }

    return lines.join('\n')
}
