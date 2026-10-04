/**
 * The hand-authored registry of model sources, `content/models/sources.json`.
 *
 * The schema lives here and not in `@repo/contracts` because only the scripts read it. Each
 * file-backed entry pins the raw download three ways: where it comes from (`url`), what it
 * hashed to (`sha256`), and the primary-source page that proves its licence
 * (`licenceEvidence`). Ingest and fetch both refuse to run on a hash mismatch.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  creditSchema,
  httpsUrlSchema,
  isoDateSchema,
  licenceSchema,
  modelTierSchema,
  slugSchema,
  type Credit,
  type ModelTier,
} from '@repo/contracts'
import { z } from 'zod'

import { SOURCE_HOSTS, isSourceHost } from './hosts'

const httpsUrl = httpsUrlSchema
const isoDate = isoDateSchema
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}
const sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'must be 64 lowercase hex characters')

/** Generators are code in `scripts/assets/generators/`; a new one is a reviewed change to this list. */
export const GENERATOR_IDS = ['gyroscope'] as const
export type GeneratorId = (typeof GENERATOR_IDS)[number]

const fileOrigin = z.object({
  type: z.literal('file'),
  /** Inside the gitignored `assets-src/<id>/`; the file ingest reads. */
  path: z
    .string()
    // A space is legal inside a segment (Kenney ships "Models/GLB format/x.glb"), never at its edges.
    .regex(
      /^assets-src\/[a-z0-9]+(?:-[a-z0-9]+)*\/(?:[A-Za-z0-9._-]+(?: [A-Za-z0-9._-]+)*\/)*[A-Za-z0-9._-]+(?: [A-Za-z0-9._-]+)*\.glb$/,
      'must be assets-src/<id>/...glb',
    )
    .refine((p) => !p.split('/').some((s) => s === '..' || s === '.' || s === ''), 'no relative or empty segments'),
  /** Where `assets:fetch` downloads it from. Must pass the host allow-list in fetch.ts. */
  url: httpsUrl,
  /** sha256 of the GLB at `path`. */
  sha256,
  /** Set when `url` is a zip: sha256 of the archive as downloaded, checked before extraction. */
  archiveSha256: sha256.optional(),
}).strict()

const generatedOrigin = z.object({
  type: z.literal('generated'),
  generator: z.enum(GENERATOR_IDS),
}).strict()

const hexColour = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be an sRGB hex colour like #7C3AED')

/**
 * How a flat-colour, multi-material source is made to fit the site (see `look.ts` for the rule).
 * Present means: merge every material into one by baking colours into COLOR_0.
 */
export const sourceLookSchema = z
  .object({
    /** Source material name to the sRGB colour it becomes. A material not listed keeps its source colour. */
    palette: z.record(z.string().min(1).max(60), hexColour).optional(),
    metallic: z.number().min(0).max(1).optional(),
    roughness: z.number().min(0).max(1).optional(),
    /** A uniform emissive accent on the merged material: `amount` scales the colour, 0..1. */
    emissive: z.object({ color: hexColour, amount: z.number().min(0).max(1) }).strict().optional(),
  })
  .strict()
export type SourceLook = z.infer<typeof sourceLookSchema>

