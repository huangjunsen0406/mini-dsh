// I spin up a cordis Context and load a hello plugin — smallest host I can write.
import { Context } from '@deepseek-ai/cordis'

const ctx = new Context()
await ctx.plugin({
    name: 'hello',
    apply(ctx) {
        console.log('plugin loaded')
    },
})
