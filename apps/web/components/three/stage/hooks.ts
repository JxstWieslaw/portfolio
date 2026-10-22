import { useContext, useLayoutEffect, useRef } from 'react'
import { StageContext, type StageRoot } from './context'
import type { FrameSubscriber, RenderCallback, RootState } from './stage'

function useRoot(hook: string): StageRoot {
  const root = useContext(StageContext)
  if (!root) throw new Error(`${hook} can only be used inside the stage's <Canvas>`)
  return root
}

/** The renderer, scene, camera, clock, measured size and `invalidate`. Re-renders the caller when the size changes. */
export function useThree(): RootState {
  return useRoot('useThree').state
}

/**
 * Runs `callback` on every frame the stage draws, lower priorities first, with R3F's semantics: a subscriber with
 * `priority > 0` turns the stage's automatic render off, so the callback owns the draw (the Assembly's priority-1 frame
 * ends in `gl.render`). The latest closure is used each frame, so a new function on every render is fine.
 *
 * The callback runs inside `requestAnimationFrame`, where a throw reaches no React error boundary. The stage catches it,
 * switches this callback off for good, and reports the error to `Canvas`'s `onError` (or rethrows it from `Canvas`'s
 * render to the nearest boundary when there is no `onError`).
 */
export function useFrame(callback: RenderCallback, priority = 0): null {
  const { stage } = useRoot('useFrame')
  const subscriber = useRef<FrameSubscriber>({ callback, failed: false })
  useLayoutEffect(() => {
    subscriber.current.callback = callback
  }, [callback])
  useLayoutEffect(() => stage.subscribe(subscriber.current, priority), [stage, priority])
  return null
}
