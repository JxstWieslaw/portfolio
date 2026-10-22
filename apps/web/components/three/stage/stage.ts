import {
  ACESFilmicToneMapping,
  Clock,
  ColorManagement,
  PCFSoftShadowMap,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
  type WebGLRendererParameters,
} from 'three'

/**
 * The stage's imperative core: one renderer, one camera, one scene, one clock and an on-demand frame loop, over plain
 * three. No React here: `Canvas` and the hooks wrap it. Plain-three migration spec § 8, slice S2.
 *
 * Every default below is the one React Three Fiber 9.8 applied when it built the root (`createRoot().configure()`), so
 * the programs, draw calls and pixels are the same as under R3F; the cube parity job proves it. The values that matter
 * for that, and where R3F set them:
 *   - renderer: `{ powerPreference: 'high-performance', antialias: true, alpha: true, ...gl }` (`createRenderer`);
 *   - colour: `ColorManagement.enabled = true`, `outputColorSpace = SRGBColorSpace`, `toneMapping =
 *     ACESFilmicToneMapping` (`legacy`, `linear`, `flat` all false; change them in `onCreated`, as the Assembly does);
 *   - shadows off, with the map type R3F leaves behind (`PCFSoftShadowMap`): the type is part of three's program key;
 *   - camera: `PerspectiveCamera(75, 0, 0.1, 1000)` at z 5, the given options over it, then `lookAt(0, 0, 0)`;
 *   - size: camera aspect, `setPixelRatio`, then `setSize(width, height, true)` (R3F's store subscriber, `updateStyle`
 *     true for an `HTMLCanvasElement`, so the canvas gets an explicit CSS size in px);
 *   - loop: R3F's `loop`/`update`/`invalidate` for one root (below).
 */

export type Frameloop = 'always' | 'demand'

/** The measured CSS box of the canvas's container, as `getBoundingClientRect` reports it. */
export interface Size {
  readonly width: number
  readonly height: number
  readonly top: number
  readonly left: number
}

/** What `useThree` returns and every frame callback receives. A new object whenever `size` changes. */
export interface RootState {
  readonly gl: WebGLRenderer
  readonly scene: Scene
  readonly camera: PerspectiveCamera
  readonly clock: Clock
  readonly size: Size
  readonly frameloop: Frameloop
  /** Asks for one frame. Calls in the same frame coalesce; a call from inside a frame asks for the next one. */
  readonly invalidate: () => void
}

/** A frame callback: the latest state and the seconds since the previous executed frame (they span idle gaps). */
export type RenderCallback = (state: RootState, delta: number) => void

export interface CameraOptions {
  readonly fov?: number
  readonly near?: number
  readonly far?: number
  readonly position?: readonly [x: number, y: number, z: number]
}

/** A fixed pixel ratio, or `[min, max]` clamping the device's. */
export type Dpr = number | readonly [min: number, max: number]

/** The base parameters the stage builds the renderer with; a `gl` factory receives them. */
export type RendererDefaults = WebGLRendererParameters & { readonly canvas: HTMLCanvasElement }

/** Renderer options merged over the defaults, or a factory that builds the renderer (the stage then owns it). */
export type GlOption = Partial<WebGLRendererParameters> | ((defaults: RendererDefaults) => WebGLRenderer)

export interface StageOptions {
  readonly gl?: GlOption
  readonly camera?: CameraOptions
  readonly frameloop?: Frameloop
  /** A frame callback or the automatic render threw. Called once per failing callback, which is then switched off. */
  readonly onError: (error: unknown) => void
}

/** A frame subscription. Held by reference, so the hook can swap `callback` without resubscribing. */
export interface FrameSubscriber {
  callback: RenderCallback
  /** Set once the callback has thrown: it is never called again (a frame that threw once throws on every frame). */
  failed: boolean
}

export interface Stage {
  /** The latest state. */
  readonly state: RootState
  /** Adds a frame callback; lower priorities run first. Any priority above 0 turns the automatic render off. */
  subscribe(subscriber: FrameSubscriber, priority: number): () => void
  /** Opens the loop (R3F's `internal.active`) and asks for the first frame. Until then `invalidate` does nothing. */
  activate(): void
  /** Applies a measured size and pixel ratio. Returns `true` when the state changed (and a frame was asked for). */
  resize(size: Size, dpr: Dpr): boolean
  /** Stops the loop and releases the renderer and its context. Idempotent. */
  dispose(): void
}

/** R3F's `calculateDpr`: a range clamps the device ratio (2 where the device does not say). */
export function resolveDpr(dpr: Dpr, device: number = typeof window === 'undefined' ? 1 : (window.devicePixelRatio ?? 2)): number {
  return typeof dpr === 'number' ? dpr : Math.min(Math.max(dpr[0], device), dpr[1])
}

interface Subscription {
  readonly subscriber: FrameSubscriber
  readonly priority: number
}

