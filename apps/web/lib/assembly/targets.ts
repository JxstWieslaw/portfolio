/**
 * Formation targets for the Assembly — the per-instance data the WebGL layer
 * morphs between. Spec § 4.4.
 *
 * PURE. No three, no DOM. Every bundle is built from the same memoised,
 * seeded clouds the 2D painter draws (`pointsFor`), so the cubes a visitor
 * sees in 3D are the same cubes that were in the poster.
 *
 * Framing reproduces `projectPoints` in `lib/formations/render.ts` on the
 * z = 0 plane: the formation's anchor sits at viewport fraction (`cx`, `cy`),
 * its model unit is `fit * scale` CSS px, and on ultrawide the x spread is
 * stretched by `spreadXFor`. Perspective comes from the real camera instead of
 * the painter's weak `1 / (1 + z * 0.16)`, which at this camera distance works
 * out within a few percent of it.
 *
 * Coordinates: positions are **model space scaled to world units and
 * relative to the anchor, unrotated**. The scene applies the formation's
 * `rot` / `tilt` on the parent group — lerping two Euler angles once per frame
 * is far cheaper than lerping 3000 rotated positions — and the painter's
 * z-into-the-screen axis is flipped into three's z-toward-the-viewer. The
 * reflection negates the tilt; the painter's own sign convention negates the
 * rotation back. See `AssemblyCanvas`.
 */

import { FORMATIONS, spreadXFor, type FormationId } from '@/lib/formations/config'
import { pointsFor, shade } from '@/lib/formations/render'

/** Instances at full keep: covers the monolith's 2600 plus its 6% stragglers. */
export const INSTANCE_CAPACITY = 3000

/** Camera distance along +Z. Arbitrary; `worldPerPx` absorbs it. */
export const CAMERA_DISTANCE = 10

export const FOV_LANDSCAPE = 35
export const FOV_PORTRAIT = 45

export interface Frame {
  readonly width: number
  readonly height: number
  /** Vertical field of view, degrees. */
  readonly fov: number
  readonly distance: number
  /** World units per CSS pixel on the z = 0 plane. */
  readonly worldPerPx: number
}

export function fovFor(width: number, height: number): number {
  return width >= height ? FOV_LANDSCAPE : FOV_PORTRAIT
}

/** The pixel -> world factor the camera and the framing maths share. */
export function frameFor(width: number, height: number, distance: number = CAMERA_DISTANCE): Frame {
  const fov = fovFor(width, height)
  const visibleHeight = 2 * distance * Math.tan((fov * Math.PI) / 360)
  return { width, height, fov, distance, worldPerPx: height > 0 ? visibleHeight / height : 0 }
}

/** CSS px (y down, origin top-left) -> world on z = 0 (y up, origin centre). */
export function pixelToWorld(frame: Frame, px: number, py: number): readonly [number, number] {
  return [(px - frame.width / 2) * frame.worldPerPx, (frame.height / 2 - py) * frame.worldPerPx]
}

export function worldToPixel(frame: Frame, x: number, y: number): readonly [number, number] {
  if (frame.worldPerPx === 0) return [frame.width / 2, frame.height / 2]
  return [frame.width / 2 + x / frame.worldPerPx, frame.height / 2 - y / frame.worldPerPx]
}

/** `3000` at full keep; `round(3000 * keep)` on the reduced-instances rung. */
export function instanceCount(keep: number): number {
  const clamped = Math.max(0, Math.min(1, keep))
  return Math.max(1, Math.round(INSTANCE_CAPACITY * clamped))
}

export interface TargetBundle {
  readonly kind: FormationId
  /** Instances with a real point behind them. The rest sit at scale 0. */
  readonly count: number
  readonly capacity: number
  /** `capacity * 3`, world units relative to `anchor`, unrotated. */
  readonly position: Float32Array
  /** `capacity`, the colour-ramp position of each point. */
  readonly colourT: Float32Array
  /** `capacity * 3`, `shade(t)` converted to linear RGB 0..1 for the GPU. */
  readonly colour: Float32Array
  /** `capacity`, cube edge in world units; `0` for surplus instances. */
  readonly scale: Float32Array
  /** World position of the formation's framing point, on z = 0. */
  readonly anchor: readonly [number, number, number]
  /** Euler y for the parent group, radians. */
  readonly rot: number
  /** Euler x for the parent group, radians. */
  readonly tilt: number
  /** Parent group x scale — 1.4 above 2.2 aspect, else 1. */
  readonly spreadX: number
}

const ORIGIN = [0, 0, 0, 0] as const

function srgbToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/**
 * Builds one formation's bundle for a viewport.
 *
 * Surplus instances (index >= count) take the position of a live instance
 * (`index % count`) so that when a denser formation follows they grow out of
 * an existing cube instead of appearing from the void.
 */
export function buildTargets(kind: FormationId, frame: Frame, capacity: number, keep: number = 1): TargetBundle {
  const cfg = FORMATIONS[kind]
  const points = pointsFor(kind, keep)
  const count = Math.min(points.length, capacity)

  const fit = cfg.fit === 'h' ? frame.height : Math.min(frame.width, frame.height)
  const unit = fit * cfg.scale * frame.worldPerPx
  const edge = cfg.size * frame.worldPerPx
  const [ax, ay] = pixelToWorld(frame, frame.width * cfg.cx, frame.height * cfg.cy)

  const position = new Float32Array(capacity * 3)
  const colourT = new Float32Array(capacity)
  const colour = new Float32Array(capacity * 3)
  const scale = new Float32Array(capacity)

  for (let i = 0; i < capacity; i += 1) {
    const live = i < count
    const [px, py, pz, t] = (count > 0 ? points[live ? i : i % count] : undefined) ?? ORIGIN
    position[i * 3] = px * unit
    position[i * 3 + 1] = py * unit
    // Painter z runs into the screen; three's runs toward the viewer.
    position[i * 3 + 2] = -pz * unit
    colourT[i] = t
    const [r, g, b] = shade(t)
    colour[i * 3] = srgbToLinear(r)
    colour[i * 3 + 1] = srgbToLinear(g)
    colour[i * 3 + 2] = srgbToLinear(b)
    scale[i] = live ? edge : 0
  }

  return {
    kind,
    count,
    capacity,
    position,
    colourT,
    colour,
    scale,
    anchor: [ax, ay, 0],
    rot: cfg.rot,
    tilt: -cfg.tilt,
    spreadX: spreadXFor(frame.width, frame.height),
  }
}
