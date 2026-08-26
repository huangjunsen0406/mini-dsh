/**
 * Runs the model → tool → model loop against a session.
 *
 * Session events are the source of truth: user input, tool calls, and
 * results are appended to the log, then projected into LLM messages on
 * each step. There is no hard step cap — the loop ends when the model
 * returns no tool calls, or when the abort signal fires.
 */
export class AgentLoopRuntime {
  constructor({ sessions, systemPrompt, tools, llm }) {
    this.sessions = sessions
    this.systemPrompt = systemPrompt
    this.tools = tools
    this.llm = llm
  }

  async run(agent, input, { signal, onReasoning, onContent, onToolCall, onToolResult } = {}) {
    const sessionId = agent.sessionId

    // Session events are the source of truth; user input goes into the log first.
    this.sessions.append(sessionId, 'user/message', { content: input })

    let step = 0

    while (true) {
      step += 1

      if (signal?.aborted) {
        throw new Error('Agent run cancelled')
      }

      // Reassemble the system prompt every step so dynamic bits (time, cwd) stay fresh.
      const system = await this.systemPrompt.assemble({
        agent,
        sessionId,
        step,
      })

      // LLM messages are a projection of the session log, not a separate store.
      const messages = this.sessions.deriveMessages(sessionId)

      const response = await this.llm.chat({
        system,
        messages,
        tools: this.tools.schemas(),
        signal,
        onReasoning,
        onContent,
      }, agent.model)

      const toolCalls = response.toolCalls ?? []

      // No tool calls means the model considers the task done.
      if (toolCalls.length === 0) {
        const content = response.content ?? ''
        this.sessions.append(sessionId, 'assistant/message', { content })
        return content
      }

      // Keep reasoning_content on the same assistant/tool_calls event so later
      // requests can send DeepSeek thinking back with this turn.
      this.sessions.append(sessionId, 'assistant/tool_calls', {
        content: response.content ?? null,
        reasoningContent: response.reasoningContent,
        toolCalls,
      })

      // A single model turn may request several tools; run them all before the next turn.
      for (const call of toolCalls) {
        if (signal?.aborted) {
          throw new Error('Agent run cancelled')
        }

        onToolCall?.(call)

        const result = await this.tools.execute(
          call.name,
          call.arguments,
          {
            signal,
            sessionId,
            toolCallId: call.id,
            agent,
          },
        )

        const renderedContent = this.tools.renderResult(result)
        onToolResult?.({ ...result, renderedContent, name: call.name, toolCallId: call.id })

        this.sessions.append(sessionId, 'tool/result', {
          toolCallId: call.id,
          name: call.name,
          isError: result.isError,
          content: renderedContent,
        })
      }

      // Fall through to the next model turn.
    }
  }
}
