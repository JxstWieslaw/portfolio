import { createContext } from 'react'

/** Where a frame callback's throw goes: the stage that hosts it. */
export type FrameErrorSink = (error: unknown) => void

/**
 * Provided by the stage inside its R3F root. The default (a frame hook used outside a stage) rethrows on a microtask,
 * so the error is never swallowed: it reaches `window.onerror` exactly as an uncaught frame error did before.
 */
export const FrameErrorContext = createContext<FrameErrorSink>((error) => {
  queueMicrotask(() => {
    throw error
  })
})
