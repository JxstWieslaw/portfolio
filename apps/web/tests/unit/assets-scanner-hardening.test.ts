// @vitest-environment node
/**
 * The scanner is the only backstop for file-origin sources (raw sources are gitignored, so CI cannot
 * re-derive them). Each test here fails if the fix it names is removed.
 */
import { MODEL_BUDGETS, TIER_EXTENSIONS } from '@repo/contracts'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildVariant, loadToolchain } from '../../scripts/assets/pipeline'
import { inspectWebp, packGlb, parseGlb, scanGlb, type Violation } from '../../scripts/assets/validators'
import { type Json, binGlb, committedGlb, floats, glbAroundImage, rawGlb, richDoc, shorts, view, type BinSpec } from './assets-fixtures'

const committed = committedGlb

const messages = (found: readonly Violation[]) => found.map((x) => x.message).sort()
const onlySecurity = (found: readonly Violation[]) => expect(found.every((x) => x.code === 'SECURITY')).toBe(true)

// ---------------------------------------------------------------------------------------------
// A1: the parsed view of a file must be the file
// ---------------------------------------------------------------------------------------------

describe('A1: canonical form', () => {
  const CANONICAL = 'GLB is not in canonical form (duplicate keys, extra whitespace or non-canonical JSON)'
  const base = committed(1)
  const { json, bin } = parseGlb(base)
  const text = JSON.stringify(json)

  it('passes every committed GLB, which packGlb wrote', () => {
    expect(scanGlb(base, 'g', 1)).toEqual([])
    expect(scanGlb(committed(2), 'g', 2)).toEqual([])
  })

  it('SECURITY: a duplicate key (JSON.parse keeps the last, so the scan would see the harmless one)', () => {
    const declared = '"buffers":[{"byteLength":'
    expect(text).toContain(declared)
    const tampered = text.replace(declared, `${declared}4,"byteLength":`)
    const bytes = rawGlb(tampered, bin)
    // The parsed view is exactly the clean file, so only the canonical-form rule can see the lie.
    expect(JSON.stringify(parseGlb(bytes).json)).toBe(text)
    const found = scanGlb(bytes, 'g', 1)
    expect(messages(found)).toEqual([CANONICAL])
    onlySecurity(found)
  })

  it('SECURITY: extra whitespace, and a pretty-printed JSON chunk', () => {
    expect(messages(scanGlb(rawGlb(text.replace('{"asset"', '{ "asset"'), bin), 'g', 1))).toEqual([CANONICAL])
    expect(messages(scanGlb(rawGlb(JSON.stringify(json, null, 2), bin), 'g', 1))).toEqual([CANONICAL])
  })

  it('SECURITY: a number written another way (1.0 for 1)', () => {
    const changed = text.replace('"mode":4', '"mode":4.0')
    expect(changed).not.toBe(text)
    expect(messages(scanGlb(rawGlb(changed, bin), 'g', 1))).toEqual([CANONICAL])
  })
})

// ---------------------------------------------------------------------------------------------
// A2: every stored byte belongs to a referenced, in-range, non-overlapping view
// ---------------------------------------------------------------------------------------------

