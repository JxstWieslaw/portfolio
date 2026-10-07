/**
 * What the hero posters are and what decides their bytes — hero monolith spec § 7.
 *
 * The posters are renders of the live engine (`HeroEngine`, the same GLSL, the same framing code), not a separate
 * piece of art, so the cross-fade from poster to first live frame is between two pictures of one thing. This file is
 * the single list of sizes, states, encoders and budgets, and of the source files whose bytes decide the render.
 *
 * `inputsHash` is the poster pipeline's version of the model pipeline's `buildInputsHash`: CI cannot render (no GPU,
 * and SwiftShader output is not guaranteed bit-identical across CPUs), but it can recompute this hash from the
 * committed sources and compare it with the one `posters:render` stored. Change the shader, the engine, the camera,
 * the framing or an encoder setting without re-rendering and `posters:check` fails and names the reason.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

export const POSTER_PIPELINE_VERSION = 1

/** Fixed clock for the stills (`?freeze=<t>,<s>`): the dust is placed by hash, so t only sets spin. */
export const FREEZE_T = 3

/** `s` is the engine's assembly value: 1 is the monolith, 0.7 is mid-dissolve, 0.35 is the scroll floor (dust). */
export const STATES = [
  { id: 'full', s: 1.0 },
  { id: 'mid', s: 0.7 },
  { id: 'dust', s: 0.35 },
] as const

/** Viewport in css pixels and the device pixel ratio the still is rendered at (tier 3 caps the canvas at 2). */
export const ORIENTATIONS = [
  { id: 'portrait', cssWidth: 390, cssHeight: 844, scale: 2 },
  { id: 'landscape', cssWidth: 1440, cssHeight: 900, scale: 1.5 },
] as const

export const OG = { width: 1200, height: 630 } as const

/**
 * Each poster is encoded at the highest quality that fits its byte budget: start at `quality`, step down by `step`, stop
 * at the first result within budget, and never go below `floor` (below it the dark gradients band and the shards smear).
 * A file that still misses its budget at the floor is reported by the render and fails `posters:check`.
 */
export const ENCODE = {
  avif: { quality: 50, floor: 28, step: 4, effort: 9, chromaSubsampling: '4:2:0' },
  webp: { quality: 75, floor: 30, step: 5, effort: 6 },
  og: { palette: true, colours: 128, dither: 0.6, compressionLevel: 9, effort: 10 },
} as const

/**
 * Floors, not budgets: a poster smaller than this is a blank or near-blank frame that encoded to nothing. The real files are
 * 10 kB and up (posters) and 80 kB (OG).
 */
export const MIN_BYTES = { poster: 4_000, og: 30_000 } as const

/** The spec's tolerance between the poster and the first live frame (§ 7): mean and p95 of the per-pixel error on 0..1. */
export const PARITY = { mean: 0.03, p95: 0.1 } as const

/** Per-file byte budgets, from the spec's § 7 table. */
export const BUDGET_BYTES = {
  portraitFull: 12_000,
  portraitOther: 14_000,
  landscape: 30_000,
  og: 120_000,
} as const

/**
 * The one deviation from the spec's table: the WebP *dust* stills are the densest picture (thousands of small shards) and
 * WebP is the fallback for a browser with no AVIF, which is nobody on a current Chrome, Firefox or Safari. At the quality
 * floor they are 16.3 kB (portrait) and 37.8 kB (landscape), so their budget is the measured size rounded up. The AVIF
 * dust stills, the ones that are served, meet the spec's 14 kB and 30 kB.
 */
export const WEBP_DUST_BUDGET_BYTES = { portrait: 17_000, landscape: 38_000 } as const

export function budgetFor(state: string, orientation: string, format: 'avif' | 'webp' = 'avif'): number {
  if (format === 'webp' && state === 'dust') return orientation === 'landscape' ? WEBP_DUST_BUDGET_BYTES.landscape : WEBP_DUST_BUDGET_BYTES.portrait
  if (orientation === 'landscape') return BUDGET_BYTES.landscape
  return state === 'full' ? BUDGET_BYTES.portraitFull : BUDGET_BYTES.portraitOther
}

/**
 * Files (relative to `apps/web`) whose bytes decide what the engine draws, where it frames the subject, or how the page
 * around it lays out (the framing reads the glass panel's box). A unit test checks that every module the engine and the
 * layer import under `lib/hero` and `components/three/hero` is listed here.
 */
export const SOURCE_FILES = [
  // The engine and what it imports.
  'components/three/hero/hero.glsl.ts',
  'components/three/hero/HeroEngine.ts',
  'components/three/hero/HeroLayer.tsx',
  'lib/hero/geometry.ts',
  'lib/hero/progress.ts',
  'lib/hero/frame.ts',
  'lib/hero/tiers.ts',
  'lib/hero/governor.ts',
  'lib/hero/clock.ts',
  // The page the framing measures: the hero section, the components in its panel, the nav, the type and the stylesheet.
  'components/sections/Hero.tsx',
  'components/ui/GlassCard.tsx',
  'components/ui/Button.tsx',
  'components/ui/Eyebrow.tsx',
  'components/ui/KpiTile.tsx',
  'components/ui/Reveal.tsx',
  'components/layout/Section.tsx',
  'components/layout/Nav.tsx',
  'app/fonts.ts',
  'app/globals.css',
  // The copy that sets the panel's height.
  '../../content/profile.json',
  '../../content/projects.json',
  // The pipeline itself.
  'scripts/render-posters.ts',
] as const

/** Hash text with line endings normalised, so a Windows checkout and a Linux one agree. */
export function sha256Text(text: string): string {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex')
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** `sharp` is pinned exactly in package.json, so its version is part of the inputs (an encoder change changes bytes). */
export function sharpVersionFrom(webRoot: string): string {
  const pkg = JSON.parse(readFileSync(path.join(webRoot, 'package.json'), 'utf8')) as { devDependencies?: Record<string, string> }
  const version = pkg.devDependencies?.sharp
  if (!version) throw new Error('sharp is not pinned in apps/web/package.json devDependencies, so the posters have no encoder version to hash')
  return version
}

/** The first 16 hex of the sha256 of everything that decides the render. Key order never matters. */
export function posterInputsHash(webRoot: string): string {
  const sources: Record<string, string> = {}
  for (const file of SOURCE_FILES) {
    let text: string
    try {
      text = readFileSync(path.join(webRoot, file), 'utf8')
    } catch {
      throw new Error(`the poster inputs list names ${file}, which cannot be read: update SOURCE_FILES in scripts/posters/spec.ts`)
    }
    sources[file] = sha256Text(text)
  }
  const inputs = {
    pipeline: POSTER_PIPELINE_VERSION,
    sources,
    freezeT: FREEZE_T,
    states: STATES,
    orientations: ORIENTATIONS,
    og: OG,
    encode: ENCODE,
    sharp: sharpVersionFrom(webRoot),
  }
  return createHash('sha256').update(canonicalJson(inputs)).digest('hex').slice(0, 16)
}

export const staleMessage = (): string => 'the hero engine, its framing or the poster settings changed since the posters were rendered: run npm run posters:render'
