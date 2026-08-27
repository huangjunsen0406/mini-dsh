/**
 * Rough token estimation for LLM messages.
 *
 * Like the official token-meter, this deliberately uses one fixed heuristic
 * (four characters per token plus a small structural overhead per message)
 * instead of an exact provider tokenizer. Model capacity belongs to adapters;
 * the meter only answers "how full is the context roughly".
 */
export class TokenMeterRuntime {
    /**
     * @param {object} [options]
     * @param {number} [options.structureOverhead] fixed tokens per message
     */
    constructor({ structureOverhead = 4 } = {}) {
        this.structureOverhead = structureOverhead
    }

    estimateText(text) {
        if (!text) return 0
        return Math.ceil(String(text).length / 4)
    }

    estimateMessage(message) {
        let tokens = this.structureOverhead

        if (typeof message.content === 'string') {
            tokens += this.estimateText(message.content)
        }

        if (message.reasoning_content) {
            tokens += this.estimateText(message.reasoning_content)
        }

        if (Array.isArray(message.tool_calls)) {
            tokens += this.estimateText(JSON.stringify(message.tool_calls))
        }

        return tokens
    }

    measure(messages) {
        return (messages ?? []).reduce((sum, message) => sum + this.estimateMessage(message), 0)
    }
}
