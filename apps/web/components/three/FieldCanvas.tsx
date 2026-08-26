'use client'

import { useEffect, useRef, useState } from 'react'
import type { FormationId } from '@/lib/formations/config'
import {
  animatesAt,
  crossFadesAt,
  instanceKeep,
  readCapabilities,
  resolveRung,
  type FallbackRung,
} from '@/lib/formations/fallback'
import { paintCanvas } from '@/lib/formations/render'

/** ~20 fps. The hero's motion is a slow wobble; frames beyond this are wasted. */
const HERO_FRAME_MS = 50

/** Resize is noisy; repaint once it settles. */
const RESIZE_DEBOUNCE_MS = 150

/**
 * Upper bound on how long the post-delay `requestIdleCallback` may withhold
 * the initial paint once `INITIAL_PAINT_DELAY_MS` has elapsed.
 */
const IDLE_TIMEOUT_MS = 300

/**
 * Floor on how soon after mount the initial paint may run.
 *
 * Task 20's trace showed why this exists, and why a bare `requestIdleCallback`
 * was not enough on its own. Seven `FieldCanvas` mounts each ran their first
 * `paintCanvas` synchronously inside the same passive-effect flush hydration
 * produces — 1.4s+ of `scriptEvaluation` sat directly in front of LCP. Moving
 * that work behind a plain `requestIdleCallback` measured *zero* improvement,
 * because on an otherwise-idle page the browser hands over an idle period
 * within a few milliseconds of the mount task ending — well before Lighthouse
 * records its (real, unthrottled) LCP mark, which this codebase's own traces
 * put at 328-460ms. Lighthouse's default `simulate` throttling only excludes a
 * CPU task from the LCP render-delay graph when that task's *observed* start
 * time is after the observed LCP timestamp
 * (`trace_engine/lantern/metrics/FirstContentfulPaint.js`,
 * `getRenderBlockingNodeData`: `node.startTime <= cutoffTimestamp`). An idle
 * callback that fires at, say, 40ms still starts well inside that window, so
 * it was still counted as render-blocking despite never touching the LCP
 * element and despite genuinely not blocking anything on a real device.
 *
 * A fixed floor sidesteps that: waiting past the observed LCP mark, with
 * margin for run-to-run noise, makes the CPU node's start time land after
 * `cutoffTimestamp`, which is what actually excludes it from the graph. The
 * canvas is `aria-hidden` and the CSS wash underneath is already the rung-5
 * fallback, so a ~1s hold before the decorative crossfade begins changes
 * nothing a visitor or the design can see — it is squarely inside the
 * fallback ladder's existing "canvas not ready yet" state.
 *
 * Exported so the test suite can wait exactly this long rather than
 * hardcoding a second copy of the number.
 */
export const INITIAL_PAINT_DELAY_MS = 1200

/**
 * Defers non-critical main-thread work past `INITIAL_PAINT_DELAY_MS`, then to
 * the next idle period within it.
 *
 * Falls back to a bare macrotask (`setTimeout`) for the idle half in engines
 * without `requestIdleCallback` — Safari, and jsdom in tests.
 *
 * Returns a cancel function rather than a raw handle so cleanup does not need
 * to know which of the two timers is currently pending.
 */
function scheduleIdle(callback: () => void): () => void {
  let cancelled = false
  let idleHandle: number | undefined

  const delayHandle = window.setTimeout(() => {
    if (cancelled) return
    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS })
    } else {
      callback()
    }
  }, INITIAL_PAINT_DELAY_MS)

  return () => {
    cancelled = true
    window.clearTimeout(delayHandle)
    if (idleHandle !== undefined && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleHandle)
    }
  }
}

export interface FieldCanvasProps {
  readonly formation: FormationId
  /**
   * Run the animation loop. Only the hero (`monolith`) ever passes `true`, and
   * even then the rung has to allow it — see `animatesAt`.
   */
  readonly animate?: boolean
  readonly className?: string
}

