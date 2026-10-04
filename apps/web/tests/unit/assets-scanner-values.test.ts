// @vitest-environment node
/**
 * Round 2 of the scanner review: values and reachability, not only structure. Every test names the
 * rule it pins and asserts the exact message, so removing the rule fails it by name.
 */
import { describe, expect, it, beforeAll } from 'vitest'

import { buildVariant, loadToolchain, stripGlbMetadata } from '../../scripts/assets/pipeline'
import {
  GlbFormatError,
  elementBytes,
  MAX_ACCESSOR_COUNT,
  packGlb,
  parseGlb,
  printable,
  quote,
  scanGlb,
  type Violation,
} from '../../scripts/assets/validators'
import { type Json, binGlb, committedGlb, floats, rawGlb, richDoc, shorts, view } from './assets-fixtures'

/** Bytes per component, by componentType. */
const COMPONENT: Record<number, number> = { 5121: 1, 5123: 2, 5126: 4 }
const messages = (found: readonly Violation[]) => found.map((x) => x.message).sort()
const subjects = (found: readonly Violation[]) => found.map((x) => x.subject.replace(/^g /, '')).sort()
const onlySecurity = (found: readonly Violation[]) => expect(found.every((x) => x.code === 'SECURITY')).toBe(true)

const mutate = (bytes: Uint8Array, fn: (json: Json) => void): Uint8Array => {
  const { json, bin } = parseGlb(bytes)
  fn(json)
  return packGlb(json, bin)
}
const at = (json: Json, collection: string): Json[] => json[collection] as Json[]

// ---------------------------------------------------------------------------------------------
// A1: no pattern runs over a hostile string's length
// ---------------------------------------------------------------------------------------------

describe('A1: ReDoS and the length cap', () => {
  const gyroscope = committedGlb(1)
  const withName = (value: string, where: 'name' | 'key' = 'name'): Violation[] =>
    scanGlb(
      mutate(gyroscope, (json) => {
        const node = at(json, 'nodes')[0] as Json
        if (where === 'name') node['name'] = value
        else node[value] = 1
      }),
      'g',
      1,
    )

  it('scans a 100 000 character string with no "@" in well under a second (the old address pattern took 5.7 s at 80 000)', () => {
    const bytes = mutate(gyroscope, (json) => void ((at(json, 'nodes')[0] as Json)['name'] = 'a'.repeat(100_000)))
    const started = performance.now()
    const found = scanGlb(bytes, 'g', 1)
    expect(performance.now() - started).toBeLessThan(1_000)
    expect(messages(found)).toEqual(['names must be stripped', 'string is longer than 64 characters'])
  })

  it('scans a 100 000 character key, and a long run of "@", just as fast', () => {
    for (const hostile of ['x'.repeat(100_000), '@'.repeat(100_000), `${'a.'.repeat(50_000)}@`]) {
      const started = performance.now()
      const found = withName(hostile, 'key')
      expect(performance.now() - started).toBeLessThan(1_000)
      expect(messages(found)).toContain('string is longer than 64 characters')
    }
  })

  it('SECURITY: any string longer than 64 characters, and none of 64', () => {
    expect(messages(withName('a'.repeat(65)))).toEqual(['names must be stripped', 'string is longer than 64 characters'])
    expect(messages(withName('a'.repeat(64)))).toEqual(['names must be stripped'])
  })

  it('SECURITY: a long key is reported once, at a path that does not repeat it', () => {
    const found = withName('k'.repeat(300), 'key')
    expect(messages(found)).toContain('string is longer than 64 characters')
    expect(found.every((x) => x.subject.length < 200)).toBe(true)
  })

  it('SECURITY: an "@" anywhere is an address, however it is spelled', () => {
    for (const value of ['a@b', '@', 'x@y.z', 'name@localhost', 'a @ b'])
      expect(messages(withName(value)), value).toEqual(['contains an email address', 'names must be stripped'])
    expect(messages(withName('user at example dot com'))).toEqual(['names must be stripped'])
  })
})

// ---------------------------------------------------------------------------------------------
// A2: reachability and slack
// ---------------------------------------------------------------------------------------------

