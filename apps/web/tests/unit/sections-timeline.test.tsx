import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Timeline, type TimelineEntry } from '@/components/sections/Timeline'
import { Writing, type WritingLink } from '@/components/sections/Writing'
import type { Article } from '@/components/cards/ArticleCard'
import { formatMonthYear, formatPeriod } from '@/lib/format-period'

/* --- Fixtures — the reconciliation § 1 roster, not the export's five ------- */

const ENTRIES: readonly TimelineEntry[] = [
  {
    org: 'Data Age',
    title: 'Tech Lead',
    period: { from: '2025-01' },
    location: 'Harare, Zimbabwe',
    highlights: ['Set technical direction and architecture standards.'],
  },
  {
    org: 'Rapidev Labs',
    title: 'Senior Software Engineer',
    period: { from: '2024-01' },
    location: 'Harare, Zimbabwe',
    highlights: ['Design and ship full-stack features end to end.'],
  },
  {
    org: 'Earlier engineering roles',
    title: 'Software Engineer',
    period: { from: '2020-01', to: '2023-12' },
    highlights: ['Built and maintained production web platforms.'],
    placeholder: true,
  },
]

const ARTICLES: readonly Article[] = [
  {
    title: 'Reversible data migrations: dry-run, apply, rollback',
    url: 'https://medium.com/@youngswiesysams',
    date: '2026-03-04',
    source: 'medium',
    excerpt: 'Why every destructive migration should ship with its own undo.',
    placeholder: true,
  },
  {
    title: 'One draw call: holding 60 fps on a mid-range phone',
    url: 'https://medium.com/@youngswiesysams/one-draw-call',
    date: '2026-01-19',
    source: 'medium',
    excerpt: 'Budgeting an instanced mesh so a mid-range Android holds 60 fps.',
  },
]

const PRIMARY: readonly WritingLink[] = [
  { label: 'LinkedIn', url: 'https://linkedin.com/in/wieslaw-samushonga-3b3913154' },
  { label: 'GitHub', url: 'https://github.com/JxstWieslaw' },
]

/* --- formatPeriod --------------------------------------------------------- */

describe('formatPeriod', () => {
  // Content stores YYYY-MM; the rail renders years only (design-home.md § 9).
  it('renders a current role as an open period ending in present', () => {
    expect(formatPeriod({ from: '2025-01' })).toBe('2025 — present')
  })

  it('treats an empty `to` as current rather than as a range', () => {
    expect(formatPeriod({ from: '2024-01', to: '' })).toBe('2024 — present')
  })

  it('renders a closed period as years, dropping the stored month', () => {
    expect(formatPeriod({ from: '2020-01', to: '2023-12' })).toBe('2020 — 2023')
    expect(formatPeriod({ from: '2022-06', to: '2024-02' })).toBe('2022 — 2024')
  })

  it('collapses a period that opens and closes in the same year', () => {
    expect(formatPeriod({ from: '2024-01', to: '2024-11' })).toBe('2024')
  })

  it('accepts both stored granularities — YYYY-MM and YYYY', () => {
    expect(formatPeriod({ from: '2022', to: '2024' })).toBe('2022 — 2024')
    expect(formatPeriod({ from: '2022-06', to: '2024' })).toBe('2022 — 2024')
    expect(formatPeriod({ from: '2022', to: '2024-02' })).toBe('2022 — 2024')
  })
})

describe('formatMonthYear', () => {
  it('renders an article date as month and year, with no timezone shift', () => {
    // `new Date('2026-03-04')` is UTC midnight and renders as Feb west of
    // Greenwich, which is why this formatter never touches Date.
    expect(formatMonthYear('2026-03-04')).toBe('Mar 2026')
    expect(formatMonthYear('2026-01')).toBe('Jan 2026')
  })

  it('falls back to the year rather than inventing a month', () => {
    expect(formatMonthYear('2026')).toBe('2026')
    expect(formatMonthYear('2026-99')).toBe('2026')
  })
})

/* --- Timeline ------------------------------------------------------------- */

