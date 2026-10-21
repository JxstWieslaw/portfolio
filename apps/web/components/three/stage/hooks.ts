import { useFrame as useR3FFrame, type RenderCallback } from '@react-three/fiber'
import { useContext, useRef } from 'react'
import { FrameErrorContext } from './frame-errors'

export { useThree } from '@react-three/fiber'

/**
 * R3F's `useFrame`, same arguments and same scheduling, with the callback guarded.
 *
 * A subscriber with `priority > 0` turns R3F's automatic render off: the callback owns the draw (the Assembly's
 * priority-1 frame ends in `gl.render`). The callback runs inside R3F's `requestAnimationFrame` loop, where a throw
 * reaches no React error boundary; here it is caught, the callback is switched off for good (a frame that threw once
 * would throw on every frame after it), and the error goes to the stage (`Canvas`'s `onError`, or a rethrow from
 * its render to the nearest boundary).
 */
export function useFrame(callback: RenderCallback, priority = 0): null {
  const report = useContext(FrameErrorContext)
  const failed = useRef(false)
  // R3F keeps the latest closure in a ref of its own, so a new function each render is fine here too.
  return useR3FFrame((state, delta, frame) => {
    if (failed.current) return
    try {
      callback(state, delta, frame)
    } catch (error) {
      failed.current = true
      console.warn('[stage] a frame callback threw and was switched off', error)
      report(error)
    }
  }, priority)
}