describe('A2: everything is read by something', () => {
  const scan = (spec?: Parameters<typeof binGlb>[0]) => scanGlb(binGlb(spec), 'g')
  const tiers = { 3: null as Uint8Array | null }
  beforeAll(async () => {
    const tc = await loadToolchain()
    tiers[3] = (await buildVariant(tc, await richDoc(3), { subject: 'rich', tier: 3, clips: [{ from: 'idle', as: 'idle' }] })).bytes
  }, 120_000)
  const rich = (fn: (json: Json) => void): Violation[] => scanGlb(mutate(tiers[3] ?? new Uint8Array(), fn), 'g', 3)

  it('passes the real pipeline output that uses every collection', () => {
    expect(scanGlb(tiers[3] ?? new Uint8Array(), 'rich', 3)).toEqual([])
  })

  it('SECURITY: a node, mesh, material, texture, sampler and image that no scene reaches', () => {
    const found = rich((json) => {
      at(json, 'nodes').push({})
      at(json, 'meshes').push({ primitives: [] })
      at(json, 'materials').push({})
      at(json, 'textures').push({ source: 0 })
      at(json, 'samplers').push({})
      // A second image on the first image's view: only the missing texture is wrong with it.
      at(json, 'images').push({ bufferView: (at(json, 'images')[0] as Json)['bufferView'], mimeType: 'image/webp' })
    })
    expect(found.map((x) => `${x.subject.replace(/^g /, '')}: ${x.message}`).sort()).toEqual(
      [
        `$.images[${at(parseGlb(tiers[3] ?? new Uint8Array()).json, 'images').length}]: image is not reachable from any scene`,
        `$.materials[2]: material is not reachable from any scene`,
        `$.meshes[2]: mesh is not reachable from any scene`,
        `$.nodes[4]: node is not reachable from any scene`,
        `$.samplers[1]: sampler is not reachable from any scene`,
        `$.textures[2]: texture is not reachable from any scene`,
      ].sort(),
    )
    onlySecurity(found)
  })

  it('SECURITY: a skin no node uses', () => {
    const found = rich((json) => void (json['skins'] = [{ joints: [0] }]))
    expect(messages(found)).toEqual(['skin is not reachable from any scene'])
  })

  it('SECURITY: a node cycle, and a node with two parents', () => {
    const cycle = scanGlb(
      packGlb({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], nodes: [{ children: [1] }, { children: [0] }] }, null),
      'g',
    )
    expect(cycle.map((x) => `${x.subject.replace(/^g /, '')}: ${x.message}`).sort()).toEqual(
      [
        '$.nodes[0]: node hierarchy has a cycle',
        '$.nodes[0]: node is not reachable from any scene',
        '$.nodes[1]: node is not reachable from any scene',
      ].sort(),
    )
    const twice = scanGlb(
      packGlb({ asset: { version: '2.0' }, scenes: [{ nodes: [0, 1] }], nodes: [{ children: [2] }, { children: [2] }, {}] }, null),
      'g',
    )
    expect(messages(twice)).toEqual(['node has more than one parent'])
    const root = scanGlb(
      packGlb({ asset: { version: '2.0' }, scenes: [{ nodes: [0, 1] }], nodes: [{ children: [1] }, {}] }, null),
      'g',
    )
    expect(messages(root)).toEqual(['node has more than one parent'])
  })

  it('SECURITY: a scene index that is out of range, fractional or negative', () => {
    for (const scene of [1, -1, 0.5, '0']) {
      const found = rich((json) => void (json['scene'] = scene))
      expect(messages(found), String(scene)).toEqual(['scene is not the index of an existing scene'])
    }
    expect(rich((json) => void (json['scene'] = 0))).toEqual([])
  })

  it('SECURITY: an accessor that nothing reads, with or without a bufferView', () => {
    const found = rich((json) => {
      at(json, 'accessors').push({ componentType: 5126, count: 3, type: 'SCALAR' })
      at(json, 'accessors').push({ ...(at(json, 'accessors')[0] as Json) })
    })
    expect(messages(found)).toEqual(Array(2).fill('accessor is not used by any mesh primitive, animation sampler or skin'))
    const first = at(parseGlb(tiers[3] ?? new Uint8Array()).json, 'accessors').length
    expect(subjects(found)).toEqual([`$.accessors[${first}]`, `$.accessors[${first + 1}]`].sort())
  })

  it('SECURITY: an index into a collection that does not have it', () => {
    const found = rich((json) => {
      ;((at(json, 'nodes')[3] as Json)['mesh'] as unknown) = 99
      const prim = ((at(json, 'meshes')[0] as Json)['primitives'] as Json[])[0] as Json
      prim['material'] = 99
      prim['indices'] = 99
      ;(at(json, 'textures')[0] as Json)['sampler'] = 99
      ;((at(json, 'images')[0] as Json)['bufferView'] as unknown) = 99
    })
    expect(messages(found)).toEqual(
      expect.arrayContaining([
        'mesh is not the index of an existing mesh',
        'material is not the index of an existing material',
        'indices is not the index of an existing accessor',
        'sampler is not the index of an existing sampler',
        'bufferView is not the index of an existing bufferView',
      ]),
    )
  })

  it('SECURITY: an image reached through no texture is data nobody asked for', () => {
    const found = rich((json) => void (at(json, 'textures').length = 0))
    expect(messages(found)).toEqual(
      expect.arrayContaining(['image is not reachable from any scene', 'sampler is not reachable from any scene']),
    )
  })

  describe('plain bufferViews are tiled exactly by their accessors', () => {
    const tile = (viewLength: number, accessors: Json[], patch?: Record<number, number>, byteStride?: number) =>
      messages(scan({ bufferViews: [view(0, viewLength, byteStride === undefined ? {} : { byteStride })], accessors, binLength: viewLength, patch }))
    const f = (count: number, more: Json = {}) => ({ bufferView: 0, componentType: 5126, count, type: 'SCALAR', ...more })
    const vec3 = (count: number, more: Json = {}) => ({ bufferView: 0, componentType: 5126, count, type: 'VEC3', ...more })

    it('passes a view that is its accessors end to end, with or without the alignment padding', () => {
      expect(tile(8, [f(2)])).toEqual([])
      expect(tile(12, [f(1), f(2, { byteOffset: 4 })])).toEqual([])
      expect(tile(8, [shorts(0, 3)])).toEqual([])
      expect(tile(6, [shorts(0, 3)])).toEqual([])
      // Two accessors sharing the same bytes read one tight run.
      expect(tile(8, [f(2), f(2)])).toEqual([])
      // A 6 byte run, 2 bytes of zero alignment, then a 4 byte float.
      expect(tile(12, [shorts(0, 3), f(1, { byteOffset: 8 })])).toEqual([])
    })

    it('SECURITY: bytes in front of the first accessor (a head gap)', () => {
      expect(tile(100_008, [f(2, { byteOffset: 100_000 })])).toEqual(['bufferView has 100000 unread bytes at offset 0 where 0 bytes of alignment are expected'])
    })

    it('SECURITY: a stride that leaves gaps between elements (VEC3 float with byteStride 252)', () => {
      expect(tile(264, [vec3(2)], undefined, 252)).toEqual(['a plain bufferView must be tightly packed: byteStride 252 is not the 12 byte element'])
    })

    it('SECURITY: bytes after the last accessor', () => {
      expect(tile(16, [f(2)])).toEqual(['bufferView has 8 unread bytes after its last accessor where 0 or 0 bytes of alignment are expected'])
      expect(tile(11, [f(2)])).toEqual(['bufferView has 3 unread bytes after its last accessor where 0 or 0 bytes of alignment are expected'])
      expect(tile(10, [shorts(0, 3)])).toEqual(['bufferView has 4 unread bytes after its last accessor where 0 or 2 bytes of alignment are expected'])
    })

    it('SECURITY: a non-zero byte in the alignment slack, and in the padding between accessors', () => {
      expect(tile(8, [shorts(0, 3)], { 6: 1 })).toEqual(['bufferView padding at offset 6 is not zero'])
      expect(tile(12, [shorts(0, 3), f(1, { byteOffset: 8 })], { 7: 9 })).toEqual(['bufferView padding at offset 6 is not zero'])
    })

    it('SECURITY: two accessors sharing a view with a gap between them', () => {
      expect(tile(24, [f(2), f(2, { byteOffset: 16 })])).toEqual(['bufferView has 8 unread bytes at offset 8 where 0 bytes of alignment are expected'])
    })

    it('SECURITY: accessors that partly overlap', () => {
      expect(tile(12, [f(2), f(2, { byteOffset: 4 })])).toEqual(['accessors overlap at offset 4 inside the bufferView'])
    })

    it('does not apply to a meshopt view, whose length is the decoded size', () => {
      expect(scanGlb(committedGlb(1), 'g', 1)).toEqual([])
    })
  })

  describe('element sizes, with matrix column padding', () => {
    it.each([
      [5126, 'SCALAR', 4],
      [5126, 'VEC3', 12],
      [5123, 'VEC3', 6],
      [5126, 'MAT4', 64],
      [5126, 'MAT3', 36],
      [5121, 'MAT2', 8],
      [5121, 'MAT3', 12],
      [5121, 'MAT4', 16],
      [5123, 'MAT2', 8],
      [5123, 'MAT3', 24],
      [5123, 'MAT4', 32],
    ])('componentType %i %s is %i bytes', (componentType, type, bytes) => {
      expect(elementBytes(COMPONENT[componentType] ?? 0, type)).toBe(bytes)
    })

    it('a MAT3 of unsigned bytes needs 12 bytes an element, so a tight 9 byte view is short', () => {
      const mat = { bufferView: 0, componentType: 5121, count: 1, type: 'MAT3' }
      expect(messages(scan({ bufferViews: [view(0, 12)], accessors: [mat], binLength: 12 }))).toEqual([])
      expect(messages(scan({ bufferViews: [view(0, 9)], accessors: [mat], binLength: 12 }))).toEqual(['accessor reads 12 bytes but its bufferView holds 9'])
    })
  })

  describe('byteStride', () => {
    const vec3 = { bufferView: 0, componentType: 5126, count: 2, type: 'VEC3' }
    const withStride = (byteStride: unknown, length = 36) =>
      messages(scan({ bufferViews: [view(0, length, { byteStride })], accessors: [vec3], binLength: length }))
    const BAD = 'byteStride must be 0, or a multiple of 4 from 4 to 252'

    it('SECURITY: anything but 0, or a multiple of 4 from 4 to 252', () => {
      for (const bad of [1, 2, 3, 6, 250, 256, 255, -4, 4.5, '12', null]) expect(withStride(bad), String(bad)).toContain(BAD)
    })

    it('accepts 0 (tightly packed, which must not read as a zero stride) and the element size', () => {
      expect(withStride(0, 24)).toEqual([])
      expect(withStride(12, 24)).toEqual([])
    })

    it('SECURITY: a stride smaller than the element it strides over', () => {
      expect(withStride(4, 12)).toContain('byteStride 4 is smaller than the 12 byte element')
    })
  })
})

