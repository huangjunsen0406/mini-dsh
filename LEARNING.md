# Writing mini-dsh from scratch

English | [中文](./LEARNING.zh-CN.md)

This document is for people **touching an Agent Harness for the first time**.

Don't clone this repo as your starting point, and don't open the source to copy from it. The right way:

1. Create an empty project
2. Write it yourself through the 8 milestones below
3. Every step runs and passes tests
4. Only then open this repo and compare

This repo is the **answer key**, not your workbook.

By the end of the eight-day main track, you will have written all five abstractions of the Harness by hand and hooked up a real model. The sandbox, Bash, file tools, and Context7 are **not part of the main track**: they prove `ctx.tools` is enough, and the Loop does not change one line. To match all the source in this repo, do the **Supplement** at the end.

When you compare, use the README and the source; skim `ARCHITECTURE.md` when you lose the big picture. There is no handwritten `src/utils/env.js` — env vars go through `dotenv`.

---

## What you will learn is not "a chatbot"

In one line:

```text
Agent = Model + Harness
```

Model means DeepSeek / OpenAI and friends. Harness is what this project teaches: assembling model, tools, history, policy, and loop into an Agent that actually gets work done.

The core of the Harness is a composable Cordis Context:

```text
ctx.sessions
ctx.systemPrompt
ctx.tools
ctx.llm
ctx.agents
ctx.agentLoop
```

`ctx.sandbox` is a policy gate added in the Supplement — don't reference it ahead of time in the main track.

What a request actually goes through:

```text
User
 ↓
CLI
 ↓
agent.send()
 ↓
AgentLoop
 ↓
SessionEvent: user/message
 ↓
deriveMessages() + systemPrompt + tool schemas
 ↓
LLM
 ├─ no tool_calls -> assistant/message -> return
 └─ has tool_calls
       ↓
   ToolRuntime.execute()
       ↓
   SessionEvent: tool/result
       ↓
   back to LLM
```

The Agent Loop **doesn't know** what Bash, files, or Context7 are. It only knows `ctx.tools`. This is the most valuable lesson in the whole project.

---

## Before you start

- Node.js `>= 20.18.1`
- Some modern JavaScript (`import` / `async` / `class`)
- A DeepSeek API Key (only needed on Day 5)
- This repo as a reference — but don't read the implementation yet

One milestone per day is recommended. Finish that day's tests before moving on.

---

## Repo file overview

For cross-checking. Tick a box at each day's end. Sandbox-related files belong to the Supplement — don't write them into the CLI early.

| Day | Files you should write |
|---|---|
| 0 | `package.json` `.gitignore` `scripts/check-syntax.js` `src/index.js` |
| 1 | `src/core/session-runtime.js` `src/plugins/sessions.js` `test/core.test.js` (Session: two tests) |
| 2 | `src/core/tool-runtime.js` `src/plugins/tools.js` (add 1 test) |
| 3 | `src/core/system-prompt-runtime.js` `src/plugins/system-prompt.js` `src/core/llm-runtime.js` `src/plugins/llm.js` (add 3 tests) |
| 4 | `src/core/agent-runtime.js` `src/plugins/agents.js` `src/core/agent-loop-runtime.js` `src/plugins/agent-loop.js` (add 3 tests) |
| 5 | `.env.example` `src/models/deepseek.js` `src/plugins/runtime-context.js` `src/plugins/cli.js`; change `src/index.js` to wire them in (add 3 tests) |
| 6 | `plugins.config.js` `src/plugins/external-plugins.js`; change `src/index.js` to mount MCP (still no sandbox / bash / files) |
| 7 | No new files. Cross-check against the README and run the core acceptance |
| Supplement | `src/utils/path.js` `src/core/sandbox-runtime.js` `src/plugins/sandbox.js` `src/tools/files.js` `src/tools/bash.js`; change CLI Approval / Esc and `index.js` (add 6 tests) |

In this repo, the files you **don't hand-write — just read**: `README.md` `README.zh-CN.md` `pnpm-lock.yaml`.

`test/core.test.js` is cumulative: add each day's tests to it. **By the end of Day 7 of the main track you should have 12 tests.** The Supplement adds 6 more, matching this repo's **18**. Test titles must be identical to this repo's (in English), so you can cross-check:

