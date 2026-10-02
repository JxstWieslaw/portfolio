// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { main as ingestMain, runIngest } from '../../scripts/assets/ingest'
import { IngestRejected } from '../../scripts/assets/pipeline'
import { defaultRoot, layoutFor } from '../../scripts/assets/sources'

let tmp: string
beforeAll(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'ingest-ops-'))
})
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const gyro = (): Record<string, unknown> => {
  const [first] = JSON.parse(readFileSync(layoutFor(defaultRoot()).sourcesFile, 'utf8')) as Record<string, unknown>[]
  if (!first) throw new Error('committed sources.json is empty')
  return first
}

const rootWith = (name: string, sources: unknown[]) => {
  const root = path.join(tmp, name)
  mkdirSync(path.join(root, 'content', 'models'), { recursive: true })
  writeFileSync(layoutFor(root).sourcesFile, JSON.stringify(sources))
  return root
}
const twoSources = (name: string) => rootWith(name, [gyro(), { ...gyro(), id: 'gyro-two', title: 'Gyro two' }])

describe('ingest: partial runs, verify, writes', () => {
  it('refuses a partial run when an unselected source has no manifest entry, and names it', async () => {
    const root = twoSources('partial')
    const error = await runIngest({ root, id: 'gyroscope' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IngestRejected)
    expect((error as IngestRejected).subject).toBe('partial ingest')
    expect((error as IngestRejected).violations.map((x) => x.subject)).toEqual(['gyro-two'])
    expect(existsSync(layoutFor(root).manifestFile)).toBe(false)
  }, 60_000)

  it('after a full run, a partial run keeps the other entries and deletes only its own stale files', async () => {
    const root = twoSources('keeps')
    const l = layoutFor(root)
    await runIngest({ root })
    const ids = () => (JSON.parse(readFileSync(l.manifestFile, 'utf8')) as { models: { id: string }[] }).models.map((m) => m.id)
    expect(ids()).toEqual(['gyro-two', 'gyroscope'])

    writeFileSync(path.join(l.modelsDir, 'gyroscope.t2.00000000.glb'), 'stale') // selected id, unreferenced
    writeFileSync(path.join(l.modelsDir, 'unrelated.t1.deadbeef.glb'), 'keep') // not a selected id
    await runIngest({ root, id: 'gyroscope' })

    expect(existsSync(path.join(l.modelsDir, 'gyroscope.t2.00000000.glb'))).toBe(false)
    expect(readFileSync(path.join(l.modelsDir, 'unrelated.t1.deadbeef.glb'), 'utf8')).toBe('keep')
    expect(ids()).toEqual(['gyro-two', 'gyroscope'])
    expect(readdirSync(l.modelsDir).filter((f) => f.startsWith('gyro-two')).length).toBe(2)
  }, 120_000)

  it('leaves no temporary files behind, and the manifest and credits are complete JSON', async () => {
    const root = twoSources('atomic')
    const l = layoutFor(root)
    await runIngest({ root })
    expect(readdirSync(l.modelsDir).filter((f) => f.endsWith('.tmp'))).toEqual([])
    expect(readdirSync(path.dirname(l.creditsFile)).filter((f) => f.endsWith('.tmp'))).toEqual([])
    expect(() => JSON.parse(readFileSync(l.manifestFile, 'utf8'))).not.toThrow()
    expect(JSON.parse(readFileSync(l.creditsFile, 'utf8'))).toEqual([])
  }, 120_000)

  it('--verify with nothing selected throws instead of passing vacuously', async () => {
    const fileSource = {
      ...gyro(),
      id: 'raw-one',
      licenceId: 'CC0-1.0',
      origin: { type: 'file', path: 'assets-src/raw-one/m.glb', url: 'https://kenney.nl/x', sha256: 'a'.repeat(64) },
    }
    const root = rootWith('vacuous', [fileSource])
    await expect(runIngest({ root, only: 'generated', verify: true })).rejects.toThrow(/compared nothing/)
  })

  it('verify reports which sources it checked and which it skipped', async () => {
    const root = twoSources('report')
    await runIngest({ root })
    const result = await runIngest({ root, id: 'gyroscope', verify: true })
    expect(result.verified).toEqual(['gyroscope'])
    expect(result.skipped).toEqual(['gyro-two'])
    expect(result.mismatches).toEqual([])
  }, 120_000)

  it('names the manifest file when it is not valid JSON, and tolerates a BOM', async () => {
    const root = twoSources('badjson')
    const l = layoutFor(root)
    mkdirSync(l.modelsDir, { recursive: true })
    writeFileSync(l.manifestFile, '{broken')
    await expect(runIngest({ root, dryRun: true })).rejects.toThrow(/manifest\.json is not valid JSON/)
    rmSync(l.manifestFile)
    await runIngest({ root })
    writeFileSync(l.manifestFile, `\uFEFF${readFileSync(l.manifestFile, 'utf8')}`)
    await expect(runIngest({ root, dryRun: true })).resolves.toBeDefined()
  }, 120_000)

  it('main() returns 0 when the committed tree verifies, 1 on a mismatch, 2 on a bad value, 1 on a bad flag', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      expect(await ingestMain(['--only', 'generated', '--verify'], defaultRoot())).toBe(0)
      expect(log.mock.calls.flat().join('\n')).toMatch(/verify: 1 source\(s\) checked \(gyroscope\); skipped: none/)
      const root = rootWith('main-empty', [gyro()])
      expect(await ingestMain(['--only', 'generated', '--verify'], root)).toBe(1)
      expect(await ingestMain(['--only', 'everything'], root)).toBe(2)
      expect(await ingestMain(['--bogus-flag'], root)).toBe(1)
    } finally {
      log.mockRestore()
      err.mockRestore()
    }
  }, 120_000)
})