describe('Timeline', () => {
  it('is #timeline with the heading Experience, never the export #experience', () => {
    const { container } = render(<Timeline entries={ENTRIES} />)
    const section = container.querySelector('[data-section="timeline"]')

    expect(section).not.toBeNull()
    expect(section).toHaveAttribute('id', 'timeline')
    expect(screen.getByRole('heading', { level: 2, name: 'Experience' })).toHaveAttribute(
      'id',
      'timeline-h'
    )
  })

  // Reconciliation § 5: #timeline and #writing are the quiet zone.
  it('carries no canvas and sits on flat --bg-0', () => {
    const { container } = render(<Timeline entries={ENTRIES} />)
    const section = container.querySelector('[data-section="timeline"]')

    expect(section).toHaveAttribute('data-background', 'bg-0')
    expect(section).not.toHaveAttribute('data-formation')
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('renders every entry with its role line, period and highlights', () => {
    render(<Timeline entries={ENTRIES} />)

    for (const entry of ENTRIES) {
      expect(screen.getByRole('heading', { level: 3, name: entry.org })).toBeInTheDocument()
      expect(screen.getByText(formatPeriod(entry.period))).toBeInTheDocument()
      for (const highlight of entry.highlights) {
        expect(screen.getByText(highlight)).toBeInTheDocument()
      }
    }

    expect(screen.getByText('Tech Lead · Harare, Zimbabwe')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(ENTRIES.length)
  })

  // The reconciliation rejects the export's employment history outright.
  it('never renders the rejected export entries', () => {
    render(<Timeline entries={ENTRIES} />)

    expect(screen.queryByText('Ikarus 3D')).toBeNull()
    expect(screen.queryByText('Virtualize Technologies')).toBeNull()
    expect(screen.queryByText('Baeldung.com')).toBeNull()
  })

  // design-home.md § 9: the last dot loses its glow to read as "fading into
  // the past". That missing box-shadow is the entire effect.
  it('gives the placeholder entry a muted dot with no glow', () => {
    const { container } = render(<Timeline entries={ENTRIES} />)

    const muted = container.querySelectorAll('[data-dot="muted"]')
    const lit = container.querySelectorAll('[data-dot="lit"]')
    expect(muted).toHaveLength(1)
    expect(lit).toHaveLength(2)

    expect(muted[0]).toHaveAttribute('data-tone', 'line')
    expect(muted[0]?.getAttribute('style')).not.toContain('box-shadow')
    for (const dot of lit) {
      expect(dot.getAttribute('style')).toContain('box-shadow')
    }
  })

  it('flags the placeholder entry in the DOM without changing what is read', () => {
    const { container } = render(<Timeline entries={ENTRIES} />)

    expect(container.querySelectorAll('[data-placeholder="true"]')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Earlier engineering roles' })).toBeVisible()
  })
})

/* --- Writing -------------------------------------------------------------- */

describe('Writing', () => {
  it('is #writing on flat --bg-1 with no canvas', () => {
    const { container } = render(<Writing articles={ARTICLES} primaryLinks={PRIMARY} />)
    const section = container.querySelector('[data-section="writing"]')

    expect(section).toHaveAttribute('data-background', 'bg-1')
    expect(section).not.toHaveAttribute('data-formation')
    expect(container.querySelector('canvas')).toBeNull()
  })

  // Reconciliation § 6.8 — the third slot is a component, not a data row.
  it('renders two article cards plus the designed RSS-failure card', () => {
    render(<Writing articles={ARTICLES} primaryLinks={PRIMARY} feedUrl="https://medium.com/@x" />)

    expect(screen.getAllByRole('article')).toHaveLength(2)
    for (const article of ARTICLES) {
      expect(screen.getByRole('link', { name: article.title })).toHaveAttribute(
        'href',
        article.url
      )
    }

    // M0 default: no fetch happens, so the card must not claim one failed.
    expect(screen.getByText('Feed not wired up yet')).toBeInTheDocument()
    expect(screen.queryByText(/didn't respond/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /read on medium/i })).toHaveAttribute(
      'href',
      'https://medium.com/@x'
    )
  })

  /**
   * The export's wording asserts a request that failed. In M0 no request is made, so showing
   * it would be a false claim about the system's own behaviour — the same defect as the
   * contact form reporting "Sent" with no API behind it. The string is retained, gated on the
   * fetch actually having been attempted, so M3 inherits it verbatim.
   */
  it('claims the feed failed only once a fetch has actually been attempted', () => {
    const { unmount } = render(<Writing articles={ARTICLES} primaryLinks={PRIMARY} />)
    expect(screen.queryByText(/didn't respond/)).not.toBeInTheDocument()
    unmount()

    render(<Writing articles={ARTICLES} primaryLinks={PRIMARY} feedAttempted />)
    expect(screen.getByText('RSS unavailable')).toBeInTheDocument()
    expect(
      screen.getByText("The Medium feed didn't respond. Nothing else on the page depends on it.")
    ).toBeInTheDocument()
  })

  it('omits the failure card link when there is no feed URL to offer', () => {
    render(<Writing articles={ARTICLES} primaryLinks={PRIMARY} />)
    expect(screen.queryByRole('link', { name: /read on medium/i })).toBeNull()
  })

  it('dots the date of an unpublished article and leaves published ones alone', () => {
    const { container } = render(<Writing articles={ARTICLES} primaryLinks={PRIMARY} />)

    expect(container.querySelectorAll('.placeholder-text')).toHaveLength(1)
    expect(screen.getByText('Mar 2026')).toHaveClass('placeholder-text')
    expect(screen.getByText(/Jan 2026/)).not.toHaveClass('placeholder-text')
  })

  // The export shipped href="#" for X, Medium, Instagram, Discord, Reddit and
  // Pinterest. A dead affordance is worse than a missing one.
  it('renders only the links that have a real URL', () => {
    render(
      <Writing
        articles={ARTICLES}
        primaryLinks={[...PRIMARY, { label: 'X', url: '#' }]}
        elsewhereLinks={[
          { label: 'Instagram', url: 'https://instagram.com/jxstwieslaw_' },
          { label: 'Discord', url: '' },
          { label: 'Pinterest', url: '   ' },
        ]}
      />
    )

    expect(screen.getByRole('link', { name: 'LinkedIn' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Instagram' })).toBeInTheDocument()

    expect(screen.queryByRole('link', { name: 'X' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Discord' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Pinterest' })).toBeNull()
  })

  it('drops the rail divider when there is no second tier to separate', () => {
    const { container } = render(<Writing articles={ARTICLES} primaryLinks={PRIMARY} />)
    expect(container.querySelector('.w-px')).toBeNull()
  })
})
