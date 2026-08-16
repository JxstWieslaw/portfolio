import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Container } from '@/components/layout/Container'
import { Section } from '@/components/layout/Section'
import { SkipLink } from '@/components/layout/SkipLink'

describe('Section', () => {
  it('exposes id and data-section so the canvas layer and scroll-spy can observe it', () => {
    const { container } = render(
      <Section id="work" formation="lattice">
        <p>x</p>
      </Section>
    )
    const section = container.querySelector('section')
    expect(section).toHaveAttribute('id', 'work')
    expect(section).toHaveAttribute('data-section', 'work')
    expect(section).toHaveAttribute('data-formation', 'lattice')
  })

  it('omits data-formation for the two sections that have no canvas', () => {
    const { container } = render(
      <Section id="timeline">
        <p>x</p>
      </Section>
    )
    expect(container.querySelector('section')).not.toHaveAttribute('data-formation')
  })

  it('associates its accessible name with a heading when labelledBy is given', () => {
    render(
      <Section id="lead" labelledBy="lead-heading">
        <h2 id="lead-heading">How I Lead</h2>
      </Section>
    )
    expect(screen.getByRole('region', { name: 'How I Lead' })).toBeInTheDocument()
  })

  it('names the one section with no visible heading by aria-label', () => {
    render(
      <Section id="proof" label="Domains and figures" padding="compact">
        <p>x</p>
      </Section>
    )
    expect(screen.getByRole('region', { name: 'Domains and figures' })).toBeInTheDocument()
  })

  // Reconciliation § 6: padding and max-width are ONE wrapper, not a Section
  // wrapping a Container.
  it('merges section padding and max-width into a single inner wrapper', () => {
    const { container } = render(
      <Section id="work">
        <p>x</p>
      </Section>
    )
    const inner = container.querySelector('.section-inner')
    expect(inner).not.toBeNull()
    expect(inner).toHaveAttribute('data-width', 'content')
    expect(inner).toHaveAttribute('data-pad', 'section')
    expect(container.querySelectorAll('.section-inner')).toHaveLength(1)
  })

  it('widens to the bento cap on request', () => {
    const { container } = render(
      <Section id="work" width="bento">
        <p>x</p>
      </Section>
    )
    expect(container.querySelector('.section-inner')).toHaveAttribute('data-width', 'bento')
  })

  it('drops --section-y for the proof strip, the one section with fixed padding', () => {
    const { container } = render(
      <Section id="proof" padding="compact" label="Domains and figures">
        <p>x</p>
      </Section>
    )
    expect(container.querySelector('.section-inner')).toHaveAttribute('data-pad', 'compact')
  })

  it('draws the hairline between sections by default and drops it for the hero', () => {
    const { container: withRule } = render(
      <Section id="work">
        <p>x</p>
      </Section>
    )
    expect(withRule.querySelector('section')).toHaveAttribute('data-divider', 'true')

    const { container: withoutRule } = render(
      <Section id="hero" divider={false}>
        <p>x</p>
      </Section>
    )
    expect(withoutRule.querySelector('section')).toHaveAttribute('data-divider', 'false')
  })

  it('renders the backdrop slot before the content, outside the inner wrapper', () => {
    const { container } = render(
      <Section id="hero" backdrop={<div data-testid="backdrop" aria-hidden="true" />}>
        <p>content</p>
      </Section>
    )
    const section = container.querySelector('section')
    expect(section?.firstElementChild).toHaveAttribute('data-testid', 'backdrop')
    expect(section?.querySelector('.section-inner [data-testid="backdrop"]')).toBeNull()
  })

  it('paints the two quiet-zone sections opaque instead of over a canvas', () => {
    const { container } = render(
      <Section id="writing" background="bg-1">
        <p>x</p>
      </Section>
    )
    expect(container.querySelector('section')).toHaveAttribute('data-background', 'bg-1')
  })
})

describe('Container', () => {
  it('renders children', () => {
    render(
      <Container>
        <p>inside</p>
      </Container>
    )
    expect(screen.getByText('inside')).toBeInTheDocument()
  })

  it('caps content at 1440 and the bento at 1600', () => {
    const { container: content } = render(
      <Container>
        <p>x</p>
      </Container>
    )
    expect(content.firstElementChild).toHaveClass('shell-content')

    const { container: bento } = render(
      <Container width="bento">
        <p>x</p>
      </Container>
    )
    expect(bento.firstElementChild).toHaveClass('shell-bento')
  })
})

describe('SkipLink', () => {
  it('links to the main landmark', () => {
    render(<SkipLink />)
    expect(screen.getByRole('link', { name: /skip to content/i })).toHaveAttribute(
      'href',
      '#main'
    )
  })

  // Not `sr-only`: the link has to become visible once focused.
  it('uses the visible off-canvas recipe rather than a screen-reader-only class', () => {
    render(<SkipLink />)
    const link = screen.getByRole('link', { name: /skip to content/i })
    expect(link).toHaveClass('skip-link')
    expect(link.className).not.toContain('sr-only')
  })
})
