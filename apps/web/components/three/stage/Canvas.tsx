'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { StageContext, type StageRoot } from './context'
import { createStage, type CameraOptions, type Dpr, type Frameloop, type GlOption, type RootState, type Stage } from './stage'

/**
 * The stage: one persistent `<canvas>` with a plain-three renderer, camera, scene, clock and frame loop behind it
 * (`stage.ts`), and the `useThree`/`useFrame` hooks for the scene inside it. Plain-three migration spec § 7, slice S2: it
 * replaces React Three Fiber, whose reconciler, event system and store the Assembly never used (the scene renders no
 * R3F element; everything is imperative through `useThree` and `useFrame`).
 *
 * Lifecycle:
 *   - The container is measured in a layout effect; the renderer is built on the first non-empty measurement (as R3F
 *     built its root only once its box had a size), then `ResizeObserver` and window `resize` re-measure, debounced
 *     by `resize.debounce` ms. A new size (or a new device pixel ratio) updates the camera aspect, the pixel ratio and
 *     the drawing buffer, publishes the new `size`, and asks for a frame.
 *   - The children mount once the renderer exists. After their layout effects (so after every `useFrame` has
 *     subscribed), the loop opens and `onCreated` runs: R3F's order, so `onCreated`'s renderer settings are in place
 *     before the children's passive effects (where the Assembly bakes and compiles) and before the first frame.
 *   - The renderer is released (`dispose`, then `forceContextLoss`) on the real unmount only, after the children's
 *     effect cleanups. StrictMode's effect replay in development (mount, cleanup, mount) keeps the same renderer, so
 *     the scene never sees a lost context or a second renderer.
 *
 * Errors: a throw while building the renderer, or inside a frame when there is no `onError`, is rethrown from this
 * component's render, where the nearest error boundary catches it. A render error in a child reaches that boundary on
 * its own (the children are in this React tree). The stage adds no WebGL context listeners: context loss and restore
 * belong to the scene.
 */

export interface StageProps {
  readonly children?: ReactNode
  /** Renderer options over the stage's defaults (antialias, alpha, `powerPreference: 'high-performance'`), or a factory. */
  readonly gl?: GlOption
  /** The default `PerspectiveCamera` (fov 75, near 0.1, far 1000, at z 5), looking at the origin. */
  readonly camera?: CameraOptions
  /** Pixel ratio, or `[min, max]` around the device's. Default `[1, 2]`. Re-read on every measurement (zoom, another display). */
  readonly dpr?: Dpr
  /** `'demand'`: draw only after `invalidate()`. `'always'`: every animation frame. Default `'always'`. Read once, like `gl` and `camera`. */
  readonly frameloop?: Frameloop
  /** Trailing debounce, in ms, for re-measuring after a resize. Default 0 (immediately). */
  readonly resize?: { readonly debounce?: number }
  /** Styles for the outer wrapper, merged over `position: relative; width/height: 100%; overflow: hidden`. */
  readonly style?: CSSProperties
  /** Runs once the scene has mounted, before the first frame: the place to change renderer settings. */
  readonly onCreated?: (state: RootState) => void
  /**
   * A throw inside a frame. Without this prop the error is rethrown from the stage's render instead, so an error
   * boundary above the stage handles it the same way as a render error. Called at most once per failing callback.
   */
  readonly onError?: (error: unknown) => void
}

/** `{ error }` so that a falsy thrown value still counts as an error. */
type Failure = { readonly error: unknown } | null

/** Opens the loop and runs `onCreated` after the children's layout effects: R3F's `Provider`. */
function Provider({ root, onCreated, children }: { readonly root: StageRoot; readonly onCreated: (state: RootState) => void; readonly children: ReactNode }) {
  const { stage } = root
  useLayoutEffect(() => {
    stage.activate()
    onCreated(stage.state)
  }, [stage, onCreated])
  return <StageContext.Provider value={root}>{children}</StageContext.Provider>
}

export function Canvas({ children, gl, camera, dpr = [1, 2], frameloop = 'always', resize, style, onCreated, onError }: StageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stage = useRef<Stage | null>(null)
  const [root, setRoot] = useState<StageRoot | null>(null)
  const [failure, setFailure] = useState<Failure>(null)
  const debounce = resize?.debounce ?? 0

  // The latest props, read at call time: the renderer is built once, and a new inline callback never rebuilds it.
  const latest = useRef({ gl, camera, dpr, frameloop, onCreated, onError })
  useLayoutEffect(() => {
    latest.current = { gl, camera, dpr, frameloop, onCreated, onError }
  })

  // Stable for the stage's lifetime: the core captures it once.
  const report = useCallback((error: unknown) => {
    const handler = latest.current.onError
    if (handler) handler(error)
    else setFailure({ error })
  }, [])
  const created = useCallback((state: RootState) => latest.current.onCreated?.(state), [])

  useLayoutEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return undefined
    let timer = 0
    const measure = (): void => {
      timer = 0
      const { width, height, top, left } = container.getBoundingClientRect()
      if (!(width > 0 && height > 0)) return
      const options = latest.current
      try {
        const current = stage.current ?? (stage.current = createStage(canvas, { gl: options.gl, camera: options.camera, frameloop: options.frameloop, onError: report }))
        current.resize({ width, height, top, left }, options.dpr)
        const state = current.state
        setRoot((previous) => (previous?.stage === current && previous.state === state ? previous : { stage: current, state }))
      } catch (error) {
        setFailure({ error })
      }
    }
    const schedule = (): void => {
      if (debounce <= 0) return measure()
      window.clearTimeout(timer)
      timer = window.setTimeout(measure, debounce)
    }
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
    observer?.observe(container)
    window.addEventListener('resize', schedule)
    return () => {
      window.clearTimeout(timer)
      observer?.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [debounce, report])

  // The renderer lives until the real unmount. A passive cleanup runs after the children's passive cleanups have been
  // queued in the same flush, and the release waits one microtask more: by then the scene has removed and disposed
  // everything it owns, and a StrictMode replay (cleanup, then mount again, synchronously) has re-claimed the stage.
  const claimed = useRef(false)
  useEffect(() => {
    claimed.current = true
    return () => {
      claimed.current = false
      queueMicrotask(() => {
        if (claimed.current) return
        const current = stage.current
        stage.current = null
        current?.dispose()
      })
    }
  }, [])

  // A throwing render commits nothing, so this is the same as throwing before the hooks; down here the hook order stays fixed.
  if (failure) throw failure.error

  // The same three boxes as R3F's `<Canvas>`, so the canvas's CSS size, and with it `size`, are unchanged. The children
  // render no DOM (the scene is imperative); they sit after the measured box so that anything they did render could not
  // change it.
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', pointerEvents: 'auto', ...style }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>
      {root ? (
        <Provider root={root} onCreated={created}>
          {children}
        </Provider>
      ) : null}
    </div>
  )
}
