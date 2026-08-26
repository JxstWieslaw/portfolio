import type { ComponentProps } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { COLOPHON, Footer } from '@/components/layout/Footer'

/**
 * The load-bearing case is § 9: `/lab`, `/about` and `/resume` do not exist in
 * this milestone. Linking them ships three 404s; greying them out announces
 * nothing. They must be focusable, disabled and *audibly* unavailable.
 */

const PROFILE = { name: 'Wieslaw Samushonga', location: 'Harare, Zimbabwe' }

function renderFooter(props: Partial<ComponentProps<typeof Footer>> = {}) {
  return render(<Footer {...PROFILE} {...props} />)
}

afterEach(cleanup)

describe('Footer — content', () => {
  it('is a contentinfo landmark', () => {
    renderFooter()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('prints the name and location beside the static 40px mark', () => {
    const { container } = renderFooter()
    expect(screen.getByText('Wieslaw Samushonga · Harare, Zimbabwe')).toBeInTheDocument()

    const mark = container.querySelector('.monogram')
    expect(mark).toHaveAttribute('data-size', 'footer')
    expect(mark).toHaveAttribute('data-interactive', 'false')
    expect(mark).toHaveAttribute('aria-hidden', 'true')
  })

  it('carries the colophon verbatim', () => {
    renderFooter()
    expect(
      screen.getByText(
        'Built with Next.js. The backdrop is a 2D canvas, not a renderer — React Three Fiber and Rapier ship with the WebGL milestone.'
      )
    ).toBeInTheDocument()
    expect(COLOPHON).toBe(
      'Built with Next.js. The backdrop is a 2D canvas, not a renderer — React Three Fiber and Rapier ship with the WebGL milestone.'
    )
  })

  it('closes with the copyright line under a full-width hairline', () => {
    renderFooter()
    const copyright = screen.getByText('© 2026 Wieslaw Samushonga')
    expect(copyright.className).toContain('border-t')
    // A container of its own, so the rule spans the content width rather than
    // one grid column.
    expect(copyright.closest('nav')).toBeNull()
  })

  it('takes the year as a prop rather than reading the clock', () => {
    renderFooter({ year: 2031 })
    expect(screen.getByText('© 2031 Wieslaw Samushonga')).toBeInTheDocument()
  })
})

describe('Footer — navigation', () => {
  it('names its landmark and renders two columns', () => {
    renderFooter()
    const nav = screen.getByRole('navigation', { name: 'Footer' })
    expect(nav.children).toHaveLength(2)
  })

  it('keeps hrefs on every section that exists', () => {
    renderFooter()
    const nav = screen.getByRole('navigation', { name: 'Footer' })
    const live = Array.from(nav.querySelectorAll('a[href]'))
    expect(live.map((link) => link.getAttribute('href'))).toEqual([
      '#work',
      '#lead',
      '#craft',
      '#writing',
      '#contact',
    ])
  })

  // Reconciliation § 1 applies to the footer column too, not just the header.
  it('uses the reconciled label for the leadership section', () => {
    renderFooter()
    const nav = screen.getByRole('navigation', { name: 'Footer' })
    expect(within(nav).getByRole('link', { name: 'How I lead' })).toHaveAttribute('href', '#lead')
    expect(within(nav).queryByRole('link', { name: 'How I work' })).toBeNull()
  })
})

describe('Footer — routes that do not exist yet (§ 9)', () => {
  const unbuilt = ['Lab', 'About', 'Resume']

  it.each(unbuilt)('renders %s as a disabled link with no href', (label) => {
    renderFooter()
    const link = screen.getByRole('link', { name: new RegExp(`^${label}`, 'u') })
    expect(link).toHaveAttribute('aria-disabled', 'true')
    expect(link).not.toHaveAttribute('href')
  })

  it.each(unbuilt)('announces %s as coming soon rather than only greying it', (label) => {
    renderFooter()
    const link = screen.getByRole('link', { name: new RegExp(`^${label}`, 'u') })
    // The badge text is part of the accessible name, so it is announced.
    expect(link).toHaveAccessibleName(`${label} Coming soon`)
  })

  it.each(unbuilt)('keeps %s reachable by keyboard', (label) => {
    renderFooter()
    const link = screen.getByRole('link', { name: new RegExp(`^${label}`, 'u') })
    expect(link).toHaveAttribute('tabindex', '0')
  })

  // Nine focusables: `View perf`, then the eight nav entries. One pass reaches
  // every one of them exactly once, so a disabled link dropping out of the tab
  // order shows up as a missing entry rather than as a wrapped duplicate.
  it('reaches every disabled link by tabbing, in reading order', async () => {
    const user = userEvent.setup()
    renderFooter()
    const reached: string[] = []

    for (let step = 0; step < 9; step += 1) {
      await user.tab()
      const active = document.activeElement
      if (active instanceof HTMLElement && active.dataset['comingSoon'] === 'true') {
        reached.push(active.firstChild?.textContent ?? '')
      }
    }

    expect(reached).toEqual(['View perf', 'Lab', 'About', 'Resume'])
  })

  it('does not ship the export dead `#` on View perf', () => {
    renderFooter()
    const perf = screen.getByRole('link', { name: /view perf/i })
    expect(perf).not.toHaveAttribute('href')
    expect(perf).toHaveAttribute('aria-disabled', 'true')
  })

  it('becomes a real link once a perf page exists', () => {
    renderFooter({ perfHref: '/lab/perf' })
    const perf = screen.getByRole('link', { name: /view perf/i })
    expect(perf).toHaveAttribute('href', '/lab/perf')
    expect(perf).not.toHaveAttribute('aria-disabled')
  })
})

describe('Footer — responsive (§ 3.3)', () => {
  it('stacks to one column below 768 and splits 1fr auto from 768', () => {
    const { container } = renderFooter()
    const grid = container.querySelector('.shell-content')
    expect(grid?.className).toContain('grid-cols-1')
    expect(grid?.className).toContain('md:grid-cols-[1fr_auto]')
  })

  it('holds the footer nav at two columns on mobile and flows to columns at 768', () => {
    renderFooter()
    const nav = screen.getByRole('navigation', { name: 'Footer' })
    expect(nav.className).toContain('grid-cols-2')
    expect(nav.className).toContain('md:grid-flow-col')
    expect(nav.className).toContain('md:gap-x-16')
  })
})
