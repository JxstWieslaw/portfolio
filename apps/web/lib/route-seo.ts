/**
 * Metadata and JSON-LD for the deep routes (`/work`, `/work/[slug]`, `/about`, `/resume`).
 *
 * Kept apart from `lib/seo.ts`, which owns the home page's identity: that file stays small and
 * the two cannot collide. Everything here is derived from the typed content; nothing is invented.
 */

import type { Metadata } from 'next'

import { getDomain, getProfile } from './content'
import type { Project } from './content'
import { canonical, personJsonLd } from './seo'

export const SITE_NAME = 'Wieslaw Samushonga'

/**
 * Any JSON-LD object as a string that is safe inside a `<script>` element.
 *
 * `JSON.stringify` does not escape `<`, so `</script>` in a string would close the tag. U+2028
 * and U+2029 are valid in JSON but are line terminators in older JavaScript parsers. All three
 * are written as `\u` escapes; the parsed object is unchanged.
 */
const LINE_SEPARATOR = new RegExp(String.fromCharCode(0x2028), 'g')
const PARAGRAPH_SEPARATOR = new RegExp(String.fromCharCode(0x2029), 'g')

export function jsonLdScript(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(LINE_SEPARATOR, '\\u2028')
    .replace(PARAGRAPH_SEPARATOR, '\\u2029')
}

export type PageMetadataInput = {
  /** The page's own name. The root layout's title template appends the site name. */
  readonly title: string
  readonly description: string
  /** Absolute path, e.g. `/work/gabar`. Becomes the canonical URL and `og:url`. */
  readonly path: string
  readonly ogType?: 'website' | 'article' | 'profile'
}

/**
 * Metadata for a deep route.
 *
 * A nested segment's `openGraph` replaces the layout's rather than merging with it, so
 * `siteName` and `locale` are repeated. The share image is not set here: the route's
 * `opengraph-image.tsx` supplies it, and a hand-set `images` would shadow that file.
 */
export function pageMetadata({ title, description, path, ogType = 'website' }: PageMetadataInput): Metadata {
  const url = canonical(path)
  const fullTitle = `${title} — ${SITE_NAME}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: ogType,
      siteName: SITE_NAME,
      title: fullTitle,
      description,
      url,
      locale: 'en_GB',
    },
    twitter: { card: 'summary_large_image', title: fullTitle, description },
  }
}

export type Crumb = { readonly name: string; readonly path: string }

export function breadcrumbJsonLd(crumbs: readonly Crumb[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: canonical(crumb.path),
    })),
  }
}

/**
 * A case study as a `CreativeWork`.
 *
 * Not `Article`: Google's Article guidance expects a publication date and the content carries
 * none. Every field below is the project record's own.
 */
export function caseStudyJsonLd(project: Project): Record<string, unknown> {
  const profile = getProfile()
  const domain = getDomain(project.domain)
  const publicLinks = project.links.map((link) => link.url)

  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: project.name,
    headline: project.name,
    description: project.summary,
    url: canonical(`/work/${project.slug}`),
    keywords: project.stack,
    ...(domain ? { about: domain.label } : {}),
    creator: { '@type': 'Person', name: profile.name, url: canonical('/') },
    ...(publicLinks.length > 0 ? { sameAs: publicLinks } : {}),
  }
}

/** The `/about` page: a `ProfilePage` whose main entity is the Person the home page asserts. */
export function profilePageJsonLd(): Record<string, unknown> {
  const person = { ...personJsonLd() }
  delete person['@context']

  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: canonical('/about'),
    name: `About ${getProfile().name}`,
    mainEntity: person,
  }
}
