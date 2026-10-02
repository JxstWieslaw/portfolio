// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_LIMITS,
  FetchHashMismatch,
  FetchRefused,
  ZipRefused,
  checkUrl,
  fetchChecked,
  fetchSource,
  readZipEntries,
  writeEntries,
  type FetchLimits,
  type UrlDenyReason,
} from '../../scripts/assets/fetch'
import { layoutFor, sourceEntrySchema } from '../../scripts/assets/sources'
import { sha256Hex } from '../../scripts/assets/validators'

// No test in this file may touch the network: every fetch is injected.
const neverCalled = vi.fn<typeof fetch>(() => Promise.reject(new Error('the network must not be used')))

describe('checkUrl: allowed and denied', () => {
  const allowed = [
    'https://polyhaven.com/a/rock',
    'https://dl.polyhaven.org/file/ph-assets/Models/gltf/rock.glb',
    'https://kenney.nl/media/pages/assets/prototype-kit/x/kenney_prototype-kit.zip',
    'https://quaternius.com/packs/x.html',
    'HTTPS://POLYHAVEN.COM/UPPER',
    'https://github.com/KhronosGroup/glTF-Sample-Assets/raw/main/Models/Box/glTF-Binary/Box.glb',
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Box/glTF-Binary/Box.glb',
    'https://codeload.github.com/khronosgroup/gltf-sample-assets/zip/refs/heads/main',
  ]
  it.each(allowed)('allows %s', (url) => {
    expect(checkUrl(url).ok).toBe(true)
  })

  const denied: [string, UrlDenyReason][] = [
    ['http://polyhaven.com/a/rock', 'not-https'],
    ['ftp://polyhaven.com/x', 'not-https'],
    ['javascript:alert(1)', 'not-https'],
    ['data:text/plain,hi', 'not-https'],
    ['//polyhaven.com/x', 'invalid-url'],
    ['not a url', 'invalid-url'],
    ['https://polyhaven.com@evil.example/x', 'userinfo'],
    ['https://user:pass@polyhaven.com/x', 'userinfo'],
    ['https://polyhaven.com:8443/x', 'port'],
    ['https://polyhaven.com.evil.example/x', 'host-not-allowed'],
    ['https://evil.example/polyhaven.com', 'host-not-allowed'],
    ['https://polyhaven.com./x', 'host-not-allowed'],
    ['https://www.polyhaven.com/x', 'host-not-allowed'],
    ['https://sub.kenney.nl/x', 'host-not-allowed'],
    ['https://xn--polyhaven-9ze.com/x', 'host-not-allowed'],
    ['https://p\u043elyhaven.com/x', 'host-not-allowed'], // Cyrillic "o" folds to a punycode host
    ['https://127.0.0.1/x', 'ip-literal'],
    ['https://0x7f.1/x', 'ip-literal'],
    ['https://2130706433/x', 'ip-literal'],
    ['https://169.254.169.254/latest/meta-data', 'ip-literal'],
    ['https://[::1]/x', 'ip-literal'],
    ['https://[::ffff:7f00:1]/x', 'ip-literal'],
    ['https://localhost/x', 'host-not-allowed'],
    ['https://github.com/evil/repo/raw/main/x.glb', 'repo-not-allowed'],
    ['https://github.com/KhronosGroup/other-repo/x', 'repo-not-allowed'],
    ['https://github.com/', 'repo-not-allowed'],
    ['https://raw.githubusercontent.com/evil/repo/main/x.glb', 'repo-not-allowed'],
    ['https://objects.githubusercontent.com/x', 'host-not-allowed'],
    ['https://gist.github.com/x', 'host-not-allowed'],
  ]
  it.each(denied)('denies %s as %s', (url, reason) => {
    expect(checkUrl(url)).toEqual({ ok: false, reason })
  })

  it('judges the host the request will actually reach, and hands fetch the parsed form', () => {
    // WHATWG parsing treats a backslash as a path separator, so this is polyhaven.com, not evil.example.
    const verdict = checkUrl('https://polyhaven.com\\@evil.example/x')
    expect(verdict.ok && verdict.url.hostname).toBe('polyhaven.com')
    const upper = checkUrl('https://POLYHAVEN.com/x')
    expect(upper.ok && upper.url.href).toBe('https://polyhaven.com/x')
  })
})

const bodyOf = (bytes: Uint8Array | string, headers: Record<string, string> = {}, status = 200) =>
  new Response((typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes) as BodyInit, { status, headers })
