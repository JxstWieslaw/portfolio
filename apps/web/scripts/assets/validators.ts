/**
 * Pure validators shared by `assets:ingest` (before anything is written) and `assets:check` (CI).
 *
 * Nothing in here touches the network or the file system. It reads GLB bytes, derives a
 * `GlbReport`, and answers "which rules does this break". It must stay free of
 * `@gltf-transform/*` and `sharp` so `assets:check` is fast and the toolchain stays in the
 * scripts. Spec: docs/superpowers/specs/2026-10-02-model-platform.md section 5.4.
 */
import { createHash } from 'node:crypto'

import {
  MODEL_BUDGETS,
  MODEL_FILE_BYTES,
  MODEL_REPO_BYTES,
  TIER_EXTENSIONS,
  creditSchema,
  slugSchema,
  type Credit,
  type ModelTier,
} from '@repo/contracts'

export type ViolationCode =
  | 'LICENCE'
  | 'BYTES'
  | 'TRIS'
  | 'TEXTURE'
  | 'MATERIALS'
  | 'EXTENSIONS'
  | 'CLIPS'
  | 'NAMING'
  | 'HASH'
  | 'ORPHAN'
  | 'SCHEMA'
  | 'COMPLETE'
  | 'SECURITY'

export interface Violation {
  readonly code: ViolationCode
  /** The file, entry id or JSON path the rule was broken on. */
  readonly subject: string
  readonly message: string
}

const v = (code: ViolationCode, subject: string, message: string): Violation => ({ code, subject, message })

// ---------------------------------------------------------------------------------------------
// Canonical JSON and the content hash
// ---------------------------------------------------------------------------------------------

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/** Sorted keys, two-space indent, LF, trailing newline: the form committed for every generated JSON file. */
export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function integrityOf(bytes: Uint8Array): string {
  return `sha256-${createHash('sha256').update(bytes).digest('base64')}`
}

/** sha256 over the canonical JSON of `models`, first 16 hex. */
export function contentHashOf(models: unknown): string {
  return createHash('sha256').update(canonicalJson(models)).digest('hex').slice(0, 16)
}

// ---------------------------------------------------------------------------------------------
// GLB container
// ---------------------------------------------------------------------------------------------

const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

export class GlbFormatError extends Error {}

export interface GlbParts {
  readonly json: Record<string, unknown>
  readonly bin: Uint8Array | null
}

export function parseGlb(bytes: Uint8Array): GlbParts {
  if (bytes.byteLength < 20) throw new GlbFormatError('file is too short to be a GLB')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new GlbFormatError('missing glTF magic')
  if (view.getUint32(4, true) !== 2) throw new GlbFormatError('not glTF 2.0')
  if (view.getUint32(8, true) !== bytes.byteLength) throw new GlbFormatError('header length does not match file size')

  let offset = 12
  let json: Record<string, unknown> | null = null
  let bin: Uint8Array | null = null
  let index = 0
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw new GlbFormatError('truncated chunk header')
    const length = view.getUint32(offset, true)
    const type = view.getUint32(offset + 4, true)
    const start = offset + 8
    if (start + length > bytes.byteLength) throw new GlbFormatError('chunk runs past the end of the file')
    if (index === 0) {
      if (type !== CHUNK_JSON) throw new GlbFormatError('first chunk is not JSON')
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start, start + length))
      const parsed: unknown = JSON.parse(text)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new GlbFormatError('JSON chunk is not an object')
      json = parsed as Record<string, unknown>
    } else if (index === 1 && type === CHUNK_BIN) {
      bin = bytes.subarray(start, start + length)
    } else {
      throw new GlbFormatError(`unexpected chunk 0x${type.toString(16)} at position ${index}`)
    }
    offset = start + length
    index += 1
  }
  if (!json) throw new GlbFormatError('no JSON chunk')
  return { json, bin }
}