// ---------------------------------------------------------------------------------------------
// A3: zero padding
// ---------------------------------------------------------------------------------------------

describe('A3: padding is exactly the alignment, and it is zero', () => {
  const scan = (spec: Parameters<typeof binGlb>[0]) => messages(scanGlb(binGlb(spec), 'g'))

  it('passes the committed models, whose padding is zero', () => {
    expect(scanGlb(committedGlb(1), 'g', 1)).toEqual([])
    expect(scanGlb(committedGlb(2), 'g', 2)).toEqual([])
  })

  it('SECURITY: a gap that is not the padding to the next 4 byte boundary', () => {
    // The first view ends at 6, so 2 bytes of padding are expected; 3 are there.
    const views = [view(0, 6), view(9, 7)]
    const accessors = [shorts(0, 3), { bufferView: 1, componentType: 5121, count: 7, type: 'SCALAR' }]
    expect(scan({ bufferViews: views, accessors, binLength: 16 })).toEqual([
      'binary chunk has a 3 byte gap at offset 6 where 2 bytes of alignment are expected',
    ])
    // Aligned already, yet a byte of gap: 1 is there, 0 expected.
    expect(scan({ bufferViews: [view(0, 8), view(9, 7)], accessors: [floats(0, 2), { bufferView: 1, componentType: 5121, count: 7, type: 'SCALAR' }], binLength: 16 })).toEqual([
      'binary chunk has a 1 byte gap at offset 8 where 0 bytes of alignment are expected',
    ])
  })

  it('SECURITY: a padding byte between views that is not zero', () => {
    const views = [view(0, 6), view(8, 8)]
    const accessors = [shorts(0, 3), floats(1, 2)]
    expect(scan({ bufferViews: views, accessors, binLength: 16 })).toEqual([])
    expect(scan({ bufferViews: views, accessors, binLength: 16, patch: { 6: 0x41 } })).toEqual([
      'binary chunk bytes between views at offset 6 are not zero',
    ])
    expect(scan({ bufferViews: views, accessors, binLength: 16, patch: { 7: 1 } })).toEqual([
      'binary chunk bytes between views at offset 6 are not zero',
    ])
  })

  it('SECURITY: a byte after the last view, up to the declared length, that is not zero', () => {
    const views = [view(0, 8), view(8, 6)]
    const accessors = [floats(0, 2), shorts(1, 3)]
    expect(scan({ bufferViews: views, accessors, binLength: 16 })).toEqual([])
    expect(scan({ bufferViews: views, accessors, binLength: 16, patch: { 15: 9 } })).toEqual([
      'binary chunk bytes after the last view, from offset 14, are not zero',
    ])
    expect(scan({ bufferViews: views, accessors, binLength: 16, patch: { 14: 9 } })).toEqual([
      'binary chunk bytes after the last view, from offset 14, are not zero',
    ])
  })

  it('SECURITY: bytes in front of the first view', () => {
    const accessors = [floats(0, 2), shorts(1, 2)]
    expect(scan({ bufferViews: [view(2, 8), view(12, 4)], accessors, binLength: 16, patch: { 0: 1 } })).toEqual(
      ['binary chunk has a 2 byte gap at offset 0 where 0 bytes of alignment are expected', 'binary chunk bytes between views at offset 0 are not zero'].sort(),
    )
    expect(scan({ bufferViews: [view(4, 8), view(12, 4)], accessors: [floats(0, 2), floats(1, 1)], binLength: 16, patch: { 3: 1 } })).toEqual(
      ['binary chunk has an unreferenced gap of 4 bytes at offset 0', 'binary chunk bytes between views at offset 0 are not zero'].sort(),
    )
  })
})