const redirectTo = (location: string, status = 302) => new Response(null, { status, headers: { location } })

describe('fetchChecked: injected fetch only', () => {
  it('downloads from an allowed host with redirect: manual', async () => {
    const fake = vi.fn<typeof fetch>(() => Promise.resolve(bodyOf('hello')))
    const out = await fetchChecked('https://polyhaven.com/a', { fetch: fake })
    expect(new TextDecoder().decode(out.bytes)).toBe('hello')
    expect(fake).toHaveBeenCalledTimes(1)
    expect(fake.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' })
  })

  it('refuses a denied start URL without calling fetch', async () => {
    for (const url of ['http://polyhaven.com/a', 'https://evil.example/a', 'https://127.0.0.1/a', 'https://polyhaven.com@evil.example/a']) {
      await expect(fetchChecked(url, { fetch: neverCalled })).rejects.toBeInstanceOf(FetchRefused)
    }
    expect(neverCalled).not.toHaveBeenCalled()
  })

  it('follows a redirect to another allowed host, re-checking each hop', async () => {
    const fake = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(redirectTo('https://dl.polyhaven.org/file.glb'))
      .mockResolvedValueOnce(bodyOf('glb'))
    const out = await fetchChecked('https://polyhaven.com/a', { fetch: fake })
    expect(out.finalUrl).toBe('https://dl.polyhaven.org/file.glb')
    expect(fake).toHaveBeenCalledTimes(2)
  })

  it('resolves a relative redirect against the current URL', async () => {
    const fake = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(redirectTo('/next/file.glb', 301))
      .mockResolvedValueOnce(bodyOf('ok'))
    const out = await fetchChecked('https://kenney.nl/a', { fetch: fake })
    expect(out.finalUrl).toBe('https://kenney.nl/next/file.glb')
  })

  it.each([
    ['a denied host', 'https://evil.example/x.glb', 'host-not-allowed'],
    ['plain http', 'http://polyhaven.com/x.glb', 'not-https'],
    ['an IP literal', 'https://169.254.169.254/x', 'ip-literal'],
    ['userinfo', 'https://polyhaven.com@evil.example/x', 'userinfo'],
    ['a protocol-relative host', '//evil.example/x', 'host-not-allowed'],
  ])('a redirect to %s is refused and never requested', async (_label, location, reason) => {
    const fake = vi.fn<typeof fetch>().mockResolvedValueOnce(redirectTo(location))
    await expect(fetchChecked('https://polyhaven.com/a', { fetch: fake })).rejects.toMatchObject({ reason })
    expect(fake).toHaveBeenCalledTimes(1)
  })

  it('stops a redirect loop', async () => {
    const fake = vi.fn<typeof fetch>(() => Promise.resolve(redirectTo('https://polyhaven.com/again')))
    await expect(fetchChecked('https://polyhaven.com/a', { fetch: fake })).rejects.toMatchObject({ reason: 'too-many-redirects' })
    expect(fake).toHaveBeenCalledTimes(DEFAULT_LIMITS.maxRedirects + 1)
  })

  it('refuses a redirect with no Location, and a non-2xx answer', async () => {
    await expect(
      fetchChecked('https://polyhaven.com/a', { fetch: () => Promise.resolve(new Response(null, { status: 302 })) }),
    ).rejects.toMatchObject({ reason: 'bad-redirect' })
    await expect(
      fetchChecked('https://polyhaven.com/a', { fetch: () => Promise.resolve(bodyOf('no', {}, 404)) }),
    ).rejects.toMatchObject({ reason: 'bad-status' })
  })

  const small: FetchLimits = { timeoutMs: 60_000, maxBytes: 1_000, maxRedirects: 5 }

  it('refuses an oversize body that declares its length, without reading it', async () => {
    const pulled = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled()
        controller.enqueue(new Uint8Array(100))
      },
    })
    const res = new Response(stream, { headers: { 'content-length': '5000' } })
    await expect(fetchChecked('https://polyhaven.com/a', { fetch: () => Promise.resolve(res), limits: small })).rejects.toMatchObject({
      reason: 'too-large',
    })
    expect(pulled.mock.calls.length).toBeLessThanOrEqual(1)
  })

  it('stops reading an oversize body that lies about, or omits, its length', async () => {
    let chunks = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunks += 1
        controller.enqueue(new Uint8Array(400))
        if (chunks > 50) controller.close()
      },
    })
    await expect(
      fetchChecked('https://polyhaven.com/a', { fetch: () => Promise.resolve(new Response(stream)), limits: small }),
    ).rejects.toMatchObject({ reason: 'too-large' })
    expect(chunks).toBeLessThan(10)
  })

  it('accepts a body exactly at the cap', async () => {
    const out = await fetchChecked('https://polyhaven.com/a', {
      fetch: () => Promise.resolve(bodyOf(new Uint8Array(1_000))),
      limits: small,
    })
    expect(out.bytes.byteLength).toBe(1_000)
  })

  it('times out a server that never answers', async () => {
    const hang = () => new Promise<Response>(() => undefined)
    await expect(
      fetchChecked('https://polyhaven.com/a', { fetch: hang, limits: { ...small, timeoutMs: 30 } }),
    ).rejects.toMatchObject({ reason: 'timeout' })
  })

  it('times out a server that sends headers and then stalls', async () => {
    const stalled = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => undefined) })
    await expect(
      fetchChecked('https://polyhaven.com/a', { fetch: () => Promise.resolve(new Response(stalled)), limits: { ...small, timeoutMs: 30 } }),
    ).rejects.toMatchObject({ reason: 'timeout' })
  })
})

