/**
 * Where the monolith sits in the viewport — hero monolith spec § 4.7. Pure.
 *
 * The lab's own `layout()`: given the viewport and the rectangle the glass
 * panel leaves free, return the projection centre (0..1, y up) and a zoom. The
 * engine turns that into an off-centre pinhole.
 */

export interface View {
  readonly w: number
  readonly h: number
}

/** A rectangle in css pixels, y down from the top of the viewport. */
export interface FreeRect {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

export interface HeroFrame {
  readonly cx: number
  readonly cy: number
  readonly zoom: number
}

export const MAX_ZOOM = 4.2
/** The free rectangle is never read as smaller than this, so a tall panel cannot blow the zoom up. */
const MIN_FREE_W = 120
const MIN_FREE_H = 110

export function heroFrame(view: View, free: FreeRect): HeroFrame {
  const fw = Math.max(MIN_FREE_W, free.x1 - free.x0)
  const fh = Math.max(MIN_FREE_H, free.y1 - free.y0)
  return {
    cx: (free.x0 + free.x1) / 2 / view.w,
    cy: 1 - (free.y0 + free.y1) / 2 / view.h,
    zoom: Math.min(MAX_ZOOM, Math.max(1, (view.h / fh) * 0.96, (0.98 * view.h) / fw)),
  }
}

/** Below this width the panel is bottom-anchored and the free area is above it; from here up it is to the right. */
export const SIDE_BY_SIDE_PX = 900

/**
 * The free rectangle from three measured edges: the bottom of the nav, the
 * panel's rectangle, and the viewport. Pure so both layouts can be tested.
 */
export function freeRect(view: View, navBottom: number, panel: { left: number; top: number; right: number } | null): FreeRect {
  const y0 = navBottom + 8
  if (panel === null) return { x0: 0, y0, x1: view.w, y1: view.h }
  if (view.w >= SIDE_BY_SIDE_PX) return { x0: panel.right + 12, y0, x1: view.w, y1: view.h }
  return { x0: 0, y0, x1: view.w, y1: panel.top - 6 }
}

/** One step of the damping the lab applies when the free rectangle changes (URL bar, rotation): 7 per second. */
export function dampFrame(current: HeroFrame, target: HeroFrame, dt: number): HeroFrame {
  const k = 1 - Math.exp(-dt * 7)
  return {
    cx: current.cx + (target.cx - current.cx) * k,
    cy: current.cy + (target.cy - current.cy) * k,
    zoom: current.zoom + (target.zoom - current.zoom) * k,
  }
}
