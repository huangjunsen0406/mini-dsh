import { FileSystemSkillProvider } from '../core/skill-filesystem.js'

export const name = 'mini-skill-filesystem'
export const inject = ['skills']

/**
 * Registers the local filesystem skill provider on ctx.skills.
 * Discovery is cwd/workspace-sensitive; the agent loop does not change.
 */
export function apply(ctx, config = {}) {
    const provider = new FileSystemSkillProvider({
        workspace: config.workspace ?? process.env.MINI_DSH_WORKSPACE ?? process.cwd(),
        extraDirs: config.extraDirs ?? [],
    })
    ctx.effect(() => ctx.skills.registerProvider(provider), 'skill provider: filesystem')
}
