# mini-dsh Architecture

English | [中文](./ARCHITECTURE.zh-CN.md)

## The one-liner

```text
Agent = Model + Harness
```

The core of the Harness is a composable Cordis Context:

```text
ctx.sessions
ctx.systemPrompt
ctx.tools
ctx.llm
ctx.agents
ctx.agentLoop
ctx.tokenMeter
ctx.compaction
ctx.sandbox
```

## One request

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
each turn: deriveMessages() + systemPrompt + tool schemas
 ↓
LLM
 ├─ no tool_calls -> assistant/message -> return
 └─ has tool_calls
       ↓
   SessionEvent: assistant/tool_calls   ← records reasoning_content + toolCalls
       ↓
   ToolRuntime.execute()
       ↓
   SessionEvent: tool/result
       ↓
   back to LLM
```

## Why Session uses an Event Log

```text
SessionEvent[] = facts
messages       = projection for the model

event types: session/start · user/message · assistant/message · assistant/tool_calls · tool/result · session/compact
```

So tool calls, tool results, and reasoning_content all enter the same history.

## Why Compaction is just another event

```text
tokenMeter (4 chars ≈ 1 token, fixed heuristic)
    ↓
estimate >= threshold (default 24000)
    ↓
SessionEvent: session/compact { summary, upToSeq }   ← append-only, never rewrites
    ↓
deriveMessages(): events up to upToSeq project as ONE summary message
```

The cut point never splits an assistant tool_calls message from its tool
results. This is what keeps the infinite agent loop alive in long sessions —
the official harness answers "context full" the same way: fold history into a
summary, keep looping. Not by counting steps.

## Why MCP plugs in directly

One of the most important dependencies of the official `dsh-mcp-client` is `ctx.tools.register()`:

```text
Context7 MCP
    ↓
dsh-mcp-client
    ↓
ctx.tools.register()
    ↓
ToolRuntime
    ↓
AgentLoop
```

The AgentLoop needs no `if (mcp)` branch.

## What the learning version deliberately omits

Product-level DSH subsystems are intentionally not implemented here: budget, kernel-level sandbox, scheduler, telemetry, full settings/credentials, TUI/Web, etc. Compaction exists here only in a minimal form: one threshold, one summary event, no pressure/overflow dual triggers, no replay-aware metering, no tool-pairing rebalancing.

The learning version only adds an **application-level sandbox**, and the instructive part of it is where each gate fails:

- `path.js` constrains file paths to the workspace. Allowlist-shaped, so it is the strongest of the three, and it checks containment twice: lexically for `../` and absolute paths, then again through `realpath` so a symlink living *inside* the workspace cannot point out of it. Getting the second check right is the whole lesson of an allowlist — an allowlist only holds if what you resolve is what the OS will resolve.
- `SandboxRuntime` intercepts dangerous shell commands. This one is a denylist, so it is incomplete by construction — `echo <base64> | base64 -d | sh`, `python3 -c '...'` and `node -e '...'` all sail through. Adding patterns does not fix that; that is simply what denylists are.
- `ctx.sandbox.approve()` stops writes and bash execution for a `[Y/n]`. The CLI registers the callback with `setApprover`. **This is the permission boundary.** The two gates above only decide what reaches the human, and how often the human is asked.

So: not container isolation, and not really a "sandbox" in the isolation sense — a policy gate standing in front of a person. If you take one thing from this file into a real system, take that ordering: a denylist buys convenience, an allowlist buys a boundary, and neither replaces someone approving the dangerous thing.

Once you have these five abstractions down, the real DSH is much easier to read:

```text
Context / Plugin / Service
Session Event Log
Tool Runtime
LLM Adapter
Agent Loop
```
