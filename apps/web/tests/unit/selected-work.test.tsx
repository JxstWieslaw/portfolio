import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProjectCard } from '@/components/cards/ProjectCard'
import {
  BENTO_SPANS,
  SelectedWork,
  type SelectedWorkProject,
} from '@/components/sections/SelectedWork'
import { resetRevealSystem } from '@/components/ui/Reveal'

/**
 * The bento's asymmetry is load-bearing (design-home.md § 5): spans
 * 3,3,4,2,2,3,3 leave a one-column gap at the end of row 3 and a three-column
 * gap at the end of row 4. These tests pin the span map, the AR entry's
 * non-interactive shape, and the visibility wording, because all three are
 * things a well-meaning refactor would "fix".
 */

beforeEach(() => {
  // Structure, not paint: the canvas stays on rung 5 and jsdom's "not
  // implemented" notice stays out of the run.
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

function project(
  slug: string,
  overrides: Partial<SelectedWorkProject> = {}
): SelectedWorkProject {
  return {
    slug,
    name: slug,
    summary: `${slug} summary`,
    stack: ['TypeScript', 'Next.js'],
    visibility: 'public',
    domain: { id: 'developer-tooling', label: 'Developer tooling', accent: 'cyan' },
    ...overrides,
  }
}

const SEVEN: readonly SelectedWorkProject[] = [
  project('gabar', {
    domain: { id: 'interactive-3d', label: 'Interactive 3D', accent: 'cyan' },
  }),
  project('vantage-health-system', {
    visibility: 'private',
    domain: { id: 'healthcare', label: 'Healthcare', accent: 'violet' },
  }),
  project('we-assist-you', {
    visibility: 'private',
    domain: { id: 'social-services', label: 'Social services', accent: 'violet' },
  }),
  project('heycreator', {
    visibility: 'private',
    domain: { id: 'creator-economy', label: 'Creator economy', accent: 'violet' },
  }),
  project('learnx', {
    visibility: 'private',
    domain: { id: 'education', label: 'Education', accent: 'violet' },
  }),
  project('pr-pulse'),
  project('ar-product-visualiser', {
    name: 'AR Product Visualiser',
    placeholder: true,
    placeholderName: '[AR project name]',
    ariaLabel: 'AR case study, in preparation',
    visibility: 'client',
    domain: { id: 'ar-xr', label: 'AR / XR', accent: 'cyan' },
  }),
]

describe('SelectedWork — the bento', () => {
  it('renders seven cards', () => {
    const { container } = render(<SelectedWork projects={SEVEN} />)
    expect(container.querySelectorAll('[data-span]')).toHaveLength(7)
  })

  it('lays them out on the authored 3,3,4,2,2,3,3 spans', () => {
    const { container } = render(<SelectedWork projects={SEVEN} />)
    const spans = Array.from(container.querySelectorAll('[data-span]')).map((cell) =>
      cell.getAttribute('data-span')
    )
    expect(spans).toEqual(['3', '3', '4', '2', '2', '3', '3'])
    expect(BENTO_SPANS).toEqual([3, 3, 4, 2, 2, 3, 3])
  })

  it('applies the span only from 1024 up, one track below it', () => {
    const { container } = render(<SelectedWork projects={SEVEN} />)
    const cells = Array.from(container.querySelectorAll('[data-span]'))
    const classes = cells.map((cell) => cell.className)

    expect(classes[0]).toContain('lg:col-span-3')
    expect(classes[2]).toContain('lg:col-span-4')
    expect(classes[3]).toContain('lg:col-span-2')
    for (const value of classes) expect(value).toContain('col-span-1')
  })

  it('steps the grid 1 → 2 → 6 tracks, and caps the section at the bento width', () => {
    const { container } = render(<SelectedWork projects={SEVEN} />)
    const grid = container.querySelector('[data-span]')?.parentElement
    expect(grid?.className).toContain('grid-cols-1')
    expect(grid?.className).toContain('md:grid-cols-2')
    expect(grid?.className).toContain('lg:grid-cols-6')
    // The only section wider than 1440 — deliberate (design-home.md § 5).
    expect(container.querySelector('[data-width="bento"]')).not.toBeNull()
  })

  /**
   * `/work/[slug]` does not exist in this milestone (reconciliation § 9), so a card without an
   * explicit `href` must not manufacture one. Six 404 traps wearing the design's signature
   * hover glow would be worse than six honest static cards.
   */
  it('links no card by default, because there is nowhere to link to yet', () => {
    render(<SelectedWork projects={SEVEN} />)
    const caseStudyLinks = screen
      .queryAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/work/') === true)
    expect(caseStudyLinks).toHaveLength(0)
  })

  it('links exactly the cards given a real destination', () => {
    const withDestination = SEVEN.map((p) =>
      p.slug === 'pr-pulse' ? { ...p, href: 'https://github.com/JxstWieslaw/PR-Pulse' } : p
    )
    render(<SelectedWork projects={withDestination} />)

    const cardLinks = screen
      .queryAllByRole('link')
      .filter((link) => link.getAttribute('href')?.includes('PR-Pulse') === true)
    expect(cardLinks).toHaveLength(1)
  })

  /**
   * Most of this work is on private client codebases, so for most cards there will never be a
   * public case study — this is not merely a milestone gap. Spec § 3.2 turns that into an offer.
   */
  it('offers an architecture walkthrough instead of a dead arrow', () => {
    render(<SelectedWork projects={SEVEN} />)
    expect(
      screen.getAllByText('Architecture walkthrough on request').length
    ).toBeGreaterThan(0)
  })

  it('leaves the AR entry out of the tab order and announces it instead', () => {
    render(<SelectedWork projects={SEVEN} />)
    const ar = screen.getByLabelText('AR case study, in preparation')

    expect(ar.tagName).toBe('DIV')
    expect(ar.closest('a')).toBeNull()
    expect(within(ar).queryByRole('link')).toBeNull()
    expect(ar).toHaveAttribute('data-placeholder', 'true')
  })

  it('marks the AR entry with the amber In preparation badge and dotted name', () => {
    render(<SelectedWork projects={SEVEN} />)
    const ar = screen.getByLabelText('AR case study, in preparation')

    const badge = within(ar).getByText('In preparation')
    expect(badge).toHaveAttribute('data-status', 'in-preparation')

    const heading = within(ar).getByRole('heading', { level: 3 })
    expect(heading).toHaveTextContent('[AR project name]')
    expect(heading).toHaveClass('placeholder-text')
  })

  it('replaces the AR entry stack with three empty dashed ghosts', () => {
    const { container } = render(<SelectedWork projects={SEVEN} />)
    const ar = screen.getByLabelText('AR case study, in preparation')

    expect(ar.querySelectorAll('.placeholder-ghost')).toHaveLength(3)
    expect(within(ar).queryByText('TypeScript')).toBeNull()
    // The ghosts are decorative, so they are hidden rather than announced.
    for (const ghost of Array.from(container.querySelectorAll('.placeholder-ghost'))) {
      expect(ghost).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('offers /work as a Coming soon affordance rather than a 404 trap', () => {
    render(<SelectedWork projects={SEVEN} />)
    const pill = screen.getByRole('button', { name: /All work/ })

    expect(pill).toHaveAccessibleName(expect.stringContaining('Coming soon'))
    expect(pill).toHaveAttribute('aria-disabled', 'true')
    // aria-disabled, never the attribute: it must stay focusable and announced.
    expect(pill).not.toBeDisabled()
    expect(pill).not.toHaveAttribute('href')
  })

  it('renders nothing past the seventh slot', () => {
    const { container } = render(
      <SelectedWork projects={[...SEVEN, project('purchase-requisition')]} />
    )
    expect(container.querySelectorAll('[data-span]')).toHaveLength(7)
  })
})

describe('ProjectCard', () => {
  it('makes the whole card one link, with no nested interactives', () => {
    render(<ProjectCard {...project('gabar')} size="large" href="/work/gabar" />)
    const card = screen.getByRole('link')

    expect(card).toHaveAttribute('href', '/work/gabar')
    expect(within(card).queryAllByRole('button')).toHaveLength(0)
    expect(within(card).queryAllByRole('link')).toHaveLength(0)
  })

  it('is a plain container, with no arrow, when given no destination', () => {
    render(<ProjectCard {...project('gabar')} size="large" />)

    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Architecture walkthrough on request')).toBeInTheDocument()
    expect(screen.queryByText('Read the case study')).toBeNull()
    expect(screen.queryByText('→')).toBeNull()
  })

  it('renders a private repository as Client codebase, never as Private', () => {
    render(<ProjectCard {...project('vantage', { visibility: 'private' })} />)
    expect(screen.getByText('Client codebase')).toHaveAttribute('data-status', 'client')
    expect(screen.queryByText('Private')).toBeNull()
  })

  it.each([
    ['public', 'Public'],
    ['private', 'Client codebase'],
    ['client', 'Client codebase'],
  ] as const)('labels %s visibility as %s', (visibility, label) => {
    render(<ProjectCard {...project('x', { visibility })} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('takes its glow family from the domain accent', () => {
    const { container: violet } = render(
      <ProjectCard
        {...project('a', {
          domain: { id: 'healthcare', label: 'Healthcare', accent: 'violet' },
        })}
        href="/work/a"
      />
    )
    expect(violet.querySelector('[data-glow]')).toHaveAttribute('data-glow', 'violet')

    cleanup()

    const { container: cyan } = render(
      <ProjectCard
        {...project('b', {
          domain: { id: 'interactive-3d', label: 'Interactive 3D', accent: 'cyan' },
        })}
        href="/work/b"
      />
    )
    expect(cyan.querySelector('[data-glow]')).toHaveAttribute('data-glow', 'cyan')
  })

  /** A hover glow on something that cannot be hovered-to-anywhere is a false affordance. */
  it('carries no glow when there is nothing to click', () => {
    const { container } = render(<ProjectCard {...project('a')} />)
    expect(container.querySelector('[data-glow]')).toBeNull()
  })

  it('keeps the flex spacer that pins tag rows to a common baseline', () => {
    const { container } = render(<ProjectCard {...project('gabar')} size="large" />)
    expect(container.querySelector('ul')).toHaveClass('tech-tag-list')
  })

  it('renders no media container at all when a card has no media', () => {
    const { container } = render(<ProjectCard {...project('gabar')} />)
    expect(container.querySelector('[data-card-media]')).toBeNull()
  })

  it.each(SEVEN.map((entry) => [entry.slug, entry] as const))(
    'renders %s with no empty media container',
    (_slug, entry) => {
      const { container } = render(<ProjectCard {...entry} />)
      expect(container.querySelector('[data-card-media]')).toBeNull()
    }
  )

  it('renders the media slot only when one is supplied', () => {
    const { container } = render(
      <ProjectCard {...project('gabar')} media={<span>poster</span>} />
    )
    const slot = container.querySelector('[data-card-media]')
    expect(slot).not.toBeNull()
    expect(slot).toHaveTextContent('poster')
  })

  it('uses the large size class on the first two cards only', () => {
    const { container } = render(<SelectedWork projects={SEVEN} />)
    const variants = Array.from(container.querySelectorAll('[data-variant]'))
      .filter((node) => node.getAttribute('data-variant')?.startsWith('work-') === true)
      .map((node) => node.getAttribute('data-variant'))

    expect(variants).toEqual([
      'work-large',
      'work-large',
      'work-standard',
      'work-standard',
      'work-standard',
      'work-standard',
    ])
  })
})
