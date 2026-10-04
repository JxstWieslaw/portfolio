/**
 * The hash of everything in `sources.json` that decides a model's output bytes.
 *
 * `assets:check` runs in CI without the raw source, so it cannot re-run a raw-source ingest to see
 * that a committed GLB is stale. It can, however, recompute this hash from `sources.json` alone and
 * compare it with the one `assets:ingest` stored in the manifest entry: edit a palette colour, a
 * tier list or a clip, forget to re-ingest, and the check fails with the id.
 *
 * Inputs: the raw file's pinned sha256 (or the generator id), the archive sha256, `look`, the tier
 * list and the clips, plus `PIPELINE_VERSION`. Bump `PIPELINE_VERSION` when a change to the
 * pipeline code would change bytes for the same inputs, so every entry is flagged for re-ingest.
 * Key order never matters (canonical JSON). The result is the first 16 hex of the sha256.
 */
import { createHash } from 'node:crypto'

import { tiersOf, type SourceEntry } from './sources'
import { canonicalJson } from './validators'

export const PIPELINE_VERSION = 1

export function buildInputsHash(source: SourceEntry): string {
  const origin =
    source.origin.type === 'generated'
      ? { generator: source.origin.generator }
      : { sha256: source.origin.sha256, archiveSha256: source.origin.archiveSha256 ?? null }
  const inputs = {
    pipeline: PIPELINE_VERSION,
    origin,
    look: source.look ?? null,
    tiers: tiersOf(source),
    clips: source.clips ?? [],
  }
  return createHash('sha256').update(canonicalJson(inputs)).digest('hex').slice(0, 16)
}

/** The actionable message `assets:check` and `assets:ingest --verify` print for a stale entry. */
export function staleBuildMessage(id: string): string {
  return `sources.json changed since the last ingest for ${JSON.stringify(id)}: run npm run assets:ingest`
}
