// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { MODEL_REPO_BYTES, type Credit } from '@repo/contracts'
import { describe, expect, it } from 'vitest'

import { defaultRoot } from '../../scripts/assets/sources'
import {
  GlbFormatError,
  buildReport,
  canonicalJson,
  contentHashOf,
  imageLongEdge,
  integrityOf,
  packGlb,
  parseGlb,
  scanGlb,
  sha256Hex,
  validateComplete,
  validateCredits,
  validateFileName,
  validateHash,
  validateOrphans,
  validateRepoBytes,
  validateReport,
  type GlbReport,
  type Violation,
} from '../../scripts/assets/validators'
import { glbAroundImage } from './assets-fixtures'

const codes = (vs: readonly Violation[]) => vs.map((x) => x.code)

const report = (over: Partial<GlbReport> = {}): GlbReport => ({
  bytes: 1_000,
  sha256: '0'.repeat(64),
  triangles: 100,
  materials: 1,
  textures: [],
  extensionsUsed: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
  clips: [],
  names: ['body'],
  ...over,
})

describe('validateReport: the budget table', () => {
  const ok = (r: GlbReport, tier: 1 | 2 | 3 = 2) => validateReport(r, { subject: 'x', tier })

  it('passes a small clean model at every tier', () => {
    for (const tier of [1, 2, 3] as const) expect(ok(report(), tier)).toEqual([])
  })

  it('BYTES: over the tier budget, and over the per-file cap', () => {
    expect(codes(ok(report({ bytes: 70_001 }), 1))).toEqual(['BYTES'])
    expect(ok(report({ bytes: 70_000 }), 1)).toEqual([])
    expect(codes(ok(report({ bytes: 180_001 }), 2))).toEqual(['BYTES'])
    expect(codes(ok(report({ bytes: 400_001 }), 3))).toEqual(['BYTES', 'BYTES'])
  })

  it('TRIS: over the tier budget', () => {
    expect(codes(ok(report({ triangles: 6_001 }), 1))).toEqual(['TRIS'])
    expect(ok(report({ triangles: 6_001 }), 2)).toEqual([])
    expect(codes(ok(report({ triangles: 50_001 }), 3))).toEqual(['TRIS'])
  })

  it('TEXTURE: count, long edge, MIME, and one large texture at most at tier 3', () => {
    const webp = (longEdge: number) => ({ mimeType: 'image/webp', longEdge })
    expect(ok(report({ textures: [webp(512)] }), 1)).toEqual([])
    expect(codes(ok(report({ textures: [webp(513)] }), 1))).toEqual(['TEXTURE'])
    expect(codes(ok(report({ textures: [webp(256), webp(256)] }), 1))).toEqual(['TEXTURE'])
    expect(codes(ok(report({ textures: [{ mimeType: 'image/png', longEdge: 256 }] }), 2))).toEqual(['TEXTURE'])
    expect(codes(ok(report({ textures: [{ mimeType: null, longEdge: 256 }] }), 2))).toEqual(['TEXTURE'])
    expect(ok(report({ textures: [webp(2048), webp(1024)] }), 3)).toEqual([])
    expect(codes(ok(report({ textures: [webp(2048), webp(2048)] }), 3))).toEqual(['TEXTURE'])
  })

  it('MATERIALS: over the tier cap', () => {
    expect(codes(ok(report({ materials: 2 }), 1))).toEqual(['MATERIALS'])
    expect(ok(report({ materials: 2 }), 2)).toEqual([])
    expect(codes(ok(report({ materials: 3 }), 3))).toEqual(['MATERIALS'])
  })

  it('EXTENSIONS: transmission is a tier 3 privilege, Draco is never allowed', () => {
    const transmissive = report({ extensionsUsed: ['EXT_meshopt_compression', 'KHR_materials_transmission'] })
    expect(codes(ok(transmissive, 2))).toEqual(['EXTENSIONS'])
    expect(ok(transmissive, 3)).toEqual([])
    expect(codes(ok(report({ extensionsUsed: ['KHR_draco_mesh_compression'] }), 3))).toEqual(['EXTENSIONS'])
  })

  it('CLIPS: count, duration, kebab-case names, agreement with the manifest', () => {
    const clip = (name: string, seconds = 2) => ({ name, seconds })
    expect(ok(report({ clips: [clip('idle')] }), 1)).toEqual([])
    expect(codes(ok(report({ clips: [clip('a'), clip('b')] }), 1))).toEqual(['CLIPS'])
    expect(codes(ok(report({ clips: [clip('idle', 20.5)] }), 2))).toEqual(['CLIPS'])
    expect(codes(ok(report({ clips: [clip('Idle Loop')] }), 2))).toEqual(['CLIPS'])
    const r = report({ clips: [clip('idle')] })
    expect(validateReport(r, { subject: 'x', tier: 2, manifestClips: [{ name: 'idle', seconds: 2 }] })).toEqual([])
    expect(codes(validateReport(r, { subject: 'x', tier: 2, manifestClips: [] }))).toEqual(['CLIPS'])
  })

  it('NAMING: whitespace in a node, mesh or material name', () => {
    expect(codes(ok(report({ names: ['good-name', 'bad name'] })))).toEqual(['NAMING'])
  })
})

