import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Hero, HERO_COPY, type HeroKpi } from '@/components/sections/Hero'
import { ProofStrip, type ProofDomain, type ProofKpi } from '@/components/sections/ProofStrip'
import { resetRevealSystem } from '@/components/ui/Reveal'
import { DOMAIN_TINTS } from '@/lib/accent'

/**
 * Task 11 — Hero + Proof strip.
 *
 * Three things are load-bearing here and each is asserted directly:
 *
 * 1. **The copy is the spec's, not the export's.** Reconciliation § 1 reverses
 *    a late editorial pivot; a regression would be invisible to a snapshot and
 *    misrepresent the owner.
 * 2. **Placeholders never read as fact** (§ 1.1). Two of the four proof figures
 *    are soft claims and must carry the marker.
 * 3. **Nothing renders an empty container.** Every slot is optional and every
 *    absent slot must vanish rather than leave a bordered void.
 */

afterEach(() => {
  cleanup()
  resetRevealSystem()
})

const HERO_KPIS: readonly HeroKpi[] = [
  { label: 'Years shipping', value: '5+' },
  { label: 'Domains shipped', value: '7' },
  { label: 'Specialism', value: 'WebGL / real-time 3D' },
]

const DOMAINS: readonly ProofDomain[] = [
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'education', label: 'Education' },
  { id: 'creator-economy', label: 'Creator economy' },
  { id: 'procurement-erp', label: 'Procurement / ERP' },
  { id: 'social-services', label: 'Social services' },
  { id: 'developer-tooling', label: 'Developer tooling' },
  { id: 'interactive-3d', label: 'Interactive 3D' },
  { id: 'ar-xr', label: 'AR / XR' },
]

const PROOF_KPIS: readonly ProofKpi[] = [
  { label: 'Production platforms led/shipped', value: '10', placeholder: true },
  { label: 'Domains shipped', value: '7' },
  { label: 'Roles', value: 'Tech Lead + Senior SWE' },
  { label: 'Concurrent production systems monitored', value: '6', placeholder: true },
]

/**
 * The hero's own stylesheet, wherever React put it — hoisted into `<head>`
 * because it carries a precedence, but found by content so the assertion does
 * not depend on that mechanism.
 */
function heroCss(): string {
  const sheets = Array.from(document.querySelectorAll('style'))
  const sheet = sheets.find((node) => (node.textContent ?? '').includes('.hero-cue-rule'))
  if (sheet === undefined) throw new Error('hero stylesheet not found in the document')
  return sheet.textContent ?? ''
}

/** The body of the first brace-balanced block following `marker`. */
function blockAfter(source: string, marker: string): string {
  const at = source.indexOf(marker)
  if (at === -1) throw new Error(`marker not found: ${marker}`)
  const open = source.indexOf('{', at)
  if (open === -1) throw new Error(`no block opens after: ${marker}`)
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    const char = source[i]
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  throw new Error(`unbalanced block after: ${marker}`)
}

