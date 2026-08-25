// Import Context from cordis
import { Context } from '@deepseek-ai/cordis'

// Create a Context instance
const ctx = new Context()
await ctx.plugin({
    name: 'hello',
    apply(ctx) {
        console.log('plugin loaded')
    },
})
