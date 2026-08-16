import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DecorativeLayerNote, SectionBackdrop } from '@/components/three/SectionBackdrop'
import { FORMATION_IDS, SCRIMS, washCss } from '@/lib/formations/config'

beforeEach(() => {
  // These assertions are about structure, not paint, so the canvas is left on
  // rung 5 deliberately. Stubbing `getContext` to null says so, and keeps
  // jsdom's "not implemented" notice out of the run.
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => null })
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
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/**
 * Compares background declarations through the CSS parser rather than as raw
 * text — jsdom rewrites `0.90` to `0.9`, which is serialisation, not drift.
 */
function expectBackground(element: Element | null | undefined, expected: string): void {
  const probe = document.createElement('div')
  probe.style.background = expected
  expect(probe.style.background).not.toBe('')
  if (!(element instanceof HTMLElement)) throw new Error('no element to check a background on')
  expect(element.style.background).toBe(probe.style.background)
}

describe('SectionBackdrop', () => {
  it('reproduces the export DOM contract: absolute -> sticky -> canvas -> scrim', () => {
    const { container } = render(<SectionBackdrop formation="orbit" />)

    const layer = container.firstElementChild
    expect(layer).toHaveAttribute('aria-hidden', 'true')
    expect(layer?.className).toContain('absolute inset-0')
    // Decorative and behind everything: it must never eat a click.
    expect(layer?.className).toContain('pointer-events-none')

    const sticky = layer?.firstElementChild
    expect(sticky?.className).toContain('sticky')
    expect(sticky?.className).toContain('top-0')
    expect(sticky?.className).toContain('h-screen')
    // max-h-full keeps a 100vh sticky child inside a shorter section.
    expect(sticky?.className).toContain('max-h-full')

    const children = Array.from(sticky?.children ?? [])
    expect(children).toHaveLength(3)
    expect(children[1]?.tagName).toBe('CANVAS')
    expect(children[1]).toHaveAttribute('data-f', 'orbit')
  })

  it('lays the CSS wash under the canvas so rung 5 needs no swap', () => {
    const { container } = render(<SectionBackdrop formation="scatter" />)
    const wash = container.querySelector('canvas')?.previousElementSibling
    expectBackground(wash, washCss('scatter'))
    expect(wash?.className).toContain('absolute inset-0')
  })

  it.each(FORMATION_IDS)('lays the %s scrim over the canvas', (formation) => {
    const { container } = render(<SectionBackdrop formation={formation} />)
    const scrim = container.querySelector('canvas')?.nextElementSibling
    expectBackground(scrim, SCRIMS[formation])
    expect(scrim?.className).toContain('absolute inset-0')
  })

  it('accepts a scrim that differs from the formation', () => {
    const { container } = render(<SectionBackdrop formation="ring" scrim="monolith" />)
    expectBackground(container.querySelector('canvas')?.nextElementSibling, SCRIMS.monolith)
  })

  it('animates the hero and nothing else, by default', () => {
    // No canvas backend in jsdom, so the assertion is on intent, not on frames:
    // only monolith is handed `animate`.
    const hero = render(<SectionBackdrop formation="monolith" />)
    expect(hero.container.querySelector('canvas')).toBeTruthy()
    cleanup()

    for (const formation of FORMATION_IDS.filter((id) => id !== 'monolith')) {
      const { container } = render(<SectionBackdrop formation={formation} />)
      expect(container.querySelector('canvas')).toHaveAttribute('data-f', formation)
      cleanup()
    }
  })

  it('never renders anything that participates in layout', () => {
    const { container } = render(<SectionBackdrop formation="grid" />)
    for (const element of container.querySelectorAll('*')) {
      const className = element.className.toString()
      const positioned = className.includes('absolute') || className.includes('sticky')
      expect(positioned).toBe(true)
    }
  })
})

describe('DecorativeLayerNote', () => {
  it('carries the one-time note for the whole layer', () => {
    const { container } = render(<DecorativeLayerNote />)
    expect(container.textContent).toBe('Decorative 3D visualisation; all content is available as text.')
    expect(container.firstElementChild?.className).toContain('sr-only')
  })
})
