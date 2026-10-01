/**
 * Project-card attractors — journey spec § 3.3.
 *
 * PURE. The hovered card's box (viewport CSS px) becomes a point on the z = 0
 * plane with the same pixel→world maths the framing uses; the scene moves it
 * into group space and the shader pulls nearby cubes toward it. On touch the
 * card nearest the viewport centre is the attractor.
 */

import { pixelToWorld, type Frame } from '@/lib/assembly/targets'
import type { Box } from '@/lib/assembly/attractor-store'

export { attractorStore, boxCentre, createAttractorStore, nearestToCentre, type AttractorStore, type Box } from '@/lib/assembly/attractor-store'

/** Supported attractors (`uAttractors[8]`); the bento uses one. */
export const MAX_ATTRACTORS = 8
/** Cubes within this many model units drift toward the attractor. */
export const ATTRACT_RADIUS = 0.9
export const ATTRACT_STRENGTH = 0.35
/** Strength eases 0 → 1 at this rate, per second. */
export const ATTRACT_RISE = 6
/** The pull at full falloff, model units: `falloff² · 0.35 · 0.9` (§ 3.3). */
export const ATTRACT_PULL_MODEL = ATTRACT_STRENGTH * ATTRACT_RADIUS

/** The box's centre on the z = 0 plane, world units, under the straight-on camera. */
export function attractorPoint(frame: Frame, box: Box): readonly [number, number, number] {
  const [x, y] = pixelToWorld(frame, box.left + box.width / 2, box.top + box.height / 2)
  return [x, y, 0]
}

