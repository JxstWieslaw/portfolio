'use client'

import { useEffect, useRef } from 'react'

import { StatusPage } from '@/components/layout/StatusPage'
import { Button } from '@/components/ui/Button'

import './globals.css'

/**
 * The last resort: it replaces the root layout, so it brings its own `<html>` and `<body>` and none of the layout's
 * chrome, fonts or hero script exist here. The tokens still do, because globals.css is imported above; the type falls
 * back to the system stack, which is the right trade for a page that must not depend on anything else working.
 *
 * Same rules as `error.tsx`: no stack, no message, a digest only.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    heading.current?.focus()
  }, [])

  return (
    <html lang="en">
      <body className="bg-[var(--bg-0)] text-[var(--fg-1)]">
        <main id="main">
          <StatusPage
            eyebrow="Something went wrong"
            title="The site couldn’t load"
            headingRef={heading}
            footnote={error.digest === undefined ? undefined : `Reference ${error.digest}`}
            actions={
              <>
                <Button variant="primary" size="lg" onClick={reset}>
                  Try again
                </Button>
                {/* A plain navigation, not a client route change: it also recovers a page whose scripts failed. */}
                <Button size="lg" href="/">
                  Reload the home page
                </Button>
              </>
            }
          >
            <p>Nothing you did caused this. Trying again usually fixes it. If it does not, reload the home page.</p>
          </StatusPage>
        </main>
      </body>
    </html>
  )
}
