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
  gltfExtensionSchema,
  type Credit,
  type GltfExtension,
  type ModelCap,
  type ModelTier,
} from '@repo/contracts'

/** Message of an error and of every `cause` behind it, so a wrapped failure never hides its reason. */
export function describeError(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  for (let depth = 0; depth < 5 && current !== undefined; depth++) {
    parts.push(current instanceof Error ? current.message : String(current))
    current = current instanceof Error ? current.cause : undefined
  }
  return parts.join(' <- ')
}

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
      let parsed: unknown
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start, start + length))
        parsed = JSON.parse(text)
      } catch (error) {
        throw new GlbFormatError(`JSON chunk is unreadable (${error instanceof Error ? error.message : String(error)})`)
      }
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

export interface WebpInspection {
  readonly chunks: string[]
  /** Why the container is not a clean RIFF/WEBP file of exactly this length, or null. */
  readonly problem: string | null
}

/** Walks a WebP's RIFF structure; null when the bytes are not a WebP at all. Chunk ids are listed even when the sizes lie. */
export function inspectWebp(bytes: Uint8Array): WebpInspection | null {
  if (bytes.byteLength < 20 || fourcc(bytes, 0) !== 'RIFF' || fourcc(bytes, 8) !== 'WEBP') return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const riffEnd = view.getUint32(4, true) + 8
  const pad = bytes.byteLength - riffEnd
  let problem: string | null = null
  // The only slack a RIFF file may have is one zero pad byte.
  if (pad !== 0 && pad !== 1) problem = `RIFF size says ${riffEnd} B but the image is ${bytes.byteLength} B`
  else if (pad === 1 && bytes[bytes.byteLength - 1] !== 0) problem = 'a non-zero byte follows the RIFF payload'
  const end = Math.min(riffEnd, bytes.byteLength)
  const chunks: string[] = []
  let at = 12
  while (at < end) {
    if (at + 8 > end) {
      problem ??= 'a truncated chunk header ends the image'
      break
    }
    const id = fourcc(bytes, at)
    chunks.push(id)
    at += 8 + view.getUint32(at + 4, true) + (view.getUint32(at + 4, true) % 2)
    if (at > end) {
      problem ??= `chunk "${id.trim()}" runs past the end of the image`
      break
    }
  }
  return { chunks, problem }
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
const isObj = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The elements of a glTF collection. A non-object element (`nodes: [1]`) becomes an empty object so
 * indices keep their meaning and no caller can throw on it; with `out`, it is also a SECURITY finding.
 */
function arr(value: unknown, out?: Violation[], where = '$'): Json[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    out?.push(v('SECURITY', where, 'must be an array'))
    return []
  }
  return value.map((item, i) => {
    if (isObj(item)) return item
    out?.push(v('SECURITY', `${where}[${i}]`, 'must be an object'))
    return {}
  })
}
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

/** The embedded bytes of an image, or a GlbFormatError when its view is missing or outside the BIN chunk. */
function imageBytes(image: Json, bufferViews: Json[], bin: Uint8Array | null, index: number): Uint8Array {
  const view = typeof image['bufferView'] === 'number' ? bufferViews[image['bufferView']] : undefined
  if (!view) throw new GlbFormatError(`image ${index} has no readable bufferView`)
  if (!bin) throw new GlbFormatError(`image ${index} needs a binary chunk, and there is none`)
  const start = num(view['byteOffset'])
  const end = start + num(view['byteLength'])
  if (start < 0 || end > bin.byteLength) throw new GlbFormatError(`image ${index} runs past the end of the binary chunk`)
  return bin.subarray(start, end)
}

/** The wire-level facts a manifest variant must agree with. Shared by ingest (writing) and check (comparing). */
export interface VariantMeta {
  readonly requires: ModelCap[]
  readonly extensions: GltfExtension[]
  readonly maxTexturePx: number
  /** Extensions the contract cannot represent; never silently dropped. */
  readonly unknownExtensions: string[]
}

