const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const RUNTIME_RANK = 250
const LEGACY_INVOCATION_KEYS = {
    disableModelInvocation: 'disable-model-invocation',
    modelInvocable: 'disable-model-invocation',
    userInvocable: 'user-invocable',
}

export function isSkillName(name) {
    return typeof name === 'string' && SKILL_NAME.test(name)
}

export function isModelInvocable(skill) {
    return skill?.invocation?.modelInvocable === true
}

export function isUserInvocable(skill) {
    return skill?.invocation?.userInvocable === true
}

/**
 * In-memory skill registry.
 *
 * Providers contribute candidates; runtime register() is a first-wins
 * in-process source. Duplicate names keep the lower rank. list() returns
 * summaries; get() asks the winning provider so file-backed bodies are
 * reread rather than cached.
 */
export class SkillRuntime {
    #providers = new Map()
    #runtime = new Map()

    registerProvider(provider) {
        if (!provider?.name) throw new Error('provider.name is required')
        if (typeof provider.list !== 'function' || typeof provider.get !== 'function') {
            throw new Error(`provider is missing list()/get(): ${provider.name}`)
        }
        if (this.#providers.has(provider.name)) {
            throw new Error(`duplicate skill provider: ${provider.name}`)
        }

        this.#providers.set(provider.name, provider)
        let disposed = false
        return () => {
            if (disposed) return
            disposed = true
            if (this.#providers.get(provider.name) === provider) {
                this.#providers.delete(provider.name)
            }
        }
    }

    register(skill) {
        const definition = normalizeRuntimeSkill(skill)
        if (this.#runtime.has(definition.name)) {
            throw new Error(`duplicate skill: ${definition.name}`)
        }

        this.#runtime.set(definition.name, definition)
        let disposed = false
        return () => {
            if (disposed) return
            disposed = true
            if (this.#runtime.get(definition.name) === definition) {
                this.#runtime.delete(definition.name)
            }
        }
    }

    async list() {
        const winners = await this.#collect()
        return [...winners.values()]
            .map((winner) => toSummary(winner.candidate))
            .sort((a, b) => a.name.localeCompare(b.name))
    }

    async snapshot() {
        const skills = await this.list()
        return { skills, complete: true }
    }

    async get(name) {
        if (!isSkillName(name)) return undefined
        const winners = await this.#collect()
        const winner = winners.get(name)
        if (!winner) return undefined

        if (winner.provider === null) {
            return winner.candidate
        }

        const loaded = await winner.provider.get(winner.candidate)
        if (!loaded) return undefined
        if (loaded.name !== name) return undefined
        return loaded
    }

    async #collect() {
        const winners = new Map()
        let providerOrder = 0

        for (const skill of this.#runtime.values()) {
            consider(winners, skill, null, providerOrder)
        }
        providerOrder += 1

        for (const provider of this.#providers.values()) {
            const observation = await provider.list()
            const candidates = Array.isArray(observation)
                ? observation
                : (observation?.candidates ?? [])
            for (const candidate of candidates) {
                if (!isSkillName(candidate?.name)) continue
                consider(winners, candidate, provider, providerOrder)
            }
            providerOrder += 1
        }

        return winners
    }
}

function consider(winners, candidate, provider, providerOrder) {
    const rank = Number.isFinite(candidate.rank) ? candidate.rank : RUNTIME_RANK
    const existing = winners.get(candidate.name)
    if (
        existing &&
        (existing.rank < rank ||
            (existing.rank === rank && existing.providerOrder <= providerOrder))
    ) {
        return
    }
    winners.set(candidate.name, { candidate, provider, rank, providerOrder })
}

function toSummary(candidate) {
    return {
        name: candidate.name,
        description: candidate.description,
        ...(candidate.whenToUse ? { whenToUse: candidate.whenToUse } : {}),
        invocation: candidate.invocation,
        source: candidate.source,
        provider: candidate.provider,
        ...(candidate.resourceBase ? { resourceBase: candidate.resourceBase } : {}),
        ...(candidate.path ? { path: candidate.path } : {}),
    }
}

