import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FieldCanvas } from '@/components/three/FieldCanvas'
import { clearPointCache } from '@/lib/formations/render'

/**
 * The initial paint is deferred behind `scheduleIdle` (see `FieldCanvas`).
 * jsdom has no `requestIdleCallback`, so the fallback path runs the paint on
 * the next macrotask (`setTimeout(callback, 0)`); a small margin is enough
 * to observe it without pinning an exact number of milliseconds.
 */
const AFTER_INITIAL_PAINT_MS = 40

/**
 * A recording 2D context. jsdom has no canvas backend, so the component would
 * otherwise sit permanently on rung 5 and none of this would be exercised.
 */
class RecordingContext {
  clears = 0
  fills = 0
  fillStyle: string | CanvasGradient = ''
  globalCompositeOperation = 'source-over'
  setTransform(): void {}
  clearRect(): void {
    this.clears += 1
  }
  fillRect(): void {
    this.fills += 1
  }
  createRadialGradient(): CanvasGradient {
    return { addColorStop(): void {} } as unknown as CanvasGradient
  }
}

let recorder: RecordingContext
let contextAvailable = true

const BOX = { width: 1200, height: 800 }

function stubMatchMedia(matching: readonly string[]): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: matching.includes(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

function stubCores(count: number): void {
  Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: count })
}

