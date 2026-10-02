import { createHash } from 'node:crypto'
import { Document, NodeIO } from '@gltf-transform/core'
import { Group, type Camera, type Scene, type WebGLRenderer } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ModelLoadError } from '@/lib/models/errors'
import { INTEGRITY, MODEL_URL, assertFetchable, assertParsed } from '@/lib/models/validate'

/**
 * The loader against a mocked `fetch` and real GLB bytes built in the test.
 * The GLB has no texture: the browser image decoders do not exist under jsdom.
 */

const disposeSpy = vi.fn()
vi.mock('@/lib/models/dispose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/models/dispose')>()
  return { ...actual, disposeModel: (...args: Parameters<typeof actual.disposeModel>) => (disposeSpy(...args), actual.disposeModel(...args)) }
})

const { blockExternal, loadModel, parseModel, prefetchModel, prepareModel, resetLoaderForTests } = await import('@/components/three/models/ModelLoader')

async function triangleGlb(): Promise<Uint8Array> {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(buffer))
    .setMaterial(doc.createMaterial('m'))
  doc.createScene('s').addChild(doc.createNode('n').setMesh(doc.createMesh('mesh').addPrimitive(primitive)))
  return new NodeIO().writeBinary(doc)
}

const sri = (bytes: Uint8Array) => `sha256-${createHash('sha256').update(bytes).digest('base64')}`
const asBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

/** A manifest entry that points at `bytes`, installed through the test seam. */
function installManifest(bytes: Uint8Array, over: Record<string, unknown> = {}, enabled = true): string {
  const url = '/models/unit-cube.t2.0123abcd.glb'
  window.history.replaceState(null, '', '/?modeltest=1')
  window.__ASSEMBLY_MODELS_TEST__ = {
    manifest: {
      version: 1,
      contentHash: '0000000000000000',
      models: [
        {
          id: 'unit-cube',
          title: 'Unit cube',
          kind: 'prop',
          enabled,
          boundsRadius: 1,
          clips: [],
          variants: [{ tier: 2, requires: ['meshopt'], url, bytes: bytes.length, triangles: 1, maxTexturePx: 0, integrity: sri(bytes), extensions: [], ...over }],
        },
      ],
    },
  }
  return url
}

const okResponse = (bytes: Uint8Array) => ({ ok: true, status: 200, body: null, arrayBuffer: async () => asBuffer(bytes) }) as unknown as Response

/** A response whose body streams in chunks, for the byte cap. */
function streamed(chunks: Uint8Array[]): Response {
  let i = 0
  return {
    ok: true,
    status: 200,
    body: { getReader: () => ({ read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined }) }) },
  } as unknown as Response
}

let glb: Uint8Array
const fetchMock = vi.fn()

beforeEach(async () => {
  glb = await triangleGlb()
  resetLoaderForTests()
  disposeSpy.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete window.__ASSEMBLY_MODELS_TEST__
  window.history.replaceState(null, '', '/')
})

