import type { ReactNode, Ref } from 'react'

/**
 * The one layout shared by the 404 page, the route error boundary and the global error boundary.
 *
 * It is a `<section>`, not a `<main>`: inside the root layout the page already has a `<main id="main">`, and
 * `global-error.tsx` (which replaces the layout) wraps it in its own. Two `<main>` landmarks would be a defect.
 *
 * No animation, so there is nothing for `prefers-reduced-motion` to switch off. Chrome is the site's own utilities
 * (`section-inner`, `eyebrow`, `type-display-2`, `btn`); no new CSS and no client JS of its own.
 */
export type StatusPageProps = {
  /** Mono label above the heading, e.g. "404". */
  eyebrow: string
  /** The page's single `<h1>`. */
  title: string
  children: ReactNode
  /** Buttons and links. Rendered as a row that wraps on a phone. */
  actions: ReactNode
  /** Lets an error boundary move focus to the heading so a keyboard or screen-reader user lands on the message. */
  headingRef?: Ref<HTMLHeadingElement>
  /** Small mono line for a support reference. Omitted when there is nothing to quote. */
  footnote?: string
}

export function StatusPage({ eyebrow, title, children, actions, headingRef, footnote }: StatusPageProps) {
  return (
    <section aria-labelledby="status-title" className="section-inner flex min-h-[70dvh] flex-col justify-center gap-6">
      <p className="eyebrow">{eyebrow}</p>
      <h1
        id="status-title"
        ref={headingRef}
        // Programmatically focusable (not in the tab order) so the boundary can move focus here after a failure.
        tabIndex={-1}
        className="type-display-2 max-w-[18ch] text-[var(--fg-0)] outline-none"
      >
        {title}
      </h1>
      <div className="max-w-[56ch] text-[var(--fg-1)]">{children}</div>
      <div className="flex flex-wrap gap-3">{actions}</div>
      {footnote === undefined ? null : (
        <p className="eyebrow" data-size="sm">
          {footnote}
        </p>
      )}
    </section>
  )
}
