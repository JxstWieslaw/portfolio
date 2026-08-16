/**
 * Metadata, canonical URLs and JSON-LD.
 *
 * Spec section 4.8. The identity asserted here is the reconciled one (section 1 of the
 * design-system reconciliation): Tech Lead at Data Age AND Senior Software Engineer at
 * Rapidev Labs. The design export's later pivot is not represented anywhere in this file.
 */

import { getProfile } from './content'

/**
 * The production origin.
 *
 * No custom domain is registered yet (spec section 10 lists it as an owner input), so this
 * falls back to the Vercel-provided URL and finally to localhost. `NEXT_PUBLIC_SITE_URL` is
 * the override to set once a domain exists — it is the only place that needs changing.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/$/, '')

  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`

  return 'http://localhost:3000'
}

export function canonical(path = '/'): string {
  return new URL(path, `${siteUrl()}/`).toString()
}

export const SITE_TITLE = 'Wieslaw Samushonga — Tech Lead & Software Engineer'

/**
 * Deliberately not the H1.
 *
 * The H1 is a statement of positioning; a meta description has to survive being read as a
 * single line under a search result, so it leads with the concrete roles and domains a
 * recruiter is scanning for.
 */
export const SITE_DESCRIPTION =
  'Tech Lead at Data Age and Senior Software Engineer at Rapidev Labs. I lead teams that ship ' +
  'production software across healthcare, education, creator tooling and procurement — and ' +
  'build real-time 3D on the web that holds 60 fps on a mid-range phone.'

/** Link kinds that represent an identity elsewhere, rather than a call to action. */
const SAME_AS_LABELS = new Set(['LinkedIn', 'GitHub', 'X', 'Medium', 'Instagram', 'Reddit'])

/**
 * JSON-LD `Person` for the home page.
 *
 * `jobTitle` is an array because both roles are current and concurrent — collapsing them to
 * one would misrepresent the positioning the whole site is built on. `sameAs` takes only real
 * profile URLs; `mailto:` and the Rapidev Labs site are not identities, so they are excluded.
 */
export function personJsonLd(): Record<string, unknown> {
  const profile = getProfile()

  const sameAs = profile.links
    .filter((link) => SAME_AS_LABELS.has(link.label) && link.url.startsWith('http'))
    .map((link) => link.url)

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.name,
    url: canonical('/'),
    email: `mailto:${profile.email}`,
    jobTitle: profile.roles.map((role) => role.title),
    worksFor: profile.roles.map((role) => ({
      '@type': 'Organization',
      name: role.org,
      ...(role.url ? { url: role.url } : {}),
    })),
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Harare',
      addressCountry: 'ZW',
    },
    description: profile.sub,
    knowsAbout: [
      'Software architecture',
      'Technical leadership',
      'TypeScript',
      'Next.js',
      'WebGL',
      'React Three Fiber',
      'Real-time 3D on the web',
    ],
    ...(sameAs.length > 0 ? { sameAs } : {}),
  }
}