// ---------------------------------------------------------------------------------------------
// A4: typed values
// ---------------------------------------------------------------------------------------------

describe('A4: values', () => {
  let rich: Uint8Array = new Uint8Array()
  beforeAll(async () => {
    const tc = await loadToolchain()
    rich = (await buildVariant(tc, await richDoc(3), { subject: 'rich', tier: 3, clips: [{ from: 'idle', as: 'idle' }] })).bytes
  }, 120_000)
  const found = (fn: (json: Json) => void): Violation[] => scanGlb(mutate(rich, fn), 'g', 3)
  const body = (json: Json): Json => at(json, 'materials').find((m) => 'normalTexture' in m) ?? {}
  const pbr = (json: Json): Json => body(json)['pbrMetallicRoughness'] as Json
  const prim = (json: Json): Json => ((at(json, 'meshes')[0] as Json)['primitives'] as Json[])[0] as Json
  const sampler = (json: Json): Json => ((at(json, 'animations')[0] as Json)['samplers'] as Json[])[0] as Json
  const channel = (json: Json): Json => ((at(json, 'animations')[0] as Json)['channels'] as Json[])[0] as Json

  it('passes the unchanged file, which is built through the real pipeline', () => {
    expect(scanGlb(rich, 'rich', 3)).toEqual([])
  })

  describe('enums', () => {
    const UNKNOWN_ACCESSOR = 'accessor needs a known type and componentType, a positive integer count and a non-negative integer byteOffset'
    const cases: [string, (json: Json) => void, string | string[]][] = [
      ['alphaMode', (j) => void (body(j)['alphaMode'] = 'BLENDED'), 'alphaMode must be one of OPAQUE, MASK, BLEND'],
      ['interpolation', (j) => void (sampler(j)['interpolation'] = 'SMOOTH'), 'interpolation must be one of LINEAR, STEP, CUBICSPLINE'],
      ['animation path', (j) => void ((channel(j)['target'] as Json)['path'] = 'color'), 'path must be one of translation, rotation, scale, weights'],
      ['accessor type', (j) => void ((at(j, 'accessors')[4] as Json)['type'] = 'VEC5'), [UNKNOWN_ACCESSOR, 'type must be one of SCALAR, VEC2, VEC3, VEC4, MAT2, MAT3, MAT4']],
      ['accessor componentType', (j) => void ((at(j, 'accessors')[4] as Json)['componentType'] = 5124), [UNKNOWN_ACCESSOR, 'componentType must be one of 5120, 5121, 5122, 5123, 5125, 5126']],
      ['image mimeType', (j) => void ((at(j, 'images')[0] as Json)['mimeType'] = 'image/png'), 'mimeType must be "image/webp"'],
      ['primitive mode', (j) => void (prim(j)['mode'] = 7), 'mode must be one of 0, 1, 2, 3, 4, 5, 6'],
      ['sampler wrapS', (j) => void ((at(j, 'samplers')[0] as Json)['wrapS'] = 1), 'wrapS must be one of 33071, 33648, 10497'],
      ['sampler minFilter', (j) => void ((at(j, 'samplers')[0] as Json)['minFilter'] = 1), 'minFilter must be one of 9728, 9729, 9984, 9985, 9986, 9987'],
      ['bufferView target', (j) => void ((at(j, 'bufferViews')[3] as Json)['target'] = 1), 'target must be one of 34962, 34963'],
    ]
    it.each(cases)('SECURITY: a bad %s', (_label, change, message) => {
      const out = found(change)
      expect(messages(out)).toEqual([message].flat().sort())
      onlySecurity(out)
    })

    const meshopt = (json: Json): Json => {
      const withExtension = at(json, 'bufferViews').find((x) => 'extensions' in x) as Json
      return (withExtension['extensions'] as Record<string, Json>)['EXT_meshopt_compression'] as Json
    }
    it('SECURITY: a bad meshopt mode or filter, and a missing mode', () => {
      expect(messages(found((j) => void (meshopt(j)['mode'] = 'TRIANGLE')))).toEqual(['mode must be one of ATTRIBUTES, TRIANGLES, INDICES'])
      expect(messages(found((j) => void (meshopt(j)['filter'] = 'ROTATE')))).toEqual(['filter must be one of NONE, OCTAHEDRAL, QUATERNION, EXPONENTIAL'])
      expect(messages(found((j) => void delete meshopt(j)['mode']))).toEqual(['mode is required'])
    })
  })

  describe('exact array lengths and finite numbers', () => {
    const cases: [string, (json: Json) => void, string][] = [
      ['translation of 2', (j) => void ((at(j, 'nodes')[0] as Json)['translation'] = [1, 2]), 'translation must be 3 finite numbers'],
      ['rotation of 3', (j) => void ((at(j, 'nodes')[0] as Json)['rotation'] = [0, 0, 1]), 'rotation must be 4 finite numbers'],
      ['scale of 4', (j) => void ((at(j, 'nodes')[0] as Json)['scale'] = [1, 1, 1, 1]), 'scale must be 3 finite numbers'],
      ['matrix of 15', (j) => void ((at(j, 'nodes')[1] as Json)['matrix'] = new Array<number>(15).fill(0)), 'matrix must be 16 finite numbers'],
      ['baseColorFactor of 3', (j) => void (pbr(j)['baseColorFactor'] = [1, 1, 1]), 'baseColorFactor must be 4 finite numbers'],
      ['emissiveFactor of 4', (j) => void (body(j)['emissiveFactor'] = [1, 0, 0, 1]), 'emissiveFactor must be 3 finite numbers'],
      ['a string in a factor', (j) => void (body(j)['emissiveFactor'] = [1, '0', 0]), 'emissiveFactor must be 3 finite numbers'],
      ['a null in a factor', (j) => void (body(j)['emissiveFactor'] = [1, null, 0]), 'emissiveFactor must be 3 finite numbers'],
      ['a string metallicFactor', (j) => void (pbr(j)['metallicFactor'] = 'high'), 'metallicFactor must be a finite number'],
      ['a non-boolean doubleSided', (j) => void (body(j)['doubleSided'] = 1), 'doubleSided must be true or false'],
      ['min shorter than the type', (j) => void ((at(j, 'accessors')[4] as Json)['min'] = [0, 0]), 'min must be 3 finite numbers'],
      ['max longer than the type', (j) => void ((at(j, 'accessors')[0] as Json)['max'] = [2, 2]), 'max must be 1 finite numbers'],
      ['weights that are not numbers', (j) => void ((at(j, 'meshes')[0] as Json)['weights'] = ['x']), 'weights must be finite numbers'],
    ]
    it.each(cases)('SECURITY: %s', (_label, change, message) => {
      const out = found(change)
      expect(messages(out)).toEqual([message])
      onlySecurity(out)
    })

    it('SECURITY: a number that parses to Infinity (1e999)', () => {
      const { json, bin } = parseGlb(rich)
      const text = JSON.stringify(json).replace('"metallicFactor":0.5', '"metallicFactor":1e999')
      expect(text).toContain('1e999')
      const out = scanGlb(rawGlb(text, bin), 'g', 3)
      expect(messages(out)).toEqual(
        ['GLB is not in canonical form (duplicate keys, extra whitespace or non-canonical JSON)', 'metallicFactor must be a finite number'].sort(),
      )
    })

    it('SECURITY: texture transform values', () => {
      const info = (j: Json): Json => (pbr(j)['baseColorTexture'] as Json)['extensions'] as Json
      expect(messages(found((j) => void ((info(j)['KHR_texture_transform'] as Json)['offset'] = [0])))).toEqual(['offset must be 2 finite numbers'])
      expect(messages(found((j) => void ((info(j)['KHR_texture_transform'] as Json)['rotation'] = 'x')))).toEqual(['rotation must be a finite number'])
    })
  })

  describe('integer indices', () => {
    const cases: [string, (json: Json) => void, string][] = [
      ['a fractional node.mesh', (j) => void ((at(j, 'nodes')[3] as Json)['mesh'] = 0.5), 'mesh is not the index of an existing mesh'],
      ['a negative texture source', (j) => void ((at(j, 'textures')[0] as Json)['extensions'] = { EXT_texture_webp: { source: -1 } }), 'source is not the index of an existing image'],
      ['a string material', (j) => void (prim(j)['material'] = '0'), 'material is not the index of an existing material'],
      ['a texture index past the end', (j) => void ((body(j)['normalTexture'] as Json)['index'] = 9), 'index is not the index of an existing texture'],
      ['a scene node past the end', (j) => void ((at(j, 'scenes')[0] as Json)['nodes'] = [2, 1, 99]), 'entry is not the index of an existing node'],
      ['a fractional texCoord', (j) => void ((body(j)['normalTexture'] as Json)['texCoord'] = 0.5), 'texCoord must be a non-negative integer'],
    ]
    it.each(cases)('SECURITY: %s', (_label, change, message) => {
      expect(messages(found(change))).toContain(message)
    })
  })

  describe('accessors without a bufferView are validated too', () => {
    const lone = (extra: Json): Violation[] =>
      found((j) => {
        const accessor = { componentType: 5126, count: 4, type: 'SCALAR', ...extra }
        at(j, 'accessors').push(accessor)
        ;(prim(j)['attributes'] as Json)['TEXCOORD_1'] = at(j, 'accessors').length - 1
      })

    it('passes a well-formed zero accessor', () => {
      expect(lone({})).toEqual([])
    })

    it('SECURITY: an unknown type, a zero or fractional count, an oversized count, and bad min/max', () => {
      expect(messages(lone({ type: 'VEC9' }))).toEqual([
        'accessor needs a known type and componentType, a positive integer count and a non-negative integer byteOffset',
        'type must be one of SCALAR, VEC2, VEC3, VEC4, MAT2, MAT3, MAT4',
      ].sort())
      expect(messages(lone({ count: 0 }))).toEqual(['accessor needs a known type and componentType, a positive integer count and a non-negative integer byteOffset'])
      expect(messages(lone({ count: 2.5 }))).toEqual(['accessor needs a known type and componentType, a positive integer count and a non-negative integer byteOffset'])
      expect(messages(lone({ count: MAX_ACCESSOR_COUNT + 1 }))).toEqual([`count is over the ${MAX_ACCESSOR_COUNT} element cap`])
      expect(lone({ count: MAX_ACCESSOR_COUNT })).toEqual([])
      expect(messages(lone({ min: [0, 0] }))).toEqual(['min must be 1 finite numbers'])
    })

    it('SECURITY: a byteOffset that is not a multiple of the component size', () => {
      const out = found((j) => void ((at(j, 'accessors')[4] as Json)['byteOffset'] = 1))
      expect(messages(out)).toContain('byteOffset must be a multiple of the component size')
    })
  })

  describe('extensionsUsed', () => {
    const used = (json: Json): string[] => json['extensionsUsed'] as string[]

    it('SECURITY: unsorted', () => {
      expect(messages(found((j) => void used(j).reverse()))).toEqual(['extensionsUsed must be sorted and have no duplicates'])
    })

    it('SECURITY: a duplicate', () => {
      expect(messages(found((j) => void used(j).splice(1, 0, used(j)[0] as string)))).toEqual(['extensionsUsed must be sorted and have no duplicates'])
    })

    it('SECURITY: an extension declared that nothing uses (the derived set is the declared set)', () => {
      const gone = found((j) => {
        delete ((at(j, 'materials').find((m) => 'normalTexture' in m) as Json)['extensions'] as Json)['KHR_materials_volume']
      })
      expect(messages(gone)).toEqual(['extension KHR_materials_volume is declared in extensionsUsed but nothing in the file uses it'])
    })

    it('allows KHR_mesh_quantization, which has no element of its own', () => {
      expect(used(parseGlb(rich).json)).toContain('KHR_mesh_quantization')
      expect(scanGlb(rich, 'g', 3)).toEqual([])
    })

    it('SECURITY: an extension required but not used', () => {
      const out = found((j) => void (j['extensionsRequired'] = ['EXT_meshopt_compression', 'KHR_materials_clearcoat']))
      expect(messages(out)).toEqual(['extension KHR_materials_clearcoat is not on the allow-list (Draco and KTX2 are rejected for now)'])
      const subset = found((j) => void (j['extensionsUsed'] = used(j).filter((e) => e !== 'KHR_mesh_quantization')))
      expect(messages(subset)).toEqual(['extension KHR_mesh_quantization is required but not listed in extensionsUsed'])
    })
  })

  it('SECURITY: asset.version stays "2.0"', () => {
    expect(messages(found((j) => void ((j['asset'] as Json)['version'] = '2.1')))).toEqual(['asset.version must be "2.0"'])
  })

  it('SECURITY: a keyframe input that is not SCALAR floats, and an output of the wrong width for its path', () => {
    const input = found((j) => void ((at(j, 'accessors')[0] as Json)['type'] = 'VEC2'))
    expect(messages(input)).toContain('keyframe times must be a SCALAR accessor of floats')
    const output = found((j) => void ((channel(j)['target'] as Json)['path'] = 'rotation'))
    expect(messages(output)).toEqual(['path rotation needs an output accessor of 4 components per key'])
  })
})

