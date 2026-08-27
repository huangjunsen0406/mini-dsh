import { Service } from '@deepseek-ai/cordis'
import { SandboxRuntime } from '../core/sandbox-runtime.js'

/**
 * Wraps SandboxRuntime as ctx.sandbox.
 *
 * Path limits, command policy, and approval all go through this
 * service. Bash, files, and the CLI only consume the interface.
 */
export const name = 'mini-sandbox'
export const inject = ['systemPrompt']

export function apply(ctx, config = {}) {
    const runtime = new SandboxRuntime({
        workspace: config.workspace ?? process.env.MINI_DSH_WORKSPACE ?? process.cwd(),
        autoApprove: config.autoApprove ?? process.env.MINI_DSH_AUTO_APPROVE === '1',
    })

    class SandboxService extends Service {
        constructor(inner) {
            super(inner, 'sandbox')
            this.runtime = runtime
        }

        get workspace() {
            return this.runtime.workspace
        }
        resolvePath(requested) {
            return this.runtime.resolvePath(requested)
        }
        inspectCommand(command) {
            return this.runtime.inspectCommand(command)
        }
        assertCommand(command) {
            return this.runtime.assertCommand(command)
        }
        approve(request) {
            return this.runtime.approve(request)
        }
        setApprover(fn) {
            return this.runtime.setApprover(fn)
        }
    }

    ctx.plugin(SandboxService)

    ctx.effect(
        () =>
            ctx.systemPrompt.section({
                name: 'sandbox:policy',
                order: 15,
                text: [
                    '## Sandbox',
                    `- Workspace: ${runtime.workspace}`,
                    '- All file reads, writes, and creates must stay inside the workspace. Do not use .. to escape it.',
                    '- Dangerous shell commands are blocked (rm -r / rm -rf, writes to system paths, unauthorized curl/wget).',
                    '- Writes and bash execution ask the user first. If rejected, do not retry with a different spelling.',
                ].join('\n'),
            }),
        'system prompt: sandbox',
    )
}
