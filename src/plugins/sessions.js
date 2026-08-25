import { Service } from "@deepseek-ai/cordis";
import { SessionRuntime } from "../core/session-runtime.js";

/**
 * Wraps SessionRuntime as a Cordis Service so other plugins can
 * access it via ctx.sessions instead of constructing individual instances.
 */
class SessionsService extends Service {
    constructor(ctx) {
        super(ctx, "sessions");
        this.runtime = new SessionRuntime();
    }

    create(meta) {
        return this.runtime.create(meta);
    }
    get(id) {
        return this.runtime.get(id);
    }
    append(id, type, data) {
        return this.runtime.append(id, type, data);
    }
    clear(id) {
        return this.runtime.clear(id);
    }
    list() {
        return this.runtime.list();
    }
    deriveMessages(id) {
        return this.runtime.deriveMessages(id);
    }
}

export const name = "mini-sessions";
export function apply(ctx) {
    ctx.plugin(SessionsService);
}
