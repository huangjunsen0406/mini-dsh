import { Service } from '@deepseek-ai/cordis'
import { SkillRuntime } from '../core/skill-runtime.js'

/**
 * Wraps SkillRuntime as a Cordis Service so other plugins can
 * access it via ctx.skills.
 */
class SkillsService extends Service {
    constructor(ctx) {
        super(ctx, 'skills')
        this.runtime = new SkillRuntime()
    }

    registerProvider(provider) {
        return this.runtime.registerProvider(provider)
    }
    register(skill) {
        return this.runtime.register(skill)
    }
    list() {
        return this.runtime.list()
    }
    snapshot() {
        return this.runtime.snapshot()
    }
    get(name) {
        return this.runtime.get(name)
    }
}

export const name = 'mini-skills'
export function apply(ctx) {
    ctx.plugin(SkillsService)
}