/** Writes a GLB with a space-padded JSON chunk and a zero-padded BIN chunk. Deterministic. */
export function packGlb(json: unknown, bin: Uint8Array | null): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonPadded = Math.ceil(jsonBytes.byteLength / 4) * 4
  const binPadded = bin ? Math.ceil(bin.byteLength / 4) * 4 : 0
  const total = 12 + 8 + jsonPadded + (bin ? 8 + binPadded : 0)
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint32(0, GLB_MAGIC, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonPadded, true)
  view.setUint32(16, CHUNK_JSON, true)
  out.fill(0x20, 20, 20 + jsonPadded)
  out.set(jsonBytes, 20)
  if (bin) {
    const at = 20 + jsonPadded
    view.setUint32(at, binPadded, true)
    view.setUint32(at + 4, CHUNK_BIN, true)
    out.set(bin, at + 8)
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Image headers (so a texture's size is known without decoding it)
// ---------------------------------------------------------------------------------------------

const WEBP_ALLOWED_CHUNKS = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH'])

function fourcc(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at] ?? 0, bytes[at + 1] ?? 0, bytes[at + 2] ?? 0, bytes[at + 3] ?? 0)
}

/** RIFF chunk ids of a WebP file, or null when it is not a WebP. */
export function webpChunks(bytes: Uint8Array): string[] | null {
  if (bytes.byteLength < 20 || fourcc(bytes, 0) !== 'RIFF' || fourcc(bytes, 8) !== 'WEBP') return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ids: string[] = []
  let at = 12
  while (at + 8 <= bytes.byteLength) {
    ids.push(fourcc(bytes, at))
    const size = view.getUint32(at + 4, true)
    at += 8 + size + (size % 2)
  }
  return ids
}

/** Long edge in pixels of a WebP or PNG, 0 when unknown. */
export function imageLongEdge(mimeType: string | null, bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (mimeType === 'image/png' && bytes.byteLength >= 24) {
    return Math.max(view.getUint32(16), view.getUint32(20))
  }
  if (mimeType === 'image/webp' && bytes.byteLength >= 30) {
    const kind = fourcc(bytes, 12)
    if (kind === 'VP8 ') {
      return Math.max(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff)
    }
    if (kind === 'VP8L') {
      const b = (i: number) => bytes[21 + i] ?? 0
      const width = 1 + (((b(1) & 0x3f) << 8) | b(0))
      const height = 1 + (((b(3) & 0xf) << 10) | (b(2) << 2) | ((b(1) & 0xc0) >> 6))
      return Math.max(width, height)
    }
    if (kind === 'VP8X') {
      const w = 1 + (bytes[24] ?? 0) + ((bytes[25] ?? 0) << 8) + ((bytes[26] ?? 0) << 16)
      const h = 1 + (bytes[27] ?? 0) + ((bytes[28] ?? 0) << 8) + ((bytes[29] ?? 0) << 16)
      return Math.max(w, h)
    }
  }
  return 0
}

// ---------------------------------------------------------------------------------------------
// GlbReport
// ---------------------------------------------------------------------------------------------

export interface GlbReport {
  readonly bytes: number
  readonly sha256: string
  readonly triangles: number
  readonly materials: number
  readonly textures: readonly { readonly mimeType: string | null; readonly longEdge: number }[]
  readonly extensionsUsed: readonly string[]
  readonly clips: readonly { readonly name: string; readonly seconds: number }[]
  /** Node, mesh and material names. */
  readonly names: readonly string[]
}

type Json = Record<string, unknown>
const arr = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : [])
const num = (value: unknown, fallback = 0): number => (typeof value === 'number' ? value : fallback)

function primitiveTriangles(primitive: Json, accessors: Json[]): number {
  const mode = num(primitive['mode'], 4)
  const attributes = (primitive['attributes'] ?? {}) as Record<string, unknown>
  const indices = primitive['indices']
  const count =
    typeof indices === 'number'
      ? num(accessors[indices]?.['count'])
      : num(accessors[num(attributes['POSITION'], -1)]?.['count'])
  if (mode === 4) return Math.floor(count / 3)
  if (mode === 5 || mode === 6) return Math.max(0, count - 2)
  return 0
}