interface ZipSpec {
  name: string
  data?: Uint8Array | string
  method?: 0 | 8
  flags?: number
  /** Unix mode in the high 16 bits of the external attributes. */
  mode?: number
  usize?: number
  crc?: number
}

function makeZip(specs: ZipSpec[]): Uint8Array {
  const out: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const s of specs) {
    const name = Buffer.from(s.name)
    const raw = Buffer.from(s.data ?? '')
    const method = s.method ?? 0
    const packed = method === 8 ? deflateRawSync(raw) : raw
    const crc = s.crc ?? crc32(raw)
    const usize = s.usize ?? raw.length

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(s.flags ?? 0, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(usize, 22)
    local.writeUInt16LE(name.length, 26)
    out.push(local, name, packed)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE((3 << 8) | 20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(s.flags ?? 0, 8)
    cd.writeUInt16LE(method, 10)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(packed.length, 20)
    cd.writeUInt32LE(usize, 24)
    cd.writeUInt16LE(name.length, 28)
    cd.writeUInt32LE(((s.mode ?? 0o100644) << 16) >>> 0, 38)
    cd.writeUInt32LE(offset, 42)
    central.push(cd, name)
    offset += local.length + name.length + packed.length
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(specs.length, 8)
  eocd.writeUInt16LE(specs.length, 10)
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...out, ...central, eocd]))
}