// ---------------------------------------------------------------------------------------------
// A5: what is cheap to check about a meshopt view
// ---------------------------------------------------------------------------------------------

describe('A5: meshopt views', () => {
  const gyroscope = committedGlb(1)
  const viewAt = (json: Json, i: number): Json => at(json, 'bufferViews')[i] as Json
  const ext = (json: Json, i = 0): Json => (viewAt(json, i)['extensions'] as Record<string, Json>)['EXT_meshopt_compression'] as Json
  const found = (fn: (json: Json) => void) => scanGlb(mutate(gyroscope, fn), 'g', 1)

  it('passes the committed file, where count * byteStride is the view length for every view', () => {
    const { json } = parseGlb(gyroscope)
    for (let i = 0; i < at(json, 'bufferViews').length; i++)
      expect((ext(json, i)['count'] as number) * (ext(json, i)['byteStride'] as number)).toBe(viewAt(json, i)['byteLength'])
    expect(scanGlb(gyroscope, 'g', 1)).toEqual([])
  })

  it('SECURITY: count * byteStride that is not the view byteLength (what the decoder allocates must be what the view says)', () => {
    const { json } = parseGlb(gyroscope)
    const length = viewAt(json, 0)['byteLength']
    const count = (ext(json)['count'] as number) + 1
    expect(messages(found((j) => void (ext(j)['count'] = count)))).toEqual([
      `count ${count} x byteStride 2 is not the view byteLength ${String(length)}`,
    ])
  })

  it('SECURITY: a count or byteStride that is not a positive integer', () => {
    for (const bad of [0, -2, 1.5, '2', null, Infinity]) {
      expect(messages(found((j) => void (ext(j)['byteStride'] = bad))), String(bad)).toEqual(['count and byteStride must be positive integers'])
      expect(messages(found((j) => void (ext(j)['count'] = bad))), String(bad)).toEqual(['count and byteStride must be positive integers'])
    }
  })

  it('SECURITY: a meshopt view that points at buffer 0, or at no buffer, instead of the fallback buffer', () => {
    const message = 'a meshopt bufferView must point at the fallback buffer, not at buffer 0'
    expect(messages(found((j) => void (viewAt(j, 0)['buffer'] = 0)))).toEqual([message])
    expect(messages(found((j) => void delete viewAt(j, 0)['buffer']))).toEqual([message])
    expect(found((j) => void (viewAt(j, 0)['buffer'] = 1))).toEqual([])
  })

  it('SECURITY: compressed bytes that live anywhere but buffer 0', () => {
    const message = 'compressed bytes must live in buffer 0'
    expect(messages(found((j) => void (ext(j)['buffer'] = 1)))).toEqual([message])
    expect(messages(found((j) => void delete ext(j)['buffer']))).toEqual([message])
  })

  it('SECURITY: views that together decode to more than 32 MiB (a decompression bomb in a 400 kB file)', () => {
    const out = found((j) => {
      for (const i of [0, 1, 2]) {
        viewAt(j, i)['byteLength'] = 16_000_000
        ext(j, i)['count'] = 16_000_000 / (ext(j, i)['byteStride'] as number)
      }
    })
    expect(messages(out)).toContain('views decode to 48000000 bytes, over the 33554432 byte cap')
  })
})

