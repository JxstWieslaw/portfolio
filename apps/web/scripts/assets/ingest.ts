/**
 * `npm run assets:ingest` (entry: `ingest.cli.ts`)
 *
 * Turns sources (generated, or raw files in the gitignored `assets-src/`) into hashed per-tier
 * GLBs under `apps/web/public/models`, plus the default manifest and `content/credits.json`.
 * Nothing is imported by the app; the output is committed. See the usage block in `USAGE`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import {
  modelEntrySchema,
  modelManifestSchema,
  type ModelEntry,
  type ModelManifest,
  type ModelVariant,
} from '@repo/contracts'

import { IngestRejected, SourceHashMismatch, buildVariant, loadSource, loadToolchain, type BuiltVariant } from './pipeline'
import { defaultRoot, deriveCredit, layoutFor, loadSources, tiersOf, type Layout, type SourceEntry } from './sources'
import {
  canonicalJson,
  contentHashOf,
  describeError,
  integrityOf,
  roundSeconds,
  sha256Hex,
  validateRepoBytes,
} from './validators'

export interface IngestOptions {
  readonly root: string
  readonly id?: string
  readonly only?: 'generated'
  readonly dryRun?: boolean
  readonly verify?: boolean
  readonly acceptSourceChange?: boolean
  readonly log?: (line: string) => void
}

export interface IngestResult {
  readonly manifest: ModelManifest
  readonly manifestText: string
  readonly creditsText: string
  /** File name to bytes, for the sources processed in this run only. */
  readonly files: ReadonlyMap<string, Uint8Array>
  /** Non-empty only with `verify`: what differs from the committed output. */
  readonly mismatches: readonly string[]
  /** Ids processed in this run, and ids left alone because of --id / --only. */
  readonly verified: readonly string[]
  readonly skipped: readonly string[]
  /** Sources whose raw hash differed and were accepted for this run. */
  readonly acceptedChanges: readonly { readonly id: string; readonly sha256: string }[]
}

function readExistingManifest(layout: Layout): ModelManifest | null {
  if (!existsSync(layout.manifestFile)) return null
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(layout.manifestFile, 'utf8').replace(/^\uFEFF/, ''))
  } catch (error) {
    throw new Error(`${layout.manifestFile} is not valid JSON; fix or delete it`, { cause: error })
  }
  const parsed = modelManifestSchema.safeParse(raw)
  if (!parsed.success)
    throw new Error(`${layout.manifestFile} does not parse (${parsed.error.issues[0]?.message ?? 'unknown'}); fix or delete it`)
  return parsed.data
}

function toVariant(source: SourceEntry, built: BuiltVariant): ModelVariant {
  const hash8 = sha256Hex(built.bytes).slice(0, 8)
  return {
    tier: built.tier,
    requires: built.requires,
    url: `/models/${source.id}.t${built.tier}.${hash8}.glb`,
    bytes: built.bytes.byteLength,
    triangles: built.report.triangles,
    maxTexturePx: built.maxTexturePx,
    integrity: integrityOf(built.bytes),
    extensions: built.extensions,
  }
}

function writeAtomically(file: string, text: string): void {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, file)
}

