'use client'

import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from '@/lib/cx'

/**
 * Mirrors the `md:` breakpoint `.chip-scroller`'s own `md:overflow-visible
 * md:flex-wrap` (`app/globals.css`) switches on. Below it the row is a real
 * `overflow-x: auto` scroll container; at and above it, it wraps and there is
 * nothing to scroll.
 */
const DESKTOP_QUERY = '(min-width: 768px)'

/**
 * The `<ul>` behind `ChipScroller` (`Chip.tsx`).
 *
 * Below 768px this is a genuine `overflow-x: auto` scroll container, and its
 * children (`Chip` in its non-`filter` variants) render as plain, inert
 * `<li>`s — so with no fix, the row is reachable by touch or mouse-drag but
 * has no keyboard path in or out (axe's `scrollable-region-focusable`, WCAG
 * 2.1.1; caught by `tests/e2e/a11y.spec.ts`, `mobile` project only). A tab
 * stop on the `<ul>` fixes that.
 *
 * At and above 768px, `md:overflow-visible md:flex-wrap` removes the scroll
 * container entirely, so the same tab stop lands on an element that scrolls
 * nothing — a dead stop that costs keyboard users a Tab press for no reason.
 * This component removes it there and only there: `scrollable` starts `true`
 * (the safe default — matches the current, passing behaviour before
 * hydration and permanently if JS never runs, so the narrow-viewport fix
 * this exists for can never regress) and flips to `false` once
 * `matchMedia` confirms the viewport is wide enough that there is nothing to
 * scroll.
 *
 * This is the one bit of the chip system that needs the client — everything
 * else `Chip.tsx` renders (including `ChipScroller` itself) stays a plain
 * server component and pays nothing for this.
 */
export function ChipScrollerList({
  children,
  className,
  ...rest
}: {
  children: ReactNode
  className?: string
} & Omit<HTMLAttributes<HTMLUListElement>, 'children' | 'className'>) {
  const [scrollable, setScrollable] = useState(true)

  useEffect(() => {
    // Guarded, not assumed present — jsdom (this repo's unit-test environment)
    // has no `matchMedia`, and skipping here just keeps the safe `true`
    // default rather than crashing the effect.
    if (typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(DESKTOP_QUERY)
    setScrollable(!mql.matches)
    const onChange = (event: MediaQueryListEvent): void => setScrollable(!event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return (
    <ul
      {...rest}
      tabIndex={scrollable ? 0 : undefined}
      className={cx(
        'chip-scroller',
        'md:flex-wrap md:overflow-visible md:pb-0 md:[mask-image:none]',
        className
      )}
    >
      {children}
    </ul>
  )
}
