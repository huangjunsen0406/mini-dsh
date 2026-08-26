import path from 'node:path'
import { resolveInside } from '../utils/path.js'

const SYSTEM_PATH_PREFIXES = [
    '/etc', '/usr', '/bin', '/sbin', '/boot', '/dev', '/proc', '/sys',
    '/root', '/lib', '/lib64', '/var', '/opt', '/System', '/Library', '/private',
]

const SYSTEM_BIN_PREFIXES = [
    '/bin/', '/usr/bin/', '/usr/local/bin/', '/opt/homebrew/bin/',
    '/sbin/', '/usr/sbin/',
]

const ALLOWED_DEVICES = new Set([
    '/dev/null', '/dev/zero', '/dev/stdin', '/dev/stdout', '/dev/stderr', '/dev/tty',
])

const SHELL_WRAPPERS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])

const DEFAULT_ALLOW_HOSTS = ['localhost', '127.0.0.1', '::1', '0.0.0.0']

/**
 * Lightweight application-level sandbox.
 *
 * This is not kernel isolation, seccomp, or a container. It does three things:
 * 1. Path gate: every file path must land inside the workspace.
 * 2. Command policy: block rm -rf /, writes to system paths, unauthorized curl, etc.
 * 3. Approval: writes and bash execution go through the UI first.
 */
export class SandboxRuntime {
    #approver = null

    constructor({
        workspace,
        autoApprove = false,
        allowHosts = DEFAULT_ALLOW_HOSTS,
    } = {}) {
        this.workspace = path.resolve(workspace ?? process.cwd())
        this.autoApprove = Boolean(autoApprove)
        this.allowHosts = new Set(allowHosts)
    }

    resolvePath(requested) {
        return resolveInside(this.workspace, requested)
    }

    inspectCommand(command) {
        return inspectCommand(command, {
            workspace: this.workspace,
            allowHosts: this.allowHosts,
        })
    }

    assertCommand(command) {
        const result = this.inspectCommand(command)
        if (result.action === 'deny') {
            throw new Error(`sandbox denied: ${result.reason}`)
        }
        return result
    }

