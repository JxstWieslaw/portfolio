/**
 * The one list of hosts a model source may come from. A leaf module (no imports) so that
 * `fetch.ts` (what may be downloaded) and `sources.ts` (what `sources.json` may say, checked by
 * ingest, check and fetch alike) can never drift apart. A new host is a reviewed code change.
 *
 * - `download`: exact hostnames `assets:fetch` will contact, for sources whose `origin.url` is on this key.
 * - `evidence`: exact hostnames a licence page for such a source may be on. No suffix matching:
 *   `evilkenney.nl` and `kenney.nl.evil.example` are different hosts.
 */
export const SOURCE_HOSTS = {
  'kenney.nl': { download: ['kenney.nl'], evidence: ['kenney.nl', 'www.kenney.nl'] },
} as const

export type SourceHost = keyof typeof SOURCE_HOSTS

export function isSourceHost(host: string): host is SourceHost {
  return Object.hasOwn(SOURCE_HOSTS, host)
}
