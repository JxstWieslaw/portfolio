import type { Metadata } from 'next'

import { Button } from '@/components/ui/Button'
import { StatusPage } from '@/components/layout/StatusPage'
import { NAV_ITEMS } from '@/lib/nav-items'

/** The standalone pages. Sections below link to the home page's own anchors. */
const PAGES = [
  { href: '/work', label: 'All work' },
  { href: '/about', label: 'About' },
  { href: '/resume', label: 'Resume' },
] as const

/**
 * Next answers with a real 404 status for anything that renders this. `noindex` is belt and braces for crawlers that
 * ignore the status. The title picks up the template, so the tab reads "Page not found — Wieslaw Samushonga".
 */
export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <StatusPage
      eyebrow="404"
      title="That page isn’t here"
      actions={
        <>
          <Button variant="primary" size="lg" href="/">
            Back to the home page
          </Button>
          <nav aria-label="Pages and sections" className="w-full">
            <ul className="flex flex-wrap gap-3">
              {PAGES.map((page) => (
                <li key={page.href}>
                  <Button href={page.href} size="md">
                    {page.label}
                  </Button>
                </li>
              ))}
              {NAV_ITEMS.map((item) => (
                <li key={item.id}>
                  {/* Absolute to the home page: the nav's own links are in-page anchors and would go nowhere from here. */}
                  <Button href={`/${item.href}`} size="md">
                    {item.label}
                  </Button>
                </li>
              ))}
            </ul>
          </nav>
        </>
      }
    >
      <p>The link may be out of date, or the address mistyped. The home page has everything, or you can go straight to a section.</p>
    </StatusPage>
  )
}
