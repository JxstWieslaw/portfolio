/**
 * Checks on a model's URL, integrity string and parsed contents — all PURE so
 * they can be unit tested without three or a browser. A file that passes the
 * network's integrity check can still be wrong (a bad ingest, a swapped
 * manifest), so the loader checks it again against what the manifest promised.
 */

import { ModelLoadError } from '@/lib/models/errors'

/** The only URLs the loader will fetch: same-origin, hash-named files under /models/. */
export const MODEL_URL = /^\/models\/[a-z0-9-]+\.t[123]\.[0-9a-f]{8}\.glb$/
/** What `fetch` accepts as `integrity`; an unparsable value is silently ignored by the browser, so refuse it here. */
export const INTEGRITY = /^sha(256|384|512)-[A-Za-z0-9+/]{20,}={0,2}$/

/** The manifest numbers the loader trusts: a missing one would turn the byte cap into NaN and fail open. */
export const MAX_MODEL_BYTES = 2_000_000

const positiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0

export function assertFetchable(variant: { url?: unknown; integrity?: unknown; bytes?: unknown; triangles?: unknown; maxTexturePx?: unknown; tier?: unknown; requires?: unknown }): void {
  const { url, integrity } = variant
  if (typeof url !== 'string' || !MODEL_URL.test(url)) throw new ModelLoadError('manifest', `model url is not an allowed /models/ path: ${String(url)}`)
  if (typeof integrity !== 'string' || !INTEGRITY.test(integrity)) throw new ModelLoadError('manifest', `model integrity is not a valid SRI string for ${url}`)
  if (!positiveInt(variant.bytes) || variant.bytes > MAX_MODEL_BYTES) throw new ModelLoadError('manifest', `model bytes must be a positive integer up to ${MAX_MODEL_BYTES} for ${url}`)
  if (!positiveInt(variant.triangles)) throw new ModelLoadError('manifest', `model triangles must be a positive integer for ${url}`)
  if (typeof variant.maxTexturePx !== 'number' || !Number.isInteger(variant.maxTexturePx) || variant.maxTexturePx < 0) throw new ModelLoadError('manifest', `model maxTexturePx must be a non-negative integer for ${url}`)
  if (variant.tier !== 1 && variant.tier !== 2 && variant.tier !== 3) throw new ModelLoadError('manifest', `model tier must be 1, 2 or 3 for ${url}`)
  if (!Array.isArray(variant.requires)) throw new ModelLoadError('manifest', `model requires must be an array for ${url}`)
}

export interface ParsedFacts {
  readonly meshes: number
  readonly triangles: number
  readonly maxTexturePx: number
  /** Bounding box size on x, y, z. */
  readonly size: readonly [number, number, number]
}

export interface PromisedFacts {
  readonly triangles: number
  readonly maxTexturePx: number
}

/** Throws a `validation` error when the parsed model is empty, degenerate or bigger than the manifest said. */
export function assertParsed(facts: ParsedFacts, promised: PromisedFacts): void {
  if (facts.meshes < 1) throw new ModelLoadError('validation', 'model has no meshes')
  if (!facts.size.every(Number.isFinite)) throw new ModelLoadError('validation', 'model bounds are not finite')
  if (Math.max(...facts.size) < 1e-6) throw new ModelLoadError('validation', 'model bounds are degenerate')
  if (facts.triangles > promised.triangles) throw new ModelLoadError('validation', `model has ${facts.triangles} triangles, the manifest says ${promised.triangles}`)
  if (facts.maxTexturePx > promised.maxTexturePx) throw new ModelLoadError('validation', `model texture is ${facts.maxTexturePx}px, the manifest says ${promised.maxTexturePx}`)
}

/** A bare structural check of a manifest body: the runtime carries no Zod, `assets:check` and tests do the full parse. */
export function assertManifestShape(value: unknown): void {
  const models = (value as { models?: unknown } | null)?.models
  if (!Array.isArray(models)) throw new ModelLoadError('manifest', 'manifest has no models array')
  for (const entry of models) {
    const e = entry as { id?: unknown; variants?: unknown } | null
    if (!e || typeof e.id !== 'string' || !Array.isArray(e.variants)) throw new ModelLoadError('manifest', 'manifest entry has no id or variants')
  }
}
