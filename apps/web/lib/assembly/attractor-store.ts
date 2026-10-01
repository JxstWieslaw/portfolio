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
