import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Reveal, resetRevealSystem } from '@/components/ui/Reveal'

/**
 * The two properties that matter are availability properties, not animation
 * ones: the above-fold guard (nothing visible on first paint is gated on the
 * observer) and the 4000ms hard deadline (a missing or broken observer can
 * never leave the page permanently invisible). Both are tested directly.
 */

const VIEWPORT_HEIGHT = 768

function stubRectTop(top: number): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        top,
        bottom: top,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect
  )
}

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

type ObserverEntry = { isIntersecting: boolean; target: Element }
type ObserverCallback = (entries: ObserverEntry[]) => void

/** Installs a fake IntersectionObserver and returns a trigger for it. */
function stubIntersectionObserver(): { fire: (target: Element) => void } {
  let callback: ObserverCallback | null = null
  const observed = new Set<Element>()

  class FakeIntersectionObserver {
    constructor(cb: ObserverCallback) {
      callback = cb
    }
    observe(target: Element): void {
      observed.add(target)
    }
    unobserve(target: Element): void {
      observed.delete(target)
    }
    disconnect(): void {
      observed.clear()
    }
    takeRecords(): ObserverEntry[] {
      return []
    }
  }

  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)

  return {
    fire(target: Element) {
      if (callback === null) throw new Error('observer was never constructed')
      callback([{ isIntersecting: true, target }])
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  window.innerHeight = VIEWPORT_HEIGHT
})

afterEach(() => {
  cleanup()
  resetRevealSystem()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Reveal — the above-fold guard', () => {
  it('never hides anything that is already visible on first paint', () => {
    stubRectTop(VIEWPORT_HEIGHT * 0.5)
    const { container } = render(<Reveal>hero</Reveal>)
    const element = container.firstElementChild as HTMLElement

    expect(element.style.opacity).toBe('')
    expect(element.style.transform).toBe('')
    expect(element.dataset['revealed']).toBe('true')
  })

  it('treats the 0.92 boundary as visible, not as below the fold', () => {
    stubRectTop(VIEWPORT_HEIGHT * 0.92)
    const { container } = render(<Reveal>edge</Reveal>)
    expect((container.firstElementChild as HTMLElement).style.opacity).toBe('')
  })

  it('hides only what starts below the fold', () => {
    stubRectTop(VIEWPORT_HEIGHT * 0.93)
    const { container } = render(<Reveal>below</Reveal>)
    const element = container.firstElementChild as HTMLElement

    expect(element.style.opacity).toBe('0')
    expect(element.style.transform).toBe('translateY(24px)')
    expect(element.dataset['revealed']).toBeUndefined()
  })
})

describe('Reveal — the 4000ms hard deadline', () => {
  it('reveals everything after 4s even with no IntersectionObserver at all', () => {
    expect('IntersectionObserver' in globalThis).toBe(false)

    stubRectTop(10_000)
    const { container } = render(<Reveal>late</Reveal>)
    const element = container.firstElementChild as HTMLElement
    expect(element.style.opacity).toBe('0')

    // Poll ticks before the deadline leave it hidden: geometry says it is
    // still far below the viewport.
    act(() => {
      vi.advanceTimersByTime(3_600)
    })
    expect(element.style.opacity).toBe('0')

    act(() => {
      vi.advanceTimersByTime(900)
    })
    expect(element.dataset['revealed']).toBe('true')
    expect(element.style.opacity).toBe('1')
    expect(element.style.transform).toBe('none')
  })

  it('stops polling once the deadline has passed and nothing is left hidden', () => {
    stubRectTop(10_000)
    render(<Reveal>late</Reveal>)
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reveals on the 450ms geometry poll once an element scrolls into range', () => {
    stubRectTop(10_000)
    const { container } = render(<Reveal>scrolled</Reveal>)
    const element = container.firstElementChild as HTMLElement
    expect(element.style.opacity).toBe('0')

    // The page scrolls; the poll re-reads geometry from the live DOM.
    stubRectTop(VIEWPORT_HEIGHT * 0.5)
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(element.style.opacity).toBe('1')
  })

  it('tears the interval down on unmount', () => {
    stubRectTop(10_000)
    const view = render(<Reveal>late</Reveal>)
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('Reveal — observer path and stagger', () => {
  it('reveals on intersection without waiting for the deadline', () => {
    const observer = stubIntersectionObserver()
    stubRectTop(10_000)

    const { container } = render(<Reveal>card</Reveal>)
    const element = container.firstElementChild as HTMLElement
    expect(element.style.opacity).toBe('0')

    act(() => {
      observer.fire(element)
    })

    expect(element.style.opacity).toBe('1')
    expect(element.style.transform).toBe('none')
  })

  it('staggers siblings by 70ms each and uses the 560ms curve', () => {
    const observer = stubIntersectionObserver()
    stubRectTop(10_000)

    const { container } = render(
      <>
        <Reveal>one</Reveal>
        <Reveal>two</Reveal>
        <Reveal>three</Reveal>
      </>
    )
    const [first, second, third] = Array.from(container.children) as HTMLElement[]
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error('expected three siblings')
    }

    act(() => {
      observer.fire(first)
      observer.fire(second)
      observer.fire(third)
    })

    expect(first.getAttribute('style')).toContain(
      'opacity 560ms cubic-bezier(.2,.8,.2,1) 0ms'
    )
    expect(second.getAttribute('style')).toContain(
      'transform 560ms cubic-bezier(.2,.8,.2,1) 70ms'
    )
    expect(third.getAttribute('style')).toContain('140ms')
  })

  it('marks every target with data-reveal so sibling indexing works', () => {
    stubRectTop(10_000)
    const { container } = render(<Reveal as="article">card</Reveal>)
    const element = container.firstElementChild as HTMLElement
    expect(element.tagName).toBe('ARTICLE')
    expect(element).toHaveAttribute('data-reveal')
  })
})

describe('Reveal — reduced motion', () => {
  it('bails out entirely: nothing is hidden and no timer starts', () => {
    stubReducedMotion(true)
    stubRectTop(10_000)

    const { container } = render(<Reveal>late</Reveal>)
    const element = container.firstElementChild as HTMLElement

    expect(element.style.opacity).toBe('')
    expect(element.style.transform).toBe('')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('still runs the system when reduced motion is not requested', () => {
    stubReducedMotion(false)
    stubRectTop(10_000)

    const { container } = render(<Reveal>late</Reveal>)
    expect((container.firstElementChild as HTMLElement).style.opacity).toBe('0')
  })
})

describe('Reveal — resilience', () => {
  it('ships visible markup: the hidden state comes from JS, never from CSS', () => {
    // Rendering with no geometry stub at all (jsdom reports every rect as 0)
    // must leave the content visible — the failure mode of a broken observer
    // has to be "no animation", never "no page".
    const { container } = render(<Reveal>content</Reveal>)
    const element = container.firstElementChild as HTMLElement
    expect(element).toHaveTextContent('content')
    expect(element.style.opacity).not.toBe('0')
  })
})
