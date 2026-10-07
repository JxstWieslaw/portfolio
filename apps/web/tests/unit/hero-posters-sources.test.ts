// @vitest-environment node
/**
 * The poster inputs hash is only as good as its list. Every module the hero engine and layer import from `lib/hero` and
 * `components/three/hero` (transitively) must be in SOURCE_FILES, so a change to one cannot leave stale posters.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { posterInputsHash, SOURCE_FILES } from '../../scripts/posters/spec'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ROOTS = ['components/three/hero/HeroLayer.tsx', 'components/three/hero/HeroEngine.ts']
const SCOPE = /^(lib\/hero|components\/three\/hero)\//

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? spec.slice(2) : spec.startsWith('.') ? path.posix.join(path.posix.dirname(from), spec) : null
  if (base === null) return null
  for (const ext of ['.ts', '.tsx', '']) if (existsSync(path.join(webRoot, base + ext)) && /\.(ts|tsx)$/.test(base + ext)) return base + ext
  return null
}

function closure(): Set<string> {
  const seen = new Set<string>()
  const queue = [...ROOTS]
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (seen.has(file)) continue
    seen.add(file)
    const text = readFileSync(path.join(webRoot, file), 'utf8')
    for (const m of text.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/g)) {
      const next = resolveImport(file, m[1] as string)
      if (next && SCOPE.test(next)) queue.push(next)
    }
  }
  return seen
}

describe('the poster inputs list', () => {
  it('names every module the hero engine and layer import from lib/hero and components/three/hero', () => {
    const listed = new Set<string>(SOURCE_FILES)
    const missing = [...closure()].filter((f) => !listed.has(f))
    expect(missing, `add these to SOURCE_FILES in scripts/posters/spec.ts: ${missing.join(', ')}`).toEqual([])
  })

  it('names only files that exist, and says which one when it cannot read a file', () => {
    for (const f of SOURCE_FILES) expect(existsSync(path.join(webRoot, f)), f).toBe(true)
    expect(() => posterInputsHash(path.join(webRoot, 'does-not-exist'))).toThrow(/SOURCE_FILES/)
  })
})
