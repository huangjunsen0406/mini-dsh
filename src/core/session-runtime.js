import { randomUUID } from 'node:crypto'

/**
 * In-memory session store.
 *
 * Stores event logs rather than static chat messages, deriving chat history
 * on demand when communicating with the model so tool calls, results, and
 * reasoning_content live in a unified log.
 */
export class SessionRuntime {
    #sessions = new Map()

    create(meta = {}) {
        const id = randomUUID()

        const session = {
            id,
            meta: { ...meta },
            events: [],
            createdAt: new Date().toISOString(),
        }

        this.#sessions.set(id, session)
        // Initialize log with a session/start event.
        this.append(id, 'session/start', { meta })
        return session
    }

    get(id) {
        const session = this.#sessions.get(id)
        if (!session) {
            throw new Error(`Session ${id} not found`)
        }
        return session
    }

    append(id, type, data) {
        const session = this.get(id)

        const event = {
            seq: session.events.length + 1,
            type,
            data,
            at: new Date().toISOString(),
        }
        session.events.push(event)

        return event
    }

    clear(id) {
        const old = this.get(id)
        old.events = []
        this.append(id, 'session/start', { meta: old.meta, reset: true })
    }

    list() {
        return [...this.#sessions.values()]
    }

    /**
     * Folds the event log into OpenAI-style chat messages.
     * Skips non-message event types such as session/start.
     *
     * A `session/compact` event replaces every message event up to its
     * `upToSeq` with a single summary message. The newest compaction wins:
     * its summary already carries older summaries forward, so only the
     * largest upToSeq is applied. The log itself is never rewritten —
     * compaction only changes the projection.
     */
    deriveMessages(id) {
        const events = this.get(id).events

        let compaction = null
        for (const event of events) {
            if (event.type === 'session/compact') compaction = event
        }

        const messages = []

        if (compaction) {
            messages.push({ role: 'user', content: compaction.data.summary })
        }

        for (const event of events) {
            if (compaction && event.seq <= compaction.data.upToSeq) continue

            const { type, data } = event

            if (type === 'user/message') {
                messages.push({
                    role: 'user',
                    content: data.content,
                })
            }

            if (type === 'assistant/message') {
                messages.push({
                    role: 'assistant',
                    content: data.content,
                })
            }

            if (type === 'assistant/tool_calls') {
                messages.push({
                    role: 'assistant',
                    content: data.content ?? null,
                    // Attach reasoning_content only when present.
                    ...(data.reasoningContent ? { reasoning_content: data.reasoningContent } : {}),
                    tool_calls: data.toolCalls.map((call) => ({
                        id: call.id,
                        type: 'function',
                        function: {
                            name: call.name,
                            // Chat Completions expects arguments as a JSON string.
                            arguments: JSON.stringify(call.arguments ?? {}),
                        },
                    })),
                })
            }

            if (type === 'tool/result') {
                messages.push({
                    role: 'tool',
                    tool_call_id: data.toolCallId,
                    content: data.content,
                })
            }
        }

        return messages
    }
}