export function deriveVariantMeta(report: GlbReport): VariantMeta {
  const known = new Set<string>(gltfExtensionSchema.options)
  const requires: ModelCap[] = ['meshopt']
  if (report.textures.some((t) => t.mimeType === 'image/webp')) requires.push('webp')
  return {
    requires,
    extensions: [...new Set(report.extensionsUsed)].filter((e): e is GltfExtension => known.has(e)).sort(),
    maxTexturePx: report.textures.reduce((m, t) => Math.max(m, t.longEdge), 0),
    unknownExtensions: report.extensionsUsed.filter((e) => !known.has(e)),
  }
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
  const textures = arr(json['images']).map((image, i) => {
    const mimeType = typeof image['mimeType'] === 'string' ? image['mimeType'] : null
    const data = imageBytes(image, bufferViews, bin, i)
    return { mimeType, longEdge: imageLongEdge(mimeType, data) }
  })

  // 0 means "could not be read"; validateReport turns that into a violation instead of a pass.
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

/** Manifest clip durations are stored to the millisecond. */
export const roundSeconds = (s: number): number => Math.round(s * 1000) / 1000

export interface ReportContext {
  readonly subject: string
  readonly tier: ModelTier
  /** Clips the manifest entry declares; when given they must equal the file's clips by name and duration. */
  readonly manifestClips?: readonly { readonly name: string; readonly seconds: number }[]
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
    if (t.longEdge === 0) out.push(v('TEXTURE', subject, `texture ${i} dimensions could not be read`))
    else if (t.longEdge > budget.texturePx) out.push(v('TEXTURE', subject, `texture ${i} long edge ${t.longEdge} px exceeds ${budget.texturePx} px`))
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
    if (!(clip.seconds > 0)) out.push(v('CLIPS', subject, `clip "${clip.name}" duration unreadable`))
    if (clip.seconds > 20) out.push(v('CLIPS', subject, `clip "${clip.name}" runs ${clip.seconds} s; the cap is 20 s`))
    if (!slugSchema.safeParse(clip.name).success) out.push(v('CLIPS', subject, `clip name "${clip.name}" must be kebab-case`))
  }
  if (ctx.manifestClips) {
    const key = (c: { name: string; seconds: number }) => `${c.name}:${roundSeconds(c.seconds)}`
    const declared = ctx.manifestClips.map(key).sort().join(',')
    const actual = report.clips.map(key).sort().join(',')
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

/** Any URL inside a committed GLB must start with one of these; our own output contains none, so the list is empty. */
export const ALLOWED_GLB_URL_PREFIXES: readonly string[] = []

/** The only top-level glTF keys a committed GLB may carry. Anything else (cameras, extras, extensions) is a finding. */
const ALLOWED_TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
  'asset',
  'scene',
  'scenes',
  'nodes',
  'meshes',
  'materials',
  'accessors',
  'bufferViews',
  'buffers',
  'images',
  'textures',
  'samplers',
  'animations',
  'skins',
  'extensionsUsed',
  'extensionsRequired',
])

/** Collections whose objects may not carry a `name` at all: names are where paths and e-mail addresses hide. */
const UNNAMED_COLLECTIONS = ['scenes', 'nodes', 'meshes', 'materials', 'accessors', 'bufferViews', 'buffers', 'images', 'textures', 'samplers', 'skins'] as const
const CLIP_NAME = /^[a-z0-9-]{0,40}$/

const KNOWN_EXTENSIONS: ReadonlySet<string> = new Set(gltfExtensionSchema.options)

/** Exact membership in the contract's extension list; there is no prefix match. */
export function isAllowedGlbExtension(name: string): boolean {
  return KNOWN_EXTENSIONS.has(name)
}

/**
 * `C:\x`, `d:/x`, and `exportC:\x` (a letter glued to a word is still a drive path when a backslash follows).
 * A forward slash needs a non-alphanumeric before it and no second slash after it, so `https://` is not a drive.
 */
