import type { AnimationAction, AnimationMixer, Group, Camera, Scene, WebGLRenderer } from 'three'
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
import { ModelLoadError, errorCode } from '@/lib/models/errors'
import { gateReason, readGateInputs, variantTier, type ModelTierNumber } from '@/lib/models/gate'
import { EMPTY_RESIDENCY, markFailed, planResidency, type ResidencyState } from '@/lib/models/residency'
import { testSeam } from '@/lib/models/test-seam'
import type * as ModelLoaderModule from './ModelLoader'

/**
 * The model slot — model platform spec § 3.2, § 3.3, § 3.5.
 *
 * Lives in the Assembly's lazy core chunk and imports three; the loaders
 * themselves are behind a dynamic import of ./ModelLoader, reached only once
 * the gate says yes and a ledger row actually wants an asset. With every
 * ledger row `null` (the merge state) `update` returns after one cheap check
 * and nothing is ever fetched.
 *
 * No loop of its own: `update` runs inside the scene's priority-1 `useFrame`,
 * and the mixer is driven from there (decision M11).
 *
 * Nothing fails silently: every failure is counted in `html[data-models-failed]`,
 * its short code lands in `data-models-last-error`, and it is warned once. A
 * model that is legitimately off (`enabled: false`) is counted separately in
 * `data-models-unavailable`. A failed asset stays failed for the session; there
 * is deliberately no retry or backoff.
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

/** The debug hook exists only where the test seam does; module-local so it folds away in production. */
const DEBUG_HOOK: boolean = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_MODEL_TEST === '1'

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
  const aborts = new Map<string, AbortController>()
  const warned = new Set<string>()
  let failures = 0
  let unavailable = 0
  let lastError = ''
  /** Bumped by `dispose`: a load that started before it must not land after it. */
  let generation = 0
  let tier: ModelTierNumber | null | undefined
  let lastSettled: BundleKind | null = null
  let cancelPrefetch: (() => void) | null = null
  let loaderChunk: Promise<LoaderModule> | null = null
  /** Set once the loader chunk has arrived; a resident model implies it has, so disposal can use it synchronously. */
  let loaderModule: LoaderModule | null = null

  /** The loader chunk, memoised; a rejected import is forgotten so a later load can try again. */
  const chunk = (): Promise<LoaderModule> =>
    (loaderChunk ??= import('./ModelLoader').then(
      (module) => (loaderModule = module),
      (error: unknown) => {
        loaderChunk = null
        throw error
      },
    ))

  const publish = (): void => {
    root.dataset.models = String(resident.size)
    root.dataset.modelsFailed = String(failures)
    root.dataset.modelsUnavailable = String(unavailable)
    if (lastError) root.dataset.modelsLastError = lastError
  }
  publish()

  if (DEBUG_HOOK && testSeam() !== null) {
    window.__ASSEMBLY_DEBUG__ = { memory: () => ({ geometries: gl.info.memory.geometries, textures: gl.info.memory.textures }) }
  }

  const warnOnce = (key: string, message: string): void => {
    if (warned.has(key)) return
    warned.add(key)
    console.warn(message)
  }

  /** Counts a failure, publishes it and warns. Always runs; only the residency bookkeeping is conditional. */
  const record = (id: string, error: unknown): void => {
    failures += 1
    lastError = errorCode(error)
    publish()
    console.warn(`[assembly] model "${id}" skipped (${lastError}): ${error instanceof Error ? error.message : String(error)}`)
  }

  /** The tier to load at, decided once WebGL is live; `null` for the session when the gate says no. */
  const decideTier = (): ModelTierNumber | null | undefined => {
    if (tier !== undefined) return tier
    const inputs = readGateInputs(rung)
    if (!inputs.glLive) return undefined
    const reason = gateReason(inputs)
    tier = variantTier(inputs)
    root.dataset.modelsGate = reason ? `off:${reason}` : `on:${tier}`
    return tier
  }

  const evict = (id: string): void => {
    aborts.get(id)?.abort()
    aborts.delete(id)
    const held = resident.get(id)
    if (!held) return
    resident.delete(id)
    try {
      loaderModule?.disposeModel(held.root, held.mixer, held.scene)
    } catch (error) {
      console.warn(`[assembly] disposing model "${id}" threw`, error)
    } finally {
      publish()
      invalidate()
    }
  }

  const findPlacement = (id: string): ModelPlacement | null => {
    for (const formation of FORMATION_IDS) if (ledger[formation].model?.asset === id) return ledger[formation].model
    return null
  }

  const load = async (id: string, atTier: ModelTierNumber): Promise<void> => {
    const gen = generation
    const controller = new AbortController()
    aborts.set(id, controller)
    pending.add(id)
    try {
      const loader = await chunk()
      const placement = findPlacement(id)
      const made = await loader.prepareModel(id, atTier, controller.signal, gl, camera, scene, placement?.clip)
      if (made.kind === 'ready' && (gen !== generation || !state.held.includes(id))) {
        // Evicted or disposed while it was loading: it never reaches the scene.
        try {
          loader.disposeModel(made.wrapper, made.mixer, made.inner)
        } catch (error) {
          console.warn('[assembly] disposing a discarded model threw', error)
        }
        return
      }
      if (gen !== generation) return
      if (made.kind === 'unavailable') {
        // `enabled: false` is the rollback switch: legitimate, but visible.
        state = markFailed(state, id)
        unavailable += 1
        publish()
        warnOnce(`unavailable:${id}`, `[assembly] model ${made.reason}`)
        return
      }
      if (made.clipMissing) record(id, new ModelLoadError('validation', `clip "${placement?.clip?.name}" is not in the model`))
      parent.add(made.wrapper)
      resident.set(id, { root: made.wrapper, scene: made.inner, mixer: made.mixer, action: made.action, scrubbed: -1 })
      publish()
      invalidate()
    } catch (error) {
      if (gen === generation) {
        // An abort caused by our own eviction is not a failure.
        const evicted = controller.signal.aborted && !state.held.includes(id)
        if (!evicted) {
          record(id, error)
          state = markFailed(state, id)
        }
      }
    } finally {
      if (gen === generation) {
        pending.delete(id)
        if (aborts.get(id) === controller) aborts.delete(id)
      }
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
        .catch((error: unknown) => warnOnce(`prefetch:${next}`, `[assembly] prefetching model "${next}" failed (${errorCode(error)}): ${String(error)}`))
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
      for (const controller of aborts.values()) controller.abort()
      aborts.clear()
      pending.clear()
      state = EMPTY_RESIDENCY
      tier = undefined
      lastSettled = null
      cancelPrefetch?.()
      cancelPrefetch = null
      try {
        for (const id of [...resident.keys()]) evict(id)
      } finally {
        delete root.dataset.models
        delete root.dataset.modelsFailed
        delete root.dataset.modelsUnavailable
        delete root.dataset.modelsLastError
        delete root.dataset.modelsGate
        if (DEBUG_HOOK) delete window.__ASSEMBLY_DEBUG__
      }
    },
  }
}
