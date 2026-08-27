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
ctx.tokenMeter
ctx.compaction
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

类型：session/start · user/message · assistant/message · assistant/tool_calls · tool/result · session/compact
```

这样 Tool Call、Tool Result、reasoning_content 都可以统一进入同一条历史。

## 为什么 Compaction 也只是一条事件

```text
tokenMeter（4 字符 ≈ 1 token，固定启发式）
    ↓
估算值 >= 阈值（默认 24000）
    ↓
SessionEvent: session/compact { summary, upToSeq }   ← append-only，从不改写历史
    ↓
deriveMessages()：upToSeq 之前的事件投影成一条摘要消息
```

切点永远不会把 assistant tool_calls 和它的 tool results 拆开。这正是无限 Agent Loop 在长会话里活得下去的原因——官方 DSH 面对"上下文满了"也是同一个答案：把历史折叠成摘要，继续循环。而不是数步数。

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

这里故意不实现完整 DSH 的产品级子系统，例如 budget、内核级 sandbox、scheduler、telemetry、完整 settings/credentials、TUI/Web 等。Compaction 只保留了最小形态：单一阈值、一条摘要事件；没有 pressure/overflow 双触发、没有 replay-aware 精确计量、没有 tool-pairing 再平衡。

学习版只加了一层**应用层沙箱**，而它真正值得学的地方是每道闸门各自失效在哪里：

- `path.js` 把文件路径限制在 workspace 内。它是白名单形状的，所以是三者里最强的一道，而且判定做了两次：先按词法挡 `../` 和绝对路径，再走一次 `realpath`，让 workspace **内部**的软链没法指到外面去。第二道才是白名单这件事的全部要点——白名单能成立的前提，是你解析出来的东西和操作系统最终解析的是同一个。
- `SandboxRuntime` 拦截危险 Shell 命令。这道是黑名单，因此天生不可能完整——`echo <base64> | base64 -d | sh`、`python3 -c '...'`、`node -e '...'` 全部直接放行。继续加模式补不上这个洞，黑名单本来就是这样。
- `ctx.sandbox.approve()` 让写入和 Bash 执行停下来等一个 `[Y/n]`，CLI 用 `setApprover` 注册回调。**这才是权限边界。** 上面两道闸门只决定什么东西会送到人面前、以及人被问的频率。

所以：这不是容器隔离，在隔离的意义上甚至算不上"沙箱"——它是一道站在人前面的策略闸门。如果只从这一节带走一件事，带走这个次序：黑名单买到的是便利，白名单买到的才是边界，而两者都替代不了一个人去批准那件危险的事。

先把以下五个抽象吃透，再去读真正的 DSH 会容易很多：

```text
Context / Plugin / Service
Session Event Log
Tool Runtime
LLM Adapter
Agent Loop
```
