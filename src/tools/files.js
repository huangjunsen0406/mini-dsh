import fs from 'node:fs/promises'
import path from 'node:path'

export const name = 'mini-tool-files'
export const inject = ['tools', 'sandbox']

export function apply(ctx) {
    const workspace = ctx.sandbox.workspace
    const register = (definition) =>
        ctx.effect(() => ctx.tools.register(definition), `tool: ${definition.name}`)

    register({
        name: 'read_file',
        description:
            'Read a text file inside the workspace. The path must stay inside the workspace.',
        parameters: objectSchema({ path: { type: 'string' } }, ['path']),
        execute: async ({ path: input }) => fs.readFile(ctx.sandbox.resolvePath(input), 'utf8'),
    })

    register({
        name: 'write_file',
        description:
            'Overwrite a text file inside the workspace, creating parent directories. Writes require user approval.',
        parameters: objectSchema({ path: { type: 'string' }, content: { type: 'string' } }, [
            'path',
            'content',
        ]),
        execute: async ({ path: input, content }) => {
            const target = ctx.sandbox.resolvePath(input)
            const rel = path.relative(workspace, target)
            await ctx.sandbox.approve({
                tool: 'write_file',
                kind: 'write',
                summary: `write_file ${rel} (${Buffer.byteLength(content ?? '')} bytes)`,
                path: rel,
            })
            await fs.mkdir(path.dirname(target), { recursive: true })
            await fs.writeFile(target, content, 'utf8')
            return { ok: true, path: rel, bytes: Buffer.byteLength(content) }
        },
    })

    register({
        name: 'edit_file',
        description:
            'Replace one exact string in a text file. oldText must be unique. Edits require user approval.',
        parameters: objectSchema(
            {
                path: { type: 'string' },
                oldText: { type: 'string' },
                newText: { type: 'string' },
            },
            ['path', 'oldText', 'newText'],
        ),
        execute: async ({ path: input, oldText, newText }) => {
            const target = ctx.sandbox.resolvePath(input)
            const rel = path.relative(workspace, target)
            await ctx.sandbox.approve({
                tool: 'edit_file',
                kind: 'write',
                summary: `edit_file ${rel}`,
                path: rel,
            })
            const text = await fs.readFile(target, 'utf8')
            const first = text.indexOf(oldText)
            if (first < 0) throw new Error('oldText not found')
            if (text.indexOf(oldText, first + oldText.length) >= 0)
                throw new Error('oldText is not unique; refusing an ambiguous edit')
            const next = text.slice(0, first) + newText + text.slice(first + oldText.length)
            await fs.writeFile(target, next, 'utf8')
            return { ok: true, path: rel }
        },
    })

    register({
        name: 'glob',
        description:
            'Recursively list workspace files matching a suffix, substring, or glob. Examples: .js, src/, package.json, **/*.md.',
        parameters: objectSchema({ pattern: { type: 'string' }, limit: { type: 'integer' } }, [
            'pattern',
        ]),
        execute: async ({ pattern, limit = 100 }) => {
            const files = await walk(workspace, Math.min(Math.max(limit, 1), 500))
            return files.filter((file) => matchFilePattern(file, pattern)).slice(0, limit)
        },
    })

    register({
        name: 'grep',
        description: 'Search for a string in text files inside the workspace.',
        parameters: objectSchema({ query: { type: 'string' }, limit: { type: 'integer' } }, [
            'query',
        ]),
        execute: async ({ query, limit = 50 }) =>
            grep(workspace, query, Math.min(Math.max(limit, 1), 200)),
    })
}

function objectSchema(properties, required = []) {
    return { type: 'object', additionalProperties: false, properties, required }
}

/**
 * Accepts two pattern styles:
 * - substring: .js, src/, package.json
 * - glob: src/tools/*, **\/*.md, *.js
 */
export function matchFilePattern(file, pattern) {
    const target = String(file).replaceAll('\\', '/')
    const needle = String(pattern ?? '').replaceAll('\\', '/')
    if (!needle) return true
    if (!needle.includes('*') && !needle.includes('?')) return target.includes(needle)

    const re = globToRegExp(needle)
    return re.test(target) || re.test(path.basename(target))
}

function globToRegExp(pattern) {
    let src = '^'
    for (let i = 0; i < pattern.length; i++) {
        const char = pattern[i]
        if (char === '*' && pattern[i + 1] === '*') {
            src += pattern[i + 2] === '/' ? '(?:.*/)?' : '.*'
            i += pattern[i + 2] === '/' ? 2 : 1
            continue
        }
        if (char === '*') {
            src += '[^/]*'
            continue
        }
        if (char === '?') {
            src += '[^/]'
            continue
        }
        src += /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char
    }
    return new RegExp(`${src}$`)
}

async function walk(root, limit) {
    const out = []
    async function visit(dir) {
        if (out.length >= limit) return
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
            if (['node_modules', '.git'].includes(entry.name)) continue
            const full = path.join(dir, entry.name)
            const rel = path.relative(root, full)
            if (entry.isDirectory()) await visit(full)
            else out.push(rel)
            if (out.length >= limit) break
        }
    }
    await visit(root)
    return out
}

async function grep(root, query, limit) {
    const files = await walk(root, 1000)
    const matches = []
    for (const rel of files) {
        if (matches.length >= limit) break
        try {
            const text = await fs.readFile(path.join(root, rel), 'utf8')
            const lines = text.split(/\r?\n/)
            lines.forEach((line, index) => {
                if (matches.length < limit && line.includes(query)) {
                    matches.push({ path: rel, line: index + 1, text: line.slice(0, 300) })
                }
            })
        } catch {
            // Skip binary files and permission errors.
        }
    }
    return matches
}