export const sourceEntrySchema = z
  .object({
    id: slugSchema,
    title: z.string().min(1).max(120),
    kind: z.enum(['hero', 'prop']),
    enabled: z.boolean(),
    origin: z.discriminatedUnion('type', [fileOrigin, generatedOrigin]),
    licenceId: licenceSchema,
    /** The primary-source page that shows the licence, and the day it was read. */
    licenceEvidence: z.object({ url: httpsUrl, retrievedAt: isoDate }).strict(),
    credit: z.object({
      author: z.string().min(1).max(120),
      sourceUrl: httpsUrl,
      licenceUrl: httpsUrl.optional(),
      retrievedAt: isoDate,
    }).strict(),
    look: sourceLookSchema.optional(),
    clips: z.array(z.object({ from: z.string().min(1), as: slugSchema.max(40) })).max(2).optional(),
    tiers: z
      .array(modelTierSchema)
      .min(1)
      .refine((t) => new Set(t).size === t.length, 'tiers must be unique')
      .optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.licenceId === 'CC-BY-4.0' && !e.credit.licenceUrl)
      ctx.addIssue({ code: 'custom', path: ['credit', 'licenceUrl'], message: 'CC-BY requires a licenceUrl' })
    // `own` means "I made it": only a generator in this repository can say so. Everything downloaded is someone else's.
    if (e.licenceId === 'own' && e.origin.type !== 'generated')
      ctx.addIssue({ code: 'custom', path: ['licenceId'], message: 'own is only legal for generated origins' })
    if (e.origin.type === 'generated' && e.licenceId !== 'own')
      ctx.addIssue({ code: 'custom', path: ['licenceId'], message: 'generated origins must be own' })
    if (e.origin.type === 'file') {
      // `.url()` can fail without stopping this refine, so a bad URL is a path-scoped message, never a TypeError.
      const downloadHost = hostOf(e.origin.url)
      const evidenceHost = hostOf(e.licenceEvidence.url)
      if (downloadHost === null) ctx.addIssue({ code: 'custom', path: ['origin', 'url'], message: 'not a URL whose host can be read' })
      else if (!isSourceHost(downloadHost))
        ctx.addIssue({ code: 'custom', path: ['origin', 'url'], message: `host ${downloadHost} is not a known source host (see scripts/assets/hosts.ts)` })
      if (evidenceHost === null) ctx.addIssue({ code: 'custom', path: ['licenceEvidence', 'url'], message: 'not a URL whose host can be read' })
      else if (downloadHost !== null && isSourceHost(downloadHost) && !(SOURCE_HOSTS[downloadHost].evidence as readonly string[]).includes(evidenceHost))
        ctx.addIssue({
          code: 'custom',
          path: ['licenceEvidence', 'url'],
          message: `licence evidence must be on one of: ${SOURCE_HOSTS[downloadHost].evidence.join(', ')}`,
        })
    }
    if (e.origin.type === 'file' && !e.origin.path.startsWith(`assets-src/${e.id}/`))
      ctx.addIssue({ code: 'custom', path: ['origin', 'path'], message: `path must start with assets-src/${e.id}/` })
  })
export type SourceEntry = z.infer<typeof sourceEntrySchema>

export const sourcesFileSchema = z.array(sourceEntrySchema).superRefine((list, ctx) => {
  const seen = new Set<string>()
  for (const [i, e] of list.entries()) {
    if (seen.has(e.id)) ctx.addIssue({ code: 'custom', path: [i, 'id'], message: `duplicate id ${e.id}` })
    seen.add(e.id)
  }
})

export const ALL_TIERS: readonly ModelTier[] = [1, 2, 3]

export function tiersOf(entry: SourceEntry): readonly ModelTier[] {
  return [...(entry.tiers ?? ALL_TIERS)].sort((a, b) => a - b)
}

/** The credits row for a source. `credits.json` is exactly these, for enabled entries, in manifest order. */
export function deriveCredit(entry: SourceEntry): Credit {
  return creditSchema.parse({
    assetId: entry.id,
    title: entry.title,
    author: entry.credit.author,
    sourceUrl: entry.credit.sourceUrl,
    licence: entry.licenceId,
    ...(entry.credit.licenceUrl ? { licenceUrl: entry.credit.licenceUrl } : {}),
    retrievedAt: entry.credit.retrievedAt,
  })
}

export interface Layout {
  readonly root: string
  readonly sourcesFile: string
  readonly manifestFile: string
  readonly creditsFile: string
  readonly modelsDir: string
  readonly assetsSrcDir: string
}

/** The repository root is four levels above this file: apps/web/scripts/assets/. */
export function defaultRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
}

export function layoutFor(root: string): Layout {
  return {
    root,
    sourcesFile: path.join(root, 'content', 'models', 'sources.json'),
    manifestFile: path.join(root, 'apps', 'web', 'public', 'models', 'manifest.json'),
    creditsFile: path.join(root, 'content', 'credits.json'),
    modelsDir: path.join(root, 'apps', 'web', 'public', 'models'),
    assetsSrcDir: path.join(root, 'assets-src'),
  }
}

export function loadSources(layout: Layout): SourceEntry[] {
  const raw: unknown = JSON.parse(readFileSync(layout.sourcesFile, 'utf8').replace(/^\uFEFF/, ''))
  return sourcesFileSchema.parse(raw)
}
