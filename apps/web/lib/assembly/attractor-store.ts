/**
 * The attractor store and the DOM-side helpers — journey spec § 3.3.
 *
 * PURE and dependency-free on purpose: `AttractorField` ships in the initial
 * bundle, and importing the framing maths here would drag the generator
 * chain (`targets.ts`) into it. The world-space conversion lives in
 * `attractors.ts`, which only the lazy scene imports.
 */

export interface Box {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** The box's centre in CSS px. */
export function boxCentre(box: Box): readonly [number, number] {
  return [box.left + box.width / 2, box.top + box.height / 2]
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

export type AttractorListener = (box: Box | null) => void

/**
 * The hovered (or centred) card's box, measured by the DOM hook in the
 * Selected Work section on hover, scroll and resize, and read by the scene's
 * frame loop, which never touches layout. A module-level store, like the
 * give-up flag in `AssemblyLayer`: the two sides never render each other.
 */
export interface AttractorStore {
  get(): Box | null
  set(box: Box | null): void
  subscribe(listener: AttractorListener): () => void
}

export function createAttractorStore(): AttractorStore {
  let current: Box | null = null
  const listeners = new Set<AttractorListener>()
  return {
    get: () => current,
    set(box) {
      if (box === current) return
      if (box && current && box.left === current.left && box.top === current.top && box.width === current.width && box.height === current.height) return
      current = box
      for (const listener of listeners) listener(box)
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
