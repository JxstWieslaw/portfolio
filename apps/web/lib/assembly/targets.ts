/**
 * Formation targets for the Assembly — the per-instance data the WebGL layer
 * morphs between. Spec § 4.4; journey spec § 5.2.
 *
 * PURE. No three, no DOM. Every bundle is built from the same memoised,
 * seeded clouds the 2D painter draws (`pointsFor`), so the cubes a visitor
 * sees in 3D are the same cubes that were in the poster.
 *
 * Two layers:
 *
 * - `ModelBundle` is **frame-invariant**: positions in model units exactly as
 *   the generator made them (z flipped), the colour-ramp `t`, a live flag and
 *   a per-instance seed. It is built once per formation and never again; a
 *   resize touches no buffer.
 * - `frameScalars` is the O(1) per-frame part: the model unit in world units,
 *   the cube edge and the anchor for the current viewport and camera distance.
 *   World position = model position × `unit`; cube edge = `live` × `edge`.
 *
 * Framing reproduces `projectPoints` in `lib/formations/render.ts` on the
 * z = 0 plane: the formation's anchor sits at viewport fraction (`cx`, `cy`),
 * its model unit is `fit * scale` CSS px, and on ultrawide the x spread is
 * stretched by `spreadXFor`. Perspective comes from the real camera instead of
 * the painter's weak `1 / (1 + z * 0.16)`, which at this camera distance works
 * out within a few percent of it.
 *
 * Coordinates: positions are **model space relative to the anchor,
 * unrotated**. The scene applies the formation's `rot` / `tilt` on the parent
 * group — lerping two Euler angles once per frame is far cheaper than lerping
 * 3000 rotated positions — and the painter's z-into-the-screen axis is flipped
 * into three's z-toward-the-viewer. The reflection negates the tilt; the
 * painter's own sign convention negates the rotation back. See `AssemblyCanvas`.
 *
 * `buildTargets` (the viewport-baked `TargetBundle`) is kept as the composition
 * of the two, so the equivalence is tested rather than assumed.
 */

import { FORMATIONS, spreadXFor, type FormationConfig, type FormationId } from '@/lib/formations/config'
import { createRng, seedFor } from '@/lib/formations/generators'
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

/** A formation, or the `cloud` pseudo-formation the hero assembles from (§ 3.1). */
export type BundleKind = FormationId | 'cloud'

/** The frame-invariant part of a formation. Built once; never rebuilt on resize. */
export interface ModelBundle {
  readonly kind: BundleKind
  /** Instances with a real point behind them. The rest sit at scale 0. */
  readonly count: number
  readonly capacity: number
  /** `capacity * 3`, model units relative to the anchor, unrotated, z flipped. */
  readonly position: Float32Array
  /** `capacity`, the colour-ramp position of each point. */
  readonly colT: Float32Array
  /** `capacity * 3`, `shade(t)` converted to linear RGB 0..1 for the GPU. */
  readonly colour: Float32Array
  /** `capacity`, `1` for a live instance, `0` for surplus. */
  readonly live: Float32Array
  /** `capacity`, 0..1 seeded per index: the morph stagger key (§ 4.1). */
  readonly seed: Float32Array
  /**
   * `capacity * 4`: unit axis xyz + rate (rad/s) of a rotation of the
   * instance's position about the formation's origin (§ 4.3). Zero except
   * for the orbit's core and rings, the grid and the ring.
   */
  readonly spin: Float32Array
  /** `capacity`, `1` when the instance rides the stream's river (§ 3.2). */
  readonly flow: Float32Array
  /** `capacity`, `1` for the scatter's airborne cubes, which fall under `uDropAt` (§ 3.5). */
  readonly fall: Float32Array
  /** Euler y for the parent group, radians. */
  readonly rot: number
  /** Euler x for the parent group, radians. */
  readonly tilt: number
}

/** The O(1) per-frame part: what the viewport and the camera distance decide. */
export interface FrameScalars {
  /** World units per model unit. */
  readonly unit: number
  /** Cube edge in world units. */
  readonly edge: number
  /** World position of the formation's framing point, on z = 0. */
  readonly anchor: readonly [number, number, number]
  /** Parent group x scale — 1.4 above 2.2 aspect, else 1. */
  readonly spreadX: number
}

/** The viewport-baked bundle: `ModelBundle` × `FrameScalars`. */
export interface TargetBundle {
  readonly kind: FormationId
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
  readonly anchor: readonly [number, number, number]
  readonly rot: number
  readonly tilt: number
  readonly spreadX: number
}

const ORIGIN = [0, 0, 0, 0] as const

function srgbToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/**
 * The scalars that turn a model bundle into world units for one viewport.
 * One `tan` (inside `frameFor`), a handful of multiplies: cheap enough to run
 * every frame when the camera dollies (§ 3.8).
 */
