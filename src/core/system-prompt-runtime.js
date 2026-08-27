/**
 * Assembles the system prompt from named sections and contexts.
 *
 * Plugins register fragments as static text or async factories. assemble()
 * merges both stores, sorts by order, skips empty fragments, and joins the
 * rest. Register returns a disposer so a plugin can drop its fragments on dispose.
 */
export class SystemPromptRuntime {
    #sections = new Map()
    #contexts = new Map()

    section(section) {
        return this.#register(this.#sections, section, 'section')
    }

    context(context) {
        return this.#register(this.#contexts, context, 'context')
    }

    #register(store, item, kind) {
        if (!item?.name) throw new Error(`${kind}.name is required`)
        if (store.has(item.name)) throw new Error(`duplicate ${kind}: ${item.name}`)

        const normalized = {
            order: 0,
            ...item,
        }
        store.set(item.name, normalized)

        let disposed = false
        // Return unregister function to allow cleaning up fragments on disposal.
        return () => {
            if (disposed) return
            disposed = true
            if (store.get(item.name) === normalized) store.delete(item.name)
        }
    }

    async assemble(assembleContext = {}) {
        // Sections and contexts share one order space so plugins can interleave them.
        const entries = [...this.#sections.values(), ...this.#contexts.values()].sort(
            (a, b) => (a.order ?? 0) - (b.order ?? 0),
        )

        const parts = []
        for (const item of entries) {
            const text =
                typeof item.text === 'function' ? await item.text(assembleContext) : item.text
            if (text?.trim()) parts.push(text.trim())
        }
        return parts.join('\n\n')
    }

    inspect() {
        return {
            sections: [...this.#sections.values()].map(({ name, order }) => ({ name, order })),
            contexts: [...this.#contexts.values()].map(({ name, order }) => ({ name, order })),
        }
    }
}
