/**
 * Test seam for the model slot — model platform spec § 7.3.
 *
 * Every ledger row is `null` today, so a browser test has nothing to load
 * unless it can supply a placement and a manifest. It does that with
 * `window.__ASSEMBLY_MODELS_TEST__`, honoured only when the URL also carries
 * `?modeltest=1` AND the build is not a production build (or was built with
 * `NEXT_PUBLIC_MODEL_TEST=1`, which only the e2e job sets). In a normal
 * production build `SEAM_ENABLED` is the constant `false`, so every branch
 * behind it, this module's reads and the debug hook included, is dead code the
 * minifier removes; CI greps the production chunks to prove it.
 */

import type { ModelPlacement } from '@/lib/assembly/chapters'
import type { FormationId } from '@/lib/formations/config'
import type { CubeFreezeHandle } from '@/lib/assembly/cube-freeze'

export interface ModelTestSeam {
  /** Formation id to placement, merged over the ledger. */
  readonly placements?: Partial<Record<FormationId, ModelPlacement>>
  /** A manifest body (`modelManifestSchema`) used instead of the committed one. It is validated like the real one. */
  readonly manifest?: unknown
}

export interface AssemblyDebug {
  memory(): { readonly geometries: number; readonly textures: number }
}

declare global {
  interface Window {
    __ASSEMBLY_MODELS_TEST__?: ModelTestSeam
    __ASSEMBLY_DEBUG__?: AssemblyDebug
    /** The cube parity spec's handle: set a frozen frame, read what it drew. Only with `?cubefreeze=`. Same switch and guard. */
    __ASSEMBLY_FREEZE__?: CubeFreezeHandle
    /** The cubes' damped scroll-speed weight (`uVelocity`), 0 at rest. Same switch and the same guard as the rest of the seam. */
    __ASSEMBLY_VELOCITY__?: () => number
    /** How many cubes the last drawn frame instanced (0 while the hero engine owns the hero). Same switch and guard. */
    __ASSEMBLY_CUBES__?: number
    /** The hand-over's size multipliers of the two cube slots (0 = the monolith side while the engine owns the hero). Same switch and guard. */
    __ASSEMBLY_FADE__?: readonly [number, number]
    /** What the last cube frame actually handed the GPU after slot mapping, and the procedural shell. Same switch and guard. */
    __ASSEMBLY_RIG__?: {
      readonly fadeA: number
      readonly fadeB: number
      readonly swap: number
      readonly film: number
      readonly shell: number
      readonly light: number
    }
  }
}

/**
 * The compile-time switch. Module-local on purpose: the minifier folds a local
 * constant to `false`, but it did not fold one imported from another module,
 * so each module that needs the switch repeats this one line.
 */
const SEAM_ENABLED: boolean = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_MODEL_TEST === '1'

export function testSeam(): ModelTestSeam | null {
  if (!SEAM_ENABLED) return null
  if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('modeltest') !== '1') return null
  return window.__ASSEMBLY_MODELS_TEST__ ?? null
}
