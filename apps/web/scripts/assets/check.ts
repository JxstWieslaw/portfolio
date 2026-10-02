/**
 * `npm run assets:check`
 *
 * Validates the committed result of an ingest: manifest, credits, every GLB in
 * `apps/web/public/models`. No raw input, no network, no toolchain beyond Zod: it runs in CI
 * on every push and exits 1 on any violation.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { modelManifestSchema, type ModelManifest } from '@repo/contracts'

import { defaultRoot, deriveCredit, layoutFor, loadSources, tiersOf, type SourceEntry } from './sources'
import {
  GlbFormatError,
  buildReport,
  contentHashOf,
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
  readonly entries: number
  readonly files: number
}

const schema = (subject: string, message: string): Violation => ({ code: 'SCHEMA', subject, message })

function readJson(file: string): { ok: true; value: unknown } | { ok: false; message: string } {
  if (!existsSync(file)) return { ok: false, message: 'file is missing' }
  try {
    return { ok: true, value: JSON.parse(readFileSync(file, 'utf8')) as unknown }
  } catch (error) {
    return { ok: false, message: `not valid JSON (${error instanceof Error ? error.message : String(error)})` }
  }
}

export function runCheck(opts: { readonly root: string }): CheckResult {
  const layout = layoutFor(opts.root)
  const violations: Violation[] = []

  let sources: SourceEntry[] = []
  try {
    sources = loadSources(layout)
  } catch (error) {
    violations.push(schema('sources.json', error instanceof Error ? error.message : String(error)))
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
  if (manifest) {
    for (const entry of manifest.models) {
      const source = sources.find((s) => s.id === entry.id)
      if (!source) {
        violations.push(schema(entry.id, 'manifest entry has no matching source in sources.json'))
        continue
      }
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
          const report = buildReport(bytes)
          violations.push(...validateReport(report, { subject: fileName, tier: variant.tier, manifestClips: entry.clips }))
          violations.push(...scanGlb(bytes, fileName))
          if (report.bytes !== variant.bytes) violations.push(schema(fileName, `manifest says ${variant.bytes} B, file is ${report.bytes} B`))
          if (report.triangles !== variant.triangles)
            violations.push(schema(fileName, `manifest says ${variant.triangles} triangles, file has ${report.triangles}`))
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

  return { violations, entries: manifest?.models.length ?? 0, files: glbOnDisk.length }
}

function main(): number {
  const result = runCheck({ root: defaultRoot() })
  for (const x of result.violations) console.error(`[${x.code}] ${x.subject}: ${x.message}`)
  if (result.violations.length > 0) {
    console.error(`assets:check failed with ${result.violations.length} violation(s)`)
    return 1
  }
  console.log(`assets:check ok: ${result.entries} entr${result.entries === 1 ? 'y' : 'ies'}, ${result.files} GLB file(s)`)
  return 0
}

if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? '')) {
  process.exitCode = main()
}
