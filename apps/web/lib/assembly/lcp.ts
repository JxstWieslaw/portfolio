/**
 * Mount on LCP, not on a 300 ms idle timeout — journey spec § 5.7.
 *
 * Waits for the first `largest-contentful-paint` entry (buffered, so a
 * subscription after the paint still sees it), then an idle period with a
 * 2 s ceiling. Where the observer or the entry type is unsupported it waits
 * for `load` plus one second. One safety ceiling on the LCP wait itself:
 * Chrome stops reporting candidates after the first input, so a page with no
 * entry at all would otherwise never mount. The ceiling sits well past the
 * measured LCP (2.6–4.5 s simulated on develop, the hero lede) so it can only
 * catch a withheld entry, never pre-empt a slow one.
 */

export const LCP_IDLE_TIMEOUT_MS = 2000
export const LOAD_FALLBACK_MS = 1000
export const LCP_CEILING_MS = 8000

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
  const types = Observer.supportedEntryTypes
  return !types || types.includes('largest-contentful-paint')
}

/** Runs `callback` once after the LCP has painted and the thread is idle. Returns a cancel. */
export function afterLcp(callback: () => void): Cancel {
  if (!supportsLcp()) return afterLoad(callback)

  let done = false
  let cancelInner: Cancel = () => {}
  let observer: PerformanceObserver | null = null
  let ceiling = 0
  const fire = (): void => {
    if (done) return
    done = true
    window.clearTimeout(ceiling)
    observer?.disconnect()
    cancelInner = afterIdle(callback)
  }
  try {
    observer = new PerformanceObserver(fire)
    observer.observe({ type: 'largest-contentful-paint', buffered: true })
  } catch {
    return afterLoad(callback)
  }
  ceiling = window.setTimeout(fire, LCP_CEILING_MS)

  return () => {
    done = true
    window.clearTimeout(ceiling)
    observer?.disconnect()
    cancelInner()
  }
}
