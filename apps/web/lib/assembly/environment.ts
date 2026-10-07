/**
 * The lighting rig's lightformer layout — journey spec § 5.3, decision D5.
 *
 * PURE. Chrome and thin film only show what is around them, so the rig gives
 * metal something to reflect: two LONG white strip softboxes (a high-contrast
 * key above and a rim behind), two thin coloured edge strips in the brand's
 * violet and cyan, and a dim violet-to-cyan gradient dome so nothing a metal
 * face can see is plain black. The scene builds a tiny `Scene` from this
 * table and runs it through `PMREMGenerator.fromScene` once per `prepare()`
 * (`AssemblyCanvas`), before `compileAsync` and so before the first draw, then
 * sets the result as `scene.environment`. Baking first means the program that
 * links is the final one, since the envMap define is part of the program key.
 *
 * Long strips, not square panels: a strip reads as a streak across a facet or
 * a ring, which is what makes polished metal look polished. A square panel
 * reads as a blob.
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

/** The coloured gradient dome around the strips: violet below, cyan above, dim. */
export interface EnvironmentDome {
  readonly radius: number
  /** sRGB hex at the bottom pole. */
  readonly bottom: string
  /** sRGB hex at the top pole. */
  readonly top: string
  /** Emissive multiplier; low, so the strips stay the brightest thing the metal can see. */
  readonly intensity: number
}

/** Multiplies the whole environment (`scene.environmentIntensity`). */
export const ENVIRONMENT_INTENSITY = 0.9

/** Each PMREM face is this many pixels (one 64 px cube is ~0.1 MB; 256 would be 6.3 MB). Do not raise. */
export const ENVIRONMENT_FACE_PX = 64

export const ENVIRONMENT_DOME: EnvironmentDome = { radius: 40, bottom: '#7C3AED', top: '#22D3EE', intensity: 0.22 }

export const LIGHTFORMERS: readonly Lightformer[] = [
  { name: 'key-strip', position: [-2, 7, 3], size: [16, 1.6], color: '#ffffff', intensity: 7 },
  { name: 'rim-strip', position: [0, 1.5, -8], size: [16, 1.1], color: '#ffffff', intensity: 5.5 },
  { name: 'edge-cyan', position: [7, 0, 2], size: [1.1, 9], color: '#22D3EE', intensity: 3.5 },
  { name: 'edge-violet', position: [-7, -1, 2], size: [1.1, 8], color: '#7C3AED', intensity: 3 },
]