describe('validateFileName', () => {
  it('accepts <id>.t<tier>.<hash8>.glb for the right entry and tier', () => {
    expect(validateFileName('core-crystal.t2.abcdef01.glb', 'core-crystal', 2)).toEqual([])
  })
  it('NAMING: wrong shape, wrong id, wrong tier, non-kebab id', () => {
    expect(codes(validateFileName('Core Crystal.glb', 'core-crystal', 2))).toEqual(['NAMING'])
    expect(codes(validateFileName('other.t2.abcdef01.glb', 'core-crystal', 2))).toEqual(['NAMING'])
    expect(codes(validateFileName('core-crystal.t1.abcdef01.glb', 'core-crystal', 2))).toEqual(['NAMING'])
    expect(codes(validateFileName('core_crystal.t2.abcdef01.glb', 'core_crystal', 2))).toContain('NAMING')
  })
})

describe('validateHash', () => {
  const bytes = new TextEncoder().encode('some model bytes')
  const name = `x.t1.${sha256Hex(bytes).slice(0, 8)}.glb`
  it('passes when integrity and the file name suffix both match', () => {
    expect(validateHash(name, bytes, integrityOf(bytes))).toEqual([])
  })
  it('HASH: integrity differs, or the file name suffix differs', () => {
    expect(codes(validateHash(name, bytes, integrityOf(new Uint8Array([1]))))).toEqual(['HASH'])
    expect(codes(validateHash('x.t1.00000000.glb', bytes, integrityOf(bytes)))).toEqual(['HASH'])
  })
})

describe('cross-file rules', () => {
  it('BYTES: all tracked models over 1.5 MB', () => {
    expect(validateRepoBytes([{ name: 'a', bytes: MODEL_REPO_BYTES }])).toEqual([])
    expect(codes(validateRepoBytes([{ name: 'a', bytes: 1_000_000 }, { name: 'b', bytes: 500_001 }]))).toEqual(['BYTES'])
  })

  it('ORPHAN: a file the manifest does not reference, and a reference without a file', () => {
    expect(validateOrphans(['a.glb'], ['a.glb'])).toEqual([])
    expect(codes(validateOrphans(['a.glb', 'stale.glb'], ['a.glb']))).toEqual(['ORPHAN'])
    expect(codes(validateOrphans(['a.glb'], ['a.glb', 'gone.glb']))).toEqual(['ORPHAN'])
  })

  it('COMPLETE: an enabled entry needs every tier its source asks for; a disabled one does not', () => {
    expect(validateComplete({ id: 'x', enabled: true }, [1, 2], [1, 2])).toEqual([])
    expect(codes(validateComplete({ id: 'x', enabled: true }, [1, 2, 3], [1, 2]))).toEqual(['COMPLETE'])
    expect(validateComplete({ id: 'x', enabled: false }, [1, 2, 3], [1])).toEqual([])
  })
})

