import fs from 'node:fs/promises'
import path from 'node:path'
import { parseSkillMarkdown } from './skill-runtime.js'

const PROJECT_DSH_RANK = 100
const PROJECT_AGENTS_RANK = 200
const CUSTOM_RANK = 300

/**
 * Local filesystem skill provider.
 *
 * Scans project `.dsh/skills` and `.agents/skills` (plus optional extra
 * dirs). Accepts `<name>/SKILL.md` bundles and flat `<name>.md` files.
 * Nested recursive discovery is not supported. Invalid files are skipped.
 */
export class FileSystemSkillProvider {
    constructor({ workspace, extraDirs = [] } = {}) {
        this.workspace = path.resolve(workspace ?? process.cwd())
        this.extraDirs = extraDirs.map((dir) => path.resolve(dir))
        this.name = 'filesystem'
    }

    async list() {
        const candidates = []
        for (const root of await this.roots()) {
            candidates.push(...(await discoverRoot(root, this.name)))
        }
        return candidates
    }

    async get(candidate) {
        const locator = candidate?.locator
        if (!locator?.path) return undefined
        const parsed = await parseSkillFile(locator.path)
        if (!parsed) return undefined
        return {
            ...parsed,
            source: candidate.source,
            provider: this.name,
            resourceBase: { kind: 'directory', path: locator.directory },
            path: locator.path,
        }
    }

    async roots() {
        const projectRoot = await findProjectRoot(this.workspace)
        return [
            {
                path: path.join(projectRoot, '.dsh/skills'),
                source: 'project-dsh',
                rank: PROJECT_DSH_RANK,
            },
            {
                path: path.join(projectRoot, '.agents/skills'),
                source: 'project-agents',
                rank: PROJECT_AGENTS_RANK,
            },
            ...this.extraDirs.map((dir) => ({ path: dir, source: 'custom', rank: CUSTOM_RANK })),
        ]
    }
}

export async function findProjectRoot(cwd) {
    let current = path.resolve(cwd)
    while (true) {
        try {
            await fs.access(path.join(current, '.git'))
            return current
        } catch {
            const parent = path.dirname(current)
            if (parent === current) return path.resolve(cwd)
            current = parent
        }
    }
}

async function discoverRoot(root, provider) {
    const entries = await listRootEntries(root.path)
    const skills = []
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const locator =
            entry.type === 'directory'
                ? { path: path.join(entry.path, 'SKILL.md'), directory: entry.path }
                : entry.type === 'file' && entry.name.endsWith('.md')
                  ? { path: entry.path, directory: root.path }
                  : undefined
        if (!locator) continue
        const parsed = await parseSkillFile(locator.path)
        if (!parsed) continue
        skills.push({
            ...parsed,
            provider,
            source: root.source,
            rank: root.rank,
            locator,
            resourceBase: { kind: 'directory', path: locator.directory },
            path: locator.path,
        })
    }
    return skills
}

async function listRootEntries(dir) {
    let entries
    try {
        entries = await fs.readdir(dir, { withFileTypes: true })
    } catch (error) {
        if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return []
        throw error
    }

    return entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
        path: path.join(dir, entry.name),
    }))
}

async function parseSkillFile(filePath) {
    let raw
    try {
        raw = await fs.readFile(filePath, 'utf8')
    } catch (error) {
        if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return undefined
        throw error
    }
    try {
        return parseSkillMarkdown(raw)
    } catch {
        return undefined
    }
}
