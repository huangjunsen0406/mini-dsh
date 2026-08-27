import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import * as agentLoop from '../src/plugins/agent-loop.js'
import * as agents from '../src/plugins/agents.js'
import * as compaction from '../src/plugins/compaction.js'
import * as externalPlugins from '../src/plugins/external-plugins.js'
import * as llm from '../src/plugins/llm.js'
import * as runtimeContext from '../src/plugins/runtime-context.js'
import * as sandbox from '../src/plugins/sandbox.js'
import * as sessions from '../src/plugins/sessions.js'
import * as systemPrompt from '../src/plugins/system-prompt.js'
import * as tokenMeter from '../src/plugins/token-meter.js'
import * as tools from '../src/plugins/tools.js'
import * as bash from '../src/tools/bash.js'
import * as files from '../src/tools/files.js'

/**
 * Boots the same plugin stack as src/index.js (minus the CLI) on a real
 * Cordis Context and verifies the wiring, not just the runtimes in isolation.
 * A mock provider stands in for DeepSeek so no network or API key is needed.
 */
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
        await root.plugin(tokenMeter)
        await root.plugin(compaction)
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
        assert.ok(root.tokenMeter)
        assert.ok(root.compaction)

        // ctx.effect-based registrations from runtime-context/sandbox/tools all ran.
        const toolNames = root.tools
            .list()
            .map((tool) => tool.name)
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
                        assert.ok(schemas.some((tool) => tool.function?.name === 'bash'))
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

        const types = root.sessions.get(session.id).events.map((event) => event.type)
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
