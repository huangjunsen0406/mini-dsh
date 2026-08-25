import { randomUUID } from "node:crypto";

/**
 * I keep sessions in memory.
 *
 * I don't store chat messages. I append events, then derive the history
 * when I need to talk to the model — that way tool calls, results, and
 * reasoning_content all live in one log.
 */
export class SessionRuntime {
    #sessions = new Map();

    create(meta = {}) {
        const id = randomUUID();

        const session = {
            id,
            meta: { ...meta },
            events: [],
            createdAt: new Date().toISOString(),
        };

        this.#sessions.set(id, session);
        // I always start the log with a session/start event.
        this.append(id, "session/start", { meta });
        return session;
    }

    get(id) {
        const session = this.#sessions.get(id);
        if (!session) {
            throw new Error(`Session ${id} not found`);
        }
        return session;
    }

    append(id, type, data) {
        const session = this.get(id);

        const event = {
            seq: session.events.length + 1,
            type,
            data,
            at: new Date().toISOString(),
        };
        session.events.push(event);

        return event;
    }

    clear(id) {
        const old = this.get(id);
        old.events = [];
        this.append(id, "session/start", { meta: old.meta, reset: true });
    }

    /**
     * I fold the event log into OpenAI-style chat messages.
     * I skip types I don't care about, like session/start.
     */
    deriveMessages(id) {
        const events = this.get(id).events;
        const messages = [];

        for (const event of events) {
            const { type, data } = event;

            if (type === "user/message") {
                messages.push({
                    role: "user",
                    content: data.content,
                });
            }

            if (type === "assistant/message") {
                messages.push({
                    role: "assistant",
                    content: data.content,
                });
            }

            if (type === "assistant/tool_calls") {
                messages.push({
                    role: "assistant",
                    content: data.content ?? null,
                    // I only attach reasoning_content when the model actually thought.
                    ...(data.reasoningContent
                        ? { reasoning_content: data.reasoningContent }
                        : {}),
                    tool_calls: data.toolCalls.map((call) => ({
                        id: call.id,
                        type: "function",
                        function: {
                            name: call.name,
                            // Chat Completions wants arguments as a JSON string, so I stringify them.
                            arguments: JSON.stringify(call.arguments ?? {}),
                        },
                    })),
                });
            }

            if (type === 'tool/result') {
                messages.push({
                    role: 'tool',
                    tool_call_id: data.toolCallId,
                    content: data.content,
                })
            }
        }

        return messages;
    }
}