export async function runIngest(opts: IngestOptions): Promise<IngestResult> {
  const log = opts.log ?? (() => undefined)
  const layout = layoutFor(opts.root)
  const sources = loadSources(layout)
  const existing = readExistingManifest(layout)

  const selected = sources.filter(
    (s) => (opts.id === undefined || s.id === opts.id) && (opts.only === undefined || s.origin.type === opts.only),
  )
  if (opts.id !== undefined && selected.length === 0) throw new Error(`no source with id "${opts.id}" in sources.json`)
  const selectedIds = new Set(selected.map((s) => s.id))
  const skipped = sources.filter((s) => !selectedIds.has(s.id)).map((s) => s.id)

  if (opts.verify && selected.length === 0)
    throw new Error(`--verify compared nothing: no source matched (${sources.length} in sources.json, all skipped)`)

  // A partial run rewrites the whole manifest; it may only keep entries that already exist.
  const missing = sources.filter((s) => !selectedIds.has(s.id) && !existing?.models.some((m) => m.id === s.id))
  if (missing.length > 0)
    throw new IngestRejected(
      'partial ingest',
      missing.map((s) => ({
        code: 'COMPLETE' as const,
        subject: s.id,
        message: 'has no manifest entry and was not selected; run a full `npm run assets:ingest` first',
      })),
    )

  const tc = await loadToolchain()
  const files = new Map<string, Uint8Array>()
  const built = new Map<string, ModelEntry>()
  const acceptedChanges: { id: string; sha256: string }[] = []

  for (const source of selected) {
    log(`ingest ${source.id} (${source.origin.type})`)
    let loaded
    try {
      loaded = loadSource(source, layout, tc, { acceptSourceChange: opts.acceptSourceChange === true })
    } catch (error) {
      if (error instanceof SourceHashMismatch) throw error
      const hint = source.origin.type === 'file' ? `; fetch it first: npm run assets:fetch -- --id ${source.id}` : ''
      throw new Error(`cannot read source "${source.id}": ${describeError(error)}${hint}`, { cause: error })
    }
    if (source.origin.type === 'file' && loaded.rawSha256 !== null && loaded.rawSha256 !== source.origin.sha256) {
      acceptedChanges.push({ id: source.id, sha256: loaded.rawSha256 })
    }

    const variants: ModelVariant[] = []
    let clips: ModelEntry['clips'] | null = null
    for (const tier of tiersOf(source)) {
      const subject = `${source.id} tier ${tier}`
      const result = await buildVariant(tc, await loaded.makeDocument(), { subject, tier, clips: source.clips, log })
      const variant = toVariant(source, result)
      variants.push(variant)
      files.set(variant.url.slice('/models/'.length), result.bytes)
      const tierClips = result.report.clips.map((c) => ({ name: c.name, seconds: roundSeconds(c.seconds) }))
      if (clips === null) clips = tierClips
      else if (JSON.stringify(clips) !== JSON.stringify(tierClips))
        throw new IngestRejected(subject, [{ code: 'CLIPS', subject, message: 'clips differ between tiers' }])
      log(`  tier ${tier}: ${result.bytes.byteLength} B, ${variant.triangles} triangles, ${sha256Hex(result.bytes).slice(0, 8)}`)
    }
    built.set(
      source.id,
      modelEntrySchema.parse({
        id: source.id,
        title: source.title,
        kind: source.kind,
        enabled: source.enabled,
        boundsRadius: 1,
        clips: clips ?? [],
        variants,
      }),
    )
  }

  // Merge with what is committed: untouched sources keep their entries, metadata follows sources.json.
  const models: ModelEntry[] = []
  for (const source of sources) {
    const fresh = built.get(source.id)
    const kept = existing?.models.find((m) => m.id === source.id)
    const entry = fresh ?? (kept ? { ...kept, title: source.title, kind: source.kind, enabled: source.enabled } : null)
    if (entry) models.push(entry)
  }
  models.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const repoViolations = validateRepoBytes(models.flatMap((m) => m.variants.map((x) => ({ name: x.url, bytes: x.bytes }))))
  if (repoViolations.length > 0) throw new IngestRejected('repository', repoViolations)

  const manifest = modelManifestSchema.parse({ version: 1, contentHash: contentHashOf(models), models })
  const manifestText = canonicalJson(manifest)
  const enabledIds = new Set(sources.filter((s) => s.enabled).map((s) => s.id))
  const credits = models
    .filter((m) => enabledIds.has(m.id))
    .flatMap((m) => {
      const source = sources.find((s) => s.id === m.id)
      return source ? [deriveCredit(source)] : []
    })
  const creditsText = canonicalJson(credits)

  const mismatches: string[] = []
  if (opts.verify) {
    for (const [name, bytes] of files) {
      const onDisk = path.join(layout.modelsDir, name)
      if (!existsSync(onDisk)) mismatches.push(`${name}: not committed (run assets:ingest)`)
      else if (sha256Hex(new Uint8Array(readFileSync(onDisk))) !== sha256Hex(bytes))
        mismatches.push(`${name}: committed bytes differ from a fresh ingest`)
    }
    const read = (file: string) =>
      existsSync(file) ? canonicalJson(JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))) : ''
    if (read(layout.manifestFile) !== manifestText) mismatches.push('manifest.json differs from a fresh ingest')
    if (read(layout.creditsFile) !== creditsText) mismatches.push('credits.json differs from a fresh ingest')
  } else if (!opts.dryRun) {
    mkdirSync(layout.modelsDir, { recursive: true })
    mkdirSync(path.dirname(layout.creditsFile), { recursive: true })
    // Order matters: new GLBs first, then the manifest and credits that name them (each swapped in
    // atomically), and only then the files nothing references any more.
    for (const [name, bytes] of files) writeFileSync(path.join(layout.modelsDir, name), bytes)
    writeAtomically(layout.manifestFile, manifestText)
    writeAtomically(layout.creditsFile, creditsText)
    const referenced = new Set(models.flatMap((m) => m.variants.map((x) => x.url.slice('/models/'.length))))
    for (const name of readdirSync(layout.modelsDir)) {
      const owner = [...selectedIds].find((id) => new RegExp(`^${id}\\.t\\d\\.[0-9a-f]{8}\\.glb$`).test(name))
      if (owner !== undefined && !referenced.has(name)) unlinkSync(path.join(layout.modelsDir, name))
    }
  }

  return { manifest, manifestText, creditsText, files, mismatches, verified: [...selectedIds], skipped, acceptedChanges }
}

const USAGE = `usage: npm run assets:ingest -- [--id <id>] [--only generated] [--verify] [--dry-run] [--accept-source-change]`

export async function main(
  args: readonly string[] = process.argv.slice(2),
  root: string = defaultRoot(),
): Promise<number> {
  try {
    const { values } = parseArgs({
      args: [...args],
      options: {
        id: { type: 'string' },
        only: { type: 'string' },
        verify: { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        'accept-source-change': { type: 'boolean', default: false },
      },
      strict: true,
    })
    if (values.only !== undefined && values.only !== 'generated') {
      console.error(`--only accepts "generated" only\n${USAGE}`)
      return 2
    }
    const result = await runIngest({
      root,
      id: values.id,
      only: values.only === 'generated' ? 'generated' : undefined,
      verify: values.verify,
      dryRun: values['dry-run'],
      acceptSourceChange: values['accept-source-change'],
      log: (line) => console.log(line),
    })
    for (const c of result.acceptedChanges)
      console.warn(`warning: ${c.id} changed upstream; pin the new sha256 in sources.json: ${c.sha256}`)
    if (values.verify) {
      if (result.mismatches.length > 0) {
        for (const m of result.mismatches) console.error(`verify: ${m}`)
        return 1
      }
      console.log(
        `verify: ${result.verified.length} source(s) checked (${result.verified.join(', ')}); ` +
          `skipped: ${result.skipped.length > 0 ? result.skipped.join(', ') : 'none'}; ` +
          `${result.files.size} file(s), manifest and credits identical to a fresh ingest`,
      )
    } else if (values['dry-run']) console.log(`dry run: ${result.files.size} file(s) would be written, nothing was`)
    else console.log(`wrote ${result.files.size} file(s), manifest ${result.manifest.contentHash}`)
    return 0
  } catch (error) {
    console.error(describeError(error))
    return 1
  }
}