// ---------------------------------------------------------------------------------------------
// A6: smaller findings
// ---------------------------------------------------------------------------------------------

describe('A6: smaller findings', () => {
  const gyroscope = committedGlb(1)
  const named = (value: string): string[] =>
    scanGlb(mutate(gyroscope, (j) => void ((at(j, 'nodes')[0] as Json)['name'] = value)), 'g', 1)
      .map((x) => x.message)
      .filter((m) => m !== 'names must be stripped')

  it('stores ranges are checked even when there is no binary chunk', () => {
    const bytes = packGlb(
      {
        asset: { version: '2.0' },
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        accessors: [floats(0, 2)],
        bufferViews: [view(0, 8)],
        buffers: [{ byteLength: 0 }],
      },
      null,
    )
    expect(messages(scanGlb(bytes, 'g'))).toEqual(
      ['bufferView ends at 8, past the 0 byte binary chunk', 'bufferView ends at 8, past the declared buffer of 0 bytes'].sort(),
    )
  })

  it('DRIVE_LETTER: catches C://x and C:/x, and still leaves https:// and ftp:// alone', () => {
    for (const value of ['C://x', 'c://x', 'D:/work', 'C:\\x', 'in E://share']) expect(named(value), value).toEqual(['contains a drive-letter path'])
    expect(named('https://x')).toEqual(['contains a URL that is not allow-listed', 'contains a URI scheme'])
    expect(named('ftp://x')).toEqual(['contains a URL that is not allow-listed', 'contains a URI scheme'])
    expect(named('ratio 16:9')).toEqual([])
  })

  it('a key cannot forge a workflow command: findings never carry a raw newline or the key itself', () => {
    const key = '\n::warning::forged'
    const out = scanGlb(mutate(gyroscope, (j) => void ((at(j, 'nodes')[0] as Json)[key] = 1)), 'g', 1)
    expect(out.length).toBeGreaterThan(0)
    for (const x of out) expect(`${x.subject}${x.message}`).not.toMatch(/[\n\r]/)
    expect(out.map((x) => x.message)).toContain('key "\\n::warning::forged" is not allowed here')
    expect(subjects(out)).toContain('$.nodes[0]["\\n::warning::forged"]')
  })

  it('printable() turns every control character and line break into a space', () => {
    expect(printable('a\n::warning::b\r\u001b[31m\u2028end\u007f')).toBe('a ::warning::b  [31m end ')
    expect(printable('plain text 123')).toBe('plain text 123')
  })

  it('quote() escapes and cuts at 80 characters', () => {
    expect(quote('a\nb')).toBe('"a\\nb"')
    expect(quote('x'.repeat(500))).toHaveLength(80)
  })

  describe('deep nesting is a finding, not a RangeError', () => {
    const deep = (levels: number): string => `{"asset":{"version":"2.0"},"scenes":${'['.repeat(levels)}${']'.repeat(levels)}}`

    it('scanGlb refuses a file nested past 64 levels, however deep', () => {
      for (const levels of [70, 5_000, 100_000]) {
        const found = scanGlb(rawGlb(deep(levels), null), 'g')
        expect(messages(found), String(levels)).toEqual(['JSON nests deeper than 64 levels'])
        expect(found[0]?.code).toBe('SECURITY')
      }
    })

    it('scanGlb accepts a file that is exactly as deep as the limit allows', () => {
      // The root object is level 1, so 63 arrays under "scenes" make 64 levels, and 64 make 65.
      expect(messages(scanGlb(rawGlb(deep(63), null), 'g'))).not.toContain('JSON nests deeper than 64 levels')
      expect(messages(scanGlb(rawGlb(deep(64), null), 'g'))).toEqual(['JSON nests deeper than 64 levels'])
    })

    it('stripGlbMetadata (dropExtras) throws a GlbFormatError, never a RangeError', () => {
      const bytes = rawGlb(deep(100_000), null)
      expect(() => stripGlbMetadata(bytes)).toThrow(GlbFormatError)
      expect(() => stripGlbMetadata(bytes)).toThrow('JSON nests deeper than 64 levels')
    })
  })
})
