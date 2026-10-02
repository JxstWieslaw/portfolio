import { AnimationMixer, Box3, Group, LoadingManager, Vector3, type AnimationAction, type AnimationClip, type Camera, type Light, type Material, type Mesh, type Scene, type WebGLRenderer } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { disposeModel } from '@/lib/models/dispose'
import { ModelLoadError } from '@/lib/models/errors'
import type { ModelTierNumber } from '@/lib/models/gate'
import { resolveModel } from '@/lib/models/manifest'
import { assertFetchable, assertParsed, type PromisedFacts } from '@/lib/models/validate'

/**
 * The only importer of `GLTFLoader` and `MeshoptDecoder` — model platform spec
 * § 4.1. Reached only through a dynamic import from `ModelSlot`, after the gate
 * has said yes, so the loaders and the manifest live in their own lazy
 * `models` chunk and nothing here touches the initial bundle.
 *
 * `GLTFLoader.load` cannot pass `integrity`, so this module fetches the bytes
 * itself (a mismatch rejects the fetch natively, decision M10) and hands them
 * to `parse`. Everything that crosses the network is treated as hostile until
 * it has passed: the URL and the integrity string are validated before the
 * request, the request is same-origin with no credentials and no redirects, it
 * has a deadline and a byte cap, the length must equal what the manifest
 * promised, glTF may not pull in any external resource, and the parsed result
 * must not exceed the manifest's triangle and texture numbers.
 */

/** Disposal ships in this lazy chunk, not in the core: a model can only be disposed after it was loaded. */
export { disposeModel }


export interface LoadedModel {
  /** The glTF scene, lights stripped, materials normalised. Not yet in any scene. */
  readonly scene: Group
  readonly clips: readonly AnimationClip[]
}

export type LoadResult =
  | { readonly kind: 'loaded'; readonly model: LoadedModel }
  /** `enabled: false` or no usable variant: the rollback switch, not a fault. */
  | { readonly kind: 'unavailable'; readonly reason: string }

export const FETCH_TIMEOUT_MS = 15_000
export const MAX_MODEL_BYTES = 2_000_000

interface FetchInit extends RequestInit {
  priority?: 'high' | 'low' | 'auto'
}

/** Bytes fetched ahead of need, by url. A failed prefetch is forgotten so the real load can try again. */
const bytes = new Map<string, Promise<ArrayBuffer>>()

/** A fetch rejection is a TypeError for both a dead network and a failed integrity check; the message tells them apart. */
function classify(error: unknown): ModelLoadError {
  if (error instanceof ModelLoadError) return error
  const message = error instanceof Error ? error.message : String(error)
  return new ModelLoadError(/integrity|digest/i.test(message) ? 'integrity' : 'network', message, { cause: error })
}

/** Reads a response body up to `cap` bytes; anything longer aborts the request. */
async function readCapped(response: Response, cap: number, controller: AbortController): Promise<Uint8Array> {
  const reader = response.body?.getReader()
  if (!reader) {
    const whole = new Uint8Array(await response.arrayBuffer())
    if (whole.length > cap) throw new ModelLoadError('size', `model is larger than ${cap} bytes`)
    return whole
  }
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > cap) {
      controller.abort(new ModelLoadError('size', `model is larger than ${cap} bytes`))
      throw new ModelLoadError('size', `model is larger than ${cap} bytes`)
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

function fetchBytes(url: string, integrity: string, expectedBytes: number): Promise<ArrayBuffer> {
  let pending = bytes.get(url)
  if (!pending) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new ModelLoadError('timeout', `model fetch took longer than ${FETCH_TIMEOUT_MS} ms`)), FETCH_TIMEOUT_MS)
    const init: FetchInit = { integrity, priority: 'low', mode: 'same-origin', credentials: 'omit', redirect: 'error', signal: controller.signal }
    const cap = Math.min(MAX_MODEL_BYTES, Math.ceil(expectedBytes * 1.1))
    pending = fetch(url, init)
      .then(async (response) => {
        if (!response.ok) throw new ModelLoadError('network', `model fetch ${response.status}`)
        const data = await readCapped(response, cap, controller)
        if (data.length !== expectedBytes) throw new ModelLoadError('size', `model is ${data.length} bytes, the manifest says ${expectedBytes}`)
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
      })
      .catch((error: unknown) => {
        throw classify(controller.signal.aborted && controller.signal.reason instanceof ModelLoadError ? controller.signal.reason : error)
      })
      .finally(() => clearTimeout(timer))
    bytes.set(url, pending)
    // A failed fetch is forgotten so the next caller can try again.
    pending.catch(() => bytes.delete(url))
  }
  return pending
}

