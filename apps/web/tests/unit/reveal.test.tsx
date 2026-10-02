import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Reveal, batchStaggerMs, resetRevealSystem } from '@/components/ui/Reveal'

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
function stubIntersectionObserver(): {
  fire: (target: Element) => void
  fireBatch: (targets: Element[]) => void
} {
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
    /** One observer callback carrying several entries: they entered together. */
    fireBatch(targets: Element[]) {
      if (callback === null) throw new Error('observer was never constructed')
      callback(targets.map((target) => ({ isIntersecting: true, target })))
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

  it('staggers a batch by 70ms per position and uses the 560ms curve', () => {
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
      observer.fireBatch([first, second, third])
    })

    expect(first.getAttribute('style')).toContain(
      'opacity 560ms cubic-bezier(.2,.8,.2,1) 0ms'
    )
    expect(second.getAttribute('style')).toContain(
      'transform 560ms cubic-bezier(.2,.8,.2,1) 70ms'
    )
    expect(third.getAttribute('style')).toContain('140ms')
  })

  it('gives a late list item no delay when it scrolls in alone', () => {
    const observer = stubIntersectionObserver()
    stubRectTop(10_000)

    const { container } = render(
      <>
        <Reveal>one</Reveal>
        <Reveal>two</Reveal>
        <Reveal>three</Reveal>
        <Reveal>four</Reveal>
        <Reveal>five</Reveal>
      </>
    )
    const fifth = container.children[4] as HTMLElement

    // The fifth sibling on the page, but the only one in its batch.
    act(() => {
      observer.fire(fifth)
    })

    expect(fifth.getAttribute('style')).toContain('opacity 560ms cubic-bezier(.2,.8,.2,1) 0ms')
    expect(fifth.getAttribute('style')).toContain('transform 560ms cubic-bezier(.2,.8,.2,1) 0ms')
  })

  it('caps the stagger at 210ms for a big batch', () => {
    const observer = stubIntersectionObserver()
    stubRectTop(10_000)

    const { container } = render(
      <>
        {Array.from({ length: 6 }, (_, index) => (
          <Reveal key={index}>{index}</Reveal>
        ))}
      </>
    )
    const items = Array.from(container.children) as HTMLElement[]

    act(() => {
      observer.fireBatch(items)
    })

    expect(items[3]?.getAttribute('style')).toContain('cubic-bezier(.2,.8,.2,1) 210ms')
    expect(items[5]?.getAttribute('style')).toContain('cubic-bezier(.2,.8,.2,1) 210ms')
    expect(items[5]?.getAttribute('style')).not.toContain('350ms')
  })

  it('does not count an already revealed element toward the batch position', () => {
    const observer = stubIntersectionObserver()
    stubRectTop(10_000)

    const { container } = render(
      <>
        <Reveal>one</Reveal>
        <Reveal>two</Reveal>
      </>
    )
    const [first, second] = Array.from(container.children) as HTMLElement[]
    if (first === undefined || second === undefined) throw new Error('expected two')

    act(() => {
      observer.fire(first)
    })
    act(() => {
      observer.fireBatch([first, second])
    })

    expect(second.getAttribute('style')).toContain('cubic-bezier(.2,.8,.2,1) 0ms')
  })

  it('marks every target with data-reveal so sibling indexing works', () => {
    stubRectTop(10_000)
    const { container } = render(<Reveal as="article">card</Reveal>)
    const element = container.firstElementChild as HTMLElement
    expect(element.tagName).toBe('ARTICLE')
    expect(element).toHaveAttribute('data-reveal')
  })
})

describe('batchStaggerMs — the pure stagger function', () => {
  it('is 0 for the first element of a batch', () => {
    expect(batchStaggerMs(0)).toBe(0)
  })

  it('steps by 70ms per position', () => {
    expect(batchStaggerMs(1)).toBe(70)
    expect(batchStaggerMs(2)).toBe(140)
    expect(batchStaggerMs(3)).toBe(210)
  })

  it('never exceeds 210ms, however large the batch', () => {
    expect(batchStaggerMs(4)).toBe(210)
    expect(batchStaggerMs(40)).toBe(210)
    expect(batchStaggerMs(Number.MAX_SAFE_INTEGER)).toBe(210)
  })

  it('treats negative, fractional and non-finite positions safely', () => {
    expect(batchStaggerMs(-3)).toBe(0)
    expect(batchStaggerMs(Number.NaN)).toBe(0)
    expect(batchStaggerMs(Number.POSITIVE_INFINITY)).toBe(0)
    expect(batchStaggerMs(1.9)).toBe(70)
  })

  it('is monotonic non-decreasing', () => {
    let previous = 0
    for (let position = 0; position < 20; position += 1) {
      const delay = batchStaggerMs(position)
      expect(delay).toBeGreaterThanOrEqual(previous)
      previous = delay
    }
  })
})

describe('Reveal — the poll batches too', () => {
  it('staggers elements the poll reveals together by position, capped', () => {
    stubRectTop(10_000)
    const { container } = render(
      <>
        {Array.from({ length: 5 }, (_, index) => (
          <Reveal key={index}>{index}</Reveal>
        ))}
      </>
    )
    const items = Array.from(container.children) as HTMLElement[]

    stubRectTop(VIEWPORT_HEIGHT * 0.5)
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(items[0]?.getAttribute('style')).toContain('cubic-bezier(.2,.8,.2,1) 0ms')
    expect(items[4]?.getAttribute('style')).toContain('cubic-bezier(.2,.8,.2,1) 210ms')
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