| Day | Added | Total | Test title |
|---|---|---|---|
| 0 | 0 | 0 | No `test/` yet — don't run `pnpm test` |
| 1 | 2 | 2 | `Session derives tool-call history from the event log and keeps reasoning_content`; `Session clear keeps the same id and drops derived chat history` |
| 2 | 1 | 3 | `ToolRuntime register returns a disposer and renders results as text` |
| 3 | 3 | 6 | `SystemPrompt assembles by order and disposer unregisters fragments`; `LlmRuntime routes chat to the selected provider and disposer unregisters it`; `LlmRuntime selects an upstream model with provider/model` |
| 4 | 3 | 9 | `Agent loop completes a model -> tool -> model turn`; `Agent loop has no 12-step cap and finishes after 20 tool calls`; `Agent loop streams reasoning, content, tool-call, and tool-result chunks` |
| 5 | 3 | 12 | `streamed tool_calls concatenate name once, not read_fileread_file`; `parseSSE flushes a last line without a trailing newline and recognizes data:[DONE]`; `finalizeToolCalls sorts by index, drops empty names, and throws on invalid JSON` |
| 6 | 0 | 12 | MCP has no automated tests. If it connects, verify manually with `/tools`; the CLI must start even if it doesn't |
| 7 | 0 | 12 | All 12 core tests green = pass |
| Supplement | 6 | 18 | `resolveInside blocks .. and absolute escapes but allows a ..hidden filename`; `Sandbox blocks dangerous commands and allows ordinary workspace commands`; `Sandbox approval auto-approves or throws when the user rejects`; `Sandbox expands env paths before the escape check instead of banning them`; `allowHosts uses the provided whitelist and does not hardcode localhost`; `glob matches both substrings and * / ** wildcards` |

**Test boundary (holds for every later day):** `pnpm test` only covers `core/` and a few exported pure functions (SSE; paths and glob arrive in the Supplement). `src/plugins/*` are thin forwards — **no Cordis integration tests**. Whether your plugins are right is judged by comparing against the source and, from Day 5 on, by manual CLI checks.

---

## Day 0: an empty project that runs

Create a new directory — don't copy files from this repo.

```bash
mkdir mini-dsh-learn && cd mini-dsh-learn
pnpm init
```

### Files to write today

```text
package.json
.gitignore
scripts/check-syntax.js
src/index.js
```

`package.json` at minimum needs these:

```json
{
  "name": "mini-dsh-learn",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20.18.1"
  },
  "scripts": {
    "start": "node src/index.js",
    "test": "node --test test/*.test.js",
    "check": "node scripts/check-syntax.js"
  }
}
```

`.gitignore`:

```text
node_modules/
.env
.DS_Store
*.log
```

`scripts/check-syntax.js`: walk `src/` `test/` `scripts/` recursively and run `node --check` on every `.js`. On failure, print stderr and exit non-zero; on success print `syntax ok: N files`. Compare against the same-named file in this repo.

Install the core dependency:

```bash
pnpm add @deepseek-ai/cordis@4.0.1
```

First write a minimal entry to confirm Cordis boots:

```js
// src/index.js
import { Context } from '@deepseek-ai/cordis'

const root = new Context()

await root.plugin({
  name: 'hello',
  apply(ctx) {
    console.log('plugin loaded')
  },
})
```

```bash
node src/index.js
pnpm check
```

You pass when it prints `plugin loaded` and `pnpm check` reports syntax ok. Don't run `pnpm test` on Day 0: `test/` doesn't exist yet, and the shell glob won't match anything, which errors.

This step teaches only four things:

- `Context` is an empty container
- `plugin` stuffs capabilities into it
- The plugin shape is `{ name, apply(ctx) }` — `Service` comes later
- `pnpm check` is the syntax gate; run it first after every day's changes

Align your directory with this repo from the start:

```text
src/
  index.js          # plugin wiring only
  core/             # pure logic, no Cordis imports
  plugins/          # thin wrappers: mount runtimes onto ctx.xxx
  models/           # not until Day 5
  tools/            # Supplement only (bash / files)
  utils/
scripts/
test/
```

Layer separation matters: `core/` doesn't depend on Cordis, so tests can `new SessionRuntime()` directly without booting a whole Context.

Compare: `src/index.js` `scripts/check-syntax.js` `.gitignore` `package.json`

---

## Day 1: Session Event Log

Don't write the LLM first. Write the "chat history" first.

### Files to write today

```text
src/core/session-runtime.js
src/plugins/sessions.js
test/core.test.js
```

### The mental model to build

```text
SessionEvent[] = facts
messages       = projection for the model
```

Don't keep a second `messages[]`. Every user / assistant / tool call / tool result is first recorded as an event; project it into messages only when sending to the model.

### API to implement

| Method | Purpose |
|---|---|
| `create(meta)` | Create a session and write a `session/start` |
| `get(id)` | Get the session; throw if it doesn't exist |
| `append(id, type, data)` | Append an event with `seq` and `at` |
| `clear(id)` | Clear events, then write a `session/start` with `reset: true`. **Keep the same id** — don't delete the session and create a new one |
| `list()` | Return all current sessions |
| `deriveMessages(id)` | Project events into OpenAI-compatible messages |

