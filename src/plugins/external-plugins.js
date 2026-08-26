/**
 * Minimal loader for external Cordis / DSH plugins.
 *
 * This is not a plugin marketplace. It only checks the DSH idea that
 * matters here: if the ctx service contract an external plugin needs
 * is already implemented, ctx.plugin() can load it as-is.
 */
export const name = 'mini-external-plugins'

export async function apply(ctx, config = {}) {
    for (const entry of config.entries ?? []) {
        if (!entry?.package || entry.enabled === false) continue

        console.log(`[plugin] loading: ${entry.package}`)

        try {
            const mod = await import(entry.package)
            console.log(`[plugin] resolved: ${entry.package}`)

            // ctx.plugin() returns a Cordis Fiber. Await MCP-style async
            // plugins so their tools are registered before the CLI starts.
            const fiber = ctx.plugin(mod, entry.config ?? {})
            await fiber

            console.log(`[plugin] started: ${entry.package}`)
        } catch (error) {
            console.error(`[plugin] failed: ${entry.package}`)
            console.error(error?.stack ?? error)
            if (entry.required) throw error
        }
    }
}
