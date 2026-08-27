function toText(value) {
    if (typeof value === 'string') return value
    return JSON.stringify(value, null, 2)
}

function blocksToText(blocks) {
    if (!Array.isArray(blocks)) return toText(blocks)
    return blocks
        .map((block) => {
            if (block?.type === 'text') return block.text ?? ''
            return toText(block)
        })
        .filter(Boolean)
        .join('\n')
}

/**
 * In-memory tool registry and execution runtime.
 *
 * Registers tools, exposes OpenAI-compatible function schemas, and executes
 * tool calls. Always returns a { value, content, isError } result so the
 * session log can record a tool/result regardless of execution success.
 */
export class ToolRuntime {
    #tools = new Map()

    register(definition) {
        if (!definition?.name) throw new Error('tool.name is required')
        if (typeof definition.execute !== 'function')
            throw new Error(`tool is missing execute(): ${definition.name}`)
        if (this.#tools.has(definition.name))
            throw new Error(`duplicate tool name: ${definition.name}`)

        this.#tools.set(definition.name, definition)
        let disposed = false

        // Return unregister function to allow cleaning up tools on disposal.
        return () => {
            if (disposed) return
            disposed = true
            if (this.#tools.get(definition.name) === definition) this.#tools.delete(definition.name)
        }
    }

    get(name) {
        return this.#tools.get(name)
    }

    list() {
        return [...this.#tools.values()]
    }

    // Format tools as OpenAI-compatible Chat Completions function schemas.
    schemas() {
        return this.list().map((tool) => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description ?? '',
                parameters: tool.parameters ?? { type: 'object', properties: {} },
            },
        }))
    }

    async execute(name, args, exec = {}) {
        const tool = this.get(name)
        if (!tool) {
            return {
                value: null,
                content: [{ type: 'text', text: `Unknown tool: ${name}` }],
                isError: true,
            }
        }

        const execution = {
            signal: exec.signal ?? new AbortController().signal,
            sessionId: exec.sessionId,
            toolCallId: exec.toolCallId,
            agent: exec.agent,
        }

        try {
            const value = await tool.execute(args, execution)
            // Use custom render if defined; otherwise stringify the value.
            const content = tool.output?.render
                ? tool.output.render(args, value)
                : [{ type: 'text', text: toText(value) }]

            let result = { value, content, isError: false }
            if (typeof tool.finalizeContent === 'function') {
                const finalized = await tool.finalizeContent(execution, result)
                if (finalized !== undefined) result = { ...result, content: finalized }
            }
            return result
        } catch (error) {
            return {
                value: null,
                content: [{ type: 'text', text: `ToolError: ${error?.message ?? String(error)}` }],
                isError: true,
            }
        }
    }

    renderResult(result) {
        return blocksToText(result.content)
    }
}
