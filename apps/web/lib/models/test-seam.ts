/**
 * Test seam for the model slot — model platform spec § 7.3.
 *
 * Every ledger row is `null` at merge of the runtime slice, so a browser test
 * has nothing to load unless it can supply a placement and a manifest. It does
 * that with `window.__ASSEMBLY_MODELS_TEST__`, honoured only when the URL also
 * carries `?modeltest=1`: a visitor who never types that query string cannot
 * reach it, and what it can do is choose which same-origin, hash-pinned file
 * the slot fetches. It also exposes `gl.info.memory` for the leak assertions.
 *
 * Tiny on purpose: it ships in the lazy Assembly chunk.
 */

import type { ModelPlacement } from '@/lib/assembly/chapters'
import type { FormationId } from '@/lib/formations/config'

export interface ModelTestSeam {
  /** Formation id to placement, merged over the ledger. */
  readonly placements?: Partial<Record<FormationId, ModelPlacement>>
  /** A manifest body (`modelManifestSchema`) used instead of the committed one. */
  readonly manifest?: unknown
}

export interface AssemblyDebug {
  memory(): { readonly geometries: number; readonly textures: number }
}

declare global {
  interface Window {
    __ASSEMBLY_MODELS_TEST__?: ModelTestSeam
    __ASSEMBLY_DEBUG__?: AssemblyDebug
  }
}

export function testSeam(): ModelTestSeam | null {
  if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('modeltest') !== '1') return null
  return window.__ASSEMBLY_MODELS_TEST__ ?? null
}
