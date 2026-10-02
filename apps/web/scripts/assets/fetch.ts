/**
 * `npm run assets:fetch -- --id <id>`
 *
 * Downloads one raw source named in `content/models/sources.json` into the gitignored
 * `assets-src/<id>/`, and nothing else. This is the only network code in the asset toolchain;
 * `assets:ingest` and `assets:check` never fetch, and CI never runs this.
 *
 * Hardening, in the order a hostile server would meet it:
 * - https only, an exact-match host allow-list, no userinfo, no ports, no IP literals;
 * - `redirect: 'manual'`, and every hop is re-checked against the same allow-list;
 * - a 60 s timeout over the whole transfer and a 50 MB cap on the body;
 * - the download must hash to the `sha256` pinned in `sources.json` before anything is written;
 * - zip extraction takes only models, textures and licence files, refuses path traversal,
 *   absolute paths, drive letters, symlinks and encryption, caps the inflated size, and checks
 *   every entry's CRC.
 */
import { crc32, inflateRawSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { defaultRoot, layoutFor, loadSources, type Layout, type SourceEntry } from './sources'
import { describeError, sha256Hex } from './validators'

// ---------------------------------------------------------------------------------------------
// URL policy
// ---------------------------------------------------------------------------------------------

/** Exact hostnames. A new host is a reviewed code change, never a flag. Kenney (CC0) is the only source today. */
export const ALLOWED_HOSTS: readonly string[] = ['kenney.nl']

export interface UrlPolicy {
  readonly hosts: readonly string[]
}
export const DEFAULT_POLICY: UrlPolicy = { hosts: ALLOWED_HOSTS }

export type UrlDenyReason =
  | 'invalid-url'
  | 'not-https'
  | 'userinfo'
  | 'port'
  | 'ip-literal'
  | 'host-not-allowed'

export type UrlVerdict = { readonly ok: true; readonly url: URL } | { readonly ok: false; readonly reason: UrlDenyReason }

export function checkUrl(input: string, policy: UrlPolicy = DEFAULT_POLICY): UrlVerdict {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return { ok: false, reason: 'invalid-url' }
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'not-https' }
  if (url.username !== '' || url.password !== '') return { ok: false, reason: 'userinfo' }
  if (url.port !== '') return { ok: false, reason: 'port' }
  // The WHATWG parser has already folded 0x7f.1, 2130706433 and friends into dotted decimal.
  if (/^[0-9.]+$/.test(url.hostname) || url.hostname.startsWith('[')) return { ok: false, reason: 'ip-literal' }
  return policy.hosts.includes(url.hostname) ? { ok: true, url } : { ok: false, reason: 'host-not-allowed' }
}

// ---------------------------------------------------------------------------------------------
// Bounded download
// ---------------------------------------------------------------------------------------------

export interface FetchLimits {
  readonly timeoutMs: number
  readonly maxBytes: number
  readonly maxRedirects: number
}
export const DEFAULT_LIMITS: FetchLimits = { timeoutMs: 60_000, maxBytes: 50 * 1024 * 1024, maxRedirects: 5 }

export class FetchRefused extends Error {
  constructor(
    message: string,
    readonly reason: UrlDenyReason | 'too-large' | 'timeout' | 'too-many-redirects' | 'bad-status' | 'bad-redirect',
  ) {
    super(message)
  }
}

export interface FetchDeps {
  readonly fetch: typeof fetch
  readonly policy?: UrlPolicy
  readonly limits?: FetchLimits
}

export async function fetchChecked(start: string, deps: FetchDeps): Promise<{ bytes: Uint8Array; finalUrl: string }> {
  const policy = deps.policy ?? DEFAULT_POLICY
  const limits = deps.limits ?? DEFAULT_LIMITS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), limits.timeoutMs)
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(new FetchRefused(`timed out after ${limits.timeoutMs} ms`, 'timeout')))
  })
  aborted.catch(() => undefined)

  try {
    let current = start
    for (let hop = 0; ; hop++) {
      const verdict = checkUrl(current, policy)
      if (!verdict.ok) throw new FetchRefused(`refusing ${hop === 0 ? 'URL' : 'redirect'}: ${verdict.reason}`, verdict.reason)
      const res = await Promise.race([
        deps.fetch(verdict.url.href, { redirect: 'manual', signal: controller.signal, headers: { accept: '*/*' } }),
        aborted,
      ])

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        void res.body?.cancel().catch(() => undefined)
        if (!location) throw new FetchRefused(`redirect ${res.status} without a Location header`, 'bad-redirect')
        if (hop >= limits.maxRedirects) throw new FetchRefused(`more than ${limits.maxRedirects} redirects`, 'too-many-redirects')
        try {
          current = new URL(location, verdict.url).href
        } catch {
          throw new FetchRefused('redirect Location is not a URL', 'bad-redirect')
        }
        continue
      }
      if (!res.ok) throw new FetchRefused(`server answered ${res.status}`, 'bad-status')

      const declared = Number(res.headers.get('content-length') ?? '')
      if (Number.isFinite(declared) && declared > limits.maxBytes) {
        void res.body?.cancel().catch(() => undefined)
        throw new FetchRefused(`body declares ${declared} B; the cap is ${limits.maxBytes} B`, 'too-large')
      }
      return { bytes: await readCapped(res, limits.maxBytes, aborted), finalUrl: verdict.url.href }
    }
  } finally {
    clearTimeout(timer)
  }
}

