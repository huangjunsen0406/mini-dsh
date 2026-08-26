import readline from 'node:readline'

export const name = 'mini-cli'
export const inject = [
    'sessions',
    'agents',
    'agentLoop',
    'tools',
    'systemPrompt',
    'llm'
]

/**
 * Thinnest UI layer. Session, tools, LLM, and the agent loop
 * do not belong here.
 */
export function apply(ctx, config = {}) {
    const session = ctx.sessions.create({ source: 'cli' })

    const initialModel =
        config.model ??
        process.env.MINI_DSH_MODEL ??
        ctx.llm.defaultSelection()

    const agent = ctx.agents.create({
        name: 'cli-agent',
        sessionId: session.id,
        model: initialModel,
        loop: ctx.agentLoop,
    })

    ctx.effect(() => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
        })

        let running = false

        console.log('\nmini-dsh: a learning runtime for DSH')
        console.log(
            'commands: /tools /history /prompt /models /model [provider/model] /reset /exit\n',
        )
        console.log(`model: ${agent.model}\n`)

        const ask = () => {
            if (!running) rl.question('User > ', handle)
        }

        const handle = async input => {
            const text = input.trim()
            if (!text) return ask()

            if (text === '/exit') {
                rl.close()
                await ctx.root.fiber.dispose()
                return
            }

            if (text === '/reset') {
                ctx.sessions.clear(session.id)
                console.log('Session cleared.\n')
                return ask()
            }

            if (text === '/tools') {
                const lines = ctx.tools.list().map(tool => {
                    const firstLine = String(tool.description ?? '').trim().split('\n')[0]
                    return `- ${tool.name}: ${firstLine}`
                })
                console.log(lines.join('\n') || '(no tools)')
                console.log()
                return ask()
            }

            if (text === '/models') {
                console.log(ctx.llm.models().join('\n') || '(no models)')
                console.log()
                return ask()
            }

            if (text === '/model') {
                console.log(`model: ${agent.model}\n`)
                return ask()
            }

            if (text.startsWith('/model ')) {
                const selection = text.slice('/model '.length).trim()
                if (!ctx.llm.has(selection)) {
                    console.log(`unknown model: ${selection}`)
                    console.log('available models:')
                    console.log(ctx.llm.models().join('\n') || '(no models)')
                    console.log()
                    return ask()
                }
                agent.model = selection
                console.log(`switched model: ${agent.model}\n`)
                return ask()
            }

            if (text === '/history') {
                console.log(
                    JSON.stringify(ctx.sessions.get(session.id).events, null, 2),
                )
                console.log()
                return ask()
            }

            if (text === '/prompt') {
                console.log(
                    await ctx.systemPrompt.assemble({
                        agent,
                        sessionId: session.id,
                        step: 0,
                    }),
                )
                console.log()
                return ask()
            }

            running = true
            let inThinking = false
            let inContent = false

            try {
                await agent.send(text, {
                    onReasoning(chunk) {
                        if (!inThinking) {
                            inThinking = true
                            process.stdout.write('\n\x1b[90m[Thinking]\n')
                        }
                        process.stdout.write(`\x1b[90m${chunk}\x1b[0m`)
                    },
                    onContent(chunk) {
                        if (inThinking) {
                            inThinking = false
                            process.stdout.write('\n\n')
                        }
                        if (!inContent) {
                            inContent = true
                            process.stdout.write('\nAgent > ')
                        }
                        process.stdout.write(chunk)
                    },
                    onToolCall(call) {
                        if (inThinking) {
                            inThinking = false
                            process.stdout.write('\n')
                        }
                        inContent = false
                        const argsStr = JSON.stringify(call.arguments ?? {})
                        process.stdout.write(`\n\x1b[36m[Tool Call: ${call.name}]\x1b[0m ${argsStr}\n`)
                    },
                    onToolResult(res) {
                        const preview = String(res.renderedContent || '').slice(0, 300)
                        const truncated = (res.renderedContent || '').length > 300 ? '...' : ''
                        process.stdout.write(`\x1b[32m[Tool Result: ${res.name}]\x1b[0m ${preview}${truncated}\n`)
                    },
                })

                if (inThinking) {
                    process.stdout.write('\n')
                }
                process.stdout.write('\n\n')
            } catch (error) {
                if (inThinking || inContent) {
                    process.stdout.write('\n')
                }
                console.error(`\n[AgentError] ${error?.message ?? error}\n`)
            } finally {
                running = false
                ask()
            }
        }

        rl.on('close', () => {
            if (!ctx.root.fiber.isDisposed) process.exitCode = 0
        })

        ask()
        return () => {
            rl.close()
        }
    }, 'interactive cli')
}
