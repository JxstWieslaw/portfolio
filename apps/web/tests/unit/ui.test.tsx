import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from '@/components/ui/Badge'
import { BulletList } from '@/components/ui/BulletList'
import { Button } from '@/components/ui/Button'
import { Chip, ChipScroller } from '@/components/ui/Chip'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { GlassCard } from '@/components/ui/GlassCard'
import { HairlineCell, HairlineGrid } from '@/components/ui/HairlineGrid'
import { KpiGroup, KpiTile } from '@/components/ui/KpiTile'
import { Monogram } from '@/components/ui/Monogram'
import {
  PlaceholderCard,
  PlaceholderGhost,
  PlaceholderText,
} from '@/components/ui/PlaceholderCard'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { StackLegend } from '@/components/ui/StackLegend'
import { TechTag, TechTagList } from '@/components/ui/TechTag'

// jsdom replaces the global URL class, which node:fs will not accept, so the
// path is resolved through node:path.
const appDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app')
const css = readFileSync(join(appDir, 'globals.css'), 'utf8')

/** Returns the body of the first brace-balanced block following `marker`. */
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

describe('Button', () => {
  it('renders a link when href is provided', () => {
    render(<Button href="#work">See the work</Button>)
    expect(screen.getByRole('link', { name: 'See the work' })).toHaveAttribute('href', '#work')
  })

  it('renders a button element otherwise', () => {
    render(<Button>Send</Button>)
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  })

  it.each(['primary', 'secondary', 'ghost', 'icon'] as const)('renders the %s variant', (variant) => {
    render(<Button variant={variant}>Label</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', variant)
  })

  it.each(['lg', 'md'] as const)('renders the %s size', (size) => {
    render(<Button size={size}>Label</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-size', size)
  })

  it('meets the 44px minimum tap target on every button', () => {
    render(<Button>Send</Button>)
    expect(screen.getByRole('button')).toHaveClass('btn')
    expect(blockAfter(css, '@utility btn ')).toContain('min-height: 44px')
  })

  it('announces the loading state and blocks activation', () => {
    render(
      <Button loading loadingLabel="Sending…">
        Send
      </Button>
    )
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveAttribute('data-loading', 'true')
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Sending…')
  })

  it('never renders an anchor for a disabled or loading action', () => {
    render(
      <Button href="#work" disabled>
        See the work
      </Button>
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('applies the disabled state', () => {
    render(<Button disabled>Send</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  // Reconciliation § 8: the unsupported state is a designed graceful
  // degradation. It must stay focusable and announced, so it uses
  // aria-disabled and never the disabled attribute.
  it('keeps the unsupported variant focusable and announced', () => {
    render(
      <Button variant="unsupported" title="WebXR is not available in this browser">
        View in AR
      </Button>
    )
    const button = screen.getByRole('button', { name: /view in ar/i })
    expect(button).toHaveAttribute('data-variant', 'unsupported')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    expect(button).toHaveAttribute('title', 'WebXR is not available in this browser')
    expect(button).toHaveTextContent('Unsupported')
  })
})

describe('Chip', () => {
  it('renders its label', () => {
    render(<Chip>TypeScript</Chip>)
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
  })

  it('tints the domain variant from the brand accent, not from a hardcoded hex', () => {
    render(
      <Chip variant="domain" tone="emerald">
        Healthcare
      </Chip>
    )
    const chip = screen.getByText('Healthcare')
    expect(chip).toHaveAttribute('data-variant', 'domain')
    expect(chip.getAttribute('style')).toContain('--chip-tint: var(--accent-emerald)')
  })

  it.each(['core', 'working', 'familiar'] as const)('renders the %s stack tier', (tier) => {
    render(<Chip variant="tier" tier={tier}>{tier}</Chip>)
    expect(screen.getByText(tier)).toHaveAttribute('data-tier', tier)
  })

  it('marks the cyan-highlight tier used only by 3D & creative', () => {
    render(
      <Chip variant="tier" tier="core" highlight>
        Three.js
      </Chip>
    )
    expect(screen.getByText('Three.js')).toHaveAttribute('data-highlight', 'true')
  })

  it('renders the filter variant as a pressed-state button', () => {
    render(
      <Chip variant="filter" selected>
        Healthcare
      </Chip>
    )
    const chip = screen.getByRole('button', { name: 'Healthcare' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(chip).toHaveAttribute('data-selected', 'true')
  })

  it.each(['sm', 'md', 'lg'] as const)('renders the %s size', (size) => {
    render(<Chip size={size}>Label</Chip>)
    expect(screen.getByText('Label')).toHaveAttribute('data-size', size)
  })

  // Reconciliation § 3.4 — a scroll-snap row on mobile, not a marquee.
  it('scrolls the domain row on mobile and wraps it from 768 up', () => {
    const { container } = render(
      <ChipScroller>
        <Chip as="li" variant="domain" tone="emerald">
          Healthcare
        </Chip>
      </ChipScroller>
    )
    const row = container.firstElementChild
    expect(row?.tagName).toBe('UL')
    expect(row).toHaveClass('chip-scroller')
    expect(row).toHaveClass('md:flex-wrap')

    const scroller = blockAfter(css, '@utility chip-scroller ')
    expect(scroller).toContain('overflow-x: auto')
    expect(scroller).toContain('scroll-snap-type: x proximity')
    expect(scroller).toContain('mask-image')
    expect(scroller).not.toContain('animation')
  })
})

describe('Badge', () => {
  it.each([
    ['public', 'Public'],
    ['client', 'Client codebase'],
    ['private', 'Private'],
    ['in-preparation', 'In preparation'],
  ] as const)('renders %s as "%s"', (status, label) => {
    render(<Badge status={status} />)
    const badge = screen.getByText(label)
    expect(badge).toHaveAttribute('data-status', status)
  })

  // Reconciliation § 6.11 — the fourth state is amber.
  it('paints the fourth state in --warning', () => {
    render(<Badge status="in-preparation" />)
    expect(screen.getByText('In preparation')).toHaveAttribute('data-status', 'in-preparation')
    expect(blockAfter(css, "&[data-status='in-preparation']")).toContain('color: var(--warning)')
  })
})

describe('KpiTile', () => {
  it('renders label and value', () => {
    render(
      <KpiGroup>
        <KpiTile label="Domains shipped" value="7" />
      </KpiGroup>
    )
    expect(screen.getByText('Domains shipped')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it.each(['hero', 'proof'] as const)('renders the %s variant', (variant) => {
    const { container } = render(
      <KpiGroup>
        <KpiTile label="Roles" value="Tech Lead" variant={variant} />
      </KpiGroup>
    )
    expect(container.querySelector('.kpi')).toHaveAttribute('data-variant', variant)
  })

  it('marks placeholder values in the DOM without changing what the visitor reads', () => {
    const { container } = render(
      <KpiGroup>
        <KpiTile label="Platforms" value="10" placeholder />
      </KpiGroup>
    )
    expect(container.querySelector('[data-placeholder="true"]')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeVisible()
  })

  // Reconciliation § 6.4 — the M0 plan's `border-l pl-4` is wrong for both.
  it('gives neither variant a left border', () => {
    const kpi = blockAfter(css, '@utility kpi ')
    expect(kpi).not.toContain('border-left')
  })
})

describe('Monogram', () => {
  it('derives initials from a full name', () => {
    render(<Monogram name="Wieslaw Samushonga" />)
    expect(screen.getByText('WS')).toBeInTheDocument()
  })

  it('is decorative when it stands in for a missing image', () => {
    const { container } = render(<Monogram name="Wieslaw Samushonga" />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('becomes an interactive, named link when given an href', () => {
    render(<Monogram name="Wieslaw Samushonga" href="#main" />)
    const link = screen.getByRole('link', { name: 'Wieslaw Samushonga — home' })
    expect(link).toHaveAttribute('data-interactive', 'true')
    expect(link).toHaveAttribute('data-size', 'nav')
  })

  it('renders the 40px static footer size', () => {
    const { container } = render(<Monogram size="footer" />)
    expect(container.firstElementChild).toHaveAttribute('data-size', 'footer')
  })

  // Reconciliation § 6.3 / § 2 — a gradient here would be a fourth placement.
  it('is an outlined box and never a gradient tile', () => {
    const monogram = blockAfter(css, '@utility monogram ')
    expect(monogram).toContain('border: 1px solid var(--line-2)')
    expect(monogram).toContain('border-radius: var(--r-card)')
    expect(monogram).toContain("font-variation-settings: 'wdth' 90")
    expect(monogram).not.toContain('gradient')
  })
})

describe('GlassCard', () => {
  it.each([
    'panel',
    'work-large',
    'work-standard',
    'pillar',
    'aside',
    'craft',
    'form',
  ] as const)('renders the %s variant', (variant) => {
    const { container } = render(<GlassCard variant={variant}>body</GlassCard>)
    expect(container.firstElementChild).toHaveAttribute('data-variant', variant)
    expect(container.firstElementChild).toHaveClass('glass')
  })

  it('renders the whole card as one link when given an href', () => {
    render(
      <GlassCard variant="work-large" href="/work/gabar" glow="cyan">
        gabar
      </GlassCard>
    )
    const card = screen.getByRole('link', { name: 'gabar' })
    expect(card).toHaveAttribute('data-glow', 'cyan')
  })

  it('accepts an accent-tinted top border', () => {
    const { container } = render(
      <GlassCard variant="pillar" tone="fuchsia">
        body
      </GlassCard>
    )
    const card = container.firstElementChild
    expect(card).toHaveAttribute('data-tone', 'fuchsia')
    expect(card?.getAttribute('style')).toContain('--glass-tone: var(--accent-fuchsia)')
  })

  it('honours the glass recipe including the signature lit top edge', () => {
    const glass = blockAfter(css, '@utility glass ')
    expect(glass).toContain('background: var(--glass-bg)')
    expect(glass).toContain('backdrop-filter: blur(var(--glass-blur))')
    expect(glass).toContain('border: 1px solid var(--line-1)')
    expect(glass).toContain('border-top: 1px solid var(--glass-highlight)')
    expect(glass).toContain('border-radius: var(--r-panel)')
  })

  it('drops the lit top edge on the Stack aside, the one card without it', () => {
    const glass = blockAfter(css, '@utility glass ')
    const aside = blockAfter(glass, "&[data-variant='aside']")
    expect(aside).toContain('border-top-color: var(--line-1)')
  })
})

describe('HairlineGrid', () => {
  it('produces one cell per child and no per-cell borders', () => {
    const { container } = render(
      <HairlineGrid as="dl" cols={2} colsMd={4}>
        <KpiTile variant="proof" label="a" value="1" />
        <KpiTile variant="proof" label="b" value="2" />
        <KpiTile variant="proof" label="c" value="3" />
        <KpiTile variant="proof" label="d" value="4" />
      </HairlineGrid>
    )
    const grid = container.querySelector('dl.hairline')
    expect(grid).not.toBeNull()
    expect(grid?.children).toHaveLength(4)
    expect(blockAfter(css, '@utility hairline-cell ')).not.toContain('border:')
  })

  it.each([
    [1, 'grid-cols-1'],
    [2, 'grid-cols-2'],
    [5, 'grid-cols-5'],
  ] as const)('takes %i columns at the base breakpoint', (cols, className) => {
    const { container } = render(<HairlineGrid cols={cols}>x</HairlineGrid>)
    expect(container.firstElementChild).toHaveClass(className)
  })

  it('changes track count by breakpoint and nothing else', () => {
    const { container } = render(
      <HairlineGrid cols={1} colsMd={5}>
        x
      </HairlineGrid>
    )
    const grid = container.firstElementChild
    expect(grid).toHaveClass('grid-cols-1')
    expect(grid).toHaveClass('md:grid-cols-5')
    expect(grid).toHaveAttribute('data-cols', '1')
    expect(grid).toHaveAttribute('data-cols-md', '5')
  })

  it('builds the divider from gap:1px over the line ground', () => {
    const hairline = blockAfter(css, '@utility hairline ')
    expect(hairline).toContain('gap: 1px')
    expect(hairline).toContain('background: var(--line-1)')
    expect(hairline).toContain('overflow: hidden')
  })

  it('renders the interactive contact-row cell as a link', () => {
    render(
      <HairlineGrid as="ul" cols={1}>
        <HairlineCell as="li" interactive href="https://github.com/JxstWieslaw">
          GitHub
        </HairlineCell>
      </HairlineGrid>
    )
    const cell = screen.getByRole('link', { name: 'GitHub' })
    expect(cell).toHaveAttribute('data-interactive', 'true')
  })

  it('offers the process rail its measured 0.88 ground', () => {
    const { container } = render(<HairlineCell tone="rail">01</HairlineCell>)
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'rail')
  })
})

describe('PlaceholderCard', () => {
  it('marks the container as a placeholder', () => {
    const { container } = render(<PlaceholderCard>[AR project name]</PlaceholderCard>)
    expect(container.firstElementChild).toHaveAttribute('data-placeholder', 'true')
    expect(container.firstElementChild).toHaveClass('placeholder-card')
  })

  it('underlines unresolved strings with the dotted convention', () => {
    render(<PlaceholderText>[AR project name]</PlaceholderText>)
    expect(screen.getByText('[AR project name]')).toHaveClass('placeholder-text')
  })

  it('renders skeleton chip ghosts without announcing them', () => {
    const { container } = render(<PlaceholderGhost width={88} />)
    const ghost = container.firstElementChild
    expect(ghost).toHaveAttribute('aria-hidden', 'true')
    expect(ghost?.getAttribute('style')).toContain('width: 88px')
  })

  it('uses the dashed container and dotted underline convention', () => {
    expect(blockAfter(css, '@utility placeholder-card ')).toContain(
      'border: 1px dashed var(--line-2)'
    )
    expect(blockAfter(css, '@utility placeholder-text ')).toContain(
      'border-bottom: 1px dotted var(--line-2)'
    )
    expect(blockAfter(css, '@utility placeholder-card ')).toContain('color: var(--fg-2)')
  })
})

describe('TechTag', () => {
  it('renders tags inside a list that pins to a common baseline', () => {
    render(
      <TechTagList>
        <TechTag>Three.js</TechTag>
        <TechTag>Rapier</TechTag>
      </TechTagList>
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    // Reconciliation § 6.9: the `auto` is the flex spacer. Do not remove it.
    expect(blockAfter(css, '@utility tech-tag-list ')).toContain('margin: auto 0 24px')
  })
})

describe('Eyebrow', () => {
  it('renders with a tone as a custom property', () => {
    render(<Eyebrow tone="cyan-400">01 — Craft</Eyebrow>)
    const eyebrow = screen.getByText('01 — Craft')
    expect(eyebrow).toHaveAttribute('data-tone', 'cyan-400')
    expect(eyebrow.getAttribute('style')).toContain('--eyebrow-tint: var(--cyan-400)')
  })

  it('renders the smaller card size', () => {
    render(<Eyebrow size="sm">Pillar 01</Eyebrow>)
    expect(screen.getByText('Pillar 01')).toHaveAttribute('data-size', 'sm')
  })

  it('can become a stack group heading', () => {
    render(
      <Eyebrow as="h3" size="sm" tone="iris">
        Languages
      </Eyebrow>
    )
    expect(screen.getByRole('heading', { level: 3, name: 'Languages' })).toBeInTheDocument()
  })
})

describe('SectionHeader', () => {
  it('renders the NN — Title eyebrow, the h2 and the lede', () => {
    render(
      <SectionHeader
        index="01"
        eyebrow="Selected work"
        title="Selected work"
        titleId="work-h"
        lede="Eight domains, one habit."
      />
    )
    expect(screen.getByText('01 — Selected work')).toBeInTheDocument()
    const heading = screen.getByRole('heading', { level: 2, name: 'Selected work' })
    expect(heading).toHaveAttribute('id', 'work-h')
    expect(heading).toHaveClass('type-h2')
    expect(screen.getByText('Eight domains, one habit.')).toBeInTheDocument()
  })

  it('carries an optional trailing pill link that wraps below when cramped', () => {
    render(
      <SectionHeader
        eyebrow="Selected work"
        title="Selected work"
        titleId="work-h"
        action={<Button href="/work">All work</Button>}
      />
    )
    expect(screen.getByRole('link', { name: 'All work' })).toBeInTheDocument()
    expect(blockAfter(css, '@utility section-head ')).toContain('flex-wrap: wrap')
  })
})

describe('BulletList', () => {
  it('renders the accent variant with a hidden glyph column', () => {
    const { container } = render(
      <BulletList items={['Typed contracts in code.', 'Reversible migrations.']} />
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    const glyph = container.querySelector('.bullets-glyph')
    expect(glyph).toHaveAttribute('aria-hidden', 'true')
    expect(glyph).toHaveTextContent('▸')
  })

  it('renders the timeline variant with the em-dash glyph', () => {
    const { container } = render(<BulletList variant="timeline" items={['Shipped it.']} />)
    expect(container.firstElementChild).toHaveAttribute('data-variant', 'timeline')
    expect(container.querySelector('.bullets-glyph')).toHaveTextContent('—')
  })

  it('is a hanging indent, not a list-style bullet', () => {
    expect(blockAfter(css, '@utility bullets-item ')).toContain(
      'grid-template-columns: 14px 1fr'
    )
    expect(blockAfter(css, '@utility bullets ')).toContain('list-style: none')
  })
})

describe('StackLegend', () => {
  it('renders the three proficiency keys', () => {
    const { container } = render(<StackLegend />)
    expect(screen.getByText('Core')).toBeInTheDocument()
    expect(screen.getByText('Working')).toBeInTheDocument()
    expect(screen.getByText('Familiar')).toBeInTheDocument()
    expect(container.querySelectorAll('.stack-legend-swatch')).toHaveLength(3)
  })
})

/**
 * The measured values that no rendering test can catch drifting: a pill that
 * quietly becomes 6px, a gradient that appears in a fourth place, a chip that
 * loses its mono face. If one of these fails the CSS is wrong — change the
 * reconciliation spec before changing the expectation.
 */
describe('globals.css — component contract (reconciliation § 6)', () => {
  const btn = blockAfter(css, '@utility btn ')

  it('makes every button a pill, never 6px (§ 6.1)', () => {
    expect(btn).toContain('border-radius: var(--r-pill)')
    expect(btn).not.toContain('var(--r-chip)')
  })

  it('sizes the hero CTA at 48px/26px and the nav CTA at 44px/22px', () => {
    expect(blockAfter(btn, "&[data-size='lg']")).toContain('height: 48px')
    expect(blockAfter(btn, "&[data-size='lg']")).toContain('padding: 0 26px')
    expect(blockAfter(btn, "&[data-size='md']")).toContain('height: 44px')
    expect(blockAfter(btn, "&[data-size='md']")).toContain('padding: 0 22px')
  })

  it('inverts the primary CTA to the gradient on hover, with the label flipping', () => {
    const hover = blockAfter(
      btn,
      "&[data-variant='primary']:not(:disabled):not([aria-disabled='true']):hover"
    )
    expect(hover).toContain('background: var(--gradient)')
    expect(hover).toContain('color: var(--fg-0)')
  })

  it('adds the cyan glow to the secondary hover (§ 6.1)', () => {
    const hover = blockAfter(
      btn,
      "&[data-variant='secondary']:not(:disabled):not([aria-disabled='true']):hover"
    )
    expect(hover).toContain('box-shadow: var(--glow-cyan)')
  })

  it('gives the unsupported variant its dashed, not-allowed chrome', () => {
    const unsupported = blockAfter(btn, "&[data-variant='unsupported']")
    expect(unsupported).toContain('border-style: dashed')
    expect(unsupported).toContain('cursor: not-allowed')
  })

  it('gives every hover a focus-visible peer', () => {
    // Every `:hover` rule in the component layer is paired with the same
    // declaration on `:focus-visible`, so keyboard users get the same signal.
    const componentLayer = css.slice(css.indexOf('COMPONENT UTILITIES'))
    const hovers = componentLayer.match(/:hover/g) ?? []
    const focuses = componentLayer.match(/:focus-visible|:focus-within/g) ?? []
    expect(hovers.length).toBeGreaterThan(0)
    expect(focuses.length).toBeGreaterThanOrEqual(hovers.length)
  })

  it('sets every chip in JetBrains Mono on a 6px radius (§ 6.2)', () => {
    const chip = blockAfter(css, '@utility chip ')
    expect(chip).toContain('font-family: var(--font-mono)')
    expect(chip).toContain('border-radius: var(--r-chip)')
    expect(chip).toContain('padding: 6px 11px')
    expect(chip).toContain('letter-spacing: 0.06em')
  })

  it('tints domain chips at 8% with a 40% border, as measured', () => {
    const domain = blockAfter(blockAfter(css, '@utility chip '), "&[data-variant='domain']")
    expect(domain).toContain('8%')
    expect(domain).toContain('40%')
  })

  it('keeps --gradient to its three sanctioned placements', () => {
    // The component layer may reference the gradient exactly once: the primary
    // CTA hover. The canvas and the hero display clip are the other two, and
    // neither lives in this stylesheet.
    const componentLayer = css.slice(css.indexOf('COMPONENT UTILITIES'))
    expect(componentLayer.match(/var\(--gradient\)/g) ?? []).toHaveLength(1)
  })
})
