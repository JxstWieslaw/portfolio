import type { MetadataRoute } from 'next'

import { getSiteRoutes } from '@/lib/routes'
import { canonical } from '@/lib/seo'

/**
 * Every route that exists, from `lib/routes.ts`, so the sitemap and the pages cannot drift.
 *
 * No `lastModified`: the content carries no modified dates, and `new Date()` would claim every
 * page changed on every build, which teaches crawlers to ignore the field. `/admin` is excluded
 * permanently by spec section 3 and `/lab` is not built.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return getSiteRoutes().map((route) => ({
    url: canonical(route.path),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}
