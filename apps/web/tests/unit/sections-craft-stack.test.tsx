import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Craft } from '@/components/sections/Craft'
import { Stack, toneForGroup, type StackGroup } from '@/components/sections/Stack'
import { resetRevealSystem } from '@/components/ui/Reveal'

/**
 * The contract these tests defend is honesty, not appearance.
 *
 * M0 ships no physics engine, no WebGL renderer and no `/lab` route. Three of
 * Craft's controls therefore have to be *about* something that does not exist,
 * and each one has a specific way of not lying:
 *
 *  - the physics toggle owns one piece of state and touches nothing else;
 *  - the AR button is permanently unsupported, and stays focusable and announced;
 *  - the perf HUD reports live figures where it has them and `—` where it does
 *    not, and never the export's placeholder `60.0 / 14.2 ms / 1 / 12 000 / 2`.
 *
 * For Stack the contract is reconciliation § 6.6: the presentation is the
 * export's, the content is the spec's, and none of the eleven rejected JVM
 * technologies may appear — which is also asserted against the real
 * `content/skills.json`, because that is the file that would regress.
 */

const REJECTED = /\b(Java|Kotlin|Spring Boot|Hibernate|JPA|MongoDB|Azure|Nginx|JUnit|Mockito|Jira)\b/

const contentDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'content')

const GROUPS: readonly StackGroup[] = [
  {
    id: 'languages',
    label: 'Languages',
    items: [
      { name: 'TypeScript', level: 'core' },
      { name: 'Python', level: 'working' },
      { name: 'GLSL', level: 'familiar' },
    ],
  },
  {
    id: 'frontend',
    label: 'Frontend',
    items: [
      { name: 'React', level: 'core' },
      { name: 'Zustand', level: 'working' },
      { name: 'dnd-kit', level: 'familiar' },
    ],
  },
  {
    id: 'backend',
    label: 'Backend & Data',
    items: [
      { name: 'Node.js', level: 'core' },
      { name: 'NestJS', level: 'working' },
      { name: 'Apify', level: 'familiar' },
    ],
  },
  {
    id: 'cloud',
    label: 'Cloud & DevOps',
    items: [
      { name: 'Vercel', level: 'core' },
      { name: 'Sentry', level: 'working' },
      { name: 'Cloud Run', level: 'familiar' },
    ],
  },
  {
    id: 'three-d',
    label: '3D & Creative',
    items: [
      { name: 'Three.js', level: 'core' },
      { name: 'Rapier', level: 'working' },
      { name: 'Blender', level: 'familiar' },
    ],
  },
  {
    id: 'practice',
    label: 'Tooling & Practice',
    items: [
      { name: 'Git', level: 'core' },
      { name: 'Vitest', level: 'working' },
      { name: 'Linear', level: 'familiar' },
    ],
  },
]

function stubReducedMotion(matches: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }))
}

/** Places every element well below the fold, so the reveal system must hide it. */
function stubBelowFold(): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        top: 10_000,
        bottom: 10_000,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 10_000,
        toJSON: () => ({}),
      }) as DOMRect
  )
}

beforeEach(() => {
  window.innerHeight = 768
})