describe('validateCredits', () => {
  const row: Credit = {
    assetId: 'core-crystal',
    title: 'Core crystal',
    author: 'Someone',
    sourceUrl: 'https://kenney.nl/assets/x',
    licence: 'CC0-1.0',
    retrievedAt: '2026-10-02',
  }
  const enabled = [{ id: 'core-crystal', enabled: true }]

  it('passes when the file equals the derived credits', () => {
    expect(validateCredits(enabled, [row], [row])).toEqual([])
    expect(validateCredits([{ id: 'core-crystal', enabled: false }], [], [])).toEqual([])
  })
  it('LICENCE: an enabled entry without a credit row', () => {
    expect(codes(validateCredits(enabled, [row], []))).toContain('LICENCE')
  })
  it('LICENCE: a disabled entry that is credited, and a credit with no entry', () => {
    expect(codes(validateCredits([{ id: 'core-crystal', enabled: false }], [], [row]))).toContain('LICENCE')
    expect(codes(validateCredits([], [], [row]))).toContain('LICENCE')
  })
  it('LICENCE: a row outside the licence enum or with an http source', () => {
    expect(codes(validateCredits(enabled, [row], [{ ...row, licence: 'CC-BY-NC-4.0' }]))).toContain('LICENCE')
    expect(codes(validateCredits(enabled, [row], [{ ...row, sourceUrl: 'http://kenney.nl/x' }]))).toContain('LICENCE')
  })
  it('LICENCE: CC-BY without a licence URL', () => {
    expect(codes(validateCredits(enabled, [row], [{ ...row, licence: 'CC-BY-4.0' }]))).toContain('LICENCE')
  })
  it('LICENCE: a file that drifted from sources.json', () => {
    expect(codes(validateCredits(enabled, [row], [{ ...row, author: 'Someone else' }]))).toEqual(['LICENCE'])
  })
})