async function readCapped(res: Response, maxBytes: number, aborted: Promise<never>): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(0)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted])
      if (done) break
      total += value.byteLength
      if (total > maxBytes) throw new FetchRefused(`body exceeds the ${maxBytes} B cap`, 'too-large')
      chunks.push(value)
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined)
    throw error
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.byteLength
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Zip: read only what we want, refuse the rest
// ---------------------------------------------------------------------------------------------

export class ZipRefused extends Error {}

export const MAX_UNCOMPRESSED_BYTES = 150 * 1024 * 1024
const MAX_ENTRIES = 5_000

export interface ZipFile {
  /** Forward-slash, relative, already validated. */
  readonly name: string
  readonly data: Uint8Array
}

const MODEL_EXT = new Set(['.glb', '.gltf', '.bin'])
const TEXTURE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const LICENCE_FILE = /^(?:licen[cs]e|copying)(?:[-_.].*)?$/i

function wanted(name: string): boolean {
  const parts = name.split('/')
  const base = parts[parts.length - 1] ?? ''
  const ext = path.posix.extname(base).toLowerCase()
  if (MODEL_EXT.has(ext)) return true
  if (LICENCE_FILE.test(base)) return true
  return TEXTURE_EXT.has(ext) && parts.slice(0, -1).some((p) => /^textures?$/i.test(p))
}

function safeName(raw: string): string {
  if (raw.length === 0 || raw.length > 260) throw new ZipRefused(`entry name length ${raw.length} is not acceptable`)
  if (raw.includes('\0') || raw.includes('\\')) throw new ZipRefused(`entry name "${raw}" contains a NUL or backslash`)
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) throw new ZipRefused(`entry name "${raw}" is absolute`)
  const parts = raw.split('/').filter((p, i, all) => !(p === '' && i === all.length - 1))
  if (parts.some((p) => p === '..' || p === '.' || p === '')) throw new ZipRefused(`entry name "${raw}" escapes the target folder`)
  return parts.join('/')
}