export function buildReport(bytes: Uint8Array): GlbReport {
  const { json, bin } = parseGlb(bytes)
  const accessors = arr(json['accessors'])
  const meshes = arr(json['meshes'])
  const meshTriangles = meshes.map((m) =>
    arr(m['primitives']).reduce((sum, p) => sum + primitiveTriangles(p, accessors), 0),
  )
  // Instancing by node: a mesh referenced twice is drawn twice.
  const triangles = arr(json['nodes']).reduce((sum, node) => {
    const mesh = node['mesh']
    return typeof mesh === 'number' ? sum + (meshTriangles[mesh] ?? 0) : sum
  }, 0)

  const bufferViews = arr(json['bufferViews'])
  const textures = arr(json['images']).map((image) => {
    const mimeType = typeof image['mimeType'] === 'string' ? image['mimeType'] : null
    const view = typeof image['bufferView'] === 'number' ? bufferViews[image['bufferView']] : undefined
    if (!view || !bin) return { mimeType, longEdge: 0 }
    const start = num(view['byteOffset'])
    return { mimeType, longEdge: imageLongEdge(mimeType, bin.subarray(start, start + num(view['byteLength']))) }
  })

  const clips = arr(json['animations']).map((animation) => {
    let seconds = 0
    for (const sampler of arr(animation['samplers'])) {
      const input = accessors[num(sampler['input'], -1)]
      const max = Array.isArray(input?.['max']) ? num((input['max'] as unknown[])[0]) : 0
      seconds = Math.max(seconds, max)
    }
    return { name: typeof animation['name'] === 'string' ? animation['name'] : '', seconds }
  })

  const names: string[] = []
  for (const key of ['nodes', 'meshes', 'materials'] as const) {
    for (const item of arr(json[key])) if (typeof item['name'] === 'string') names.push(item['name'])
  }

  return {
    bytes: bytes.byteLength,
    sha256: sha256Hex(bytes),
    triangles,
    materials: arr(json['materials']).length,
    textures,
    extensionsUsed: Array.isArray(json['extensionsUsed']) ? (json['extensionsUsed'] as string[]) : [],
    clips,
    names,
  }
}

// ---------------------------------------------------------------------------------------------
// Per-file rules
// ---------------------------------------------------------------------------------------------

const FILE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.t[123]\.[0-9a-f]{8}\.glb$/

export function validateFileName(fileName: string, id: string, tier: ModelTier): Violation[] {
  const out: Violation[] = []
  if (!FILE_NAME.test(fileName)) out.push(v('NAMING', fileName, 'file name must match <id>.t<tier>.<hash8>.glb in kebab-case'))
  else if (!fileName.startsWith(`${id}.t${tier}.`))
    out.push(v('NAMING', fileName, `file name does not belong to entry "${id}" tier ${tier}`))
  if (!slugSchema.safeParse(id).success) out.push(v('NAMING', id, 'id must be kebab-case'))
  return out
}

export interface ReportContext {
  readonly subject: string
  readonly tier: ModelTier
  /** Clips the manifest entry declares; when given they must equal the file's clips by name. */
  readonly manifestClips?: readonly { readonly name: string }[]
}

