import { getProfile } from '@/lib/content'
import { canonical } from '@/lib/seo'

/**
 * RFC 9116 `security.txt`.
 *
 * A route rather than a file in `public/` because two of its fields are not constants: `Canonical` follows the site
 * origin (not registered yet, see `lib/seo.ts`) and `Expires` is required and must be under a year away, so a static
 * date would go stale and quietly turn the file into an invalid one. Static rendering computes both at build time,
 * and every deploy refreshes the expiry.
 *
 * `Contact` is the profile email the site already publishes: the content has no separate security address. Using a
 * dedicated one is an owner decision (see the PR).
 */
export const dynamic = 'force-static'

const VALID_FOR_DAYS = 180

export function GET(): Response {
  const expires = new Date(Date.now() + VALID_FOR_DAYS * 24 * 60 * 60 * 1000)
  // RFC 9116 wants a date-time with no fractional seconds.
  const expiresField = expires.toISOString().replace(/\.\d{3}Z$/, 'Z')

  const body = [
    `Contact: mailto:${getProfile().email}`,
    `Expires: ${expiresField}`,
    'Preferred-Languages: en',
    `Canonical: ${canonical('/.well-known/security.txt')}`,
    '',
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, must-revalidate',
    },
  })
}
