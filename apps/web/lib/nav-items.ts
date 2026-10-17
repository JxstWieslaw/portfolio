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
  /** The in-page anchor, always `#${id}`. What the item opens while the visitor is on `/`. */
  readonly href: string
  readonly label: string
  /**
   * The real page behind the item, when there is one. Off the home page the item opens this instead of the anchor,
   * and it is the page that earns `aria-current="page"`. Only `Work` has one: on `/` it scrolls to the section,
   * everywhere else it is the `/work` index.
   */
  readonly route?: string
}

/**
 * The six section pills, in order. Copy is from the reconciliation spec, NOT
 * from the export.
 */
export const NAV_ITEMS = [
  { id: 'work', href: '#work', label: 'Work', route: '/work' },
  { id: 'lead', href: '#lead', label: 'How I lead' },
  { id: 'craft', href: '#craft', label: 'Craft' },
  { id: 'stack', href: '#stack', label: 'Stack' },
  { id: 'timeline', href: '#timeline', label: 'Experience' },
  { id: 'writing', href: '#writing', label: 'Writing' },
] as const satisfies readonly NavItem[]

/**
 * The standalone pages that have no home-page section. `About` joins the bar (the second page a visitor looks for);
 * `Resume` is secondary and lives in the mobile sheet and the footer only, so the condensed bar stays six pills
 * plus one. Both are real routes, so they are the same on every page.
 */
export const NAV_PAGES = [
  { id: 'about', href: '/about', label: 'About', route: '/about' },
  { id: 'resume', href: '/resume', label: 'Resume', route: '/resume', secondary: true },
] as const satisfies readonly NavPage[]

export type NavPage = NavItem & { readonly secondary?: boolean }

/** `/` is the only route that owns the in-page anchors. `null` (no router, as in a unit test) counts as home. */
export function isHome(pathname: string | null): boolean {
  return pathname === null || pathname === '/'
}

/** `/work` is current on `/work` and `/work/gabar`, but not on `/workshop`. */
export function isCurrentRoute(pathname: string | null, route: string): boolean {
  if (pathname === null) return false
  return pathname === route || pathname.startsWith(`${route}/`)
}

/**
 * Where an item points from the page the visitor is on. On `/` the anchors stay bare (`#lead`), so the smooth scroll
 * and the scroll-spy behave exactly as before; anywhere else a bare anchor would go nowhere, so it becomes
 * root-relative (`/#lead`) and a real page is opened outright.
 */
export function resolveNavHref(item: NavItem, pathname: string | null): string {
  if (!item.href.startsWith('#')) return item.href
  if (isHome(pathname)) return item.href
  return item.route ?? `/${item.href}`
}

/** `"page"` when the visitor is on the route the item opens; the scroll-spy owns the `"true"` mark on `/`. */
export function navCurrentPage(item: NavItem, pathname: string | null): 'page' | undefined {
  if (item.route === undefined) return undefined
  if (isHome(pathname) && item.href.startsWith('#')) return undefined
  return isCurrentRoute(pathname, item.route) ? 'page' : undefined
}

/** Where the monogram and the CTA go: bare on `/`, root-relative elsewhere. */
export function resolveHref(href: string, pathname: string | null): string {
  return href.startsWith('#') && !isHome(pathname) ? `/${href}` : href
}

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
   * Absent ⇒ the route does not exist yet (today only `/lab`), so it ships as
   * an announced, focusable "Coming soon" affordance instead of a 404 trap.
   * Section links are root-relative (`/#work`) so they also work from the deep
   * routes (`/about`, `/work/...`), where a bare `#work` would go nowhere.
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
 * `Lab` is the one href-less entry: `/lab` is Phase 3.
 */
export const FOOTER_COLUMNS = [
  {
    id: 'sections',
    links: [
      { label: 'Work', href: '/work' },
      { label: 'How I lead', href: '/#lead' },
      { label: 'Craft', href: '/#craft' },
      { label: 'Lab' },
    ],
  },
  {
    id: 'more',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Resume', href: '/resume' },
      { label: 'Writing', href: '/#writing' },
      { label: 'Contact', href: '/#contact' },
    ],
  },
] as const satisfies readonly FooterColumn[]
