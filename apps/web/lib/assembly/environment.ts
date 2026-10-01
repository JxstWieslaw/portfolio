/**
 * The lighting rig's lightformer layout — journey spec § 5.3, decision D5.
 *
 * PURE. Five emissive planes around the origin: a violet key above-left, a
 * cyan rim behind-right, a dim white top strip and two near-black fills. The
 * scene builds a tiny `Scene` of `PlaneGeometry` + `MeshBasicMaterial` from
 * this table and runs it through `PMREMGenerator.fromScene` once, one frame
 * after the first draw, then sets the result as `scene.environment`.
 *
 * drei's `Environment` + `Lightformer` was not used: its import graph carries
 * the HDR/EXR/gain-map loaders this scene never needs.
 */

export interface Lightformer {
  readonly name: string
  /** Plane centre, world units; the plane faces the origin. */
  readonly position: readonly [number, number, number]
  /** Width and height of the plane. */
  readonly size: readonly [number, number]
  /** sRGB hex. */
  readonly color: string
  /** Emissive multiplier. */
  readonly intensity: number
}

export const ENVIRONMENT_INTENSITY = 0.8

export const LIGHTFORMERS: readonly Lightformer[] = [
  { name: 'key', position: [-4, 5, 3], size: [5, 4], color: '#7C3AED', intensity: 4 },
  { name: 'rim', position: [5, 1, -4], size: [4, 6], color: '#22D3EE', intensity: 3 },
  { name: 'top', position: [0, 7, 0], size: [8, 1.5], color: '#ffffff', intensity: 1.2 },
  { name: 'fill-left', position: [-6, -2, 0], size: [6, 6], color: '#0d1117', intensity: 0.4 },
  { name: 'fill-right', position: [6, -3, 2], size: [6, 6], color: '#0d1117', intensity: 0.4 },
]
