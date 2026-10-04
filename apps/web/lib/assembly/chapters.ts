/**
 * The chapter ledger — model platform spec § 3.1.
 *
 * PURE, no three import. `CAMERA_RIGS` (camera.ts) and `SECTION_MOTION`
 * (motion.ts) stay the verbatim tables of the journey spec; this third table
 * holds only what the model platform adds: where a model sits in a section,
 * which cubes make room for it, the camera's look-at offset and the key/fill
 * bias. Data, not logic, so the integration slice (P4) only edits rows.
 *
 * The runtime slice merged with every `model` null; the first models fill three rows
 * (orbit, scatter, grid). Every other row, and every `target` and bias, is neutral.
 */

import { easeOutBack } from '@/lib/assembly/artefact'
import { FORMATION_IDS, type FormationId } from '@/lib/formations/config'
import type { BundleKind } from '@/lib/assembly/targets'

export interface ModelPlacement {
  /** Manifest entry id, kebab-case. */
  readonly asset: string
  /** `artefact` replaces the procedural artefact (hero, orbit core); `prop` sits beside the cubes. */
  readonly role: 'artefact' | 'prop'
  /** Model units relative to the formation anchor (the monolith's units: radius 0.42 fits the column). */
  readonly position: readonly [number, number, number]
  /** World radius in model units. Ingest normalises every asset to bounding radius 1, so this is the only size knob. */
  readonly scale: number
  readonly rotation: readonly [number, number, number]
  /** rad/s about y while visible; 0 is static. */
  readonly spin: number
  /** Cubes inside this radius are moved to it by the bundle clearance pass, whether or not the GLB has loaded. */
  readonly exclusion: number
  /** Weight window on the formation's on-screen weight (0..1): model scale is 0 below `appear[0]`, full above `appear[1]`. */
  readonly appear: readonly [number, number]
  readonly clip?: { readonly name: string; readonly mode: 'scrub' | 'loop' }
}

export interface Chapter {
  /** Camera look-at offset from the origin, model units. `[0,0,0]` is today's behaviour. */
  readonly target: readonly [number, number, number]
  /** Multipliers on the hemisphere and sun intensity for this section. 1 is today. */
  readonly keyBias: number
  readonly fillBias: number
  readonly model: ModelPlacement | null
}

const NEUTRAL: Chapter = { target: [0, 0, 0], keyBias: 1, fillBias: 1, model: null }

/** One row per formation. Edit rows, not code, to place a model. */
export const CHAPTERS: Readonly<Record<FormationId, Chapter>> = {
  monolith: NEUTRAL,
  stream: NEUTRAL,
  lattice: NEUTRAL,
  // How I Lead: the generated gyroscope is the orbit's heart (a team around a centre). It stands in for the
  // procedural artefact here, so the core of cubes opens to its radius and the three rings turn around it.
  orbit: {
    ...NEUTRAL,
    model: { asset: 'gyroscope', role: 'artefact', position: [0, 0, 0], scale: 0.8, rotation: [0.2, 0, 0], spin: 0.16, exclusion: 0.88, appear: [0.3, 0.8] },
  },
  // Craft: a faceted crystal cluster standing in the settled pile, a set piece the falling cubes land around.
  scatter: {
    ...NEUTRAL,
    model: { asset: 'crystal-cluster', role: 'prop', position: [0, -0.15, 0], scale: 0.62, rotation: [0.08, 0.5, 0.04], spin: 0.1, exclusion: 0.66, appear: [0.3, 0.8] },
  },
  // Stack: a gate in the middle of the turning lattice, the threshold into the ordered system.
  grid: {
    ...NEUTRAL,
    model: { asset: 'gate-complex', role: 'prop', position: [0, 0, 0], scale: 1.0, rotation: [0, 0.4, 0], spin: 0, exclusion: 1.1, appear: [0.3, 0.8] },
  },
  ring: NEUTRAL,
}

/** The formation a bundle kind stands for: the `cloud` pseudo-formation is the hero's. */
export function formationOf(kind: BundleKind): FormationId {
  return kind === 'cloud' ? 'monolith' : kind
}

export function chapterFor(kind: BundleKind, ledger: Readonly<Record<FormationId, Chapter>> = CHAPTERS): Chapter {
  return ledger[formationOf(kind)]
}

export interface ChapterBlend {
  readonly target: readonly [number, number, number]
  readonly keyBias: number
  readonly fillBias: number
}

export function lerpChapter(a: Chapter, b: Chapter, mix: number): ChapterBlend {
  const m = mix < 0 ? 0 : mix > 1 ? 1 : mix
  const l = (x: number, y: number): number => x + (y - x) * m
  return {
    target: [l(a.target[0], b.target[0]), l(a.target[1], b.target[1]), l(a.target[2], b.target[2])],
    keyBias: l(a.keyBias, b.keyBias),
    fillBias: l(a.fillBias, b.fillBias),
  }
}

/** The camera's look-at point in world units: the damped model-unit offset times the live unit. Neutral rows give exactly the origin. */
export function lookPoint(look: { readonly x: number; readonly y: number; readonly z: number }, unit: number): readonly [number, number, number] {
  return [look.x * unit, look.y * unit, look.z * unit]
}

/** How much of `formation` is on screen: 1 at rest on it, 0 with it in neither slot. Same shape as `scatterWeight`. */
export function modelWeight(from: BundleKind, to: BundleKind, mix: number, formation: FormationId): number {
  const f = formationOf(from)
  const t = formationOf(to)
  if (f === formation && t === formation) return 1
  return (f === formation ? 1 - mix : 0) + (t === formation ? mix : 0)
}

/**
 * Model scale for a formation weight: exactly 0 below `appear[0]` (so it costs
 * vertex work only while visible), the artefact's ignition curve across the
 * window, exactly 1 above `appear[1]`.
 */
export function modelScale(weight: number, appear: readonly [number, number]): number {
  const [low, high] = appear
  if (weight <= low) return 0
  if (weight >= high) return 1
  return easeOutBack((weight - low) / (high - low))
}

/** `scrub` clips are a pure function of scroll: the formation weight picks the time. */
export function scrubTime(weight: number, seconds: number): number {
  const w = weight < 0 ? 0 : weight > 1 ? 1 : weight
  return w * seconds
}

/**
 * The assets the scene wants resident for this scroll state: the placements of
 * `from` and `to` whose weight is above zero, deduplicated, at most two.
 */
export function wantedAssets(from: BundleKind, to: BundleKind, mix: number, ledger: Readonly<Record<FormationId, Chapter>> = CHAPTERS): readonly string[] {
  const wanted: string[] = []
  for (const kind of [from, to]) {
    const formation = formationOf(kind)
    const model = ledger[formation].model
    if (!model || wanted.includes(model.asset)) continue
    if (modelWeight(from, to, mix, formation) > 0) wanted.push(model.asset)
  }
  return wanted
}

/** The asset of the next formation after `formation` (document order) that has a placement; `null` when none. */
export function nextAssetAfter(formation: FormationId, ledger: Readonly<Record<FormationId, Chapter>> = CHAPTERS): string | null {
  const start = FORMATION_IDS.indexOf(formation)
  for (let i = start + 1; i < FORMATION_IDS.length; i += 1) {
    const id = FORMATION_IDS[i]
    const model = id ? ledger[id].model : null
    if (model) return model.asset
  }
  return null
}
