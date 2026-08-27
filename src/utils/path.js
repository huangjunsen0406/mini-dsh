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
 * Constrain a user path to the workspace.
 *
 * This is the application-level path gate: every file read/write/create
 * goes through here so `../` and absolute paths cannot escape.
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
    return target
}