export function validateReport(report: GlbReport, ctx: ReportContext): Violation[] {
  const { subject, tier } = ctx
  const budget = MODEL_BUDGETS[tier]
  const out: Violation[] = []

  if (report.bytes > budget.bytes) out.push(v('BYTES', subject, `${report.bytes} B exceeds the tier ${tier} budget of ${budget.bytes} B`))
  if (report.bytes > MODEL_FILE_BYTES) out.push(v('BYTES', subject, `${report.bytes} B exceeds the ${MODEL_FILE_BYTES} B per-file cap`))
  if (report.triangles > budget.triangles) out.push(v('TRIS', subject, `${report.triangles} triangles exceed the tier ${tier} budget of ${budget.triangles}`))

  if (report.textures.length > budget.textures)
    out.push(v('TEXTURE', subject, `${report.textures.length} textures exceed the tier ${tier} cap of ${budget.textures}`))
  for (const [i, t] of report.textures.entries()) {
    if (t.mimeType !== 'image/webp') out.push(v('TEXTURE', subject, `texture ${i} is ${t.mimeType ?? 'untyped'}; only image/webp is allowed`))
    if (t.longEdge > budget.texturePx) out.push(v('TEXTURE', subject, `texture ${i} long edge ${t.longEdge} px exceeds ${budget.texturePx} px`))
  }
  if (tier === 3 && report.textures.filter((t) => t.longEdge > 1024).length > 1)
    out.push(v('TEXTURE', subject, 'at most one texture may exceed 1024 px'))

  if (report.materials > budget.materials)
    out.push(v('MATERIALS', subject, `${report.materials} materials exceed the tier ${tier} cap of ${budget.materials}`))

  const allowed = new Set<string>(TIER_EXTENSIONS[tier])
  for (const ext of report.extensionsUsed)
    if (!allowed.has(ext)) out.push(v('EXTENSIONS', subject, `${ext} is not allowed at tier ${tier}`))

  if (report.clips.length > budget.clips) out.push(v('CLIPS', subject, `${report.clips.length} clips exceed the tier ${tier} cap of ${budget.clips}`))
  for (const clip of report.clips) {
    if (clip.seconds > 20) out.push(v('CLIPS', subject, `clip "${clip.name}" runs ${clip.seconds} s; the cap is 20 s`))
    if (!slugSchema.safeParse(clip.name).success) out.push(v('CLIPS', subject, `clip name "${clip.name}" must be kebab-case`))
  }
  if (ctx.manifestClips) {
    const declared = ctx.manifestClips.map((c) => c.name).sort().join(',')
    const actual = report.clips.map((c) => c.name).sort().join(',')
    if (declared !== actual) out.push(v('CLIPS', subject, `clips in the file (${actual || 'none'}) differ from the manifest (${declared || 'none'})`))
  }

  for (const name of report.names)
    if (/\s/.test(name)) out.push(v('NAMING', subject, `name "${name}" contains whitespace`))

  return out
}

/** `integrity` is the manifest's SRI string; `fileName` carries the first 8 hex of the same digest. */
export function validateHash(fileName: string, bytes: Uint8Array, integrity: string): Violation[] {
  const out: Violation[] = []
  if (integrityOf(bytes) !== integrity) out.push(v('HASH', fileName, 'file bytes do not match the manifest integrity string'))
  const suffix = /\.([0-9a-f]{8})\.glb$/.exec(fileName)?.[1]
  if (suffix !== sha256Hex(bytes).slice(0, 8)) out.push(v('HASH', fileName, 'file name hash suffix does not match the sha256 of the bytes'))
  return out
}

// ---------------------------------------------------------------------------------------------
// Cross-file rules
// ---------------------------------------------------------------------------------------------

export function validateRepoBytes(files: readonly { readonly name: string; readonly bytes: number }[]): Violation[] {
  const total = files.reduce((sum, f) => sum + f.bytes, 0)
  return total > MODEL_REPO_BYTES
    ? [v('BYTES', 'public/models', `tracked models total ${total} B, over the ${MODEL_REPO_BYTES} B repository budget`)]
    : []
}

