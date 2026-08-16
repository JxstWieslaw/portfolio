/**
 * The five-rung fallback ladder — reconciliation § 5.1, foundations § 4.6.
 *
 *   1. `live`              live canvas; the hero animates, the rest paint once
 *   2. `reduced-instances` fewer cubes on modest hardware, same composition
 *   3. `reduced-motion`    one static frame, cross-faded in at --d-crossfade
 *   4. `static`            one static frame, no cross-fade
 *   5. `wash`              the section's radial accent wash alone, pure CSS
 *
 * **Layout never shifts between rungs.** Every rung occupies the identical box;
 * the wash sits under the canvas at all times, so rung 5 is not a swap but a
 * reveal of what was already there.
 *
 * `resolveRung` is pure so the ladder can be tested as a table. Only
 * `readCapabilities` touches the DOM.
 */

import { getContext2d } from './render'

export const FALLBACK_RUNGS = ['live', 'reduced-instances', 'reduced-motion', 'static', 'wash'] as const

export type FallbackRung = (typeof FALLBACK_RUNGS)[number]

export interface CapabilitySnapshot {
  /** `getContext('2d')` returned a context. */
  readonly canvas2d: boolean
  /** `IntersectionObserver` exists — without it nothing can be visibility-gated. */
  readonly intersectionObserver: boolean
  /** `prefers-reduced-motion: reduce`. */
  readonly reducedMotion: boolean
  /** `prefers-reduced-data`, or hardware that says "do less". */
  readonly lowPower: boolean
}

/** Instances kept on the reduced rung. Composition survives; the crowd thins. */
export const REDUCED_KEEP = 0.45

/** Cores at or below this read as modest hardware. */
const MODEST_CORES = 4

/** GB of device memory at or below this read as modest hardware. */
const MODEST_MEMORY_GB = 4

/**
 * Descends the ladder, least capable first, and stops at the first rung the
 * environment can actually stand on.
 */
export function resolveRung(caps: CapabilitySnapshot): FallbackRung {
  if (!caps.canvas2d) return 'wash'
  if (!caps.intersectionObserver) return 'static'
  if (caps.reducedMotion) return 'reduced-motion'
  if (caps.lowPower) return 'reduced-instances'
  return 'live'
}

/**
 * Whether a canvas at this rung may run its animation loop. Only the hero ever
 * asks — every other formation paints once regardless.
 *
 * `reduced-motion` is a hard no. It is not "animate more slowly": under
 * `prefers-reduced-motion` the loop never starts and exactly one frame is
 * painted.
 */
export function animatesAt(rung: FallbackRung): boolean {
  return rung === 'live' || rung === 'reduced-instances'
}

/**
 * Whether the canvas fades in over `--d-crossfade` once it has paint.
 *
 * `--d-crossfade` is deliberately kept outside the reduced-motion override in
 * `globals.css` (reconciliation § 2) — an opacity-only cross-fade is safe under
 * reduced motion, which is why rung 3 keeps it and rung 4 is the one that
 * drops it.
 */
export function crossFadesAt(rung: FallbackRung): boolean {
  return rung === 'live' || rung === 'reduced-instances' || rung === 'reduced-motion'
}

/**
 * Instance fraction. Driven by the hardware signal rather than the rung, so a
 * modest device under reduced motion still gets the lighter cloud even though
 * the motion rung outranks it.
 */
export function instanceKeep(caps: CapabilitySnapshot): number {
  return caps.lowPower ? REDUCED_KEEP : 1
}

function matches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia(query).matches
  } catch {
    return false
  }
}

function hasModestHardware(): boolean {
  if (typeof navigator === 'undefined') return false
  const nav: Navigator & { deviceMemory?: number } = navigator
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= MODEST_CORES) {
    return true
  }
  return typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory <= MODEST_MEMORY_GB
}

/** Probes the live environment. Called once per canvas mount. */
export function readCapabilities(canvas: HTMLCanvasElement): CapabilitySnapshot {
  return {
    canvas2d: getContext2d(canvas) !== null,
    intersectionObserver: typeof IntersectionObserver !== 'undefined',
    reducedMotion: matches('(prefers-reduced-motion: reduce)'),
    lowPower: matches('(prefers-reduced-data: reduce)') || hasModestHardware(),
  }
}