class StubIntersectionObserver {
  readonly root = null
  readonly rootMargin: string
  readonly thresholds: readonly number[] = []
  constructor(
    private readonly callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.rootMargin = options?.rootMargin ?? ''
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
  /** Lets a test drive the visibility gate the hero loop reads. */
  emit(isIntersecting: boolean): void {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
}

const observers: StubIntersectionObserver[] = []

/** Waits real time so the throttled rAF loop has a chance to run. */
async function settle(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

/** Scrolls every observed side canvas into range. */
function scrollIntoRange(): void {
  act(() => observers.forEach((o) => o.emit(true)))
}

beforeEach(() => {
  delete document.documentElement.dataset.gl
  clearPointCache()
  recorder = new RecordingContext()
  contextAvailable = true
  observers.length = 0

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => (contextAvailable ? (recorder as unknown as CanvasRenderingContext2D) : null),
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({ ...BOX, top: 0, left: 0, right: BOX.width, bottom: BOX.height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
  })
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 })

  stubMatchMedia([])
  stubCores(8)
  vi.stubGlobal(
    'IntersectionObserver',
    class extends StubIntersectionObserver {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        super(callback, options)
        observers.push(this)
      }
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('FieldCanvas', () => {
  it('is hidden from assistive technology and tagged with its formation', () => {
    const { container } = render(<FieldCanvas formation="stream" />)
    const canvas = container.querySelector('canvas')
    expect(canvas).toHaveAttribute('aria-hidden', 'true')
    expect(canvas).toHaveAttribute('data-f', 'stream')
  })

  it('paints a static formation exactly once, and only once it is seen', async () => {
    render(<FieldCanvas formation="lattice" />)
    await settle(AFTER_INITIAL_PAINT_MS)
    expect(recorder.clears).toBe(0)

    scrollIntoRange()
    expect(recorder.clears).toBe(1)

    // Leaving and re-entering with the same box does not repaint.
    act(() => observers[0]?.emit(false))
    scrollIntoRange()
    expect(recorder.clears).toBe(1)
  })

  it('observes a side canvas with a 200 px margin', async () => {
    render(<FieldCanvas formation="lattice" />)
    await settle(AFTER_INITIAL_PAINT_MS)
    expect(observers).toHaveLength(1)
    expect(observers[0]?.rootMargin).toBe('200px')
  })

  it('paints an off-screen side canvas once it is seen even after a resize while away', async () => {
    render(<FieldCanvas formation="lattice" />)
    await settle(AFTER_INITIAL_PAINT_MS)

    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    await settle(220)
    expect(recorder.clears).toBe(0)

    scrollIntoRange()
    expect(recorder.clears).toBe(1)
  })

  it('paints a side canvas straight away when there is no IntersectionObserver', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    render(<FieldCanvas formation="lattice" />)
    await settle(AFTER_INITIAL_PAINT_MS)
    expect(recorder.clears).toBe(1)
  })

  describe('prefers-reduced-motion', () => {
    beforeEach(() => {
      stubMatchMedia(['(prefers-reduced-motion: reduce)'])
    })

    it('paints exactly one frame even when asked to animate', async () => {
      // The whole point: reduced motion is not slower motion. One frame, then
      // nothing — no rAF loop is ever started.
      // The hero is never gated on intersection: it paints at idle.
      const { container } = render(<FieldCanvas formation="monolith" animate />)
      await settle(AFTER_INITIAL_PAINT_MS)
      expect(recorder.clears).toBe(1)
      expect(container.querySelector('canvas')).toHaveAttribute('data-rung', 'reduced-motion')
    })

    it('keeps the opacity cross-fade, which --d-crossfade survives for', async () => {
      const { container } = render(<FieldCanvas formation="monolith" animate />)
      await settle(AFTER_INITIAL_PAINT_MS)
      const canvas = container.querySelector('canvas')
      expect(canvas?.style.transition).toBe('opacity var(--d-crossfade) var(--ease)')
      expect(canvas?.style.opacity).toBe('1')
    })
  })

  it('runs the hero loop when motion is allowed', async () => {
    render(<FieldCanvas formation="monolith" animate />)
    // The initial (deferred) paint, then ~20 fps for another 200ms. Anything
    // above one proves the loop is live without pinning an exact frame count.
    await settle(AFTER_INITIAL_PAINT_MS + 200)
    expect(recorder.clears).toBeGreaterThan(1)
  })

  it('stops painting the hero while it is scrolled out of view', async () => {
    render(<FieldCanvas formation="monolith" animate />)
    await settle(AFTER_INITIAL_PAINT_MS)
    const observer = observers[0]
    if (!observer) throw new Error('the hero canvas was never observed')

    act(() => observer.emit(false))
    const painted = recorder.clears
    await settle(200)
    expect(recorder.clears).toBe(painted)

    act(() => observer.emit(true))
    await settle(200)
    expect(recorder.clears).toBeGreaterThan(painted)
  })

  it('never animates a non-hero formation', async () => {
    render(<FieldCanvas formation="grid" />)
    await settle(AFTER_INITIAL_PAINT_MS)
    scrollIntoRange()
    await settle(200)
    expect(recorder.clears).toBe(1)
  })

  it('does not gate the hero on intersection', async () => {
    render(<FieldCanvas formation="monolith" animate />)
    await settle(AFTER_INITIAL_PAINT_MS)
    // Painted at idle with no intersection ever reported; its observer is the
    // plain visibility one, not the 200 px side-canvas one.
    expect(recorder.clears).toBeGreaterThan(0)
    expect(observers[0]?.rootMargin).toBe('')
  })

  describe('the hero loop while the Assembly is live', () => {
    it('stops re-arming requestAnimationFrame once data-gl is live', async () => {
      render(<FieldCanvas formation="monolith" animate />)
      await settle(AFTER_INITIAL_PAINT_MS + 100)

      document.documentElement.dataset.gl = 'live'
      await settle(100) // let the in-flight frame notice and stop
      const raf = vi.spyOn(window, 'requestAnimationFrame')
      const painted = recorder.clears
      await settle(200)
      expect(raf).not.toHaveBeenCalled()
      expect(recorder.clears).toBe(painted)
    })

    it('does not keep the loop running when it mounts under a live Assembly', async () => {
      document.documentElement.dataset.gl = 'live'
      const raf = vi.spyOn(window, 'requestAnimationFrame')
      render(<FieldCanvas formation="monolith" animate />)
      await settle(AFTER_INITIAL_PAINT_MS + 100)
      // One probe frame notices the attribute and stops; it never re-arms.
      expect(raf.mock.calls.length).toBeLessThanOrEqual(1)
      // The idle first paint still happens: it is the context-loss fallback.
      expect(recorder.clears).toBe(1)
    })

    it('resumes painting when data-gl is removed', async () => {
      render(<FieldCanvas formation="monolith" animate />)
      await settle(AFTER_INITIAL_PAINT_MS + 100)
      document.documentElement.dataset.gl = 'live'
      await settle(100)
      const painted = recorder.clears

      delete document.documentElement.dataset.gl
      await settle(200)
      expect(recorder.clears).toBeGreaterThan(painted)
    })
  })

  it('falls to the wash rung when there is no 2D context, without shifting anything', async () => {
    // No `scheduleIdle` call happens on this path — rung 5 returns before it —
    // so there is nothing to wait out; the short settle just flushes effects.
    contextAvailable = false
    const { container } = render(<FieldCanvas formation="orbit" />)
    await settle(60)
    const canvas = container.querySelector('canvas')
    expect(canvas).toHaveAttribute('data-rung', 'wash')
    expect(canvas?.style.opacity).toBe('0')
    expect(recorder.clears).toBe(0)
    // Still in the DOM, still the same box — the CSS wash simply shows through.
    expect(canvas?.className).toContain('absolute inset-0')
  })

  it('drops the cross-fade when there is no IntersectionObserver', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { container } = render(<FieldCanvas formation="ring" />)
    await settle(AFTER_INITIAL_PAINT_MS)
    const canvas = container.querySelector('canvas')
    expect(canvas).toHaveAttribute('data-rung', 'static')
    expect(canvas?.style.transition).toBe('')
    expect(canvas?.style.opacity).toBe('1')
  })

  it('paints fewer instances on modest hardware', async () => {
    render(<FieldCanvas formation="ring" />)
    await settle(AFTER_INITIAL_PAINT_MS)
    scrollIntoRange()
    const full = recorder.fills

    cleanup()
    observers.length = 0
    recorder = new RecordingContext()
    stubCores(2)
    render(<FieldCanvas formation="ring" />)
    await settle(AFTER_INITIAL_PAINT_MS)
    scrollIntoRange()

    expect(recorder.fills).toBeLessThan(full)
    expect(recorder.fills).toBeGreaterThan(0)
  })

  it('repaints on resize once the resize settles, while visible', async () => {
    render(<FieldCanvas formation="lattice" />)
    await settle(AFTER_INITIAL_PAINT_MS)
    scrollIntoRange()
    expect(recorder.clears).toBe(1)

    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    await settle(220)
    expect(recorder.clears).toBe(2)
  })
})
