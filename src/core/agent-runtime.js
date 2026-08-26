import { randomUUID } from 'node:crypto'

/**
 * Minimal agent registry.
 *
 * An agent is a thin handle: session + model + loop. send() just
 * forwards to the loop. Register returns a disposer so a plugin can
 * drop its agent on dispose.
 */
export class AgentRuntime {
  #agents = new Map()

  register(agent) {
    if (this.#agents.has(agent.id)) {
      throw new Error(`duplicate agent: ${agent.id}`)
    }

    this.#agents.set(agent.id, agent)

    let disposed = false
    // Return unregister function to allow cleaning up agents on disposal.
    return () => {
      if (disposed) return
      disposed = true
      if (this.#agents.get(agent.id) === agent) {
        this.#agents.delete(agent.id)
      }
    }
  }

  create({ sessionId, model, loop, name = 'default' }) {
    const agent = {
      id: randomUUID(),
      name,
      sessionId,
      model,

      async send(input, options = {}) {
        return loop.run(agent, input, options)
      },
    }

    this.register(agent)
    return agent
  }

  list() {
    return [...this.#agents.values()]
  }
}