const DRIVE_LETTER = /(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/](?!\/)|[A-Za-z]:\\/
const HOME_PATH = /\/home\/|\/Users\/|\/root\/|\/mnt\/[a-z]\/|~\/|\\Users\\/i
const ENV_VAR = /%[A-Za-z_][A-Za-z0-9_]*%/
const UNC_PATH = /\\\\[A-Za-z0-9_.$-]+\\/
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/
const URL_LIKE = /\b(?:https?|ftp|file):\/\/[^\s"'<>]*/gi
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/

function scanString(text: string, where: string, out: Violation[], opts: { scheme: boolean }): void {
  if (DRIVE_LETTER.test(text)) out.push(v('SECURITY', where, 'contains a drive-letter path'))
  if (HOME_PATH.test(text)) out.push(v('SECURITY', where, 'contains a home-directory path'))
  if (ENV_VAR.test(text)) out.push(v('SECURITY', where, 'contains an environment-variable path'))
  if (UNC_PATH.test(text)) out.push(v('SECURITY', where, 'contains a UNC network path'))
  if (text.startsWith('//')) out.push(v('SECURITY', where, 'contains a protocol-relative or network path'))
  if (EMAIL.test(text)) out.push(v('SECURITY', where, 'contains an email address'))
  for (const match of text.matchAll(URL_LIKE)) {
    if (!ALLOWED_GLB_URL_PREFIXES.some((p) => match[0].startsWith(p))) out.push(v('SECURITY', where, 'contains a URL that is not allow-listed'))
  }
  if (/^data:/i.test(text.trim())) out.push(v('SECURITY', where, 'contains a data: URI'))
  else if (opts.scheme && SCHEME.test(text) && !DRIVE_LETTER.test(text)) out.push(v('SECURITY', where, 'contains a URI scheme'))
}

interface WalkState {
  readonly out: Violation[]
  readonly elementExtensions: Set<string>
  readonly tierAllowed: ReadonlySet<string> | null
}

function walk(value: unknown, where: string, state: WalkState): void {
  const { out } = state
  if (typeof value === 'string') return scanString(value, where, out, { scheme: true })
  if (Array.isArray(value)) return value.forEach((item, i) => walk(item, `${where}[${i}]`, state))
  if (value === null || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const at = `${where}.${key}`
    scanString(key, `${at} (key)`, out, { scheme: false })
    if (key === 'extras') out.push(v('SECURITY', at, 'extras are not allowed'))
    else if (key === 'uri') out.push(v('SECURITY', at, 'external or data: uri is not allowed; a GLB must be self-contained'))
    else if (key === 'extensions' && child !== null && typeof child === 'object') {
      for (const ext of Object.keys(child as Record<string, unknown>)) {
        state.elementExtensions.add(ext)
        if (!isAllowedGlbExtension(ext)) out.push(v('SECURITY', `${at}.${ext}`, `extension ${ext} is not on the allow-list`))
        else if (state.tierAllowed && !state.tierAllowed.has(ext))
          out.push(v('SECURITY', `${at}.${ext}`, `extension ${ext} is not allowed at this tier`))
      }
    }
    walk(child, at, state)
  }
}

// ---------------------------------------------------------------------------------------------
// Structure: which keys a committed GLB may carry
// ---------------------------------------------------------------------------------------------

const keys = (...list: string[]): ReadonlySet<string> => new Set(list)

const TEXTURE_INFO_KEYS = keys('index', 'texCoord', 'extensions')
const EXTENSION_BODY_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  EXT_meshopt_compression: keys('buffer', 'byteOffset', 'byteLength', 'byteStride', 'count', 'mode', 'filter', 'fallback'),
  EXT_texture_webp: keys('source'),
  KHR_texture_transform: keys('offset', 'rotation', 'scale', 'texCoord'),
  KHR_materials_emissive_strength: keys('emissiveStrength'),
  KHR_materials_transmission: keys('transmissionFactor', 'transmissionTexture'),
  KHR_materials_volume: keys('thicknessFactor', 'thicknessTexture', 'attenuationDistance', 'attenuationColor'),
  KHR_materials_ior: keys('ior'),
}
/** Extension bodies that hold a textureInfo of their own. */
const EXTENSION_TEXTURES = ['transmissionTexture', 'thicknessTexture'] as const

const ATTRIBUTE_KEY = /^(?:POSITION|NORMAL|TANGENT|TEXCOORD_\d|COLOR_\d|JOINTS_\d|WEIGHTS_\d)$/

