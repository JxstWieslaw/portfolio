import { act, cleanup, render } from '@testing-library/react'
import { Component, StrictMode, useEffect, type ReactNode } from 'react'
import { ACESFilmicToneMapping, ColorManagement, PCFSoftShadowMap, PerspectiveCamera, SRGBColorSpace, Vector3 } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Canvas, resolveDpr, useFrame, useThree, type RootState } from '@/components/three/stage'

/**
 * The stage over plain three (plain-three migration spec § 8, slice S2). jsdom has no WebGL, so `WebGLRenderer` is
 * replaced by a recording fake (the constructor arguments are asserted as given), jsdom measures every box as 0 x 0,
 * so the container's box is stubbed, and jsdom has no `ResizeObserver`, so a controllable one is installed.
 * The pixels themselves, and the draw calls, triangles and programs, are proven by the cube parity job
 * (tests/visual/cubes-parity.spec.ts), which compares this stage's frames with baselines made under R3F.
 */

const log: string[] = []

interface FakeRenderer {
  params: Record<string, unknown>
  render: ReturnType<typeof vi.fn>
  setPixelRatio: ReturnType<typeof vi.fn>
  setSize: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
  forceContextLoss: ReturnType<typeof vi.fn>
  shadowMap: { enabled: boolean; type: number }
  domElement: HTMLCanvasElement
  toneMapping?: number
  toneMappingExposure?: number
  outputColorSpace?: string
}

const renderers: FakeRenderer[] = []

vi.mock('three', async (importOriginal) => {
  const three = await importOriginal<Record<string, unknown>>()
  class WebGLRenderer {
    constructor(params: Record<string, unknown>) {
      const fake: FakeRenderer = {
        params,
        render: vi.fn(),
        setPixelRatio: vi.fn(),
        setSize: vi.fn(),
        dispose: vi.fn(() => log.push('gl.dispose')),
        forceContextLoss: vi.fn(() => log.push('gl.forceContextLoss')),
        shadowMap: { enabled: true, type: 0 },
        domElement: params['canvas'] as HTMLCanvasElement,
      }
      renderers.push(fake)
      return fake as unknown as WebGLRenderer
    }
  }
  return { ...three, WebGLRenderer }
})

/** The measured box, and the observers watching it. */
let box = { width: 800, height: 600, top: 0, left: 0 }
const observers: Array<() => void> = []

beforeEach(() => {
  box = { width: 800, height: 600, top: 0, left: 0 }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ ...box, x: box.left, y: box.top, right: box.left + box.width, bottom: box.top + box.height, toJSON: () => ({}) }) as DOMRect,
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private readonly callback: () => void
      constructor(callback: () => void) {
        this.callback = callback
      }
      observe(): void {
        observers.push(this.callback)
      }
      disconnect(): void {
        const index = observers.indexOf(this.callback)
        if (index >= 0) observers.splice(index, 1)
      }
    },
  )
})

afterEach(() => {
  cleanup()
  latest = null
  renderers.length = 0
  observers.length = 0
  log.length = 0
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Two animation frames and a macrotask: the loop has run by then. */
const frames = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 80))
const lastRenderer = (): FakeRenderer => renderers[renderers.length - 1] as FakeRenderer

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

function Probe({ onFrame, priority = 1 }: { readonly onFrame: (state: RootState, delta: number) => void; readonly priority?: number }) {
  const state = useThree()
  latest = state
  useFrame((frameState, delta) => onFrame(frameState, delta), priority)
  return null
}

