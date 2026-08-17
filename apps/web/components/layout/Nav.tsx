'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { BottomSheet } from '@/components/layout/BottomSheet'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Monogram } from '@/components/ui/Monogram'
import { cx } from '@/lib/cx'
import { HOME_HREF, NAV_CTA, NAV_ITEMS, type NavCta, type NavItem } from '@/lib/nav-items'

/**
 * The sticky header — design-home.md § 2, with the mobile half authored under
 * reconciliation § 3.3.
 *
 * Everything above 1024px is transcription: 72px tall, condensing to 56px past
 * `scrollY > 24`, `blur(12px)` in both states, background stepping from
 * `rgba(13,17,23,0.35)` to `0.88`, a bottom hairline appearing at `--line-1`,
 * all three properties on the same `320ms cubic-bezier(.2,.8,.2,1)` ramp.
 *
 * Everything below 1024px is new work. The export overflows at 390 by ~120px
 * and ships no hamburger, so § 3.3 replaces the pill row with a menu button and
 * a bottom sheet — bottom-anchored rather than a top drawer so it stays
 * thumb-reachable on a tablet as well as a phone. The CTA never collapses: at
 * every width there is one destination reachable in a single tap.
 *
 * Two behaviours are guarded against scroll thrash. The condense listener is
 * passive and sets a boolean, so React bails out of every scroll event that
 * does not cross the threshold. The scroll-spy scores sections by how much of
 * the observation band each one covers and *never clears* the mark, so the gap
 * between two sections keeps the last answer instead of flickering to none.
 */

/** design-home.md § 2: `window.scrollY > 24`, not the M0 plan's 80. */
const CONDENSE_AT = 24

/**
 * The observation band: from just under the condensed header down to 45% of the
 * viewport. Whichever section covers the most of that band is the current one.
 */
const SPY_ROOT_MARGIN = '-72px 0px -55% 0px'

/** Enough steps that a tall section reports coverage changes as it moves. */
const SPY_THRESHOLDS = [0, 0.05, 0.25, 0.5, 0.75, 1]

const HEADER = [
  'sticky top-0 z-50 h-[72px] border-b border-transparent bg-[rgba(13,17,23,0.35)]',
  'backdrop-blur-[12px]',
  'transition-[height,background-color,border-color] duration-[var(--d-3)] ease-[var(--ease)]',
  'data-[condensed=true]:h-[56px] data-[condensed=true]:border-[var(--line-1)]',
  'data-[condensed=true]:bg-[rgba(13,17,23,0.88)]',
  // § 3.2 principle 5. Applied to the header rather than to `Container`, whose
  // own `padding-inline` is the --page-x gutter and must not be overwritten.
  '[padding-inline:env(safe-area-inset-left)_env(safe-area-inset-right)]',
].join(' ')

/**
 * JetBrains Mono 0.75rem, uppercase, 0.12em, pill, 44px tap target, `0 14px`.
 * Idle `--fg-2`; hover and keyboard focus both reach `--fg-0` over
 * `rgba(255,255,255,0.04)` — reconciliation § 3.2 principle 5 requires every
 * hover to have a focus peer.
 */
const NAV_PILL = [
  'inline-flex min-h-11 items-center whitespace-nowrap rounded-[var(--r-pill)] px-[14px]',
  '[font-family:var(--font-mono)] text-[0.75rem] uppercase tracking-[0.12em]',
  'text-[var(--fg-2)] transition-[color,background-color] duration-[var(--d-1)] ease-[var(--ease)]',
  'hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--fg-0)]',
  'focus-visible:bg-[rgba(255,255,255,0.04)] focus-visible:text-[var(--fg-0)]',
  'aria-[current=true]:bg-[rgba(255,255,255,0.06)] aria-[current=true]:text-[var(--fg-0)]',
].join(' ')

/** The same pill typography at a full-width, 56px row for thumbs. */
const SHEET_ROW = [
  'flex min-h-14 items-center rounded-[var(--r-card)] px-4',
  '[font-family:var(--font-mono)] text-[0.75rem] uppercase tracking-[0.12em]',
  'text-[var(--fg-1)] transition-[color,background-color] duration-[var(--d-1)] ease-[var(--ease)]',
  'hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--fg-0)]',
  'focus-visible:bg-[rgba(255,255,255,0.04)] focus-visible:text-[var(--fg-0)]',
  'aria-[current=true]:bg-[rgba(255,255,255,0.06)] aria-[current=true]:text-[var(--fg-0)]',
].join(' ')

/**
 * `scrollY > 24`. The listener is passive and the state is a boolean, so every
 * scroll event that does not cross the threshold costs one comparison and no
 * render.
 */
function useCondensed(): boolean {
  const [condensed, setCondensed] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setCondensed(window.scrollY > CONDENSE_AT)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  return condensed
}

/**
 * The scroll-spy.
 *
 * Sections are scored by `intersectionRect.height` — the absolute number of
 * pixels of the band each one covers — and NOT by `intersectionRatio`. Ratio is
 * relative to the target's own height, so a 600px section that has just clipped
 * the band outscores a 2000px section that fills it, and the mark jumps
 * backwards on the way down. Coverage is the question actually being asked.
 *
 * The mark is never cleared. When no section covers the band — the gap between
 * two sections, or the very top of the page after the hero — the last answer
 * stands, which is what stops the pills flickering during a fast scroll.
 */
