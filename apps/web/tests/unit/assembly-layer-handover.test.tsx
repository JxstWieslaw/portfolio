import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The layer's hand-over bookkeeping: `hero` says the engine is painting now, `handover` says it has painted and has not
 * given up. The second is sticky across a pause out of view (the cubes' own monolith and the procedural shell must not
 * return behind the fading engine) and drops on a give-up or a caught throw.
 */
const seen = vi.hoisted(() => ({
  hero: null as null | { onLive: (live: boolean) => void; onGiveUp: () => void },
  canvas: { hero: false, handover: false, mounted: false },
  throwNext: false,
}))

vi.mock('next/dynamic', async () => {
  const React = await import('react')
  return {
    default: (loader: () => unknown) => {
      const isHero = loader.toString().includes('hero/HeroLayer')
      if (isHero) {
        return function HeroStub(props: { onLive: (live: boolean) => void; onGiveUp: () => void }) {
          seen.hero = props
          if (seen.throwNext) throw new Error('boom')
          return null
        }
      }
      return function CanvasStub(props: { hero?: boolean; handover?: boolean }) {
        React.useEffect(() => {
          seen.canvas.mounted = true
        }, [])
        seen.canvas.hero = props.hero === true
        seen.canvas.handover = props.handover === true
        return null
      }
    },
  }
})

vi.mock('@/lib/assembly/lcp', () => ({ afterLcp: (run: () => void) => (run(), () => {}) }))
vi.mock('@/lib/formations/fallback', () => ({
  readCapabilities: () => ({ lowPower: false }),
  resolveRung: () => 'live',
  instanceKeep: () => 1,
}))
vi.mock('@/lib/assembly/capabilities', () => ({
  hasNoGlFlag: () => false,
  probeWebGL2: () => true,
  readSaveData: () => false,
  shouldMountWebGL: () => true,
}))
vi.mock('@/lib/hero/gate', () => ({ heroFlagOn: () => true, shouldMountHero: () => true }))

import { AssemblyLayer, resetAssemblyForTests } from '@/components/three/AssemblyLayer'

beforeEach(() => {
  seen.hero = null
  seen.canvas = { hero: false, handover: false, mounted: false }
  seen.throwNext = false
  resetAssemblyForTests()
})
afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute('data-hero')
  document.documentElement.removeAttribute('data-hero-reason')
})

describe('AssemblyLayer hand-over ownership', () => {
  it('is false before the engine paints, true once it has, and stays true when the engine reports not-live', async () => {
    render(<AssemblyLayer />)
    await act(async () => {})
    expect(seen.canvas.mounted).toBe(true)
    expect(seen.canvas.hero).toBe(false)
    expect(seen.canvas.handover).toBe(false)

    await act(async () => seen.hero?.onLive(true))
    expect(seen.canvas.hero).toBe(true)
    expect(seen.canvas.handover).toBe(true)

    // Paused out of view, released, or a context loss: the engine is not painting, the hand-over is still the engine's.
    await act(async () => seen.hero?.onLive(false))
    expect(seen.canvas.hero).toBe(false)
    expect(seen.canvas.handover).toBe(true)
  })

  it('drops to false when the engine gives up, and the cubes own the hero again', async () => {
    render(<AssemblyLayer />)
    await act(async () => {})
    await act(async () => seen.hero?.onLive(true))
    expect(seen.canvas.handover).toBe(true)
    await act(async () => seen.hero?.onGiveUp())
    expect(seen.canvas.hero).toBe(false)
    expect(seen.canvas.handover).toBe(false)
  })

  it('drops to false when the hero layer throws (the boundary catches it)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const view = render(<AssemblyLayer />)
    await act(async () => {})
    await act(async () => seen.hero?.onLive(true))
    expect(seen.canvas.handover).toBe(true)
    // The next render of the hero layer throws: the layer's boundary catches it and hands the hero back.
    seen.throwNext = true
    await act(async () => seen.hero?.onLive(false))
    await act(async () => view.rerender(<AssemblyLayer />))
    expect(seen.canvas.handover).toBe(false)
    error.mockRestore()
    warn.mockRestore()
  })
})
