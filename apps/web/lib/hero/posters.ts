/**
 * The hero posters' manifest and URLs — hero monolith spec § 7.
 *
 * `public/posters/manifest.json` is written by `npm run posters:render` and read here as plain JSON, so the server
 * component that emits the `<picture>` needs no runtime lookup and the client bundle gets none of it. Files are
 * content-hashed (`hero-portrait-full.<sha8>.avif`), so they are served immutable and a changed render is a new URL.
 *
 * Types only plus two pure helpers: nothing here imports `sharp` or Playwright, which stay in `scripts/posters`.
 */

import committed from '@/public/posters/manifest.json'

export type PosterState = 'full' | 'mid' | 'dust'
export type PosterOrientation = 'portrait' | 'landscape'
export type PosterFormat = 'avif' | 'webp'

export interface PosterFile {
  /** File name under `/posters/`, with the first 8 hex of `sha256` in it. */
  readonly file: string
  readonly bytes: number
  readonly sha256: string
}

export interface PosterEntry {
  readonly state: PosterState
  readonly orientation: PosterOrientation
  /** Pixels of the image itself, not css pixels. */
  readonly width: number
  readonly height: number
  readonly avif: PosterFile
  readonly webp: PosterFile
}

export interface PosterManifest {
  /** Bumped when the pipeline's own code changes the bytes for the same inputs. */
  readonly pipeline: number
  /** Hash of everything that decides the render: see `scripts/posters/spec.ts`. `posters:check` recomputes it. */
  readonly inputsHash: string
  /** Provenance only (not hashed): what produced these bytes. */
  readonly renderedWith: { readonly chromium: string; readonly sharp: string; readonly playwright: string }
  readonly posters: readonly PosterEntry[]
  readonly og: PosterFile & { readonly width: number; readonly height: number }
}

export const posterManifest: PosterManifest = committed as PosterManifest

export const POSTER_DIR = '/posters/'
export const OG_DIR = '/og/'

export const posterUrl = (file: string): string => `${POSTER_DIR}${file}`
export const ogUrl = (file: string): string => `${OG_DIR}${file}`

export function findPoster(manifest: PosterManifest, state: PosterState, orientation: PosterOrientation): PosterEntry {
  const hit = manifest.posters.find((p) => p.state === state && p.orientation === orientation)
  if (!hit) throw new Error(`hero poster ${state}/${orientation} is missing from the manifest: run npm run posters:render`)
  return hit
}
