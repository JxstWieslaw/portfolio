import type { MetadataRoute } from 'next'

import { canonical, siteUrl } from '@/lib/seo'

/**
 * `/admin` is disallowed here as well as being excluded from the sitemap and all OG
 * generation (spec section 3). It does not exist yet; the rule is in place before the route
 * is, so the surface is never briefly indexable.
 */
export default function robots(): MetadataRoute.Robots {
  const isPreview =
    process.env.VERCEL_ENV === 'preview' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'

  // Preview deploys must never compete with production in search results.
  if (isPreview) {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }

  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/admin/'] }],
    sitemap: canonical('/sitemap.xml'),
    host: siteUrl(),
  }
}