describe('readZipEntries: take what we want, refuse the rest', () => {
  it('extracts models, textures and licence files only, stored or deflated', () => {
    const zip = makeZip([
      { name: 'pack/model.glb', data: 'glb-bytes', method: 8 },
      { name: 'pack/scene.gltf', data: '{}' },
      { name: 'pack/scene.bin', data: 'bin' },
      { name: 'pack/textures/albedo.png', data: 'png', method: 8 },
      { name: 'pack/LICENSE.txt', data: 'CC0' },
      { name: 'pack/License', data: 'CC0' },
      { name: 'pack/COPYING', data: 'x' },
      { name: 'pack/run.exe', data: 'MZ' },
      { name: 'pack/install.sh', data: 'rm -rf' },
      { name: 'pack/preview.png', data: 'not in a textures folder' },
      { name: 'pack/readme.md', data: 'hi' },
      { name: 'pack/', data: '' },
    ])
    const names = readZipEntries(zip).map((f) => f.name).sort()
    expect(names).toEqual([
      'pack/COPYING',
      'pack/License',
      'pack/LICENSE.txt',
      'pack/model.glb',
      'pack/scene.bin',
      'pack/scene.gltf',
      'pack/textures/albedo.png',
    ].sort())
    expect(new TextDecoder().decode(readZipEntries(zip).find((f) => f.name === 'pack/model.glb')?.data)).toBe('glb-bytes')
  })

  it.each([
    ['a parent-directory entry', '../evil.glb'],
    ['a nested traversal', 'pack/../../evil.glb'],
    ['an absolute path', '/etc/evil.glb'],
    ['a drive letter', 'C:/evil.glb'],
    ['a backslash path', 'pack\\evil.glb'],
    ['a dot segment', './evil.glb'],
    ['an empty segment', 'pack//evil.glb'],
  ])('refuses %s, even when the entry would not have been extracted', (_label, name) => {
    expect(() => readZipEntries(makeZip([{ name: 'ok.glb', data: 'x' }, { name, data: 'x' }]))).toThrow(ZipRefused)
    expect(() => readZipEntries(makeZip([{ name: name.replace('.glb', '.sh'), data: 'x' }]))).toThrow(ZipRefused)
  })

  it('refuses a symlink, an encrypted entry and a duplicate name', () => {
    expect(() => readZipEntries(makeZip([{ name: 'link.glb', data: '../../etc/passwd', mode: 0o120777 }]))).toThrow(/symlink/)
    expect(() => readZipEntries(makeZip([{ name: 'a.glb', data: 'x', flags: 1 }]))).toThrow(/encrypted/)
    expect(() => readZipEntries(makeZip([{ name: 'a.glb', data: 'x' }, { name: 'a.glb', data: 'y' }]))).toThrow(/duplicate/)
  })

  it('refuses a failed CRC, a lying declared size and an unsupported method', () => {
    expect(() => readZipEntries(makeZip([{ name: 'a.glb', data: 'abc', crc: 1 }]))).toThrow(/CRC/)
    expect(() => readZipEntries(makeZip([{ name: 'a.glb', data: 'abc', usize: 5 }]))).toThrow(ZipRefused)
    const bomb = makeZip([{ name: 'a.glb', data: Buffer.alloc(100_000), method: 8, usize: 10 }])
    expect(() => readZipEntries(bomb)).toThrow(/does not inflate/)
  })

  it('caps the total inflated size by the declared sizes', () => {
    const zip = makeZip([{ name: 'a.glb', data: Buffer.alloc(600) }, { name: 'b.glb', data: Buffer.alloc(600) }])
    expect(readZipEntries(zip, 2_000)).toHaveLength(2)
    expect(() => readZipEntries(zip, 1_000)).toThrow(/inflate past/)
  })

  it('refuses something that is not a zip', () => {
    expect(() => readZipEntries(new TextEncoder().encode('<html>not a zip</html>'))).toThrow(/not a zip/)
  })
})

