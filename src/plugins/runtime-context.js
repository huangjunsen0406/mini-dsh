import os from 'node:os'
import path from 'node:path'

/**
 * Injects identity and live environment into the system prompt.
 *
 * Time, cwd, and host are harness state, not model knowledge —
 * assemble() re-reads them on every agent step.
 */
export const name = 'mini-runtime-context'
export const inject = ['systemPrompt']

export function apply(ctx, config = {}) {
    const workspace = path.resolve(
        config.workspace ?? process.env.MINI_DSH_WORKSPACE ?? process.cwd(),
    )

    ctx.effect(
        () =>
            ctx.systemPrompt.section({
                name: 'agent:identity',
                order: 10,
                text: [
                    'You are a general-purpose agent running in a local harness.',
                    'When a question can be verified with tools, call the tools instead of pretending to have capabilities that were not provided.',
                    'If the user asks which tools are available, answer from the tools list on this request — do not search the codebase.',
                    'Reply in English by default.',
                ].join('\n'),
            }),
        'system prompt: identity',
    )

    ctx.effect(
        () =>
            ctx.systemPrompt.context({
                name: 'runtime:environment',
                order: 100,
                text: () =>
                    [
                        '## Runtime Context',
                        `- Current time: ${new Date().toISOString()}`,
                        `- Time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'}`,
                        `- Workspace: ${workspace}`,
                        `- Platform: ${process.platform} ${process.arch}`,
                        `- Node.js: ${process.version}`,
                        `- Hostname: ${os.hostname()}`,
                    ].join('\n'),
            }),
        'system prompt: runtime context',
    )
}