The object returned by `create()` contains at least: `id` `meta` `events` `createdAt`.

An event contains at least: `seq` (incrementing from 1) `type` `data` `at` (ISO time).

Event types start with only these:

```text
session/start
user/message
assistant/message
assistant/tool_calls
tool/result
```

`session/start` does **not** enter `deriveMessages()`. It's a fact for `/history`, not a message for the model.

### Things to get right

1. `assistant/tool_calls` must be able to carry `reasoningContent`, projected as `reasoning_content`. When there's no reasoning, don't emit the field.
2. `tool/result` must carry `tool_call_id`, mapping to OpenAI's `role: 'tool'`.
3. When projecting `tool_calls`, `arguments` must be `JSON.stringify`-ed.
4. `assistant/message`'s `content` defaults to `''`; `assistant/tool_calls`'s `content` defaults to `null`.
5. `clear(id)` keeps the id, drops history. `/reset` relies on this — don't create a new session.

The projection looks roughly like this:

```js
[
  { role: 'user', content: 'what time is it' },
  {
    role: 'assistant',
    content: null,
    reasoning_content: 'I need to call bash date',
    tool_calls: [
      {
        id: 'c1',
        type: 'function',
        function: { name: 'bash', arguments: '{"command":"date"}' },
      },
    ],
  },
  { role: 'tool', tool_call_id: 'c1', content: '12:00' },
]
```

### Same-day tests

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { SessionRuntime } from '../src/core/session-runtime.js'

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

test('Session clear keeps the same id and drops derived chat history', () => {
  const sessions = new SessionRuntime()
  const s = sessions.create()
  const id = s.id

  sessions.append(id, 'user/message', { content: 'hello' })
  sessions.append(id, 'assistant/message', { content: 'hi' })
  sessions.clear(id)

  assert.equal(sessions.get(id).id, id)
  assert.equal(sessions.get(id).events[0].type, 'session/start')
  assert.equal(sessions.get(id).events[0].data.reset, true)
  assert.deepEqual(sessions.deriveMessages(id), [])
})
```

```bash
pnpm test
pnpm check
```

### Wrap it as a Cordis Service

`src/plugins/sessions.js` does exactly one thing: mount the runtime onto `ctx.sessions`.

```js
import { Service } from '@deepseek-ai/cordis'
import { SessionRuntime } from '../core/session-runtime.js'

class SessionsService extends Service {
  constructor(ctx) {
    super(ctx, 'sessions')
    this.runtime = new SessionRuntime()
  }
  create(meta) { return this.runtime.create(meta) }
  get(id) { return this.runtime.get(id) }
  append(id, type, data) { return this.runtime.append(id, type, data) }
  clear(id) { return this.runtime.clear(id) }
  list() { return this.runtime.list() }
  deriveMessages(id) { return this.runtime.deriveMessages(id) }
}

