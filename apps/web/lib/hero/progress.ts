/**
 * The hero's scroll and load maths — hero monolith spec § 4.6. Pure.
 *
 * Two inputs, both owned by the hero chunk so it never depends on the R3F
 * store: `p`, how far the page has scrolled through the hero (0..1), and
 * `load`, the eased progress of the first assembly. Everything the engine
 * draws is a closed-form function of those and the clock.
 */

export const LOAD_SECONDS = 2.6
/** `p` reaches 1 after scrolling this fraction of the viewport. */
export const SCROLL_SPAN = 0.9
/** The least the monolith ever reassembles to while scrolling away: 35 percent. */
export const SCROLL_DISSOLVE = 0.65

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** `p`: scroll through the hero band, 0 at the top, 1 after `SCROLL_SPAN` viewports. */
export function scrollP(scrollY: number, viewportHeight: number): number {
  if (!(viewportHeight > 0)) return 0
  return clamp01(scrollY / (SCROLL_SPAN * viewportHeight))
}

/** `load`: ease-out-cubic over `LOAD_SECONDS`, from the first presented frame. */
export function loadAt(elapsedSeconds: number): number {
  const t = clamp01(elapsedSeconds / LOAD_SECONDS)
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Assembly value `s`. Scrolling down disassembles the monolith back toward
 * dust and scrolling up reassembles it, so the wow moment is replayable.
 */
export function assemblyS(load: number, p: number): number {
  return clamp01(load) * (1 - SCROLL_DISSOLVE * smoothstep(0.08, 0.75, p))
}

/** Opacity weight of the whole layer: it fades into the page over the second half of the band. */
export function heroWeight(p: number): number {
  return 1 - smoothstep(0.55, 1.0, p)
}

/** The rings contract onto the slab as it assembles. The lab's own constants. */
export function ringK(s: number): number {
  return smoothstep(0.12, 0.72, s)
}

export interface Pointer {
  /** 0..1 across the viewport. */
  readonly x: number
  /** 0..1 up the viewport. */
  readonly y: number
  /** 0..1, damped by the caller; 0 on touch screens. */
  readonly active: number
}

export interface Camera {
  readonly yaw: number
  readonly pitch: number
  readonly dist: number
  readonly focal: number
}

/**
 * The lab's camera plus one addition: yaw also grows with `p`, so the strip
 * reflections slide across the faces as the visitor scrolls, the cue that makes
 * the surface read as thin film.
 */
export function cameraFor(s: number, p: number, t: number, pointer: Pointer): Camera {
  return {
    yaw: 0.42 + 0.28 * Math.sin(t * 0.09) + (1 - s) * 0.35 + 0.5 * p + (pointer.x - 0.5) * 0.9 * pointer.active,
    pitch: 0.17 + (pointer.y - 0.5) * 0.28 * pointer.active,
    dist: 11 + (1 - s) * 1.6,
    focal: 2.7,
  }
}
