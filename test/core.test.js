import test from 'node:test'
import assert from 'node:assert/strict'
import { SessionRuntime } from '../src/core/session-runtime.js'
import { ToolRuntime } from '../src/core/tool-runtime.js'
import { SystemPromptRuntime } from '../src/core/system-prompt-runtime.js'
import { LlmRuntime } from '../src/core/llm-runtime.js'
import { AgentRuntime } from '../src/core/agent-runtime.js'
import { AgentLoopRuntime } from '../src/core/agent-loop-runtime.js'

test('Session derives tool-call history from the event log and keeps reasoning_content', () => {
  const sessions = new SessionRuntime()
  const s = sessions.create()

  sessions.append(s.id, 'user/message', { content: 'what time is it' })
  sessions.append(s.id, 'assistant/tool_calls', {
    reasoningContent: 'I need to call bash date',
    toolCalls: [{ id: 'c1', name: 'bash', arguments: { command: 'date' } }],
  })
  sessions.append(s.id, 'tool/result', {
    toolCallId: 'c1',
    content: '12:00',
  })

  const messages = sessions.deriveMessages(s.id)
  assert.equal(messages[1].reasoning_content, 'I need to call bash date')
  assert.equal(messages[1].tool_calls[0].function.name, 'bash')
  assert.equal(messages[2].role, 'tool')
})

test('ToolRuntime register returns a disposer and renders results as text', async () => {
  const tools = new ToolRuntime()
  const dispose = tools.register({
    name: 'echo',
    description: 'echo',
    parameters: { type: 'object' },
    execute: async args => args,
  })

  assert.equal(tools.schemas().length, 1)
  const result = await tools.execute('echo', { a: 1 })
  assert.match(tools.renderResult(result), /"a": 1/)

  dispose()
  assert.equal(tools.schemas().length, 0)
})

test('SystemPrompt assembles by order and disposer unregisters fragments', async () => {
  const prompt = new SystemPromptRuntime()
  prompt.section({ name: 'b', order: 20, text: 'B' })
  const dispose = prompt.context({ name: 'a', order: 10, text: () => 'A' })

  assert.equal(await prompt.assemble(), 'A\n\nB')
  dispose()
  assert.equal(await prompt.assemble(), 'B')
})

test('LlmRuntime routes chat to the selected provider and disposer unregisters it', async () => {
  const llm = new LlmRuntime()
  const calls = []
  const dispose = llm.register('mock', {
    models: ['fast'],
    chat: async request => {
      calls.push(request)
      return { content: 'ok' }
    },
  })

  assert.equal(llm.defaultSelection(), 'mock/fast')
  assert.deepEqual(llm.models(), ['mock/fast'])
  assert.equal(llm.has('mock/fast'), true)

  const reply = await llm.chat({ messages: [] })
  assert.equal(reply.content, 'ok')
  assert.equal(calls[0].model, 'fast')

  dispose()
  assert.deepEqual(llm.models(), [])
})

test('LlmRuntime selects an upstream model with provider/model', async () => {
  const llm = new LlmRuntime()
  let receivedModel = null

  llm.register('mock', {
    models: ['a', 'b'],
    async chat({ model }) {
      receivedModel = model
      return { content: model, toolCalls: [] }
    },
  }, { defaultModel: 'a' })

  assert.deepEqual(llm.models(), ['mock/a', 'mock/b'])
  assert.equal(llm.has('mock/b'), true)

  const result = await llm.chat({}, 'mock/b')
  assert.equal(result.content, 'b')
  assert.equal(receivedModel, 'b')
})

