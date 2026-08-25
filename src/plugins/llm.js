import { Service } from '@deepseek-ai/cordis'
import { LlmRuntime } from '../core/llm-runtime.js'

/**
 * Wraps LlmRuntime as a Cordis Service so other plugins can
 * access it via ctx.llm. Provider adapters register themselves on this service.
 */
class LlmService extends Service {
    constructor(ctx) {
        super(ctx, 'llm')
        this.runtime = new LlmRuntime()
    }

    register(provider, adapter, options) {
        return this.runtime.register(provider, adapter, options)
    }

    models() {
        return this.runtime.models()
    }

    defaultSelection() {
        return this.runtime.defaultSelection()
    }

    has(selection) {
        return this.runtime.has(selection)
    }

    chat(request, selection) {
        return this.runtime.chat(request, selection)
    }
}

export const name = 'mini-llm'

export function apply(ctx) {
    ctx.plugin(LlmService)
}
