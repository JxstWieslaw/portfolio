/**
 * The navigation model — one module, three consumers (`Nav`, its bottom sheet,
 * and `Footer`).
 *
 * Reconciliation § 1 reverses two things `Home.dc.html` shipped, and both are
 * easy to get wrong by copying the export:
 *
 *   - the fourth item reads **How I lead**, never "How I work";
 *   - the fifth points at **`#timeline`**, never `#experience` (OD-3).
 *
 * `id` is stored alongside `href` rather than derived by slicing a `#` off at
 * three call sites: the id is also what the scroll-spy observes, so the two
 * are one fact, not two.
 *
 * This module is deliberately free of JSX and of `'use client'` — the footer
 * is a server component and must be able to import it.
 */

export type NavItem = {
  /** The section's DOM id. The scroll-spy's observation target. */
  readonly id: string
  /** Always `#${id}`. */
  readonly href: string
  readonly label: string
}

/**
 * The six section pills, in order. Copy is from the reconciliation spec, NOT
 * from the export.
 */
export const NAV_ITEMS = [
  { id: 'work', href: '#work', label: 'Work' },
  { id: 'lead', href: '#lead', label: 'How I lead' },
  { id: 'craft', href: '#craft', label: 'Craft' },
  { id: 'stack', href: '#stack', label: 'Stack' },
  { id: 'timeline', href: '#timeline', label: 'Experience' },
  { id: 'writing', href: '#writing', label: 'Writing' },
] as const satisfies readonly NavItem[]

export type NavCta = {
  readonly href: string
  readonly label: string
}

/**
 * The one call to action in the header. It sits outside `<nav>`, exactly as the
 * export has it, and is visible at every width — on mobile it is the only
 * destination reachable without opening the sheet.
 */
export const NAV_CTA: NavCta = { href: '#contact', label: "Let's talk" }

/** The anchor the monogram points at (`app/layout.tsx` owns `<main id="main">`). */
export const HOME_HREF = '#main'

export type FooterLink = {
  readonly label: string
  /**
   * Absent ⇒ the route does not exist in this milestone. Reconciliation § 9
   * confirms `/lab`, `/about` and `/resume` are out of scope, so they ship as
   * an announced, focusable "Coming soon" affordance instead of a 404 trap.
   */
  readonly href?: string
}

export type FooterColumn = {
  /** Stable React key; never rendered. The columns have no visible headings. */
  readonly id: string
  readonly links: readonly FooterLink[]
}

/**
 * The footer's two columns, verbatim from design-home.md § 12 — with the one
 * copy reversal reconciliation § 1 requires ("How I work" → `How I lead`).
 *
 * The three href-less entries are the § 9 routes.
 */
export const FOOTER_COLUMNS = [
  {
    id: 'sections',
    links: [
      { label: 'Work', href: '#work' },
      { label: 'How I lead', href: '#lead' },
      { label: 'Craft', href: '#craft' },
      { label: 'Lab' },
    ],
  },
  {
    id: 'more',
    links: [
      { label: 'About' },
      { label: 'Resume' },
      { label: 'Writing', href: '#writing' },
      { label: 'Contact', href: '#contact' },
    ],
  },
] as const satisfies readonly FooterColumn[]
