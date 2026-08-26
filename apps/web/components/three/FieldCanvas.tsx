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
 * Upper bound on how long `requestIdleCallback` may withhold the initial
 * paint before it is forced to run anyway, on an otherwise-busy page.
 */
const IDLE_TIMEOUT_MS = 300

/**
 * Defers non-critical main-thread work to the next idle period.
 *
 * Task 20 previously added a fixed floor here (`INITIAL_PAINT_DELAY_MS`,
 * 1200ms) tuned to push this work past Lighthouse Lantern's LCP
 * render-blocking cutoff (`trace_engine/lantern/metrics/FirstContentfulPaint.js`,
 * `getRenderBlockingNodeData`). That floor was removed: a controlled
 * experiment with canvas painting fully disabled produced the same LCP,
 * meaning the deferred work here was never the bottleneck — the residual
 * cost is page-wide hydration — and the floor was keying real behaviour to
 * one tool's internal accounting rather than to anything a visitor
 * experiences. Deferring past first paint via `requestIdleCallback` is still
 * correct; a metric-tuned constant on top of it was not.
 *
 * Falls back to a bare macrotask (`setTimeout`) in engines without
 * `requestIdleCallback` — Safari, and jsdom in tests.
 *
 * Returns a cancel function rather than a raw handle so cleanup does not need
 * to know which underlying API scheduled the callback.
 */
function scheduleIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const idleHandle = window.requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS })
    return () => {
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleHandle)
    }
  }

  const timeoutHandle = window.setTimeout(callback, 0)
  return () => window.clearTimeout(timeoutHandle)
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
