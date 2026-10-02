import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The test seam must be inert for a production visitor: no `?modeltest=1` or a
 * production build without NEXT_PUBLIC_MODEL_TEST gives `null`, no placements,
 * no manifest override, no debug hook, and `?tier=` is ignored. The switch is
 * a module constant, so each case resets modules after stubbing the env.
 */

const SEAM = { placements: {}, manifest: { models: [] } }

async function fresh(env: { NODE_ENV: string; NEXT_PUBLIC_MODEL_TEST?: string }, search: string) {
  vi.resetModules()
  vi.stubEnv('NODE_ENV', env.NODE_ENV)
  vi.stubEnv('NEXT_PUBLIC_MODEL_TEST', env.NEXT_PUBLIC_MODEL_TEST ?? '0')
  window.history.replaceState(null, '', `/${search}`)
  window.__ASSEMBLY_MODELS_TEST__ = SEAM
  const seam = await import('@/lib/models/test-seam')
  const gate = await import('@/lib/models/gate')
  return { seam, gate }
}

afterEach(() => {
  vi.unstubAllEnvs()
  delete window.__ASSEMBLY_MODELS_TEST__
  window.history.replaceState(null, '', '/')
})

describe('the test seam', () => {
  it('is off in a production build, even with ?modeltest=1 and the global set', async () => {
    const { seam } = await fresh({ NODE_ENV: 'production' }, '?modeltest=1')
    expect(seam.testSeam()).toBeNull()
  })

  it('is on in a production build made with NEXT_PUBLIC_MODEL_TEST=1, and only with ?modeltest=1', async () => {
    expect((await fresh({ NODE_ENV: 'production', NEXT_PUBLIC_MODEL_TEST: '1' }, '?modeltest=1')).seam.testSeam()).toBe(SEAM)
    expect((await fresh({ NODE_ENV: 'production', NEXT_PUBLIC_MODEL_TEST: '1' }, '')).seam.testSeam()).toBeNull()
  })

  it('is available in development and test, again only with ?modeltest=1', async () => {
    expect((await fresh({ NODE_ENV: 'development' }, '?modeltest=1')).seam.testSeam()).toBe(SEAM)
    expect((await fresh({ NODE_ENV: 'development' }, '')).seam.testSeam()).toBeNull()
  })

  it('?tier= is ignored for a production visitor and honoured where the seam is', async () => {
    const prod = await fresh({ NODE_ENV: 'production' }, '?tier=3')
    expect(prod.gate.readGateInputs('live').tier).toBe(2)
    const flagged = await fresh({ NODE_ENV: 'production', NEXT_PUBLIC_MODEL_TEST: '1' }, '?tier=3')
    expect(flagged.gate.readGateInputs('live').tier).toBe(3)
  })

  it('creates no debug hook for a slot in a production build', async () => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_MODEL_TEST', '0')
    window.history.replaceState(null, '', '/?modeltest=1')
    window.__ASSEMBLY_MODELS_TEST__ = SEAM
    const { createModelSlot } = await import('@/components/three/models/ModelSlot')
    const { Group } = await import('three')
    const slot = createModelSlot({
      gl: { info: { memory: { geometries: 0, textures: 0 } } } as never,
      scene: {} as never,
      camera: {} as never,
      parent: new Group(),
      rung: 'live',
      invalidate: () => {},
    })
    expect(window.__ASSEMBLY_DEBUG__).toBeUndefined()
    slot.dispose()
  })
})