/** Extensions a collection element may carry, by collection. Any other contract extension there is misplaced. */
const EXTENSIONS_ON: Readonly<Record<string, readonly string[]>> = {
  buffers: ['EXT_meshopt_compression'],
  bufferViews: ['EXT_meshopt_compression'],
  textures: ['EXT_texture_webp'],
  materials: ['KHR_materials_emissive_strength', 'KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_ior'],
  textureInfo: ['KHR_texture_transform'],
}

/** Keys with a dedicated finding elsewhere (a name, extras, a uri), so the key rule stays quiet about them. */
const HANDLED_ELSEWHERE: ReadonlySet<string> = keys('name', 'extras', 'uri')

const COLLECTION_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  scenes: keys('nodes'),
  nodes: keys('children', 'mesh', 'skin', 'translation', 'rotation', 'scale', 'matrix', 'weights'),
  meshes: keys('primitives', 'weights'),
  materials: keys('pbrMetallicRoughness', 'normalTexture', 'occlusionTexture', 'emissiveTexture', 'emissiveFactor', 'alphaMode', 'alphaCutoff', 'doubleSided', 'extensions'),
  accessors: keys('bufferView', 'byteOffset', 'componentType', 'normalized', 'count', 'type', 'max', 'min', 'sparse'),
  bufferViews: keys('buffer', 'byteOffset', 'byteLength', 'byteStride', 'target', 'extensions'),
  buffers: keys('byteLength', 'extensions'),
  images: keys('bufferView', 'mimeType'),
  textures: keys('sampler', 'source', 'extensions'),
  samplers: keys('magFilter', 'minFilter', 'wrapS', 'wrapT'),
  animations: keys('channels', 'samplers'),
  skins: keys('inverseBindMatrices', 'skeleton', 'joints'),
}
const PRIMITIVE_KEYS = keys('attributes', 'indices', 'material', 'mode', 'targets')
const PBR_KEYS = keys('baseColorFactor', 'baseColorTexture', 'metallicFactor', 'roughnessFactor', 'metallicRoughnessTexture')

function checkKeys(item: Json, allowed: ReadonlySet<string>, where: string, out: Violation[], opts: { collection?: boolean } = {}): void {
  for (const key of Object.keys(item)) {
    if (allowed.has(key) || key === 'extras') continue
    if (opts.collection && HANDLED_ELSEWHERE.has(key)) continue
    out.push(v('SECURITY', `${where}.${key}`, `key "${key}" is not allowed here`))
  }
}

function checkExtensions(item: Json, on: string, where: string, out: Violation[]): void {
  const body = item['extensions']
  if (body === undefined) return
  if (!isObj(body)) {
    out.push(v('SECURITY', `${where}.extensions`, 'must be an object'))
    return
  }
  const allowedHere = new Set(EXTENSIONS_ON[on] ?? [])
  for (const [name, value] of Object.entries(body)) {
    const at = `${where}.extensions.${name}`
    // A name outside the contract has its own finding in `walk`.
    if (!isAllowedGlbExtension(name)) continue
    if (!allowedHere.has(name)) {
      out.push(v('SECURITY', at, `extension ${name} is not valid on ${on}`))
      continue
    }
    if (!isObj(value)) {
      out.push(v('SECURITY', at, 'must be an object'))
      continue
    }
    checkKeys(value, EXTENSION_BODY_KEYS[name] ?? keys(), at, out)
    for (const key of EXTENSION_TEXTURES) {
      const info = value[key]
      if (isObj(info)) checkTextureInfo(info, `${at}.${key}`, out, keys())
    }
  }
}

function checkTextureInfo(info: Json, where: string, out: Violation[], extra: ReadonlySet<string>): void {
  checkKeys(info, new Set([...TEXTURE_INFO_KEYS, ...extra]), where, out)
  checkExtensions(info, 'textureInfo', where, out)
}

