import { isModelInvocable, isSkillName } from '../core/skill-runtime.js'

const CATALOG_DESCRIPTION_MAX = 500

export const name = 'mini-tool-skill'
export const inject = ['tools', 'skills', 'systemPrompt']

/**
 * Model-facing skill loader plus a catalog fragment.
 *
 * The catalog is summaries only (name + description). The body is loaded
 * through the `skill` tool, the same contract as official dsh-tool-skill.
 * Mini has no agent/pre-step inject, so the catalog is a systemPrompt
 * context that assemble() rereads every loop step.
 */
export function apply(ctx) {
    ctx.effect(
        () =>
            ctx.tools.register({
                name: 'skill',
                description:
                    'Load the full instructions for an available skill. Call this with the exact skill name from the skills list before acting on a task that names or clearly matches that skill.',
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        name: {
                            type: 'string',
                            description: 'The exact skill name from the available skills list.',
                        },
                    },
                    required: ['name'],
                },
                output: {
                    schema: { type: 'object' },
                    render(_args, value) {
                        return [{ type: 'text', text: renderSkillContent(value) }]
                    },
                },
                async execute({ name }) {
                    return executeSkill(ctx.skills, name)
                },
            }),
        'tool: skill',
    )

    ctx.effect(
        () =>
            ctx.systemPrompt.context({
                name: 'skills:catalog',
                order: 20,
                text: async () => {
                    const skills = (await ctx.skills.list()).filter(isModelInvocable)
                    if (skills.length === 0) return ''
                    return [
                        '## Skills',
                        'A skill is a reusable set of task-specific instructions. This list is summaries only — do not infer or follow a skill until you load it with the `skill` tool.',
                        'If the user names a skill, or the task clearly matches a description, call `skill` with the exact name before taking task actions.',
                        ...skills.map(
                            (skill) =>
                                `- \`${skill.name}\`: ${escapeText(clip(skill.description, CATALOG_DESCRIPTION_MAX))}`,
                        ),
                    ].join('\n')
                },
            }),
        'system prompt: skills catalog',
    )
}

export async function executeSkill(skills, name) {
    if (!isSkillName(name)) throw new Error(`invalid skill name "${name}"`)
    const summary = (await skills.list()).find((skill) => skill.name === name)
    if (!summary) throw new Error(`skill "${name}" is unknown or no longer available`)
    if (!isModelInvocable(summary)) {
        throw new Error(`skill "${name}" is not available for model invocation`)
    }
    const skill = await skills.get(name)
    if (!skill) throw new Error(`skill "${name}" is unknown or no longer available`)
    if (!isModelInvocable(skill)) {
        throw new Error(`skill "${name}" is not available for model invocation`)
    }
    return {
        name: skill.name,
        provider: skill.provider,
        ...(skill.resourceBase ? { resourceBase: skill.resourceBase } : {}),
        content: skill.content,
    }
}

export function renderSkillContent(value) {
    const lines = [`<skill_content name="${value.name}">`]
    if (value.resourceBase?.kind === 'directory' && value.resourceBase.path) {
        lines.push('<skill_resources>')
        lines.push(`Relative paths in this skill resolve from: ${value.resourceBase.path}`)
        lines.push('</skill_resources>')
    }
    lines.push('<skill_instructions>')
    lines.push(value.content)
    lines.push('</skill_instructions>')
    lines.push('</skill_content>')
    return lines.join('\n')
}

function clip(text, max) {
    const value = String(text ?? '')
    if (value.length <= max) return value
    return `${value.slice(0, max - 1)}…`
}

function escapeText(text) {
    return String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
