// @vitest-environment node
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  FetchHashMismatch,
  FetchRefused,
  ZipRefused,
  fetchChecked,
  fetchSource,
  readZipEntries,
  type ZipRefusal,
} from '../../scripts/assets/fetch'
import { layoutFor, sourceEntrySchema } from '../../scripts/assets/sources'
import { sha256Hex } from '../../scripts/assets/validators'

import { makeZip } from './assets-fixtures'

const reasonOf = (fn: () => unknown): ZipRefusal | 'did not throw' => {
  try {
    fn()
  } catch (error) {
    return error instanceof ZipRefused ? error.reason : (`other: ${String(error)}` as ZipRefusal)
  }
  return 'did not throw'
}

describe('zip entry names: what Windows would misread is refused up front', () => {
  it.each([
    ['a colon (alternate data stream)', 'model.glb:stream'],
    ['a star', 'mod*el.glb'],
    ['a question mark', 'model?.glb'],
    ['a double quote', 'mo"del.glb'],
    ['angle brackets', 'a<b>.glb'],
    ['a pipe', 'a|b.glb'],
    ['a component ending in a dot', 'pack./model.glb'],
    ['a component ending in a space', 'pack /model.glb'],
    ['a file ending in a dot', 'model.glb.'],
    ['the reserved name CON', 'CON'],
    ['a reserved name with an extension', 'pack/nul.glb'],
    ['a lowercase reserved name', 'pack/aux.txt'],
    ['COM1 with an extension', 'com1.glb'],
    ['LPT9', 'LPT9'],
  ])('refuses %s', (_label, name) => {
    expect(reasonOf(() => readZipEntries(makeZip([{ name, data: 'x' }])))).toBe('unsafe-name')
  })

  it('does not mistake look-alike names for reserved ones', () => {
    for (const name of ['pack/console.glb', 'pack/com10.glb', 'pack/auxiliary.glb', 'pack/nullable.glb'])
      expect(reasonOf(() => readZipEntries(makeZip([{ name, data: 'x' }])))).toBe('did not throw')
  })

  it('treats names that differ only by case, or by Unicode form, as the same file', () => {
    expect(reasonOf(() => readZipEntries(makeZip([{ name: 'a/Model.glb', data: 'x' }, { name: 'a/model.GLB', data: 'y' }])))).toBe('duplicate')
    const nfc = 'é.glb'
    const nfd = 'é.glb'
    expect(reasonOf(() => readZipEntries(makeZip([{ name: nfc, data: 'x' }, { name: nfd, data: 'y' }])))).toBe('duplicate')
  })

  it('gives every refusal a typed reason', () => {
    expect(reasonOf(() => readZipEntries(makeZip([{ name: '../x.glb', data: 'x' }])))).toBe('unsafe-name')
    expect(reasonOf(() => readZipEntries(makeZip([{ name: 'l.glb', data: 'x', mode: 0o120777 }])))).toBe('symlink')
    expect(reasonOf(() => readZipEntries(makeZip([{ name: 'e.glb', data: 'x', flags: 1 }])))).toBe('encrypted')
    expect(reasonOf(() => readZipEntries(makeZip([{ name: 'c.glb', data: 'abc', crc: 1 }])))).toBe('crc')
    expect(reasonOf(() => readZipEntries(makeZip([{ name: 'b.glb', data: Buffer.alloc(9_000), method: 8, usize: 10 }])))).toBe('too-large')
    expect(reasonOf(() => readZipEntries(makeZip([{ name: 'a.glb', data: Buffer.alloc(600) }]), 100))).toBe('too-large')
    expect(reasonOf(() => readZipEntries(new TextEncoder().encode('<html>nope</html>')))).toBe('not-zip')
  })
})