export const name = 'mini-sessions'
export function apply(ctx) {
  ctx.plugin(SessionsService)
}
```

Change `src/index.js` to load this plugin; the hello plugin can go. There's no CLI yet, so the process exits right after loading — that's normal.

Every later day adds plugins the same way: write the logic in `core/`, expose `ctx.xxx` in `plugins/`, and mount it in `src/index.js`. The plugin layer itself never goes into `pnpm test` — the runtimes are what's tested.

**Why this first:** every later module writes facts into the Session. If history is wrong, the Agent Loop will be wrong.

Compare: `src/core/session-runtime.js`, `src/plugins/sessions.js`, the first two tests in `test/core.test.js`.

---

## Day 2: Tool Runtime

### Files to write today

```text
src/core/tool-runtime.js
src/plugins/tools.js
test/core.test.js
```

The minimal contract:

```text
register(definition) → disposer
get(name)
list()
schemas()            → OpenAI function tools
execute(name, args, exec)  → { value, content, isError }
renderResult(result) → string
```

### Things to get right

1. `register()` **returns a disposer**. MCP's dynamic add/remove of tools and plugin unload rely on this. It's a no-op if called twice. Delete only the entry that is still that same definition.
2. Name conflicts, missing `name`, missing `execute` — throw at registration. English errors: e.g. `tool.name is required`.
3. Unknown tool or a thrown `execute` both return `{ isError: true, content: [...] }` — **never let the exception escape into the Agent Loop**.
4. `content` is a block array like `[{ type: 'text', text: '...' }]`.
5. If the tool has `output.render(args, value)`, use it to build content; otherwise `JSON.stringify` the value (strings stay as-is).
6. If the tool has `finalizeContent(execution, result)`, run it on the success path and replace `content` with its return value.

The second argument to `execute` is reserved for:

```js
{
  signal,       // new AbortController().signal if not passed
  sessionId,
  toolCallId,
  agent,
}
```

### Same-day tests

```js
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
```

Then wrap it as `src/plugins/tools.js`, exposing `ctx.tools` with all 6 methods forwarded verbatim, and mount it in `src/index.js`.

Compare: `src/core/tool-runtime.js`, `src/plugins/tools.js`

---

## Day 3: System Prompt + LLM Adapter

Still no real API.

### Files to write today

```text
src/core/system-prompt-runtime.js
src/plugins/system-prompt.js
src/core/llm-runtime.js
src/plugins/llm.js
test/core.test.js
```

### System Prompt

The API deliberately stays close to DSH:

```text
section({ name, order, text }) → disposer
context({ name, order, text }) → disposer
assemble(ctx) → string
inspect()
```

Conventions:

- `section` holds relatively static identity / rules
- `context` holds things that change every step (time, cwd)
- `text` can be a string or an `async (assembleContext) => string`
- `assemble()` merges sections + contexts by `order`, drops empty text, joins paragraphs with `\n\n`
- Duplicate names, missing `name` — throw
- The disposer undoes exactly that fragment; a second call is a no-op
- `inspect()` returns only `{ sections, contexts }`, each entry `{ name, order }`

```js
test('SystemPrompt assembles by order and disposer unregisters fragments', async () => {
  const prompt = new SystemPromptRuntime()
  prompt.section({ name: 'b', order: 20, text: 'B' })
  const dispose = prompt.context({ name: 'a', order: 10, text: () => 'A' })

  assert.equal(await prompt.assemble(), 'A\n\nB')
  dispose()
  assert.equal(await prompt.assemble(), 'B')
})
```

Wrap it as `ctx.systemPrompt`, forwarding `section` / `context` / `assemble` / `inspect`.

### LLM Runtime

The Agent Loop must **never** see a DeepSeek URL or API key. It only calls:

```js
ctx.llm.chat({ system, messages, tools, signal, onReasoning, onContent }, 'mock/demo')
```

The selection format is `provider/model`. `{ provider, model }` is also allowed.

```text
register(provider, adapter, { defaultModel }) → disposer
models()
defaultSelection()
has(selection)
chat(request, selection)
```

To get it right:

1. The first successfully registered adapter with a model decides `defaultSelection` (`defaultModel` wins, otherwise `adapter.models[0]`).
2. `chat()` splits the selection into `{ provider, model }` and passes `model` to the adapter — **don't** hand the whole `deepseek/xxx` string upstream.
3. Bad format, missing provider, missing selection — throw.
4. `has(selection)`: no provider → false; adapter without `models` → true; otherwise `models.includes(model)`.
5. `register` returns a precise disposer.

Both LLM tests for today (both exist in the repo):

```js
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
```

Wrap it as `ctx.llm`, forwarding `register` / `models` / `defaultSelection` / `has` / `chat`.

Compare: `src/core/system-prompt-runtime.js`, `src/plugins/system-prompt.js`, `src/core/llm-runtime.js`, `src/plugins/llm.js`

---

## Day 4: Agent Loop (the heart of the project)

### Files to write today

```text
src/core/agent-runtime.js
src/plugins/agents.js
src/core/agent-loop-runtime.js
src/plugins/agent-loop.js
test/core.test.js
```

### Agent Runtime

An Agent is just a handle:

```js
{
  id,          // randomUUID()
  name,        // default 'default'
  sessionId,
  model,
  async send(input, options) {
    return loop.run(agent, input, options)
  },
}
```

Also: `register(agent) → disposer`, `create({ sessionId, model, loop, name })`, `list()`. Don't write the loop inside the Agent, and don't call tools from it.

Wrap it as `ctx.agents`.

### Agent Loop Runtime

The constructor takes four dependencies: `{ sessions, systemPrompt, tools, llm }`. The pseudocode below is the final implementation:

```js
async run(agent, input, { signal, onReasoning, onContent, onToolCall, onToolResult } = {}) {
  const sessionId = agent.sessionId
  this.sessions.append(sessionId, 'user/message', { content: input })

  let step = 0
  while (true) {
    step += 1
    if (signal?.aborted) throw new Error('Agent run cancelled')

    const system = await this.systemPrompt.assemble({ agent, sessionId, step })
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

    if (toolCalls.length === 0) {
      this.sessions.append(sessionId, 'assistant/message', {
        content: response.content ?? '',
      })
      return response.content ?? ''
    }

    this.sessions.append(sessionId, 'assistant/tool_calls', {
      content: response.content ?? null,
      reasoningContent: response.reasoningContent,
      toolCalls,
    })

    for (const call of toolCalls) {
      if (signal?.aborted) throw new Error('Agent run cancelled')
      onToolCall?.(call)
      const result = await this.tools.execute(call.name, call.arguments, {
        signal,
        sessionId,
        toolCallId: call.id,
        agent,
      })
      const renderedContent = this.tools.renderResult(result)
      onToolResult?.({ ...result, renderedContent, name: call.name, toolCallId: call.id })
      this.sessions.append(sessionId, 'tool/result', {
        toolCallId: call.id,
        name: call.name,
        isError: result.isError,
        content: renderedContent,
      })
    }
  }
}
```

The learning version deliberately has **no maxSteps**. The only normal-stop condition is the model returning no `tool_calls`. Cancellation goes through `signal`.

### Things to get right

1. Re-`assemble()` the system prompt every step.
2. messages must be projected from the SessionEvents.
3. With tool calls, `reasoningContent` must be written together with that turn's `assistant/tool_calls`.
4. One model turn may request several tools; run them all before returning to the model.
5. Streaming callbacks are just pass-throughs.
6. Check `signal.aborted` before entering the model and before each tool.

### Same-day tests (still no real model)

Write all three into `test/core.test.js` with titles identical to this repo's. Key points:

1. `Agent loop completes a model -> tool -> model turn`: the mock returns a clock tool call first; on the second call it reads `messages.at(-1).role === 'tool'` and answers. `calls === 2`.
2. `Agent loop has no 12-step cap and finishes after 20 tool calls`: the first 20 calls return tick; number 21 returns `done`.
3. `Agent loop streams reasoning, content, tool-call, and tool-result chunks`: first call `onReasoning('think-1')` / `onReasoning('think-2')` then a tool call; second call `onContent('hello ')` / `onContent('world')`.

Full code: compare those three tests in `test/core.test.js`. Don't rename the titles.

### The plugin layer

`src/plugins/agent-loop.js` must declare its dependencies:

```js
export const inject = ['sessions', 'systemPrompt', 'tools', 'llm']
```

Also write `static inject = [...]` on the Service class. In the constructor, `new AgentLoopRuntime({ sessions: ctx.sessions, systemPrompt: ctx.systemPrompt, tools: ctx.tools, llm: ctx.llm })`, exposing only `run` outward.

Compare: `src/core/agent-loop-runtime.js`, `src/core/agent-runtime.js`, the two plugins, the three loop tests.

---

## Day 5: real model + runtime context + minimal CLI

This is when vendor details appear. The Agent Loop doesn't change one line.

### Files to write today

```text
.env.example
src/models/deepseek.js
src/plugins/runtime-context.js
src/plugins/cli.js
src/index.js
test/core.test.js
```

Don't hand-write `src/utils/env.js`. This repo uses `dotenv`:

```bash
pnpm add dotenv
```

`src/index.js` must call `dotenv.config()` **first**, before dynamically importing configuration that reads env vars. Don't override existing `process.env` (dotenv's default).

### Environment variables

`.env.example`, aligned with this repo:

```text
# DeepSeek
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com

