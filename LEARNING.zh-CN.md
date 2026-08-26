# 从零手写 mini-dsh

[English](./LEARNING.md) | 中文

这份文档给**第一次接触 Agent Harness** 的人。

不要 clone 本仓库当起点，也不要打开源码对着抄。正确方式是：

1. 新建一个空项目
2. 按下面 8 个里程碑自己写
3. 每一步都能跑、都能测
4. 写完再打开本仓库对照

本仓库是**答案册**，不是作业本。

八天主线结束时，你已经亲手写完 Harness 的五个抽象，并能挂上真模型。沙箱、Bash、文件工具、Context7 **不是主线**：它们证明 `ctx.tools` 够用，但 Loop 一行都不用改。想对齐本仓库全部源码，再做文末的**补充篇**。

对照时看 `README.zh-CN.md` 和源码；想不起整体结构时扫一眼 `ARCHITECTURE.zh-CN.md`。仓库没有手写的 `src/utils/env.js`——环境变量用 `dotenv`。

---

## 你要学会的不是「一个聊天机器人」

一句话：

```text
Agent = Model + Harness
```

Model 是 DeepSeek / OpenAI 那些。Harness 才是这个项目要学的东西：把模型、工具、历史、策略、循环组装成一个能干活的 Agent。

Harness 的核心是一个可组合的 Cordis Context：

```text
ctx.sessions
ctx.systemPrompt
ctx.tools
ctx.llm
ctx.agents
ctx.agentLoop
```

`ctx.sandbox` 是补充篇才加的策略闸门，主线里不要提前引用。

一次请求实际走的是：

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
 ├─ 无 tool_calls → assistant/message → return
 └─ 有 tool_calls
       ↓
   ToolRuntime.execute()
       ↓
   SessionEvent: tool/result
       ↓
   回到 LLM
