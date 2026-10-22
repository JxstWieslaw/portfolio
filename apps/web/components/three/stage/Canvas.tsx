'use client'

import { createRoot, type ReconcilerRoot, type RenderProps, type RootState } from '@react-three/fiber'
import {
  Component,
  StrictMode,
  Suspense,
  useCallback,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import useMeasure from 'react-use-measure'
import { FrameErrorContext, type FrameErrorSink } from './frame-errors'

/**
 * The stage: one persistent `<canvas>` hosting an R3F root, without R3F's `<Canvas>` component.
 *
 * Why not `<Canvas>`: it runs `extend(THREE)`, which registers every `three` export as a JSX element and so pulls the
 * whole namespace (about 43 kB gz) into the lazy core. The scene renders no R3F element at all (everything is
 * imperative through `useThree` and `useFrame`), so it needs none of that catalogue. Plain-three migration spec § 7, S1.
 *
 * This is R3F 9.8's `CanvasImpl` (`@react-three/fiber/dist/react-three-fiber.esm.js`) with four things left out, each
 * because nothing here uses it:
 *   - `extend(THREE)`: no JSX elements are rendered.
 *   - The pointer event manager (`events`): the scene reads `pointermove` on `window` itself; nothing is raycast.
 *   - `eventSource`, `eventPrefix`, `onPointerMissed`, the forwarded canvas ref: unused.
 *   - its-fine's context bridge: the scene reads no React context from above the canvas (it gets everything as props).
 *     The bridge also carried StrictMode into the R3F tree; the App Router turns StrictMode on in development only,
 *     and so does this file (`DEV_STRICT`), so the scene's effects still run mount, cleanup, mount in `next dev`.
 * Everything else is the same code path: `createRoot(canvas).configure(...)` builds the renderer, camera and scene
 * with R3F's own defaults (antialias, alpha, ACES Filmic tone mapping, sRGB output, colour management on, no
 * shadows), the size comes from `react-use-measure` with the same options, and the root is configured and rendered on
 * every commit exactly as `<Canvas>` did, so prop changes reach the scene in the same order.
 *
 * One thing is added: frame errors. A throw inside a `useFrame` callback happens in R3F's `requestAnimationFrame`
 * loop, outside React, so no error boundary sees it. The stage's `useFrame` catches it and reports it here: to
 * `onError` when given, otherwise it is rethrown from this component's render, where the nearest boundary catches it.
 */

/** The App Router's `reactStrictMode` default: on in development, off in a production build. */
const DEV_STRICT = process.env.NODE_ENV !== 'production'

/** The same `useLayoutEffect` R3F picks in a browser (this file never renders on the server: it is lazy, client only). */
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

export interface StageProps
  extends Pick<RenderProps<HTMLCanvasElement>, 'gl' | 'camera' | 'dpr' | 'frameloop' | 'shadows' | 'linear' | 'flat' | 'legacy' | 'scene'> {
  readonly children?: ReactNode
  /** `react-use-measure` options; R3F's default is `{ scroll: true, debounce: { scroll: 50, resize: 0 } }`. */
  readonly resize?: Parameters<typeof useMeasure>[0]
  /** Styles for the outer wrapper, merged over `position: relative; width/height: 100%; overflow: hidden`. */
  readonly style?: CSSProperties
  /** Runs once the root exists, before the first frame: the place to change renderer settings. */
  readonly onCreated?: (state: RootState) => void
  /**
   * A throw inside a frame callback. Without this prop the error is rethrown from the stage's render instead, so an
   * error boundary above the stage handles it the same way as a render error. Called at most once per callback.
   */
  readonly onError?: (error: unknown) => void
}

interface BoundaryProps {
  readonly set: (error: unknown) => void
  readonly children: ReactNode
}

/** R3F's inner boundary: an error in the R3F tree is handed to the DOM side, which rethrows it from its own render. */
class StageBoundary extends Component<BoundaryProps, { error: boolean }> {
  override state = { error: false }

  static getDerivedStateFromError(): { error: boolean } {
    return { error: true }
  }

  override componentDidCatch(error: unknown): void {
    this.props.set(error)
  }

  override render(): ReactNode {
    return this.state.error ? null : this.props.children
  }
}

/** R3F's `Block`: a suspended scene suspends the stage too, so the Suspense boundary above it shows its fallback. */
function Block({ set }: { readonly set: (block: Promise<never> | false) => void }) {
  useIsomorphicLayoutEffect(() => {
    set(new Promise<never>(() => {}))
    return () => set(false)
  }, [set])
  return null
}

/** `{ error }` so that a falsy thrown value still counts as an error. */
type Failure = { readonly error: unknown } | null

export function Canvas({ children, resize, style, gl, camera, dpr, frameloop, shadows, linear, flat, legacy, scene, onCreated, onError }: StageProps) {
  const [containerRef, containerRect] = useMeasure({ scroll: true, debounce: { scroll: 50, resize: 0 }, ...resize })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [block, setBlock] = useState<Promise<never> | false>(false)
  const [failure, setFailure] = useState<Failure>(null)
  const setError = useCallback((error: unknown) => setFailure({ error }), [])
  // A renderer that is still being created (only an async `gl` factory does that) re-renders this once it lands.
  const [, setSettled] = useState(0)
  const root = useRef<ReconcilerRoot<HTMLCanvasElement> | null>(null)

  // The latest callbacks, read at call time, so a new inline function never reconfigures the root.
  const created = useRef(onCreated)
  const errorProp = useRef(onError)
  useIsomorphicLayoutEffect(() => {
    created.current = onCreated
    errorProp.current = onError
  }, [onCreated, onError])

  // Stable for the root's lifetime: the frame hooks capture it once.
  const sink = useRef<FrameErrorSink>((error) => {
    const report = errorProp.current
    if (report) report(error)
    else setError(error)
  })

  // Insertion effects survive StrictMode's effect replay: only the final removal releases the root (as in R3F).
  useInsertionEffect(
    () => () => {
      const current = root.current
      root.current = null
      current?.unmount()
    },
    [],
  )

  useIsomorphicLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!(containerRect.width > 0 && containerRect.height > 0 && canvas)) return
    if (!root.current) root.current = createRoot(canvas)
    root.current
      .configure({
        gl,
        scene,
        shadows,
        linear,
        flat,
        legacy,
        frameloop,
        dpr,
        camera,
        size: containerRect,
        onCreated: (state) => created.current?.(state),
      })
      .catch(setError)

    const ready = root.current.ready
    if (ready.status === 'fulfilled') {
      const tree = (
        <FrameErrorContext.Provider value={sink.current}>
          <StageBoundary set={setError}>
            <Suspense fallback={<Block set={setBlock} />}>{children ?? null}</Suspense>
          </StageBoundary>
        </FrameErrorContext.Provider>
      )
      root.current.render(DEV_STRICT ? <StrictMode>{tree}</StrictMode> : tree)
    } else if (ready.status === 'pending') {
      ready.then(
        () => setSettled((n) => n + 1),
        () => {},
      )
    }
  })

  // Before React 19.2 a canvas that Suspense removed (rather than hid) skips the insertion cleanup; R3F covers it here.
  useEffect(() => {
    const canvas = canvasRef.current
    return () => {
      if (canvas && !canvas.isConnected) root.current?.unmount()
    }
  }, [])

  // Suspend while the scene is suspended; rethrow anything the scene threw. A throwing render commits nothing, so
  // this is the same as R3F's throws at the top of `CanvasImpl`; down here they keep the hook order unconditional.
  if (block) throw block
  if (failure) throw failure.error

  // The same three boxes as R3F's `<Canvas>`, so the canvas's CSS size, and with it `size`, are unchanged.
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', pointerEvents: 'auto', ...style }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>
    </div>
  )
}