function normalizeRuntimeSkill(skill) {
    if (!isSkillName(skill?.name)) throw new Error('skill.name must be kebab-case')
    if (typeof skill.description !== 'string' || !skill.description.trim()) {
        throw new Error('skill.description is required')
    }
    if (typeof skill.content !== 'string') throw new Error('skill.content is required')

    return {
        name: skill.name,
        description: skill.description.trim(),
        ...(skill.whenToUse ? { whenToUse: skill.whenToUse } : {}),
        invocation: {
            modelInvocable: skill.invocation?.modelInvocable !== false,
            userInvocable: skill.invocation?.userInvocable !== false,
        },
        source: skill.source ?? 'runtime',
        provider: skill.provider ?? 'runtime',
        rank: RUNTIME_RANK,
        content: skill.content,
        ...(skill.resourceBase ? { resourceBase: skill.resourceBase } : {}),
        ...(skill.path ? { path: skill.path } : {}),
    }
}

export function parseSkillMarkdown(raw) {
    let parsed
    try {
        parsed = parseFrontmatter(raw)
    } catch (error) {
        throw new Error(`invalid YAML frontmatter: ${error.message}`)
    }
    if (!parsed) throw new Error('missing YAML frontmatter')

    const name = stringField(parsed.data, 'name')
    const description = stringField(parsed.data, 'description')
    if (!name || !description) throw new Error('frontmatter requires name and description')
    if (!isSkillName(name)) throw new Error(`invalid skill name "${name}"`)

    return {
        name,
        description,
        ...optionalString(parsed.data, 'whenToUse'),
        invocation: parseInvocationPolicy(parsed.data),
        content: parsed.body.trim(),
    }
}

export function parseFrontmatter(raw) {
    const text = String(raw ?? '').replace(/^﻿/, '')
    const firstLineEnd = text.indexOf('\n')
    if (firstLineEnd < 0) return undefined
    const firstLine = text.slice(0, firstLineEnd).replace(/\r$/, '')
    if (firstLine !== '---') return undefined

    const start = firstLineEnd + 1
    const closing = findClosingFrontmatter(text, start)
    if (!closing) return undefined

    const data = parseSimpleYaml(text.slice(start, closing.start))
    if (!data) return undefined
    return { data, body: text.slice(closing.bodyStart) }
}

function findClosingFrontmatter(raw, start) {
    let lineStart = start
    while (lineStart <= raw.length) {
        const nextNewline = raw.indexOf('\n', lineStart)
        const lineEnd = nextNewline < 0 ? raw.length : nextNewline
        const line = raw.slice(lineStart, lineEnd).replace(/\r$/, '')
        if (line === '---') {
            return { start: lineStart, bodyStart: nextNewline < 0 ? raw.length : nextNewline + 1 }
        }
        if (nextNewline < 0) return undefined
        lineStart = nextNewline + 1
    }
}

function parseSimpleYaml(yaml) {
    const data = {}
    for (const rawLine of yaml.split(/\r?\n/)) {
        const line = rawLine.replace(/\s+$/, '')
        if (!line || line.startsWith('#')) continue
        const colon = line.indexOf(':')
        if (colon <= 0) return undefined
        const key = line.slice(0, colon).trim()
        if (!key) return undefined
        data[key] = parseYamlScalar(line.slice(colon + 1).trim())
    }
    return data
}

function parseYamlScalar(value) {
    if (value === '') return ''
    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
    ) {
        return value.slice(1, -1)
    }
    const lower = value.toLowerCase()
    if (lower === 'true' || lower === 'yes' || value === '1') return true
    if (lower === 'false' || lower === 'no' || value === '0') return false
    return value
}

function stringField(data, key) {
    const value = data[key]
    return typeof value === 'string' && value.length > 0 ? value : undefined
}

function optionalString(data, key) {
    const value = stringField(data, key)
    return value ? { [key]: value } : {}
}

function parseInvocationPolicy(data) {
    for (const [legacy, canonical] of Object.entries(LEGACY_INVOCATION_KEYS)) {
        if (Object.hasOwn(data, legacy)) {
            throw new Error(`frontmatter field "${legacy}" is unsupported; use "${canonical}"`)
        }
    }
    return {
        modelInvocable: data['disable-model-invocation'] !== true,
        userInvocable: data['user-invocable'] !== false,
    }
}