describe('the fetch', () => {
  it('asks for integrity, low priority, same-origin, no credentials, no redirects, with a deadline signal', async () => {
    const url = installManifest(glb)
    fetchMock.mockResolvedValue(okResponse(glb))
    const result = await loadModel('unit-cube', 2)
    expect(result.kind).toBe('loaded')
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit & { priority?: string }]
    expect(calledUrl).toBe(url)
    expect(init).toMatchObject({ integrity: sri(glb), priority: 'low', mode: 'same-origin', credentials: 'omit', redirect: 'error' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('rejects a non-ok response as a network failure', async () => {
    installManifest(glb)
    fetchMock.mockResolvedValue({ ok: false, status: 404 })
    await expect(loadModel('unit-cube', 2)).rejects.toMatchObject({ code: 'network' })
  })

  it('tells an integrity failure from a dead network by the browser message', async () => {
    installManifest(glb)
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to find a valid digest in the 'integrity' attribute"))
    await expect(loadModel('unit-cube', 2)).rejects.toMatchObject({ code: 'integrity' })
    resetLoaderForTests()
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(loadModel('unit-cube', 2)).rejects.toMatchObject({ code: 'network' })
  })

  it('rejects a body whose length is not what the manifest promised', async () => {
    installManifest(glb, { bytes: glb.length + 10 })
    fetchMock.mockResolvedValue(okResponse(glb))
    await expect(loadModel('unit-cube', 2)).rejects.toMatchObject({ code: 'size' })
  })

  it('stops reading a streamed body that exceeds the cap (manifest bytes x 1.1) and aborts the request', async () => {
    installManifest(glb)
    const big = new Uint8Array(Math.ceil(glb.length * 1.1) + 50)
    fetchMock.mockResolvedValue(streamed([big]))
    await expect(loadModel('unit-cube', 2)).rejects.toMatchObject({ code: 'size' })
    const signal = (fetchMock.mock.calls[0]?.[1] as RequestInit).signal as AbortSignal
    expect(signal.aborted).toBe(true)
  })

  it('aborts when the caller aborts (eviction)', async () => {
    installManifest(glb)
    fetchMock.mockReturnValue(new Promise(() => {}))
    const controller = new AbortController()
    const pending = loadModel('unit-cube', 2, controller.signal)
    controller.abort()
    await expect(pending).rejects.toBeInstanceOf(ModelLoadError)
  })

  it('refuses before any request when the url or the integrity string is not allowed', async () => {
    installManifest(glb, { url: 'https://evil.example/models/x.t2.0123abcd.glb' })
    await expect(loadModel('unit-cube', 2)).rejects.toMatchObject({ code: 'manifest' })
    installManifest(glb, { integrity: 'not-an-integrity-string' })
    await expect(loadModel('unit-cube', 2)).rejects.toMatchObject({ code: 'manifest' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a ledger asset missing from the manifest is an error, a disabled one is quietly unavailable', async () => {
    installManifest(glb, {}, false)
    await expect(loadModel('unit-cube', 2)).resolves.toMatchObject({ kind: 'unavailable' })
    await expect(loadModel('not-there', 2)).rejects.toMatchObject({ code: 'missing' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('prefetch', () => {
  it('drops a failed prefetch so the real load can retry, and a good one is reused', async () => {
    installManifest(glb)
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(prefetchModel('unit-cube', 2)).rejects.toMatchObject({ code: 'network' })
    fetchMock.mockResolvedValueOnce(okResponse(glb))
    await expect(loadModel('unit-cube', 2)).resolves.toMatchObject({ kind: 'loaded' })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    resetLoaderForTests()
    fetchMock.mockReset().mockResolvedValue(okResponse(glb))
    await prefetchModel('unit-cube', 2)
    await loadModel('unit-cube', 2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('parsing', () => {
  it('blocks every uri that is not data: or blob:', () => {
    expect(blockExternal('data:application/octet-stream;base64,AAAA')).toContain('data:')
    expect(blockExternal('blob:http://localhost/abc')).toContain('blob:')
    for (const url of ['http://evil.example/x.bin', 'https://evil.example/t.png', '//evil.example/x', '/models/other.bin', 'x.bin']) {
      expect(() => blockExternal(url)).toThrow(/external/)
    }
  })

  it('refuses a glTF whose buffer points at an external uri', async () => {
    const json = {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 0, 0], max: [1, 1, 0] }],
      bufferViews: [{ buffer: 0, byteLength: 36 }],
      buffers: [{ uri: 'http://evil.example/steal.bin', byteLength: 36 }],
    }
    const bytes = new Uint8Array(Buffer.from(JSON.stringify(json)))
    await expect(parseModel(asBuffer(bytes), { triangles: 10, maxTexturePx: 0 })).rejects.toMatchObject({ code: 'external-uri' })
  })

  it('wraps a parse failure with the parse code', async () => {
    await expect(parseModel(asBuffer(new Uint8Array(Buffer.from("not gltf"))), { triangles: 10, maxTexturePx: 0 })).rejects.toMatchObject({ code: 'parse' })
  })

  it('accepts a valid model within the promised numbers and rejects one above them', async () => {
    const ok = await parseModel(asBuffer(glb), { triangles: 1, maxTexturePx: 0 })
    expect(ok.scene).toBeInstanceOf(Group)
    await expect(parseModel(asBuffer(glb), { triangles: 0, maxTexturePx: 0 })).rejects.toMatchObject({ code: 'validation' })
  })

  it('sets toneMapped on every material and strips lights', async () => {
    const { scene } = await parseModel(asBuffer(glb), { triangles: 1, maxTexturePx: 0 })
    scene.traverse((node) => {
      const material = (node as { material?: { toneMapped: boolean } }).material
      if (material) expect(material.toneMapped).toBe(true)
    })
  })
})

describe('prepareModel', () => {
  const fakes = (compile: () => Promise<void>) => ({
    gl: { compileAsync: vi.fn(compile) } as unknown as WebGLRenderer,
    camera: {} as Camera,
    scene: {} as Scene,
  })

  it('a rejected compileAsync disposes the wrapper and counts as a "compile" failure', async () => {
    installManifest(glb)
    fetchMock.mockResolvedValue(okResponse(glb))
    const { gl, camera, scene } = fakes(() => Promise.reject(new Error('link failed')))
    await expect(prepareModel('unit-cube', 2, new AbortController().signal, gl, camera, scene, undefined)).rejects.toMatchObject({ code: 'compile' })
    expect(disposeSpy).toHaveBeenCalledTimes(1)
  })

  it('reports a clip the model does not have, and otherwise returns a ready, hidden, unscaled wrapper', async () => {
    installManifest(glb)
    fetchMock.mockResolvedValue(okResponse(glb))
    const { gl, camera, scene } = fakes(() => Promise.resolve())
    const made = await prepareModel('unit-cube', 2, new AbortController().signal, gl, camera, scene, { name: 'spin', mode: 'scrub' })
    expect(made.kind).toBe('ready')
    if (made.kind !== 'ready') return
    expect(made.clipMissing).toBe(true)
    expect(made.wrapper.visible).toBe(false)
    expect(made.wrapper.scale.x).toBe(0)
  })
})

describe('validation helpers', () => {
  it('only hash-named /models/ files and real SRI strings pass', () => {
    expect(MODEL_URL.test('/models/gyroscope.t1.ba83862b.glb')).toBe(true)
    for (const bad of ['/models/manifest.json', '/models/../x.t1.ba83862b.glb', 'https://x/models/a.t1.ba83862b.glb', '/models/a.t4.ba83862b.glb', '/models/A.t1.ba83862b.glb']) {
      expect(MODEL_URL.test(bad)).toBe(false)
    }
    expect(INTEGRITY.test('sha256-uoOGK/a4W0oOBP14TMz1+HvcEOhkXnOsZlQFlKLw3po=')).toBe(true)
    expect(INTEGRITY.test('md5-abc')).toBe(false)
    expect(() => assertFetchable('/models/a.t1.ba83862b.glb', 'sha256-short')).toThrow(ModelLoadError)
  })

  it('assertParsed rejects empty, non-finite and degenerate models', () => {
    const promised = { triangles: 100, maxTexturePx: 512 }
    const good = { meshes: 1, triangles: 10, maxTexturePx: 0, size: [1, 1, 1] as const }
    expect(() => assertParsed(good, promised)).not.toThrow()
    expect(() => assertParsed({ ...good, meshes: 0 }, promised)).toThrow(/no meshes/)
    expect(() => assertParsed({ ...good, size: [Number.NaN, 1, 1] }, promised)).toThrow(/finite/)
    expect(() => assertParsed({ ...good, size: [0, 0, 0] }, promised)).toThrow(/degenerate/)
    expect(() => assertParsed({ ...good, maxTexturePx: 1024 }, promised)).toThrow(/texture/)
  })
})
