/**
 * Verifies the committed hero posters without rendering anything: the inputs hash, every file's name, hash, bytes,
 * format and pixel size, the byte budgets, and that nothing stray sits in `public/posters` or `public/og`.
 * Returns problems as plain sentences; an empty list is a pass.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

import type { PosterFile, PosterManifest } from '../../lib/hero/posters'
import { BUDGET_BYTES, budgetFor, ORIENTATIONS, OG, posterInputsHash, POSTER_PIPELINE_VERSION, staleMessage, STATES } from './spec'

export const POSTER_PUBLIC = 'public/posters'
export const OG_PUBLIC = 'public/og'
export const MANIFEST_FILE = 'public/posters/manifest.json'

export const sha256Bytes = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

export function readManifest(webRoot: string): PosterManifest | null {
  const file = path.join(webRoot, MANIFEST_FILE)
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as PosterManifest) : null
}

async function checkFile(webRoot: string, dir: string, f: PosterFile, label: string, format: 'avif' | 'webp' | 'png', size: { width: number; height: number }, budget: number): Promise<string[]> {
  const problems: string[] = []
  const full = path.join(webRoot, dir, f.file)
  if (!existsSync(full)) return [`${label}: ${f.file} is in the manifest but not on disk`]
  const bytes = readFileSync(full)
  if (bytes.length !== f.bytes) problems.push(`${label}: ${f.file} is ${bytes.length} bytes, the manifest says ${f.bytes}`)
  const sum = sha256Bytes(bytes)
  if (sum !== f.sha256) problems.push(`${label}: ${f.file} does not match its recorded sha256`)
  if (!f.file.includes(`.${f.sha256.slice(0, 8)}.`) || !f.file.endsWith(`.${format}`)) problems.push(`${label}: ${f.file} is not named <name>.${f.sha256.slice(0, 8)}.${format}`)
  if (bytes.length > budget) problems.push(`${label}: ${f.file} is ${bytes.length} bytes, over its ${budget} byte budget`)
  const meta = await sharp(bytes).metadata()
  const wantFormat = format === 'avif' ? 'heif' : format
  if (meta.format !== wantFormat) problems.push(`${label}: ${f.file} decodes as ${meta.format ?? 'nothing'}, expected ${wantFormat}`)
  if (meta.width !== size.width || meta.height !== size.height) problems.push(`${label}: ${f.file} is ${meta.width}x${meta.height}, expected ${size.width}x${size.height}`)
  return problems
}

export async function checkPosters(webRoot: string): Promise<string[]> {
  const manifest = readManifest(webRoot)
  if (!manifest) return [`${MANIFEST_FILE} is missing: run npm run posters:render`]
  const problems: string[] = []
  if (manifest.pipeline !== POSTER_PIPELINE_VERSION) problems.push(`manifest was written by pipeline ${manifest.pipeline}, this is ${POSTER_PIPELINE_VERSION}`)
  if (manifest.inputsHash !== posterInputsHash(webRoot)) problems.push(staleMessage())

  const expected = ORIENTATIONS.flatMap((o) => STATES.map((s) => ({ o, s })))
  if (manifest.posters.length !== expected.length) problems.push(`expected ${expected.length} posters, the manifest has ${manifest.posters.length}`)
  const known = new Set<string>()
  for (const { o, s } of expected) {
    const entry = manifest.posters.find((p) => p.state === s.id && p.orientation === o.id)
    const label = `${s.id}/${o.id}`
    if (!entry) {
      problems.push(`${label}: missing from the manifest`)
      continue
    }
    const size = { width: Math.round(o.cssWidth * o.scale), height: Math.round(o.cssHeight * o.scale) }
    if (entry.width !== size.width || entry.height !== size.height) problems.push(`${label}: manifest says ${entry.width}x${entry.height}, expected ${size.width}x${size.height}`)
    for (const format of ['avif', 'webp'] as const) {
      known.add(entry[format].file)
      problems.push(...(await checkFile(webRoot, POSTER_PUBLIC, entry[format], `${label} ${format}`, format, size, budgetFor(s.id, o.id, format))))
    }
  }

  problems.push(...(await checkFile(webRoot, OG_PUBLIC, manifest.og, 'og', 'png', OG, BUDGET_BYTES.og)))
  if (manifest.og.width !== OG.width || manifest.og.height !== OG.height) problems.push(`og: manifest says ${manifest.og.width}x${manifest.og.height}`)

  const stray = (dir: string, allowed: Set<string>, extra: string[]): string[] => {
    const full = path.join(webRoot, dir)
    if (!existsSync(full)) return []
    return readdirSync(full)
      .filter((name) => statSync(path.join(full, name)).isFile() && !allowed.has(name) && !extra.includes(name))
      .map((name) => `${dir}/${name} is not in the manifest: run npm run posters:render to clear it`)
  }
  problems.push(...stray(POSTER_PUBLIC, known, ['manifest.json']))
  problems.push(...stray(OG_PUBLIC, new Set([manifest.og.file]), []))
  return problems
}
