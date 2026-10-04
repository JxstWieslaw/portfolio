/**
 * `npm run assets:check` (entry: `check.cli.ts`)
 *
 * Validates the committed result of an ingest: manifest, credits, every GLB in
 * `apps/web/public/models`. Every claim the manifest makes about a file is re-derived from the
 * file itself and compared. No raw input, no network: it runs in CI on every push and exits 1
 * on any violation.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { modelManifestSchema, type ModelManifest } from '@repo/contracts'

import { verifyImages } from './images'
import { buildInputsHash, staleBuildMessage } from './build-inputs'
import { loadToolchain, measureBoundsRadius, type Toolchain } from './pipeline'
import { defaultRoot, deriveCredit, layoutFor, loadSources, tiersOf, type SourceEntry } from './sources'
import {
  GlbFormatError,
  buildReport,
  contentHashOf,
  deriveVariantMeta,
  describeError,
  printable,
  scanGlb,
  validateComplete,
  validateCredits,
  validateFileName,
  validateHash,
  validateOrphans,
  validateRepoBytes,
  validateReport,
  type Violation,
} from './validators'

export interface CheckResult {
  readonly violations: readonly Violation[]
  readonly sources: number
  readonly entries: number
  readonly files: number
}

const schema = (subject: string, message: string): Violation => ({ code: 'SCHEMA', subject, message })
const sameSet = (a: readonly string[], b: readonly string[]) => [...a].sort().join('|') === [...b].sort().join('|')
/** Manifest `boundsRadius` against a measurement: ingest normalises to 1, within quantisation error. */
const BOUNDS_TOLERANCE = 1e-3

function readJson(file: string): { ok: true; value: unknown } | { ok: false; message: string } {
  if (!existsSync(file)) return { ok: false, message: 'file is missing' }
  try {
    return { ok: true, value: JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as unknown }
  } catch (error) {
    return { ok: false, message: `not valid JSON (${describeError(error)})` }
  }
}