function checkMaterial(material: Json, where: string, out: Violation[]): void {
  const texture = (parent: Json, key: string, extra: ReadonlySet<string>, at: string) => {
    const info = parent[key]
    if (info === undefined) return
    if (!isObj(info)) out.push(v('SECURITY', `${at}.${key}`, 'must be an object'))
    else checkTextureInfo(info, `${at}.${key}`, out, extra)
  }
  texture(material, 'normalTexture', keys('scale'), where)
  texture(material, 'occlusionTexture', keys('strength'), where)
  texture(material, 'emissiveTexture', keys(), where)
  const pbr = material['pbrMetallicRoughness']
  if (pbr === undefined) return
  if (!isObj(pbr)) {
    out.push(v('SECURITY', `${where}.pbrMetallicRoughness`, 'must be an object'))
    return
  }
  const at = `${where}.pbrMetallicRoughness`
  checkKeys(pbr, PBR_KEYS, at, out)
  texture(pbr, 'baseColorTexture', keys(), at)
  texture(pbr, 'metallicRoughnessTexture', keys(), at)
}

function checkAttributes(value: unknown, where: string, out: Violation[]): void {
  if (value === undefined) return
  if (!isObj(value)) {
    out.push(v('SECURITY', where, 'must be an object'))
    return
  }
  for (const key of Object.keys(value))
    if (!ATTRIBUTE_KEY.test(key)) out.push(v('SECURITY', `${where}.${key}`, `attribute "${key}" is not allowed`))
}

const COLLECTIONS = ['scenes', 'nodes', 'meshes', 'materials', 'accessors', 'bufferViews', 'buffers', 'images', 'textures', 'samplers', 'animations', 'skins'] as const
type Collections = Readonly<Record<(typeof COLLECTIONS)[number], Json[]>>

/** Every collection must hold objects only, and every object only keys the pipeline can emit. */
function scanStructure(json: Json, cols: Collections, out: Violation[]): void {
  const asset = json['asset']
  if (!isObj(asset)) out.push(v('SECURITY', '$.asset', 'asset must be an object'))
  else if (asset['version'] !== '2.0') out.push(v('SECURITY', '$.asset.version', 'asset.version must be "2.0"'))

  for (const collection of COLLECTIONS) {
    const allowed = COLLECTION_KEYS[collection] ?? keys()
    for (const [i, item] of cols[collection].entries()) {
      const where = `$.${collection}[${i}]`
      checkKeys(item, allowed, where, out, { collection: true })
      checkExtensions(item, collection, where, out)
    }
  }
  for (const [i, material] of cols.materials.entries()) checkMaterial(material, `$.materials[${i}]`, out)
  for (const [i, mesh] of cols.meshes.entries()) {
    for (const [j, primitive] of arr(mesh['primitives'], out, `$.meshes[${i}].primitives`).entries()) {
      const where = `$.meshes[${i}].primitives[${j}]`
      checkKeys(primitive, PRIMITIVE_KEYS, where, out)
      checkAttributes(primitive['attributes'], `${where}.attributes`, out)
      const targets = primitive['targets']
      if (Array.isArray(targets)) targets.forEach((t: unknown, k) => checkAttributes(t, `${where}.targets[${k}]`, out))
      else if (targets !== undefined) out.push(v('SECURITY', `${where}.targets`, 'must be an array'))
    }
  }
  for (const [i, animation] of cols.animations.entries()) {
    const where = `$.animations[${i}]`
    for (const [j, channel] of arr(animation['channels'], out, `${where}.channels`).entries()) {
      checkKeys(channel, keys('sampler', 'target'), `${where}.channels[${j}]`, out)
      const target = channel['target']
      if (isObj(target)) checkKeys(target, keys('node', 'path'), `${where}.channels[${j}].target`, out)
      else if (target !== undefined) out.push(v('SECURITY', `${where}.channels[${j}].target`, 'must be an object'))
    }
    for (const [j, sampler] of arr(animation['samplers'], out, `${where}.samplers`).entries())
      checkKeys(sampler, keys('input', 'interpolation', 'output'), `${where}.samplers[${j}]`, out)
  }
}

// ---------------------------------------------------------------------------------------------
// The binary chunk: every stored byte is a referenced, in-range, non-overlapping view
// ---------------------------------------------------------------------------------------------