afterEach(() => {
  cleanup()
  resetRevealSystem()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/* ── Craft ────────────────────────────────────────────────────────────────── */

describe('Craft — composition', () => {
  it('is the hero mirrored: scatter formation, right-anchored panel, 88vh', () => {
    const { container } = render(<Craft />)

    const section = container.querySelector('#craft')
    expect(section).not.toBeNull()
    expect(section).toHaveAttribute('aria-labelledby', 'craft-h')
    expect(section).toHaveAttribute('data-formation', 'scatter')
    // min-height and the flex anchoring only apply from 768 — § 3.3 gives
    // mobile `min-height: auto` with the panel full-width.
    expect(section?.className).toContain('md:min-h-[88vh]')
    expect(section?.className).toContain('md:items-center')

    expect(container.querySelector('canvas[data-f="scatter"]')).not.toBeNull()
    expect(container.querySelector('[data-variant="craft"]')).not.toBeNull()
  })

  it('sizes the panel as a rail, full-width only below 768', () => {
    const { container } = render(<Craft />)
    const panel = container.querySelector('[data-reveal]')

    expect(panel?.className).toContain('w-full')
    expect(panel?.className).toContain('md:w-[min(60%,460px)]')
    expect(panel?.className).toContain('md:min-w-[320px]')
    expect(panel?.className).toContain('lg:w-[min(38%,460px)]')
  })

  it('carries the cyan top edge rather than the glass highlight', () => {
    const { container } = render(<Craft />)
    expect(container.querySelector('[data-variant="craft"]')).toHaveAttribute(
      'data-tone',
      'cyan-400'
    )
  })

  it('renders the spec copy, not the export copy', () => {
    render(<Craft />)
    expect(
      screen.getByRole('heading', {
        name: 'The thing that surprises people: WebGL that runs at 60 fps on a mid-range phone.',
        level: 2,
      })
    ).toHaveAttribute('id', 'craft-h')
    expect(
      screen.getByText(
        'Rigid-body physics, spatial audio, mobile joystick controls — and the performance budgets that make it viable.'
      )
    ).toBeInTheDocument()
  })

  it('lays the mobile scrim on the vertical axis', () => {
    const { container } = render(<Craft />)
    const scrim = container.querySelector('.md\\:hidden[aria-hidden="true"]')
    expect(scrim).not.toBeNull()
    expect(scrim?.getAttribute('style')).toContain('linear-gradient(180deg')
  })
})

describe('Craft — the physics toggle', () => {
  it('flips aria-pressed and its label, and nothing else', () => {
    const { container } = render(<Craft />)

    const toggle = screen.getByRole('button', { name: 'Enable physics' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toHaveAttribute('data-physics', 'off')

    const nodesBefore = container.querySelectorAll('*').length
    const sectionAttrsBefore = container.querySelector('#craft')?.outerHTML.split('>')[0]

    fireEvent.click(toggle)

    expect(screen.getByRole('button', { name: 'Physics on' })).toBe(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle).toHaveAttribute('data-physics', 'on')

    // "Nothing else": no node was added or removed, the section's own
    // attributes are untouched, the state marker exists in exactly one place,
    // the HUD is still closed and the AR button is still unsupported.
    expect(container.querySelectorAll('*').length).toBe(nodesBefore)
    expect(container.querySelector('#craft')?.outerHTML.split('>')[0]).toBe(sectionAttrsBefore)
    expect(container.querySelectorAll('[data-physics]')).toHaveLength(1)
    expect(container.querySelector('[data-hud]')).toBeNull()
    expect(screen.getByRole('button', { name: /view in ar/i })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
  })

  it('says out loud that nothing is simulating yet', () => {
    render(<Craft />)
    const toggle = screen.getByRole('button', { name: 'Enable physics' })
    const noteId = toggle.getAttribute('aria-describedby')

    expect(noteId).not.toBeNull()
    const note = noteId === null ? null : document.getElementById(noteId)
    expect(note?.textContent).toBe(
      "The physics engine ships in a later milestone — Enable physics and Reset are inert until then, and change nothing but this button’s own label."
    )
  })

  it('never claims work is happening', () => {
    render(<Craft />)
    fireEvent.click(screen.getByRole('button', { name: 'Enable physics' }))
    expect(document.body.textContent).not.toMatch(/simulating|running|loading|calculating/i)
  })

  it('Reset returns the toggle to off unconditionally', () => {
    render(<Craft />)
    const toggle = screen.getByRole('button', { name: 'Enable physics' })

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toHaveTextContent('Enable physics')

    // Reset a second time is a no-op, not a toggle.
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('Craft — the AR button is a designed unsupported state', () => {
  it('is disabled, focusable, titled and badged', () => {
    render(<Craft />)
    const ar = screen.getByRole('button', { name: /view in ar/i })

    expect(ar).toHaveAttribute('aria-disabled', 'true')
    expect(ar).toHaveAttribute('title', 'WebXR is not available in this browser')
    expect(ar).toHaveAttribute('data-variant', 'unsupported')
    expect(within(ar).getByText('Unsupported')).toBeInTheDocument()

    // `disabled` would drop it out of the tab order; reconciliation § 8 requires
    // it stay reachable and announced. So: no `disabled`, no negative tabindex.
    expect(ar).not.toBeDisabled()
    expect(ar).not.toHaveAttribute('tabindex')

    ar.focus()
    expect(document.activeElement).toBe(ar)
  })

  it('announces its state through the accessible name, not only visually', () => {
    render(<Craft />)
    // The badge is inside the button, so "Unsupported" is part of what the
    // control is called — a visitor who cannot see the dashed border is still
    // told the button will not do anything.
    expect(screen.getByRole('button', { name: /view in ar/i })).toHaveAccessibleName(
      /unsupported/i
    )
  })
})

describe('Craft — the perf HUD is honest', () => {
  it('starts closed and is a labelled disclosure', () => {
    const { container } = render(<Craft />)
    const toggle = screen.getByRole('button', { name: 'Perf HUD · off' })

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', 'craft-perf-hud')
    expect(container.querySelector('#craft-perf-hud')).toBeNull()
  })

  it('opens on click and flips the label', () => {
    const { container } = render(<Craft />)
    fireEvent.click(screen.getByRole('button', { name: 'Perf HUD · off' }))

    const toggle = screen.getByRole('button', { name: 'Perf HUD · on' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(container.querySelector('#craft-perf-hud')).not.toBeNull()
  })

  it('reports renderer counters as unmeasured rather than inventing them', () => {
    const { container } = render(<Craft />)
    fireEvent.click(screen.getByRole('button', { name: 'Perf HUD · off' }))

    const hud = container.querySelector('#craft-perf-hud')
    expect(hud).not.toBeNull()

    for (const metric of ['draw-calls', 'instances', 'gpu-tier']) {
      const value = hud?.querySelector(`[data-metric="${metric}"] dd`)
      expect(value, metric).not.toBeNull()
      expect(value).toHaveAttribute('data-measured', 'none')
      expect(value?.textContent).toBe('—')
    }
  })

  it('shows no sample until one has actually been taken', () => {
    const { container } = render(<Craft />)
    fireEvent.click(screen.getByRole('button', { name: 'Perf HUD · off' }))

    const hud = container.querySelector('#craft-perf-hud')
    expect(hud).toHaveAttribute('data-live', 'false')

    for (const metric of ['fps', 'frame']) {
      const value = hud?.querySelector(`[data-metric="${metric}"] dd`)
      expect(value, metric).toHaveAttribute('data-measured', 'none')
      expect(value?.textContent).toBe('—')
    }
  })

  it("never renders the export's placeholder telemetry", () => {
    const { container } = render(<Craft />)
    fireEvent.click(screen.getByRole('button', { name: 'Perf HUD · off' }))

    const text = container.querySelector('#craft-perf-hud')?.textContent ?? ''
    expect(text).not.toMatch(/60\.0/)
    expect(text).not.toMatch(/14\.2/)
    expect(text).not.toMatch(/12\s?000/)
    // The five labels are still all there — the panel is complete, not gutted.
    for (const label of ['fps', 'frame', 'draw calls', 'instances', 'gpu tier']) {
      expect(text).toContain(label)
    }
  })

  it('explains which figures are measured and which are not', () => {
    const { container } = render(<Craft />)
    fireEvent.click(screen.getByRole('button', { name: 'Perf HUD · off' }))

    const text = container.querySelector('#craft-perf-hud')?.textContent ?? ''
    expect(text).toContain('sampled live in this browser')
    expect(text).toContain('they are not measured here')
  })

  it('runs no sampler until the panel is open, and stops it when it closes', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    const caf = vi.spyOn(window, 'cancelAnimationFrame')

    render(<Craft />)
    // Closed is the default, and closed costs nothing — which is the only
    // reason a sampler is allowed to exist in a milestone where nothing but the
    // hero canvas may animate.
    expect(raf).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Perf HUD · off' }))
    expect(raf).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Perf HUD · on' }))
    expect(caf).toHaveBeenCalled()
  })
})

describe('Craft — the lab link', () => {
  it('is a disabled, announced Coming soon affordance while /lab does not exist', () => {
    render(<Craft />)
    const lab = screen.getByRole('button', { name: /open the lab/i })

    expect(lab).toHaveAttribute('aria-disabled', 'true')
    expect(lab).toHaveAttribute('title', 'The lab ships in a later milestone')
    expect(lab).not.toBeDisabled()
    expect(within(lab).getByText('Coming soon')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /open the lab/i })).toBeNull()
  })

  it('becomes a real link the moment a route is supplied', () => {
    render(<Craft labHref="/lab" />)
    expect(screen.getByRole('link', { name: /open the lab/i })).toHaveAttribute('href', '/lab')
    expect(screen.queryByText('Coming soon')).toBeNull()
  })
})

/* ── Stack ────────────────────────────────────────────────────────────────── */

describe('Stack — composition', () => {
  it('owns the grid formation and the What I reach for heading', () => {
    const { container } = render(<Stack groups={GROUPS} />)

    const section = container.querySelector('#stack')
    expect(section).toHaveAttribute('data-formation', 'grid')
    expect(section).toHaveAttribute('aria-labelledby', 'stack-h')
    expect(container.querySelector('canvas[data-f="grid"]')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'What I reach for', level: 2 })).toHaveAttribute(
      'id',
      'stack-h'
    )
    expect(screen.getByText('04 — Stack')).toBeInTheDocument()
  })

  it('steps the outer grid 1fr → 1fr 320px → 1fr 380px', () => {
    const { container } = render(<Stack groups={GROUPS} />)
    const outer = container.querySelector('#stack .grid')

    expect(outer?.className).toContain('items-start')
    expect(outer?.className).toContain('lg:grid-cols-[1fr_320px]')
    expect(outer?.className).toContain('xl:grid-cols-[1fr_380px]')
    expect(outer?.className).toContain('lg:gap-16')
  })

  it('keeps the group grid to one column below 768 and two above', () => {
    const { container } = render(<Stack groups={GROUPS} />)
    const groups = container.querySelector('[data-group="languages"]')?.parentElement

    expect(groups?.className).toContain('grid-cols-1')
    expect(groups?.className).toContain('md:grid-cols-2')
    expect(groups?.className).toContain('gap-y-10')
    expect(groups?.className).toContain('md:gap-x-12')
  })

  it('makes the aside sticky only where it has a column to track', () => {
    const { container } = render(<Stack groups={GROUPS} />)
    const aside = container.querySelector('aside')

    expect(aside?.className).toContain('lg:sticky')
    expect(aside?.className).toContain('lg:top-[120px]')
    // Below 1024 the aside is stacked, so it must not be sticky at all.
    expect(aside?.className).not.toMatch(/(^|\s)sticky/)
  })

  it('is the one glass card without the lit top edge', () => {
    const { container } = render(<Stack groups={GROUPS} />)
    const card = container.querySelector('aside [data-variant="aside"]')

    expect(card).not.toBeNull()
    expect(card).toHaveClass('glass')
    // A tone would repaint the very border-top the aside variant flattens.
    expect(card).not.toHaveAttribute('data-tone')
  })

  it('renders the How I choose note', () => {
    render(<Stack groups={GROUPS} />)
    expect(screen.getByRole('heading', { name: 'How I choose', level: 3 })).toBeInTheDocument()
    expect(screen.getByText(/Default stack: TypeScript end to end/)).toBeInTheDocument()
  })
})

describe('Stack — the six groups', () => {
  it('renders all six with every tier', () => {
    const { container } = render(<Stack groups={GROUPS} />)

    for (const group of GROUPS) {
      const block = container.querySelector(`[data-group="${group.id}"]`)
      expect(block, group.id).not.toBeNull()
      expect(within(block as HTMLElement).getByRole('heading', { level: 3 })).toHaveTextContent(
        group.label
      )

      for (const item of group.items) {
        const chip = within(block as HTMLElement).getByText(item.name)
        expect(chip, `${group.id}/${item.name}`).toHaveAttribute('data-tier', item.level)
        expect(chip).toHaveAttribute('data-variant', 'tier')
        expect(chip.tagName).toBe('LI')
      }
    }

    expect(container.querySelectorAll('[data-group]')).toHaveLength(6)
    expect(container.querySelectorAll('[data-tier="core"]')).toHaveLength(6)
    expect(container.querySelectorAll('[data-tier="working"]')).toHaveLength(6)
    expect(container.querySelectorAll('[data-tier="familiar"]')).toHaveLength(6)
  })

  it('gives each heading a different accent', () => {
    const { container } = render(<Stack groups={GROUPS} />)
    const tones = Array.from(container.querySelectorAll('[data-group] h3')).map((h) =>
      h.getAttribute('data-tone')
    )

    expect(tones).toHaveLength(6)
    expect(new Set(tones).size).toBe(6)
    expect(tones).not.toContain(null)
  })

  it('falls back to a distinct accent for an unknown group id', () => {
    expect(toneForGroup('languages', 3)).toBe('iris')
    const fallbacks = [0, 1, 2, 3, 4, 5].map((position) => toneForGroup(`unknown-${position}`, position))
    expect(new Set(fallbacks).size).toBe(6)
  })

  it('carries the Core / Working / Familiar legend', () => {
    const { container } = render(<Stack groups={GROUPS} />)
    const legend = container.querySelector('.stack-legend')

    expect(legend).not.toBeNull()
    for (const level of ['core', 'working', 'familiar']) {
      expect(legend?.querySelector(`[data-level="${level}"]`), level).not.toBeNull()
    }
    expect(legend?.textContent).toBe('CoreWorkingFamiliar')
  })
})

describe('Stack — reconciliation § 6.6', () => {
  it('holds no skill list of its own — every chip comes from props', () => {
    const { container } = render(<Stack groups={[]} />)

    expect(container.querySelectorAll('[data-group]')).toHaveLength(0)
    expect(container.querySelectorAll('.chip')).toHaveLength(0)
    // The chrome survives: heading, legend and aside are the section, the
    // technologies are the content.
    expect(screen.getByRole('heading', { name: 'What I reach for', level: 2 })).toBeInTheDocument()
    expect(container.querySelector('.stack-legend')).not.toBeNull()
    expect(container.querySelector('#stack')?.textContent ?? '').not.toMatch(REJECTED)
  })

  it('renders the real content file without a single rejected technology', () => {
    const groups = JSON.parse(
      readFileSync(join(contentDir, 'skills.json'), 'utf8')
    ) as StackGroup[]

    expect(groups).toHaveLength(6)

    const { container } = render(<Stack groups={groups} />)
    const text = container.querySelector('#stack')?.textContent ?? ''

    expect(text).not.toMatch(REJECTED)
    expect(text).toContain('TypeScript')
    expect(text).toContain('Next.js')

    for (const group of groups) {
      expect(container.querySelector(`[data-group="${group.id}"]`), group.id).not.toBeNull()
    }
  })
})

/* ── Reduced motion ───────────────────────────────────────────────────────── */

describe('reduced motion', () => {
  it('never hides either section when the visitor asks for less motion', () => {
    stubBelowFold()
    stubReducedMotion(true)

    const craft = render(<Craft />)
    expect(craft.container.querySelector<HTMLElement>('[data-reveal]')?.style.opacity).toBe('')
    cleanup()
    resetRevealSystem()

    const stack = render(<Stack groups={GROUPS} />)
    expect(stack.container.querySelector<HTMLElement>('aside[data-reveal]')?.style.opacity).toBe('')
  })

  it('does hide below-fold content when motion is allowed, so the test above means something', () => {
    stubBelowFold()
    stubReducedMotion(false)

    const { container } = render(<Craft />)
    expect(container.querySelector<HTMLElement>('[data-reveal]')?.style.opacity).toBe('0')
  })
})
