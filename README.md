# mini-dsh

English | [中文](./README.zh-CN.md)

A minimal handwritten runtime following DSH concepts, built on [`@deepseek-ai/cordis`](https://www.npmjs.com/package/@deepseek-ai/cordis).

This is a **minimal project for learning the core DSH design** — not a full DSH product.

It deliberately keeps five things:

1. Cordis Context / Plugin / Service
2. Session Event Log -> deriveMessages()
3. Tool Registry -> register / schemas / execute
4. LLM Provider Adapter
5. Agent Loop -> model -> tool -> model -> answer

Plus one supporting pair that keeps the infinite loop alive in long sessions — both modeled after the official harness in miniature:

6. Token Meter -> a fixed 4-chars-per-token heuristic (no exact tokenizer)
7. Compaction -> append one `session/compact` event; deriveMessages() projects the covered prefix as a single summary. The log stays append-only.

It also keeps the Bash/File tools and the official `@deepseek-ai/dsh-mcp-client` + Context7, to prove "Everything is a Plugin". Context7 is optional: the CLI still starts when it is unreachable — you just don't get those MCP tools.

## Demo

![mini-dsh CLI](./images/demo.png)

## Environment

- Node.js `>= 20.18.1`
- pnpm `11.22.0` (see `packageManager` in `package.json`)

## Run

```bash
pnpm install
cp .env.example .env
# fill in DEEPSEEK_API_KEY
pnpm start
```

`.env.example` sets `deepseek/deepseek-v4-flash`. If `MINI_DSH_MODEL` is absent entirely (e.g. you didn't copy `.env`), the entry falls back to `deepseek/deepseek-v4-pro` (`src/index.js:41`).

Optional: fill in `CONTEXT7_API_KEY`. When `mcp.context7.com` is unreachable you only see `[plugin] failed` — the process does not die.

The path once Context7 is connected:

```text
@deepseek-ai/dsh-mcp-client
  -> https://mcp.context7.com/mcp
  -> ctx.tools.register(...)
  -> mcp__context7__resolve-library-id
  -> mcp__context7__query-docs
```

## CLI

```text
/tools
/models
/model
/model deepseek/deepseek-v4-pro
/model deepseek/deepseek-v4-flash
/history
/prompt
/usage
/compact
/reset
/exit
```

Writes and bash execution ask `[Y/n]` first. Press **Esc** while the agent is running to cancel the current run (arrow keys won't cancel it).

`/usage` shows the estimated context size against the compaction threshold. `/compact` compacts manually (keep the last 20 message events, summarize the rest). The agent loop also compacts automatically at every step boundary once the estimate passes `MINI_DSH_COMPACT_AT` (default 24000 tokens). A `finish_reason: length` response is reported through `onFinish` and shown as `[truncated: output hit max tokens]`.

## Why is there no 12-step limit in the Agent Loop?

The learning version deliberately uses:

```js
while (true) {
  const response = await model()

  if (!response.toolCalls?.length) {
    return response.content
  }

  await executeTools(response.toolCalls)
}
```

The only normal-ending condition is whether the model keeps requesting tools.

Deliberately omitted here:

- maxSteps
- token/cost budget (the token meter only estimates for compaction and `/usage`; no step gating)
- no-progress detector
- stop hooks
- steering queue
- full permission system (the learning version has an app-level path gate and a command denylist standing in front of the one real boundary: the CLI [Y/n] confirmation)
- full model configuration center
- TUI/Web UI

Compaction is included in a deliberately minimal form (`src/core/compaction-runtime.js`): like the official harness, the infinite loop survives long sessions by folding old history into a summary — never by counting steps or gating on a token budget. Official-style pressure/overflow dual triggers, replay-aware metering, and tool-pairing rebalancing stay out of scope.

These are very useful for a mature product, but not required to understand the core of an Agent Harness.

> Note: a bad model/tool chain could therefore loop forever in theory. This project is for learning — do not use it as a production Agent Runtime.

## For beginners: write it from scratch

Do not read the whole repo first. Skim **[ARCHITECTURE.md](./ARCHITECTURE.md)** to build the overall picture, then create a new empty project and write it yourself, milestone by milestone, following **[LEARNING.md](./LEARNING.md)**.

## Recommended reading order

```text
src/index.js
  ↓
src/plugins/sessions.js
src/plugins/system-prompt.js
src/plugins/tools.js
src/plugins/llm.js
src/plugins/agents.js
src/plugins/agent-loop.js
src/plugins/sandbox.js
  ↓
src/core/session-runtime.js
  ↓
src/core/system-prompt-runtime.js
src/plugins/runtime-context.js
  ↓
src/core/tool-runtime.js
  ↓
src/core/llm-runtime.js
  ↓
src/core/agent-runtime.js
  ↓
src/core/agent-loop-runtime.js   ← the core
  ↓
src/core/token-meter-runtime.js
src/core/compaction-runtime.js   ← keeps the infinite loop alive
  ↓
src/plugins/cli.js
  ↓
src/utils/path.js
src/core/sandbox-runtime.js
  ↓
src/models/deepseek.js
  ↓
src/tools/bash.js
src/tools/files.js
  ↓
src/plugins/external-plugins.js
plugins.config.js
  ↓
test/core.test.js   ← behavior docs: one example per runtime
```

## The most important mental model

```text
                                    Cordis Context
                                           │
    ┌────────────┬────────────┬────────────┬────────────┬────────────┬────────────┐
    ▼            ▼            ▼            ▼            ▼            ▼            ▼
    sessions     systemPrompt tools        llm          agents       agentLoop   tokenMeter
                              │            │                         Agent    → compaction
                              bash / files DeepSeek                            (threshold →
                              │                                               summary event)
                              ctx.sandbox
                              path / command / Y/n
                              └── dsh-mcp-client (optional)
                                           │
                                        Context7
```

The Agent Loop knows nothing about Context7 or Bash; it only knows `ctx.tools`. An Agent is just a thin wrapper: sessionId + model + loop (`src/core/agent-runtime.js`).

That is the most valuable thing to learn in this project.

## Testing

```bash
pnpm test
pnpm check
```

The tests include a case where an agent finishes only after 20 straight tool calls — proof that the Loop no longer has the old 12-step cap. There are also cases for automatic compaction at a step boundary in a long session, stacked compactions keeping only the newest summary, and tool-call pairs never being split by a summary edge.

Learn AI on [LINUX DO](https://linux.do)
