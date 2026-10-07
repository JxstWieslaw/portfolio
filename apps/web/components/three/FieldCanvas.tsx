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
import { heroFlagOn } from '@/lib/hero/gate'
import { paintCanvas } from '@/lib/formations/render'
import { scheduleIdle } from '@/lib/schedule-idle'

/** ~20 fps. The hero's motion is a slow wobble; frames beyond this are wasted. */
const HERO_FRAME_MS = 50

/** Resize is noisy; repaint once it settles. */
const RESIZE_DEBOUNCE_MS = 150

/** A side canvas paints just before it scrolls into view, not once it is on screen. */
const SEEN_ROOT_MARGIN = '200px'

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
 * throttled to ~20 fps, exactly as the export does. Once the WebGL Assembly is
 * live (`html[data-gl="live"]`) its rAF loop stops re-arming; it resumes if the
 * attribute is removed. Every other formation paints one frame and stops,
 * repainting only when its box or the viewport height changes. That one frame
 * waits until the canvas is within ~200 px of the viewport (the hero is never
 * gated this way: see docs/m0-lcp-investigation.md).
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

    // The hero's painted cubes are replaced by the poster while the monolith is the hero (spec § 7): paint nothing.
    // Same answer as the engine gate in AssemblyLayer (one function), not a read of an attribute a script may not have set.
    if (formation === 'monolith' && heroFlagOn(window.location.search)) return

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
    // The hero starts visible; a gated side canvas starts unseen and paints on
    // first intersection (within the observer's margin).
    const gateOnSeen = !animate && caps.intersectionObserver
    let visible = !gateOnSeen
    let lastFrameAt = 0
    let revealed = false
    let observer: IntersectionObserver | null = null
    let glObserver: MutationObserver | null = null
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
      // A gated side canvas that is off-screen skips this; the geometry guard
      // below catches up when it next intersects.
      if (disposed || !visible) return
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

    const isGlLive = (): boolean => document.documentElement.dataset.gl === 'live'

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

      // Hero: plain visibility gate, painted at idle. Side canvas: paints on
      // first intersection and again if its box changed while it was away.
      if (!gateOnSeen) paintIfResized()
      observer =
        caps.intersectionObserver && (gateOnSeen || shouldAnimate)
          ? new IntersectionObserver(
              (entries) => {
                const entry = entries[0]
                if (!entry) return
                visible = entry.isIntersecting
                if (gateOnSeen) paintIfResized()
              },
              gateOnSeen ? { rootMargin: SEEN_ROOT_MARGIN } : undefined,
            )
          : null
      observer?.observe(canvas)

      if (shouldAnimate) {
        const loop = (ts: number): void => {
          // While the WebGL Assembly is live this canvas is faded out, so
          // painting under it is wasted work: stop re-arming instead of waking
          // 60x/s to return early. The last frame stays as the fallback, and
          // the attribute observer below restarts the loop if `data-gl` is
          // removed (context loss).
          if (isGlLive()) {
            frame = 0
            return
          }
          frame = requestAnimationFrame(loop)
          if (ts - lastFrameAt < HERO_FRAME_MS || !visible) return
          lastFrameAt = ts
          paint(ts / 1000)
        }
        frame = requestAnimationFrame(loop)

        glObserver = new MutationObserver(() => {
          if (frame !== 0 || isGlLive()) return
          frame = requestAnimationFrame(loop)
        })
        glObserver.observe(document.documentElement, { attributeFilter: ['data-gl'] })
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
      glObserver?.disconnect()
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
