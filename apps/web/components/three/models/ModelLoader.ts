import type { AnimationClip, Group, Light, Material } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { resolveModel } from '@/lib/models/manifest'
import type { ModelTierNumber } from '@/lib/models/gate'

/**
 * The only importer of `GLTFLoader` and `MeshoptDecoder` — model platform spec
 * § 4.1. Reached only through `import('./ModelLoader')` from `ModelSlot`, after
 * `shouldLoadModels` has said yes, so the loaders and the manifest live in
 * their own lazy `models` chunk and nothing here touches the initial bundle.
 *
 * `GLTFLoader.load` cannot pass `integrity`, so this module fetches the bytes
 * itself (a mismatch rejects the fetch natively, decision M10) and hands them
 * to `parse`.
 */

export interface LoadedModel {
  /** The glTF scene, lights stripped, materials normalised. Not yet in any scene. */
  readonly scene: Group
  readonly clips: readonly AnimationClip[]
}

export type LoadResult =
  | { readonly kind: 'loaded'; readonly model: LoadedModel }
  /** Disabled, absent from the manifest, or no variant this client can use: not a failure. */
  | { readonly kind: 'unavailable'; readonly reason: string }

interface PriorityInit extends RequestInit {
  priority?: 'high' | 'low' | 'auto'
}

/** Bytes fetched ahead of need, by url. A failed prefetch is forgotten so the real load can try again. */
const bytes = new Map<string, Promise<ArrayBuffer>>()

function fetchBytes(url: string, integrity: string): Promise<ArrayBuffer> {
  let pending = bytes.get(url)
  if (!pending) {
    const init: PriorityInit = { integrity, priority: 'low' }
    pending = fetch(url, init).then((response) => {
      if (!response.ok) throw new Error(`model fetch ${response.status}`)
      return response.arrayBuffer()
    })
    bytes.set(url, pending)
    pending.catch(() => bytes.delete(url))
  }
  return pending
}

let loader: GLTFLoader | null = null

function gltfLoader(): GLTFLoader {
  if (!loader) {
    loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
  }
  return loader
}

/** Lights would change the scene's program light count; env intensity matches the cubes. */
function normalise(scene: Group): void {
  const lights: Light[] = []
  scene.traverse((node) => {
    if ((node as Light).isLight) lights.push(node as Light)
    const material = (node as { material?: Material | Material[] }).material
    for (const m of Array.isArray(material) ? material : material ? [material] : []) {
      if ('envMapIntensity' in m) (m as Material & { envMapIntensity: number }).envMapIntensity = 0.8
      m.needsUpdate = true
    }
  })
  for (const light of lights) light.removeFromParent()
}

export async function loadModel(id: string, tier: ModelTierNumber): Promise<LoadResult> {
  const resolved = resolveModel(id, tier)
  if (!resolved) return { kind: 'unavailable', reason: `no usable variant of "${id}" at tier ${tier}` }
  const { variant } = resolved
  const buffer = await fetchBytes(variant.url, variant.integrity)
  bytes.delete(variant.url)
  const gltf = await gltfLoader().parseAsync(buffer, '')
  normalise(gltf.scene)
  return { kind: 'loaded', model: { scene: gltf.scene, clips: gltf.animations } }
}

/** Fetches the bytes of `id` at `tier` into the cache; no parse, no GPU. Silent on failure. */
export function prefetchModel(id: string, tier: ModelTierNumber): void {
  const resolved = resolveModel(id, tier)
  if (!resolved) return
  fetchBytes(resolved.variant.url, resolved.variant.integrity).catch(() => {})
}
