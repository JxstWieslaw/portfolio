import type { MetadataRoute } from 'next'

import { canonical } from '@/lib/seo'

/**
 * Only `/` exists in this milestone.
 *
 * The deep routes (`/work`, `/lab`, `/about`, `/resume`) are deliberately absent rather than
 * listed-and-broken — a sitemap that advertises 404s is worse than a short one. `/admin` is
 * excluded permanently by spec section 3.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: canonical('/'),
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
  ]
}