export function createStage(canvas: HTMLCanvasElement, { gl: glOption, camera: cameraOptions, frameloop = 'always', onError }: StageOptions): Stage {
  const defaults: RendererDefaults = { canvas, powerPreference: 'high-performance', antialias: true, alpha: true }
  const gl = typeof glOption === 'function' ? glOption(defaults) : new WebGLRenderer({ ...defaults, ...glOption })

  const camera = new PerspectiveCamera(75, 0, 0.1, 1000)
  camera.position.z = 5
  if (cameraOptions?.fov !== undefined) camera.fov = cameraOptions.fov
  if (cameraOptions?.near !== undefined) camera.near = cameraOptions.near
  if (cameraOptions?.far !== undefined) camera.far = cameraOptions.far
  if (cameraOptions?.position) camera.position.set(...cameraOptions.position)
  camera.lookAt(0, 0, 0)

  const scene = new Scene()
  const clock = new Clock()
  clock.start()

  ColorManagement.enabled = true
  if (gl.shadowMap) {
    gl.shadowMap.enabled = false
    gl.shadowMap.type = PCFSoftShadowMap
  }
  gl.outputColorSpace = SRGBColorSpace
  gl.toneMapping = ACESFilmicToneMapping

  let subscriptions: Subscription[] = []
  /** How many subscriptions have a priority above 0: any at all and the stage never renders by itself. */
  let owners = 0
  let active = false
  let disposed = false
  let running = false
  let inFrame = false
  /** Frames still owed: 1 after an `invalidate`, 2 when it came from inside a frame (that frame uses one up). */
  let owed = 0
  let raf = 0
  let renderFailed = false

  const fail = (error: unknown, what: string): void => {
    console.warn(`[stage] ${what} threw and was switched off`, error)
    onError(error)
  }

  /** One frame: every callback in priority order, then three's own render unless a callback owns the draw. */
  const update = (): number => {
    const delta = clock.getDelta()
    const current = state
    for (const { subscriber } of subscriptions) {
      if (subscriber.failed) continue
      try {
        subscriber.callback(current, delta)
      } catch (error) {
        subscriber.failed = true
        fail(error, 'a frame callback')
      }
    }
    if (!owners && !renderFailed) {
      try {
        gl.render(scene, camera)
      } catch (error) {
        renderFailed = true
        fail(error, "the stage's own render")
      }
    }
    owed = Math.max(0, owed - 1)
    return state.frameloop === 'always' ? 1 : owed
  }

  /** R3F's loop: the next frame is requested up front and cancelled when nothing asked for it. */
  const loop = (): void => {
    raf = requestAnimationFrame(loop)
    running = true
    let repeat = 0
    if (active && (state.frameloop === 'always' || owed > 0)) {
      inFrame = true
      try {
        repeat = update()
      } finally {
        inFrame = false
      }
    }
    if (repeat === 0) {
      running = false
      cancelAnimationFrame(raf)
      raf = 0
    }
  }

  const invalidate = (): void => {
    if (!active || disposed) return
    owed = inFrame ? 2 : 1
    if (!running) {
      running = true
      raf = requestAnimationFrame(loop)
    }
  }

  let state: RootState = { gl, scene, camera, clock, size: { width: 0, height: 0, top: 0, left: 0 }, frameloop, invalidate }
  let ratio = 0

  return {
    get state() {
      return state
    },
    subscribe(subscriber, priority) {
      const subscription: Subscription = { subscriber, priority }
      // Stable sort: equal priorities keep the order they subscribed in, as in R3F.
      subscriptions = [...subscriptions, subscription].sort((a, b) => a.priority - b.priority)
      if (priority > 0) owners += 1
      return () => {
        if (!subscriptions.includes(subscription)) return
        subscriptions = subscriptions.filter((entry) => entry !== subscription)
        if (priority > 0) owners -= 1
      }
    },
    activate() {
      if (disposed || active) return
      active = true
      invalidate()
    },
    resize(size, dpr) {
      if (disposed) return false
      const nextRatio = resolveDpr(dpr)
      const previous = state.size
      const boxChanged = size.width !== previous.width || size.height !== previous.height
      const moved = size.top !== previous.top || size.left !== previous.left
      if (!boxChanged && !moved && nextRatio === ratio) return false
      if (boxChanged || moved) state = { ...state, size: { width: size.width, height: size.height, top: size.top, left: size.left } }
      if (boxChanged || nextRatio !== ratio) {
        ratio = nextRatio
        camera.aspect = size.width / size.height
        camera.updateProjectionMatrix()
        if (ratio > 0) gl.setPixelRatio(ratio)
        gl.setSize(size.width, size.height, true)
      }
      invalidate()
      return true
    },
    dispose() {
      if (disposed) return
      disposed = true
      active = false
      running = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      subscriptions = []
      owners = 0
      // R3F's `disposeRenderer`: programs and caches first, then the context itself (browsers cap live contexts, and
      // `dispose` alone keeps it until garbage collection). Each step is attempted on its own.
      try {
        gl.dispose()
      } catch (error) {
        console.warn('[stage] disposing the renderer threw', error)
      }
      try {
        gl.forceContextLoss()
      } catch (error) {
        console.warn('[stage] releasing the WebGL context threw', error)
      }
    },
  }
}
