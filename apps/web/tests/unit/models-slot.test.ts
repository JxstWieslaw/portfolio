import { AnimationClip, AnimationMixer, BoxGeometry, Group, Mesh, MeshStandardMaterial, VectorKeyframeTrack, type Camera, type Scene, type WebGLRenderer } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAPTERS, type Chapter, type ModelPlacement } from '@/lib/assembly/chapters'
import { ModelLoadError } from '@/lib/models/errors'
import type { FormationId } from '@/lib/formations/config'
import type { ModelFrame } from '@/components/three/models/ModelSlot'

/**
 * The slot with its loader mocked: the real `createModelSlot`, real three
 * objects, an injected renderer/scene/camera/parent/ledger. What is under test
 * is the slot's own bookkeeping (generation guard, failure counting, eviction
 * while loading, clip driving, gating), not the network or the GLTF parser.
 */

const prepareModel = vi.fn()
const prefetchModel = vi.fn()
const disposeSpy = vi.fn()

vi.mock('@/components/three/models/ModelLoader', async () => {
  const actual = await vi.importActual<typeof import('@/lib/models/dispose')>('@/lib/models/dispose')
  return {
    prepareModel: (...args: unknown[]) => prepareModel(...args),
    prefetchModel: (...args: unknown[]) => prefetchModel(...args),
    disposeModel: (...args: Parameters<typeof actual.disposeModel>) => {
      disposeSpy(...args)
      return actual.disposeModel(...args)
    },
  }
})

const { createModelSlot } = await import('@/components/three/models/ModelSlot')

const placement = (over: Partial<ModelPlacement> = {}): ModelPlacement => ({
  asset: 'thing',
  role: 'prop',
  position: [0, 0, 0],
  scale: 1,
  rotation: [0, 0, 0],
  spin: 0,
  exclusion: 0,
  appear: [0, 0.5],
  ...over,
})

const ledgerWith = (row: ModelPlacement): Record<FormationId, Chapter> => ({ ...CHAPTERS, lattice: { ...CHAPTERS.lattice, model: row } })

const frameAt = (over: Partial<ModelFrame> = {}): ModelFrame => ({
  from: 'lattice',
  to: 'lattice',
  mix: 0,
  settled: 'lattice',
  dt: 0.016,
  time: 0,
  unitOf: () => 1,
  ...over,
})

const AWAY = frameAt({ from: 'stream', to: 'stream', settled: 'stream' })

function fakeModel(withClip = false) {
  const geometry = new BoxGeometry(1, 1, 1)
  const material = new MeshStandardMaterial()
  const inner = new Group()
  inner.add(new Mesh(geometry, material))
  const wrapper = new Group()
  wrapper.add(inner)
  let mixer: AnimationMixer | null = null
  let action = null
  if (withClip) {
    mixer = new AnimationMixer(inner)
    action = mixer.clipAction(new AnimationClip('spin', 1, [new VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 1, 0, 0])]))
    action.play()
  }
  return { geometry, material, inner, wrapper, mixer, action, ready: { kind: 'ready' as const, wrapper, inner, mixer, action, clipMissing: false } }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

const html = document.documentElement
let now = 0

function setup(row: ModelPlacement = placement()) {
  const parent = new Group()
  const invalidate = vi.fn()
  const gl = { info: { memory: { geometries: 0, textures: 0 } } } as unknown as WebGLRenderer
  const slot = createModelSlot({ gl, scene: {} as Scene, camera: {} as Camera, parent, rung: 'live', invalidate, ledger: ledgerWith(row) })
  return { slot, parent, invalidate }
}

beforeEach(() => {
  html.dataset.gl = 'live'
  window.history.replaceState(null, '', '/')
  now = 10_000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  prepareModel.mockReset()
  prefetchModel.mockReset().mockResolvedValue(undefined)
  disposeSpy.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const key of ['gl', 'models', 'modelsFailed', 'modelsUnavailable', 'modelsLastError', 'modelsGate']) delete html.dataset[key]
})