/** A non-negative integer field (or `fallback` when absent); null when present but not one. */
function intField(item: Json, key: string, fallback: number | null): number | null {
  const value = item[key]
  if (value === undefined) return fallback
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

interface StoredRange {
  readonly start: number
  readonly end: number
  readonly view: number
}

/**
 * The bytes of buffer 0 that each bufferView really stores. A plain view stores its own range; a
 * meshopt view stores the compressed range its extension names, while its own offset and length
 * describe the decoded fallback data that is never written. Anything unreadable is reported.
 */
function storedRanges(bufferViews: Json[], declared: number, binLength: number, out: Violation[]): StoredRange[] {
  const ranges: StoredRange[] = []
  for (const [i, view] of bufferViews.entries()) {
    const where = `$.bufferViews[${i}]`
    const extensions = view['extensions']
    const meshoptRaw = isObj(extensions) ? extensions['EXT_meshopt_compression'] : undefined
    const meshopt = isObj(meshoptRaw) ? meshoptRaw : null
    const viewBuffer = intField(view, 'buffer', null)
    let source: Json = view
    if (meshopt) {
      source = meshopt
      if (viewBuffer === null || viewBuffer === 0)
        out.push(v('SECURITY', where, 'a meshopt bufferView must point at the fallback buffer, not at buffer 0'))
      if (intField(meshopt, 'buffer', null) !== 0)
        out.push(v('SECURITY', `${where}.extensions.EXT_meshopt_compression`, 'compressed bytes must live in buffer 0'))
      // The decoded length is never stored but accessors are checked against it.
      if (intField(view, 'byteLength', null) === null || intField(view, 'byteOffset', 0) === null)
        out.push(v('SECURITY', where, 'byteOffset and byteLength must be non-negative integers'))
    } else if (viewBuffer !== 0) {
      out.push(v('SECURITY', where, 'a bufferView must point at buffer 0; any other buffer is never stored'))
      continue
    }
    const start = intField(source, 'byteOffset', 0)
    const length = intField(source, 'byteLength', null)
    if (start === null || length === null) {
      out.push(v('SECURITY', where, 'byteOffset and byteLength must be non-negative integers'))
      continue
    }
    if (start + length > declared)
      out.push(v('SECURITY', where, `bufferView ends at ${start + length}, past the declared buffer of ${declared} bytes`))
    if (start + length > binLength)
      out.push(v('SECURITY', where, `bufferView ends at ${start + length}, past the ${binLength} byte binary chunk`))
    ranges.push({ start, end: start + length, view: i })
  }
  return ranges.sort((a, b) => a.start - b.start || a.end - b.end)
}

const COMPONENT_BYTES: Readonly<Record<number, number>> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const TYPE_COMPONENTS: Readonly<Record<string, number>> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }

/** Accessors: no sparse, a real view, every element inside it. Returns the views that something reads. */
function scanAccessors(accessors: Json[], bufferViews: Json[], images: Json[], out: Violation[]): Set<number> {
  const referenced = new Set<number>()
  for (const [i, accessor] of accessors.entries()) {
    const where = `$.accessors[${i}]`
    if ('sparse' in accessor) out.push(v('SECURITY', `${where}.sparse`, 'sparse accessors are not allowed'))
    const index = accessor['bufferView']
    if (index === undefined) continue
    const view = typeof index === 'number' && Number.isInteger(index) ? bufferViews[index] : undefined
    if (typeof index !== 'number' || !view) {
      out.push(v('SECURITY', `${where}.bufferView`, 'accessor points at a bufferView that does not exist'))
      continue
    }
    referenced.add(index)
    const componentBytes = COMPONENT_BYTES[accessor['componentType'] as number]
    const components = TYPE_COMPONENTS[accessor['type'] as string]
    const count = accessor['count']
    const offset = intField(accessor, 'byteOffset', 0)
    if (
      componentBytes === undefined ||
      components === undefined ||
      typeof count !== 'number' ||
      !Number.isInteger(count) ||
      count < 1 ||
      offset === null
    ) {
      out.push(v('SECURITY', where, 'accessor needs a known type and componentType, a positive integer count and a non-negative integer byteOffset'))
      continue
    }
    const viewLength = intField(view, 'byteLength', null)
    if (viewLength === null) continue // reported by storedRanges
    const element = componentBytes * components
    const stride = intField(view, 'byteStride', null) ?? element
    const needed = offset + stride * (count - 1) + element
    if (needed > viewLength) out.push(v('SECURITY', where, `accessor reads ${needed} bytes but its bufferView holds ${viewLength}`))
  }
  for (const image of images) if (typeof image['bufferView'] === 'number') referenced.add(image['bufferView'])
  return referenced
}