export function frameScalars(cfg: FormationConfig, frame: Frame, distance: number = frame.distance): FrameScalars {
  const f = distance === frame.distance ? frame : frameFor(frame.width, frame.height, distance)
  const fit = cfg.fit === 'h' ? f.height : Math.min(f.width, f.height)
  const [ax, ay] = pixelToWorld(f, f.width * cfg.cx, f.height * cfg.cy)
  return {
    unit: fit * cfg.scale * f.worldPerPx,
    edge: cfg.size * f.worldPerPx,
    anchor: [ax, ay, 0],
    spreadX: spreadXFor(f.width, f.height),
  }
}

/** Per-index stagger seeds, one stream shared by every bundle so a cube keeps its seed across formations. */
export function seedsFor(capacity: number): Float32Array {
  const r = createRng(seedFor('assembly-seed'))
  const seed = new Float32Array(capacity)
  for (let i = 0; i < capacity; i += 1) seed[i] = r()
  return seed
}

/** The orbit's push order (`generators.ts`): the core first, then three rings. */
export type OrbitGroup = 'core' | 0 | 1 | 2

/**
 * Which part of the orbit instance `i` belongs to, derived from the
 * generator's push order without touching it: `floor(count * 0.22)` core
 * cubes, then three rings of `floor(count * 0.19)`, where `count` is the
 * generator's own `round(n * keep)`. Indices past the last ring (surplus
 * instances) report `null`.
 */
export function groupFor(i: number, n: number, keep: number = 1): OrbitGroup | null {
  const count = Math.max(1, Math.round(n * keep))
  const core = Math.floor(count * 0.22)
  const ring = Math.floor(count * 0.19)
  if (i < 0) return null
  if (i < core) return 'core'
  const k = Math.floor((i - core) / ring)
  return ring > 0 && k < 3 ? (k as 0 | 1 | 2) : null
}

/** The orbit rings' tilts, verbatim from the generator; the axis below is the ring normal under those tilts. */
export const ORBIT_RING_TILTS = [
  { tiltX: 0.28, tiltY: 0.15 },
  { tiltX: -0.55, tiltY: 0.9 },
  { tiltX: 0.75, tiltY: -0.6 },
] as const

/** Spin rates, rad/s (§ 3.4, § 3.6, § 3.7). */
export const ORBIT_RING_RATES = [0.05, -0.035, 0.08] as const
export const ORBIT_CORE_RATE = 0.02
export const GRID_RATE = 0.05
export const RING_RATE = 0.02

/**
 * The unit normal of an orbit ring in bundle space: `(0, 1, 0)` through the
 * generator's tiltX-then-tiltY rotation, with z flipped like the positions.
 * Rotating a ring cube's position about this axis keeps it on its ring.
 */
export function orbitRingAxis(k: 0 | 1 | 2): readonly [number, number, number] {
  const { tiltX, tiltY } = ORBIT_RING_TILTS[k]
  const y2 = Math.cos(tiltX)
  const z2 = Math.sin(tiltX)
  const x3 = -z2 * Math.sin(tiltY)
  const z3 = z2 * Math.cos(tiltY)
  return [x3, y2, -z3]
}

/** The scatter generator's airborne marker: `t = 0.78` exactly. */
export const AIRBORNE_T = 0.78

/** Fills `spin`, `flow` and `fall` for one instance from the formation's structure. */
function fillMotion(kind: FormationId, i: number, t: number, isLive: boolean, keep: number, spin: Float32Array, flow: Float32Array, fall: Float32Array): void {
  const i4 = i * 4
  let axis: readonly [number, number, number] = [0, 1, 0]
  let rate = 0
  if (kind === 'orbit') {
    const group = isLive ? groupFor(i, FORMATIONS.orbit.n, keep) : null
    if (group === 'core') rate = ORBIT_CORE_RATE
    else if (group !== null) {
      axis = orbitRingAxis(group)
      rate = ORBIT_RING_RATES[group]
    }
  } else if (kind === 'grid') rate = GRID_RATE
  else if (kind === 'ring') rate = RING_RATE
  spin[i4] = axis[0]
  spin[i4 + 1] = axis[1]
  spin[i4 + 2] = axis[2]
  spin[i4 + 3] = isLive ? rate : 0
  flow[i] = kind === 'stream' && isLive ? 1 : 0
  fall[i] = kind === 'scatter' && isLive && t === AIRBORNE_T ? 1 : 0
}

/**
 * Builds one formation's frame-invariant bundle.
 *
 * Surplus instances (index >= count) take the position of a live instance
 * (`index % count`) so that when a denser formation follows they grow out of
 * an existing cube instead of appearing from the void.
 */