/** Rejects as soon as `signal` aborts, without cancelling a fetch that other callers share. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new ModelLoadError('network', 'model load aborted'))
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

/** Only data: and blob: URIs may be resolved while parsing; a glTF that points anywhere else is refused. */
export function blockExternal(url: string): string {
  if (url.startsWith('data:') || url.startsWith('blob:')) return url
  throw new ModelLoadError('external-uri', `glTF references an external resource: ${url.slice(0, 80)}`)
}

let loader: GLTFLoader | null = null

function gltfLoader(): GLTFLoader {
  if (!loader) {
    const manager = new LoadingManager()
    manager.setURLModifier(blockExternal)
    loader = new GLTFLoader(manager)
    loader.setMeshoptDecoder(MeshoptDecoder)
  }
  return loader
}

/** Lights would change the scene's program light count; env intensity and tone mapping match the cubes. */
function normalise(scene: Group): void {
  const lights: Light[] = []
  scene.traverse((node) => {
    if ((node as Light).isLight) lights.push(node as Light)
    const material = (node as { material?: Material | Material[] }).material
    for (const m of Array.isArray(material) ? material : material ? [material] : []) {
      if ('envMapIntensity' in m) (m as Material & { envMapIntensity: number }).envMapIntensity = 0.8
      m.toneMapped = true
      m.needsUpdate = true
    }
  })
  for (const light of lights) light.removeFromParent()
}

/** Counts what the parsed model actually contains, for comparison with what the manifest promised. */
function measure(scene: Group): Parameters<typeof assertParsed>[0] {
  let meshes = 0
  let triangles = 0
  let maxTexturePx = 0
  scene.traverse((node) => {
    const mesh = node as Mesh
    if (!mesh.isMesh) return
    meshes += 1
    const { geometry } = mesh
    triangles += (geometry.index ? geometry.index.count : (geometry.getAttribute('position')?.count ?? 0)) / 3
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      for (const value of Object.values(material as unknown as Record<string, unknown>)) {
        const image = (value as { isTexture?: boolean; image?: { width?: number; height?: number } } | null)?.image
        if ((value as { isTexture?: boolean } | null)?.isTexture && image) maxTexturePx = Math.max(maxTexturePx, image.width ?? 0, image.height ?? 0)
      }
    }
  })
  const size = new Box3().setFromObject(scene).getSize(new Vector3())
  return { meshes, triangles, maxTexturePx, size: [size.x, size.y, size.z] }
}

/** Parses glTF bytes under the external-URI block and checks the result against `promised`. Exported for tests. */
export async function parseModel(buffer: ArrayBuffer, promised: PromisedFacts): Promise<LoadedModel> {
  let gltf
  try {
    gltf = await gltfLoader().parseAsync(buffer, '')
  } catch (error) {
    throw error instanceof ModelLoadError ? error : new ModelLoadError('parse', error instanceof Error ? error.message : String(error), { cause: error })
  }
  try {
    assertParsed(measure(gltf.scene), promised)
  } catch (error) {
    // Nothing is in a scene yet, but the geometry and textures already exist on the CPU side of three.
    gltf.scene.traverse((node) => {
      const mesh = node as Mesh
      if (mesh.isMesh) mesh.geometry.dispose()
    })
    throw error
  }
  normalise(gltf.scene)
  return { scene: gltf.scene, clips: gltf.animations }
}