/** The binary chunk must be exactly the declared buffer: no tail, no hidden gap, nothing in the padding. */
function scanBinary(cols: Collections, bin: Uint8Array | null, out: Violation[]): void {
  const declared = num(cols.buffers[0]?.['byteLength'])
  const referenced = scanAccessors(cols.accessors, cols.bufferViews, cols.images, out)
  if (!bin) {
    if (declared > 0) out.push(v('SECURITY', '$.buffers[0]', 'declares bytes but the file has no binary chunk'))
    return
  }
  if (bin.byteLength < declared) out.push(v('SECURITY', '$.buffers[0]', 'binary chunk is shorter than the declared buffer'))
  if (bin.byteLength - declared > 3)
    out.push(v('SECURITY', '$.buffers[0]', `binary chunk is ${bin.byteLength - declared} bytes longer than the declared buffer`))
  for (let i = Math.min(declared, bin.byteLength); i < bin.byteLength; i++) {
    if (bin[i] !== 0) {
      out.push(v('SECURITY', '$.buffers[0]', 'binary chunk padding is not zero'))
      break
    }
  }

  const ranges = storedRanges(cols.bufferViews, declared, bin.byteLength, out)
  let covered = 0
  let last: StoredRange | null = null
  for (const r of ranges) {
    if (r.end === r.start) continue
    if (last && r.start < covered)
      out.push(v('SECURITY', '$.bufferViews', `bufferViews ${last.view} and ${r.view} overlap in the binary chunk`))
    else if (r.start - covered > 3)
      out.push(v('SECURITY', '$.bufferViews', `binary chunk has an unreferenced gap of ${r.start - covered} bytes at offset ${covered}`))
    if (r.end >= covered) {
      covered = r.end
      last = r
    }
  }
  if (declared - covered > 3)
    out.push(v('SECURITY', '$.bufferViews', `binary chunk has an unreferenced tail of ${declared - covered} bytes at offset ${covered}`))

  // A stored view nothing reads is data the file carries for no reason: a hiding place.
  for (const r of ranges)
    if (!referenced.has(r.view)) out.push(v('SECURITY', `$.bufferViews[${r.view}]`, 'bufferView is not referenced by any accessor or image'))
}

/**
 * Security scan of a GLB's bytes. With `tier`, element-level extensions and `extensionsUsed` are
 * also held to that tier's list. Findings name the JSON path, never the offending value.
 */