describe('Hero — structure', () => {
  it('is a 100dvh flex region named by its own h1, with no divider above it', () => {
    const { container } = render(<Hero kpis={HERO_KPIS} />)

    const section = container.querySelector('section')
    expect(section).not.toBeNull()
    expect(section).toHaveAttribute('id', 'hero')
    expect(section).toHaveAttribute('aria-labelledby', 'hero-h')
    // The hero is the one section with no hairline above it.
    expect(section).toHaveAttribute('data-divider', 'false')
    expect(section).toHaveClass('hero-shell')

    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('id', 'hero-h')

    const css = heroCss()
    expect(blockAfter(css, '.hero-shell')).toContain('min-height: 100dvh')
    expect(blockAfter(css, '.hero-shell')).toContain('align-items: center')
    // dvh, never vh — reconciliation § 3.2 principle 5.
    expect(css).not.toContain('100vh')
  })

  it('owns the monolith formation and its backdrop', () => {
    const { container } = render(<Hero kpis={HERO_KPIS} />)

    expect(container.querySelector('section')).toHaveAttribute('data-formation', 'monolith')
    expect(container.querySelector('canvas')).toHaveAttribute('data-f', 'monolith')
  })

  it('puts the copy in a glass panel and the KPIs inside it, above the border-top', () => {
    const { container } = render(<Hero kpis={HERO_KPIS} />)

    const panel = container.querySelector('.glass')
    expect(panel).not.toBeNull()
    expect(panel).toHaveAttribute('data-variant', 'panel')
    // 24 / 40 / 48px — the § 3.3 padding steps.
    expect(panel).toHaveClass('p-6', 'md:p-10', 'lg:p-12')

    // The KPI <dl> is a descendant of the panel, not a sibling of it.
    const group = container.querySelector('dl.kpi-group')
    expect(group).not.toBeNull()
    expect(panel?.contains(group as Node)).toBe(true)
    expect(within(panel as HTMLElement).getAllByRole('definition')).toHaveLength(3)
  })

  it('authors the responsive panel widths the export never had', () => {
    render(<Hero kpis={HERO_KPIS} />)
    const css = heroCss()

    expect(blockAfter(css, '.hero-panel')).toContain('width: 100%')
    expect(css).toContain('@media (width >= 768px)  { .hero-panel { width: min(72%, 560px); } }')
    expect(css).toContain('@media (width >= 1024px) { .hero-panel { width: min(56%, 700px); } }')
    expect(css).toContain('@media (width >= 2560px) { .hero-panel { width: min(40%, 640px); } }')

    // Bottom-anchored below 768, centred from 768 up.
    expect(blockAfter(css, '.hero-inner')).toContain('align-items: flex-end')
    expect(css).toContain('.hero-inner { align-items: center; }')

    // env(safe-area-inset-*) on every edge that can meet a notch or home bar.
    expect(css).toContain('env(safe-area-inset-bottom, 0px)')
    expect(css).toContain('env(safe-area-inset-left, 0px)')
    expect(css).toContain('env(safe-area-inset-right, 0px)')
  })

  it('flips the scrim to vertical below 768 and switches it off above', () => {
    const { container } = render(<Hero kpis={HERO_KPIS} />)

    const scrim = container.querySelector('.hero-mobile-scrim')
    expect(scrim).not.toBeNull()
    // Decorative: it must never reach the accessibility tree.
    expect(scrim).toHaveAttribute('aria-hidden', 'true')

    const css = heroCss()
    expect(blockAfter(css, '.hero-mobile-scrim')).toContain('linear-gradient(')
    expect(css).toContain('.hero-mobile-scrim { display: none; }')
  })
})