describe('loading', () => {
  it('adds a loaded model to the rig, publishes the count, and scales it in', async () => {
    const m = fakeModel()
    prepareModel.mockResolvedValue(m.ready)
    const { slot, parent } = setup()
    slot.update(frameAt())
    await flush()
    slot.update(frameAt())
    expect(parent.children).toContain(m.wrapper)
    expect(html.dataset.models).toBe('1')
    expect(m.wrapper.visible).toBe(true)
    expect(m.wrapper.scale.x).toBeCloseTo(1)
    expect(html.dataset.modelsGate).toBe('on:2')
  })

  it('a load that resolves after dispose is disposed and never added (the generation guard)', async () => {
    const m = fakeModel()
    let resolve!: (v: unknown) => void
    prepareModel.mockReturnValue(new Promise((r) => (resolve = r)))
    const { slot, parent } = setup()
    slot.update(frameAt())
    await flush()
    slot.dispose()
    resolve(m.ready)
    await flush()
    expect(parent.children).toHaveLength(0)
    expect(html.dataset.models).toBeUndefined()
    expect(disposeSpy).toHaveBeenCalledTimes(1)
    expect(disposeSpy.mock.calls[0]?.[0]).toBe(m.wrapper)
  })

  it('a model evicted while it is still loading is disposed on arrival and not counted as a failure', async () => {
    const m = fakeModel()
    let resolve!: (v: unknown) => void
    prepareModel.mockReturnValue(new Promise((r) => (resolve = r)))
    const { slot, parent } = setup()
    slot.update(frameAt())
    await flush()
    const signal = prepareModel.mock.calls[0]?.[2] as AbortSignal
    slot.update(AWAY) // starts leaving
    now += 5000 // past the 2 s grace period
    slot.update(AWAY)
    expect(signal.aborted).toBe(true)
    resolve(m.ready)
    await flush()
    expect(parent.children).toHaveLength(0)
    expect(disposeSpy).toHaveBeenCalledTimes(1)
    expect(html.dataset.modelsFailed).toBe('0')
  })

  it('evicts a resident model after the grace period: removed from the rig and the count returns to 0', async () => {
    const m = fakeModel()
    prepareModel.mockResolvedValue(m.ready)
    const { slot, parent } = setup()
    slot.update(frameAt())
    await flush()
    expect(html.dataset.models).toBe('1')
    now += 1000
    slot.update(AWAY)
    expect(html.dataset.models).toBe('1') // still within the grace period, but not drawn
    expect(m.wrapper.visible).toBe(false)
    now += 2500
    slot.update(AWAY)
    expect(html.dataset.models).toBe('0')
    expect(parent.children).toHaveLength(0)
    expect(disposeSpy).toHaveBeenCalledTimes(1)
  })
})

describe('failures are counted, published, warned and never retried', () => {
  it('a rejected load counts once with its code and is not asked for again', async () => {
    prepareModel.mockRejectedValue(new ModelLoadError('integrity', 'bad digest'))
    const { slot } = setup()
    for (let i = 0; i < 4; i += 1) {
      slot.update(frameAt())
      await flush()
    }
    expect(prepareModel).toHaveBeenCalledTimes(1)
    expect(html.dataset.modelsFailed).toBe('1')
    expect(html.dataset.modelsLastError).toBe('integrity')
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(html.dataset.models).toBe('0')
  })

  it('counts a failure even when the asset is no longer held (leaving) when it rejects', async () => {
    let reject!: (e: unknown) => void
    prepareModel.mockReturnValue(new Promise((_, r) => (reject = r)))
    const { slot } = setup()
    slot.update(frameAt())
    await flush()
    // Wanted again by nobody, but not yet evicted (grace period): the load fails while "leaving".
    slot.update(AWAY)
    reject(new ModelLoadError('network', 'dead'))
    await flush()
    expect(html.dataset.modelsFailed).toBe('1')
    expect(html.dataset.modelsLastError).toBe('network')
  })

  it('a compile or other loader error is counted with an "unknown" code when it has no code of its own', async () => {
    prepareModel.mockRejectedValue(new Error('boom'))
    const { slot } = setup()
    slot.update(frameAt())
    await flush()
    expect(html.dataset.modelsFailed).toBe('1')
    expect(html.dataset.modelsLastError).toBe('unknown')
  })

  it('a placement whose clip is missing is warned and counted, and the model still shows', async () => {
    const m = fakeModel()
    prepareModel.mockResolvedValue({ ...m.ready, clipMissing: true })
    const { slot, parent } = setup(placement({ clip: { name: 'nope', mode: 'scrub' } }))
    slot.update(frameAt())
    await flush()
    expect(html.dataset.modelsFailed).toBe('1')
    expect(parent.children).toContain(m.wrapper)
  })

  it('"unavailable" (enabled: false) is quiet but visible: counted apart from failures and warned once', async () => {
    prepareModel.mockResolvedValue({ kind: 'unavailable', reason: '"thing" is disabled in the manifest' })
    const { slot } = setup()
    for (let i = 0; i < 3; i += 1) {
      slot.update(frameAt())
      await flush()
    }
    expect(html.dataset.modelsUnavailable).toBe('1')
    expect(html.dataset.modelsFailed).toBe('0')
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(prepareModel).toHaveBeenCalledTimes(1)
  })

  it('a failed prefetch is logged, not swallowed', async () => {
    prefetchModel.mockRejectedValue(new ModelLoadError('network', 'nope'))
    const { slot } = setup()
    // Settled on the hero: the lattice is next, so its bytes are prefetched when the thread is idle.
    slot.update(frameAt({ from: 'monolith', to: 'monolith', settled: 'monolith' }))
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(prefetchModel).toHaveBeenCalledWith('thing', 2)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })
})

