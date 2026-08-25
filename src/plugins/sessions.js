import { Service } from "@deepseek-ai/cordis";
import { SessionRuntime } from "../core/session-runtime.js";

/**
 * I wrap SessionRuntime as a cordis Service so other plugins can
 * reach it as ctx.sessions, instead of each constructing their own.
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
    // I register the service here; after this, ctx.sessions is available.
    ctx.plugin(SessionsService);
}
