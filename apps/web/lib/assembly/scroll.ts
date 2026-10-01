/**
 * The Assembly's scroll store — spec § 4.4.
 *
 * PURE. Given the formation sections' boxes in document order, the scroll
 * offset and the viewport height, it answers one question: which two
 * formations is the fixed layer between right now, how far along, and how
 * visible should it be.
 *
 * The formation shown is the one whose section holds the viewport centre.
 * Each section boundary owns a transition band of ±`BAND` viewport heights;
 * inside the band the mix eases from the formation above to the one below.
 * Summing the eased progress of every boundary gives one continuous
 * "fractional section index", which stays monotonic even when a short section
 * (the proof strip) makes two bands overlap.
 *
 * Sections with no formation (timeline, writing) are flat by design. Over them
 * the layer's opacity goes to 0 so the fixed canvas disappears behind the flat
 * sections, and the cubes hold the last formation so nothing jumps when it
 * fades back in.
 */

import { FORMATION_IDS, type FormationId } from '@/lib/formations/config'

export interface SectionBox {
  readonly id: string
  readonly formation: FormationId | null
  /** Document-space top, px. */
  readonly top: number
  readonly height: number
}

export interface ScrollState {
  readonly from: FormationId
  readonly to: FormationId
  /** Eased, 0..1. `0` means `from` is fully shown. */
  readonly mix: number
  /** 0..1. `0` over the flat sections. */
  readonly opacity: number
}

/** Half-width of each boundary's transition band, as a fraction of viewport height. */
export const BAND = 0.35

const IDLE: ScrollState = { from: 'monolith', to: 'monolith', mix: 0, opacity: 0 }

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/** Smoothstep — the ease-in-out every transition band uses. */
export function easeInOut(t: number): number {
  const u = clamp01(t)
  return u * u * (3 - 2 * u)
}

export function isFormationId(value: unknown): value is FormationId {
  return typeof value === 'string' && (FORMATION_IDS as readonly string[]).includes(value)
}

/**
 * The formation a section index resolves to. A flat section borrows the
 * nearest formation above it (or below, at the very top) so the cubes hold
 * still while the layer fades out and in.
 */
function formationAt(boxes: readonly SectionBox[], index: number): FormationId {
  for (let i = index; i >= 0; i -= 1) {
    const formation = boxes[i]?.formation
    if (formation) return formation
  }
  for (let i = index + 1; i < boxes.length; i += 1) {
    const formation = boxes[i]?.formation
    if (formation) return formation
  }
  return 'monolith'
}

export function resolveScroll(boxes: readonly SectionBox[], scrollY: number, viewportHeight: number): ScrollState {
  if (boxes.length === 0 || viewportHeight <= 0) return IDLE

  const centre = scrollY + viewportHeight / 2
  const band = viewportHeight * BAND

  // Fractional section index: each boundary contributes its eased progress.
  let fractional = 0
  for (const box of boxes.slice(1)) {
    fractional += easeInOut((centre - (box.top - band)) / (2 * band))
  }

  const last = boxes.length - 1
  const fromIndex = Math.min(last, Math.floor(fractional))
  const toIndex = Math.min(last, fromIndex + 1)
  const mix = fromIndex === toIndex ? 0 : clamp01(fractional - fromIndex)

  const fromOpacity = boxes[fromIndex]?.formation ? 1 : 0
  const toOpacity = boxes[toIndex]?.formation ? 1 : 0

  return {
    from: formationAt(boxes, fromIndex),
    to: formationAt(boxes, toIndex),
    mix,
    opacity: fromOpacity + (toOpacity - fromOpacity) * mix,
  }
}
