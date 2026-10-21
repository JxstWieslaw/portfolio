import { act, cleanup, render } from '@testing-library/react'
import { Component, StrictMode, useEffect, type ReactNode } from 'react'
import { ACESFilmicToneMapping, ColorManagement, PerspectiveCamera, SRGBColorSpace } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Canvas, useFrame, useThree, type RootState } from '@/components/three/stage'

/**
 * The stage (plain-three migration spec § 8, slice S1): R3F's root without `<Canvas>`. jsdom has no WebGL, so the
 * renderer is a fake instance handed in through `gl` (R3F configures an instance the same way it configures the one it
 * builds, apart from owning it), and jsdom measures every box as 0 x 0, so `react-use-measure` reports a fixed box.
 * The pixels themselves are proven by the cube parity job (tests/visual/cubes-parity.spec.ts).
 */
vi.mock('react-use-measure', () => ({
  default: () => [() => {}, { width: 800, height: 600, top: 0, left: 0, x: 0, y: 0, bottom: 600, right: 800 }],
}))

interface FakeRenderer {
  render: ReturnType<typeof vi.fn>
  setPixelRatio: ReturnType<typeof vi.fn>
  setSize: ReturnType<typeof vi.fn>
  forceContextLoss: ReturnType<typeof vi.fn>
  renderLists: { dispose: ReturnType<typeof vi.fn> }
  domElement: HTMLCanvasElement
  toneMapping?: number
  toneMappingExposure?: number
  outputColorSpace?: string
}

function fakeRenderer(): FakeRenderer {
  return {
    render: vi.fn(),
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    forceContextLoss: vi.fn(),
    renderLists: { dispose: vi.fn() },
    domElement: document.createElement('canvas'),
  }
}

/** Two animation frames and a macrotask: R3F's loop has run by then. */
const frames = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 80))

class Catch extends Component<{ readonly onError: (error: unknown) => void; readonly children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  override componentDidCatch(error: unknown): void {
    this.props.onError(error)
  }
  override render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

let latest: RootState | null = null

function Probe({ onFrame, priority = 1 }: { readonly onFrame: (state: RootState) => void; readonly priority?: number }) {
  const state = useThree()
  latest = state
  useFrame((frameState) => onFrame(frameState), priority)
  return null
}

afterEach(() => {
  cleanup()
  latest = null
  vi.restoreAllMocks()
})

describe('stage Canvas', () => {
  it('configures the root with the renderer settings <Canvas> gave the Assembly', async () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const gl = fakeRenderer()
    const onCreated = vi.fn((state: RootState) => {
      state.gl.toneMappingExposure = 1.1
    })
    render(
      <Canvas gl={gl as never} frameloop="demand" dpr={[1, 1.5]} camera={{ fov: 30, near: 0.1, far: 100, position: [0, 0, 12] }} onCreated={onCreated}>
        <Probe onFrame={() => {}} />
      </Canvas>,
    )
    await act(frames)

    // R3F's colour defaults (not `linear`, not `flat`, not `legacy`): sRGB out, ACES Filmic, colour management on.
    expect(gl.outputColorSpace).toBe(SRGBColorSpace)
    expect(gl.toneMapping).toBe(ACESFilmicToneMapping)
    expect(ColorManagement.enabled).toBe(true)
    // dpr [1, 1.5] on a 2x screen, and the measured box.
    expect(gl.setPixelRatio).toHaveBeenLastCalledWith(1.5)
    expect(gl.setSize).toHaveBeenLastCalledWith(800, 600, true)
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(gl.toneMappingExposure).toBe(1.1)

    const state = latest as RootState
    expect(state.gl).toBe(gl)
    expect(state.frameloop).toBe('demand')
    expect(state.size).toMatchObject({ width: 800, height: 600 })
    const camera = state.camera as PerspectiveCamera
    expect(camera).toBeInstanceOf(PerspectiveCamera)
    expect([camera.fov, camera.near, camera.far, camera.aspect]).toEqual([30, 0.1, 100, 800 / 600])
    expect(camera.position.toArray()).toEqual([0, 0, 12])
  })

  it('draws on demand only, and a priority-1 frame owns the draw', async () => {
    const gl = fakeRenderer()
    const onFrame = vi.fn()
    render(
      <Canvas gl={gl as never} frameloop="demand">
        <Probe onFrame={onFrame} />
      </Canvas>,
    )
    await act(frames)
    const settled = onFrame.mock.calls.length
    await act(frames)
    expect(onFrame.mock.calls.length).toBe(settled)

    // Three requests in one task coalesce into one frame.
    await act(async () => {
      latest?.invalidate()
      latest?.invalidate()
      latest?.invalidate()
      await frames()
    })
    expect(onFrame.mock.calls.length).toBe(settled + 1)
    // A subscriber above priority 0 turns R3F's own render off.
    expect(gl.render).not.toHaveBeenCalled()
  })

  it('a throw inside a frame goes to onError once and switches that callback off', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const gl = fakeRenderer()
    const boom = new Error('frame failed')
    const onFrame = vi.fn(() => {
      throw boom
    })
    const onError = vi.fn()
    render(
      <Canvas gl={gl as never} frameloop="demand" onError={onError}>
        <Probe onFrame={onFrame} />
      </Canvas>,
    )
    await act(async () => {
      latest?.invalidate()
      await frames()
    })
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(boom)
    const calls = onFrame.mock.calls.length
    await act(async () => {
      latest?.invalidate()
      await frames()
    })
    expect(onFrame.mock.calls.length).toBe(calls)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('without onError, a frame throw reaches the error boundary above the stage', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const gl = fakeRenderer()
    const boom = new Error('frame failed')
    const caught = vi.fn()
    render(
      <Catch onError={caught}>
        <Canvas gl={gl as never} frameloop="demand">
          <Probe
            onFrame={() => {
              throw boom
            }}
          />
        </Canvas>
      </Catch>,
    )
    await act(async () => {
      latest?.invalidate()
      await frames()
    })
    expect(caught).toHaveBeenCalledWith(boom)
  })

  it('a render error inside the scene reaches the error boundary above the stage', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const gl = fakeRenderer()
    const boom = new Error('scene render failed')
    const caught = vi.fn()
    function Broken(): null {
      throw boom
    }
    render(
      <Catch onError={caught}>
        <Canvas gl={gl as never} frameloop="demand">
          <Broken />
        </Canvas>
      </Catch>,
    )
    await act(frames)
    expect(caught).toHaveBeenCalledWith(boom)
  })

  it('StrictMode mount, cleanup, mount keeps one live root; the final unmount releases it', async () => {
    const gl = fakeRenderer()
    const mounts = vi.fn()
    const unmounts = vi.fn()
    function Effects(): null {
      useEffect(() => {
        mounts()
        return unmounts
      }, [])
      return null
    }
    const view = render(
      <StrictMode>
        <Canvas gl={gl as never} frameloop="demand">
          <Effects />
          <Probe onFrame={() => {}} />
        </Canvas>
      </StrictMode>,
    )
    await act(frames)
    // The scene's effects replay (development StrictMode reaches the R3F tree), and leave one mounted.
    expect(mounts.mock.calls.length - unmounts.mock.calls.length).toBe(1)
    // The root survived the replay: the renderer was never released.
    expect(gl.forceContextLoss).not.toHaveBeenCalled()
    expect(latest?.gl).toBe(gl)

    view.unmount()
    await act(frames)
    expect(mounts.mock.calls.length).toBe(unmounts.mock.calls.length)
    expect(gl.forceContextLoss).toHaveBeenCalledTimes(1)
  })
})