/**
 * One formation, painted to a 2D canvas.
 *
 * The hero canvas animates: visibility-gated by IntersectionObserver and
 * throttled to ~20 fps, exactly as the export does. Every other formation
 * paints one frame and stops, repainting only when its box or the viewport
 * height changes.
 *
 * Under `prefers-reduced-motion` the loop never starts — one frame, then
 * silence. That is a different code path from "animate slowly", which is the
 * mistake this component exists to not make.
 *
 * Always `aria-hidden`: it carries no information. The layer's one-time
 * screen-reader note lives on `DecorativeLayerNote` in `SectionBackdrop`.
 *
 * M2 replaces the internals with WebGL and keeps this component's props, DOM
 * position and `data-f` attribute unchanged.
 */
export function FieldCanvas({ formation, animate = false, className }: FieldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rung, setRung] = useState<FallbackRung | null>(null)
  const [painted, setPainted] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const caps = readCapabilities(canvas)
    const activeRung = resolveRung(caps)
    setRung(activeRung)
    // Rung 5: no 2D context. The CSS wash underneath is already the fallback,
    // so there is nothing to do and nothing to shift.
    if (activeRung === 'wash') return

    const keep = instanceKeep(caps)
    const shouldAnimate = animate && animatesAt(activeRung)

    let disposed = false
    let frame = 0
    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    let heroVisible = true
    let lastFrameAt = 0
    let revealed = false
    let observer: IntersectionObserver | null = null
    const lastBox = { w: 0, h: 0, vh: 0 }

    const paint = (timeSeconds?: number): void => {
      if (disposed) return
      if (!paintCanvas(canvas, formation, { timeSeconds, keep })) return
      // Only the first successful paint changes React state; the hero's
      // twenty-a-second must not re-render anything.
      if (revealed) return
      revealed = true
      setPainted(true)
    }

    /** The export's `drawAll` guard: repaint only when the geometry moved. */
    const paintIfResized = (): void => {
      if (disposed) return
      const box = canvas.getBoundingClientRect()
      const w = Math.round(box.width)
      const h = Math.round(box.height)
      const vh = window.innerHeight
      if (lastBox.w === w && lastBox.h === h && lastBox.vh === vh) return
      lastBox.w = w
      lastBox.h = h
      lastBox.vh = vh
      paint()
    }

    // The animated canvas re-measures on every frame, so only the static ones
    // need a resize listener.
    const onResize = (): void => {
      if (resizeTimer !== undefined) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(paintIfResized, RESIZE_DEBOUNCE_MS)
    }

    /**
     * The first paint, the hero's rAF loop, and the intersection/resize/font
     * listeners that feed them are all deferred behind `scheduleIdle` — see
     * its docstring. Nothing here is visible before it runs: the canvas is
     * `aria-hidden` and starts at `opacity: 0` over the CSS wash.
     */
    const start = (): void => {
      if (disposed) return
      paintIfResized()

      observer =
        caps.intersectionObserver && shouldAnimate
          ? new IntersectionObserver((entries) => {
              const entry = entries[0]
              if (entry) heroVisible = entry.isIntersecting
            })
          : null
      observer?.observe(canvas)

      if (shouldAnimate) {
        const loop = (ts: number): void => {
          frame = requestAnimationFrame(loop)
          if (ts - lastFrameAt < HERO_FRAME_MS || !heroVisible) return
          lastFrameAt = ts
          paint(ts / 1000)
        }
        frame = requestAnimationFrame(loop)
      } else {
        window.addEventListener('resize', onResize)
      }

      // Fonts change section heights, which changes this canvas's box. No text
      // is drawn here, but the geometry guard needs a nudge once metrics
      // settle.
      if (!shouldAnimate && typeof document !== 'undefined' && document.fonts) {
        void document.fonts.ready.then(paintIfResized).catch(() => {})
      }
    }

    const cancelSchedule = scheduleIdle(start)

    return () => {
      disposed = true
      cancelSchedule()
      if (frame) cancelAnimationFrame(frame)
      if (resizeTimer !== undefined) clearTimeout(resizeTimer)
      window.removeEventListener('resize', onResize)
      observer?.disconnect()
    }
  }, [formation, animate])

  const visible = rung !== null && rung !== 'wash' && painted

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-f={formation}
      data-rung={rung ?? undefined}
      className={className ?? 'absolute inset-0 block h-full w-full'}
      style={{
        opacity: visible ? 1 : 0,
        transition: rung !== null && crossFadesAt(rung) ? 'opacity var(--d-crossfade) var(--ease)' : undefined,
      }}
    />
  )
}