describe('A2: BIN coverage', () => {
  type Spec = BinSpec
  const glb = binGlb
  const scan = (spec?: Spec) => scanGlb(glb(spec), 'g')

  it('passes the clean baseline, and the alignment padding between two views (the boundary)', () => {
    expect(scan()).toEqual([])
    // A 6 byte view ends at 6, so the next view starts at 8: the 2 byte gap is exactly the padding to a 4 byte boundary.
    expect(scan({ bufferViews: [view(0, 6), view(8, 8)], accessors: [shorts(0, 3), floats(1, 2)] })).toEqual([])
  })

  it('passes the committed gyroscope: meshopt views are judged by their compressed bytes', () => {
    expect(scanGlb(committed(1), 'g', 1)).toEqual([])
  })

  it('SECURITY: an unreferenced view over the whole buffer (it hides every byte behind a "valid" range)', () => {
    const found = scan({ bufferViews: [view(0, 8), view(8, 8), view(0, 16)] })
    expect(messages(found)).toEqual(
      [
        'bufferView is not referenced by any accessor or image',
        'bufferViews 0 and 2 overlap in the binary chunk',
        'bufferViews 2 and 1 overlap in the binary chunk',
      ].sort(),
    )
    onlySecurity(found)
  })

  it('SECURITY: an unreferenced view that covers a real gap on its own', () => {
    const found = scan({ bufferViews: [view(0, 8), view(8, 8), view(16, 8)], binLength: 24 })
    expect(messages(found)).toEqual(['bufferView is not referenced by any accessor or image'])
    expect(found[0]?.subject).toContain('$.bufferViews[2]')
  })

  it('SECURITY: two views that overlap', () => {
    const found = scan({ bufferViews: [view(0, 8), view(4, 12)], accessors: [floats(0, 2), floats(1, 3)] })
    expect(messages(found)).toEqual(['bufferViews 0 and 1 overlap in the binary chunk'])
  })

  it('SECURITY: a view that ends past the declared buffer and past the BIN chunk', () => {
    const found = scan({ bufferViews: [view(0, 8), view(8, 16)], accessors: [floats(0, 2), floats(1, 4)] })
    expect(messages(found)).toEqual([
      'bufferView ends at 24, past the 16 byte binary chunk',
      'bufferView ends at 24, past the declared buffer of 16 bytes',
    ])
  })

  it('SECURITY: a view that fits the BIN chunk but not the declared buffer', () => {
    const found = scan({ binLength: 16, declared: 12 })
    expect(messages(found)).toEqual(
      expect.arrayContaining(['bufferView ends at 16, past the declared buffer of 12 bytes']),
    )
  })

  it('SECURITY: a gap in the MIDDLE of the file (the old "gap" test only ever covered the tail)', () => {
    const found = scan({
      bufferViews: [view(0, 8), view(16, 8), view(24, 8)],
      accessors: [floats(0, 2), floats(1, 2), floats(2, 2)],
      binLength: 32,
    })
    expect(messages(found)).toEqual(['binary chunk has an unreferenced gap of 8 bytes at offset 8'])
  })

  it('SECURITY: a tail of more than 3 bytes', () => {
    const found = scan({ bufferViews: [view(0, 8), view(8, 8)], binLength: 24 })
    expect(messages(found)).toEqual(['binary chunk has an unreferenced tail of 8 bytes at offset 16'])
  })

  it('SECURITY: a sparse accessor', () => {
    const found = scan({ accessors: [floats(0, 2), floats(1, 2, { sparse: { count: 1, indices: { bufferView: 1 }, values: { bufferView: 1 } } })] })
    expect(messages(found)).toEqual(['sparse accessors are not allowed'])
  })

  it('SECURITY: negative, fractional and string offsets and lengths', () => {
    for (const bad of [-4, 1.5, '8'] as const) {
      const found = scan({ bufferViews: [view(0, 8), { buffer: 0, byteOffset: bad, byteLength: 8 }] })
      expect(messages(found)).toContain('byteOffset and byteLength must be non-negative integers')
    }
    const found = scan({ bufferViews: [view(0, 8), { buffer: 0, byteOffset: 8, byteLength: -8 }] })
    expect(messages(found)).toContain('byteOffset and byteLength must be non-negative integers')
  })

  it('SECURITY: an accessor that reads more than its view holds, and one that points nowhere', () => {
    expect(messages(scan({ accessors: [floats(0, 100), floats(1, 2)] }))).toEqual(['accessor reads 400 bytes but its bufferView holds 8'])
    expect(messages(scan({ accessors: [floats(0, 2), floats(1, 2, { byteOffset: 4 })] }))).toEqual(['accessor reads 12 bytes but its bufferView holds 8'])
    expect(messages(scan({ accessors: [floats(0, 2), floats(7, 2)] }))).toEqual([
      'accessor points at a bufferView that does not exist',
      'bufferView is not referenced by any accessor or image',
    ])
  })

  it('SECURITY: a view in a buffer that is never stored', () => {
    const found = scan({ bufferViews: [view(0, 8), { buffer: 1, byteOffset: 0, byteLength: 8 }] })
    expect(messages(found)).toContain('a bufferView must point at buffer 0; any other buffer is never stored')
  })

  it('SECURITY: a meshopt view nothing reads (the compressed source counts as referenced only through an accessor)', () => {
    const { json, bin } = parseGlb(committed(1))
    ;(json['accessors'] as unknown[]).pop()
    const found = scanGlb(packGlb(json, bin), 'g', 1)
    expect(messages(found)).toEqual(['POSITION is not the index of an existing accessor', 'bufferView is not referenced by any accessor or image'].sort())
    expect(found.find((x) => x.message === 'bufferView is not referenced by any accessor or image')?.subject).toContain('$.bufferViews[2]')
  })

  it('SECURITY: a meshopt view whose compressed bytes run past the buffer', () => {
    const { json, bin } = parseGlb(committed(1))
    const ext = (((json['bufferViews'] as Json[])[2] as Json)['extensions'] as Json)['EXT_meshopt_compression'] as Json
    const declared = ((json['buffers'] as Json[])[0] as Json)['byteLength']
    const end = (ext['byteOffset'] as number) + 10_000_000
    ext['byteLength'] = 10_000_000
    const found = scanGlb(packGlb(json, bin), 'g', 1)
    expect(messages(found)).toContain(`bufferView ends at ${end}, past the declared buffer of ${declared} bytes`)
    onlySecurity(found)
  })

  it('SECURITY: an image view that is a meshopt view (its bytes would be read from the wrong place)', () => {
    const { json, bin } = parseGlb(committed(1))
    json['images'] = [{ bufferView: 0, mimeType: 'image/webp' }]
    const found = scanGlb(packGlb(json, bin), 'g', 1)
    expect(messages(found)).toContain('image bufferView must be a plain stored view in buffer 0')
  })
})

