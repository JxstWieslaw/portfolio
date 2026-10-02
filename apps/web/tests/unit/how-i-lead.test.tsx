import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Pillar } from '@/components/cards/Pillar'
import {
  HowILead,
  LEAD_PILLARS,
  LEAD_PROCESS,
  Testimonial,
} from '@/components/sections/HowILead'
import { resetRevealSystem } from '@/components/ui/Reveal'

/**
 * Two things are being defended here.
 *
 * 1. The **copy reversal** (reconciliation § 1). The export renamed this
 *    section "How I work", led with "Tested, typed, and shipped with a rollback
 *    plan." and framed the cards as Habit 01/02/03. None of that ships; the
 *    spec's three leadership pillars do.
 * 2. The **testimonial silence** (§ 6.7 and a Global Constraint). No real
 *    quote, no block — not a placeholder, not reserved space, nothing.
 */

beforeEach(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => null,
  })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): [] {
        return []
      }
    }
  )
})

afterEach(() => {
  cleanup()
  resetRevealSystem()
  vi.unstubAllGlobals()
})

describe('HowILead — copy reconciliation', () => {
  it('is the #lead section named How I Lead', () => {
    const { container } = render(<HowILead />)
    const section = container.querySelector('section')

    expect(section).toHaveAttribute('id', 'lead')
    expect(screen.getByText('02 — How I Lead')).toBeInTheDocument()
  })

  it("leads with the spec's H2, not the export's", () => {
    render(<HowILead />)
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: "Accountable for how it's built, not just that it shipped.",
      })
    ).toBeInTheDocument()
    expect(screen.queryByText(/Tested, typed, and shipped with a rollback plan/)).toBeNull()
  })

  it('ships the three reconciled pillar titles plus the AI-native fourth', () => {
    render(<HowILead />)
    const titles = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)

    expect(titles).toEqual(
      expect.arrayContaining([
        'Technical direction',
        'Code review & standards',
        'Mentorship & delivery',
        'AI-native delivery',
      ])
    )
    expect(LEAD_PILLARS.map((pillar) => pillar.title)).toEqual([
      'Technical direction',
      'Code review & standards',
      'Mentorship & delivery',
      'AI-native delivery',
    ])
  })

  // The fourth pillar is concrete about what the agents do and what stays human.
  it('says what the agents do and that decisions and standards stay human', () => {
    const fourth = LEAD_PILLARS[3]
    expect(fourth?.title).toBe('AI-native delivery')
    const body = fourth?.practices.join(' ') ?? ''
    expect(body).toMatch(/code review, security and performance/)
    expect(body).toMatch(/Decisions and standards stay with me/)
    expect(body).not.toMatch(/merges/)
    expect(fourth?.practices).toHaveLength(3)
  })

  it('carries none of the rejected Habit framing', () => {
    render(<HowILead />)
    expect(screen.queryByText(/Habit 0[123]/)).toBeNull()
    expect(screen.queryByText(/How I work/)).toBeNull()
    expect(screen.queryByText('Tested by default')).toBeNull()
    expect(screen.queryByText('Architecture that stays legible')).toBeNull()
    expect(screen.queryByText('Owned to production')).toBeNull()
  })

  it('gives every pillar concrete practices as bullets', () => {
    render(<HowILead />)
    for (const pillar of LEAD_PILLARS) {
      const article = screen.getByRole('heading', { name: pillar.title }).closest('article')
      expect(article).not.toBeNull()
      expect(within(article as HTMLElement).getAllByRole('listitem')).toHaveLength(
        pillar.practices.length
      )
    }
  })

  it('is violet-led and backed by the orbit formation', () => {
    const { container } = render(<HowILead />)
    expect(container.querySelector('section')).toHaveAttribute('data-formation', 'orbit')
    expect(container.querySelector('[data-variant="pillar"]')).toHaveAttribute(
      'data-tone',
      'violet'
    )
  })

  it('stacks pillars to one column below 768, two from 768 and four from 1024', () => {
    const { container } = render(<HowILead />)
    const grid = container.querySelector('[data-variant="pillar"]')?.closest('.flex')
      ?.parentElement
    expect(grid?.className).toContain('grid-cols-1')
    // Four cards in three tracks would orphan one; two-by-two until there is room for four.
    expect(grid?.className).toContain('md:grid-cols-2')
    expect(grid?.className).toContain('lg:grid-cols-4')
  })
})

describe('HowILead — the process rail', () => {
  it('renders the five steps in order', () => {
    render(<HowILead />)
    const steps = screen.getAllByRole('listitem').filter((item) => item.tagName === 'LI')
    const titles = LEAD_PROCESS.map((step) => step.title)

    expect(titles).toEqual([
      'Discovery',
      'Architecture',
      'Delivery cadence',
      'Launch',
      'Operate',
    ])
    for (const title of titles) expect(screen.getByText(title)).toBeInTheDocument()
    expect(steps.length).toBeGreaterThanOrEqual(5)
  })

  it('numbers them 01–05 inside a hairline grid at five tracks from 768', () => {
    const { container } = render(<HowILead />)
    const rail = container.querySelector('ol.hairline')

    expect(rail).not.toBeNull()
    expect(rail?.className).toContain('grid-cols-1')
    expect(rail?.className).toContain('md:grid-cols-5')
    for (const number of ['01', '02', '03', '04', '05']) {
      expect(within(rail as HTMLElement).getByText(number)).toBeInTheDocument()
    }
  })
})

describe('Testimonial — § 6.7', () => {
  it('renders nothing at all when there is no quote', () => {
    const { container } = render(<Testimonial />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the quote is blank', () => {
    const { container } = render(
      <Testimonial testimonial={{ quote: '   ', author: 'A Name', role: 'CTO, Somewhere' }} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders when a real quote exists', () => {
    render(
      <Testimonial
        testimonial={{
          quote: 'He left the codebase easier to work in than he found it.',
          author: 'Jane Doe',
          role: 'Engineering Manager, Data Age',
        }}
      />
    )
    expect(
      screen.getByText('He left the codebase easier to work in than he found it.')
    ).toBeInTheDocument()
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
    expect(screen.getByText(/Engineering Manager, Data Age/)).toBeInTheDocument()
  })

  it('is absent from the section when the owner has supplied no quote', () => {
    const { container } = render(<HowILead />)
    expect(container.querySelector('figure')).toBeNull()
    expect(container.querySelector('blockquote')).toBeNull()
  })

  it('joins the section when a quote is supplied', () => {
    const { container } = render(
      <HowILead
        testimonial={{
          quote: 'Shipped on time, and the handover was already written.',
          author: 'Sam Okoro',
          role: 'Product Lead, Rapidev Labs',
        }}
      />
    )
    expect(container.querySelector('blockquote')).not.toBeNull()
  })
})

describe('Pillar', () => {
  it('separates the border, eyebrow and glyph tints', () => {
    const { container } = render(
      <Pillar
        eyebrow="Pillar 03"
        title="Mentorship & delivery"
        tone="cyan-400"
        eyebrowTone="cyan"
        glyphTone="cyan-400"
        practices={['One', 'Two']}
      />
    )

    expect(container.querySelector('[data-variant="pillar"]')).toHaveAttribute(
      'data-tone',
      'cyan-400'
    )
    expect(container.querySelector('.eyebrow')).toHaveAttribute('data-tone', 'cyan')
    expect(container.querySelectorAll('.bullets-item')).toHaveLength(2)
  })

  it('renders an article, not a link — pillars are not navigable', () => {
    render(<Pillar title="Technical direction" practices={['One']} />)
    expect(screen.getByRole('article')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
