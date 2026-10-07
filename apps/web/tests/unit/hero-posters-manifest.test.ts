// @vitest-environment node
/**
 * `npm run posters:check`, as a test: the committed posters are the render of the committed hero, with the hashes,
 * pixel sizes and byte budgets the spec gives. A change to the shader, the engine, the framing or an encoder setting
 * without a re-render fails here with the instruction to re-render.
 */
import { appendFileSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import { checkPosters, readManifest } from '../../scripts/posters/check'
import { BUDGET_BYTES, budgetFor, canonicalJson, ORIENTATIONS, posterInputsHash, SOURCE_FILES, STATES, sha256Text } from '../../scripts/posters/spec'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const tmp = mkdtempSync(path.join(tmpdir(), 'posters-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

/** A copy of everything the check reads, to be broken on purpose. */
function copyRoot(name: string): string {
  const root = path.join(tmp, name)
  mkdirSync(path.join(root, 'public'), { recursive: true })
  cpSync(path.join(webRoot, 'public', 'posters'), path.join(root, 'public', 'posters'), { recursive: true })
  cpSync(path.join(webRoot, 'public', 'og'), path.join(root, 'public', 'og'), { recursive: true })
  copyFileSync(path.join(webRoot, 'package.json'), path.join(root, 'package.json'))
  for (const f of SOURCE_FILES) {
    mkdirSync(path.dirname(path.join(root, f)), { recursive: true })
    copyFileSync(path.join(webRoot, f), path.join(root, f))
  }
  return root
}

describe('the committed hero posters', () => {
  it('pass the check: inputs hash, hashes, formats, pixel sizes and budgets', { timeout: 30_000 }, async () => {
    expect(await checkPosters(webRoot)).toEqual([])
  })

  it('cover every state in both orientations in both formats, and an OG image', () => {
    const manifest = readManifest(webRoot)
    expect(manifest).not.toBeNull()
    expect(manifest?.posters).toHaveLength(STATES.length * ORIENTATIONS.length)
    expect(manifest?.og).toMatchObject({ width: 1200, height: 630 })
  })

  it('stay within the spec budgets', () => {
    const manifest = readManifest(webRoot)
    for (const p of manifest?.posters ?? []) {
      for (const format of ['avif', 'webp'] as const) expect(p[format].bytes, `${p.state}/${p.orientation} ${format}`).toBeLessThanOrEqual(budgetFor(p.state, p.orientation, format))
    }
    expect(manifest?.og.bytes ?? Infinity).toBeLessThanOrEqual(BUDGET_BYTES.og)
  })
})

describe('the check notices what it must', { timeout: 30_000 }, () => {
  it('a changed hero source file means the posters are stale', async () => {
    const root = copyRoot('stale')
    appendFileSync(path.join(root, 'components/three/hero/hero.glsl.ts'), '\n// changed\n')
    expect((await checkPosters(root)).join('\n')).toMatch(/posters:render/)
  })

  it('line endings do not change the hash, so a Windows checkout and a Linux one agree', () => {
    expect(sha256Text('a\r\nb\r\n')).toBe(sha256Text('a\nb\n'))
    const root = copyRoot('crlf')
    const target = path.join(root, 'lib/hero/geometry.ts')
    writeFileSync(target, readFileSync(target, 'utf8').replace(/\r\n/g, '\n'))
    const lf = posterInputsHash(root)
    writeFileSync(target, readFileSync(target, 'utf8').replace(/\n/g, '\r\n'))
    expect(posterInputsHash(root)).toBe(lf)
  })

  it('a poster file whose bytes changed fails its recorded hash', async () => {
    const root = copyRoot('tampered')
    const manifest = readManifest(root)
    appendFileSync(path.join(root, 'public/posters', manifest?.posters[0]?.webp.file ?? ''), 'x')
    expect((await checkPosters(root)).join('\n')).toMatch(/sha256|bytes/)
  })

  it('a stray file in public/posters is named, so a stale render cannot linger', async () => {
    const root = copyRoot('stray')
    writeFileSync(path.join(root, 'public/posters/hero-portrait-full.deadbeef.webp'), 'old')
    expect((await checkPosters(root)).join('\n')).toContain('is not in the manifest')
  })

  it('a missing manifest says how to make one', async () => {
    const root = path.join(tmp, 'empty')
    mkdirSync(root, { recursive: true })
    expect(await checkPosters(root)).toEqual(['public/posters/manifest.json is missing: run npm run posters:render'])
  })

  it('the hash does not depend on key order', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }))
  })
})