describe('Hero — copy', () => {
  it('renders the reconciliation § 1 copy in every slot', () => {
    render(<Hero kpis={HERO_KPIS} />)

    expect(
      screen.getByText(
        'Tech Lead @ Data Age · Senior Software Engineer @ Rapidev Labs · Harare, Zimbabwe'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'I lead teams that ship production software — and I make the web move.',
      })
    ).toBeInTheDocument()
    expect(screen.getByText(/Hospital operations, learning platforms/)).toBeInTheDocument()
    expect(screen.getByText(/real-time 3D on the web that holds frame rate/)).toBeInTheDocument()

    expect(screen.getByRole('link', { name: 'See the work' })).toHaveAttribute('href', '#work')
    expect(screen.getByRole('link', { name: "Let's talk" })).toHaveAttribute('href', '#contact')
  })

  it('never ships the export copy the owner rejected', () => {
    const { container } = render(<Hero kpis={HERO_KPIS} />)
    const text = container.textContent ?? ''

    for (const rejected of [
      'I build production software, end to end',
      'Software Engineer @ Data Age',
      'Full Stack Engineer',
      '6+ years',
      'Spring Boot microservices',
    ]) {
      expect(text).not.toContain(rejected)
    }
  })

  it('lets the caller pass profile content through instead of the defaults', () => {
    render(
      <Hero
        eyebrow="Custom eyebrow"
        headline="Custom headline"
        sub="Custom sub"
        kpis={HERO_KPIS}
        primaryCta={{ label: 'Go', href: '#elsewhere' }}
      />
    )

    expect(screen.getByText('Custom eyebrow')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Custom headline' })).toBeInTheDocument()
    expect(screen.getByText('Custom sub')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go' })).toHaveAttribute('href', '#elsewhere')
  })

  it('keeps HERO_COPY aligned with the canonical strings', () => {
    expect(HERO_COPY.eyebrow).toBe(
      'Tech Lead @ Data Age · Senior Software Engineer @ Rapidev Labs · Harare, Zimbabwe'
    )
    expect(HERO_COPY.headline).toBe(
      'I lead teams that ship production software — and I make the web move.'
    )
    expect(HERO_COPY.scrollCue.ariaLabel).toContain(HERO_COPY.scrollCue.label)
  })
})

describe('Hero — KPIs', () => {
  it('renders the trio it is handed, including the derived domain count', () => {
    render(<Hero kpis={HERO_KPIS} />)

    expect(screen.getByText('Years shipping')).toBeInTheDocument()
    expect(screen.getByText('5+')).toBeInTheDocument()
    // The derived figure is resolved upstream; the hero renders the value it
    // is given and never recomputes it.
    expect(screen.getByText('Domains shipped')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('WebGL / real-time 3D')).toBeInTheDocument()
  })

  it('renders a different derived value without any hardcoded fallback', () => {
    render(<Hero kpis={[{ label: 'Domains shipped', value: '9' }]} />)

    expect(screen.getByText('9')).toBeInTheDocument()
    expect(screen.queryByText('7')).not.toBeInTheDocument()
  })

  it('marks a placeholder KPI in the DOM and underlines it outside production', () => {
    const { container } = render(
      <Hero kpis={[{ label: 'Years shipping', value: '5+', placeholder: true }]} />
    )

    const tile = container.querySelector('.kpi[data-placeholder="true"]')
    expect(tile).not.toBeNull()
    expect(within(tile as HTMLElement).getByText('5+')).toHaveClass('placeholder-text')
  })

  it('does not mark a verified KPI', () => {
    const { container } = render(<Hero kpis={HERO_KPIS} />)

    expect(container.querySelector('.kpi[data-placeholder="true"]')).toBeNull()
    expect(container.querySelector('.placeholder-text')).toBeNull()
  })
})

describe('Hero — the scroll cue', () => {
  it('is a real link, keyboard reachable, with an accessible name', () => {
    render(<Hero kpis={HERO_KPIS} />)

    const cue = screen.getByRole('link', { name: 'Scroll to content' })
    expect(cue.tagName).toBe('A')
    expect(cue).toHaveAttribute('href', '#proof')
    // A real href is what makes it tabbable; nothing here is a scroll handler.
    expect(cue).not.toHaveAttribute('tabindex')
    expect(cue).toHaveTextContent('Scroll')
  })

  it('animates its rule on a 2.4s loop and hides that rule from assistive tech', () => {
    const { container } = render(<Hero kpis={HERO_KPIS} />)

    expect(container.querySelector('.hero-cue-rule')).toHaveAttribute('aria-hidden', 'true')

    const css = heroCss()
    expect(blockAfter(css, '.hero-cue-rule')).toContain(
      'animation: hero-scroll-cue 2.4s ease-in-out infinite'
    )

    const frames = blockAfter(css, '@keyframes hero-scroll-cue')
    expect(frames).toContain('translateY(6px)')
    expect(frames).toContain('opacity: 0.5')
  })

  it('is static under prefers-reduced-motion', () => {
    render(<Hero kpis={HERO_KPIS} />)
    const css = heroCss()

    const reduced = blockAfter(css, '@media (prefers-reduced-motion: reduce)')
    expect(reduced).toContain('.hero-cue-rule')
    expect(blockAfter(reduced, '.hero-cue-rule')).toContain('animation: none')

    // The kill lives in CSS, not JavaScript: a script-based check would let the
    // animation run for a frame before stopping it, and would not run at all
    // without JS.
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('can be omitted entirely', () => {
    const { container } = render(<Hero kpis={HERO_KPIS} scrollCue={null} />)

    expect(container.querySelector('.hero-cue')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Scroll to content' })).not.toBeInTheDocument()
  })
})

describe('Hero — missing optional data', () => {
  it('renders no empty containers when every optional slot is absent', () => {
    const { container } = render(
      <Hero eyebrow="" sub="" kpis={[]} primaryCta={null} secondaryCta={null} scrollCue={null} />
    )

    expect(container.querySelector('.hero-eyebrow')).toBeNull()
    expect(container.querySelector('.hero-sub')).toBeNull()
    // The bordered <dl> is the one that would read as a design bug if empty.
    expect(container.querySelector('dl.kpi-group')).toBeNull()
    expect(container.querySelector('.hero-ctas')).toBeNull()
    expect(container.querySelector('.hero-cue')).toBeNull()

    // The panel and the heading always survive — the h1 names the region.
    expect(container.querySelector('.glass')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('keeps the button row when only one CTA is supplied', () => {
    const { container } = render(<Hero kpis={HERO_KPIS} secondaryCta={null} />)

    expect(container.querySelector('.hero-ctas')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'See the work' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: "Let's talk" })).not.toBeInTheDocument()
  })
})

describe('Hero — server rendering', () => {
  /**
   * The hero is the LCP section and a server component. Its stylesheet is a
   * hoistable resource rather than a rule in `globals.css`, so the streaming
   * renderer — the one Next actually uses — is where that mechanism has to be
   * proven. If it were ever dropped the hero would ship unstyled and every
   * jsdom assertion above would still pass.
   */
  it('emits the copy and the stylesheet through the streaming renderer', async () => {
    const { renderToReadableStream } = await import('react-dom/server')
    const stream = await renderToReadableStream(<Hero kpis={HERO_KPIS} />)
    await stream.allReady

    const html = await new Response(stream).text()

    expect(html).toContain('I lead teams that ship production software')
    expect(html).toContain('min-height: 100dvh')
    expect(html).toContain('animation: hero-scroll-cue 2.4s ease-in-out infinite')
    expect(html).toContain('@media (prefers-reduced-motion: reduce)')
    expect(html).toContain('href="#proof"')
  })
})

describe('ProofStrip — structure', () => {
  it('is named by aria-label, uses the fixed 48px padding and owns the stream formation', () => {
    const { container } = render(<ProofStrip domains={DOMAINS} kpis={PROOF_KPIS} />)

    const section = container.querySelector('section')
    expect(section).toHaveAttribute('id', 'proof')
    // No visible heading, so aria-label rather than aria-labelledby.
    expect(section).toHaveAttribute('aria-label', 'Domains and figures')
    expect(section).not.toHaveAttribute('aria-labelledby')
    expect(section).toHaveAttribute('data-formation', 'stream')
    expect(container.querySelector('canvas')).toHaveAttribute('data-f', 'stream')

    // The one section that does not use --section-y.
    expect(container.querySelector('.section-inner')).toHaveAttribute('data-pad', 'compact')
  })

  it('renders the tiles in a hairline grid: two tracks below 768, four above', () => {
    const { container } = render(<ProofStrip domains={DOMAINS} kpis={PROOF_KPIS} />)

    const grid = container.querySelector('dl.hairline')
    expect(grid).not.toBeNull()
    expect(grid).toHaveClass('grid-cols-2', 'md:grid-cols-4')
    expect(within(grid as HTMLElement).getAllByRole('definition')).toHaveLength(4)
    expect(grid?.querySelectorAll('.kpi[data-variant="proof"]')).toHaveLength(4)
  })

  it('reveals the tile grid as one unit', () => {
    const { container } = render(<ProofStrip domains={DOMAINS} kpis={PROOF_KPIS} />)

    const revealed = container.querySelector('[data-reveal]')
    expect(revealed).not.toBeNull()
    expect(revealed?.querySelector('dl.hairline')).not.toBeNull()
  })
})

describe('ProofStrip — domain chips', () => {
  it('renders all eight as a scroll-snap row, tinted per lib/accent.ts', () => {
    const { container } = render(<ProofStrip domains={DOMAINS} kpis={PROOF_KPIS} />)

    // `tabIndex={0}` is `ChipScroller`'s fix for axe's
    // `scrollable-region-focusable`: below 768px this is a real
    // `overflow-x: auto` container whose children are inert `<li>`s, so
    // without a focusable stop of its own a keyboard user has no way to reach
    // or scroll it. The role stays the `<ul>`'s implicit `list` (rather than
    // overriding to `role="region"`, which orphans the `<li>` children from a
    // list-rooted ARIA tree and trips axe's `listitem` rule instead) — `list`
    // is already the correct, accessibly-named ("Domains shipped in" via
    // `aria-label`) description of eight domain names. See `components/ui/Chip.tsx`.
    const list = screen.getByRole('list', { name: 'Domains shipped in' })
    expect(list).toHaveAttribute('tabindex', '0')
    expect(list).toHaveClass('chip-scroller')
    // § 3.4 — a scroller below 768, wrapping from 768 up. Not a marquee.
    expect(list).toHaveClass('md:flex-wrap', 'md:overflow-visible')

    const chips = container.querySelectorAll('li.chip')
    expect(chips).toHaveLength(8)

    for (const domain of DOMAINS) {
      const chip = screen.getByText(domain.label)
      expect(chip).toHaveAttribute('data-variant', 'domain')
      // lg is the 7px 12px proof-strip size.
      expect(chip).toHaveAttribute('data-size', 'lg')
    }

    // The tint is handed to the stylesheet as a custom property, never a hex.
    const healthcare = screen.getByText('Healthcare')
    expect(healthcare.style.getPropertyValue('--chip-tint')).toBe('var(--accent-emerald)')
    expect(screen.getByText('Interactive 3D').style.getPropertyValue('--chip-tint')).toBe(
      'var(--accent-cyan)'
    )
    // Documented hues, for the record.
    expect(DOMAIN_TINTS.healthcare).toBe('#6EE7B7')
  })

  it('falls back to violet for an id the tint map does not know', () => {
    render(<ProofStrip domains={[{ id: 'quantum-basket-weaving', label: 'Unknown' }]} />)

    expect(screen.getByText('Unknown').style.getPropertyValue('--chip-tint')).toBe(
      'var(--accent-violet)'
    )
  })
})

describe('ProofStrip — figures', () => {
  it('renders every label and value it is handed', () => {
    render(<ProofStrip domains={DOMAINS} kpis={PROOF_KPIS} />)

    expect(screen.getByText('Production platforms led/shipped')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('Roles')).toBeInTheDocument()
    expect(screen.getByText('Tech Lead + Senior SWE')).toBeInTheDocument()
    expect(screen.getByText('Concurrent production systems monitored')).toBeInTheDocument()
  })

  it('renders the derived domain count from the value it is passed', () => {
    render(<ProofStrip kpis={[{ label: 'Domains shipped', value: '7' }]} />)
    expect(screen.getByText('7')).toBeInTheDocument()

    cleanup()

    render(<ProofStrip kpis={[{ label: 'Domains shipped', value: '8' }]} />)
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.queryByText('7')).not.toBeInTheDocument()
  })

  it('marks both soft claims and leaves the verified figures unmarked', () => {
    const { container } = render(<ProofStrip domains={DOMAINS} kpis={PROOF_KPIS} />)

    const marked = container.querySelectorAll('.kpi[data-placeholder="true"]')
    expect(marked).toHaveLength(2)

    // Reconciliation § 1.1 / spec § 5.7 — visually identifiable in development.
    for (const tile of Array.from(marked)) {
      expect(tile.querySelector('.placeholder-text')).not.toBeNull()
    }

    expect(screen.getByText('Tech Lead + Senior SWE')).not.toHaveClass('placeholder-text')
  })

  it('never presents the export figures the reconciliation removed', () => {
    const { container } = render(<ProofStrip domains={DOMAINS} kpis={PROOF_KPIS} />)
    const text = container.textContent ?? ''

    expect(text).not.toContain('Ikarus 3D')
    expect(text).not.toContain('Virtualize')
  })
})

describe('ProofStrip — missing optional data', () => {
  it('renders no chip list when there are no domains', () => {
    const { container } = render(<ProofStrip kpis={PROOF_KPIS} />)

    expect(container.querySelector('ul.chip-scroller')).toBeNull()
    expect(container.querySelector('dl.hairline')).not.toBeNull()
  })

  it('renders no hairline grid when there are no figures', () => {
    const { container } = render(<ProofStrip domains={DOMAINS} />)

    // An empty bordered grid is the exact failure the empty-slot rule exists
    // to prevent.
    expect(container.querySelector('dl.hairline')).toBeNull()
    expect(container.querySelectorAll('li.chip')).toHaveLength(8)
  })

  it('renders the section shell and nothing else when both are absent', () => {
    const { container } = render(<ProofStrip />)

    const inner = container.querySelector('.section-inner')
    expect(inner).not.toBeNull()
    expect(inner?.children).toHaveLength(0)
    expect(container.querySelector('section')).toHaveAttribute('aria-label', 'Domains and figures')
  })
})