export function readZipEntries(zip: Uint8Array, maxUncompressed: number = MAX_UNCOMPRESSED_BYTES): ZipFile[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  let eocd = -1
  for (let i = zip.byteLength - 22; i >= Math.max(0, zip.byteLength - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new ZipRefused('not a zip file (no end-of-central-directory record)')
  const total = view.getUint16(eocd + 10, true)
  const cdOffset = view.getUint32(eocd + 16, true)
  if (total === 0xffff || cdOffset === 0xffffffff) throw new ZipRefused('zip64 archives are not supported')
  if (total > MAX_ENTRIES) throw new ZipRefused(`archive has ${total} entries; the cap is ${MAX_ENTRIES}`)

  const files: ZipFile[] = []
  const seen = new Set<string>()
  let inflated = 0
  let at = cdOffset
  for (let n = 0; n < total; n++) {
    if (at + 46 > zip.byteLength || view.getUint32(at, true) !== 0x02014b50) throw new ZipRefused('corrupt central directory')
    const madeBy = view.getUint16(at + 4, true)
    const flags = view.getUint16(at + 8, true)
    const method = view.getUint16(at + 10, true)
    const crc = view.getUint32(at + 16, true)
    const csize = view.getUint32(at + 20, true)
    const usize = view.getUint32(at + 24, true)
    const nameLen = view.getUint16(at + 28, true)
    const extraLen = view.getUint16(at + 30, true)
    const commentLen = view.getUint16(at + 32, true)
    const external = view.getUint32(at + 38, true)
    const localAt = view.getUint32(at + 42, true)
    const raw = new TextDecoder('utf-8').decode(zip.subarray(at + 46, at + 46 + nameLen))
    at += 46 + nameLen + extraLen + commentLen

    const isDir = raw.endsWith('/')
    const name = safeName(raw) // hostile names fail the whole archive, wanted or not
    if (seen.has(name)) throw new ZipRefused(`duplicate entry "${name}"`)
    seen.add(name)
    if (madeBy >> 8 === 3 && ((external >>> 16) & 0xf000) === 0xa000) throw new ZipRefused(`entry "${name}" is a symlink`)
    if (isDir || !wanted(name)) continue

    if (flags & 1) throw new ZipRefused(`entry "${name}" is encrypted`)
    if (method !== 0 && method !== 8) throw new ZipRefused(`entry "${name}" uses unsupported compression method ${method}`)
    inflated += usize
    if (inflated > maxUncompressed) throw new ZipRefused(`archive would inflate past ${maxUncompressed} B`)

    if (localAt + 30 > zip.byteLength || view.getUint32(localAt, true) !== 0x04034b50) throw new ZipRefused(`entry "${name}" has a corrupt local header`)
    const start = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true)
    if (start + csize > zip.byteLength) throw new ZipRefused(`entry "${name}" runs past the end of the archive`)
    const packed = zip.subarray(start, start + csize)
    let data: Uint8Array
    if (method === 0) data = packed
    else {
      try {
        data = new Uint8Array(inflateRawSync(packed, { maxOutputLength: Math.max(usize, 1) }))
      } catch {
        throw new ZipRefused(`entry "${name}" does not inflate to its declared ${usize} B`)
      }
    }
    if (data.byteLength !== usize) throw new ZipRefused(`entry "${name}" is ${data.byteLength} B, declared ${usize} B`)
    if (crc32(data) !== crc) throw new ZipRefused(`entry "${name}" fails its CRC check`)
    files.push({ name, data })
  }
  return files
}

/** Writes entries under `dir`, re-checking containment even though names are already validated. */
export function writeEntries(dir: string, files: readonly ZipFile[]): void {
  const base = path.resolve(dir)
  for (const f of files) {
    const target = path.resolve(base, ...f.name.split('/'))
    if (!target.startsWith(base + path.sep)) throw new ZipRefused(`entry "${f.name}" resolves outside ${dir}`)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, f.data)
  }
}

// ---------------------------------------------------------------------------------------------
// One source
// ---------------------------------------------------------------------------------------------

export class FetchHashMismatch extends Error {}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]
const isZip = (b: Uint8Array) => ZIP_MAGIC.every((x, i) => b[i] === x)

export async function fetchSource(source: SourceEntry, layout: Layout, deps: FetchDeps): Promise<string[]> {
  if (source.origin.type !== 'file') throw new Error(`"${source.id}" is generated; there is nothing to fetch`)
  const origin = source.origin
  const dir = path.join(layout.assetsSrcDir, source.id)
  const memberPath = origin.path.slice(`assets-src/${source.id}/`.length)

  const { bytes } = await fetchChecked(origin.url, deps)

  let files: ZipFile[]
  if (isZip(bytes)) {
    if (!origin.archiveSha256) throw new Error(`"${source.id}" downloads a zip; pin archiveSha256 in sources.json`)
    const got = sha256Hex(bytes)
    if (got !== origin.archiveSha256) throw new FetchHashMismatch(`archive for "${source.id}" hashes to ${got}, sources.json pins ${origin.archiveSha256}`)
    files = readZipEntries(bytes)
  } else {
    if (origin.archiveSha256) throw new Error(`"${source.id}" pins archiveSha256 but the download is not a zip`)
    files = [{ name: memberPath, data: bytes }]
  }

  const model = files.find((f) => f.name === memberPath)
  if (!model) throw new Error(`"${source.id}": ${memberPath} is not in the download`)
  const got = sha256Hex(model.data)
  if (got !== origin.sha256) throw new FetchHashMismatch(`${memberPath} for "${source.id}" hashes to ${got}, sources.json pins ${origin.sha256}`)

  writeEntries(dir, files)
  return files.map((f) => f.name)
}

export async function main(
  args: readonly string[] = process.argv.slice(2),
  root: string = defaultRoot(),
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  try {
    const { values } = parseArgs({ args: [...args], options: { id: { type: 'string' } }, strict: true })
    if (!values.id) {
      console.error('usage: npm run assets:fetch -- --id <id>')
      return 2
    }
    const layout = layoutFor(root)
    const source = loadSources(layout).find((s) => s.id === values.id)
    if (!source) throw new Error(`no source with id "${values.id}" in sources.json`)
    const written = await fetchSource(source, layout, { fetch: fetchImpl })
    console.log(`fetched ${written.length} file(s) into assets-src/${source.id}/`)
    for (const name of written) console.log(`  ${name}`)
    console.log(`Next: paste the licence page text into SOURCE.txt beside it, then npm run assets:ingest -- --id ${source.id}`)
    return 0
  } catch (error) {
    console.error(describeError(error))
    return 1
  }
}
