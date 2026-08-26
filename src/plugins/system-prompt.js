import { Service } from '@deepseek-ai/cordis'
import { SystemPromptRuntime } from '../core/system-prompt-runtime.js'

/**
 * Wraps SystemPromptRuntime as a Cordis Service so other plugins can
 * access it via ctx.systemPrompt. The service name follows DSH.
 */
class SystemPromptService extends Service {
  constructor(ctx) {
    super(ctx, 'systemPrompt')
    this.runtime = new SystemPromptRuntime()
  }
  section(value) { return this.runtime.section(value) }
  context(value) { return this.runtime.context(value) }
  assemble(value) { return this.runtime.assemble(value) }
  inspect() { return this.runtime.inspect() }
}

export const name = 'mini-system-prompt'
export function apply(ctx) {
  ctx.plugin(SystemPromptService)
}
