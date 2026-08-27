import { Service } from '@deepseek-ai/cordis'
import { TokenMeterRuntime } from '../core/token-meter-runtime.js'

/**
 * Wraps TokenMeterRuntime as a Cordis Service so other plugins can
 * access it via ctx.tokenMeter.
 */
class TokenMeterService extends Service {
    constructor(ctx) {
        super(ctx, 'tokenMeter')
        this.runtime = new TokenMeterRuntime()
    }

    estimateText(text) {
        return this.runtime.estimateText(text)
    }

    estimateMessage(message) {
        return this.runtime.estimateMessage(message)
    }

    measure(messages) {
        return this.runtime.measure(messages)
    }
}

export const name = 'mini-token-meter'

export function apply(ctx) {
    ctx.plugin(TokenMeterService)
}