describe('stage Canvas', () => {
  it("builds the renderer with R3F's defaults and the Assembly's settings, before the first frame", async () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const onCreated = vi.fn((state: RootState) => {
      state.gl.toneMappingExposure = 1.1
    })
    render(
      <Canvas
        gl={{ alpha: true, antialias: true, powerPreference: 'default' }}
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ fov: 30, near: 0.1, far: 100, position: [0, 0, 12] }}
        onCreated={onCreated}
      >
        <Probe onFrame={() => {}} />
      </Canvas>,
    )
    await act(frames)

    expect(renderers).toHaveLength(1)
    const gl = lastRenderer()
    // R3F's `createRenderer` defaults with the Assembly's override on top, and the stage's own canvas.
    expect(gl.params).toEqual({ canvas: expect.any(HTMLCanvasElement), powerPreference: 'default', antialias: true, alpha: true })
    // R3F's colour defaults (not `linear`, not `flat`, not `legacy`): sRGB out, ACES Filmic, colour management on.
    expect(gl.outputColorSpace).toBe(SRGBColorSpace)
    expect(gl.toneMapping).toBe(ACESFilmicToneMapping)
    expect(ColorManagement.enabled).toBe(true)
    // Shadows off, with the map type R3F leaves behind (it is part of three's program key).
    expect(gl.shadowMap).toEqual({ enabled: false, type: PCFSoftShadowMap })
    // dpr [1, 1.5] on a 2x screen, and the measured box with an explicit CSS size (R3F's `updateStyle`).
    expect(gl.setPixelRatio).toHaveBeenLastCalledWith(1.5)
    expect(gl.setSize).toHaveBeenLastCalledWith(800, 600, true)
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(gl.toneMappingExposure).toBe(1.1)

    const state = latest as RootState
    expect(state.gl).toBe(gl)
    expect(state.frameloop).toBe('demand')
    expect(state.size).toEqual({ width: 800, height: 600, top: 0, left: 0 })
    const camera = state.camera
    expect(camera).toBeInstanceOf(PerspectiveCamera)
    expect([camera.fov, camera.near, camera.far, camera.aspect]).toEqual([30, 0.1, 100, 800 / 600])
    expect(camera.position.toArray()).toEqual([0, 0, 12])
    // Looking at the origin, as R3F's default camera does.
    expect(camera.getWorldDirection(new Vector3()).distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-12)
  })

  it('builds nothing while the box is empty, and builds once it has a size', async () => {
    box = { width: 0, height: 0, top: 0, left: 0 }
    render(
      <Canvas frameloop="demand">
        <Probe onFrame={() => {}} />
      </Canvas>,
    )
    await act(frames)
    expect(renderers).toHaveLength(0)
    expect(latest).toBeNull()

    box = { width: 400, height: 300, top: 0, left: 0 }
    await act(async () => {
      for (const observer of [...observers]) observer()
      await frames()
    })
    expect(renderers).toHaveLength(1)
    expect(latest?.size).toMatchObject({ width: 400, height: 300 })
  })

  it('draws on demand only, coalesces requests, and a priority-1 frame owns the draw', async () => {
    const onFrame = vi.fn()
    render(
      <Canvas frameloop="demand">
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
    // A subscriber above priority 0 turns the stage's own render off.
    expect(lastRenderer().render).not.toHaveBeenCalled()
  })

  it('without a priority above 0 the stage renders the scene itself after the callbacks', async () => {
    const order: string[] = []
    render(
      <Canvas frameloop="demand">
        <Probe onFrame={() => order.push('frame')} priority={0} />
      </Canvas>,
    )
    await act(async () => {
      latest?.invalidate()
      await frames()
    })
    const gl = lastRenderer()
    gl.render.mockImplementation(() => order.push('render'))
    order.length = 0
    await act(async () => {
      latest?.invalidate()
      await frames()
    })
    expect(order).toEqual(['frame', 'render'])
    expect(gl.render).toHaveBeenCalledWith(latest?.scene, latest?.camera)
  })

  it('runs callbacks lowest priority first, equal priorities in the order they subscribed', async () => {
    const order: string[] = []
    render(
      <Canvas frameloop="demand">
        <Probe onFrame={() => order.push('p2')} priority={2} />
        <Probe onFrame={() => order.push('p1-a')} priority={1} />
        <Probe onFrame={() => order.push('p0')} priority={0} />
        <Probe onFrame={() => order.push('p1-b')} priority={1} />
      </Canvas>,
    )
    await act(frames)
    order.length = 0
    await act(async () => {
      latest?.invalidate()
      await frames()
    })
    expect(order).toEqual(['p0', 'p1-a', 'p1-b', 'p2'])
  })

  it('a request from inside a frame asks for exactly one more frame', async () => {
    let extra = 1
    const onFrame = vi.fn((state: RootState) => {
      if (extra > 0) {
        extra -= 1
        state.invalidate()
      }
    })
    render(
      <Canvas frameloop="demand">
        <Probe onFrame={onFrame} />
      </Canvas>,
    )
    await act(frames)
    // Activation's frame asked for one more; nothing after that.
    expect(onFrame).toHaveBeenCalledTimes(2)
    await act(frames)
    expect(onFrame).toHaveBeenCalledTimes(2)
  })

  it('the clock spans idle gaps: delta is the time since the previous frame, elapsedTime accumulates', async () => {
    const seen: Array<{ delta: number; elapsed: number }> = []
    render(
      <Canvas frameloop="demand">
        <Probe onFrame={(state, delta) => seen.push({ delta, elapsed: state.clock.elapsedTime })} />
      </Canvas>,
    )
    await act(frames)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150))
      latest?.invalidate()
      await frames()
    })
    const last = seen[seen.length - 1] as { delta: number; elapsed: number }
    const before = seen[seen.length - 2] as { delta: number; elapsed: number }
    expect(last.delta).toBeGreaterThanOrEqual(0.14)
    expect(last.elapsed).toBeCloseTo(before.elapsed + last.delta, 6)
  })

  it('a resize is debounced, then updates the camera, the drawing buffer and size, and asks for a frame', async () => {
    vi.stubGlobal('devicePixelRatio', 1)
    const onFrame = vi.fn()
    render(
      <Canvas frameloop="demand" resize={{ debounce: 150 }} dpr={[1, 1.5]}>
        <Probe onFrame={onFrame} />
      </Canvas>,
    )
    await act(frames)
    const gl = lastRenderer()
    const frameCount = onFrame.mock.calls.length

    // The observer's first report of an unchanged box changes nothing and draws nothing.
    await act(async () => {
      for (const observer of [...observers]) observer()
      await new Promise((resolve) => setTimeout(resolve, 200))
    })
    expect(gl.setSize).toHaveBeenCalledTimes(1)
    expect(onFrame.mock.calls.length).toBe(frameCount)

    box = { width: 390, height: 844, top: 0, left: 0 }
    await act(async () => {
      for (const observer of [...observers]) observer()
      await frames()
    })
    // Still inside the debounce.
    expect(gl.setSize).toHaveBeenCalledTimes(1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150))
      await frames()
    })
    expect(gl.setSize).toHaveBeenLastCalledWith(390, 844, true)
    expect(latest?.size).toEqual({ width: 390, height: 844, top: 0, left: 0 })
    expect(latest?.camera.aspect).toBe(390 / 844)
    expect(onFrame.mock.calls.length).toBe(frameCount + 1)
  })

  it('adds no WebGL context listeners: loss and restore belong to the scene', async () => {
    const listen = vi.spyOn(HTMLCanvasElement.prototype, 'addEventListener')
    render(
      <Canvas frameloop="demand">
        <Probe onFrame={() => {}} />
      </Canvas>,
    )
    await act(frames)
    expect(listen.mock.calls.map(([type]) => type)).not.toEqual(expect.arrayContaining([expect.stringMatching(/^webglcontext/)]))
  })

  it('a throw inside a frame goes to onError once and switches that callback off', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const boom = new Error('frame failed')
    const onFrame = vi.fn(() => {
      throw boom
    })
    const onError = vi.fn()
    render(
      <Canvas frameloop="demand" onError={onError}>
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
    const boom = new Error('frame failed')
    const caught = vi.fn()
    render(
      <Catch onError={caught}>
        <Canvas frameloop="demand">
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
    // The boundary unmounted the stage, which released its renderer.
    expect(lastRenderer().forceContextLoss).toHaveBeenCalledTimes(1)
  })

  it('a render error inside the scene reaches the error boundary above the stage', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom = new Error('scene render failed')
    const caught = vi.fn()
    function Broken(): null {
      throw boom
    }
    render(
      <Catch onError={caught}>
        <Canvas frameloop="demand">
          <Broken />
        </Canvas>
      </Catch>,
    )
    await act(frames)
    expect(caught).toHaveBeenCalledWith(boom)
  })

  it('a renderer that cannot be built (no WebGL) reaches the error boundary above the stage', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom = new Error('Error creating WebGL context.')
    const caught = vi.fn()
    render(
      <Catch onError={caught}>
        <Canvas
          frameloop="demand"
          gl={() => {
            throw boom
          }}
        >
          <Probe onFrame={() => {}} />
        </Canvas>
      </Catch>,
    )
    await act(frames)
    expect(caught).toHaveBeenCalledWith(boom)
  })

  it('StrictMode mount, cleanup, mount keeps one live renderer; the final unmount releases it after the scene cleans up', async () => {
    const mounts = vi.fn()
    const unmounts = vi.fn(() => {
      log.push('scene cleanup')
    })
    function Effects(): null {
      const { gl } = useThree()
      useEffect(() => {
        mounts(gl)
        return unmounts
      }, [gl])
      return null
    }
    const view = render(
      <StrictMode>
        <Canvas frameloop="demand">
          <Effects />
          <Probe onFrame={() => {}} />
        </Canvas>
      </StrictMode>,
    )
    await act(frames)
    // The scene's effects replay and leave one mounted, on the one renderer, which was never released.
    expect(renderers).toHaveLength(1)
    expect(mounts.mock.calls.length - unmounts.mock.calls.length).toBe(1)
    expect(mounts.mock.calls.every(([gl]) => gl === renderers[0])).toBe(true)
    expect(lastRenderer().dispose).not.toHaveBeenCalled()
    expect(lastRenderer().forceContextLoss).not.toHaveBeenCalled()

    log.length = 0
    view.unmount()
    await act(frames)
    expect(mounts.mock.calls.length).toBe(unmounts.mock.calls.length)
    // R3F's teardown order: the scene's cleanups, then `dispose`, then the context.
    expect(log).toEqual(['scene cleanup', 'gl.dispose', 'gl.forceContextLoss'])
  })

  it('stops drawing once unmounted', async () => {
    const onFrame = vi.fn()
    const view = render(
      <Canvas frameloop="demand">
        <Probe onFrame={onFrame} />
      </Canvas>,
    )
    await act(frames)
    const state = latest as RootState
    view.unmount()
    await act(frames)
    const calls = onFrame.mock.calls.length
    await act(async () => {
      state.invalidate()
      await frames()
    })
    expect(onFrame.mock.calls.length).toBe(calls)
  })
})

describe('resolveDpr', () => {
  it("clamps the device ratio into a range, as R3F's calculateDpr does", () => {
    expect(resolveDpr([1, 1.5], 2)).toBe(1.5)
    expect(resolveDpr([1, 1.5], 0.5)).toBe(1)
    expect(resolveDpr([1, 1.5], 1.25)).toBe(1.25)
    expect(resolveDpr(2, 3)).toBe(2)
  })
})