describe('the gate', () => {
  it('never calls the loader while WebGL is not live', async () => {
    delete html.dataset.gl
    const { slot } = setup()
    slot.update(frameAt())
    await flush()
    expect(prepareModel).not.toHaveBeenCalled()
  })

  it('never calls the loader for ?nomodels=1, and says why', async () => {
    window.history.replaceState(null, '', '/?nomodels=1')
    const { slot } = setup()
    slot.update(frameAt())
    await flush()
    expect(prepareModel).not.toHaveBeenCalled()
    expect(html.dataset.modelsGate).toBe('off:nomodels')
  })

  it('never calls the loader on Save-Data', async () => {
    Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true })
    try {
      const { slot } = setup()
      slot.update(frameAt())
      await flush()
      expect(prepareModel).not.toHaveBeenCalled()
      expect(html.dataset.modelsGate).toBe('off:save-data')
    } finally {
      Reflect.deleteProperty(navigator, 'connection')
    }
  })

  it('does nothing at all, and asks nothing, while every ledger row is null', async () => {
    const slot = createModelSlot({
      gl: { info: { memory: { geometries: 0, textures: 0 } } } as unknown as WebGLRenderer,
      scene: {} as Scene,
      camera: {} as Camera,
      parent: new Group(),
      rung: 'live',
      invalidate: vi.fn(),
    })
    expect(slot.update(frameAt())).toEqual({ suppressArtefact: false })
    await flush()
    expect(prepareModel).not.toHaveBeenCalled()
    expect(html.dataset.modelsGate).toBeUndefined()
  })
})

describe('clips', () => {
  it('scrub: sets the action time from the weight, and writes nothing on a resting frame', async () => {
    const m = fakeModel(true)
    if (m.action) m.action.paused = true
    prepareModel.mockResolvedValue(m.ready)
    const { slot } = setup(placement({ clip: { name: 'spin', mode: 'scrub' } }))
    slot.update(frameAt())
    await flush()
    const update = vi.spyOn(m.mixer as AnimationMixer, 'update')
    slot.update(frameAt({ from: 'lattice', to: 'stream', mix: 0.25, settled: null }))
    // weight 0.75 of a 1 s clip
    expect(m.action?.time).toBeCloseTo(0.75)
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenLastCalledWith(0)
    slot.update(frameAt({ from: 'lattice', to: 'stream', mix: 0.25, settled: null }))
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('loop: advances only when settled on the formation and its weight is above one half', async () => {
    const m = fakeModel(true)
    prepareModel.mockResolvedValue(m.ready)
    const { slot } = setup(placement({ clip: { name: 'spin', mode: 'loop' } }))
    slot.update(frameAt())
    await flush()
    const update = vi.spyOn(m.mixer as AnimationMixer, 'update')
    slot.update(frameAt({ from: 'lattice', to: 'stream', mix: 0.2, settled: null })) // mid-band
    expect(update).not.toHaveBeenCalled()
    slot.update(frameAt({ from: 'lattice', to: 'lattice', mix: 0, settled: 'stream' })) // settled elsewhere
    expect(update).not.toHaveBeenCalled()
    slot.update(frameAt({ dt: 0.05 }))
    expect(update).toHaveBeenCalledWith(0.05)
  })
})

describe('the artefact role', () => {
  it('asks the canvas to hide the procedural artefact only while a loaded artefact-role model is on screen', async () => {
    const m = fakeModel()
    prepareModel.mockResolvedValue(m.ready)
    const { slot } = setup(placement({ role: 'artefact' }))
    expect(slot.update(frameAt()).suppressArtefact).toBe(false) // not loaded yet: nothing changes
    await flush()
    expect(slot.update(frameAt()).suppressArtefact).toBe(true)
    expect(slot.update(AWAY).suppressArtefact).toBe(false)
  })
})

describe('dispose', () => {
  it('keeps going when one model throws, always clears the markers and the debug hook', async () => {
    const m = fakeModel()
    prepareModel.mockResolvedValue(m.ready)
    const { slot } = setup()
    slot.update(frameAt())
    await flush()
    vi.spyOn(m.geometry, 'dispose').mockImplementation(() => {
      throw new Error('gpu gone')
    })
    expect(() => slot.dispose()).not.toThrow()
    expect(html.dataset.models).toBeUndefined()
    expect(html.dataset.modelsFailed).toBeUndefined()
    expect(window.__ASSEMBLY_DEBUG__).toBeUndefined()
  })

  it('a second slot after dispose (StrictMode mount, cleanup, mount) republishes its markers', () => {
    const first = setup().slot
    first.dispose()
    expect(html.dataset.models).toBeUndefined()
    setup()
    expect(html.dataset.models).toBe('0')
    expect(html.dataset.modelsFailed).toBe('0')
  })
})