describe('canonical JSON and the content hash', () => {
  it('sorts keys, ends with one newline, and is stable', () => {
    const text = canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: 0 } })
    expect(text).toBe('{\n  "a": {\n    "c": 0,\n    "d": [\n      3,\n      {\n        "y": 2,\n        "z": 1\n      }\n    ]\n  },\n  "b": 1\n}\n')
    expect(contentHashOf([{ b: 1, a: 2 }])).toBe(contentHashOf([{ a: 2, b: 1 }]))
    expect(contentHashOf([])).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('scanGlb: the committed-file security scan', () => {
  const modelsDir = path.join(defaultRoot(), 'apps', 'web', 'public', 'models')
  const manifest = JSON.parse(readFileSync(path.join(modelsDir, 'manifest.json'), 'utf8')) as {
    models: { variants: { tier: number; url: string }[] }[]
  }
  const tier1 = manifest.models[0]?.variants.find((x) => x.tier === 1)
  const base = new Uint8Array(readFileSync(path.join(modelsDir, (tier1?.url ?? '').replace('/models/', ''))))

  type Json = Record<string, unknown>
  const shape = (() => {
    const { json, bin } = parseGlb(base)
    const declared = Number(((json['buffers'] as Json[])[0] ?? {})['byteLength'])
    let covered = 0
    /** Where each stored (compressed) range ends, read from the file rather than written down. */
    const ends: number[] = []
    for (const view of json['bufferViews'] as Json[]) {
      const m = (view['extensions'] as Record<string, Record<string, number>> | undefined)?.['EXT_meshopt_compression']
      if (m && m['buffer'] === 0) {
        covered = Math.max(covered, (m['byteOffset'] ?? 0) + (m['byteLength'] ?? 0))
        ends.push((m['byteOffset'] ?? 0) + (m['byteLength'] ?? 0))
      }
    }
    return { declared, covered, ends, binLength: bin?.byteLength ?? 0 }
  })()
  const mutate = (fn: (json: Json, bin: Uint8Array) => Uint8Array | void): Uint8Array => {
    const { json, bin } = parseGlb(base)
    const replaced = fn(json, bin ?? new Uint8Array())
    return packGlb(json, replaced ?? bin)
  }
  const firstNode = (json: Json) => (json['nodes'] as Json[])[0] ?? {}
  const messages = (bytes: Uint8Array, tier?: 1 | 2 | 3) => scanGlb(bytes, 'g', tier).map((x) => x.message)
  const setName = (value: string) => (json: Json) => void (firstNode(json)['name'] = value)
  /** Adds one name to extensionsUsed, keeping the list sorted and everything the file really uses declared. */
  const alsoUsed = (name: string) => (json: Json) =>
    void (json['extensionsUsed'] = [...(json['extensionsUsed'] as string[]), name].sort())

  it('passes the committed gyroscope, which the pipeline wrote, at its own tier', () => {
    expect(scanGlb(base, 'gyroscope', 1)).toEqual([])
    expect(buildReport(base).triangles).toBe(6_000)
  })

  // Every row asserts the EXACT messages, so a scan that stops working fails by name.
  const cases: [string, (json: Json, bin: Uint8Array) => Uint8Array | void, string[]][] = [
    ['extras on a node', (j) => void (firstNode(j)['extras'] = { note: 'x' }), ['extras are not allowed']],
    ['asset.generator', (j) => void ((j['asset'] as Json)['generator'] = 'Blender 4.2'), ['asset metadata other than version must be stripped']],
    ['asset.copyright', (j) => void ((j['asset'] as Json)['copyright'] = 'me'), ['asset metadata other than version must be stripped']],
    ['a Windows drive path in a name', setName('C:\\Users\\wiesl\\model.blend'), ['contains a drive-letter path', 'contains a home-directory path', 'names must be stripped']],
    ['a forward-slash drive path', setName('D:/work/model.blend'), ['contains a drive-letter path', 'names must be stripped']],
    ['a Linux home path at the start of a value', setName('/home/wiesl/model.blend'), ['contains a home-directory path', 'names must be stripped']],
    ['a macOS home path mid-value', setName('exported from/Users/wiesl/x'), ['contains a home-directory path', 'names must be stripped']],
    ['an environment-variable path', setName('%USERPROFILE%model'), ['contains an environment-variable path', 'names must be stripped']],
    ['a UNC path', setName('\\\\fileserver\\share\\model'), ['contains a UNC network path', 'names must be stripped']],
    ['a protocol-relative value', setName('//cdn.example/model'), ['contains a protocol-relative or network path', 'names must be stripped']],
    ['an email address', setName('made-by-info@rapidevlabs.com'), ['contains an email address', 'names must be stripped']],
    ['a URL that is not allow-listed', setName('see https://evil.example/model'), ['contains a URL that is not allow-listed', 'names must be stripped']],
    ['a file: URL', setName('file:///etc/passwd'), ['contains a URL that is not allow-listed', 'contains a URI scheme', 'names must be stripped']],
    ['a scheme-looking value', setName('ssh:deploy'), ['contains a URI scheme', 'names must be stripped']],
    ['a harmless name, which is still a name', setName('c_users_bob'), ['names must be stripped']],
    ['an external image uri', (j) => void (j['images'] = [{ uri: 'textures/a.png' }]), ['external or data: uri is not allowed; a GLB must be self-contained', 'image data must be embedded in the binary chunk', 'image is not reachable from any scene', 'mimeType must be "image/webp"']],
    [
      'a data: buffer uri',
      (j) => void (j['buffers'] = [{ byteLength: 4, uri: 'data:application/octet-stream;base64,AAAA' }]),
      [
        'external or data: uri is not allowed; a GLB must be self-contained',
        'contains a data: URI',
        `binary chunk is ${shape.binLength - 4} bytes longer than the declared buffer`,
        'binary chunk padding is not zero',
        // The three meshopt views now end past the 4 byte buffer the edit declared.
        ...shape.ends.map((end) => `bufferView ends at ${end}, past the declared buffer of 4 bytes`),
      ],
    ],
    ['a camera', (j) => void (j['cameras'] = [{ type: 'perspective' }]), ['top-level key "cameras" is not allowed']],
    ['an unknown top-level key', (j) => void (j['KHR_lights_punctual'] = {}), ['top-level key "KHR_lights_punctual" is not allowed']],
    ['a top-level extensions block', (j) => void (j['extensions'] = { KHR_lights_punctual: { lights: [] } }), ['extension KHR_lights_punctual is not on the allow-list', 'top-level key "extensions" is not allowed']],
    ['Draco compression', alsoUsed('KHR_draco_mesh_compression'), ['extension KHR_draco_mesh_compression is not on the allow-list (Draco and KTX2 are rejected for now)']],
    ['KTX2 textures', (j) => void (j['extensionsRequired'] = ['KHR_texture_basisu']), ['extension KHR_texture_basisu is not on the allow-list (Draco and KTX2 are rejected for now)']],
    ['a KHR_materials_ name that is not in the contract', alsoUsed('KHR_materials_clearcoat'), ['extension KHR_materials_clearcoat is not on the allow-list (Draco and KTX2 are rejected for now)']],
    [
      'an element extension that extensionsUsed never declares',
      (j) => void (((j['materials'] as Json[])[0] ?? {})['extensions'] = { KHR_materials_ior: { ior: 1.5 } }),
      ['extension KHR_materials_ior is not allowed at this tier', 'extension KHR_materials_ior is used in the file but not declared in extensionsUsed'],
    ],
    ['an image name', (j) => void (j['images'] = [{ name: 'brick.png', bufferView: 0, mimeType: 'image/webp' }]), ['names must be stripped', 'image bufferView must be a plain stored view in buffer 0', 'image is not reachable from any scene', 'bufferView is read by both an image and an accessor']],
    ['a clip name outside the pattern', (j) => void (j['animations'] = [{ name: 'Idle Loop', samplers: [], channels: [] }]), ['clip names must match [a-z0-9-]{0,40}']],
    ['a third buffer of any kind', (j) => void (j['buffers'] as unknown[]).push({ byteLength: 4 }), ['a GLB carries one stored buffer and at most one meshopt fallback']],
    [
      'three buffers',
      (j) => void (j['buffers'] as unknown[]).push({ byteLength: 4, extensions: { EXT_meshopt_compression: { fallback: true } } }, { byteLength: 4, extensions: { EXT_meshopt_compression: { fallback: true } } }),
      ['a GLB carries one stored buffer and at most one meshopt fallback'],
    ],
    [
      'a fallback buffer that is not marked fallback: true',
      (j) => void ((j['buffers'] as Json[])[1] = { byteLength: 9, extensions: { EXT_meshopt_compression: { fallback: false } } }),
      ['a second buffer must be the meshopt fallback and nothing else'],
    ],
    [
      'buffer 0 marked as the fallback',
      (j) => void ((j['buffers'] as Json[])[0] = { ...((j['buffers'] as Json[])[0] ?? {}), extensions: { EXT_meshopt_compression: { fallback: true } } }),
      ['buffer 0 may not be a fallback buffer'],
    ],
    [
      'an email hidden in the BIN tail',
      (_j, bin) => {
        const tail = new TextEncoder().encode('owner@example.com....')
        const out = new Uint8Array(bin.byteLength + tail.byteLength)
        out.set(bin)
        out.set(tail, bin.byteLength)
        return out
      },
      [`binary chunk is ${Math.ceil((shape.binLength + 21) / 4) * 4 - shape.declared} bytes longer than the declared buffer`, 'binary chunk padding is not zero'],
    ],
    [
      'a gap in the BIN chunk no bufferView covers',
      (j, bin) => {
        ;((j['buffers'] as Json[])[0] as Json)['byteLength'] = bin.byteLength + 64
        const out = new Uint8Array(bin.byteLength + 64)
        out.set(bin)
        return out
      },
      [`binary chunk has an unreferenced tail of ${shape.binLength + 64 - shape.covered} bytes at offset ${shape.covered}`],
    ],
  ]

  it.each(cases)('SECURITY: %s', (_label, change, expected) => {
    const found = scanGlb(mutate(change), 'g', 1)
    expect(codes(found)).toEqual(found.map(() => 'SECURITY'))
    expect(found.map((x) => x.message).sort()).toEqual([...expected].sort())
  })

  it('SECURITY: a transmissive extension is held to the tier it is scanned at', () => {
    const bytes = mutate(alsoUsed('KHR_materials_transmission'))
    const unused = 'extension KHR_materials_transmission is declared in extensionsUsed but nothing in the file uses it'
    expect(messages(bytes, 2)).toEqual(['extension KHR_materials_transmission is not allowed at this tier'])
    expect(messages(bytes, 3)).toEqual([unused])
    expect(messages(bytes)).toEqual([unused])
  })

  it('does not echo the offending value, only where it is', () => {
    const found = scanGlb(mutate(setName('C:\\Users\\secret-person\\x')), 'g')
    expect(JSON.stringify(found)).not.toContain('secret-person')
  })

  it('SECURITY: a WebP carrying EXIF or XMP metadata', () => {
    const riff = (chunks: [string, number][]) => {
      const body: number[] = [...Buffer.from('WEBP')]
      for (const [id, size] of chunks) {
        body.push(...Buffer.from(id), size & 255, 0, 0, 0, ...new Array<number>(size).fill(0))
        if (size % 2) body.push(0)
      }
      return new Uint8Array([...Buffer.from('RIFF'), body.length & 255, body.length >> 8, 0, 0, ...body])
    }
    const glbWith = glbAroundImage
    expect(scanGlb(glbWith(riff([['VP8 ', 10]])), 'x')).toEqual([])
    expect(messages(glbWith(riff([['VP8 ', 10], ['EXIF', 8]])))).toEqual(['WebP chunk "EXIF" can carry metadata and is not allowed'])
    expect(messages(glbWith(riff([['XMP ', 8]])))).toEqual([
      'WebP chunk "XMP" can carry metadata and is not allowed',
      'WebP chunk layout is not one the encoder writes: the first chunk must be VP8, VP8L or VP8X',
    ])
  })
})


describe('parseGlb: malformed containers are rejected, not tolerated', () => {
  const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]
  const JSON_TYPE = 0x4e4f534a
  const BIN_TYPE = 0x004e4942
  const chunk = (type: number, body: number[]) => [...u32(body.length), ...u32(type), ...body]
  const jsonChunk = (text = '{"asset":{"version":"2.0"}}') => {
    const bytes = [...new TextEncoder().encode(text)]
    while (bytes.length % 4) bytes.push(0x20)
    return chunk(JSON_TYPE, bytes)
  }
  const glb = (chunks: number[][], over: { magic?: number; version?: number; length?: number } = {}) => {
    const body = chunks.flat()
    const total = 12 + body.length
    return new Uint8Array([...u32(over.magic ?? 0x46546c67), ...u32(over.version ?? 2), ...u32(over.length ?? total), ...body])
  }

  it('accepts a JSON chunk alone, and a JSON chunk followed by one BIN chunk', () => {
    expect(parseGlb(glb([jsonChunk()])).bin).toBeNull()
    expect(parseGlb(glb([jsonChunk(), chunk(BIN_TYPE, [1, 2, 3, 4])])).bin?.byteLength).toBe(4)
  })

  it.each([
    ['bad magic', glb([jsonChunk()], { magic: 0x12345678 }), /missing glTF magic/],
    ['version 1', glb([jsonChunk()], { version: 1 }), /not glTF 2\.0/],
    ['a header length that is not the file size', glb([jsonChunk()], { length: 999 }), /header length/],
    ['a file too short to hold a header', new Uint8Array(8), /too short/],
    ['a first chunk that is not JSON', glb([chunk(BIN_TYPE, [0, 0, 0, 0])]), /first chunk is not JSON/],
    ['a second chunk that is not BIN', glb([jsonChunk(), chunk(JSON_TYPE, [0x7b, 0x7d, 0x20, 0x20])]), /unexpected chunk/],
    ['a third chunk', glb([jsonChunk(), chunk(BIN_TYPE, [0, 0, 0, 0]), chunk(BIN_TYPE, [0, 0, 0, 0])]), /unexpected chunk/],
    ['trailing bytes after the last chunk', glb([jsonChunk(), chunk(BIN_TYPE, [0, 0, 0, 0]), [1, 2, 3]]), /truncated chunk header/],
    ['a chunk that runs past the end of the file', glb([[...u32(4000), ...u32(JSON_TYPE), 0x7b, 0x7d, 0x20, 0x20]]), /past the end/],
    ['JSON that is not valid UTF-8', glb([chunk(JSON_TYPE, [0xff, 0xfe, 0xfd, 0xfc])]), /unreadable/],
    ['JSON that does not parse', glb([jsonChunk('{nope')]), /unreadable/],
    ['JSON that is an array', glb([jsonChunk('[1,2,3,4]')]), /not an object/],
  ])('rejects %s', (_label, bytes, message) => {
    expect(() => parseGlb(bytes)).toThrow(GlbFormatError)
    expect(() => parseGlb(bytes)).toThrow(message)
  })
})