```

Agent Loop **不知道** Bash、文件、Context7 是什么。它只认识 `ctx.tools`。这是整个项目最值得学的一点。

---

## 学习前准备

- Node.js `>= 20.18.1`
- 会写一点现代 JavaScript（`import` / `async` / `class`）
- 有一个 DeepSeek API Key（第 5 天才需要）
- 本仓库作为对照，先别读实现

建议每天只做一个里程碑。做完当天的测试再往下走。

---

## 仓库文件总表

对照用。主线每天结束勾一次。沙箱相关文件在补充篇，不要提前写进 CLI。

| 天 | 你要写出的文件 |
|---|---|
| 0 | `package.json` `.gitignore` `scripts/check-syntax.js` `src/index.js` |
| 1 | `src/core/session-runtime.js` `src/plugins/sessions.js` `test/core.test.js`（Session 两条） |
| 2 | `src/core/tool-runtime.js` `src/plugins/tools.js`（测试追加 1 条） |
| 3 | `src/core/system-prompt-runtime.js` `src/plugins/system-prompt.js` `src/core/llm-runtime.js` `src/plugins/llm.js`（测试追加 3 条） |
| 4 | `src/core/agent-runtime.js` `src/plugins/agents.js` `src/core/agent-loop-runtime.js` `src/plugins/agent-loop.js`（测试追加 3 条） |
| 5 | `.env.example` `src/models/deepseek.js` `src/plugins/runtime-context.js` `src/plugins/cli.js`；改 `src/index.js` 接上它们（测试追加 3 条） |
| 6 | `plugins.config.js` `src/plugins/external-plugins.js`；改 `src/index.js` 挂 MCP（仍不含 sandbox / bash / files） |
| 7 | 无新文件。对照 `README.zh-CN.md`，跑核心验收 |
| 补充 | `src/utils/path.js` `src/core/sandbox-runtime.js` `src/plugins/sandbox.js` `src/tools/files.js` `src/tools/bash.js`；改 CLI Approval / Esc 和 `index.js`（测试追加 6 条） |

本仓库里**不用手写、读完即可**的：`README.md` `README.zh-CN.md` `pnpm-lock.yaml`。

`test/core.test.js` 是累计文件：每天往里加当天的测试。**主线第 7 天结束应是 12 条**。补充篇再加 6 条，才和本仓库的 **18 条**对齐。标题必须和本仓库同名（英文），方便对照：

| 天 | 新增 | 累计 | 测试标题 |
|---|---|---|---|
| 0 | 0 | 0 | 还没有 `test/`，不要跑 `pnpm test` |
| 1 | 2 | 2 | `Session derives tool-call history from the event log and keeps reasoning_content`；`Session clear keeps the same id and drops derived chat history` |
| 2 | 1 | 3 | `ToolRuntime register returns a disposer and renders results as text` |
| 3 | 3 | 6 | `SystemPrompt assembles by order and disposer unregisters fragments`；`LlmRuntime routes chat to the selected provider and disposer unregisters it`；`LlmRuntime selects an upstream model with provider/model` |
| 4 | 3 | 9 | `Agent loop completes a model -> tool -> model turn`；`Agent loop has no 12-step cap and finishes after 20 tool calls`；`Agent loop streams reasoning, content, tool-call, and tool-result chunks` |
| 5 | 3 | 12 | `streamed tool_calls concatenate name once, not read_fileread_file`；`parseSSE flushes a last line without a trailing newline and recognizes data:[DONE]`；`finalizeToolCalls sorts by index, drops empty names, and throws on invalid JSON` |
| 6 | 0 | 12 | MCP 没有自动化测试。连得上时用 `/tools` 手工验；连不上 CLI 也必须能进 |
| 7 | 0 | 12 | 核心 12 条全绿即过关 |
| 补充 | 6 | 18 | `resolveInside blocks .. and absolute escapes but allows a ..hidden filename`；`Sandbox blocks dangerous commands and allows ordinary workspace commands`；`Sandbox approval auto-approves or throws when the user rejects`；`Sandbox expands env paths before the escape check instead of banning them`；`allowHosts uses the provided whitelist and does not hardcode localhost`；`glob matches both substrings and * / ** wildcards` |

**测试边界（后面每天都成立）：** `pnpm test` 只测 `core/` 和少量可导出的纯函数（SSE；补充篇才有路径、glob）。`src/plugins/*` 是薄转发，**没有 Cordis 集成测试**。插件对不对，靠对照源码 + 第 5 天起用 CLI 手工验。

---

## 第 0 天：空项目能跑

新建目录，不要从本仓库复制文件。

```bash
mkdir mini-dsh-learn && cd mini-dsh-learn
pnpm init
```

### 今天要写的文件

```text
package.json
.gitignore
scripts/check-syntax.js
src/index.js
```

`package.json` 至少改这几项：

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

`.gitignore`：

```text
node_modules/
.env
.DS_Store
*.log
```

`scripts/check-syntax.js`：递归走 `src/` `test/` `scripts/`，对每个 `.js` 跑 `node --check`。失败就把 stderr 打出来并非 0 退出；成功打印 `syntax ok: N files`。对照本仓库同名文件。

安装核心依赖：

```bash
pnpm add @deepseek-ai/cordis@4.0.1
```

先写一个最小入口，确认 Cordis 能启动：

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

能打印 `plugin loaded`，`pnpm check` 报 syntax ok，就过关。第 0 天不要跑 `pnpm test`：`test/` 还不存在，shell glob 对不上会报错。

这一步只学四件事：

- `Context` 是空容器
- `plugin` 往容器里塞能力
- 插件形态是 `{ name, apply(ctx) }`，后面会再学 `Service`
- `pnpm check` 是语法闸门，后面每天改完先跑它

建议目录从一开始就对齐本仓库：

```text
src/
  index.js          # 只负责 plugin 装配
  core/             # 纯逻辑，不 import Cordis
  plugins/          # 薄封装：把 runtime 挂到 ctx.xxx
  models/           # 第 5 天才写
  tools/            # 补充篇才写（bash / files）
  utils/
scripts/
test/
```

分层很重要：`core/` 不依赖 Cordis，所以测试可以直接 `new SessionRuntime()`，不必启动整个 Context。

对照：`src/index.js` `scripts/check-syntax.js` `.gitignore` `package.json`

---

## 第 1 天：Session Event Log

不要先写 LLM。先写「对话历史」。

### 今天要写的文件

```text
src/core/session-runtime.js
src/plugins/sessions.js
test/core.test.js
```

### 要建立的心智模型

```text
SessionEvent[] = 事实
messages       = 给模型看的投影视图
```

不要另维护一份 `messages[]`。所有 user / assistant / tool call / tool result 都先写成事件，需要发给模型时再投影。

### 要实现的 API

| 方法 | 作用 |
|---|---|
| `create(meta)` | 新建 session，写一条 `session/start` |
| `get(id)` | 取 session，不存在就抛错 |
| `append(id, type, data)` | 追加事件，带 `seq` 和 `at` |
| `clear(id)` | 清空事件，再写一条带 `reset: true` 的 `session/start`。**id 不变**，不要删 session 再 create |
| `list()` | 返回当前所有 session |
| `deriveMessages(id)` | 把事件投影成 OpenAI-compatible messages |

`create()` 返回的对象至少包含：`id` `meta` `events` `createdAt`。

事件对象至少包含：`seq`（从 1 递增）`type` `data` `at`（ISO 时间）。

事件类型先只支持这些：

```text
session/start
user/message
assistant/message
assistant/tool_calls
tool/result
```

`session/start` **不进入** `deriveMessages()`。它是给 `/history` 看的事实，不是给模型看的消息。

### 必须做对的点

1. `assistant/tool_calls` 必须能带上 `reasoningContent`，投影成 `reasoning_content`。没有 reasoning 时不要输出这个字段。
2. `tool/result` 必须带 `tool_call_id`，对应 OpenAI 的 `role: 'tool'`。
3. `tool_calls` 投影时，`arguments` 要 `JSON.stringify`。
4. `assistant/message` 的 `content` 缺省当成 `''`；`assistant/tool_calls` 的 `content` 缺省当成 `null`。
5. `clear(id)` 保 id、丢历史。`/reset` 靠这个，不要新建 session。

投影结果大致长这样：

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

### 当天测试

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

### 再包一层 Cordis Service

`src/plugins/sessions.js` 只做一件事：把 runtime 挂到 `ctx.sessions`。

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

`src/index.js` 改成加载这个插件，hello 可以删掉。现在没有 CLI，进程会加载完就退出，这是正常的。

后面每天加插件，都是同样的模式：`core/` 写逻辑，`plugins/` 暴露 `ctx.xxx`，并挂进 `src/index.js`。插件层本身不写进 `pnpm test`，测的是 runtime。

**为什么先写这个：** 后面所有模块都往 Session 里写事实。历史搞错了，Agent Loop 一定错。

对照：`src/core/session-runtime.js`、`src/plugins/sessions.js`、`test/core.test.js` 前两条。

---

## 第 2 天：Tool Runtime

### 今天要写的文件

```text
src/core/tool-runtime.js
src/plugins/tools.js
test/core.test.js
```

最小契约：

```text
register(definition) → disposer
get(name)
list()
schemas()            → OpenAI function tools
execute(name, args, exec)  → { value, content, isError }
renderResult(result) → string
```

### 必须做对的点

1. `register()` **返回 disposer**。MCP 动态增删工具、插件卸载都靠这个。重复 `dispose()` 必须是空操作。只删掉「还是当初那个 definition」的条目。
2. 名称冲突、缺少 `name`、缺少 `execute`，注册时就抛错。英文报错即可，例如 `tool.name is required`。
3. 未知工具 / `execute` 抛错，都返回 `{ isError: true, content: [...] }`，**不要把异常甩出 Agent Loop**。
4. `content` 用 `[{ type: 'text', text: '...' }]` 这种 block 数组。
5. 如果工具带 `output.render(args, value)`，用它生成 content；否则把返回值 `JSON.stringify`（字符串则原样）。
6. 如果工具带 `finalizeContent(execution, result)`，在成功路径上再跑一次，用它的返回值替换 `content`。

`execute` 的第二个参数预留：

```js
{
  signal,       // 没有传入就 new AbortController().signal
  sessionId,
  toolCallId,
  agent,
}
```

### 当天测试

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

再包 `src/plugins/tools.js`，暴露 `ctx.tools`，把上面 6 个方法原样转发，挂进 `src/index.js`。

对照：`src/core/tool-runtime.js`、`src/plugins/tools.js`

---

## 第 3 天：System Prompt + LLM Adapter

还不用真 API。

### 今天要写的文件

```text
src/core/system-prompt-runtime.js
src/plugins/system-prompt.js
src/core/llm-runtime.js
src/plugins/llm.js
test/core.test.js
```

### System Prompt

API 刻意靠近 DSH：

```text
section({ name, order, text }) → disposer
context({ name, order, text }) → disposer
assemble(ctx) → string
inspect()
```

约定：

- `section` 放相对静态的身份 / 规则
- `context` 放每一步都会变的东西（时间、cwd）
- `text` 可以是字符串，也可以是 `async (assembleContext) => string`
- `assemble()` 把 section + context 按 `order` 拼起来，空文本丢掉，段落之间 `\n\n`
- 同名重复注册、缺 `name` 要抛错
- disposer 精确撤销、重复调用空操作
- `inspect()` 只返回 `{ sections, contexts }`，每项 `{ name, order }`

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

包成 `ctx.systemPrompt`，转发 `section` / `context` / `assemble` / `inspect`。

### LLM Runtime

Agent Loop **不许**出现 DeepSeek URL / API Key。它只调用：

```js
ctx.llm.chat({ system, messages, tools, signal, onReasoning, onContent }, 'mock/demo')
```

selection 格式：`provider/model`。也允许 `{ provider, model }`。

```text
register(provider, adapter, { defaultModel }) → disposer
models()
defaultSelection()
has(selection)
chat(request, selection)
```

必须做对：

1. 第一个成功注册且带模型的 adapter 决定 `defaultSelection`（`defaultModel` 优先，否则 `adapter.models[0]`）。
2. `chat()` 把 selection 拆成 `{ provider, model }`，把 `model` 传给 adapter，**不要**把 `deepseek/xxx` 整段传给上游。
3. 格式错误、缺 provider、缺 selection，都要抛错。
4. `has(selection)`：provider 不存在 → false；adapter 没声明 models → true；否则看 `models.includes(model)`。
5. `register` 返回精确 disposer。

当天两条 LLM 测试都要写（仓库里两条都在）：

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

包成 `ctx.llm`，转发 `register` / `models` / `defaultSelection` / `has` / `chat`。

对照：`src/core/system-prompt-runtime.js`、`src/plugins/system-prompt.js`、`src/core/llm-runtime.js`、`src/plugins/llm.js`

---

## 第 4 天：Agent Loop（整个项目的心脏）

### 今天要写的文件

```text
src/core/agent-runtime.js
src/plugins/agents.js
src/core/agent-loop-runtime.js
src/plugins/agent-loop.js
test/core.test.js
```

### Agent Runtime

Agent 本身只是句柄：

```js
{
  id,          // randomUUID()
  name,        // 默认 'default'
  sessionId,
  model,
  async send(input, options) {
    return loop.run(agent, input, options)
  },
}
```

还要有 `register(agent) → disposer`、`create({ sessionId, model, loop, name })`、`list()`。不要在 Agent 里写循环、不要在 Agent 里调工具。

包成 `ctx.agents`。

### Agent Loop Runtime

构造函数吃四个依赖：`{ sessions, systemPrompt, tools, llm }`。伪代码就是最终实现：

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

学习版故意 **没有 maxSteps**。正常停止条件只有一个：模型不再返回 `tool_calls`。取消靠 `signal`。

### 必须做对的点

1. 每一步都重新 `assemble()` system prompt。
2. messages 必须从 SessionEvent 投影。
3. 有 tool calls 时，`reasoningContent` 必须跟这一轮 `assistant/tool_calls` 一起写入。
4. 一轮模型可能同时请求多个工具，全部执行完再回到模型。
5. 流式回调只是透传。
6. `signal.aborted` 在进模型前、以及每个工具前都要检查。

### 当天测试（仍然不接真模型）

三条都写进 `test/core.test.js`，标题和本仓库同名。要点：

1. `Agent loop completes a model -> tool -> model turn`：mock 第一次返回 clock tool call，第二次读 `messages.at(-1).role === 'tool'` 再回答。`calls === 2`。
2. `Agent loop has no 12-step cap and finishes after 20 tool calls`：前 20 次都返回 tick，第 21 次返回 `done`。
3. `Agent loop streams reasoning, content, tool-call, and tool-result chunks`：第一次 `onReasoning('think-1')` / `onReasoning('think-2')` 再 tool call；第二次 `onContent('hello ')` / `onContent('world')`。

完整代码对照 `test/core.test.js` 这三条，不要自己改标题。

### 插件层

`src/plugins/agent-loop.js` 必须声明依赖：

```js
export const inject = ['sessions', 'systemPrompt', 'tools', 'llm']
```

Service 类上也写 `static inject = [...]`。构造函数里 `new AgentLoopRuntime({ sessions: ctx.sessions, systemPrompt: ctx.systemPrompt, tools: ctx.tools, llm: ctx.llm })`，对外只暴露 `run`。

对照：`src/core/agent-loop-runtime.js`、`src/core/agent-runtime.js`、两个插件、loop 相关三条测试。

---

## 第 5 天：接真模型 + 运行时上下文 + 最小 CLI

这时才写厂商细节。Agent Loop 一行都不用改。

### 今天要写的文件

```text
.env.example
src/models/deepseek.js
src/plugins/runtime-context.js
src/plugins/cli.js
src/index.js
test/core.test.js
```

不要手写 `src/utils/env.js`。本仓库用 `dotenv`：

```bash
pnpm add dotenv
```

`src/index.js` **必须先** `dotenv.config()`，再动态 import 会读环境变量的配置。已存在的 `process.env` 不要覆盖（dotenv 默认如此）。

### 环境变量

`.env.example` 和本仓库对齐：

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

`MINI_DSH_AUTO_APPROVE` 是补充篇沙箱才用，主线先不要写进 CLI。不设 `MINI_DSH_MODEL` 时，入口回退到 `deepseek/deepseek-v4-pro`。

```bash
cp .env.example .env
```

### DeepSeek Adapter

`src/models/deepseek.js` 是 **Provider Adapter**，不是 Agent。`name = 'mini-model-deepseek'`，`inject = ['llm']`。

它负责：

1. 读 `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL`（默认 `https://api.deepseek.com`，去掉末尾 `/`）
2. 模型列表默认 `deepseek-v4-pro`、`deepseek-v4-flash`
3. thinking 默认 `process.env.DEEPSEEK_THINKING ?? 'enabled'`
4. 把 `{ system, messages, tools }` 转成 Chat Completions body，`stream: true`
5. 解析 SSE，吐出 `{ content, reasoningContent, toolCalls }`
6. 通过 `ctx.effect(() => ctx.llm.register('deepseek', adapter, { defaultModel }), 'register deepseek provider')` 挂上去

缺 key 时抛 `missing DEEPSEEK_API_KEY; copy .env.example to .env and fill it in`。没有 response body 抛 `DeepSeek API returned no response body`。

流式两个坑：

1. **SSE 最后一行可能没有 `\n`**，`done` 时要把 buffer 里剩下的那行解析掉。
2. **`delta.tool_calls` 的 `function.name` 是拼接出来的**。必须从空串起步 `name += delta.name`，否则会变成 `read_fileread_file`。

导出这些纯函数给单测：

```text
parseSSE(response)
accumulateToolCallDelta(map, tc)
finalizeToolCalls(map)
parseToolArguments(text)    # 空串 → {}；非法 JSON 抛 incomplete tool arguments JSON
```

`parseSSE` 还要识别 `data: [DONE]` / `data:[DONE]`，忽略 `:` 开头的注释行和空行。

### Runtime Context

`src/plugins/runtime-context.js`。`inject = ['systemPrompt']`。

时间不是模型自己的能力，是 Harness 每一步组装 prompt 时注入的现实世界状态。用 `ctx.effect(...)` 挂两段：

1. `section` `agent:identity` `order: 10`：本地 Harness 里的通用 Agent；能用工具验证的问题优先调工具；用户问有哪些工具时看本次 tools 列表；**默认英文**（`Reply in English by default.`）。
2. `context` `runtime:environment` `order: 100`：每次 `assemble` 现取当前时间、时区、workspace、platform、Node 版本、hostname。

`workspace` 来自 `config.workspace ?? process.env.MINI_DSH_WORKSPACE ?? process.cwd()`，并 `path.resolve`。

### 最小 CLI

`src/plugins/cli.js` 只是最薄的一层 UI。第 5 天的 `inject` **不要**写 `'sandbox'`：

```js
export const inject = ['sessions', 'agents', 'agentLoop', 'tools', 'systemPrompt', 'llm']
```

它做的事：

1. `ctx.sessions.create({ source: 'cli' })`
2. `ctx.agents.create({ name: 'cli-agent', sessionId, model, loop: ctx.agentLoop })`
3. 用 `ctx.effect` 包住 readline
4. 跑 agent 时建 `AbortController`，把 `signal` 传给 `agent.send()`
5. stdin 上如果收到**单独一字节** `0x1b`（Esc），就 `abort()`。方向键是 `Esc [` 序列，长度不是 1，不要误取消
6. 取消时打印 `[cancelled]`，不要当成 `[AgentError]`
7. 调试命令：`/tools` `/models` `/model` `/history` `/prompt` `/reset` `/exit`

`/reset` 调用 `ctx.sessions.clear(session.id)`，**不要** create 新 session。

流式输出约定：thinking 灰字 `[Thinking]`；content 先打 `Agent > `；tool call 青字；tool result 绿字，截到 300 字。

启动文案用英文，对照 `src/plugins/cli.js`。第 5 天还没有 bash/file，`/tools` 可以是空的。

### 当天测试（不接真 API）

三条 SSE 测试标题和本仓库同名，正则用 `/incomplete tool arguments JSON/`。完整代码对照 `test/core.test.js`。

### 装配

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

`pnpm start` 应能进 CLI。`/prompt` 里应有 identity 和当前时间 / workspace。Esc 应能取消一轮。

对照：`.env.example`、`src/models/deepseek.js`、`src/plugins/runtime-context.js`、`src/plugins/cli.js`、`src/index.js`

---

## 第 6 天：外部插件 / MCP

目的不是学会 Context7，而是验证：只要 `ctx.tools.register()` 契约对了，官方 `@deepseek-ai/dsh-mcp-client` 就能直接挂进来。

Agent Loop 仍然没有 `if (mcp)` 分支。沙箱 / Bash / 文件仍然不要写。

第 6 天**不新增** `pnpm test`。累计仍是 12 条。

### 今天要写的文件

```text
plugins.config.js
src/plugins/external-plugins.js
src/index.js
```

```bash
pnpm add @deepseek-ai/dsh-mcp-client@0.1.1-rc.2
```

Context7 **必须是可选的**。`mcp.context7.com` 经常 TLS `ECONNRESET`，学习版不该因此起不来：

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

`src/plugins/external-plugins.js`：动态 `import(entry.package)`，`await ctx.plugin(mod, config)`。失败打 `[plugin] failed`；只有 `entry.required` 才再 throw。必须 `await fiber`，否则 CLI 先出现、工具还没注册。

`plugins.config.js` 必须在 `dotenv.config()` **之后**动态 import，才能读到 `CONTEXT7_API_KEY`。

启动后：连得上则 `/tools` 里有 `mcp__context7__*`；连不上只打失败日志，**必须仍能进 `User >`**。

对照：`src/plugins/external-plugins.js`、`plugins.config.js`、`src/index.js`

---

## 第 7 天：对照与收束

今天没有新文件，也没有新测试。累计仍是 **12 条**。

打开 `README.zh-CN.md`，先别看 `src/`，确认你能不看源码画出请求路径，以及这句：Agent Loop 不知道 DeepSeek、不知道 MCP、不知道 Bash。它只认识 `ctx.tools` / `ctx.llm` / `ctx.sessions`。

手工过一遍主线验收。`pnpm test` 12 条全绿、`pnpm check` 过，CLI 能问答，就算八天主线结束。

想把路径闸门、Approval、`read_file` / `bash` 也写上，再做**补充篇**。那部分才把测试从 12 条补到 18 条。

---

## 补充篇：真工具 + 应用层沙箱

主线做完再来。Agent Loop **一行都不用改**。

### 要写的文件

```text
src/utils/path.js
src/core/sandbox-runtime.js
src/plugins/sandbox.js
src/tools/files.js
src/tools/bash.js
src/plugins/cli.js         # inject sandbox + Approval；Esc 在审批时暂停
src/index.js
test/core.test.js          # 追加 6 条
```

### 1. 路径闸门

`isInside(workspace, target)` / `resolveInside(workspace, requested)`。

必须先 `path.resolve`，再用 `path.relative` 判断。不要用 `startsWith('..')`，否则 `..hidden` 会被误杀。报错用英文：`path must be a string`、`path escapes the workspace`。

### 2. SandboxRuntime

只做三件事：路径闸门、命令策略、Approval。不是容器隔离。

`approve(request)`：

- `autoApprove=true` 时 `{ approved: true, source: 'auto' }`
- 否则调用 `setApprover(fn)`
- 没有 approver 抛 `write requires user approval, but no approval channel is set`
- approver 返回假值抛 `user rejected this operation`

命令策略必须能过本仓库测试。deny 文案用英文，测试正则才能对上，例如：

- `recursive delete`
- `sudo/su is blocked`
- `unauthorized outbound request`
- `piping curl/wget into a shell`
- `system path is blocked`
- `.. path escape is blocked`
- `path escapes the workspace`

allow / deny 用例集合对照 `test/core.test.js` 里 `Sandbox blocks dangerous commands...` 那条，不要自己删 case。

包成 `ctx.sandbox`。同时往 system prompt 加 `section` `sandbox:policy` `order: 15`（英文）。

`autoApprove` 读 `config.autoApprove ?? process.env.MINI_DSH_AUTO_APPROVE === '1'`。

### 3. file / bash 工具

五个文件工具：`read_file` `write_file` `edit_file` `glob` `grep`。写和改之前 `approve`。`oldText` 找不到抛 `oldText not found`，不唯一抛 `oldText is not unique; refusing an ambiguous edit`。

`matchFilePattern` **要 export**。块注释里不要写 `**/*.md` 这种会提前结束 `*/` 的字面量。

bash：先 `assertCommand`，再 `approve`，再 `spawn('bash', ['-lc', command], { cwd: workspace })`。空 command 抛 `command is required`。听 `exec.signal`，abort 时杀子进程。timeout 30s，输出截断 32KB。

### CLI 补 Approval

1. `inject` 加上 `'sandbox'`
2. 启动时打印 sandbox workspace，以及 `Writes and bash execution ask [Y/n] first. Press Esc to cancel a run.`
3. `setApprover` 接到 `askApproval`。审批期间把 `running` 暂时关掉，避免 Esc 和 `Y/n` 抢输入
4. 卸载时先 `disposeApprover()` 再 `rl.close()`

`askApproval`：`Allow this? [Y/n]`，空回车或 `y` / `yes` 同意，其它打 `rejected.`

### 补充测试

六条标题和本仓库同名，正则用英文。完整代码对照 `test/core.test.js`。写完累计 **18 条**。

### 装配

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

这就是本仓库 `src/index.js` 的最终形态。`/prompt` 里这时才同时有 identity、sandbox policy、runtime context。`/tools` 里应有 `bash` / `read_file`；Context7 连得上才有 `mcp__context7__*`。

---

## 每天怎么对照本仓库

| 你写到哪 | 对照这些文件 | 先别看 |
|---|---|---|
| 第 0 天 Context | `src/index.js` `scripts/check-syntax.js` `.gitignore` | 后面所有 runtime |
| 第 1 天 Session | `session-runtime.js` `plugins/sessions.js` | sandbox、MCP |
| 第 2 天 Tools | `tool-runtime.js` `plugins/tools.js` | `files.js` 的 glob/edit |
| 第 3 天 Prompt / LLM | `system-prompt-runtime.js` `llm-runtime.js` 及两个插件 | DeepSeek SSE |
| 第 4 天 Loop | `agent-loop-runtime.js` `agent-runtime.js` 及两个插件 | CLI 流式着色 |
| 第 5 天真模型 | `deepseek.js` `runtime-context.js` `cli.js` `.env.example` | Approval、沙箱正则 |
| 第 6 天 MCP | `external-plugins.js` `plugins.config.js` | `dsh-mcp-client` 源码、sandbox |
| 第 7 天收束 | `README.zh-CN.md` | `src/` 实现细节 |
| 补充篇沙箱 | `path.js` `sandbox-runtime.js` `plugins/sandbox.js` `tools/*` | 可以看测试，先别抄 400 行正则 |

原则：**先自己写到能测过，再打开对照文件。**

如果卡在某一步，先把**当天那个 runtime 的测试**跑红，不要一上来对完整 `src/index.js`。

补充篇的沙箱可以「对着测试写实现」：先把 `test/core.test.js` 里 sandbox / path / glob 几条抄进你的测试（测试是规格），再写到绿。这和抄 `sandbox-runtime.js` 不是一回事。

---

## 明确不要做的事

本仓库故意没做，新手更不该做：

- maxSteps / token budget / compaction
- 内核级 sandbox、容器、seccomp
- 完整权限系统、credentials、telemetry
- 插件市场
- TUI / Web

先把这五个抽象吃透：

```text
Context / Plugin / Service
Session Event Log
Tool Runtime
LLM Adapter
Agent Loop
```

CLI、MCP 是为了证明这五个抽象够用。沙箱 / Bash / 文件工具也是，所以放在补充篇，不是主线。

---

## 验收清单

### 主线（第 7 天结束，12 条测试）

1. 不接真模型，mock LLM 能跑通 `问时间 → 调 clock → 回答`
2. 连续 20 次 tool call 不会中途停
3. `onReasoning` / `onContent` / `onToolCall` / `onToolResult` 都能收到 chunk
4. （手工）卸载一个工具插件后，`/tools` 里立刻消失
5. 换一个 mock provider，Agent Loop 一行不改
6. （手工）Context7 连得上时 `/tools` 能看到 `mcp__context7__*`；连不上 CLI 仍能进。Agent Loop 没有 `if (mcp)` 分支
7. `/history` 看到的是事件日志；`/reset` 后还是同一个 session id
8. DeepSeek thinking + tool call 的下一轮请求里，仍然带有 `reasoning_content`
9. SSE 最后一行没有 `\n` 也能解析；流式 `name` 不会被拼成 `read_fileread_file`
10. `/prompt` 里能看到 identity + 当前时间 / workspace（还没有 sandbox policy）
11. Esc 能取消一轮进行中的 agent run
12. `pnpm test` 和 `pnpm check` 全绿，`test/core.test.js` 一共 **12 条**

### 补充篇（对齐本仓库 18 条）

13. 文件工具写 `../etc/passwd` 被挡住；workspace 内 `..hidden` 文件名不被误杀
14. `rm -rf src`、`curl https://example.com`、`curl ... | sh` 被沙箱拒绝；`rm file.txt` 放行
15. 没有 approver 时写操作抛错；`autoApprove: true` 时放行
16. `/prompt` 里能看到 identity + sandbox policy + 当前时间 / workspace
17. 写文件和 Bash 前问 `[Y/n]`；审批期间 Esc 不误取消
18. `pnpm test` 一共 18 条，和本仓库一致

---

## 本仓库怎么跑（对照用，不是起点）

```bash
pnpm install
cp .env.example .env
# 填写 DEEPSEEK_API_KEY
pnpm start
pnpm test
pnpm check
```

CLI 命令：

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

本仓库已经带沙箱：写文件和 Bash 执行前会问 `[Y/n]`。Agent 跑起来后按 Esc 取消。Context7 连不上时 CLI 照样进。主线作业到第 6 天还没有沙箱，不要提前抄 CLI 里的 `ctx.sandbox`。
