/**
 * `npm run size:coverage` (entry: `coverage.cli.ts`), run after `npm run build`.
 *
 * `size-limit` only measures the files its globs find, so a chunk that no glob finds has no budget and nothing says
 * so. This check closes that gap. It lists every emitted client chunk under `.next/static/chunks`, expands the globs
 * in `.size-limit.json` exactly as size-limit 13 does (`node:fs/promises` `glob`, a `!` pattern subtracted from the
 * entry's matches), and fails when:
 *
 *   - a chunk is counted by no entry and is not on the short list below of chunks a browser never downloads on this
 *     site (so a new chunk cannot slip past every budget);
 *   - a chunk is counted by two entries (one byte, one budget);
 *   - a `!` pattern in `.size-limit.json` matches no real file, so a dead exclusion cannot sit there looking useful;
 *   - a rule on the list below matches no chunk (the list stays true).
 *
 * One exception, by build host. A Windows build splits the Pages Router's `_app` and `_error` code into two async
 * chunks with pinned ids, `655` and `826`; the Linux build CI runs keeps that code inside `main-*` and emits neither.
 * Their exclusions and their rule are therefore checked only on Windows, where a renumbering would otherwise put
 * those bytes into the core budget unnoticed.
 *
 * The measured values and the limits are in `docs/bundle-budgets.md`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { glob } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

export interface SizeLimitEntry {
  readonly name: string
  readonly path: string | readonly string[]
}

/** `!` patterns of `.size-limit.json` that only a Windows build can match (see above). */
export const WINDOWS_ONLY_EXCLUSIONS: ReadonlySet<string> = new Set(['.next/static/chunks/655.*.js', '.next/static/chunks/826.*.js'])

const PAGES_ROUTER_ASYNC = /^(?:655|826)\.[0-9a-f]+\.js$/