describe('imageLongEdge: read from the header, 0 when it cannot be', () => {
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
  const riff = (chunkId: string, data: number[]) =>
    new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...ascii(chunkId), data.length, 0, 0, 0, ...data])
  const pad = (data: number[], to: number) => [...data, ...new Array<number>(Math.max(0, to - data.length)).fill(0)]

  it('reads a PNG IHDR', () => {
    const png = new Uint8Array(32)
    new DataView(png.buffer).setUint32(16, 640)
    new DataView(png.buffer).setUint32(20, 1024)
    expect(imageLongEdge('image/png', png)).toBe(1024)
  })

  it('reads lossy WebP (VP8)', () => {
    expect(imageLongEdge('image/webp', riff('VP8 ', pad([0, 0, 0, 0x9d, 0x01, 0x2a, 0x2c, 0x01, 0xc8, 0x00], 12)))).toBe(300)
  })

  it('reads lossless WebP (VP8L)', () => {
    // 300 x 200: width-1 = 299, height-1 = 199 packed into 14-bit fields after the 0x2f signature.
    expect(imageLongEdge('image/webp', riff('VP8L', pad([0x2f, 43, 193, 49, 0], 12)))).toBe(300)
  })

  it('reads extended WebP (VP8X)', () => {
    expect(imageLongEdge('image/webp', riff('VP8X', pad([0, 0, 0, 0, 0xe7, 0x03, 0, 0xf3, 0x01, 0], 12)))).toBe(1000)
  })

  it('returns 0 for truncated, unknown and mislabelled data', () => {
    expect(imageLongEdge('image/webp', new Uint8Array(20))).toBe(0)
    expect(imageLongEdge('image/png', new Uint8Array(10))).toBe(0)
    expect(imageLongEdge('image/jpeg', new Uint8Array(64))).toBe(0)
    expect(imageLongEdge(null, new Uint8Array(64))).toBe(0)
    expect(imageLongEdge('image/webp', riff('ALPH', pad([1, 2], 12)))).toBe(0)
  })
})

