import type { ReactNode } from 'react'
import { Container } from '@/components/layout/Container'
import { Badge } from '@/components/ui/Badge'
import { Monogram } from '@/components/ui/Monogram'
import { cx } from '@/lib/cx'
import { FOOTER_COLUMNS, type FooterColumn, type FooterLink } from '@/lib/nav-items'

/**
 * The footer — design-home.md § 12, with the § 3.3 mobile row authored here.
 *
 * A server component: it renders copy and anchors and owns no state, so there
 * is nothing for `'use client'` to buy.
 *
 * The one substantive decision is the treatment of `/lab`, `/about`, `/resume`
 * and the perf page. Reconciliation § 9 confirms none of them exist in this
 * milestone, and the export links all of them. Shipping the hrefs would ship
 * four 404s, and deleting the entries would quietly lose four planned
 * destinations, so they render as the pattern § 8 already sanctions for the AR
 * button: `aria-disabled`, still focusable, still in the reading order, and
 * carrying a visible `Coming soon` badge that is part of the accessible name.
 * Greying them out alone would announce nothing.
 */

/** Verbatim, design-home.md § 12. The claim the rest of the build must satisfy. */
export const COLOPHON =
  'Built with Next.js, React Three Fiber and Rapier. One draw call. Holds 60 fps on a mid-range phone.'

/**
 * Fixed rather than `new Date().getFullYear()`. The export reads `© 2026`, a
 * server-rendered clock is a hydration hazard the moment the two sides
 * disagree, and a date-dependent test is a test that fails on New Year's Eve.
 */
export const COPYRIGHT_YEAR = 2026

const LINK_BASE = [
  'inline-flex min-h-11 items-center gap-2',
  'transition-colors duration-[var(--d-1)] ease-[var(--ease)]',
].join(' ')

/**
 * Live and dead links never share a colour utility — two `text-[…]` utilities
 * on one element would leave the winner up to Tailwind's emit order.
 */
const LINK_LIVE = 'text-[var(--fg-2)] hover:text-[var(--fg-0)] focus-visible:text-[var(--fg-0)]'
const LINK_DEAD = 'cursor-not-allowed text-[var(--fg-3)]'

const PERF_BASE = [
  'inline-flex min-h-11 items-center gap-2',
  '[font-family:var(--font-mono)] text-[0.75rem] uppercase tracking-[0.12em]',
  'transition-colors duration-[var(--d-1)] ease-[var(--ease)]',
].join(' ')

const PERF_LIVE = 'text-[var(--cyan-300)] hover:text-[var(--violet-300)]'

/**
 * An `<a>` with no `href` is exactly what this is: a link whose destination
 * does not exist yet. `role` and `tabIndex` put it back in the accessibility
 * tree and the tab order that dropping `href` took it out of.
 */
function ComingSoonLink({ children, className }: { children: ReactNode; className: string }) {
  return (
    <a role="link" aria-disabled="true" tabIndex={0} data-coming-soon="true" className={className}>
      {children}
      {/* A real space, not `gap`. The accessible name is computed from text
          nodes, so without it the badge runs into the label and the link is
          announced as "LabComing soon". */}
      {' '}
      <Badge status="in-preparation">Coming soon</Badge>
    </a>
  )
}

function FooterNavLink({ link }: { link: FooterLink }) {
  // No `href` is the encoding of "this route does not exist yet" (§ 9).
  if (link.href === undefined) {
    return <ComingSoonLink className={cx(LINK_BASE, LINK_DEAD)}>{link.label}</ComingSoonLink>
  }
  return (
    <a href={link.href} className={cx(LINK_BASE, LINK_LIVE)}>
      {link.label}
    </a>
  )
}

export type FooterProps = {
  /** Printed next to the mark and in the copyright line. */
  name: string
  /** Printed after the name, separated by a middle dot. */
  location: string
  columns?: readonly FooterColumn[]
  colophon?: string
  /**
   * The perf page. Omitted ⇒ the link renders with the same `Coming soon`
   * affordance as the § 9 routes rather than the export's dead `href="#"`.
   */
  perfHref?: string
  year?: number
  className?: string
}

export function Footer({
  name,
  location,
  columns = FOOTER_COLUMNS,
  colophon = COLOPHON,
  perfHref,
  year = COPYRIGHT_YEAR,
  className,
}: FooterProps) {
  return (
    <footer
      className={cx(
        'border-t border-[var(--line-1)] bg-[var(--bg-0)]',
        // § 3.2 principle 5 — landscape notches on the sides, the home
        // indicator underneath.
        '[padding-inline:env(safe-area-inset-left)_env(safe-area-inset-right)]',
        '[padding-bottom:env(safe-area-inset-bottom)]',
        className
      )}
    >
      {/* § 3.3: one column below 768, `1fr auto` from 768 up. */}
      <Container className="grid grid-cols-1 items-start gap-12 pt-16 pb-12 md:grid-cols-[1fr_auto]">
        <div>
          <div className="mb-6 flex items-center gap-4">
            {/* 40px, static and aria-hidden — the name beside it is the text. */}
            <Monogram name={name} size="footer" />
            <span className="text-[0.9375rem] text-[var(--fg-2)]">
              {name} · {location}
            </span>
          </div>

          <p className="mt-0 mb-3 max-w-[60ch] text-[0.875rem] leading-[1.6] text-[var(--fg-2)]">
            {colophon}
          </p>

          {perfHref === undefined ? (
            <ComingSoonLink className={cx(PERF_BASE, LINK_DEAD)}>
              <span>View perf</span>
              <span aria-hidden="true">→</span>
            </ComingSoonLink>
          ) : (
            <a href={perfHref} className={cx(PERF_BASE, PERF_LIVE)}>
              <span>View perf</span>
              <span aria-hidden="true">→</span>
            </a>
          )}
        </div>

        {/*
          § 3.3: `repeat(2,1fr)` below 768 so the two columns survive the stack,
          then the export's `grid-auto-flow: column` with its 64px gap from 768.
        */}
        <nav
          aria-label="Footer"
          className="grid grid-cols-2 items-start gap-x-8 md:auto-cols-max md:grid-flow-col md:grid-cols-none md:gap-x-16"
        >
          {columns.map((column) => (
            <div key={column.id} className="grid gap-1 text-[0.9375rem]">
              {column.links.map((link) => (
                <FooterNavLink key={link.label} link={link} />
              ))}
            </div>
          ))}
        </nav>
      </Container>

      {/* A separate container so the hairline spans the full content width. */}
      <Container className="pb-12">
        <p className="m-0 border-t border-[var(--line-1)] pt-6 [font-family:var(--font-mono)] text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--fg-2)]">
          © {year} {name}
        </p>
      </Container>
    </footer>
  )
}
