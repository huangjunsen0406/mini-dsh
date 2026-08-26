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

event types: session/start · user/message · assistant/message · assistant/tool_calls · tool/result
```

So tool calls, tool results, and reasoning_content all enter the same history.

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

Product-level DSH subsystems are intentionally not implemented here: compaction, budget, kernel-level sandbox, scheduler, telemetry, full settings/credentials, TUI/Web, etc.

The learning version only adds an **application-level sandbox**: `path.js` constrains file paths to the workspace, `SandboxRuntime` intercepts dangerous shell commands. Write/Bash tools request confirmation via `ctx.sandbox.approve()`, and the CLI registers the callback with `setApprover` and presents the `[Y/n]` gate. This is not container isolation — it is just the Harness's own policy gate.

Once you have these five abstractions down, the real DSH is much easier to read:

```text
Context / Plugin / Service
Session Event Log
Tool Runtime
LLM Adapter
Agent Loop
```