export function scanGlb(bytes: Uint8Array, subject: string, tier?: ModelTier): Violation[] {
  const { json, bin } = parseGlb(bytes)
  const out: Violation[] = []

  // JSON.parse keeps the last of two equal keys and ignores whitespace, and everything below
  // inspects the parsed view. So the parsed view must be the file: repacking it must give the same bytes.
  const repacked = packGlb(json, bin)
  if (repacked.byteLength !== bytes.byteLength || repacked.some((b, i) => b !== bytes[i]))
    out.push(v('SECURITY', '$', 'GLB is not in canonical form (duplicate keys, extra whitespace or non-canonical JSON)'))

  const state: WalkState = {
    out,
    elementExtensions: new Set<string>(),
    tierAllowed: tier ? new Set<string>(TIER_EXTENSIONS[tier]) : null,
  }
  walk(json, '$', state)

  for (const key of Object.keys(json))
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) out.push(v('SECURITY', `$.${key}`, `top-level key "${key}" is not allowed`))

  const cols = Object.fromEntries(COLLECTIONS.map((c) => [c, arr(json[c], out, `$.${c}`)])) as unknown as Collections
  scanStructure(json, cols, out)

  const declaredExtensions = new Set<string>()
  for (const key of ['extensionsUsed', 'extensionsRequired'] as const) {
    const list = json[key]
    if (!Array.isArray(list)) continue
    for (const ext of list) {
      if (typeof ext !== 'string' || !isAllowedGlbExtension(ext))
        out.push(v('SECURITY', `$.${key}`, `extension ${String(ext)} is not on the allow-list (Draco and KTX2 are rejected for now)`))
      else if (state.tierAllowed && !state.tierAllowed.has(ext))
        out.push(v('SECURITY', `$.${key}`, `extension ${ext} is not allowed at this tier`))
      else declaredExtensions.add(ext)
    }
  }
  for (const ext of state.elementExtensions)
    if (isAllowedGlbExtension(ext) && !declaredExtensions.has(ext))
      out.push(v('SECURITY', '$.extensionsUsed', `extension ${ext} is used in the file but not declared in extensionsUsed`))

  const asset = isObj(json['asset']) ? json['asset'] : {}
  for (const key of Object.keys(asset))
    if (key !== 'version') out.push(v('SECURITY', `$.asset.${key}`, 'asset metadata other than version must be stripped'))

  for (const collection of UNNAMED_COLLECTIONS)
    for (const [i, item] of cols[collection].entries())
      if ('name' in item) out.push(v('SECURITY', `$.${collection}[${i}].name`, 'names must be stripped'))
  for (const [i, animation] of cols.animations.entries()) {
    const name = animation['name']
    if (name !== undefined && (typeof name !== 'string' || !CLIP_NAME.test(name)))
      out.push(v('SECURITY', `$.animations[${i}].name`, 'clip names must match [a-z0-9-]{0,40}'))
  }

  // Meshopt declares one virtual "fallback" buffer that is never stored. Buffer 0 is the stored one.
  const buffers = cols.buffers
  const isFallback = (b: Json | undefined) =>
    ((b?.['extensions'] as Json | undefined)?.['EXT_meshopt_compression'] as Json | undefined)?.['fallback'] === true
  if (buffers.length > 2) out.push(v('SECURITY', '$.buffers', 'a GLB carries one stored buffer and at most one meshopt fallback'))
  if (isFallback(buffers[0])) out.push(v('SECURITY', '$.buffers[0]', 'buffer 0 may not be a fallback buffer'))
  if (buffers.length === 2 && !isFallback(buffers[1]))
    out.push(v('SECURITY', '$.buffers[1]', 'a second buffer must be the meshopt fallback and nothing else'))

  scanBinary(cols, bin, out)

  for (const [i, image] of cols.images.entries()) {
    const view = typeof image['bufferView'] === 'number' ? cols.bufferViews[image['bufferView']] : undefined
    if (!view || !bin) {
      out.push(v('SECURITY', `$.images[${i}]`, 'image data must be embedded in the binary chunk'))
      continue
    }
    if (view['buffer'] !== 0 || isObj(view['extensions'])) {
      out.push(v('SECURITY', `$.images[${i}]`, 'image bufferView must be a plain stored view in buffer 0'))
      continue
    }
    const start = intField(view, 'byteOffset', 0)
    const length = intField(view, 'byteLength', null)
    if (start === null || length === null || start + length > bin.byteLength) {
      out.push(v('SECURITY', `$.images[${i}]`, 'image bufferView runs past the end of the binary chunk'))
      continue
    }
    const webp = inspectWebp(bin.subarray(start, start + length))
    if (webp === null) {
      if (image['mimeType'] === 'image/webp') out.push(v('SECURITY', `$.images[${i}]`, 'declared as WebP but is not a RIFF/WEBP file'))
    } else {
      for (const id of webp.chunks)
        if (!WEBP_ALLOWED_CHUNKS.has(id)) out.push(v('SECURITY', `$.images[${i}]`, `WebP chunk "${id.trim()}" can carry metadata and is not allowed`))
      if (webp.problem) out.push(v('SECURITY', `$.images[${i}]`, `WebP container is malformed: ${webp.problem}`))
    }
  }

  // A string with two problems should still read as one finding per location and message.
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