describe('fetchSource: writes only into assets-src/<id>/ and only after the hashes agree', () => {
  let tmp: string
  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'fetch-'))
  })
  afterEach(() => rmSync(tmp, { recursive: true, force: true }))

  const entry = (over: Record<string, unknown>) =>
    sourceEntrySchema.parse({
      id: 'core-crystal',
      title: 'Core crystal',
      kind: 'hero',
      enabled: false,
      licenceId: 'CC0-1.0',
      licenceEvidence: { url: 'https://polyhaven.com/license', retrievedAt: '2026-10-02' },
      credit: { author: 'Someone', sourceUrl: 'https://polyhaven.com/a/core', retrievedAt: '2026-10-02' },
      ...over,
    })

  it('saves a direct GLB whose sha256 matches', async () => {
    const glb = new TextEncoder().encode('pretend glb')
    const source = entry({
      origin: { type: 'file', path: 'assets-src/core-crystal/model.glb', url: 'https://dl.polyhaven.org/m.glb', sha256: sha256Hex(glb) },
    })
    const layout = layoutFor(tmp)
    const written = await fetchSource(source, layout, { fetch: () => Promise.resolve(bodyOf(glb)) })
    expect(written).toEqual(['model.glb'])
    expect(readFileSync(path.join(tmp, 'assets-src', 'core-crystal', 'model.glb'))).toEqual(Buffer.from(glb))
  })

  it('writes nothing when the download hashes to something else', async () => {
    const source = entry({
      origin: { type: 'file', path: 'assets-src/core-crystal/model.glb', url: 'https://dl.polyhaven.org/m.glb', sha256: 'a'.repeat(64) },
    })
    await expect(fetchSource(source, layoutFor(tmp), { fetch: () => Promise.resolve(bodyOf('swapped')) })).rejects.toBeInstanceOf(FetchHashMismatch)
    expect(existsSync(path.join(tmp, 'assets-src'))).toBe(false)
  })

  it('extracts a zip after the archive and the member both match their pins', async () => {
    const glb = 'zipped glb'
    const zip = makeZip([
      { name: 'kit/model.glb', data: glb, method: 8 },
      { name: 'kit/LICENSE.txt', data: 'CC0' },
      { name: 'kit/tool.exe', data: 'MZ' },
    ])
    const source = entry({
      origin: {
        type: 'file',
        path: 'assets-src/core-crystal/kit/model.glb',
        url: 'https://kenney.nl/kit.zip',
        sha256: sha256Hex(new TextEncoder().encode(glb)),
        archiveSha256: sha256Hex(zip),
      },
    })
    const written = await fetchSource(source, layoutFor(tmp), { fetch: () => Promise.resolve(bodyOf(zip)) })
    expect(written.sort()).toEqual(['kit/LICENSE.txt', 'kit/model.glb'])
    expect(existsSync(path.join(tmp, 'assets-src', 'core-crystal', 'kit', 'tool.exe'))).toBe(false)
  })

  it('refuses a zip with no archiveSha256 pinned, and a traversal zip even with correct pins', async () => {
    const zip = makeZip([{ name: 'kit/model.glb', data: 'x' }])
    const unpinned = entry({
      origin: { type: 'file', path: 'assets-src/core-crystal/kit/model.glb', url: 'https://kenney.nl/kit.zip', sha256: 'b'.repeat(64) },
    })
    await expect(fetchSource(unpinned, layoutFor(tmp), { fetch: () => Promise.resolve(bodyOf(zip)) })).rejects.toThrow(/archiveSha256/)

    const evil = makeZip([{ name: 'kit/model.glb', data: 'x' }, { name: '../../outside.glb', data: 'x' }])
    const pinned = entry({
      origin: {
        type: 'file',
        path: 'assets-src/core-crystal/kit/model.glb',
        url: 'https://kenney.nl/kit.zip',
        sha256: sha256Hex(new TextEncoder().encode('x')),
        archiveSha256: sha256Hex(evil),
      },
    })
    await expect(fetchSource(pinned, layoutFor(tmp), { fetch: () => Promise.resolve(bodyOf(evil)) })).rejects.toBeInstanceOf(ZipRefused)
    expect(existsSync(path.join(tmp, 'outside.glb'))).toBe(false)
    expect(existsSync(path.join(tmp, 'assets-src'))).toBe(false)
  })

  it('refuses to fetch a generated source', async () => {
    const source = entry({ origin: { type: 'generated', generator: 'gyroscope' }, licenceId: 'own' })
    await expect(fetchSource(source, layoutFor(tmp), { fetch: neverCalled })).rejects.toThrow(/generated/)
  })

  it('writeEntries re-checks containment on its own', () => {
    expect(() => writeEntries(path.join(tmp, 'out'), [{ name: '../escape.glb', data: new Uint8Array(1) }])).toThrow(ZipRefused)
    expect(existsSync(path.join(tmp, 'escape.glb'))).toBe(false)
  })
})

describe('sources.json: the licence and provenance pins are required', () => {
  const base = {
    id: 'x',
    title: 'X',
    kind: 'prop',
    enabled: false,
    origin: { type: 'file', path: 'assets-src/x/m.glb', url: 'https://polyhaven.com/x', sha256: 'c'.repeat(64) },
    licenceId: 'CC0-1.0',
    licenceEvidence: { url: 'https://polyhaven.com/license', retrievedAt: '2026-10-02' },
    credit: { author: 'A', sourceUrl: 'https://polyhaven.com/x', retrievedAt: '2026-10-02' },
  }
  it('accepts a complete entry', () => {
    expect(sourceEntrySchema.safeParse(base).success).toBe(true)
  })
  it.each([
    ['a licence outside the enum', { licenceId: 'CC-BY-NC-4.0' }],
    ['no licence evidence', { licenceEvidence: undefined }],
    ['licence evidence over http', { licenceEvidence: { url: 'http://polyhaven.com/license', retrievedAt: '2026-10-02' } }],
    ['a short sha256', { origin: { ...base.origin, sha256: 'abc' } }],
    ['no sha256', { origin: { ...base.origin, sha256: undefined } }],
    ['no download url', { origin: { ...base.origin, url: undefined } }],
    ['an origin path outside assets-src/<id>/', { origin: { ...base.origin, path: 'assets-src/other/m.glb' } }],
    ['an origin path that climbs out', { origin: { ...base.origin, path: 'assets-src/x/../../m.glb' } }],
    ['CC-BY without a licence URL', { licenceId: 'CC-BY-4.0' }],
    ['an unknown key', { surprise: true }],
  ])('rejects %s', (_label, change) => {
    expect(sourceEntrySchema.safeParse({ ...base, ...change }).success).toBe(false)
  })
})
