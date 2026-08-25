import test from 'node:test'
import assert from 'node:assert/strict'
import { SessionRuntime } from '../src/core/session-runtime.js'
import { ToolRuntime } from '../src/core/tool-runtime.js'

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
