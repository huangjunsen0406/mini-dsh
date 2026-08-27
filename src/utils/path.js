import fs from 'node:fs'
import path from 'node:path'

/**
 * Whether target resolves inside workspace.
 *
 * Resolve first, then use path.relative. A startsWith('..') check would
 * reject a file named `..hidden` inside the workspace.
 */
export function isInside(workspace, target) {
    const root = path.resolve(workspace)
    const resolved = path.resolve(target)
    const relative = path.relative(root, resolved)
    return (
        relative === '' ||
        (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
    )
}

/**
 * The path with every symlink in it resolved — including for a target that
 * does not exist yet, which is the normal case for a write or a create:
 * resolve the longest existing prefix, then re-attach the missing segments.
 */
function resolveLinks(target) {
    let current = path.resolve(target)
    const pending = []

    while (true) {
        try {
            return path.join(fs.realpathSync(current), ...pending)
        } catch {
            const parent = path.dirname(current)
            // Walked all the way up without finding anything readable.
            if (parent === current) return path.resolve(target)
            pending.unshift(path.basename(current))
            current = parent
        }
    }
}

/**
 * Constrain a user path to the workspace.
 *
 * This is the application-level path gate: every file read/write/create goes
 * through here so `../`, absolute paths, and symlinks cannot escape.
 *
 * Containment is checked twice and both checks earn their place. The lexical
 * one catches `../` and absolute paths. The symlink one catches a link that
 * lives inside the workspace but points out of it — `path.resolve` never asks
 * the filesystem what a path really is, so on its own it would hand back
 * `workspace/link/passwd` for a link pointing at /etc.
 *
 * What comes back is the lexical path, not the resolved one: errors and tool
 * output should speak in the paths the user actually typed, and the resolved
 * form would turn every /tmp path into /private/tmp on macOS.
 */
export function resolveInside(workspace, requested = '.') {
    if (typeof requested !== 'string') {
        throw new Error('path must be a string')
    }
    if (requested.includes('\0')) {
        throw new Error(
            `invalid path, workspace=${path.resolve(workspace)}, requested=${requested}`,
        )
    }

    const root = path.resolve(workspace)
    const target = path.resolve(root, requested)
    if (!isInside(root, target)) {
        throw new Error(`path escapes the workspace, workspace=${root}, requested=${requested}`)
    }
    if (!isInside(resolveLinks(root), resolveLinks(target))) {
        throw new Error(
            `path escapes the workspace through a symlink, workspace=${root}, requested=${requested}`,
        )
    }
    return target
}