# Default model. Format: provider/model
MINI_DSH_MODEL=deepseek/deepseek-v4-flash

# Directory the agent works in; defaults to the process cwd.
# MINI_DSH_WORKSPACE=/absolute/path/to/project

# Optional Context7 MCP key. The host still starts if mcp.context7.com is unreachable.
# CONTEXT7_API_KEY=
```

`MINI_DSH_AUTO_APPROVE` is only used by the Supplement's sandbox — don't write it into the CLI during the main track. Without `MINI_DSH_MODEL`, the entry falls back to `deepseek/deepseek-v4-pro`.

```bash
cp .env.example .env
```

### DeepSeek Adapter

`src/models/deepseek.js` is a **Provider Adapter**, not an Agent. `name = 'mini-model-deepseek'`, `inject = ['llm']`.

It is responsible for:

1. Reading `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`, trailing `/` trimmed)
2. Default model list `deepseek-v4-pro`, `deepseek-v4-flash`
3. Thinking defaults to `process.env.DEEPSEEK_THINKING ?? 'enabled'`
4. Turning `{ system, messages, tools }` into a Chat Completions body with `stream: true`
5. Parsing SSE into `{ content, reasoningContent, toolCalls }`
6. Mounting via `ctx.effect(() => ctx.llm.register('deepseek', adapter, { defaultModel }), 'register deepseek provider')`

Missing key throws `missing DEEPSEEK_API_KEY; copy .env.example to .env and fill it in`. No response body throws `DeepSeek API returned no response body`.

Two streaming pitfalls:

1. **The last SSE line may lack `\n`** — on `done`, parse the remaining line in the buffer.
2. **`delta.tool_calls`' `function.name` is concatenated.** Start from an empty string and `name += delta.name`, or names become `read_fileread_file`.

Export these pure functions for the unit tests:

```text
parseSSE(response)
accumulateToolCallDelta(map, tc)
finalizeToolCalls(map)
parseToolArguments(text)    # '' → {}; invalid JSON throws incomplete tool arguments JSON
```

`parseSSE` must also recognize `data: [DONE]` / `data:[DONE]` and ignore `:`-prefixed comment lines and blank lines.

### Runtime Context

`src/plugins/runtime-context.js`. `inject = ['systemPrompt']`.

Time is not a model capability — it's real-world state the Harness injects every time it assembles the prompt. Mount two fragments with `ctx.effect(...)`:

1. `section` `agent:identity` `order: 10`: a general-purpose agent in a local harness; prefer tools when a question can be verified with them; when asked which tools exist, answer from this request's tool list; **English by default** (`Reply in English by default.`).
2. `context` `runtime:environment` `order: 100`: current time, time zone, workspace, platform, Node version, hostname — read fresh at each `assemble`.

`workspace` comes from `config.workspace ?? process.env.MINI_DSH_WORKSPACE ?? process.cwd()`, `path.resolve`-ed.

### Minimal CLI

`src/plugins/cli.js` is only the thinnest UI layer. Day 5's `inject` must **not** include `'sandbox'`:

```js
export const inject = ['sessions', 'agents', 'agentLoop', 'tools', 'systemPrompt', 'llm']
```

What it does:

1. `ctx.sessions.create({ source: 'cli' })`
2. `ctx.agents.create({ name: 'cli-agent', sessionId, model, loop: ctx.agentLoop })`
3. Wrap readline in `ctx.effect`
4. Create an `AbortController` when running the agent; pass `signal` into `agent.send()`
5. On stdin, if it receives a **single byte** `0x1b` (Esc), call `abort()`. Arrow keys are `Esc [` sequences — longer than one byte, so don't cancel them
6. When cancelled, print `[cancelled]` — don't treat it as `[AgentError]`
7. Debug commands: `/tools` `/models` `/model` `/history` `/prompt` `/reset` `/exit`

`/reset` calls `ctx.sessions.clear(session.id)` — **don't** create a new session.

Streaming output conventions: thinking in grey `[Thinking]`; content prints `Agent > ` first; tool calls in cyan; tool results in green, truncated to 300 chars.

Startup copy is in English — compare against `src/plugins/cli.js`. No bash/file yet on Day 5 — `/tools` may be empty.

### Same-day tests (no real API)

Three SSE tests, titles identical to this repo's, regex `/incomplete tool arguments JSON/`. Full code: compare `test/core.test.js`.

### Assembly

```js
import { Context } from '@deepseek-ai/cordis'
import dotenv from 'dotenv'

import * as sessions from './plugins/sessions.js'
import * as systemPrompt from './plugins/system-prompt.js'
import * as tools from './plugins/tools.js'
import * as llm from './plugins/llm.js'
import * as agents from './plugins/agents.js'
import * as agentLoop from './plugins/agent-loop.js'
import * as runtimeContext from './plugins/runtime-context.js'
import * as deepseek from './models/deepseek.js'
import * as cli from './plugins/cli.js'

dotenv.config()

const root = new Context()
const workspace = process.env.MINI_DSH_WORKSPACE ?? process.cwd()

await root.plugin(sessions)
await root.plugin(systemPrompt)
await root.plugin(tools)
await root.plugin(llm)
await root.plugin(agents)
await root.plugin(agentLoop)

await root.plugin(runtimeContext, { workspace })
await root.plugin(deepseek)
await root.plugin(cli, {
  model: process.env.MINI_DSH_MODEL ?? 'deepseek/deepseek-v4-pro',
})
```

`pnpm start` should enter the CLI. `/prompt` should contain identity plus current time / workspace. Esc should cancel a run.

Compare: `.env.example`, `src/models/deepseek.js`, `src/plugins/runtime-context.js`, `src/plugins/cli.js`, `src/index.js`

---

## Day 6: external plugins / MCP

The goal is not to learn Context7 — it's to prove that as long as the `ctx.tools.register()` contract is right, the official `@deepseek-ai/dsh-mcp-client` plugs in as-is.

The Agent Loop still has no `if (mcp)` branch. Still no sandbox / Bash / files.

Day 6 adds **no** `pnpm test`. Cumulative stays 12.

### Files to write today

```text
plugins.config.js
src/plugins/external-plugins.js
src/index.js
```

```bash
pnpm add @deepseek-ai/dsh-mcp-client@0.1.1-rc.2
```

Context7 **must be optional**. `mcp.context7.com` frequently dies with TLS `ECONNRESET`, and a learning project shouldn't fail to start because of it:

```js
const headers = {}
if (process.env.CONTEXT7_API_KEY) {
  headers.Authorization = `Bearer ${process.env.CONTEXT7_API_KEY}`
}

export default [
  {
    package: '@deepseek-ai/dsh-mcp-client',
    required: false,
    config: {
      serverName: 'context7',
      transport: 'streamable-http',
      url: 'https://mcp.context7.com/mcp',
      headers,
      failOnStartupError: false,
      toolCallTimeoutMs: 60_000,
    },
  },
]
```

`src/plugins/external-plugins.js`: dynamic `import(entry.package)`, `await ctx.plugin(mod, config)`. On failure, print `[plugin] failed`; only rethrow if `entry.required`. You must `await fiber` — otherwise the CLI appears first, before the tools are registered.

`plugins.config.js` must be dynamically imported **after** `dotenv.config()`, or `CONTEXT7_API_KEY` won't be read.

After startup: if connected, `/tools` has `mcp__context7__*`; if not, only a failure log and you must **still reach `User >`**.

Compare: `src/plugins/external-plugins.js`, `plugins.config.js`, `src/index.js`

---

## Day 7: compare and wrap up

No new files and no new tests today. Cumulative is still **12**.

Open the README, don't look at `src/` yet — confirm you can draw the request path from memory and can restate this: the Agent Loop doesn't know DeepSeek, doesn't know MCP, doesn't know Bash. It only knows `ctx.tools` / `ctx.llm` / `ctx.sessions`.

Run through the main-track acceptance by hand. `pnpm test` all green (12), `pnpm check` passing, and the CLI answers — the eight-day main track is done.

To also write the path gate, Approval, `read_file` / `bash`, do the **Supplement**. That part takes the tests from 12 to 18.

---

## Supplement: real tools + application-level sandbox

After the main track. The Agent Loop **doesn't change one line**.

### Files to write

```text
src/utils/path.js
src/core/sandbox-runtime.js
src/plugins/sandbox.js
src/tools/files.js
src/tools/bash.js
src/plugins/cli.js         # inject sandbox + Approval; Esc pauses during approval
src/index.js
test/core.test.js          # add 6 tests
```

### 1. The path gate

`isInside(workspace, target)` / `resolveInside(workspace, requested)`.

Resolve first, then test with `path.relative`. Don't use `startsWith('..')` — `..hidden` would be falsely killed. Errors in English: `path must be a string`, `path escapes the workspace`.

### 2. SandboxRuntime

Only three jobs: path gate, command policy, Approval. Not container isolation.

`approve(request)`:

- `autoApprove=true` → `{ approved: true, source: 'auto' }`
- otherwise consult `setApprover(fn)`
- no approver → throw `write requires user approval, but no approval channel is set`
- approver returns falsy → throw `user rejected this operation`

The command policy must pass this repo's tests. Deny messages in English so the test regexes match, e.g.:

- `recursive delete`
- `sudo/su is blocked`
- `unauthorized outbound request`
- `piping curl/wget into a shell`
- `system path is blocked`
- `.. path escape is blocked`
- `path escapes the workspace`

The allow/deny case set: compare against the `Sandbox blocks dangerous commands...` test in `test/core.test.js`. Don't delete cases.

Wrap it as `ctx.sandbox`. Also add the `sandbox:policy` `section` with `order: 15` to the system prompt (in English).

`autoApprove` reads `config.autoApprove ?? process.env.MINI_DSH_AUTO_APPROVE === '1'`.

### 3. file / bash tools

Five file tools: `read_file` `write_file` `edit_file` `glob` `grep`. `approve` before writes and edits. `oldText` not found → `oldText not found`; not unique → `oldText is not unique; refusing an ambiguous edit`.

`matchFilePattern` **must be exported**. Don't write literals like `**/*.md` inside block comments — they would close the `*/` early.

bash: `assertCommand` first, then `approve`, then `spawn('bash', ['-lc', command], { cwd: workspace })`. Empty command → `command is required`. Listen to `exec.signal`: kill the child on abort. Timeout 30s, output truncated to 32KB.

### CLI approval

1. Add `'sandbox'` to `inject`
2. On startup print the sandbox workspace and `Writes and bash execution ask [Y/n] first. Press Esc to cancel a run.`
3. Wire `setApprover` to `askApproval`. Turn `running` off during approval so Esc and `Y/n` don't fight over input
4. On dispose: `disposeApprover()` first, then `rl.close()`

`askApproval`: `Allow this? [Y/n]` — empty enter or `y` / `yes` approves; anything else prints `rejected.`

### Supplement tests

Six tests, titles identical to this repo's, regexes in English. Full code: compare `test/core.test.js`. When done, **18** total.

### Assembly

```js
await root.plugin(runtimeContext, { workspace })
await root.plugin(sandbox, { workspace })
await root.plugin(deepseek)
await root.plugin(bash, { workspace })
await root.plugin(files, { workspace })
await root.plugin(externalPlugins, { entries: externalConfig })
await root.plugin(cli, {
  model: process.env.MINI_DSH_MODEL ?? 'deepseek/deepseek-v4-pro',
})
```

This is the final shape of this repo's `src/index.js`. `/prompt` now shows identity, sandbox policy, and runtime context together. `/tools` has `bash` / `read_file`; `mcp__context7__*` only if Context7 is connected.

---

## How to cross-check against this repo each day

| Where you are | Files to compare | Don't look at yet |
|---|---|---|
| Day 0 Context | `src/index.js` `scripts/check-syntax.js` `.gitignore` | every later runtime |
| Day 1 Session | `session-runtime.js` `plugins/sessions.js` | sandbox, MCP |
| Day 2 Tools | `tool-runtime.js` `plugins/tools.js` | `files.js`'s glob/edit |
| Day 3 Prompt / LLM | `system-prompt-runtime.js` `llm-runtime.js` and the two plugins | DeepSeek SSE |
| Day 4 Loop | `agent-loop-runtime.js` `agent-runtime.js` and the two plugins | CLI streaming colors |
| Day 5 real model | `deepseek.js` `runtime-context.js` `cli.js` `.env.example` | Approval, sandbox regexes |
| Day 6 MCP | `external-plugins.js` `plugins.config.js` | `dsh-mcp-client` source, sandbox |
| Day 7 wrap-up | `README.md` | `src/` implementation details |
| Supplement sandbox | `path.js` `sandbox-runtime.js` `plugins/sandbox.js` `tools/*` | you may read the tests, but don't copy the 400-line regexes |

Principle: **write until it passes your own tests, then open the files to compare.**

If you get stuck on a step, get that day's runtime test red first — don't start from the full `src/index.js`.

For the Supplement's sandbox you may "write the implementation against the tests": copy the sandbox / path / glob tests from `test/core.test.js` into yours first (the tests are the spec), then write until green. That's not the same thing as copying `sandbox-runtime.js`.

---

## Explicitly don't do

Deliberately absent from this repo — and you shouldn't add them either:

- maxSteps / token budget / compaction
- kernel-level sandbox, containers, seccomp
- full permission system, credentials, telemetry
- a plugin marketplace
- TUI / Web

First, internalize these five abstractions:

```text
Context / Plugin / Service
Session Event Log
Tool Runtime
LLM Adapter
Agent Loop
```

CLI and MCP exist to prove these five abstractions are sufficient. So do the sandbox / Bash / file tools — which is why they're in the Supplement, not the main track.

---

## Acceptance checklist

### Main track (end of Day 7, 12 tests)

1. With a mock LLM — no real model — `ask time → call clock → answer` works
2. 20 consecutive tool calls don't stop mid-way
3. `onReasoning` / `onContent` / `onToolCall` / `onToolResult` all receive chunks
4. (Manual) after unloading a tool plugin, `/tools` drops it immediately
5. Swap in a different mock provider — the Agent Loop doesn't change a line
6. (Manual) with Context7 connected, `/tools` shows `mcp__context7__*`; unreachable, the CLI still starts. The Agent Loop has no `if (mcp)` branch
7. `/history` shows the event log; after `/reset` the session id is unchanged
8. The next request after a DeepSeek thinking + tool call turn still carries `reasoning_content`
9. A SSE last line without `\n` still parses; a streamed `name` is never concatenated into `read_fileread_file`
10. `/prompt` shows identity + current time / workspace (no sandbox policy yet)
11. Esc cancels an in-flight agent run
12. `pnpm test` and `pnpm check` fully green; `test/core.test.js` has **12** tests

### Supplement (matches this repo's 18)

13. File tools reject `../etc/passwd`; the `..hidden` filename inside the workspace is not falsely killed
14. `rm -rf src`, `curl https://example.com`, `curl ... | sh` are denied; `rm file.txt` is allowed
15. Without an approver, writes throw; `autoApprove: true` allows them
16. `/prompt` shows identity + sandbox policy + current time / workspace
17. Writes and Bash ask `[Y/n]` first; Esc doesn't misfire during approval
18. `pnpm test` totals 18, matching this repo

---

## How to run this repo (for comparison — not a starting point)

```bash
pnpm install
cp .env.example .env
# fill in DEEPSEEK_API_KEY
pnpm start
pnpm test
pnpm check
```

CLI commands:

```text
/tools
/models
/model
/model deepseek/deepseek-v4-pro
/model deepseek/deepseek-v4-flash
/history
/prompt
/reset
/exit
```

This repo ships with the sandbox: writes and Bash execution ask `[Y/n]` first. Esc cancels while the agent runs. The CLI starts even when Context7 is unreachable. The main-track assignment has no sandbox through Day 6 — don't copy `ctx.sandbox` from the CLI early.
