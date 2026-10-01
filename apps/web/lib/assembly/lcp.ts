/**
 * Mount on LCP, not on a 300 ms idle timeout — journey spec § 5.7.
 *
 * Chrome reports `largest-contentful-paint` as a series of candidates (the
 * wordmark at first paint, then the hero lede), so the first entry is not
 * the LCP. Each candidate re-arms a short quiet timer; the wait resolves
 * when no newer candidate has arrived for `LCP_QUIET_MS`, or at once on
 * `first-input`, where Chrome freezes the LCP. Then an idle period with a
 * 2 s ceiling. Where the observer is unsupported it waits for `load` plus
 * one second. One safety ceiling on the whole wait: a page with no entry at
 * all would otherwise never mount, and the ceiling sits well past the
 * measured LCP (2.6–4.5 s simulated on develop) so it can only catch a
 * withheld entry, never pre-empt a slow one.
 */

export const LCP_IDLE_TIMEOUT_MS = 2000
export const LOAD_FALLBACK_MS = 1000
export const LCP_CEILING_MS = 8000
/** No newer LCP candidate for this long means the current one is the LCP. */
export const LCP_QUIET_MS = 500

type Cancel = () => void

function afterIdle(callback: () => void): Cancel {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback, { timeout: LCP_IDLE_TIMEOUT_MS })
    return () => {
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(handle)
    }
  }
  const handle = window.setTimeout(callback, 0)
  return () => window.clearTimeout(handle)
}

function afterLoad(callback: () => void): Cancel {
  let timer = 0
  const arm = (): void => {
    timer = window.setTimeout(callback, LOAD_FALLBACK_MS)
  }
  if (document.readyState === 'complete') {
    arm()
    return () => window.clearTimeout(timer)
  }
  window.addEventListener('load', arm, { once: true })
  return () => {
    window.removeEventListener('load', arm)
    window.clearTimeout(timer)
  }
}

function supportsLcp(): boolean {
  const Observer = window.PerformanceObserver as (typeof PerformanceObserver & { supportedEntryTypes?: readonly string[] }) | undefined
  if (typeof Observer !== 'function') return false
  return Observer.supportedEntryTypes?.includes('largest-contentful-paint') === true
}

/** Runs `callback` once after the LCP has settled and the thread is idle. Returns a cancel. */
export function afterLcp(callback: () => void): Cancel {
  if (!supportsLcp()) return afterLoad(callback)

  let done = false
  let cancelInner: Cancel = () => {}
  const observers: PerformanceObserver[] = []
  let quiet = 0
  let ceiling = 0
  const stop = (): void => {
    done = true
    window.clearTimeout(quiet)
    window.clearTimeout(ceiling)
    for (const observer of observers) observer.disconnect()
  }
  const resolve = (): void => {
    if (done) return
    stop()
    cancelInner = afterIdle(callback)
  }
  const candidate = (): void => {
    if (done) return
    window.clearTimeout(quiet)
    quiet = window.setTimeout(resolve, LCP_QUIET_MS)
  }
  // Armed before `observe`: a buffered entry may be delivered synchronously.
  ceiling = window.setTimeout(resolve, LCP_CEILING_MS)
  try {
    const lcp = new PerformanceObserver(candidate)
    observers.push(lcp)
    lcp.observe({ type: 'largest-contentful-paint', buffered: true })
    const input = new PerformanceObserver(resolve)
    observers.push(input)
    input.observe({ type: 'first-input', buffered: true })
  } catch {
    if (done) return cancelInner
    stop()
    return afterLoad(callback)
  }

  return () => {
    stop()
    cancelInner()
  }
}
