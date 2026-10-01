/**
 * Project-card attractors — journey spec § 3.3.
 *
 * PURE. The hovered card's box (viewport CSS px) becomes a point on the z = 0
 * plane with the same pixel→world maths the framing uses; the scene moves it
 * into group space and the shader pulls nearby cubes toward it. On touch the
 * card nearest the viewport centre is the attractor.
 */

import { pixelToWorld, type Frame } from '@/lib/assembly/targets'

export interface Box {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** Supported attractors (`uAttractors[8]`); the bento uses one. */
export const MAX_ATTRACTORS = 8
/** Cubes within this many model units drift toward the attractor. */
export const ATTRACT_RADIUS = 0.9
export const ATTRACT_STRENGTH = 0.35
/** Strength eases 0 → 1 at this rate, per second. */
export const ATTRACT_RISE = 6
/** The pull at full falloff, model units: `falloff² · 0.35 · 0.9` (§ 3.3). */
export const ATTRACT_PULL_MODEL = ATTRACT_STRENGTH * ATTRACT_RADIUS

/** The box's centre in CSS px. */
export function boxCentre(box: Box): readonly [number, number] {
  return [box.left + box.width / 2, box.top + box.height / 2]
}

/** The box's centre on the z = 0 plane, world units, under the straight-on camera. */
export function attractorPoint(frame: Frame, box: Box): readonly [number, number, number] {
  const [px, py] = boxCentre(box)
  const [x, y] = pixelToWorld(frame, px, py)
  return [x, y, 0]
}

/** The index of the box whose centre is nearest the viewport centre; `-1` for none. */
export function nearestToCentre(boxes: readonly Box[], width: number, height: number): number {
  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  boxes.forEach((box, i) => {
    const dx = box.left + box.width / 2 - width / 2
    const dy = box.top + box.height / 2 - height / 2
    const d = dx * dx + dy * dy
    if (d < bestDistance) {
      bestDistance = d
      best = i
    }
  })
  return best
}

export type AttractorListener = (element: Element | null) => void

/**
 * The single hovered (or centred) card, shared between the DOM hook in the
 * Selected Work section and the scene, which measures it per frame while it
 * is set. A module-level store, like the give-up flag in `AssemblyLayer`:
 * the two sides never render each other.
 */
export interface AttractorStore {
  get(): Element | null
  set(element: Element | null): void
  subscribe(listener: AttractorListener): () => void
}

export function createAttractorStore(): AttractorStore {
  let current: Element | null = null
  const listeners = new Set<AttractorListener>()
  return {
    get: () => current,
    set(element) {
      if (element === current) return
      current = element
      for (const listener of listeners) listener(element)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const attractorStore: AttractorStore = createAttractorStore()
