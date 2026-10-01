/**
 * Upper bound on how long `requestIdleCallback` may withhold deferred work
 * before it is forced to run anyway, on an otherwise-busy page.
 */
const IDLE_TIMEOUT_MS = 300

/**
 * Defers non-critical main-thread work to the next idle period.
 *
 * Task 20 previously added a fixed floor here (`INITIAL_PAINT_DELAY_MS`,
 * 1200ms) tuned to push this work past Lighthouse Lantern's LCP
 * render-blocking cutoff. That floor was removed: a controlled experiment with
 * canvas painting fully disabled produced the same LCP, meaning the deferred
 * work here was never the bottleneck — the residual cost is page-wide
 * hydration — and the floor was keying real behaviour to one tool's internal
 * accounting rather than to anything a visitor experiences. Deferring past
 * first paint via `requestIdleCallback` is still correct; a metric-tuned
 * constant on top of it was not.
 *
 * Falls back to a bare macrotask (`setTimeout`) in engines without
 * `requestIdleCallback` — Safari, and jsdom in tests.
 *
 * Returns a cancel function rather than a raw handle so cleanup does not need
 * to know which underlying API scheduled the callback.
 *
 * Shared by the per-section 2D canvases (`FieldCanvas`) and the WebGL
 * `AssemblyLayer`, which both must stay off the critical path.
 */
export function scheduleIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const idleHandle = window.requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS })
    return () => {
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleHandle)
    }
  }

  const timeoutHandle = window.setTimeout(callback, 0)
  return () => window.clearTimeout(timeoutHandle)
}