export async function loadModel(id: string, tier: ModelTierNumber, signal?: AbortSignal): Promise<LoadResult> {
  const resolved = resolveModel(id, tier)
  if (resolved.kind === 'unavailable') return { kind: 'unavailable', reason: `"${id}" is ${resolved.reason === 'disabled' ? 'disabled in the manifest' : `not available at tier ${tier}`}` }
  const { variant } = resolved.model
  assertFetchable(variant.url, variant.integrity)
  const buffer = await abortable(fetchBytes(variant.url, variant.integrity, variant.bytes), signal)
  // The bytes are parsed once; keeping a copy would hold the file's size for the whole session.
  bytes.delete(variant.url)
  const model = await parseModel(buffer, { triangles: variant.triangles, maxTexturePx: variant.maxTexturePx })
  return { kind: 'loaded', model }
}

export type PreparedModel =
  | { readonly kind: 'unavailable'; readonly reason: string }
  | {
      readonly kind: 'ready'
      /** Holds `inner`; what the slot scales, places and adds to the rig. Not yet in any scene. */
      readonly wrapper: Group
      readonly inner: Group
      readonly mixer: AnimationMixer | null
      readonly action: AnimationAction | null
      /** The placement asked for a clip the model does not have. */
      readonly clipMissing: boolean
    }

/**
 * Loads `id`, wraps it, sets up its clip and links its programs against the
 * real scene's lights (`compileAsync`), so a model never reaches the scene
 * before it can draw without a stall. Kept in this chunk so the core carries
 * only the residency bookkeeping. Anything that fails after parsing disposes
 * what it built before it throws.
 */
export async function prepareModel(
  id: string,
  tier: ModelTierNumber,
  signal: AbortSignal,
  gl: WebGLRenderer,
  camera: Camera,
  scene: Scene,
  clipSpec: { readonly name: string; readonly mode: 'scrub' | 'loop' } | undefined,
): Promise<PreparedModel> {
  const result = await loadModel(id, tier, signal)
  if (result.kind === 'unavailable') return result
  const inner = result.model.scene
  const wrapper = new Group()
  wrapper.add(inner)
  wrapper.visible = false
  wrapper.scale.setScalar(0)
  const clip = clipSpec ? result.model.clips.find((c) => c.name === clipSpec.name) : undefined
  const mixer = clip ? new AnimationMixer(inner) : null
  try {
    await gl.compileAsync(wrapper, camera, scene)
  } catch (error) {
    try {
      disposeModel(wrapper, mixer, inner)
    } catch (disposeError) {
      console.warn('[assembly] disposing a model that failed to compile threw', disposeError)
    }
    throw error instanceof ModelLoadError ? error : new ModelLoadError('compile', error instanceof Error ? error.message : String(error), { cause: error })
  }
  const action = clip && mixer ? mixer.clipAction(clip) : null
  if (action && clipSpec?.mode === 'scrub') action.paused = true
  action?.play()
  return { kind: 'ready', wrapper, inner, mixer, action, clipMissing: clipSpec !== undefined && !clip }
}

/** Fetches the bytes of `id` at `tier` into the cache; no parse, no GPU. Resolves quietly when there is nothing to fetch, rejects on failure. */
export async function prefetchModel(id: string, tier: ModelTierNumber): Promise<void> {
  const resolved = resolveModel(id, tier)
  if (resolved.kind === 'unavailable') return
  const { variant } = resolved.model
  assertFetchable(variant.url, variant.integrity)
  await fetchBytes(variant.url, variant.integrity, variant.bytes)
}

/** Test seam: forgets cached bytes and the shared loader. */
export function resetLoaderForTests(): void {
  bytes.clear()
  loader = null
}
