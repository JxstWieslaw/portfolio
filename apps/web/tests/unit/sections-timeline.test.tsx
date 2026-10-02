import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Timeline, groupByOrg, type TimelineEntry } from '@/components/sections/Timeline'
import { Writing, type WritingLink } from '@/components/sections/Writing'
import type { Article } from '@/components/cards/ArticleCard'
import { formatMonthYear, formatPeriod } from '@/lib/format-period'

/* --- Fixtures — one row per role, newest first, as content/experience.json --- */

const ENTRIES: readonly TimelineEntry[] = [
  {
    org: 'Rapidev Labs',
    title: 'Team Lead',
    period: { from: '2026-08' },
    location: 'Harare, Zimbabwe',
    highlights: ['Lead the engineering team while still shipping as a senior engineer.'],
  },
  {
    org: 'Data Age',
    title: 'Tech Lead',
    period: { from: '2026-07' },
    location: 'Harare, Zimbabwe',
    highlights: ['Set technical direction and architecture standards.'],
  },
  {
    org: 'Data Age',
    title: 'Senior Software Engineer',
    period: { from: '2025-01', to: '2026-06' },
    location: 'Harare, Zimbabwe',
    highlights: ['Built and shipped production features end to end.'],
  },
  {
    org: 'Rapidev Labs',
    title: 'Senior Software Engineer',
    period: { from: '2024-01', to: '2026-07' },
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

/* --- groupByOrg ----------------------------------------------------------- */

describe('groupByOrg', () => {
  it('keeps one company per org, in first-appearance (newest-first) order', () => {
    const companies = groupByOrg(ENTRIES)
    expect(companies.map((c) => c.org)).toEqual([
      'Rapidev Labs',
      'Data Age',
      'Earlier engineering roles',
    ])
  })

  it('keeps each company’s roles newest first, so the ladder reads top-down', () => {
    const [rapidev, dataAge] = groupByOrg(ENTRIES)
    expect(rapidev?.roles.map((r) => r.title)).toEqual(['Team Lead', 'Senior Software Engineer'])
    expect(dataAge?.roles.map((r) => r.title)).toEqual(['Tech Lead', 'Senior Software Engineer'])
  })

  it('lifts location and the placeholder flag to the company', () => {
    const companies = groupByOrg(ENTRIES)
    expect(companies[0]?.location).toBe('Harare, Zimbabwe')
    expect(companies[0]?.placeholder).toBe(false)
    expect(companies[2]?.placeholder).toBe(true)
  })

  it('marks a company as placeholder when any of its rows is', () => {
    const mixed: TimelineEntry[] = [
      { org: 'X', title: 'B', period: { from: '2024-01' }, highlights: ['b'] },
      { org: 'X', title: 'A', period: { from: '2022-01', to: '2023-12' }, highlights: ['a'], placeholder: true },
    ]
    expect(groupByOrg(mixed)[0]?.placeholder).toBe(true)
  })

  it('sorts by period, so rows fed out of order produce the same ladder', () => {
    const shuffled = [ENTRIES[3], ENTRIES[4], ENTRIES[1], ENTRIES[0], ENTRIES[2]] as TimelineEntry[]
    const fromShuffled = groupByOrg(shuffled)
    const fromOrdered = groupByOrg(ENTRIES)

    expect(fromShuffled).toEqual(fromOrdered)
    expect(fromShuffled.map((c) => c.org)).toEqual([
      'Rapidev Labs',
      'Data Age',
      'Earlier engineering roles',
    ])
    expect(fromShuffled[0]?.roles.map((r) => r.title)).toEqual([
      'Team Lead',
      'Senior Software Engineer',
    ])
  })

  it('returns nothing for no entries', () => {
    expect(groupByOrg([])).toEqual([])
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

  it('renders each company once, as an h3 with its location, in newest-first order', () => {
    render(<Timeline entries={ENTRIES} />)

    const companies = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(companies).toEqual(['Rapidev Labs', 'Data Age', 'Earlier engineering roles'])
    expect(screen.getAllByText('Harare, Zimbabwe')).toHaveLength(2)
  })

  it('nests a role ladder under each company: one list item per company, roles inside', () => {
    const { container } = render(<Timeline entries={ENTRIES} />)

    const rail = container.querySelector('[data-section="timeline"] ol')
    expect(rail).not.toBeNull()
    // Direct children only: the companies, not the rungs.
    expect(Array.from((rail as HTMLElement).children).map((li) => li.tagName)).toEqual([
      'LI',
      'LI',
      'LI',
    ])

    const ladder = screen.getByRole('list', { name: 'Roles at Data Age' })
    const rungs = within(ladder).getAllByRole('heading', { level: 4 })
    expect(rungs.map((h) => h.textContent)).toEqual(['Tech Lead', 'Senior Software Engineer'])
  })

  it('renders every role’s title, period and highlights', () => {
    render(<Timeline entries={ENTRIES} />)

    // Every role is a rung under its own company: title, period and highlights
    // all inside that company's ladder. Senior Software Engineer appears twice
    // (once per company), which is the point of the ladder.
    for (const entry of ENTRIES) {
      const ladder = screen.getByRole('list', { name: `Roles at ${entry.org}` })
      expect(within(ladder).getByRole('heading', { level: 4, name: entry.title })).toBeVisible()
      expect(within(ladder).getByText(formatPeriod(entry.period))).toBeInTheDocument()
      for (const highlight of entry.highlights) {
        expect(within(ladder).getByText(highlight)).toBeInTheDocument()
      }
    }
    expect(screen.getAllByRole('heading', { level: 4, name: 'Senior Software Engineer' })).toHaveLength(2)
  })

  it('reads a current role as “… — present”, exactly as formatPeriod renders it', () => {
    render(<Timeline entries={ENTRIES} />)

    const rapidev = screen.getByRole('list', { name: 'Roles at Rapidev Labs' })
    expect(within(rapidev).getByText('2026 — present')).toBeInTheDocument()
    const dataAge = screen.getByRole('list', { name: 'Roles at Data Age' })
    expect(within(dataAge).getByText('2026 — present')).toBeInTheDocument()
  })

  // The rail shows he started as a Senior Software Engineer at each company and
  // moved up through the roles and their periods, newest first. The owner asked
  // for the "Promoted to …" label to go (2026-10-02), so no step-up text exists.
  it('marks current and earlier roles by order and period, with no step-up label', () => {
    const { container } = render(<Timeline entries={ENTRIES} />)

    expect(screen.queryByText(/Promoted to/)).toBeNull()

    expect(container.querySelectorAll('[data-rung="current"]')).toHaveLength(3)
    expect(container.querySelectorAll('[data-rung="earlier"]')).toHaveLength(2)
    // The earlier rung sits below the current one in every ladder.
    for (const ladder of Array.from(container.querySelectorAll('ol[aria-label^="Roles at"]'))) {
      const rungs = Array.from(ladder.children).map((li) => li.getAttribute('data-rung'))
      expect(rungs[0]).toBe('current')
      for (const rung of rungs.slice(1)) expect(rung).toBe('earlier')
    }
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
  it('gives the placeholder company a muted dot with no glow', () => {
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
    // A single-role company still gets its ladder, with no step-up label.
    const earlier = screen.getByRole('list', { name: 'Roles at Earlier engineering roles' })
    expect(within(earlier).getByRole('heading', { level: 4 })).toHaveTextContent(
      'Software Engineer'
    )
    expect(within(earlier).queryByText(/Promoted to/)).toBeNull()
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
