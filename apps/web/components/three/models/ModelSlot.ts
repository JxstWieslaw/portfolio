import type * as ModelLoaderModule from './ModelLoader'
import { AnimationMixer, Group, type AnimationAction, type Camera, type Scene, type WebGLRenderer } from 'three'
import {
  CHAPTERS,
  formationOf,
  modelScale,
  modelWeight,
  nextAssetAfter,
  scrubTime,
  wantedAssets,
  type Chapter,
  type ModelPlacement,
} from '@/lib/assembly/chapters'
import type { BundleKind } from '@/lib/assembly/targets'
import { FORMATION_IDS, type FormationId } from '@/lib/formations/config'
import type { FallbackRung } from '@/lib/formations/fallback'
import { disposeModel } from '@/lib/models/dispose'
import { readGateInputs, variantTier, type ModelTierNumber } from '@/lib/models/gate'
import { EMPTY_RESIDENCY, markFailed, planResidency, type ResidencyState } from '@/lib/models/residency'
import { testSeam } from '@/lib/models/test-seam'

/**
 * The model slot — model platform spec § 3.2, § 3.3, § 3.5.
 *
 * Lives in the Assembly's lazy core chunk and imports three; the loaders
 * themselves are behind a dynamic import of ./ModelLoader, reached only once the gate
 * says yes and a ledger row actually wants an asset. With every ledger row
 * `null` (the merge state) `update` returns after one cheap check and nothing
 * is ever fetched.
 *
 * No loop of its own: `update` runs inside the scene's priority-1 `useFrame`,
 * and the mixer is driven from there (decision M11).
 */

export interface ModelSlotOptions {
  readonly gl: WebGLRenderer
  readonly scene: Scene
  readonly camera: Camera
  /** The rig group: models are its children, so they share the cubes' anchor, wobble and breath. */
  readonly parent: Group
  readonly rung: FallbackRung
  readonly invalidate: () => void
  /** Defaults to the committed ledger; tests pass their own. */
  readonly ledger?: Readonly<Record<FormationId, Chapter>>
}

export interface ModelFrame {
  readonly from: BundleKind
  readonly to: BundleKind
  readonly mix: number
  /** The formation the visitor is at rest on, or `null` mid-band. */
  readonly settled: BundleKind | null
  /** Clamped frame delta, seconds. */
  readonly dt: number
  /** Clock time, seconds. */
  readonly time: number
  /** World units per model unit for a formation, from the live camera distance. */
  readonly unitOf: (formation: FormationId) => number
}

export interface ModelFrameResult {
  /** A loaded `artefact`-role model is on screen: the procedural artefact scales to 0. */
  readonly suppressArtefact: boolean
}

export interface ModelSlot {
  update(frame: ModelFrame): ModelFrameResult
  /** Models currently in the scene. */
  readonly resident: number
  dispose(): void
}

interface Resident {
  readonly root: Group
  /** The glTF scene inside `root`: what the mixer animates. */
  readonly scene: Group
  readonly mixer: AnimationMixer | null
  readonly action: AnimationAction | null
  /** The last scrub time written, so a resting frame writes nothing. */
  scrubbed: number
}

type LoaderModule = typeof ModelLoaderModule

const NONE: ModelFrameResult = { suppressArtefact: false }

/** Applies the committed ledger under the test seam's placements, when the seam is on. */
function effectiveLedger(base: Readonly<Record<FormationId, Chapter>>): Readonly<Record<FormationId, Chapter>> {
  const placements = testSeam()?.placements
  if (!placements) return base
  const merged = { ...base }
  for (const id of FORMATION_IDS) {
    const model = placements[id]
    if (model) merged[id] = { ...base[id], model }
  }
  return merged
}

/** Idle time with a 2 s deadline; Safari has no `requestIdleCallback`, so a short timer stands in. Returns the cancel. */
function whenIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(callback, { timeout: 2000 })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(callback, 200)
  return () => window.clearTimeout(id)
}

