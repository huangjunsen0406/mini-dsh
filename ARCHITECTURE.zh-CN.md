# mini-dsh 架构

[English](./ARCHITECTURE.md) | 中文

## 一句话

```text
Agent = Model + Harness
```

Harness 的核心是一个可组合的 Cordis Context：

```text
ctx.sessions
ctx.systemPrompt
ctx.tools
ctx.llm
ctx.agents
ctx.agentLoop
ctx.sandbox
```

## 一次请求

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
每轮：deriveMessages() + systemPrompt + tool schemas
 ↓
LLM
 ├─ 无 tool_calls -> assistant/message -> return
 └─ 有 tool_calls
       ↓
   SessionEvent: assistant/tool_calls   ← 记录 reasoning_content + toolCalls
       ↓
   ToolRuntime.execute()
       ↓
   SessionEvent: tool/result
       ↓
   回到 LLM
```

## 为什么 Session 用 Event Log

```text
SessionEvent[] = 事实
messages       = 给模型看的投影视图

类型：session/start · user/message · assistant/message · assistant/tool_calls · tool/result
```

这样 Tool Call、Tool Result、reasoning_content 都可以统一进入同一条历史。

## 为什么 MCP 能直接接进来

官方 `dsh-mcp-client` 最重要的依赖之一是 `ctx.tools.register()`：

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

AgentLoop 不需要写任何 `if (mcp)` 特殊分支。

## 学习版刻意没有什么

这里故意不实现完整 DSH 的产品级子系统，例如 compaction、budget、内核级 sandbox、scheduler、telemetry、完整 settings/credentials、TUI/Web 等。

学习版只加了一层**应用层沙箱**：`path.js` 限制文件越界，`SandboxRuntime` 拦截危险 Shell；写入 / Bash 工具经 `ctx.sandbox.approve()` 请求确认，CLI 用 `setApprover` 注册回调并弹出 `[Y/n]` 闸门。这不是容器隔离，只是 Harness 自己的策略闸门。

先把以下五个抽象吃透，再去读真正的 DSH 会容易很多：

```text
Context / Plugin / Service
Session Event Log
Tool Runtime
LLM Adapter
Agent Loop
```