    /**
     * Register the CLI approval callback. Returns a disposer that clears it.
     * autoApprove=true skips confirmation for tests and non-interactive runs.
     */
    setApprover(fn) {
        this.#approver = typeof fn === 'function' ? fn : null
        return () => {
            if (this.#approver === fn) this.#approver = null
        }
    }

    async approve(request = {}) {
        const summary = request.summary ?? request.tool ?? 'this operation'
        if (this.autoApprove) {
            return { approved: true, source: 'auto' }
        }
        if (!this.#approver) {
            throw new Error(`write requires user approval, but no approval channel is set: ${summary}`)
        }
        const ok = await this.#approver(request)
        if (!ok) {
            throw new Error(`user rejected this operation: ${summary}`)
        }
        return { approved: true, source: 'user' }
    }
}

function deny(reason) {
    return { action: 'deny', reason }
}

function inspectCommand(command, ctx, depth = 0) {
    if (typeof command !== 'string' || !command.trim()) {
        return deny('command is required')
    }
    if (depth > 5) return deny('command nesting is too deep')

    const text = command.trim()

    if (/\{\s*:\s*\|\s*:\s*&\s*\}/.test(text)) {
        return deny('fork bombs are blocked')
    }

    if (/(?:^|[;&|\n]\s*)(?:sudo|su)\b/.test(text)) {
        return deny('sudo/su is blocked')
    }

    if (/\b(?:shutdown|reboot|halt|poweroff)\b/.test(text) || /\binit\s+[06]\b/.test(text)) {
        return deny('shutdown/reboot commands are blocked')
    }

    if (/\bmkfs(?:\.\w+)?\b/.test(text) || /\bdd\b[\s\S]*\bof\s*=\s*\/dev\//.test(text)) {
        return deny('destructive disk/device commands are blocked')
    }

    if (isRecursiveRm(tokenize(text))) {
        return deny('recursive delete (rm -r / rm -rf) is blocked; only single-file deletes inside the workspace are allowed')
    }

    const piped = inspectPipedDownload(text)
    if (piped) return piped

    for (const inner of extractSubstitutions(text)) {
        const nested = inspectCommand(inner, ctx, depth + 1)
        if (nested.action === 'deny') return nested
    }

    const tokens = tokenize(text)

    const wrapped = inspectWrappers(tokens, ctx, depth)
    if (wrapped) return wrapped

    const network = inspectNetwork(tokens, ctx)
    if (network) return network

    const escaped = inspectPathTokens(tokens, ctx.workspace)
    if (escaped) return escaped

    return { action: 'allow' }
}

function isRecursiveRm(tokens) {
    for (let i = 0; i < tokens.length; i++) {
        if (isSeparator(tokens[i])) continue
        if (path.basename(tokens[i]) !== 'rm') continue

        for (let j = i + 1; j < tokens.length; j++) {
            const token = tokens[j]
            if (isSeparator(token)) break
            if (token === '--') continue
            if (token === '--recursive' || token === '--no-preserve-root') return true
            if (token.startsWith('--')) continue
            if (token.startsWith('-') && token !== '-' && /[rR]/.test(token)) return true
        }
    }
    return false
}

function inspectPipedDownload(text) {
    if (!/\b(?:curl|wget)\b/.test(text)) return null
    if (/\b(?:curl|wget)\b[\s\S]*\|\s*(?:ba)?sh\b/.test(text)) {
        return deny('piping curl/wget into a shell is blocked')
    }
    if (/\b(?:ba)?sh\s+<\s*\(\s*(?:curl|wget)\b/.test(text)) {
        return deny('piping curl/wget into a shell is blocked')
    }
    return null
}

function extractSubstitutions(text) {
    const inner = []
    for (const match of text.matchAll(/\$\(([^)]*)\)/g)) inner.push(match[1])
    for (const match of text.matchAll(/`([^`]+)`/g)) inner.push(match[1])
    return inner
}

function inspectWrappers(tokens, ctx, depth) {
    for (let i = 0; i < tokens.length; i++) {
        const cmd = path.basename(tokens[i])
        if (cmd === 'eval') {
            const rest = tokens.slice(i + 1).join(' ')
            if (!rest) continue
            const nested = inspectCommand(rest, ctx, depth + 1)
            if (nested.action === 'deny') return nested
        }
        if (!SHELL_WRAPPERS.has(cmd)) continue
        for (let j = i + 1; j < tokens.length; j++) {
            if (tokens[j] === '-c' && tokens[j + 1]) {
                const nested = inspectCommand(tokens[j + 1], ctx, depth + 1)
                if (nested.action === 'deny') return nested
            }
        }
    }
    return null
}

const CURL_VALUE_FLAGS = new Set([
    '-o', '--output', '-O', '--remote-name', '--remote-name-all',
    '-T', '--upload-file', '--url',
    '-K', '--config', '--unix-socket',
    '-x', '--proxy',
    '-P', '--directory-prefix', '--output-document',
])

function inspectNetwork(tokens, ctx) {
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] !== 'curl' && tokens[i] !== 'wget') continue

        for (let j = i + 1; j < tokens.length; j++) {
            const token = tokens[j]
            if (isSeparator(token) || token === 'curl' || token === 'wget') break
            if (token.startsWith('-')) {
                const eq = token.indexOf('=')
                if (eq > 0) {
                    const blocked = inspectNetArg(token.slice(eq + 1), ctx)
                    if (blocked) return blocked
                }
                if (CURL_VALUE_FLAGS.has(token) && tokens[j + 1] && !tokens[j + 1].startsWith('-')) {
                    const blocked = inspectNetArg(tokens[++j], ctx)
                    if (blocked) return blocked
                }
                continue
            }
            const blocked = inspectNetArg(token, ctx)
            if (blocked) return blocked
        }
    }
    return null
}

function inspectNetArg(arg, ctx) {
    if (/^file:/i.test(arg)) {
        try {
            const filePath = decodeURIComponent(new URL(arg).pathname)
            resolveInside(ctx.workspace, filePath)
        } catch {
            return deny(`curl/wget path escapes the workspace: ${arg}`)
        }
        return null
    }

    const host = extractHost(arg)
    if (host) {
        if (!isAllowedHost(host, ctx.allowHosts)) {
            return deny(`unauthorized outbound request blocked: ${arg}`)
        }
        return null
    }

    if (isBareHostname(arg) && !isAllowedHost(stripPort(arg), ctx.allowHosts)) {
        return deny(`unauthorized outbound request blocked: ${arg}`)
    }

    if (looksLikePath(arg)) {
        const { expanded, unset } = expandPathToken(arg)
        if (unset) return deny(`cannot expand environment variable, rejecting path: ${arg}`)
        try {
            resolveInside(ctx.workspace, expanded)
        } catch {
            return deny(`curl/wget path escapes the workspace: ${arg}`)
        }
    }
    return null
}

function inspectPathTokens(tokens, workspace) {
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]
        if (isSeparator(token) || !looksLikePath(token)) continue
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(token)) continue

        const { expanded: requested, unset } = expandPathToken(token)
        if (unset) {
            return deny(`cannot expand environment variable, rejecting path: ${token}`)
        }

        const commandPosition = i === 0 || isSeparator(tokens[i - 1])
        if (commandPosition && (isSystemBinary(requested) || isSystemBinary(token))) continue
        try {
            resolveInside(workspace, requested)
        } catch {
            const abs = path.resolve(workspace, requested)
            if (isAllowedDevice(requested) || isAllowedDevice(abs) || isAllowedDevice(token)) continue
            if (isSystemPath(abs) || isSystemPath(requested)) {
                return deny(`system path is blocked: ${token}`)
            }
            if (token === '..' || token.includes('..')) {
                return deny(`.. path escape is blocked: ${token}`)
            }
            return deny(`path escapes the workspace: ${token}`)
        }
    }
    return null
}

function tokenize(command) {
    const out = []
    const re = /"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[;&|]+|[^\s;|&<>()]+/g
    let match
    while ((match = re.exec(command))) {
        let token = match[0]
        if (
            (token.startsWith('"') && token.endsWith('"') && token.length >= 2)
            || (token.startsWith("'") && token.endsWith("'") && token.length >= 2)
        ) {
            token = token.slice(1, -1)
        }
        if (token) out.push(token)
    }
    return out
}

function isSeparator(token) {
    return /^[;&|]+$/.test(token)
}

function looksLikePath(token) {
    if (!token || token.startsWith('-')) return false
    if (/^[a-zA-Z_][a-zA-Z0-9_]*=/.test(token)) return false
    return token.includes('/')
        || token.includes('\\')
        || token === '.'
        || token === '..'
        || token.startsWith('~')
        || token.startsWith('.')
        || /\$\{?[A-Za-z_]/.test(token)
}

function isAllowedDevice(value) {
    const normalized = path.resolve(value)
    if (ALLOWED_DEVICES.has(normalized)) return true
    return normalized.startsWith('/dev/fd/')
}

function isSystemBinary(value) {
    const normalized = path.resolve(value)
    return SYSTEM_BIN_PREFIXES.some(prefix => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix))
}

function isSystemPath(value) {
    const normalized = path.resolve(value)
    return SYSTEM_PATH_PREFIXES.some(prefix => normalized === prefix || normalized.startsWith(`${prefix}/`))
}

function expandHome(token) {
    if (token === '~') return process.env.HOME || token
    if (token.startsWith('~/')) return path.join(process.env.HOME || '', token.slice(2))
    return token
}

/**
 * Expand $VAR / ${VAR} / ~ first, then run the path gate.
 * Undefined environment variables cannot be verified, so they are denied.
 */
function expandPathToken(token) {
    let unset = false
    const withEnv = token.replace(
        /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
        (match, braced, bare) => {
            const value = process.env[braced || bare]
            if (value == null || value === '') {
                unset = true
                return match
            }
            return value
        },
    )
    return { expanded: expandHome(withEnv), unset }
}

function extractHost(arg) {
    try {
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(arg)) {
            return new URL(arg).hostname.replace(/^\[|\]$/g, '')
        }
    } catch {
        return null
    }
    return null
}

function isBareHostname(arg) {
    if (!arg || arg.includes('/') || arg.includes('\\')) return false
    if (/^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(arg)) return true
    if (/^\[?[0-9a-fA-F:]+\]?(?::\d+)?$/.test(arg) && arg.includes(':')) return true
    return /^(?:localhost|[\w-]+(?:\.[\w-]+)+)(?::\d+)?$/i.test(arg)
        && !/\.(?:md|js|ts|json|txt|css|html|png|jpg|sh|yml|yaml|lock|map|cjs|mjs)$/i.test(arg)
}

function stripPort(host) {
    if (host.startsWith('[')) {
        const end = host.indexOf(']')
        return end >= 0 ? host.slice(1, end) : host
    }
    const colon = host.lastIndexOf(':')
    if (colon > 0 && host.indexOf(':') === colon) return host.slice(0, colon)
    return host
}

function isAllowedHost(host, allowHosts) {
    const name = stripPort(String(host ?? '').toLowerCase())
    return allowHosts.has(name)
}
