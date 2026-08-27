import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const roots = ['src', 'test', 'scripts']
const files = []
for (const root of roots) walk(path.resolve(root))

for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    if (result.status !== 0) {
        process.stderr.write(result.stderr)
        process.exit(result.status ?? 1)
    }
}
console.log(`syntax ok: ${files.length} files`)

function walk(dir) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name.endsWith('.js')) files.push(full)
    }
}