// ---------------------------------------------------------------------------------------------
// A3: structural keys. Built from what the real pipeline emits, so legitimate output is never rejected.
// ---------------------------------------------------------------------------------------------

describe('A3: structural keys', () => {
  const tiers = { 2: null as Uint8Array | null, 3: null as Uint8Array | null }
  beforeAll(async () => {
    const tc = await loadToolchain()
    for (const tier of [2, 3] as const)
      tiers[tier] = (await buildVariant(tc, await richDoc(tier), { subject: 'kenney-like', tier, clips: [{ from: 'idle', as: 'idle' }] })).bytes
  }, 120_000)

  const kenney = (tier: 2 | 3): Uint8Array => tiers[tier] ?? new Uint8Array()
  const mutate = (bytes: Uint8Array, fn: (json: Json) => void): Uint8Array => {
    const { json, bin } = parseGlb(bytes)
    fn(json)
    return packGlb(json, bin)
  }
  const at = (json: Json, collection: string): Json[] => json[collection] as Json[]
  /** The textured material of the fixture: the pipeline may reorder materials, so find it by what it carries. */
  const bodyMaterial = (json: Json): Json => at(json, 'materials').find((m) => 'normalTexture' in m) ?? {}
  const bodyAt = (json: Json): number => at(json, 'materials').findIndex((m) => 'normalTexture' in m)

  it('never rejects what the pipeline writes: both committed GLBs and textured, animated, transmissive output', () => {
    expect(scanGlb(committed(1), 'gyroscope', 1)).toEqual([])
    expect(scanGlb(committed(2), 'gyroscope', 2)).toEqual([])
    expect(scanGlb(kenney(2), 'kenney-like', 2)).toEqual([])
    expect(scanGlb(kenney(3), 'kenney-like', 3)).toEqual([])
    const json = parseGlb(kenney(3)).json
    // The fixture really exercises every collection the allow-list covers.
    for (const c of ['accessors', 'bufferViews', 'buffers', 'images', 'textures', 'samplers', 'animations', 'materials', 'meshes', 'nodes', 'scenes'])
      expect(at(json, c).length, c).toBeGreaterThan(0)
    expect(JSON.stringify(json)).toMatch(/KHR_texture_transform/)
    expect(Object.keys(MODEL_BUDGETS)).toHaveLength(Object.keys(TIER_EXTENSIONS).length)
  })

  const collections = ['scenes', 'nodes', 'meshes', 'materials', 'accessors', 'bufferViews', 'buffers', 'images', 'textures', 'samplers', 'animations', 'skins'] as const
  it.each(collections)('SECURITY: an unknown key on %s[0]', (collection) => {
    const bytes = mutate(kenney(3), (json) => {
      json[collection] ??= [{}]
      ;(at(json, collection)[0] as Json)['bogus'] = 1
    })
    const found = scanGlb(bytes, 'g', 3)
    const hit = found.filter((x) => x.subject.endsWith(`$.${collection}[0].bogus`))
    expect(hit.map((x) => x.message)).toEqual(['key "bogus" is not allowed here'])
    onlySecurity(found)
  })

  it('SECURITY: unknown keys one level down (primitive, pbr, textureInfo, channel, target, sampler)', () => {
    const bytes = mutate(kenney(3), (json) => {
      const material = bodyMaterial(json)
      const prim = ((at(json, 'meshes')[0] as Json)['primitives'] as Json[])[0] as Json
      prim['bogus'] = 1
      ;(material['pbrMetallicRoughness'] as Json)['bogus'] = 1
      ;(material['normalTexture'] as Json)['bogus'] = 1
      const animation = at(json, 'animations')[0] as Json
      const channel = (animation['channels'] as Json[])[0] as Json
      channel['bogus'] = 1
      ;(channel['target'] as Json)['bogus'] = 1
      ;((animation['samplers'] as Json[])[0] as Json)['bogus'] = 1
    })
    const found = scanGlb(bytes, 'g', 3).map((x) => x.subject.replace(/^g /, ''))
    const m = bodyAt(parseGlb(bytes).json)
    expect(found.sort()).toEqual(
      [
        '$.meshes[0].primitives[0].bogus',
        `$.materials[${m}].pbrMetallicRoughness.bogus`,
        `$.materials[${m}].normalTexture.bogus`,
        '$.animations[0].channels[0].bogus',
        '$.animations[0].channels[0].target.bogus',
        '$.animations[0].samplers[0].bogus',
      ].sort(),
    )
  })

  it('SECURITY: unknown keys inside every allowed extension body', () => {
    const bytes = mutate(kenney(3), (json) => {
      const material = bodyMaterial(json)
      for (const ext of Object.values(material['extensions'] as Record<string, Json>)) ext['bogus'] = 1
      const body = (item: Json | undefined, ext: string): Json => ((item?.['extensions'] as Record<string, Json> | undefined)?.[ext] ?? {}) as Json
      body(at(json, 'textures')[0], 'EXT_texture_webp')['bogus'] = 1
      body(at(json, 'bufferViews').find((x) => 'extensions' in x), 'EXT_meshopt_compression')['bogus'] = 1
      body(at(json, 'buffers')[1], 'EXT_meshopt_compression')['bogus'] = 1
    })
    const found = scanGlb(bytes, 'g', 3).filter((x) => x.message === 'key "bogus" is not allowed here')
    expect(found).toHaveLength(6)
  })

  it('SECURITY: a known extension on the wrong kind of element', () => {
    const bytes = mutate(kenney(3), (json) => {
      ;(at(json, 'nodes')[0] as Json)['extensions'] = { EXT_texture_webp: { source: 0 } }
      ;(at(json, 'materials')[0] as Json)['extensions'] = { EXT_meshopt_compression: { fallback: true } }
    })
    expect(messages(scanGlb(bytes, 'g', 3)).filter((m) => /not valid on/.test(m))).toEqual([
      'extension EXT_meshopt_compression is not valid on materials',
      'extension EXT_texture_webp is not valid on nodes',
    ])
  })

  it.each([
    ['POSITION', true],
    ['NORMAL', true],
    ['TANGENT', true],
    ['TEXCOORD_0', true],
    ['COLOR_0', true],
    ['JOINTS_0', true],
    ['WEIGHTS_0', true],
    ['_CUSTOM', false],
    ['TEXCOORD_', false],
    ['TEXCOORD_10', false],
    ['position', false],
    ['POSITIONS', false],
    ['xPOSITION', false],
  ])('attribute key %s is allowed: %s', (key, allowed) => {
    const bytes = mutate(kenney(3), (json) => {
      const prim = ((at(json, 'meshes')[0] as Json)['primitives'] as Json[])[0] as Json
      ;(prim['attributes'] as Json)[key] = 0
      prim['targets'] = [{ [key]: 0 }]
    })
    const found = scanGlb(bytes, 'g', 3).filter((x) => /attribute "/.test(x.message))
    expect(found.length === 0).toBe(allowed)
  })

  it('SECURITY: asset.version must be "2.0"', () => {
    for (const version of ['1.0', 2, undefined]) {
      const bytes = mutate(kenney(3), (json) => void (json['asset'] = version === undefined ? {} : { version }))
      expect(messages(scanGlb(bytes, 'g', 3))).toEqual(['asset.version must be "2.0"'])
    }
    expect(messages(scanGlb(mutate(kenney(3), (json) => void (json['asset'] = 'x')), 'g', 3))).toContain('asset must be an object')
  })

  it('SECURITY: a non-object element is a finding, never a TypeError (L4: `name in 1` throws)', () => {
    for (const element of [1, null, 'x', [], true]) {
      const bytes = mutate(kenney(3), (json) => void (json['nodes'] = [element]))
      let found: Violation[] = []
      expect(() => (found = scanGlb(bytes, 'g', 3))).not.toThrow()
      expect(messages(found)).toContain('must be an object')
      expect(found.find((x) => x.message === 'must be an object')?.subject).toContain('$.nodes[0]')
    }
  })

  it('SECURITY: a collection that is not an array, and non-object primitives, channels and samplers', () => {
    expect(messages(scanGlb(mutate(kenney(3), (json) => void (json['nodes'] = 5)), 'g', 3))).toContain('must be an array')
    const bytes = mutate(kenney(3), (json) => {
      ;(at(json, 'meshes')[0] as Json)['primitives'] = [7]
      const animation = at(json, 'animations')[0] as Json
      animation['channels'] = [false]
      animation['samplers'] = [null]
    })
    const found = scanGlb(bytes, 'g', 3).filter((x) => x.message === 'must be an object')
    expect(found.map((x) => x.subject.replace(/^g /, '')).sort()).toEqual(
      ['$.animations[0].channels[0]', '$.animations[0].samplers[0]', '$.meshes[0].primitives[0]'].sort(),
    )
  })
})

// ---------------------------------------------------------------------------------------------
// A4: every path and PII pattern is pinned
// ---------------------------------------------------------------------------------------------

describe('A4: path and PII patterns', () => {
  const base = committed(1)
  const findingsFor = (value: string): string[] => {
    const { json, bin } = parseGlb(base)
    ;((json['nodes'] as Json[])[0] as Json)['name'] = value
    return scanGlb(packGlb(json, bin), 'g', 1)
      .map((x) => x.message)
      .filter((m) => m !== 'names must be stripped')
  }

  it.each([
    ['C:\\proj\\a.blend', ['contains a drive-letter path']],
    ['c:/proj/a.blend', ['contains a drive-letter path']],
    ['exportC:\\proj\\a.blend', ['contains a drive-letter path']],
    ['in D:/work', ['contains a drive-letter path']],
    ['(E:\\x)', ['contains a drive-letter path']],
    ['model-F:\\x', ['contains a drive-letter path']],
  ])('DRIVE_LETTER flags %s', (value, expected) => {
    expect(findingsFor(value)).toEqual(expected)
  })

  it.each([
    ['ratio 16:9', []],
    ['a:b', ['contains a URI scheme']],
    ['https://x', ['contains a URL that is not allow-listed', 'contains a URI scheme']],
    ['plain', []],
  ])('DRIVE_LETTER leaves %s alone', (value, expected) => {
    expect(findingsFor(value)).toEqual(expected)
    expect(findingsFor(value)).not.toContain('contains a drive-letter path')
  })

  it.each([
    ['/home/wiesl/x', 'contains a home-directory path'],
    ['/Users/wiesl/x', 'contains a home-directory path'],
    ['/USERS/wiesl/x', 'contains a home-directory path'],
    ['/root/x', 'contains a home-directory path'],
    ['/mnt/c/x', 'contains a home-directory path'],
    ['~/x', 'contains a home-directory path'],
    ['a\\Users\\x', 'contains a home-directory path'],
    ['%APPDATA%', 'contains an environment-variable path'],
    ['x%USERPROFILE%y', 'contains an environment-variable path'],
    ['\\\\server\\share', 'contains a UNC network path'],
    ['//cdn.example', 'contains a protocol-relative or network path'],
    ['me@example.com', 'contains an email address'],
    ['first.last+tag@sub.example.co.uk', 'contains an email address'],
    ['https://evil.example/a', 'contains a URL that is not allow-listed'],
    ['HTTP://evil.example/a', 'contains a URL that is not allow-listed'],
    ['ftp://evil.example/a', 'contains a URL that is not allow-listed'],
    ['file:///etc/passwd', 'contains a URL that is not allow-listed'],
    ['data:text/plain;base64,AAAA', 'contains a data: URI'],
    ['ssh:deploy', 'contains a URI scheme'],
  ])('%s is flagged: %s', (value, message) => {
    expect(findingsFor(value)).toContain(message)
  })

  it.each(['ordinary', 'a-b_c', '50%', '100% sure', 'user at example dot com', 'Users', 'home'])('%s is clean of path and PII findings', (value) => {
    expect(findingsFor(value)).toEqual([])
  })
})

describe('A4: WebP container sizes', () => {
  /** A RIFF/WEBP body from chunks; `riffSize` and `trailing` let a case lie about it. */
  function webp(chunks: [string, number][], opts: { riffSize?: number; trailing?: number[]; skipPad?: boolean; padByte?: number } = {}): Uint8Array {
    const body: number[] = [...Buffer.from('WEBP')]
    for (const [id, size] of chunks) {
      body.push(...Buffer.from(id), size & 255, (size >> 8) & 255, 0, 0, ...new Array<number>(size).fill(0))
      if (size % 2 && !opts.skipPad) body.push(opts.padByte ?? 0)
    }
    const riffSize = opts.riffSize ?? body.length
    return new Uint8Array([...Buffer.from('RIFF'), riffSize & 255, (riffSize >> 8) & 255, 0, 0, ...body, ...(opts.trailing ?? [])])
  }
  const glbWith = glbAroundImage
  const found = (image: Uint8Array) => messages(scanGlb(glbWith(image), 'x'))

  it('passes an exact container, with and without an odd chunk and its pad byte', () => {
    expect(found(webp([['VP8 ', 10]]))).toEqual([])
    expect(found(webp([['VP8 ', 11]]))).toEqual([])
    expect(found(webp([['VP8X', 10], ['ALPH', 4], ['VP8 ', 8]]))).toEqual([])
  })

  it('allows exactly one zero pad byte after the RIFF payload, and nothing else', () => {
    expect(found(webp([['VP8 ', 10]], { trailing: [0] }))).toEqual([])
    expect(found(webp([['VP8 ', 10]], { trailing: [7] }))).toEqual(['WebP container is malformed: a non-zero byte follows the RIFF payload'])
    expect(found(webp([['VP8 ', 10]], { trailing: [0, 0] }))[0]).toMatch(/^WebP container is malformed: RIFF size says \d+ B but the image is \d+ B$/)
  })

  it('SECURITY: bytes after the RIFF payload (a second file, or a hidden EXIF chunk the walk never reaches)', () => {
    const hidden = [...Buffer.from('EXIF'), 8, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]
    const found1 = found(webp([['VP8 ', 10]], { trailing: hidden }))
    expect(found1).toEqual([expect.stringMatching(/^WebP container is malformed: RIFF size says 30 B but the image is 46 B$/)])
  })

  it('SECURITY: a RIFF size larger than the view', () => {
    expect(found(webp([['VP8 ', 10]], { riffSize: 400 }))[0]).toMatch(/RIFF size says 408 B but the image is 30 B/)
  })

  it('SECURITY: a RIFF size smaller than the chunks, so a metadata chunk sits beyond the walk', () => {
    const image = webp([['VP8 ', 10], ['EXIF', 8]], { riffSize: 22 })
    expect(found(image)).toEqual(['WebP container is malformed: RIFF size says 30 B but the image is 46 B'])
  })

  it('SECURITY: a chunk whose size runs past the end, and a truncated chunk header', () => {
    const lying = webp([['VP8 ', 10]])
    new DataView(lying.buffer).setUint32(16, 400, true)
    expect(found(lying)).toEqual(['WebP container is malformed: chunk "VP8" runs past the end of the image'])

    const short = webp([['VP8 ', 10]], { riffSize: 30 + 3 - 8, trailing: [0, 0, 0] })
    expect(found(short)).toEqual(['WebP container is malformed: a truncated chunk header ends the image'])
  })

  const LAYOUT = 'WebP chunk layout is not one the encoder writes: '

  it('SECURITY: a simple WebP is one VP8 or VP8L chunk, so a second bitstream chunk is a finding', () => {
    const simple = `${LAYOUT}a simple WebP is one VP8 or VP8L chunk and nothing else`
    expect(found(webp([['VP8 ', 10], ['VP8L', 10]]))).toEqual([simple])
    expect(found(webp([['VP8L', 10], ['ALPH', 4]]))).toEqual([simple])
  })

  it('SECURITY: an extended WebP has at most one ALPH, one VP8X and exactly one bitstream chunk', () => {
    const exactlyOne = `${LAYOUT}an extended WebP needs exactly one VP8 or VP8L chunk`
    expect(found(webp([['VP8X', 10], ['ALPH', 4], ['VP8 ', 8]]))).toEqual([])
    expect(found(webp([['VP8X', 10], ['VP8L', 8]]))).toEqual([])
    expect(found(webp([['VP8X', 10], ['ALPH', 4], ['ALPH', 4], ['VP8 ', 8]]))).toEqual([`${LAYOUT}more than one ALPH chunk`])
    expect(found(webp([['VP8X', 10], ['ALPH', 4]]))).toEqual([exactlyOne])
    expect(found(webp([['VP8X', 10], ['VP8 ', 8], ['VP8L', 8]]))).toEqual([exactlyOne])
    expect(found(webp([['VP8X', 10], ['VP8X', 10], ['VP8 ', 8]]))).toEqual([`${LAYOUT}more than one VP8X chunk`])
  })

  it('SECURITY: the first chunk must be a VP8, VP8L or VP8X chunk', () => {
    expect(found(webp([['ALPH', 4], ['VP8 ', 8]]))).toEqual(
      [`${LAYOUT}the first chunk must be VP8, VP8L or VP8X`, `${LAYOUT}a simple WebP is one VP8 or VP8L chunk and nothing else`].sort(),
    )
    // No chunk at all is shorter than a RIFF header can be, so it is not recognised as a WebP in the first place.
    expect(found(webp([]))).toEqual(['declared as WebP but is not a RIFF/WEBP file'])
  })

  it('SECURITY: the pad byte after an odd-sized chunk is zero (it is a place to hide one byte per chunk)', () => {
    expect(found(webp([['VP8 ', 11]]))).toEqual([])
    expect(found(webp([['VP8 ', 11]], { padByte: 7 }))).toEqual(['WebP container is malformed: a non-zero pad byte follows chunk "VP8"'])
    expect(found(webp([['VP8X', 10], ['ALPH', 5], ['VP8 ', 8]], { padByte: 1 }))).toEqual(['WebP container is malformed: a non-zero pad byte follows chunk "ALPH"'])
  })

  it('inspectWebp: null for anything that is not RIFF/WEBP, a clean verdict for the real thing', () => {
    expect(inspectWebp(new Uint8Array(40))).toBeNull()
    expect(inspectWebp(webp([['VP8 ', 10]]))).toEqual({ chunks: ['VP8 '], problem: null })
  })

  it('accepts what sharp writes', async () => {
    const image = new Uint8Array(await sharp(Buffer.alloc(32 * 32 * 3, 90), { raw: { width: 32, height: 32, channels: 3 } }).webp().toBuffer())
    expect(inspectWebp(image)?.problem).toBeNull()
    expect(found(image)).toEqual([])
  })
})
