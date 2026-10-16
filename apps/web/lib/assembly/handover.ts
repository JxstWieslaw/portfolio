/**
 * The hero-to-stream hand-over of the cubes — hero monolith spec § 4.4 and S3. PURE.
 *
 * While the monolith engine owns the hero, the cube rig has no monolith of its own to show: the procedural cube
 * monolith must never appear next to the new one. So the monolith side of every morph is drawn at size 0, and the
 * cubes grow from nothing as they travel to the stream (and shrink back to nothing on the way up). Everything else is
 * full size, so no other formation changes.
 */

import type { BundleKind } from '@/lib/assembly/targets'

export interface Fades {
  /** Size multiplier of the formation being left, 0..1. */
  readonly from: number
  /** Size multiplier of the formation being approached, 0..1. */
  readonly to: number
}

const FULL: Fades = { from: 1, to: 1 }

/**
 * `owned`: the hero engine has painted this visit and has not given up (it stays true while the engine is paused
 * out of view, so the old cube monolith cannot return behind the fading one). `cloud` is the on-load seed, never the
 * hero's own picture, and is left alone.
 */
export function handoverFades(owned: boolean, from: BundleKind, to: BundleKind): Fades {
  if (!owned || (from !== 'monolith' && to !== 'monolith')) return FULL
  return { from: from === 'monolith' ? 0 : 1, to: to === 'monolith' ? 0 : 1 }
}
