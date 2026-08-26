import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { Footer } from '@/components/layout/Footer'
import { Nav } from '@/components/layout/Nav'
import { SkipLink } from '@/components/layout/SkipLink'
import { getProfile } from '@/lib/content'
import { SITE_DESCRIPTION, SITE_TITLE, canonical, siteUrl } from '@/lib/seo'

import { fontVariables } from './fonts'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: SITE_TITLE,
    // Deep pages append their own name; the suffix keeps the identity in every tab title.
    template: '%s — Wieslaw Samushonga',
  },
  description: SITE_DESCRIPTION,
  alternates: { canonical: canonical('/') },
  openGraph: {
    type: 'profile',
    siteName: 'Wieslaw Samushonga',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: canonical('/'),
    locale: 'en_GB',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  // /admin does not exist yet; the directive is in place before the route is, so the surface
  // is never briefly indexable (spec section 3).
  robots: { index: true, follow: true },
  applicationName: 'Wieslaw Samushonga — Portfolio',
  authors: [{ name: 'Wieslaw Samushonga' }],
  creator: 'Wieslaw Samushonga',
}

/**
 * Matches `--bg-0`, so the browser chrome and the page agree before first paint and there is
 * no flash of a light UI bar on mobile.
 */
export const viewport = {
  themeColor: '#0D1117',
  colorScheme: 'dark',
  // The hero is 100dvh and the canvas is decorative; letting content into the notch area is
  // deliberate, with env(safe-area-inset-*) applied per-component where it matters.
  viewportFit: 'cover' as const,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const profile = getProfile()

  return (
    <html lang="en" className={fontVariables}>
      <body className="bg-[var(--bg-0)] text-[var(--fg-1)]">
        <SkipLink />

        {/* Outside <main>, so the skip link genuinely skips it. */}
        <Nav socialLinks={profile.links} />

        <main id="main">{children}</main>

        <Footer name={profile.name} location={profile.location} />
      </body>
    </html>
  )
}
