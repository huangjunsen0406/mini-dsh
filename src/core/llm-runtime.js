/**
 * In-memory LLM provider registry.
 *
 * Plugins register adapters keyed by provider name. chat() routes a request
 * to the selected provider/model. The first registered adapter with a model
 * becomes the default selection. Register returns a disposer so a plugin can
 * drop its adapter on dispose.
 */
export class LlmRuntime {
  #providers = new Map()
  #defaultSelection = null

  register(provider, adapter, { defaultModel } = {}) {
    if (this.#providers.has(provider)) {
      throw new Error(`duplicate LLM provider: ${provider}`)
    }

    this.#providers.set(provider, adapter)

    // First registered adapter with a model becomes the default selection.
    if (!this.#defaultSelection) {
      const model = defaultModel ?? adapter.models?.[0]
      if (model) this.#defaultSelection = `${provider}/${model}`
    }

    let disposed = false
    // Return unregister function to allow cleaning up adapters on disposal.
    return () => {
      if (disposed) return
      disposed = true
      if (this.#providers.get(provider) === adapter) {
        this.#providers.delete(provider)
      }
    }
  }

  // List provider/model ids for a simple /models command.
  models() {
    const out = []
    for (const [provider, adapter] of this.#providers) {
      for (const model of adapter.models ?? []) {
        out.push(`${provider}/${model}`)
      }
    }
    return out
  }

  defaultSelection() {
    return this.#defaultSelection
  }

  has(selection) {
    const { provider, model } = normalizeSelection(selection)
    const adapter = this.#providers.get(provider)
    if (!adapter) return false
    // Adapters without a models list accept any model name.
    if (!adapter.models?.length) return true
    return adapter.models.includes(model)
  }

  async chat(request, selection = this.#defaultSelection) {
    const { provider, model } = normalizeSelection(selection)
    const adapter = this.#providers.get(provider)

    if (!adapter) {
      throw new Error(`no LLM provider: ${provider}`)
    }

    return adapter.chat({ ...request, model })
  }
}

function normalizeSelection(selection) {
  if (!selection) throw new Error('no model selected')

  if (typeof selection === 'object') {
    if (!selection.provider || !selection.model) {
      throw new Error('model selection must include provider and model')
    }
    return selection
  }

  const slash = String(selection).indexOf('/')
  if (slash <= 0 || slash === String(selection).length - 1) {
    throw new Error(`invalid model selection: ${selection}, expected provider/model`)
  }

  return {
    provider: String(selection).slice(0, slash),
    model: String(selection).slice(slash + 1),
  }
}