export function validateOrphans(filesOnDisk: readonly string[], manifestFiles: readonly string[]): Violation[] {
  const referenced = new Set(manifestFiles)
  const present = new Set(filesOnDisk)
  return [
    ...filesOnDisk.filter((f) => !referenced.has(f)).map((f) => v('ORPHAN', f, 'file is not referenced by the manifest')),
    ...manifestFiles.filter((f) => !present.has(f)).map((f) => v('ORPHAN', f, 'manifest references a file that does not exist')),
  ]
}

export function validateComplete(
  entry: { readonly id: string; readonly enabled: boolean },
  tiersWanted: readonly ModelTier[],
  variantTiers: readonly ModelTier[],
): Violation[] {
  if (!entry.enabled) return []
  return tiersWanted
    .filter((t) => !variantTiers.includes(t))
    .map((t) => v('COMPLETE', entry.id, `enabled entry has no tier ${t} variant`))
}

/**
 * `derived` is what `credits.json` must contain: one row per enabled entry, in manifest order,
 * built from `sources.json`. Disabled entries must not be credited yet (nothing renders them).
 */
export function validateCredits(
  entries: readonly { readonly id: string; readonly enabled: boolean }[],
  derived: readonly Credit[],
  credits: readonly unknown[],
): Violation[] {
  const out: Violation[] = []
  const parsed: Credit[] = []
  for (const [i, row] of credits.entries()) {
    const r = creditSchema.safeParse(row)
    if (r.success) parsed.push(r.data)
    else out.push(v('LICENCE', `credits.json[${i}]`, r.error.issues.map((x) => x.message).join('; ')))
  }
  for (const entry of entries) {
    const rows = parsed.filter((c) => c.assetId === entry.id)
    if (entry.enabled && rows.length !== 1)
      out.push(v('LICENCE', entry.id, `enabled entry needs exactly one credit row, found ${rows.length}`))
    if (!entry.enabled && rows.length > 0) out.push(v('LICENCE', entry.id, 'disabled entry must not have a credit row'))
  }
  for (const c of parsed)
    if (!entries.some((e) => e.id === c.assetId)) out.push(v('LICENCE', c.assetId, 'credit row has no manifest entry'))
  if (out.length === 0 && canonicalJson(parsed) !== canonicalJson(derived))
    out.push(v('LICENCE', 'credits.json', 'file differs from the credits derived from sources.json; run assets:ingest'))
  return out
}

// ---------------------------------------------------------------------------------------------
// Security scan of a committed GLB
// ---------------------------------------------------------------------------------------------

/** Any URL inside a committed GLB must start with one of these; our own output contains none. */
export const ALLOWED_GLB_URL_PREFIXES: readonly string[] = ['https://www.khronos.org/', 'https://github.com/KhronosGroup/']

const ALLOWED_EXACT_EXTENSIONS = new Set([
  'KHR_mesh_quantization',
  'EXT_meshopt_compression',
  'EXT_texture_webp',
  'KHR_texture_transform',
])

export function isAllowedGlbExtension(name: string): boolean {
  return name.startsWith('KHR_materials_') || ALLOWED_EXACT_EXTENSIONS.has(name)
}

