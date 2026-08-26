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
ctx.skills
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

## 为什么 skill 是目录，不是整段 prompt

官方 DSH 不把 skill **正文**塞进 system prompt。学习版用三个插件做同一件事，Loop 一行不改：

```text
.dsh/skills/<name>/SKILL.md
    ↓
dsh-skill-filesystem（扫盘 + 解析 frontmatter）
    ↓
ctx.skills.list() / get()
    ↓
systemPrompt context：只有 name + description
    ↓
skill({ name }) 工具 → 正文作为 tool/result
```

AgentLoop 不需要 `if (skill)` 分支。坏文件跳过；同名保留 rank 更小的（项目目录赢过 runtime 注册）。

## 学习版刻意没有什么

这里故意不实现完整 DSH 的产品级子系统，例如 compaction、budget、内核级 sandbox、scheduler、telemetry、完整 settings/credentials、TUI/Web 等。

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
