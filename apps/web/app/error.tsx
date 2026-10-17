'use client'

import { useEffect, useRef } from 'react'

import { StatusPage } from '@/components/layout/StatusPage'
import { Button } from '@/components/ui/Button'

/**
 * The route error boundary: it renders inside the root layout, so the nav and footer stay.
 *
 * Calm on purpose. The message names no cause and shows no stack or `error.message`: in production Next replaces the
 * message with a generic one and a digest, and in any case what went wrong server-side is not for visitors. The
 * digest is a hash, safe to quote, and lets the owner find the matching server log line.
 *
 * `unstable_retry` is not used: `reset` re-renders the segment, which is what a visitor means by "try again".
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null)

  // A boundary swaps the page under the user; move focus to the message so it is announced and keyboard users are not
  // left on a control that no longer exists.
  useEffect(() => {
    heading.current?.focus()
  }, [])

  return (
    <StatusPage
      eyebrow="Something went wrong"
      title="This didn’t load properly"
      headingRef={heading}
      footnote={error.digest === undefined ? undefined : `Reference ${error.digest}`}
      actions={
        <>
          <Button variant="primary" size="lg" onClick={reset}>
            Try again
          </Button>
          <Button size="lg" href="/">
            Back to the home page
          </Button>
        </>
      }
    >
      <p>Nothing you did caused this. Trying again usually fixes it, and if it does not, the home page is a safe place to start over.</p>
    </StatusPage>
  )
}