describe('fetchChecked: only a 200 with a body is a download', () => {
  const answer = (status: number, body: string | null) => () => Promise.resolve(new Response(body, { status }))
  it.each([201, 204, 206, 203])('refuses status %i', async (status) => {
    await expect(fetchChecked('https://kenney.nl/x', { fetch: answer(status, status === 204 ? null : 'data') })).rejects.toMatchObject({
      reason: 'bad-status',
    })
  })
  it('refuses an empty body with a clear message', async () => {
    const error = await fetchChecked('https://kenney.nl/x', { fetch: answer(200, '') }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(FetchRefused)
    expect((error as FetchRefused).reason).toBe('empty-body')
    expect((error as FetchRefused).message).toBe('the server sent an empty body')
  })
})

describe('fetchSource: pins are checked in a fixed order, and a failure writes nothing', () => {
  let tmp: string
  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'fetchh-'))
  })
  afterEach(() => rmSync(tmp, { recursive: true, force: true }))

  const entry = (origin: Record<string, unknown>) =>
    sourceEntrySchema.parse({
      id: 'core-crystal',
      title: 'Core crystal',
      kind: 'hero',
      enabled: false,
      licenceId: 'CC0-1.0',
      licenceEvidence: { url: 'https://kenney.nl/support', retrievedAt: '2026-10-02' },
      credit: { author: 'Kenney', sourceUrl: 'https://kenney.nl/assets/x', retrievedAt: '2026-10-02' },
      origin: { type: 'file', url: 'https://kenney.nl/kit.zip', ...origin },
    })
  const serve = (bytes: Uint8Array) => ({ fetch: () => Promise.resolve(new Response(bytes as BodyInit, { status: 200 })) })
  const nothingWritten = () => expect(existsSync(path.join(tmp, 'assets-src'))).toBe(false)

  it('checks the archive hash FIRST: a hostile zip with a wrong pin fails on the hash, before any parsing', async () => {
    const hostile = makeZip([{ name: '../../outside.glb', data: 'x' }])
    const source = entry({ path: 'assets-src/core-crystal/kit/m.glb', sha256: 'c'.repeat(64), archiveSha256: 'd'.repeat(64) })
    const error = await fetchSource(source, layoutFor(tmp), serve(hostile)).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(FetchHashMismatch)
    expect(error).not.toBeInstanceOf(ZipRefused)
    nothingWritten()
  })

  it('refuses a member whose sha256 differs from the pin, and writes nothing', async () => {
    const zip = makeZip([{ name: 'kit/m.glb', data: 'real bytes' }, { name: 'kit/LICENSE.txt', data: 'CC0' }])
    const source = entry({ path: 'assets-src/core-crystal/kit/m.glb', sha256: 'e'.repeat(64), archiveSha256: sha256Hex(zip) })
    await expect(fetchSource(source, layoutFor(tmp), serve(zip))).rejects.toBeInstanceOf(FetchHashMismatch)
    nothingWritten()
  })

  it('refuses a download that is not a zip when an archive hash is pinned', async () => {
    const source = entry({ path: 'assets-src/core-crystal/m.glb', sha256: 'f'.repeat(64), archiveSha256: 'a'.repeat(64) })
    await expect(fetchSource(source, layoutFor(tmp), serve(new TextEncoder().encode('plain glb bytes')))).rejects.toThrow(
      /pins archiveSha256 but the download is not a zip/,
    )
    nothingWritten()
  })

  it('refuses a member path that is not in the archive', async () => {
    const zip = makeZip([{ name: 'kit/other.glb', data: 'x' }])
    const source = entry({ path: 'assets-src/core-crystal/kit/m.glb', sha256: 'f'.repeat(64), archiveSha256: sha256Hex(zip) })
    await expect(fetchSource(source, layoutFor(tmp), serve(zip))).rejects.toThrow(/kit\/m\.glb is not in the download/)
    nothingWritten()
  })

  it('extracts a Kenney-style path with spaces inside segments', async () => {
    const glb = 'crate bytes'
    const zip = makeZip([{ name: 'Models/GLB format/crate large.glb', data: glb }, { name: 'License.txt', data: 'CC0' }])
    const source = entry({
      path: 'assets-src/core-crystal/Models/GLB format/crate large.glb',
      sha256: sha256Hex(new TextEncoder().encode(glb)),
      archiveSha256: sha256Hex(zip),
    })
    const written = await fetchSource(source, layoutFor(tmp), serve(zip))
    expect(written.sort()).toEqual(['License.txt', 'Models/GLB format/crate large.glb'])
    expect(existsSync(path.join(tmp, 'assets-src', 'core-crystal', 'Models', 'GLB format', 'crate large.glb'))).toBe(true)
  })
})