export function buildModelBundle(kind: FormationId, capacity: number, keep: number = 1): ModelBundle {
  const cfg = FORMATIONS[kind]
  const points = pointsFor(kind, keep)
  const count = Math.min(points.length, capacity)

  const position = new Float32Array(capacity * 3)
  const colT = new Float32Array(capacity)
  const colour = new Float32Array(capacity * 3)
  const live = new Float32Array(capacity)
  const spin = new Float32Array(capacity * 4)
  const flow = new Float32Array(capacity)
  const fall = new Float32Array(capacity)

  for (let i = 0; i < capacity; i += 1) {
    const isLive = i < count
    const [px, py, pz, t] = (count > 0 ? points[isLive ? i : i % count] : undefined) ?? ORIGIN
    fillMotion(kind, i, t, isLive, keep, spin, flow, fall)
    position[i * 3] = px
    position[i * 3 + 1] = py
    // Painter z runs into the screen; three's runs toward the viewer.
    position[i * 3 + 2] = -pz
    colT[i] = t
    const [r, g, b] = shade(t)
    colour[i * 3] = srgbToLinear(r)
    colour[i * 3 + 1] = srgbToLinear(g)
    colour[i * 3 + 2] = srgbToLinear(b)
    live[i] = isLive ? 1 : 0
  }

  return { kind, count, capacity, position, colT, colour, live, seed: seedsFor(capacity), spin, flow, fall, rot: cfg.rot, tilt: -cfg.tilt }
}

/**
 * Builds one formation's bundle for a viewport — the model bundle scaled by
 * the frame scalars. Kept for the equivalence test and as the readable form
 * of what the scene computes per instance per frame.
 */
export function buildTargets(kind: FormationId, frame: Frame, capacity: number, keep: number = 1): TargetBundle {
  const model = buildModelBundle(kind, capacity, keep)
  const { unit, edge, anchor, spreadX } = frameScalars(FORMATIONS[kind], frame)

  const position = new Float32Array(capacity * 3)
  const scale = new Float32Array(capacity)
  for (let i = 0; i < capacity * 3; i += 1) position[i] = (model.position[i] ?? 0) * unit
  for (let i = 0; i < capacity; i += 1) scale[i] = (model.live[i] ?? 0) * edge

  return {
    kind,
    count: model.count,
    capacity,
    position,
    colourT: model.colT,
    colour: model.colour,
    scale,
    anchor,
    rot: model.rot,
    tilt: model.tilt,
    spreadX,
  }
}

/**
 * The clearance post-pass — journey spec § 3.1, model platform spec § 3.3.
 * Cubes that would sit inside a sphere (the hero artefact's shell, a model's
 * exclusion radius) are moved outward along the radius from `centre` to
 * `clearance`. Applied to the **bundle**, never in the generator, so the 2D
 * painter and its visual snapshots stay byte-identical. Returns the number of
 * instances moved (logged in dev).
 */
export function clearSphere(
  bundle: ModelBundle,
  centre: readonly [number, number, number],
  /** Cubes closer than this are moved. */
  inside: number,
  /** ... out to this radius. */
  clearance: number = inside,
): { readonly bundle: ModelBundle; readonly moved: number } {
  const position = new Float32Array(bundle.position)
  let moved = 0
  for (let i = 0; i < bundle.count; i += 1) {
    const i3 = i * 3
    const dx = (position[i3] ?? 0) - centre[0]
    const dy = (position[i3 + 1] ?? 0) - centre[1]
    const dz = (position[i3 + 2] ?? 0) - centre[2]
    const distance = Math.hypot(dx, dy, dz)
    if (distance >= inside) continue
    if (distance > 1e-6) {
      const scale = clearance / distance
      position[i3] = centre[0] + dx * scale
      position[i3 + 1] = centre[1] + dy * scale
      position[i3 + 2] = centre[2] + dz * scale
    } else {
      // A cube exactly at the centre has no direction: give it a seeded one in the horizontal plane, so it still
      // lands on the shell (at `clearance`) and never inside it.
      const angle = (bundle.seed[i] ?? 0) * Math.PI * 2
      position[i3] = centre[0] + clearance * Math.cos(angle)
      position[i3 + 1] = centre[1]
      position[i3 + 2] = centre[2] + clearance * Math.sin(angle)
    }
    moved += 1
  }
  // Surplus instances mirror a live one; keep them following it.
  for (let i = bundle.count; i < bundle.capacity; i += 1) {
    if (bundle.count === 0) break
    const src = (i % bundle.count) * 3
    position[i * 3] = position[src] ?? 0
    position[i * 3 + 1] = position[src + 1] ?? 0
    position[i * 3 + 2] = position[src + 2] ?? 0
  }
  return { bundle: { ...bundle, position }, moved }
}

/** The hero artefact's clearance: `clearSphere` under its journey-spec name. */
export function clearArtefact(
  bundle: ModelBundle,
  centre: readonly [number, number, number],
  inside: number,
  clearance: number = inside,
): { readonly bundle: ModelBundle; readonly moved: number } {
  return clearSphere(bundle, centre, inside, clearance)
}