test('Agent loop completes a model -> tool -> model turn', async () => {
  const sessions = new SessionRuntime()
  const systemPrompt = new SystemPromptRuntime()
  const tools = new ToolRuntime()
  const llm = new LlmRuntime()
  const agents = new AgentRuntime()

  tools.register({
    name: 'clock',
    description: 'clock',
    parameters: { type: 'object', properties: {} },
    execute: async () => '2026-08-25T17:25:00+08:00',
  })

  let calls = 0
  llm.register('mock', {
    models: ['demo'],
    async chat({ messages }) {
      calls += 1
      if (calls === 1) {
        return {
          reasoningContent: 'look up the time first',
          toolCalls: [{ id: 't1', name: 'clock', arguments: {} }],
        }
      }

      const toolMessage = messages.at(-1)
      assert.equal(toolMessage.role, 'tool')
      return { content: `it is ${toolMessage.content}`, toolCalls: [] }
    },
  }, { defaultModel: 'demo' })

  const s = sessions.create()
  const loop = new AgentLoopRuntime({ sessions, systemPrompt, tools, llm })
  const agent = agents.create({
    sessionId: s.id,
    model: 'mock/demo',
    loop,
  })

  const answer = await agent.send('what time is it')
  assert.match(answer, /2026-08-25/)
  assert.equal(calls, 2)
})

test('Agent loop has no 12-step cap and finishes after 20 tool calls', async () => {
  const sessions = new SessionRuntime()
  const systemPrompt = new SystemPromptRuntime()
  const tools = new ToolRuntime()
  const llm = new LlmRuntime()
  const agents = new AgentRuntime()

  tools.register({
    name: 'tick',
    description: 'tick',
    parameters: { type: 'object', properties: {} },
    execute: async () => 'ok',
  })

  let modelCalls = 0
  llm.register('mock', {
    models: ['long'],
    async chat() {
      modelCalls += 1
      if (modelCalls <= 20) {
        return {
          toolCalls: [
            {
              id: `call-${modelCalls}`,
              name: 'tick',
              arguments: {},
            },
          ],
        }
      }
      return { content: 'done', toolCalls: [] }
    },
  }, { defaultModel: 'long' })

  const s = sessions.create()
  const loop = new AgentLoopRuntime({ sessions, systemPrompt, tools, llm })
  const agent = agents.create({
    sessionId: s.id,
    model: 'mock/long',
    loop,
  })

  const answer = await agent.send('run a long task')
  assert.equal(answer, 'done')
  assert.equal(modelCalls, 21)
})

test('Agent loop streams reasoning, content, tool-call, and tool-result chunks', async () => {
  const sessions = new SessionRuntime()
  const systemPrompt = new SystemPromptRuntime()
  const tools = new ToolRuntime()
  const llm = new LlmRuntime()
  const agents = new AgentRuntime()

  tools.register({
    name: 'search',
    description: 'search tool',
    parameters: { type: 'object', properties: { q: { type: 'string' } } },
    execute: async args => `result for ${args.q}`,
  })

  let step = 0
  llm.register('mock', {
    models: ['stream-model'],
    async chat({ onReasoning, onContent }) {
      step += 1
      if (step === 1) {
        onReasoning?.('think-1')
        onReasoning?.('think-2')
        return {
          reasoningContent: 'think-1think-2',
          toolCalls: [{ id: 'tc1', name: 'search', arguments: { q: 'foo' } }],
        }
      }
      onContent?.('hello ')
      onContent?.('world')
      return {
        content: 'hello world',
        toolCalls: [],
      }
    },
  }, { defaultModel: 'stream-model' })

  const s = sessions.create()
  const loop = new AgentLoopRuntime({ sessions, systemPrompt, tools, llm })
  const agent = agents.create({
    sessionId: s.id,
    model: 'mock/stream-model',
    loop,
  })

  const reasoningChunks = []
  const contentChunks = []
  const toolCalls = []
  const toolResults = []

  const answer = await agent.send('test stream', {
    onReasoning: c => reasoningChunks.push(c),
    onContent: c => contentChunks.push(c),
    onToolCall: tc => toolCalls.push(tc),
    onToolResult: tr => toolResults.push(tr),
  })

  assert.equal(answer, 'hello world')
  assert.deepEqual(reasoningChunks, ['think-1', 'think-2'])
  assert.deepEqual(contentChunks, ['hello ', 'world'])
  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0].name, 'search')
  assert.equal(toolResults.length, 1)
  assert.match(toolResults[0].renderedContent, /result for foo/)
})