/** Chunks with no budget on purpose: nothing on an App Router page requests them. Paths are relative to `.next/static/chunks`. */
export const NOT_DOWNLOADED: readonly (readonly [pattern: RegExp, reason: string])[] = [
  [/^framework-[0-9a-f]+\.js$/, "the Pages Router's React DOM; App Router pages carry React DOM in the initial entry"],
  [/^main-[0-9a-f]+\.js$/, "the Pages Router runtime (`main-app-*` is the App Router's and is budgeted)"],
  [/^pages\//, 'the Pages Router `_app` and `_error` pages, used only by its own error fallback'],
  [PAGES_ROUTER_ASYNC, 'Pages Router `_app` and `_error` code, loaded only by `main-*` (Windows builds only)'],
  [/^polyfills-[0-9a-f]+\.js$/, '`noModule`: a browser that runs modules never downloads it'],
  [/^app\/(?:.+\/)?route-[0-9a-f]+\.js$/, 'route handlers (OG images, robots, sitemap, manifest) have no client code; nothing requests the stub'],
]

export interface ChunkRow {
  /** Relative to `.next/static/chunks`, forward slashes. */
  readonly file: string
  readonly gzipBytes: number
  /** The `.size-limit.json` entries that count this chunk. */
  readonly budgets: readonly string[]
  /** Why it has no budget, when it is on the `NOT_DOWNLOADED` list. */
  readonly excluded: string | null
}

export interface CoverageReport {
  readonly rows: readonly ChunkRow[]
  readonly problems: readonly string[]
}

const CHUNKS = '.next/static/chunks/'

/** Files matched by `patterns`, relative to `cwd` with forward slashes, the way size-limit 13's `findFiles` finds them. */
async function findFiles(patterns: readonly string[], cwd: string): Promise<Set<string>> {
  const found = new Set<string>()
  if (patterns.length === 0) return found
  for await (const entry of glob(
    patterns.flatMap((pattern) => [pattern, `${pattern}/**`]),
    { cwd, withFileTypes: true },
  )) {
    if (entry.isFile()) found.add(path.relative(cwd, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
  }
  return found
}

export interface StaleExclusion {
  readonly entry: string
  /** The pattern without its `!`. */
  readonly pattern: string
}

/** Which entries count which files, and which `!` patterns matched nothing. */
export async function expandEntries(
  entries: readonly SizeLimitEntry[],
  cwd: string,
): Promise<{ readonly owners: ReadonlyMap<string, readonly string[]>; readonly staleExclusions: readonly StaleExclusion[] }> {
  const owners = new Map<string, string[]>()
  const staleExclusions: StaleExclusion[] = []
  for (const entry of entries) {
    const patterns = typeof entry.path === 'string' ? [entry.path] : entry.path
    const include = patterns.filter((pattern) => !pattern.startsWith('!'))
    const exclude = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1))
    for (const pattern of exclude) {
      if ((await findFiles([pattern], cwd)).size === 0) staleExclusions.push({ entry: entry.name, pattern })
    }
    const excluded = await findFiles(exclude, cwd)
    for (const file of await findFiles(include, cwd)) {
      if (!excluded.has(file)) owners.set(file, [...(owners.get(file) ?? []), entry.name])
    }
  }
  return { owners, staleExclusions }
}

/**
 * The coverage of every chunk under `<webRoot>/.next/static/chunks` by the budgets in `<webRoot>/.size-limit.json`.
 * `platform` is the build host's (the build and this check run on the same machine).
 */
export async function checkCoverage(webRoot: string, platform: NodeJS.Platform = process.platform): Promise<CoverageReport> {
  const windows = platform === 'win32'
  const entries = JSON.parse(readFileSync(path.join(webRoot, '.size-limit.json'), 'utf8')) as SizeLimitEntry[]
  const chunks = [...(await findFiles([`${CHUNKS}**/*.js`], webRoot))].sort()
  // Fail closed, and with the one message that matters: with no build, every other check would fail as noise.
  if (chunks.length === 0) return { rows: [], problems: [`no chunks under ${path.join(webRoot, CHUNKS)}: run \`npm run build\` first`] }
  const { owners, staleExclusions } = await expandEntries(entries, webRoot)
  const problems: string[] = []

  const rows: ChunkRow[] = chunks.map((file) => {
    const short = file.slice(CHUNKS.length)
    const rule = NOT_DOWNLOADED.find(([pattern]) => pattern.test(short))
    return {
      file: short,
      gzipBytes: gzipSync(readFileSync(path.join(webRoot, file)), { level: 9 }).length,
      budgets: owners.get(file) ?? [],
      excluded: rule ? rule[1] : null,
    }
  })

  for (const row of rows) {
    if (row.budgets.length === 0 && row.excluded === null) problems.push(`${row.file} is counted by no budget`)
    if (row.budgets.length > 1) problems.push(`${row.file} is counted by ${row.budgets.length} budgets: ${row.budgets.join(', ')}`)
    if (row.budgets.length > 0 && row.excluded !== null) problems.push(`${row.file} is budgeted and also listed as never downloaded`)
  }
  for (const { entry, pattern } of staleExclusions) {
    if (windows || !WINDOWS_ONLY_EXCLUSIONS.has(pattern)) problems.push(`exclusion matches no file (stale): ${entry}: !${pattern}`)
  }
  for (const [pattern, reason] of NOT_DOWNLOADED) {
    if (pattern === PAGES_ROUTER_ASYNC && !windows) continue
    if (!rows.some((row) => pattern.test(row.file))) problems.push(`never-downloaded rule ${pattern} matches no chunk (${reason})`)
  }
  return { rows, problems }
}

export function formatReport({ rows, problems }: CoverageReport): string {
  const lines = rows.map(
    (row) => `${(row.gzipBytes / 1000).toFixed(2).padStart(8)} kB  ${row.file}  ->  ${row.budgets.length > 0 ? row.budgets.join(' + ') : `no budget: ${row.excluded ?? 'NONE'}`}`,
  )
  lines.push('', `${rows.length} chunks, ${rows.filter((row) => row.budgets.length > 0).length} budgeted, ${rows.filter((row) => row.excluded !== null).length} never downloaded`)
  if (problems.length > 0) lines.push('', ...problems.map((problem) => `FAIL ${problem}`))
  return lines.join('\n')
}

export async function main(webRoot: string = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')): Promise<number> {
  if (!existsSync(path.join(webRoot, '.size-limit.json'))) {
    console.error(`budget coverage could not run: no .size-limit.json in ${webRoot}`)
    return 1
  }
  const report = await checkCoverage(webRoot)
  console.log(formatReport(report))
  return report.problems.length > 0 ? 1 : 0
}