const DRIVE_LETTER = /(?<![A-Za-z0-9])[A-Za-z]:[\\/]/
const HOME_PATH = /(?:^|[^A-Za-z0-9])(?:\/home\/|\/Users\/|\/root\/|\/mnt\/[a-z]\/|~\/)|\\Users\\/i
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/
const URL_LIKE = /\b(?:https?|ftp|file):\/\/[^\s"'<>]*/gi

function scanString(text: string, where: string, out: Violation[]): void {
  if (DRIVE_LETTER.test(text)) out.push(v('SECURITY', where, 'contains a drive-letter path'))
  if (HOME_PATH.test(text)) out.push(v('SECURITY', where, 'contains a home-directory path'))
  if (EMAIL.test(text)) out.push(v('SECURITY', where, 'contains an email address'))
  for (const match of text.matchAll(URL_LIKE)) {
    const url = match[0]
    if (!ALLOWED_GLB_URL_PREFIXES.some((p) => url.startsWith(p))) out.push(v('SECURITY', where, 'contains a URL that is not allow-listed'))
  }
  if (/^data:/i.test(text.trim())) out.push(v('SECURITY', where, 'contains a data: URI'))
}

function walk(value: unknown, where: string, out: Violation[]): void {
  if (typeof value === 'string') return scanString(value, where, out)
  if (Array.isArray(value)) return value.forEach((item, i) => walk(item, `${where}[${i}]`, out))
  if (value === null || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const at = `${where}.${key}`
    scanString(key, `${at} (key)`, out)
    if (key === 'extras') out.push(v('SECURITY', at, 'extras are not allowed'))
    else if (key === 'uri') out.push(v('SECURITY', at, 'external or data: uri is not allowed; a GLB must be self-contained'))
    else if (key === 'extensions' && child !== null && typeof child === 'object')
      for (const ext of Object.keys(child as Record<string, unknown>))
        if (!isAllowedGlbExtension(ext)) out.push(v('SECURITY', `${at}.${ext}`, `extension ${ext} is not on the allow-list`))
    walk(child, at, out)
  }
}

export function scanGlb(bytes: Uint8Array, subject: string): Violation[] {
  const { json, bin } = parseGlb(bytes)
  const out: Violation[] = []
  walk(json, '$', out)

  for (const key of ['extensionsUsed', 'extensionsRequired'] as const) {
    const list = json[key]
    if (Array.isArray(list))
      for (const ext of list)
        if (typeof ext !== 'string' || !isAllowedGlbExtension(ext))
          out.push(v('SECURITY', `$.${key}`, `extension ${String(ext)} is not on the allow-list (Draco and KTX2 are rejected for now)`))
  }

  const asset = (json['asset'] ?? {}) as Record<string, unknown>
  for (const key of Object.keys(asset))
    if (key !== 'version') out.push(v('SECURITY', `$.asset.${key}`, 'asset metadata other than version must be stripped'))
  if (arr(json['cameras']).length > 0) out.push(v('SECURITY', '$.cameras', 'cameras must be stripped'))
  // Meshopt declares a second, virtual "fallback" buffer that is never stored; anything else beyond one is not self-contained.
  const stored = arr(json['buffers']).filter(
    (b) => ((b['extensions'] as Json | undefined)?.['EXT_meshopt_compression'] as Json | undefined)?.['fallback'] !== true,
  )
  if (stored.length > 1) out.push(v('SECURITY', '$.buffers', 'a GLB carries exactly one embedded buffer'))

  const bufferViews = arr(json['bufferViews'])
  for (const [i, image] of arr(json['images']).entries()) {
    if (typeof image['name'] === 'string') out.push(v('SECURITY', `$.images[${i}].name`, 'image names must be stripped'))
    const view = typeof image['bufferView'] === 'number' ? bufferViews[image['bufferView']] : undefined
    if (!view || !bin) {
      out.push(v('SECURITY', `$.images[${i}]`, 'image data must be embedded in the binary chunk'))
      continue
    }
    const start = num(view['byteOffset'])
    const data = bin.subarray(start, start + num(view['byteLength']))
    const chunks = webpChunks(data)
    if (chunks === null) {
      if (image['mimeType'] === 'image/webp') out.push(v('SECURITY', `$.images[${i}]`, 'declared as WebP but is not a RIFF/WEBP file'))
    } else {
      for (const id of chunks)
        if (!WEBP_ALLOWED_CHUNKS.has(id)) out.push(v('SECURITY', `$.images[${i}]`, `WebP chunk "${id.trim()}" can carry metadata and is not allowed`))
    }
  }

  // Dedupe: a string with two problems should still read as one finding per location and message.
  const seen = new Set<string>()
  return out
    .filter((x) => {
      const key = `${x.subject}|${x.message}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((x) => ({ ...x, subject: `${subject} ${x.subject}` }))
}