function index(order: ReadonlyMap<string, number>, id: string): number {
  return order.get(id) ?? Number.MAX_SAFE_INTEGER
}

function useActiveSection(items: readonly NavItem[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return

    const targets: HTMLElement[] = []
    for (const item of items) {
      const element = document.getElementById(item.id)
      if (element !== null) targets.push(element)
    }
    if (targets.length === 0) return

    const order = new Map(items.map((item, index) => [item.id, index]))
    const coverage = new Map<string, number>()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) coverage.set(entry.target.id, entry.intersectionRect.height)
          else coverage.delete(entry.target.id)
        }

        let winner: string | null = null
        let best = -1
        for (const [id, covered] of coverage) {
          if (covered > best) {
            winner = id
            best = covered
            continue
          }
          // An exact tie resolves to the earlier section, so the answer never
          // depends on Map insertion order.
          if (covered === best && winner !== null && index(order, id) < index(order, winner)) {
            winner = id
          }
        }

        // React bails out when the id is unchanged, so a fast scroll through a
        // section costs no renders once the winner settles.
        if (winner !== null) setActiveId(winner)
      },
      { rootMargin: SPY_ROOT_MARGIN, threshold: SPY_THRESHOLDS }
    )

    for (const target of targets) observer.observe(target)
    return () => {
      observer.disconnect()
    }
  }, [items])

  return activeId
}

function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M2 4.5h12M2 8h12M2 11.5h12" />
    </svg>
  )
}

export type NavSocialLink = {
  readonly label: string
  readonly url: string
}

export type NavProps = {
  /**
   * The six section pills. Defaults to the reconciled set; overridable so a
   * test can prove the component is driven by data rather than by a literal.
   */
  items?: readonly NavItem[]
  cta?: NavCta
  /** Where the monogram points. `app/layout.tsx` owns `<main id="main">`. */
  homeHref?: string
  /** Only ever the monogram's accessible name; `Monogram` owns the default. */
  name?: string
  /**
   * Rendered in the bottom sheet, which is the only place the socials appear in
   * the header. Shaped to accept `profile.links` entries as-is.
   */
  socialLinks?: readonly NavSocialLink[]
  className?: string
}

const NO_SOCIAL_LINKS: readonly NavSocialLink[] = []

export function Nav({
  items = NAV_ITEMS,
  cta = NAV_CTA,
  homeHref = HOME_HREF,
  name,
  socialLinks = NO_SOCIAL_LINKS,
  className,
}: NavProps) {
  const condensed = useCondensed()
  const activeId = useActiveSection(items)
  const [menuOpen, setMenuOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const sheetId = useId()

  const openMenu = useCallback(() => {
    setMenuOpen(true)
  }, [])
  const closeMenu = useCallback(() => {
    setMenuOpen(false)
  }, [])

  return (
    <header data-condensed={condensed ? 'true' : 'false'} className={cx(HEADER, className)}>
      <Container className="flex h-full items-center justify-between gap-8">
        <Monogram href={homeHref} name={name} size="nav" />

        {/* ≥1024 only. Below that the same six links live in the sheet. */}
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {items.map((item) => (
            <a
              key={item.id}
              href={item.href}
              aria-current={activeId === item.id ? 'true' : undefined}
              className={NAV_PILL}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button href={cta.href} variant="secondary" size="md">
            {cta.label}
          </Button>

          {/*
            Bespoke rather than `<Button variant="icon">`: the sheet has to hand
            focus back to this element, and the primitive deliberately does not
            forward a ref (typing one across its `<a>` | `<button>` union needs
            an unsound cast). It borrows the primitive's chrome by wearing the
            same `btn` / `data-variant` contract.

            The breakpoint sits on a wrapper rather than on the button, so
            `lg:hidden`'s `display:none` never has to argue with the `btn`
            utility's `display:inline-flex` over emit order.
          */}
          <div className="lg:hidden">
            <button
              ref={triggerRef}
              type="button"
              className="btn"
              data-variant="icon"
              aria-label="Open menu"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              aria-controls={sheetId}
              onClick={openMenu}
            >
              <MenuIcon />
            </button>
          </div>
        </div>
      </Container>

      <BottomSheet
        id={sheetId}
        open={menuOpen}
        onClose={closeMenu}
        label="Menu"
        returnFocusTo={triggerRef}
      >
        <nav aria-label="Sections" className="grid gap-1">
          {items.map((item) => (
            <a
              key={item.id}
              href={item.href}
              onClick={closeMenu}
              aria-current={activeId === item.id ? 'true' : undefined}
              className={SHEET_ROW}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {socialLinks.length > 0 ? (
          <div className="grid gap-3">
            <Eyebrow size="sm">Elsewhere</Eyebrow>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {socialLinks.map((link) => (
                <li key={link.url}>
                  <Button
                    href={link.url}
                    variant="secondary"
                    size="md"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={closeMenu}
                  >
                    {link.label}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Button variant="secondary" size="md" onClick={closeMenu} className="w-full">
          Close
        </Button>
      </BottomSheet>
    </header>
  )
}