export async function runCheck(opts: { readonly root: string }): Promise<CheckResult> {
  const layout = layoutFor(opts.root)
  const violations: Violation[] = []

  let sources: SourceEntry[] = []
  try {
    sources = loadSources(layout)
  } catch (error) {
    violations.push(schema('sources.json', describeError(error)))
  }

  let manifest: ModelManifest | null = null
  const manifestRead = readJson(layout.manifestFile)
  if (!manifestRead.ok) violations.push(schema('manifest.json', manifestRead.message))
  else {
    const parsed = modelManifestSchema.safeParse(manifestRead.value)
    if (!parsed.success)
      violations.push(...parsed.error.issues.map((i) => schema('manifest.json', `${i.path.join('.') || '$'}: ${i.message}`)))
    else {
      manifest = parsed.data
      if (contentHashOf(manifest.models) !== manifest.contentHash)
        violations.push(schema('manifest.json', 'contentHash does not match the models; run assets:ingest'))
    }
  }

  let creditRows: unknown[] = []
  const creditsRead = readJson(layout.creditsFile)
  if (!creditsRead.ok) violations.push(schema('credits.json', creditsRead.message))
  // Rows are parsed one by one in validateCredits for a precise message; only a non-array stops here.
  else if (!Array.isArray(creditsRead.value)) violations.push(schema('credits.json', 'must be a JSON array'))
  else creditRows = creditsRead.value

  const onDisk = existsSync(layout.modelsDir) ? readdirSync(layout.modelsDir) : []
  const glbOnDisk = onDisk.filter((f) => f.endsWith('.glb'))
  for (const f of onDisk) {
    if (f !== 'manifest.json' && !f.endsWith('.glb'))
      violations.push({ code: 'ORPHAN', subject: f, message: 'unexpected file in public/models' })
  }
  const diskSizes = glbOnDisk.map((name) => ({ name, bytes: statSync(path.join(layout.modelsDir, name)).size }))
  violations.push(...validateRepoBytes(diskSizes))

  const manifestFiles: string[] = []
  let toolchain: Toolchain | null = null
  if (manifest) {
    for (const source of sources) {
      if (source.enabled && !manifest.models.some((m) => m.id === source.id))
        violations.push({ code: 'COMPLETE', subject: source.id, message: 'enabled source has no manifest entry; run assets:ingest' })
    }

    for (const entry of manifest.models) {
      const source = sources.find((s) => s.id === entry.id)
      if (!source) {
        violations.push(schema(entry.id, 'manifest entry has no matching source in sources.json'))
        continue
      }
      if (source.enabled && entry.buildInputsHash !== buildInputsHash(source)) violations.push(schema(entry.id, staleBuildMessage(entry.id)))
      if (entry.enabled !== source.enabled) violations.push(schema(entry.id, 'enabled differs from sources.json; run assets:ingest'))
      violations.push(
        ...validateComplete(
          entry,
          tiersOf(source),
          entry.variants.map((v) => v.tier),
        ),
      )

      for (const variant of entry.variants) {
        if (!variant.url.startsWith('/models/')) {
          violations.push(schema(entry.id, `variant url ${variant.url} must be a same-origin /models/ path in the committed manifest`))
          continue
        }
        const fileName = variant.url.slice('/models/'.length)
        manifestFiles.push(fileName)
        violations.push(...validateFileName(fileName, entry.id, variant.tier))
        const file = path.join(layout.modelsDir, fileName)
        if (!existsSync(file)) continue // reported by validateOrphans
        const bytes = new Uint8Array(readFileSync(file))
        violations.push(...validateHash(fileName, bytes, variant.integrity))
        try {
          const report = buildReport(bytes, variant.tier)
          violations.push(...validateReport(report, { subject: fileName, tier: variant.tier, manifestClips: entry.clips }))
          const scanned = scanGlb(bytes, fileName, variant.tier)
          violations.push(...scanned)
          // Decoders (sharp, the meshopt reader) only ever see a file the scanner passed: a hostile file
          // does not get to pick how much work they do. A scanner finding is this file's verdict.
          const clean = scanned.length === 0
          if (clean) violations.push(...(await verifyImages(bytes, fileName, variant.tier)))

          if (report.bytes !== variant.bytes) violations.push(schema(fileName, `manifest says ${variant.bytes} B, file is ${report.bytes} B`))
          if (report.triangles !== variant.triangles)
            violations.push(schema(fileName, `manifest says ${variant.triangles} triangles, file has ${report.triangles}`))
          const meta = deriveVariantMeta(report)
          if (!sameSet(meta.requires, variant.requires))
            violations.push(schema(fileName, `manifest requires [${variant.requires.join(', ')}], file needs [${meta.requires.join(', ')}]`))
          if (!sameSet(meta.extensions, variant.extensions))
            violations.push(schema(fileName, `manifest extensions [${variant.extensions.join(', ')}], file uses [${meta.extensions.join(', ')}]`))
          if (meta.maxTexturePx !== variant.maxTexturePx)
            violations.push(schema(fileName, `manifest says max texture ${variant.maxTexturePx} px, file has ${meta.maxTexturePx} px`))

          if (!clean) continue
          toolchain ??= await loadToolchain()
          // A file the scanner already flags can still crash the reader (a view past the buffer, say):
          // that is this file's violation, never the end of the run.
          try {
            const radius = await measureBoundsRadius(toolchain, bytes)
            if (Math.abs(radius - entry.boundsRadius) > BOUNDS_TOLERANCE)
              violations.push(schema(fileName, `manifest boundsRadius ${entry.boundsRadius}, measured ${radius.toFixed(4)}`))
          } catch (error) {
            violations.push(schema(fileName, `bounds could not be measured: ${describeError(error)}`))
          }
        } catch (error) {
          if (error instanceof GlbFormatError || error instanceof SyntaxError)
            violations.push(schema(fileName, `not a readable GLB: ${error.message}`))
          else throw error
        }
      }
    }

    const derived = manifest.models
      .filter((m) => m.enabled)
      .flatMap((m) => {
        const source = sources.find((s) => s.id === m.id)
        return source ? [deriveCredit(source)] : []
      })
    violations.push(...validateCredits(manifest.models, derived, creditRows))
  }
  violations.push(...validateOrphans(glbOnDisk, manifestFiles))

  return { violations, sources: sources.length, entries: manifest?.models.length ?? 0, files: glbOnDisk.length }
}

export async function main(root: string = defaultRoot()): Promise<number> {
  try {
    const result = await runCheck({ root })
    // Subjects and messages can carry text from a hostile file: a newline in a key must not forge a workflow command.
    for (const x of result.violations) console.error(printable(`[${x.code}] ${x.subject}: ${x.message}`))
    if (result.violations.length > 0) {
      console.error(`assets:check failed with ${result.violations.length} violation(s)`)
      return 1
    }
    if (result.entries === 0)
      console.log(`assets:check ok, but nothing was validated: ${result.sources} source(s), 0 manifest entries, ${result.files} GLB file(s)`)
    else console.log(`assets:check ok: ${result.entries} entr${result.entries === 1 ? 'y' : 'ies'}, ${result.files} GLB file(s)`)
    return 0
  } catch (error) {
    console.error(printable(`assets:check crashed: ${describeError(error)}`))
    return 1
  }
}