describe('fail-open parsing becomes a violation', () => {
  const ok = { bytes: 10, sha256: '0'.repeat(64), triangles: 1, materials: 1, extensionsUsed: [], names: [] }

  it('TEXTURE: an image whose size could not be read', () => {
    const found = validateReport(
      { ...ok, textures: [{ mimeType: 'image/webp', longEdge: 0 }], clips: [] },
      { subject: 'x', tier: 2 },
    )
    expect(found.map((x) => x.message)).toEqual(['texture 0 dimensions could not be read'])
  })

  it('CLIPS: a clip with no readable duration', () => {
    const found = validateReport(
      { ...ok, textures: [], clips: [{ name: 'idle', seconds: 0 }] },
      { subject: 'x', tier: 2 },
    )
    expect(found.map((x) => x.message)).toEqual(['clip "idle" duration unreadable'])
  })

  const withImage = (view: Record<string, unknown> | null, binLength: number) =>
    packGlb(
      {
        asset: { version: '2.0' },
        buffers: [{ byteLength: binLength }],
        bufferViews: view ? [view] : [],
        images: [{ bufferView: 0, mimeType: 'image/webp' }],
      },
      new Uint8Array(binLength),
    )

  it('buildReport throws on an image whose view is missing or outside the BIN chunk', () => {
    expect(() => buildReport(withImage(null, 16))).toThrow(/no readable bufferView/)
    expect(() => buildReport(withImage({ buffer: 0, byteOffset: 8, byteLength: 64 }, 16))).toThrow(/past the end/)
  })

  it('scanGlb reports an image view outside the BIN chunk instead of reading past it', () => {
    const found = scanGlb(withImage({ buffer: 0, byteOffset: 8, byteLength: 64 }, 16), 'x')
    expect(found.map((x) => x.message)).toContain('image bufferView runs past the end of the binary chunk')
  })
})
