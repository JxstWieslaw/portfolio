import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `next/dynamic` is replaced by a stand-in that behaves like the real one —
 * it calls the loader on first render — so the test can see whether the
 * three-importing chunk was asked for. The chunk itself is replaced by a
 * module whose factory throws: the import rejects the way a ChunkLoadError
 * does after a deploy, which keeps three out of jsdom and exercises the
 * give-up path at the same time.
 */
const dynamicProbe = vi.hoisted(() => ({ loaders: 0, requests: 0 }))

vi.mock('next/dynamic', async () => {
  const React = await import('react')
  return {
    default: (loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>) => {
      dynamicProbe.loaders += 1
      return function DynamicStandIn(props: Record<string, unknown>) {
        const [Loaded, setLoaded] = React.useState<React.ComponentType<Record<string, unknown>> | null>(null)
        React.useEffect(() => {
          dynamicProbe.requests += 1
          void loader().then((module) => setLoaded(() => module.default))
        }, [])
        return Loaded ? <Loaded {...props} /> : null
      }
    },
  }
})

vi.mock('@/components/three/AssemblyCanvas', () => {
  throw new Error('ChunkLoadError: Loading chunk three failed')
})

vi.mock('@/components/three/hero/HeroLayer', () => {
  throw new Error('ChunkLoadError: Loading chunk hero failed')
})

import { AssemblyLayer, resetAssemblyForTests } from '@/components/three/AssemblyLayer'

/** Past the idle macrotask fallback and the rejected import. */
const AFTER_IDLE_MS = 60

/**
 * The layer mounts after the largest contentful paint (`afterLcp`); jsdom
 * paints nothing, so this observer reports one buffered entry at once.
 */
function stubLcp(): void {
  vi.stubGlobal(
    'PerformanceObserver',
    class {
      static supportedEntryTypes = ['largest-contentful-paint']
      constructor(private readonly callback: () => void) {}
      observe(): void {
        this.callback()
      }
      disconnect(): void {}
    },
  )
}

let webgl2 = false

/**
 * A canvas holds one context kind only: the first kind asked for wins and
 * every other kind returns null, exactly as the spec says. This is the
 * regression the mount decision once had — probing WebGL2 on the canvas the
 * 2D ladder had already claimed.
 */
const claimed = new WeakMap<HTMLCanvasElement, string>()

function stubContexts(): void {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: function getContext(this: HTMLCanvasElement, kind: string) {
      const first = claimed.get(this) ?? kind
      claimed.set(this, first)
      if (first !== kind) return null
      if (kind === '2d') return {}
      if (kind === 'webgl2' && webgl2) return { getExtension: () => ({ loseContext: () => {} }) }
      return null
    },
  })
}

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

async function settle(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

beforeEach(() => {
  resetAssemblyForTests()
  dynamicProbe.requests = 0
  webgl2 = false
  stubContexts()
  Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 })
  stubMatchMedia([])
  stubLcp()
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
  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('data-gl')
})

describe('AssemblyLayer', () => {
  it('renders its fixed, hidden, click-through container without WebGL2 and never asks for the chunk', async () => {
    const { container } = render(<AssemblyLayer />)
    await settle(AFTER_IDLE_MS)

    const layer = container.firstElementChild
    expect(layer).toHaveAttribute('aria-hidden', 'true')
    expect(layer?.className).toContain('fixed')
    expect(layer?.className).toContain('inset-0')
    expect(layer?.className).toContain('pointer-events-none')
    expect(layer).toHaveAttribute('data-assembly', 'idle')
    expect(dynamicProbe.requests).toBe(0)
    expect(document.documentElement.hasAttribute('data-gl')).toBe(false)
  })

  it('a rejected hero chunk import gives up with the reason import, and only the flag asks for it', async () => {
    webgl2 = true
    window.history.replaceState({}, '', '/?hero=a')
    render(<AssemblyLayer />)
    await settle(AFTER_IDLE_MS)
    expect(dynamicProbe.requests).toBe(2)
    expect(document.documentElement.getAttribute('data-hero-reason')).toBe('import')
    document.documentElement.removeAttribute('data-hero-reason')
  })

  it('asks for the chunk after an idle period when a fresh canvas offers WebGL2', async () => {
    webgl2 = true
    render(<AssemblyLayer />)
    expect(dynamicProbe.requests).toBe(0)
    await settle(AFTER_IDLE_MS)
    expect(dynamicProbe.requests).toBe(1)
  })

  it('gives up quietly when the chunk fails to load: nothing extra rendered, no data-gl, no retry', async () => {
    webgl2 = true
    const { container } = render(<AssemblyLayer />)
    await settle(AFTER_IDLE_MS)
    expect(container.firstElementChild).toHaveAttribute('data-assembly', 'idle')
    expect(container.firstElementChild?.childElementCount).toBe(0)
    expect(document.documentElement.hasAttribute('data-gl')).toBe(false)

    // Sticky for the session: a remount does not ask again.
    cleanup()
    render(<AssemblyLayer />)
    await settle(AFTER_IDLE_MS)
    expect(dynamicProbe.requests).toBe(1)
  })

  it('never mounts under prefers-reduced-motion, even with WebGL2', async () => {
    webgl2 = true
    stubMatchMedia(['(prefers-reduced-motion: reduce)'])
    render(<AssemblyLayer />)
    await settle(AFTER_IDLE_MS)
    expect(dynamicProbe.requests).toBe(0)
  })

  it('honours the ?nogl=1 kill switch', async () => {
    webgl2 = true
    window.history.replaceState({}, '', '/?nogl=1')
    render(<AssemblyLayer />)
    await settle(AFTER_IDLE_MS)
    expect(dynamicProbe.requests).toBe(0)
  })

  it('registers exactly two dynamic chunks for the whole module: three, and the flagged hero engine', () => {
    expect(dynamicProbe.loaders).toBe(2)
  })
})