export function createModelSlot(options: ModelSlotOptions): ModelSlot {
  const { gl, scene, camera, parent, rung, invalidate } = options
  const ledger = effectiveLedger(options.ledger ?? CHAPTERS)
  const root = document.documentElement

  let state: ResidencyState = EMPTY_RESIDENCY
  const resident = new Map<string, Resident>()
  const pending = new Set<string>()
  let failures = 0
  /** Bumped by `dispose`: a load that started before it must not land after it. */
  let generation = 0
  let tier: ModelTierNumber | null | undefined
  let lastSettled: BundleKind | null = null
  let cancelPrefetch: (() => void) | null = null
  let loaderChunk: Promise<LoaderModule> | null = null

  const chunk = (): Promise<LoaderModule> => (loaderChunk ??= import('./ModelLoader'))

  const publish = (): void => {
    root.dataset.models = String(resident.size)
    root.dataset.modelsFailed = String(failures)
  }
  publish()

  const seamOn = testSeam() !== null
  if (seamOn) window.__ASSEMBLY_DEBUG__ = { memory: () => ({ geometries: gl.info.memory.geometries, textures: gl.info.memory.textures }) }

  /** The tier to load at, decided once WebGL is live; `null` for the session when the gate says no. */
  const decideTier = (): ModelTierNumber | null | undefined => {
    if (tier !== undefined) return tier
    const inputs = readGateInputs(rung)
    if (!inputs.glLive) return undefined
    tier = variantTier(inputs)
    return tier
  }

  const evict = (id: string): void => {
    const held = resident.get(id)
    if (!held) return
    resident.delete(id)
    disposeModel(held.root, held.mixer, held.scene)
    publish()
    if (process.env.NODE_ENV !== 'production') console.info(`[assembly] model "${id}" evicted`, { ...gl.info.memory })
    invalidate()
  }

  const fail = (id: string, error: unknown, gen: number): void => {
    if (gen !== generation) return
    const wasHeld = state.held.includes(id)
    state = markFailed(state, id)
    if (!wasHeld) return
    failures += 1
    publish()
    console.warn(`[assembly] model "${id}" skipped: ${String(error)}`)
  }

  const findPlacement = (id: string): ModelPlacement | null => {
    for (const formation of FORMATION_IDS) if (ledger[formation].model?.asset === id) return ledger[formation].model
    return null
  }

  const load = async (id: string, atTier: ModelTierNumber): Promise<void> => {
    const gen = generation
    pending.add(id)
    try {
      const { loadModel } = await chunk()
      const result = await loadModel(id, atTier)
      if (gen !== generation) {
        if (result.kind === 'loaded') disposeModel(result.model.scene)
        return
      }
      if (result.kind === 'unavailable') {
        // Disabled or absent: the rollback switch, not a fault. Nothing to count.
        state = markFailed(state, id)
        if (process.env.NODE_ENV !== 'production') console.info(`[assembly] ${result.reason}`)
        return
      }
      const wrapper = new Group()
      wrapper.add(result.model.scene)
      wrapper.visible = false
      wrapper.scale.setScalar(0)
      const placement = findPlacement(id)
      const clip = placement?.clip ? result.model.clips.find((c) => c.name === placement.clip?.name) : undefined
      const mixer = clip ? new AnimationMixer(result.model.scene) : null
      try {
        // Programs link before the model can reach the scene (lights from the real scene).
        await gl.compileAsync(wrapper, camera, scene)
      } catch (error) {
        disposeModel(wrapper, mixer, result.model.scene)
        throw error
      }
      if (gen !== generation || !state.held.includes(id)) {
        disposeModel(wrapper, mixer, result.model.scene)
        return
      }
      const action = clip && mixer ? mixer.clipAction(clip) : null
      if (action && placement?.clip?.mode === 'scrub') action.paused = true
      action?.play()
      parent.add(wrapper)
      resident.set(id, { root: wrapper, scene: result.model.scene, mixer, action, scrubbed: -1 })
      publish()
      invalidate()
    } catch (error) {
      fail(id, error, gen)
    } finally {
      if (gen === generation) pending.delete(id)
    }
  }

  const schedulePrefetch = (formation: FormationId): void => {
    cancelPrefetch?.()
    cancelPrefetch = null
    const next = nextAssetAfter(formation, ledger)
    if (!next) return
    cancelPrefetch = whenIdle(() => {
      cancelPrefetch = null
      const atTier = decideTier()
      if (!atTier || state.held.includes(next) || state.failed.includes(next)) return
      void chunk()
        .then((m) => m.prefetchModel(next, atTier))
        .catch(() => {})
    })
  }

  return {
    get resident() {
      return resident.size
    },

    update(frame) {
      const { from, to, mix, settled } = frame

      if (settled !== lastSettled) {
        lastSettled = settled
        if (settled) schedulePrefetch(formationOf(settled))
      }

      const wanted = wantedAssets(from, to, mix, ledger)
      if (wanted.length === 0 && state.held.length === 0) return NONE

      const atTier = wanted.length > 0 ? decideTier() : null
      const plan = planResidency(state, atTier ? wanted : [], performance.now())
      state = plan.state
      for (const id of plan.evict) evict(id)
      if (atTier) for (const id of plan.load) if (!pending.has(id)) void load(id, atTier)

      let suppressArtefact = false
      const seen = new Set<string>()
      for (const kind of [from, to]) {
        const formation = formationOf(kind)
        const placement = ledger[formation].model
        if (!placement || seen.has(placement.asset)) continue
        seen.add(placement.asset)
        const held = resident.get(placement.asset)
        if (!held) continue

        const weight = modelWeight(from, to, mix, formation)
        const scale = modelScale(weight, placement.appear)
        const { root: wrapper } = held
        if (scale <= 0) {
          if (wrapper.visible) {
            wrapper.visible = false
            wrapper.scale.setScalar(0)
          }
          continue
        }
        const unit = frame.unitOf(formation)
        wrapper.visible = true
        wrapper.position.set(placement.position[0] * unit, placement.position[1] * unit, placement.position[2] * unit)
        wrapper.scale.setScalar(placement.scale * unit * scale)
        wrapper.rotation.set(placement.rotation[0], placement.rotation[1] + placement.spin * frame.time, placement.rotation[2])
        if (placement.role === 'artefact') suppressArtefact = true

        if (held.mixer && held.action && placement.clip) {
          if (placement.clip.mode === 'scrub') {
            const time = scrubTime(weight, held.action.getClip().duration)
            if (Math.abs(time - held.scrubbed) > 1e-4) {
              held.action.time = time
              held.mixer.update(0)
              held.scrubbed = time
            }
          } else if (settled !== null && formationOf(settled) === formation && weight > 0.5) {
            held.mixer.update(frame.dt)
          }
        }
      }
      // A model that is held but no longer in either slot (leaving, within its grace period) is not drawn.
      for (const [id, held] of resident) {
        if (!seen.has(id) && held.root.visible) {
          held.root.visible = false
          held.root.scale.setScalar(0)
        }
      }
      return suppressArtefact ? { suppressArtefact } : NONE
    },

    dispose() {
      generation += 1
      pending.clear()
      state = EMPTY_RESIDENCY
      tier = undefined
      lastSettled = null
      cancelPrefetch?.()
      cancelPrefetch = null
      for (const id of [...resident.keys()]) evict(id)
      delete root.dataset.models
      delete root.dataset.modelsFailed
      if (seamOn) delete window.__ASSEMBLY_DEBUG__
    },
  }
}
